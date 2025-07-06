/**
 * Hardware-Adaptive Configuration System
 * Automatically detects hardware capabilities and configures optimal settings
 */

const EventEmitter = require('events');
const { hardwareConfig } = require('../config/hardwareConfig');

class HardwareAdaptiveConfig extends EventEmitter {
    constructor(hardwareDetectionService, options = {}) {
        super();
        
        this.hardwareDetectionService = hardwareDetectionService;
        this.options = {
            enableAutoOptimization: true,
            enableDynamicAdjustment: true,
            performanceBenchmarking: false,
            configUpdateInterval: 300000, // 5 minutes
            ...options
        };
        
        this.currentConfig = null;
        this.hardwareCapabilities = null;
        this.performanceBaseline = null;
        this.adaptiveSettings = new Map();
        this.configHistory = [];
        
        this.isInitialized = false;
        this.initializeConfig();
    }
    
    async initializeConfig() {
        try {
            console.log('[HardwareAdaptive] Initializing hardware-adaptive configuration...');
            
            // Detect hardware capabilities
            await this.detectHardwareCapabilities();
            
            // Generate initial configuration
            this.currentConfig = await this.generateOptimalConfig();
            
            // Establish performance baseline if enabled
            if (this.options.performanceBenchmarking) {
                await this.establishPerformanceBaseline();
            }
            
            // Start dynamic adjustment if enabled
            if (this.options.enableDynamicAdjustment) {
                this.startDynamicAdjustment();
            }
            
            this.isInitialized = true;
            this.emit('config-initialized', this.currentConfig);
            
            console.log('[HardwareAdaptive] Configuration initialized successfully');
            
        } catch (error) {
            console.error('[HardwareAdaptive] Configuration initialization failed:', error);
            this.emit('config-initialization-failed', error);
        }
    }
    
    async detectHardwareCapabilities() {
        try {
            // Get hardware information from detection service
            const hardwareInfo = await this.hardwareDetectionService.initialize();
            
            this.hardwareCapabilities = {
                cpu: this.analyzeCPUCapabilities(hardwareInfo.cpu),
                gpu: this.analyzeGPUCapabilities(hardwareInfo.gpu),
                npu: this.analyzeNPUCapabilities(hardwareInfo.npu),
                memory: this.analyzeMemoryCapabilities(hardwareInfo.memory),
                system: this.analyzeSystemCapabilities(hardwareInfo.system)
            };
            
            console.log('[HardwareAdaptive] Hardware capabilities detected:', this.hardwareCapabilities);
            
        } catch (error) {
            console.error('[HardwareAdaptive] Hardware detection failed:', error);
            throw error;
        }
    }
    
    analyzeCPUCapabilities(cpuInfo) {
        if (!cpuInfo) return { available: false };
        
        return {
            available: true,
            cores: cpuInfo.cores || 4,
            threads: cpuInfo.threads || cpuInfo.cores || 4,
            frequency: cpuInfo.speed || 2000,
            architecture: cpuInfo.arch || process.arch,
            features: {
                avx: cpuInfo.flags?.includes('avx') || false,
                avx2: cpuInfo.flags?.includes('avx2') || false,
                sse: cpuInfo.flags?.includes('sse') || false
            },
            performanceScore: this.calculateCPUScore(cpuInfo)
        };
    }
    
    analyzeGPUCapabilities(gpuInfo) {
        if (!gpuInfo?.bestGPU) return { available: false };
        
        const gpu = gpuInfo.bestGPU;
        return {
            available: true,
            model: gpu.model || 'Unknown',
            memory: gpu.memoryTotal || 0,
            vendor: gpu.vendor || 'Unknown',
            capabilities: {
                directml: gpu.capabilities?.directml || false,
                cuda: gpu.capabilities?.cuda || false,
                opencl: gpu.capabilities?.opencl || false
            },
            performanceScore: gpu.aiPerformanceScore || 0
        };
    }
    
    analyzeNPUCapabilities(npuInfo) {
        if (!npuInfo?.detected) return { available: false };
        
        return {
            available: true,
            type: npuInfo.capabilities?.amdGaia ? 'AMD Gaia' : 'Generic',
            capabilities: {
                amdGaia: npuInfo.capabilities?.amdGaia || false,
                directml: npuInfo.capabilities?.directML || false,
                onnxRuntime: npuInfo.capabilities?.onnxRuntime || false
            },
            performance: npuInfo.performance || {},
            performanceScore: npuInfo.aiPerformanceScore || 0
        };
    }
    
    analyzeMemoryCapabilities(memoryInfo) {
        if (!memoryInfo) return { available: false };
        
        return {
            available: true,
            total: memoryInfo.total || 0,
            available: memoryInfo.available || 0,
            speed: memoryInfo.speed || 0,
            type: memoryInfo.type || 'Unknown'
        };
    }
    
    analyzeSystemCapabilities(systemInfo) {
        return {
            platform: systemInfo?.platform || process.platform,
            arch: systemInfo?.arch || process.arch,
            version: systemInfo?.version || 'Unknown'
        };
    }
    
