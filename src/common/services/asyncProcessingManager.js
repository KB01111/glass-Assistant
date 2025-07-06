/**
 * Asynchronous Processing Manager
 * Implements async processing queues, worker pools, and event-driven architecture
 * for handling large document batches without blocking the main application thread
 */

const EventEmitter = require('events');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

class AsyncProcessingManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            maxWorkers: require('os').cpus().length,
            maxQueueSize: 1000,
            workerTimeout: 300000, // 5 minutes
            enablePriority: true,
            enableBatching: true,
            batchSize: 10,
            batchTimeout: 5000, // 5 seconds
            ...options
        };
        
        this.workers = [];
        this.availableWorkers = [];
        this.busyWorkers = new Set();
        this.taskQueue = [];
        this.priorityQueue = [];
        this.batchQueue = [];
        this.activeTasks = new Map(); // taskId -> TaskInfo
        this.workerStats = new Map(); // workerId -> Stats
        this.isInitialized = false;
        
        this.initializeManager();
    }
    
    async initializeManager() {
        try {
            console.log('[Async Processing] Initializing async processing manager...');
            
            // Create worker pool
            await this.createWorkerPool();
            
            // Start queue processing
            this.startQueueProcessing();
            
            // Start batch processing
            if (this.options.enableBatching) {
                this.startBatchProcessing();
            }
            
            this.isInitialized = true;
            this.emit('initialized');
            
        } catch (error) {
            console.error('[Async Processing] Initialization failed:', error);
            this.emit('initialization-failed', error);
        }
    }
    
    /**
     * Create worker pool
     */
    async createWorkerPool() {
        const workerScript = path.join(__dirname, 'asyncWorker.js');
        
        for (let i = 0; i < this.options.maxWorkers; i++) {
            try {
                const worker = new Worker(workerScript, {
                    workerData: { workerId: i }
                });
                
                worker.workerId = i;
                worker.isAvailable = true;
                worker.currentTask = null;
                
                // Setup worker event handlers
                this.setupWorkerHandlers(worker);
                
                this.workers.push(worker);
                this.availableWorkers.push(worker);
                
                this.workerStats.set(i, {
                    tasksCompleted: 0,
                    tasksErrored: 0,
                    totalProcessingTime: 0,
                    averageProcessingTime: 0
                });
                
            } catch (error) {
                console.error(`[Async Processing] Failed to create worker ${i}:`, error);
            }
        }
        
        console.log(`[Async Processing] Created ${this.workers.length} workers`);
    }
    
    /**
     * Setup worker event handlers
     */
    setupWorkerHandlers(worker) {
        worker.on('message', (message) => {
            this.handleWorkerMessage(worker, message);
        });
        
        worker.on('error', (error) => {
            console.error(`[Async Processing] Worker ${worker.workerId} error:`, error);
            this.handleWorkerError(worker, error);
        });
        
        worker.on('exit', (code) => {
            console.log(`[Async Processing] Worker ${worker.workerId} exited with code ${code}`);
            this.handleWorkerExit(worker, code);
        });
    }
    
    /**
     * Handle worker messages
     */
    handleWorkerMessage(worker, message) {
        const { type, taskId, result, error, progress } = message;
        
        switch (type) {
            case 'task-complete':
                this.handleTaskComplete(worker, taskId, result);
                break;
            case 'task-error':
                this.handleTaskError(worker, taskId, error);
                break;
            case 'task-progress':
                this.handleTaskProgress(taskId, progress);
                break;
            default:
                console.warn(`[Async Processing] Unknown message type: ${type}`);
        }
    }
    
    /**
     * Submit task for processing
     */
    async submitTask(taskType, taskData, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Async Processing Manager not initialized');
            }
            
            if (this.taskQueue.length >= this.options.maxQueueSize) {
                throw new Error('Task queue is full');
            }
            
            const taskId = this.generateTaskId();
            const task = {
                id: taskId,
                type: taskType,
                data: taskData,
                priority: options.priority || 0,
                timeout: options.timeout || this.options.workerTimeout,
                createdAt: Date.now(),
                ...options
            };
            
            this.activeTasks.set(taskId, {
                ...task,
                status: 'queued',
                worker: null
            });
            
            // Add to appropriate queue
            if (this.options.enablePriority && task.priority > 0) {
                this.priorityQueue.push(task);
                this.priorityQueue.sort((a, b) => b.priority - a.priority);
            } else {
                this.taskQueue.push(task);
            }
            
            this.emit('task-queued', { taskId, taskType });
            
            // Try to process immediately
            this.processNextTask();
            
            return taskId;
            
        } catch (error) {
            console.error('[Async Processing] Task submission failed:', error);
            throw error;
        }
    }
    
    /**
     * Submit batch of tasks
     */
    async submitBatch(tasks, options = {}) {
        try {
            const batchId = this.generateBatchId();
            const batchTasks = tasks.map(task => ({
                ...task,
                batchId,
                id: this.generateTaskId()
            }));
            
            if (this.options.enableBatching) {
                this.batchQueue.push({
                    id: batchId,
                    tasks: batchTasks,
                    options,
                    createdAt: Date.now()
                });
            } else {
                // Submit tasks individually
                for (const task of batchTasks) {
                    await this.submitTask(task.type, task.data, task);
                }
            }
            
            this.emit('batch-queued', { batchId, taskCount: tasks.length });
            
            return batchId;
            
        } catch (error) {
            console.error('[Async Processing] Batch submission failed:', error);
            throw error;
        }
    }
    
    /**
     * Start queue processing
     */
    startQueueProcessing() {
        setInterval(() => {
            this.processNextTask();
        }, 100); // Check every 100ms
    }
    
    /**
     * Start batch processing
     */
    startBatchProcessing() {
        setInterval(() => {
            this.processBatches();
        }, this.options.batchTimeout);
    }
    
    /**
     * Process next task in queue
     */
    async processNextTask() {
        if (this.availableWorkers.length === 0) {
            return; // No available workers
        }
        
        // Get next task (priority first)
        let task = null;
        if (this.priorityQueue.length > 0) {
            task = this.priorityQueue.shift();
        } else if (this.taskQueue.length > 0) {
            task = this.taskQueue.shift();
        }
        
        if (!task) {
            return; // No tasks to process
        }
        
        const worker = this.availableWorkers.pop();
        this.busyWorkers.add(worker);
        
        // Update task info
        const taskInfo = this.activeTasks.get(task.id);
        if (taskInfo) {
            taskInfo.status = 'processing';
            taskInfo.worker = worker;
            taskInfo.startedAt = Date.now();
        }
        
        // Send task to worker
        worker.currentTask = task;
        worker.isAvailable = false;
        
        worker.postMessage({
            type: 'process-task',
            task
        });
        
        this.emit('task-started', { taskId: task.id, workerId: worker.workerId });
    }
    
    /**
     * Process batches
     */
    processBatches() {
        if (this.batchQueue.length === 0) {
            return;
        }
        
        const now = Date.now();
        
        for (let i = this.batchQueue.length - 1; i >= 0; i--) {
            const batch = this.batchQueue[i];
            const age = now - batch.createdAt;
            
            // Process batch if timeout reached or batch is full
            if (age >= this.options.batchTimeout || batch.tasks.length >= this.options.batchSize) {
                this.batchQueue.splice(i, 1);
                this.processBatch(batch);
            }
        }
    }
    
    /**
     * Process individual batch
     */
    async processBatch(batch) {
        try {
            console.log(`[Async Processing] Processing batch ${batch.id} with ${batch.tasks.length} tasks`);
            
            // Submit all tasks in batch
            for (const task of batch.tasks) {
                await this.submitTask(task.type, task.data, task);
            }
            
            this.emit('batch-processed', { batchId: batch.id, taskCount: batch.tasks.length });
            
        } catch (error) {
            console.error('[Async Processing] Batch processing failed:', error);
            this.emit('batch-error', { batchId: batch.id, error: error.message });
        }
    }
    
    /**
     * Handle task completion
     */
    handleTaskComplete(worker, taskId, result) {
        const taskInfo = this.activeTasks.get(taskId);
        if (taskInfo) {
            taskInfo.status = 'completed';
            taskInfo.completedAt = Date.now();
            taskInfo.result = result;
            
            const processingTime = taskInfo.completedAt - taskInfo.startedAt;
            this.updateWorkerStats(worker.workerId, 'completed', processingTime);
        }
        
        this.releaseWorker(worker);
        this.emit('task-completed', { taskId, result, workerId: worker.workerId });
    }
    
    /**
     * Handle task error
     */
    handleTaskError(worker, taskId, error) {
        const taskInfo = this.activeTasks.get(taskId);
        if (taskInfo) {
            taskInfo.status = 'error';
            taskInfo.error = error;
            taskInfo.completedAt = Date.now();
        }
        
        this.updateWorkerStats(worker.workerId, 'error');
        this.releaseWorker(worker);
        this.emit('task-error', { taskId, error, workerId: worker.workerId });
    }
    
    /**
     * Handle task progress
     */
    handleTaskProgress(taskId, progress) {
        const taskInfo = this.activeTasks.get(taskId);
        if (taskInfo) {
            taskInfo.progress = progress;
        }
        
        this.emit('task-progress', { taskId, progress });
    }
    
    /**
     * Release worker back to available pool
     */
    releaseWorker(worker) {
        worker.isAvailable = true;
        worker.currentTask = null;
        this.busyWorkers.delete(worker);
        this.availableWorkers.push(worker);
    }
    
    /**
     * Update worker statistics
     */
    updateWorkerStats(workerId, type, processingTime = 0) {
        const stats = this.workerStats.get(workerId);
        if (stats) {
            if (type === 'completed') {
                stats.tasksCompleted++;
                stats.totalProcessingTime += processingTime;
                stats.averageProcessingTime = stats.totalProcessingTime / stats.tasksCompleted;
            } else if (type === 'error') {
                stats.tasksErrored++;
            }
        }
    }
    
    /**
     * Generate unique task ID
     */
    generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Generate unique batch ID
     */
    generateBatchId() {
        return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Get processing statistics
     */
    getStats() {
        return {
            workers: {
                total: this.workers.length,
                available: this.availableWorkers.length,
                busy: this.busyWorkers.size
            },
            queues: {
                taskQueue: this.taskQueue.length,
                priorityQueue: this.priorityQueue.length,
                batchQueue: this.batchQueue.length
            },
            tasks: {
                active: this.activeTasks.size,
                queued: this.taskQueue.length + this.priorityQueue.length
            },
            workerStats: Object.fromEntries(this.workerStats)
        };
    }
    
    /**
     * Dispose all resources
     */
    async dispose() {
        try {
            console.log('[Async Processing] Disposing async processing manager...');
            
            // Terminate all workers
            for (const worker of this.workers) {
                await worker.terminate();
            }
            
            this.workers = [];
            this.availableWorkers = [];
            this.busyWorkers.clear();
            this.taskQueue = [];
            this.priorityQueue = [];
            this.batchQueue = [];
            this.activeTasks.clear();
            this.workerStats.clear();
            
        } catch (error) {
            console.error('[Async Processing] Disposal failed:', error);
        }
    }
}

module.exports = AsyncProcessingManager;
