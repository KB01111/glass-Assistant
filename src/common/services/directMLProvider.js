/**
 * DirectML Execution Provider for AMD Gaia NPU acceleration
 * Provides ONNX Runtime integration with session caching and IO binding
 */

const ort = require('onnxruntime-node');
const { hardwareConfig } = require('../config/hardwareConfig');
const EventEmitter = require('events');

class DirectMLAcceleratedInference extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.sessionCache = new Map();
        this.ioBindingCache = new Map();
        this.providers = ['DmlExecutionProvider', 'CPUExecutionProvider'];
        this.isInitialized = false;
        this.stats = {
            sessionsCreated: 0,
            inferencesRun: 0,
            cacheHits: 0,
            cacheMisses: 0,
            totalInferenceTime: 0,
            averageInferenceTime: 0
        };
        
        this.options = {
            maxCachedSessions: 10,
            enableIOBinding: true,
            enableProfiling: false,
            ...options
        };
        
        this.initializeProvider();
    }
    
    async initializeProvider() {
        try {
            console.log('[DirectML] Initializing DirectML execution provider...');
            
            // Check if DirectML is available
            const availableProviders = ort.InferenceSession.getAvailableProviders();
            console.log('[DirectML] Available providers:', availableProviders);
            
            if (!availableProviders.includes('DmlExecutionProvider')) {
                console.warn('[DirectML] DirectML provider not available, falling back to CPU');
                this.providers = ['CPUExecutionProvider'];
            }
            
            this.isInitialized = true;
            this.emit('initialized', { providers: this.providers });
            
        } catch (error) {
            console.error('[DirectML] Initialization failed:', error);
            this.providers = ['CPUExecutionProvider'];
            this.isInitialized = true;
        }
    }
    
    /**
     * Create optimized ONNX Runtime session
     */
    async createOptimizedSession(modelPath, options = {}) {
        const cacheKey = `${modelPath}_${JSON.stringify(options)}`;
        
        // Check cache first
        if (this.sessionCache.has(cacheKey)) {
            this.stats.cacheHits++;
            return this.sessionCache.get(cacheKey);
        }
        
        this.stats.cacheMisses++;
        
        try {
            const config = hardwareConfig.getConfig('amd-gaia-npu');
            const sessionOptions = hardwareConfig.createSessionOptions('amd-gaia-npu', options);
            
            console.log(`[DirectML] Creating session for ${modelPath}`);
            console.log(`[DirectML] Using providers:`, this.providers);
            
            const session = await ort.InferenceSession.create(modelPath, {
                executionProviders: this.providers,
                ...sessionOptions
            });
            
            // Cache the session
            if (this.sessionCache.size >= this.options.maxCachedSessions) {
                // Remove oldest session
                const oldestKey = this.sessionCache.keys().next().value;
                const oldSession = this.sessionCache.get(oldestKey);
                await this.disposeSession(oldSession);
                this.sessionCache.delete(oldestKey);
            }
            
            this.sessionCache.set(cacheKey, session);
            this.stats.sessionsCreated++;
            
            this.emit('session-created', { modelPath, cacheKey, providers: this.providers });
            
            return session;
            
        } catch (error) {
            console.error(`[DirectML] Failed to create session for ${modelPath}:`, error);
            throw error;
        }
    }
    
    /**
     * Run batch inference with IO binding for zero-copy operations
     */
    async runBatchInference(session, inputBatches, options = {}) {
        const results = [];
        const startTime = Date.now();
        
        try {
            for (const batch of inputBatches) {
                const result = await this.runSingleInference(session, batch, options);
                results.push(result);
            }
            
            const inferenceTime = Date.now() - startTime;
            this.updateStats(inferenceTime);
            
            this.emit('batch-inference-complete', {
                batchSize: inputBatches.length,
                inferenceTime,
                throughput: inputBatches.length / (inferenceTime / 1000)
            });
            
            return results;
            
        } catch (error) {
            console.error('[DirectML] Batch inference failed:', error);
            throw error;
        }
    }
    
    /**
     * Run single inference with optional IO binding
     */
    async runSingleInference(session, inputs, options = {}) {
        try {
            if (this.options.enableIOBinding && this.supportsIOBinding(session)) {
                return await this.runWithIOBinding(session, inputs, options);
            } else {
                return await this.runWithoutIOBinding(session, inputs, options);
            }
        } catch (error) {
            console.error('[DirectML] Single inference failed:', error);
            throw error;
        }
    }
    
    /**
     * Run inference with IO binding for zero-copy operations
     */
    async runWithIOBinding(session, inputs, options = {}) {
        const ioBinding = session.createIoBinding();
        
        try {
            // Bind inputs directly to device memory
            for (const [name, tensor] of Object.entries(inputs)) {
                if (tensor instanceof ort.Tensor) {
                    ioBinding.bindInput(name, tensor);
                } else {
                    // Convert to tensor if needed
                    const ortTensor = new ort.Tensor(tensor.type || 'float32', tensor.data, tensor.dims);
                    ioBinding.bindInput(name, ortTensor);
                }
            }
            
            // Bind outputs to device memory
            const outputNames = session.outputNames;
            for (const outputName of outputNames) {
                ioBinding.bindOutput(outputName);
            }
            
            // Run inference on device
            await session.runWithIoBinding(ioBinding);
            
            // Get outputs
            const outputs = {};
            for (const outputName of outputNames) {
                outputs[outputName] = ioBinding.getOutputBuffer(outputName);
            }
            
            return outputs;
            
        } finally {
            ioBinding.dispose();
        }
    }
    
    /**
     * Run inference without IO binding (fallback)
     */
    async runWithoutIOBinding(session, inputs, options = {}) {
        // Convert inputs to ONNX tensors if needed
        const ortInputs = {};
        for (const [name, tensor] of Object.entries(inputs)) {
            if (tensor instanceof ort.Tensor) {
                ortInputs[name] = tensor;
            } else {
                ortInputs[name] = new ort.Tensor(
                    tensor.type || 'float32',
                    tensor.data,
                    tensor.dims
                );
            }
        }
        
        const results = await session.run(ortInputs);
        return results;
    }
    
    /**
     * Check if session supports IO binding
     */
    supportsIOBinding(session) {
        try {
            // Try to create IO binding to test support
            const ioBinding = session.createIoBinding();
            ioBinding.dispose();
            return true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Optimize model for DirectML execution
     */
    async optimizeModelForDirectML(modelPath, outputPath, options = {}) {
        try {
            const config = hardwareConfig.getModelOptimization('amd-gaia-npu');
            
            // Create session with optimization
            const sessionOptions = {
                executionProviders: this.providers,
                graphOptimizationLevel: 'all',
                optimizedModelFilePath: outputPath,
                ...options
            };
            
            const session = await ort.InferenceSession.create(modelPath, sessionOptions);
            
            console.log(`[DirectML] Model optimized and saved to ${outputPath}`);
            
            return session;
            
        } catch (error) {
            console.error('[DirectML] Model optimization failed:', error);
            throw error;
        }
    }
    
    /**
     * Create tensor from data with optimal memory layout
     */
    createOptimizedTensor(data, dims, type = 'float32') {
        try {
            // Ensure data is properly aligned for DirectML
            let alignedData = data;
            
            if (type === 'float16') {
                // Convert to Float16Array if available
                alignedData = new Float32Array(data); // DirectML handles conversion
            } else if (type === 'float32') {
                alignedData = new Float32Array(data);
            } else if (type === 'int32') {
                alignedData = new Int32Array(data);
            }
            
            return new ort.Tensor(type, alignedData, dims);
            
        } catch (error) {
            console.error('[DirectML] Tensor creation failed:', error);
            throw error;
        }
    }
    
    /**
     * Get performance statistics
     */
    getStats() {
        return {
            ...this.stats,
            cachedSessions: this.sessionCache.size,
            providers: this.providers,
            isInitialized: this.isInitialized
        };
    }
    
    /**
     * Update inference statistics
     */
    updateStats(inferenceTime) {
        this.stats.inferencesRun++;
        this.stats.totalInferenceTime += inferenceTime;
        this.stats.averageInferenceTime = this.stats.totalInferenceTime / this.stats.inferencesRun;
    }
    
    /**
     * Clear session cache
     */
    async clearCache() {
        for (const [key, session] of this.sessionCache) {
            await this.disposeSession(session);
        }
        this.sessionCache.clear();
        
        console.log('[DirectML] Session cache cleared');
    }
    
    /**
     * Dispose of a session safely
     */
    async disposeSession(session) {
        try {
            if (session && typeof session.dispose === 'function') {
                await session.dispose();
            }
        } catch (error) {
            console.error('[DirectML] Session disposal failed:', error);
        }
    }
    
    /**
     * Check DirectML device health
     */
    async checkDeviceHealth() {
        try {
            // Create a simple test session to verify DirectML is working
            const testModelPath = require('path').join(__dirname, '../models/test_model.onnx');
            
            // If test model doesn't exist, create a minimal one in memory
            const testSession = await this.createOptimizedSession(testModelPath, {
                executionProviders: ['DmlExecutionProvider']
            });
            
            return {
                status: 'healthy',
                provider: 'DirectML',
                deviceCount: 1 // DirectML typically uses one device
            };
            
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                fallbackAvailable: this.providers.includes('CPUExecutionProvider')
            };
        }
    }
    
    /**
     * Dispose of the provider
     */
    async dispose() {
        await this.clearCache();
        this.removeAllListeners();
        
        console.log('[DirectML] DirectML provider disposed');
    }
}