    calculateCPUScore(cpuInfo) {
        let score = 0;
        
        // Base score from cores and frequency
        score += (cpuInfo.cores || 4) * 10;
        score += ((cpuInfo.speed || 2000) / 1000) * 20;
        
        // Bonus for advanced features
        if (cpuInfo.flags?.includes('avx2')) score += 50;
        else if (cpuInfo.flags?.includes('avx')) score += 30;
        if (cpuInfo.flags?.includes('sse')) score += 20;
        
        return Math.min(score, 1000);
    }
    
    async generateOptimalConfig() {
        try {
            const config = {
                primaryDevice: this.selectPrimaryDevice(),
                fallbackOrder: this.generateFallbackOrder(),
                batchSizes: this.calculateOptimalBatchSizes(),
                memorySettings: this.calculateMemorySettings(),
                processingSettings: this.calculateProcessingSettings(),
                optimizations: this.selectOptimizations(),
                timestamp: Date.now()
            };
            
            // Store in history
            this.configHistory.push(config);
            if (this.configHistory.length > 10) {
                this.configHistory = this.configHistory.slice(-5);
            }
            
            return config;
            
        } catch (error) {
            console.error('[HardwareAdaptive] Config generation failed:', error);
            return this.getDefaultConfig();
        }
    }
    
    selectPrimaryDevice() {
        const devices = [
            { type: 'npu', score: this.hardwareCapabilities.npu?.performanceScore || 0, available: this.hardwareCapabilities.npu?.available },
            { type: 'gpu', score: this.hardwareCapabilities.gpu?.performanceScore || 0, available: this.hardwareCapabilities.gpu?.available },
            { type: 'cpu', score: this.hardwareCapabilities.cpu?.performanceScore || 0, available: this.hardwareCapabilities.cpu?.available }
        ];
        
        // Filter available devices and sort by score
        const availableDevices = devices.filter(d => d.available).sort((a, b) => b.score - a.score);
        
        return availableDevices.length > 0 ? availableDevices[0].type : 'cpu';
    }
    
    generateFallbackOrder() {
        const order = [];
        
        if (this.hardwareCapabilities.npu?.available) order.push('npu');
        if (this.hardwareCapabilities.gpu?.available) order.push('gpu');
        if (this.hardwareCapabilities.cpu?.available) order.push('cpu');
        
        return order;
    }
    
    calculateOptimalBatchSizes() {
        const batchSizes = {};
        
        // NPU batch sizes
        if (this.hardwareCapabilities.npu?.available) {
            batchSizes.npu = {
                embedding: 32,
                inference: 16,
                training: 8
            };
        }
        
        // GPU batch sizes
        if (this.hardwareCapabilities.gpu?.available) {
            const gpuMemory = this.hardwareCapabilities.gpu.memory || 4096;
            const memoryFactor = Math.min(gpuMemory / 8192, 2); // Scale based on 8GB baseline
            
            batchSizes.gpu = {
                embedding: Math.floor(16 * memoryFactor),
                inference: Math.floor(8 * memoryFactor),
                training: Math.floor(4 * memoryFactor)
            };
        }
        
        // CPU batch sizes
        const cpuCores = this.hardwareCapabilities.cpu?.cores || 4;
        batchSizes.cpu = {
            embedding: Math.min(cpuCores * 2, 16),
            inference: Math.min(cpuCores, 8),
            training: Math.min(cpuCores / 2, 4)
        };
        
        return batchSizes;
    }
    
    calculateMemorySettings() {
        const totalMemory = this.hardwareCapabilities.memory?.total || 8 * 1024 * 1024 * 1024; // 8GB default
        const availableMemory = this.hardwareCapabilities.memory?.available || totalMemory * 0.7;
        
        return {
            maxCacheSize: Math.floor(availableMemory * 0.3), // 30% for cache
            sharedMemoryPool: Math.floor(availableMemory * 0.2), // 20% for shared memory
            sessionCache: Math.floor(availableMemory * 0.1), // 10% for session cache
            workingMemory: Math.floor(availableMemory * 0.4) // 40% for working memory
        };
    }
    
    calculateProcessingSettings() {
        const settings = {
            maxConcurrentSessions: 4,
            maxWorkerThreads: 4,
            ioBindingEnabled: false,
            zeroCopyEnabled: false
        };
        
        // Adjust based on CPU capabilities
        if (this.hardwareCapabilities.cpu?.available) {
            settings.maxWorkerThreads = Math.min(this.hardwareCapabilities.cpu.threads || 4, 8);
            settings.maxConcurrentSessions = Math.min(this.hardwareCapabilities.cpu.cores || 4, 6);
        }
        
        // Enable advanced features for capable hardware
        if (this.hardwareCapabilities.npu?.available || this.hardwareCapabilities.gpu?.available) {
            settings.ioBindingEnabled = true;
            settings.zeroCopyEnabled = true;
        }
        
        return settings;
    }
    
