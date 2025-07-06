/**
 * Dynamic Resource Allocator
 * Creates intelligent memory, compute, and storage allocation based on
 * workload patterns and hardware capabilities
 */

const EventEmitter = require('events');
const os = require('os');

class DynamicResourceAllocator extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            memoryThreshold: 0.8, // 80% memory usage threshold
            cpuThreshold: 0.9, // 90% CPU usage threshold
            storageThreshold: 0.85, // 85% storage usage threshold
            allocationInterval: 5000, // 5 seconds
            adaptationInterval: 30000, // 30 seconds
            enablePredictiveAllocation: true,
            enableLoadBalancing: true,
            enableAutoScaling: true,
            maxMemoryAllocation: 0.9, // Max 90% of system memory
            reservedMemoryMB: 1024, // Reserve 1GB for system
            ...options
        };
        
        this.systemResources = {
            totalMemory: os.totalmem(),
            totalCPUs: os.cpus().length,
            availableMemory: os.freemem(),
            cpuUsage: 0,
            storageUsage: 0
        };
        
        this.allocations = new Map(); // resourceId -> AllocationInfo
        this.workloadPatterns = new Map(); // workloadType -> Pattern
        this.resourcePools = new Map(); // poolType -> Pool
        this.allocationHistory = [];
        this.predictions = new Map(); // resourceType -> Prediction
        
        this.stats = {
            totalAllocations: 0,
            activeAllocations: 0,
            memoryUtilization: 0,
            cpuUtilization: 0,
            storageUtilization: 0,
            allocationEfficiency: 0,
            predictiveHits: 0,
            adaptations: 0
        };
        
        this.isInitialized = false;
        this.initializeAllocator();
    }
    
    async initializeAllocator() {
        try {
            console.log('[Dynamic Allocator] Initializing dynamic resource allocator...');
            
            // Initialize resource pools
            this.initializeResourcePools();
            
            // Start monitoring
            this.startResourceMonitoring();
            
            // Start allocation management
            this.startAllocationManagement();
            
            // Start adaptive optimization
            this.startAdaptiveOptimization();
            
            this.isInitialized = true;
            this.emit('initialized');
            
        } catch (error) {
            console.error('[Dynamic Allocator] Initialization failed:', error);
            this.emit('initialization-failed', error);
        }
    }
    
    /**
     * Initialize resource pools
     */
    initializeResourcePools() {
        // Memory pool
        this.resourcePools.set('memory', {
            type: 'memory',
            total: this.systemResources.totalMemory,
            allocated: 0,
            available: this.systemResources.availableMemory,
            reservations: new Map(),
            allocations: new Map()
        });
        
        // CPU pool
        this.resourcePools.set('cpu', {
            type: 'cpu',
            total: this.systemResources.totalCPUs,
            allocated: 0,
            available: this.systemResources.totalCPUs,
            reservations: new Map(),
            allocations: new Map()
        });
        
        // Storage pool (simplified)
        this.resourcePools.set('storage', {
            type: 'storage',
            total: 1000000000000, // 1TB default
            allocated: 0,
            available: 1000000000000,
            reservations: new Map(),
            allocations: new Map()
        });
    }
    
    /**
     * Allocate resources for a workload
     */
    async allocateResources(workloadId, requirements) {
        try {
            const {
                memoryMB = 0,
                cpuCores = 0,
                storageMB = 0,
                priority = 'medium',
                duration = null,
                workloadType = 'generic'
            } = requirements;
            
            // Check resource availability
            const availability = this.checkResourceAvailability(requirements);
            if (!availability.canAllocate) {
                throw new Error(`Insufficient resources: ${availability.reason}`);
            }
            
            // Apply predictive allocation if enabled
            const optimizedRequirements = this.options.enablePredictiveAllocation ?
                await this.optimizeAllocation(workloadType, requirements) : requirements;
            
            // Perform allocation
            const allocation = await this.performAllocation(workloadId, optimizedRequirements);
            
            // Record allocation
            this.allocations.set(workloadId, {
                ...allocation,
                workloadType,
                priority,
                allocatedAt: Date.now(),
                duration,
                status: 'active'
            });
            
            // Update workload patterns
            this.updateWorkloadPattern(workloadType, optimizedRequirements);
            
            this.stats.totalAllocations++;
            this.stats.activeAllocations++;
            
            this.emit('resources-allocated', { workloadId, allocation });
            
            return allocation;
            
        } catch (error) {
            console.error('[Dynamic Allocator] Resource allocation failed:', error);
            throw error;
        }
    }
    
    /**
     * Check resource availability
     */
    checkResourceAvailability(requirements) {
        const { memoryMB = 0, cpuCores = 0, storageMB = 0 } = requirements;
        
        const memoryPool = this.resourcePools.get('memory');
        const cpuPool = this.resourcePools.get('cpu');
        const storagePool = this.resourcePools.get('storage');
        
        // Check memory
        const memoryBytes = memoryMB * 1024 * 1024;
        const availableMemory = memoryPool.available - this.options.reservedMemoryMB * 1024 * 1024;
        
        if (memoryBytes > availableMemory) {
            return {
                canAllocate: false,
                reason: `Insufficient memory: requested ${memoryMB}MB, available ${Math.floor(availableMemory / 1024 / 1024)}MB`
            };
        }
        
        // Check CPU
        if (cpuCores > cpuPool.available) {
            return {
                canAllocate: false,
                reason: `Insufficient CPU: requested ${cpuCores} cores, available ${cpuPool.available}`
            };
        }
        
        // Check storage
        const storageBytes = storageMB * 1024 * 1024;
        if (storageBytes > storagePool.available) {
            return {
                canAllocate: false,
                reason: `Insufficient storage: requested ${storageMB}MB, available ${Math.floor(storagePool.available / 1024 / 1024)}MB`
            };
        }
        
        return { canAllocate: true };
    }
    
    /**
     * Optimize allocation based on patterns and predictions
     */
    async optimizeAllocation(workloadType, requirements) {
        const pattern = this.workloadPatterns.get(workloadType);
        const prediction = this.predictions.get(workloadType);
        
        if (!pattern && !prediction) {
            return requirements;
        }
        
        const optimized = { ...requirements };
        
        // Apply pattern-based optimization
        if (pattern) {
            // Adjust memory based on historical usage
            if (pattern.averageMemoryUsage < requirements.memoryMB * 0.7) {
                optimized.memoryMB = Math.ceil(pattern.averageMemoryUsage * 1.2);
                console.log(`[Dynamic Allocator] Optimized memory allocation for ${workloadType}: ${requirements.memoryMB}MB -> ${optimized.memoryMB}MB`);
            }
            
            // Adjust CPU based on historical usage
            if (pattern.averageCPUUsage < requirements.cpuCores * 0.7) {
                optimized.cpuCores = Math.max(1, Math.ceil(pattern.averageCPUUsage * 1.2));
                console.log(`[Dynamic Allocator] Optimized CPU allocation for ${workloadType}: ${requirements.cpuCores} -> ${optimized.cpuCores} cores`);
            }
        }
        
        // Apply predictive optimization
        if (prediction && prediction.confidence > 0.7) {
            if (prediction.expectedMemorySpike) {
                optimized.memoryMB = Math.ceil(optimized.memoryMB * 1.5);
                console.log(`[Dynamic Allocator] Predictive memory increase for ${workloadType}: spike expected`);
            }
        }
        
        return optimized;
    }
    
    /**
     * Perform actual resource allocation
     */
    async performAllocation(workloadId, requirements) {
        const { memoryMB, cpuCores, storageMB } = requirements;
        
        const allocation = {
            workloadId,
            resources: {},
            allocatedAt: Date.now()
        };
        
        // Allocate memory
        if (memoryMB > 0) {
            const memoryBytes = memoryMB * 1024 * 1024;
            const memoryPool = this.resourcePools.get('memory');
            
            memoryPool.allocated += memoryBytes;
            memoryPool.available -= memoryBytes;
            memoryPool.allocations.set(workloadId, memoryBytes);
            
            allocation.resources.memory = {
                allocated: memoryMB,
                unit: 'MB'
            };
        }
        
        // Allocate CPU
        if (cpuCores > 0) {
            const cpuPool = this.resourcePools.get('cpu');
            
            cpuPool.allocated += cpuCores;
            cpuPool.available -= cpuCores;
            cpuPool.allocations.set(workloadId, cpuCores);
            
            allocation.resources.cpu = {
                allocated: cpuCores,
                unit: 'cores'
            };
        }
        
        // Allocate storage
        if (storageMB > 0) {
            const storageBytes = storageMB * 1024 * 1024;
            const storagePool = this.resourcePools.get('storage');
            
            storagePool.allocated += storageBytes;
            storagePool.available -= storageBytes;
            storagePool.allocations.set(workloadId, storageBytes);
            
            allocation.resources.storage = {
                allocated: storageMB,
                unit: 'MB'
            };
        }
        
        return allocation;
    }
    
    /**
     * Deallocate resources
     */
    async deallocateResources(workloadId) {
        try {
            const allocation = this.allocations.get(workloadId);
            if (!allocation) {
                console.warn(`[Dynamic Allocator] No allocation found for workload: ${workloadId}`);
                return;
            }
            
            // Release memory
            if (allocation.resources.memory) {
                const memoryPool = this.resourcePools.get('memory');
                const memoryBytes = memoryPool.allocations.get(workloadId) || 0;
                
                memoryPool.allocated -= memoryBytes;
                memoryPool.available += memoryBytes;
                memoryPool.allocations.delete(workloadId);
            }
            
            // Release CPU
            if (allocation.resources.cpu) {
                const cpuPool = this.resourcePools.get('cpu');
                const cpuCores = cpuPool.allocations.get(workloadId) || 0;
                
                cpuPool.allocated -= cpuCores;
                cpuPool.available += cpuCores;
                cpuPool.allocations.delete(workloadId);
            }
            
            // Release storage
            if (allocation.resources.storage) {
                const storagePool = this.resourcePools.get('storage');
                const storageBytes = storagePool.allocations.get(workloadId) || 0;
                
                storagePool.allocated -= storageBytes;
                storagePool.available += storageBytes;
                storagePool.allocations.delete(workloadId);
            }
            
            // Update allocation status
            allocation.status = 'deallocated';
            allocation.deallocatedAt = Date.now();
            
            this.stats.activeAllocations--;
            
            this.emit('resources-deallocated', { workloadId, allocation });
            
            // Record in history and remove from active
            this.allocationHistory.push(allocation);
            this.allocations.delete(workloadId);
            
            // Keep limited history
            if (this.allocationHistory.length > 1000) {
                this.allocationHistory = this.allocationHistory.slice(-1000);
            }
            
        } catch (error) {
            console.error('[Dynamic Allocator] Resource deallocation failed:', error);
        }
    }
    
    /**
     * Update workload pattern
     */
    updateWorkloadPattern(workloadType, requirements) {
        if (!this.workloadPatterns.has(workloadType)) {
            this.workloadPatterns.set(workloadType, {
                workloadType,
                samples: 0,
                totalMemoryRequested: 0,
                totalCPURequested: 0,
                totalStorageRequested: 0,
                averageMemoryUsage: 0,
                averageCPUUsage: 0,
                averageStorageUsage: 0,
                lastUpdated: Date.now()
            });
        }
        
        const pattern = this.workloadPatterns.get(workloadType);
        pattern.samples++;
        pattern.totalMemoryRequested += requirements.memoryMB || 0;
        pattern.totalCPURequested += requirements.cpuCores || 0;
        pattern.totalStorageRequested += requirements.storageMB || 0;
        
        // Calculate running averages
        pattern.averageMemoryUsage = pattern.totalMemoryRequested / pattern.samples;
        pattern.averageCPUUsage = pattern.totalCPURequested / pattern.samples;
        pattern.averageStorageUsage = pattern.totalStorageRequested / pattern.samples;
        pattern.lastUpdated = Date.now();
    }
    
    /**
     * Start resource monitoring
     */
    startResourceMonitoring() {
        setInterval(() => {
            this.updateSystemResources();
            this.updateUtilizationStats();
            this.checkResourcePressure();
        }, this.options.allocationInterval);
    }
    
    /**
     * Update system resource information
     */
    updateSystemResources() {
        this.systemResources.availableMemory = os.freemem();
        this.systemResources.cpuUsage = this.calculateCPUUsage();
        
        // Update memory pool
        const memoryPool = this.resourcePools.get('memory');
        memoryPool.available = this.systemResources.availableMemory;
    }
    
    /**
     * Calculate CPU usage (simplified)
     */
    calculateCPUUsage() {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;
        
        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });
        
        return 1 - (totalIdle / totalTick);
    }
    
    /**
     * Update utilization statistics
     */
    updateUtilizationStats() {
        const memoryPool = this.resourcePools.get('memory');
        const cpuPool = this.resourcePools.get('cpu');
        const storagePool = this.resourcePools.get('storage');
        
        this.stats.memoryUtilization = (memoryPool.allocated / memoryPool.total) * 100;
        this.stats.cpuUtilization = (cpuPool.allocated / cpuPool.total) * 100;
        this.stats.storageUtilization = (storagePool.allocated / storagePool.total) * 100;
        
        // Calculate allocation efficiency
        const totalAllocated = this.stats.activeAllocations;
        const totalCapacity = this.allocations.size + 100; // Estimated capacity
        this.stats.allocationEfficiency = totalAllocated > 0 ? 
            (totalAllocated / totalCapacity) * 100 : 0;
    }
    
    /**
     * Check for resource pressure and trigger adaptations
     */
    checkResourcePressure() {
        const memoryPressure = this.stats.memoryUtilization > (this.options.memoryThreshold * 100);
        const cpuPressure = this.stats.cpuUtilization > (this.options.cpuThreshold * 100);
        const storagePressure = this.stats.storageUtilization > (this.options.storageThreshold * 100);
        
        if (memoryPressure || cpuPressure || storagePressure) {
            this.handleResourcePressure({
                memory: memoryPressure,
                cpu: cpuPressure,
                storage: storagePressure
            });
        }
    }
    
    /**
     * Handle resource pressure
     */
    handleResourcePressure(pressure) {
        console.warn('[Dynamic Allocator] Resource pressure detected:', pressure);
        
        // Implement pressure relief strategies
        if (pressure.memory) {
            this.optimizeMemoryAllocations();
        }
        
        if (pressure.cpu) {
            this.optimizeCPUAllocations();
        }
        
        if (pressure.storage) {
            this.optimizeStorageAllocations();
        }
        
        this.emit('resource-pressure', pressure);
    }
    
    /**
     * Optimize memory allocations
     */
    optimizeMemoryAllocations() {
        // Find low-priority allocations that can be reduced
        const candidates = Array.from(this.allocations.values())
            .filter(allocation => allocation.priority === 'low')
            .sort((a, b) => a.allocatedAt - b.allocatedAt); // Oldest first
        
        console.log(`[Dynamic Allocator] Optimizing memory for ${candidates.length} low-priority allocations`);
    }
    
    /**
     * Optimize CPU allocations
     */
    optimizeCPUAllocations() {
        console.log('[Dynamic Allocator] Optimizing CPU allocations');
        // Implement CPU optimization logic
    }
    
    /**
     * Optimize storage allocations
     */
    optimizeStorageAllocations() {
        console.log('[Dynamic Allocator] Optimizing storage allocations');
        // Implement storage optimization logic
    }
    
    /**
     * Start adaptive optimization
     */
    startAdaptiveOptimization() {
        setInterval(() => {
            this.performAdaptiveOptimization();
        }, this.options.adaptationInterval);
    }
    
    /**
     * Perform adaptive optimization
     */
    performAdaptiveOptimization() {
        // Analyze patterns and adjust thresholds
        this.analyzeWorkloadPatterns();
        
        // Generate predictions
        if (this.options.enablePredictiveAllocation) {
            this.generatePredictions();
        }
        
        this.stats.adaptations++;
    }
    
    /**
     * Analyze workload patterns
     */
    analyzeWorkloadPatterns() {
        for (const [workloadType, pattern] of this.workloadPatterns) {
            // Detect trends and anomalies
            if (pattern.samples > 10) {
                // Pattern is stable enough for analysis
                console.log(`[Dynamic Allocator] Pattern analysis for ${workloadType}: avg memory ${pattern.averageMemoryUsage.toFixed(2)}MB`);
            }
        }
    }
    
    /**
     * Generate predictions
     */
    generatePredictions() {
        for (const [workloadType, pattern] of this.workloadPatterns) {
            if (pattern.samples > 5) {
                const prediction = {
                    workloadType,
                    expectedMemorySpike: pattern.averageMemoryUsage > 1000, // Simple heuristic
                    confidence: Math.min(pattern.samples / 20, 1), // Confidence based on sample size
                    generatedAt: Date.now()
                };
                
                this.predictions.set(workloadType, prediction);
                this.stats.predictiveHits++;
            }
        }
    }
    
    /**
     * Get allocation statistics
     */
    getStats() {
        return {
            ...this.stats,
            resourcePools: Object.fromEntries(
                Array.from(this.resourcePools.entries()).map(([type, pool]) => [
                    type,
                    {
                        total: pool.total,
                        allocated: pool.allocated,
                        available: pool.available,
                        utilization: (pool.allocated / pool.total) * 100
                    }
                ])
            ),
            workloadPatterns: Array.from(this.workloadPatterns.values()),
            activeAllocations: Array.from(this.allocations.values())
        };
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        // Deallocate all active resources
        for (const workloadId of this.allocations.keys()) {
            this.deallocateResources(workloadId);
        }
        
        this.allocations.clear();
        this.workloadPatterns.clear();
        this.resourcePools.clear();
        this.allocationHistory = [];
        this.predictions.clear();
        this.removeAllListeners();
    }
}

module.exports = DynamicResourceAllocator;