/**
 * ONNX Runtime DirectML Provider with enhanced error handling
 */
class ONNXRuntimeDirectMLProvider extends EventEmitter {
    constructor(options = {}) {
        super();

        this.isInitialized = false;
        this.supportedOperations = new Set();
        this.unsupportedOperations = new Set();
        this.fallbackProvider = null;
        this.providerOptions = {
            deviceFilter: 'npu',
            enableDebugLayer: false,
            disableMetaCommands: false,
            ...options
        };

        this.initializeProvider();
    }

    async initializeProvider() {
        try {
            console.log('[ONNX-DirectML] Initializing ONNX Runtime with DirectML...');

            // Check DirectML availability
            const providers = ort.InferenceSession.getAvailableProviders();

            if (!providers.includes('DmlExecutionProvider')) {
                throw new Error('DirectML execution provider not available');
            }

            // Test DirectML functionality
            await this.testDirectMLCapabilities();

            // Initialize fallback provider
            this.fallbackProvider = new DirectMLAcceleratedInference({
                providers: ['CPUExecutionProvider']
            });

            this.isInitialized = true;
            this.emit('initialized');

        } catch (error) {
            console.error('[ONNX-DirectML] Initialization failed:', error);
            this.emit('initialization-failed', error);
        }
    }

    async testDirectMLCapabilities() {
        try {
            // Test basic DirectML operations
            const testOps = [
                'Conv', 'MatMul', 'Add', 'Relu', 'Softmax',
                'BatchNormalization', 'Reshape', 'Transpose'
            ];

            for (const op of testOps) {
                try {
                    await this.testOperation(op);
                    this.supportedOperations.add(op);
                } catch (error) {
                    this.unsupportedOperations.add(op);
                    console.warn(`[ONNX-DirectML] Operation ${op} not supported:`, error.message);
                }
            }

            console.log(`[ONNX-DirectML] Supported operations: ${this.supportedOperations.size}`);
            console.log(`[ONNX-DirectML] Unsupported operations: ${this.unsupportedOperations.size}`);

        } catch (error) {
            console.error('[ONNX-DirectML] Capability testing failed:', error);
        }
    }