    selectOptimizations() {
        const optimizations = {
            graphOptimization: 'basic',
            precision: 'fp32',
            quantization: false,
            memoryPattern: false,
            cpuMemArena: false
        };
        
        // Enable optimizations based on hardware capabilities
        if (this.hardwareCapabilities.npu?.available) {
            optimizations.graphOptimization = 'all';
            optimizations.precision = 'fp16';
            optimizations.quantization = true;
            optimizations.memoryPattern = true;
        } else if (this.hardwareCapabilities.gpu?.available) {
            optimizations.graphOptimization = 'extended';
            optimizations.precision = 'fp32';
            optimizations.memoryPattern = true;
            optimizations.cpuMemArena = true;
        } else {
            optimizations.cpuMemArena = true;
        }
        
        return optimizations;
    }
    
    async establishPerformanceBaseline() {
        try {
            console.log('[HardwareAdaptive] Establishing performance baseline...');
            
            // This would run benchmark tests on each available device
            // For now, we'll use estimated baselines
            this.performanceBaseline = {
                npu: this.hardwareCapabilities.npu?.available ? {
                    inferenceLatency: 50, // ms
                    throughput: 100, // inferences/sec
                    memoryUsage: 512 // MB
                } : null,
                gpu: this.hardwareCapabilities.gpu?.available ? {
                    inferenceLatency: 100,
                    throughput: 50,
                    memoryUsage: 1024
                } : null,
                cpu: {
                    inferenceLatency: 500,
                    throughput: 10,
                    memoryUsage: 256
                }
            };
            
            this.emit('baseline-established', this.performanceBaseline);
            
        } catch (error) {
            console.error('[HardwareAdaptive] Baseline establishment failed:', error);
        }
    }
    
    startDynamicAdjustment() {
        this.adjustmentInterval = setInterval(async () => {
            await this.performDynamicAdjustment();
        }, this.options.configUpdateInterval);
        
        console.log('[HardwareAdaptive] Dynamic adjustment started');
    }
    
    async performDynamicAdjustment() {
        try {
            // Check if hardware status has changed
            const currentHardware = await this.hardwareDetectionService.getHardwareInfo();
            
            // Check if configuration needs updating
            if (this.shouldUpdateConfig(currentHardware)) {
                console.log('[HardwareAdaptive] Updating configuration based on hardware changes');
                
                await this.detectHardwareCapabilities();
                const newConfig = await this.generateOptimalConfig();
                
                this.currentConfig = newConfig;
                this.emit('config-updated', newConfig);
            }
            
        } catch (error) {
            console.error('[HardwareAdaptive] Dynamic adjustment failed:', error);
        }
    }
    
    shouldUpdateConfig(currentHardware) {
        // Simple heuristic - update if hardware availability changed
        const currentNPU = currentHardware.npu?.detected || false;
        const currentGPU = currentHardware.gpu?.bestGPU ? true : false;
        
        const configNPU = this.hardwareCapabilities.npu?.available || false;
        const configGPU = this.hardwareCapabilities.gpu?.available || false;
        
        return currentNPU !== configNPU || currentGPU !== configGPU;
    }
    
    getDefaultConfig() {
        return {
            primaryDevice: 'cpu',
            fallbackOrder: ['cpu'],
            batchSizes: {
                cpu: { embedding: 4, inference: 2, training: 1 }
            },
            memorySettings: {
                maxCacheSize: 512 * 1024 * 1024, // 512MB
                sharedMemoryPool: 256 * 1024 * 1024,
                sessionCache: 128 * 1024 * 1024,
                workingMemory: 1024 * 1024 * 1024
            },
            processingSettings: {
                maxConcurrentSessions: 2,
                maxWorkerThreads: 2,
                ioBindingEnabled: false,
                zeroCopyEnabled: false
            },
            optimizations: {
                graphOptimization: 'basic',
                precision: 'fp32',
                quantization: false,
                memoryPattern: false,
                cpuMemArena: true
            },
            timestamp: Date.now()
        };
    }
    
    getCurrentConfig() {
        return this.currentConfig;
    }
    
    getHardwareCapabilities() {
        return this.hardwareCapabilities;
    }
    
    getConfigForDevice(deviceType) {
        if (!this.currentConfig) return null;
        
        return {
            batchSizes: this.currentConfig.batchSizes[deviceType],
            memorySettings: this.currentConfig.memorySettings,
            processingSettings: this.currentConfig.processingSettings,
            optimizations: this.currentConfig.optimizations
        };
    }
    
    updateAdaptiveSetting(key, value) {
        this.adaptiveSettings.set(key, value);
        this.emit('adaptive-setting-updated', { key, value });
    }
    
    getAdaptiveSettings() {
        return Object.fromEntries(this.adaptiveSettings);
    }
    
    dispose() {
        if (this.adjustmentInterval) {
            clearInterval(this.adjustmentInterval);
        }
        
        this.adaptiveSettings.clear();
        this.configHistory = [];
        this.removeAllListeners();
        
        console.log('[HardwareAdaptive] Hardware-adaptive configuration disposed');
    }
}

module.exports = HardwareAdaptiveConfig;
