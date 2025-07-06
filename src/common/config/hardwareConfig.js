/**
 * Hardware Configuration for DirectML and ONNX Runtime
 * Provides configuration settings for different hardware scenarios
 */

const os = require('os');
const path = require('path');

class HardwareConfig {
    constructor() {
        this.platform = os.platform();
        this.arch = os.arch();
        this.configs = new Map();
        
        this.initializeConfigurations();
    }
    
    initializeConfigurations() {
        // AMD Gaia NPU Configuration
        this.configs.set('amd-gaia-npu', {
            enabled: true,
            executionProviders: ['DmlExecutionProvider', 'CPUExecutionProvider'],
            sessionOptions: {
                enableMemPattern: true,
                enableCpuMemArena: true,
                graphOptimizationLevel: 'all',
                executionMode: 'sequential',
                interOpNumThreads: 1,
                intraOpNumThreads: 4
            },
            directMLOptions: {
                deviceFilter: 'npu',
                enableDebugLayer: false,
                disableMetaCommands: false
            },
            modelOptimization: {
                precision: 'fp16',
                enableQuantization: true,
                batchSize: 32,
                maxSequenceLength: 512
            },
            performance: {
                topsInt8: 16,
                topsInt16: 8,
                topsFp16: 4,
                memoryBandwidth: 120,
                powerConsumption: 15
            }
        });
        
        // GPU Fallback Configuration
        this.configs.set('gpu-fallback', {
            enabled: true,
            executionProviders: this.platform === 'win32' 
                ? ['DmlExecutionProvider', 'CPUExecutionProvider']
                : ['CUDAExecutionProvider', 'CPUExecutionProvider'],
            sessionOptions: {
                enableMemPattern: true,
                enableCpuMemArena: true,
                graphOptimizationLevel: 'all',
                executionMode: 'parallel',
                interOpNumThreads: 2,
                intraOpNumThreads: 8
            },
            modelOptimization: {
                precision: 'fp32',
                enableQuantization: false,
                batchSize: 16,
                maxSequenceLength: 1024
            }
        });
        
        // CPU-Only Configuration
        this.configs.set('cpu-only', {
            enabled: true,
            executionProviders: ['CPUExecutionProvider'],
            sessionOptions: {
                enableMemPattern: true,
                enableCpuMemArena: true,
                graphOptimizationLevel: 'all',
                executionMode: 'parallel',
                interOpNumThreads: os.cpus().length,
                intraOpNumThreads: 1
            },
            modelOptimization: {
                precision: 'fp32',
                enableQuantization: true,
                batchSize: 4,
                maxSequenceLength: 256
            }
        });
        
        // Development Configuration
        this.configs.set('development', {
            enabled: true,
            executionProviders: ['CPUExecutionProvider'],
            sessionOptions: {
                enableMemPattern: false,
                enableCpuMemArena: false,
                graphOptimizationLevel: 'basic',
                executionMode: 'sequential',
                interOpNumThreads: 1,
                intraOpNumThreads: 1,
                logSeverityLevel: 0, // Verbose logging
                logVerbosityLevel: 1
            },
            modelOptimization: {
                precision: 'fp32',
                enableQuantization: false,
                batchSize: 1,
                maxSequenceLength: 128
            },
            debugging: {
                enableProfiling: true,
                dumpOptimizedModel: true,
                saveExecutionTrace: true
            }
        });
    }
    
    /**
     * Get configuration for specific hardware type
     */
    getConfig(hardwareType) {
        return this.configs.get(hardwareType) || this.configs.get('cpu-only');
    }
    
    /**
     * Get optimal configuration based on detected hardware
     */
    getOptimalConfig(hardwareInfo) {
        // Check for AMD Gaia NPU
        if (hardwareInfo.npu?.capabilities?.amdGaia) {
            return this.getConfig('amd-gaia-npu');
        }
        
        // Check for GPU with DirectML/CUDA support
        if (hardwareInfo.gpu?.bestGPU?.capabilities?.directml || 
            hardwareInfo.gpu?.bestGPU?.capabilities?.cuda) {
            return this.getConfig('gpu-fallback');
        }
        
        // Fallback to CPU
        return this.getConfig('cpu-only');
    }
    
    /**
     * Create ONNX Runtime session options
     */
    createSessionOptions(configName, overrides = {}) {
        const config = this.getConfig(configName);
        
        return {
            executionProviders: config.executionProviders,
            ...config.sessionOptions,
            ...overrides
        };
    }
    