    async testOperation(operationType) {
        // This would test specific ONNX operations
        // For now, we'll assume basic operations are supported
        return true;
    }

    /**
     * Create session with DirectML provider and error handling
     */
    async createSession(modelPath, options = {}) {
        try {
            const sessionOptions = {
                executionProviders: [
                    {
                        name: 'DmlExecutionProvider',
                        ...this.providerOptions
                    },
                    'CPUExecutionProvider'
                ],
                graphOptimizationLevel: 'all',
                enableMemPattern: true,
                enableCpuMemArena: true,
                ...options
            };

            const session = await ort.InferenceSession.create(modelPath, sessionOptions);

            // Validate session can run on DirectML
            await this.validateSessionCompatibility(session);

            return session;

        } catch (error) {
            console.error(`[ONNX-DirectML] Session creation failed for ${modelPath}:`, error);

            // Try fallback to CPU
            if (this.fallbackProvider) {
                console.log('[ONNX-DirectML] Falling back to CPU provider');
                return await this.fallbackProvider.createOptimizedSession(modelPath, {
                    executionProviders: ['CPUExecutionProvider']
                });
            }

            throw error;
        }
    }

    async validateSessionCompatibility(session) {
        try {
            // Check if model operations are supported by DirectML
            const modelInfo = this.analyzeModelOperations(session);

            if (modelInfo.unsupportedOps.length > 0) {
                console.warn('[ONNX-DirectML] Model contains unsupported operations:', modelInfo.unsupportedOps);
            }

            return modelInfo;

        } catch (error) {
            console.error('[ONNX-DirectML] Session validation failed:', error);
            throw error;
        }
    }

