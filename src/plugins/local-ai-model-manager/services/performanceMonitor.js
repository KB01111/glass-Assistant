const os = require('os');
const EventEmitter = require('events');

/**
 * Enhanced Performance Monitor Service
 *
 * Monitors and tracks performance metrics for local AI models with hardware-specific optimizations:
 * - Inference time tracking with device-specific metrics
 * - Memory usage monitoring with shared memory pool integration
 * - Hardware utilization metrics (NPU, GPU, CPU)
 * - Performance comparisons and optimization recommendations
 * - Real-time alerting and adaptive configuration
 */
class PerformanceMonitor extends EventEmitter {
    constructor(options = {}) {
        super();

        this.enabled = options.enabled !== false;
        this.logger = options.logger || console;
        this.metrics = new Map();
        this.activeInferences = new Map();
        this.systemMetrics = {
            cpu: [],
            memory: [],
            gpu: [],
            npu: [],
            sharedMemory: [],
            network: []
        };
        this.monitoringInterval = null;

        // Enhanced monitoring options
        this.options = {
            monitoringIntervalMs: 5000,
            metricsRetentionMs: 3600000, // 1 hour
            enableHardwareSpecificMetrics: true,
            enableMemoryPoolMonitoring: true,
            enableNetworkMonitoring: false,
            alertThresholds: {
                cpuUsage: 90,
                memoryUsage: 85,
                inferenceLatency: 5000,
                errorRate: 0.05
            },
            ...options
        };

        // Hardware-specific trackers
        this.hardwareTrackers = new Map();
        this.performanceBaselines = new Map();
        this.optimizationRecommendations = [];
        this.alertHistory = [];

        // Integration points
        this.hardwareManager = options.hardwareManager;
        this.memoryPool = options.memoryPool;
        this.fallbackManager = options.fallbackManager;
    }

    /**
     * Initialize the performance monitor
     */
    async initialize() {
        if (!this.enabled) {
            this.logger.info('Performance monitoring disabled');
            return;
        }

        try {
            // Initialize system monitoring
            await this.initializeSystemMonitoring();
            
            this.logger.info('Performance monitor initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize performance monitor:', error);
            throw error;
        }
    }

    /**
     * Start performance monitoring
     */
    async start() {
        if (!this.enabled) return;

        // Start system metrics collection
        this.monitoringInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, 5000); // Collect every 5 seconds