    /**
     * Get DirectML specific options
     */
    getDirectMLOptions(configName) {
        const config = this.getConfig(configName);
        return config.directMLOptions || {};
    }
    
    /**
     * Get model optimization settings
     */
    getModelOptimization(configName) {
        const config = this.getConfig(configName);
        return config.modelOptimization || {};
    }
    
    /**
     * Validate hardware requirements
     */
    validateHardwareRequirements(configName, hardwareInfo) {
        const config = this.getConfig(configName);
        const requirements = {
            valid: true,
            issues: [],
            recommendations: []
        };
        
        // Check NPU requirements
        if (configName === 'amd-gaia-npu') {
            if (!hardwareInfo.npu?.capabilities?.amdGaia) {
                requirements.valid = false;
                requirements.issues.push('AMD Gaia NPU not detected');
                requirements.recommendations.push('Use gpu-fallback or cpu-only configuration');
            }
            
            if (!hardwareInfo.npu?.capabilities?.directML) {
                requirements.issues.push('DirectML support not detected');
                requirements.recommendations.push('Install latest AMD drivers with DirectML support');
            }
        }
        
        // Check GPU requirements
        if (configName === 'gpu-fallback') {
            if (!hardwareInfo.gpu?.bestGPU) {
                requirements.valid = false;
                requirements.issues.push('No suitable GPU detected');
                requirements.recommendations.push('Use cpu-only configuration');
            }
        }
        
        // Check memory requirements
        const memoryGB = hardwareInfo.memory?.total / (1024 * 1024 * 1024);
        if (memoryGB < 8) {
            requirements.issues.push('Low system memory detected');
            requirements.recommendations.push('Consider reducing batch size or model complexity');
        }
        
        return requirements;
    }
    
    /**
     * Get environment-specific configuration
     */
    getEnvironmentConfig() {
        const isDevelopment = process.env.NODE_ENV === 'development';
        const isProduction = process.env.NODE_ENV === 'production';
        
        return {
            isDevelopment,
            isProduction,
            enableDebugLogging: isDevelopment,
            enableProfiling: isDevelopment,
            optimizeForLatency: isProduction,
            optimizeForThroughput: !isDevelopment
        };
    }
    
    /**
     * Create hardware-adaptive batch size
     */
    getAdaptiveBatchSize(configName, modelSize, availableMemory) {
        const config = this.getConfig(configName);
        let baseBatchSize = config.modelOptimization.batchSize;
        
        // Adjust based on available memory
        const memoryGB = availableMemory / (1024 * 1024 * 1024);
        const memoryFactor = Math.min(memoryGB / 16, 2); // Scale up to 2x for 16GB+ systems
        
        // Adjust based on model size
        const modelSizeMB = modelSize / (1024 * 1024);
        const sizeFactor = modelSizeMB > 1000 ? 0.5 : modelSizeMB > 500 ? 0.75 : 1;
        
        const adaptiveBatchSize = Math.max(1, Math.floor(baseBatchSize * memoryFactor * sizeFactor));
        
        return Math.min(adaptiveBatchSize, 128); // Cap at 128
    }
    
    /**
     * Get performance monitoring configuration
     */
    getPerformanceConfig(configName) {
        const config = this.getConfig(configName);
        const envConfig = this.getEnvironmentConfig();
        
        return {
            enableMetrics: true,
            enableProfiling: envConfig.enableProfiling,
            metricsInterval: envConfig.isDevelopment ? 1000 : 5000,
            profileOutputPath: path.join(process.cwd(), 'logs', 'performance'),
            trackMemoryUsage: true,
            trackInferenceLatency: true,
            trackThroughput: true,
            alertThresholds: {
                memoryUsage: 0.9, // 90% memory usage
                inferenceLatency: config.performance?.maxLatencyMs || 1000,
                errorRate: 0.05 // 5% error rate
            }
        };
    }
    
    /**
     * Export configuration for external tools
     */
    exportConfig(configName, format = 'json') {
        const config = this.getConfig(configName);
        
        switch (format) {
            case 'json':
                return JSON.stringify(config, null, 2);
            case 'yaml':
                // Would need yaml library
                return config;
            default:
                return config;
        }
    }
}

// Singleton instance
const hardwareConfig = new HardwareConfig();

module.exports = {
    HardwareConfig,
    hardwareConfig
};