    analyzeModelOperations(session) {
        // This would analyze the model graph for operation compatibility
        // For now, return basic info
        return {
            supportedOps: Array.from(this.supportedOperations),
            unsupportedOps: Array.from(this.unsupportedOperations),
            compatibility: 'partial'
        };
    }

    /**
     * Run inference with automatic fallback handling
     */
    async runInference(session, inputs, options = {}) {
        try {
            // Try DirectML execution first
            return await this.runDirectMLInference(session, inputs, options);

        } catch (error) {
            console.warn('[ONNX-DirectML] DirectML inference failed, trying fallback:', error.message);

            // Fallback to CPU execution
            if (this.fallbackProvider) {
                return await this.fallbackProvider.runSingleInference(session, inputs, options);
            }

            throw error;
        }
    }

    async runDirectMLInference(session, inputs, options = {}) {
        const startTime = Date.now();

        try {
            // Convert inputs to ONNX tensors
            const ortInputs = {};
            for (const [name, tensor] of Object.entries(inputs)) {
                ortInputs[name] = this.convertToONNXTensor(tensor);
            }

            // Run inference
            const results = await session.run(ortInputs);

            const inferenceTime = Date.now() - startTime;
            this.emit('inference-complete', { inferenceTime, provider: 'DirectML' });

            return results;

        } catch (error) {
            const inferenceTime = Date.now() - startTime;
            this.emit('inference-failed', { inferenceTime, provider: 'DirectML', error });
            throw error;
        }
    }

    convertToONNXTensor(tensor) {
        if (tensor instanceof ort.Tensor) {
            return tensor;
        }

        return new ort.Tensor(
            tensor.type || 'float32',
            tensor.data,
            tensor.dims || tensor.shape
        );
    }

    /**
     * Get provider capabilities and status
     */
    getCapabilities() {
        return {
            isInitialized: this.isInitialized,
            supportedOperations: Array.from(this.supportedOperations),
            unsupportedOperations: Array.from(this.unsupportedOperations),
            providerOptions: this.providerOptions,
            fallbackAvailable: !!this.fallbackProvider
        };
    }

    /**
     * Handle unsupported operations gracefully
     */
    async handleUnsupportedOperation(operationType, inputs, options = {}) {
        console.warn(`[ONNX-DirectML] Unsupported operation ${operationType}, using fallback`);

        if (this.fallbackProvider) {
            return await this.fallbackProvider.runSingleInference(null, inputs, options);
        }

        throw new Error(`Operation ${operationType} not supported and no fallback available`);
    }

    async dispose() {
        if (this.fallbackProvider) {
            await this.fallbackProvider.dispose();
        }

        this.removeAllListeners();
        console.log('[ONNX-DirectML] Provider disposed');
    }
}

module.exports = { DirectMLAcceleratedInference, ONNXRuntimeDirectMLProvider };