        this.logger.info('Performance monitoring started');
    }

    /**
     * Stop performance monitoring
     */
    async stop() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.logger.info('Performance monitoring stopped');
    }

    /**
     * Record inference performance metrics
     * @param {Object} inferenceData - Inference performance data
     */
    async recordInference(inferenceData) {
        if (!this.enabled) return;

        const {
            modelId,
            inferenceTime,
            inputTokens = 0,
            outputTokens = 0,
            device = 'cpu',
            memoryUsage = 0,
            batchSize = 1
        } = inferenceData;

        const timestamp = Date.now();
        const tokensPerSecond = outputTokens > 0 ? outputTokens / (inferenceTime / 1000) : 0;

        const metric = {
            modelId,
            timestamp,
            inferenceTime,
            inputTokens,
            outputTokens,
            tokensPerSecond,
            device,
            memoryUsage,
            batchSize,
            efficiency: this.calculateEfficiency(inferenceTime, outputTokens, memoryUsage)
        };

        // Store metric
        if (!this.metrics.has(modelId)) {
            this.metrics.set(modelId, []);
        }
        
        const modelMetrics = this.metrics.get(modelId);
        modelMetrics.push(metric);

        // Keep only last 1000 metrics per model
        if (modelMetrics.length > 1000) {
            modelMetrics.splice(0, modelMetrics.length - 1000);
        }

        this.logger.debug(`Recorded inference metric for ${modelId}: ${inferenceTime}ms, ${tokensPerSecond.toFixed(2)} tokens/s`);
    }

    /**
     * Start tracking an inference session
     * @param {string} sessionId - Unique session identifier
     * @param {Object} sessionData - Session metadata
     */
    startInferenceTracking(sessionId, sessionData) {
        if (!this.enabled) return;

        this.activeInferences.set(sessionId, {
            ...sessionData,
            startTime: Date.now(),
            startMemory: process.memoryUsage(),
            startCPU: process.cpuUsage()
        });
    }

    /**
     * End tracking an inference session
     * @param {string} sessionId - Session identifier
     * @param {Object} resultData - Inference results
     */
    endInferenceTracking(sessionId, resultData = {}) {
        if (!this.enabled) return;

        const session = this.activeInferences.get(sessionId);
        if (!session) return;

        const endTime = Date.now();
        const endMemory = process.memoryUsage();
        const endCPU = process.cpuUsage(session.startCPU);

        const inferenceTime = endTime - session.startTime;
        const memoryDelta = endMemory.heapUsed - session.startMemory.heapUsed;
        const cpuUsage = (endCPU.user + endCPU.system) / 1000; // Convert to milliseconds

        // Record the complete inference metrics
        this.recordInference({
            modelId: session.modelId,
            inferenceTime,
            inputTokens: resultData.inputTokens || 0,
            outputTokens: resultData.outputTokens || 0,
            device: session.device || 'cpu',
            memoryUsage: memoryDelta,
            cpuUsage
        });

        this.activeInferences.delete(sessionId);
    }

    /**
     * Get performance metrics for a model
     * @param {string} modelId - Model identifier
     * @param {Object} options - Query options
     * @returns {Object} Performance metrics
     */
    getMetrics(modelId, options = {}) {
        const {
            timeRange = 24 * 60 * 60 * 1000, // Last 24 hours
            aggregation = 'summary'
        } = options;

        const modelMetrics = this.metrics.get(modelId) || [];
        const cutoffTime = Date.now() - timeRange;
        
        const recentMetrics = modelMetrics.filter(m => m.timestamp >= cutoffTime);

        if (recentMetrics.length === 0) {
            return {
                modelId,
                totalInferences: 0,
                averageInferenceTime: 0,
                averageTokensPerSecond: 0,
                averageMemoryUsage: 0,
                deviceDistribution: {},
                recommendations: []
            };
        }

        const summary = this.calculateSummaryMetrics(recentMetrics);
        const deviceStats = this.calculateDeviceStats(recentMetrics);
        const recommendations = this.generateRecommendations(summary, deviceStats);

        return {
            modelId,
            timeRange,
            totalInferences: recentMetrics.length,
            ...summary,
            deviceDistribution: deviceStats,
            recommendations,
            rawMetrics: aggregation === 'detailed' ? recentMetrics : undefined
        };
    }

    /**
     * Compare performance between models
     * @param {Array} modelIds - Models to compare
     * @returns {Object} Comparison results
     */
    compareModels(modelIds) {
        const comparisons = {};

        for (const modelId of modelIds) {
            comparisons[modelId] = this.getMetrics(modelId);
        }

        // Find best performing model for different criteria
        const bestInferenceTime = this.findBestModel(comparisons, 'averageInferenceTime', 'min');
        const bestTokensPerSecond = this.findBestModel(comparisons, 'averageTokensPerSecond', 'max');
        const bestMemoryEfficiency = this.findBestModel(comparisons, 'averageMemoryUsage', 'min');

        return {
            models: comparisons,
            rankings: {
                fastestInference: bestInferenceTime,
                highestThroughput: bestTokensPerSecond,
                mostMemoryEfficient: bestMemoryEfficiency
            }
        };
    }

    /**
     * Get system performance metrics
     * @returns {Object} System metrics
     */
    getSystemMetrics() {
        const recent = this.systemMetrics.cpu.slice(-12); // Last minute (5s intervals)
        
        return {
            cpu: {
                current: recent.length > 0 ? recent[recent.length - 1] : 0,
                average: recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0,
                history: recent
            },
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem(),
                percentage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
            },
            loadAverage: os.loadavg(),
            uptime: os.uptime()
        };
    }

    // Helper methods
    async initializeSystemMonitoring() {
        // Initialize system monitoring capabilities
        // This could include GPU/NPU monitoring setup
        return true;
    }

    collectSystemMetrics() {
        // Collect CPU usage
        const cpuUsage = this.getCPUUsage();
        this.systemMetrics.cpu.push(cpuUsage);
        
        // Keep only last 100 measurements (about 8 minutes)
        if (this.systemMetrics.cpu.length > 100) {
            this.systemMetrics.cpu.shift();
        }

        // Collect memory usage
        const memoryUsage = (os.totalmem() - os.freemem()) / os.totalmem() * 100;
        this.systemMetrics.memory.push(memoryUsage);
        
        if (this.systemMetrics.memory.length > 100) {
            this.systemMetrics.memory.shift();
        }
    }

    getCPUUsage() {
        // Simplified CPU usage calculation
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        for (const cpu of cpus) {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        }

        return 100 - (totalIdle / totalTick * 100);
    }

    calculateEfficiency(inferenceTime, outputTokens, memoryUsage) {
        // Simple efficiency score: tokens per second per MB of memory
        const tokensPerSecond = outputTokens / (inferenceTime / 1000);
        const memoryMB = memoryUsage / (1024 * 1024);
        
        return memoryMB > 0 ? tokensPerSecond / memoryMB : tokensPerSecond;
    }

    calculateSummaryMetrics(metrics) {
        const total = metrics.length;
        
        return {
            averageInferenceTime: metrics.reduce((sum, m) => sum + m.inferenceTime, 0) / total,
            averageTokensPerSecond: metrics.reduce((sum, m) => sum + m.tokensPerSecond, 0) / total,
            averageMemoryUsage: metrics.reduce((sum, m) => sum + m.memoryUsage, 0) / total,
            averageEfficiency: metrics.reduce((sum, m) => sum + m.efficiency, 0) / total,
            minInferenceTime: Math.min(...metrics.map(m => m.inferenceTime)),
            maxInferenceTime: Math.max(...metrics.map(m => m.inferenceTime)),
            totalTokensGenerated: metrics.reduce((sum, m) => sum + m.outputTokens, 0)
        };
    }

    calculateDeviceStats(metrics) {
        const deviceCounts = {};
        const devicePerformance = {};

        for (const metric of metrics) {
            const device = metric.device;
            
            if (!deviceCounts[device]) {
                deviceCounts[device] = 0;
                devicePerformance[device] = {
                    totalTime: 0,
                    totalTokens: 0,
                    count: 0
                };
            }
            
            deviceCounts[device]++;
            devicePerformance[device].totalTime += metric.inferenceTime;
            devicePerformance[device].totalTokens += metric.outputTokens;
            devicePerformance[device].count++;
        }

        // Calculate averages
        for (const device in devicePerformance) {
            const perf = devicePerformance[device];
            perf.averageTime = perf.totalTime / perf.count;
            perf.averageTokensPerSecond = perf.totalTokens / (perf.totalTime / 1000);
        }

        return {
            counts: deviceCounts,
            performance: devicePerformance
        };
    }

    generateRecommendations(summary, deviceStats) {
        const recommendations = [];

        // Performance recommendations
        if (summary.averageInferenceTime > 5000) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                message: 'Consider using a faster device (NPU/GPU) or optimizing the model',
                action: 'optimize_device'
            });
        }

        if (summary.averageMemoryUsage > 1024 * 1024 * 1024) { // > 1GB
            recommendations.push({
                type: 'memory',
                priority: 'medium',
                message: 'High memory usage detected. Consider model quantization',
                action: 'optimize_memory'
            });
        }

        // Device recommendations
        const devices = Object.keys(deviceStats.performance);
        if (devices.length > 1) {
            const bestDevice = devices.reduce((best, current) => {
                const bestPerf = deviceStats.performance[best];
                const currentPerf = deviceStats.performance[current];
                return currentPerf.averageTokensPerSecond > bestPerf.averageTokensPerSecond ? current : best;
            });

            if (bestDevice !== 'cpu') {
                recommendations.push({
                    type: 'device',
                    priority: 'medium',
                    message: `${bestDevice.toUpperCase()} shows better performance than other devices`,
                    action: 'prefer_device',
                    device: bestDevice
                });
            }
        }

        return recommendations;
    }

    findBestModel(comparisons, metric, direction) {
        let bestModel = null;
        let bestValue = direction === 'min' ? Infinity : -Infinity;

        for (const [modelId, metrics] of Object.entries(comparisons)) {
            const value = metrics[metric];
            if ((direction === 'min' && value < bestValue) ||
                (direction === 'max' && value > bestValue)) {
                bestValue = value;
                bestModel = modelId;
            }
        }

        return { modelId: bestModel, value: bestValue };
    }

    // ==================== ENHANCED MONITORING METHODS ====================

    /**
     * Monitor hardware-specific metrics
     */
    async monitorHardwareMetrics() {
        try {
            const metrics = {
                timestamp: Date.now(),
                cpu: await this.getCPUMetrics(),
                memory: await this.getMemoryMetrics(),
                gpu: await this.getGPUMetrics(),
                npu: await this.getNPUMetrics(),
                sharedMemory: await this.getSharedMemoryMetrics(),
                network: this.options.enableNetworkMonitoring ? await this.getNetworkMetrics() : null
            };

            // Store metrics
            this.storeSystemMetrics(metrics);

            // Check for alerts
            this.checkAlertThresholds(metrics);

            // Update hardware trackers
            this.updateHardwareTrackers(metrics);

            this.emit('metrics-collected', metrics);

            return metrics;

        } catch (error) {
            this.logger.error('Hardware metrics collection failed:', error);
            return null;
        }
    }

    async getCPUMetrics() {
        const cpus = os.cpus();
        const loadAvg = os.loadavg();

        return {
            usage: process.cpuUsage(),
            loadAverage: loadAvg,
            coreCount: cpus.length,
            frequency: cpus[0]?.speed || 0,
            temperature: await this.getCPUTemperature()
        };
    }

    async getMemoryMetrics() {
        const memInfo = process.memoryUsage();
        const systemMem = {
            total: os.totalmem(),
            free: os.freemem()
        };

        return {
            process: memInfo,
            system: systemMem,
            usage: (systemMem.total - systemMem.free) / systemMem.total,
            pressure: this.calculateMemoryPressure(memInfo, systemMem)
        };
    }

    async getGPUMetrics() {
        try {
            if (this.hardwareManager) {
                const gpuInfo = await this.hardwareManager.getGPUInfo();
                return {
                    available: !!gpuInfo,
                    utilization: gpuInfo?.utilization || 0,
                    memoryUsed: gpuInfo?.memoryUsed || 0,
                    memoryTotal: gpuInfo?.memoryTotal || 0,
                    temperature: gpuInfo?.temperature || 0
                };
            }
            return { available: false };
        } catch (error) {
            return { available: false, error: error.message };
        }
    }

    async getNPUMetrics() {
        try {
            if (this.hardwareManager) {
                const npuInfo = await this.hardwareManager.getNPUInfo();
                return {
                    available: !!npuInfo?.detected,
                    utilization: npuInfo?.utilization || 0,
                    powerConsumption: npuInfo?.powerConsumption || 0,
                    temperature: npuInfo?.temperature || 0,
                    throughput: npuInfo?.throughput || 0
                };
            }
            return { available: false };
        } catch (error) {
            return { available: false, error: error.message };
        }
    }

    async getSharedMemoryMetrics() {
        try {
            if (this.memoryPool) {
                const stats = this.memoryPool.getStats();
                return {
                    totalSize: stats.totalSize,
                    usedBytes: stats.usedBytes,
                    freeBytes: stats.freeBytes,
                    utilizationRatio: stats.utilizationRatio,
                    fragmentationRatio: stats.fragmentationRatio,
                    allocatedBlocks: stats.allocatedBlockCount,
                    freeBlocks: stats.freeBlockCount
                };
            }
            return { available: false };
        } catch (error) {
            return { available: false, error: error.message };
        }
    }

    async getNetworkMetrics() {
        const networkInterfaces = os.networkInterfaces();
        const metrics = {
            interfaces: {},
            totalBytesReceived: 0,
            totalBytesSent: 0
        };

        for (const [name, interfaces] of Object.entries(networkInterfaces)) {
            for (const iface of interfaces) {
                if (!iface.internal) {
                    metrics.interfaces[name] = {
                        address: iface.address,
                        family: iface.family,
                        mac: iface.mac
                    };
                }
            }
        }

        return metrics;
    }

    async getCPUTemperature() {
        try {
            // This would require platform-specific implementation
            // For now, return null
            return null;
        } catch (error) {
            return null;
        }
    }

    calculateMemoryPressure(processMemory, systemMemory) {
        const processUsage = processMemory.heapUsed / processMemory.heapTotal;
        const systemUsage = (systemMemory.total - systemMemory.free) / systemMemory.total;

        return Math.max(processUsage, systemUsage);
    }

    /**
     * Cleanup service resources
     */
    async cleanup() {
        await this.stop();
        this.metrics.clear();
        this.activeInferences.clear();
        this.systemMetrics = { cpu: [], memory: [], gpu: [], npu: [] };
        
        this.logger.info('Performance monitor cleaned up');
    }
}

module.exports = PerformanceMonitor;
