/**
 * IO Binding Manager for Zero-Copy Operations
 * Implements ONNX Runtime IO binding for direct memory access and efficient data transfer
 */

const ort = require('onnxruntime-node');
const EventEmitter = require('events');
const SharedMemoryPool = require('./sharedMemoryPool');

class IOBindingManager extends EventEmitter {
    constructor(memoryPool, options = {}) {
        super();
        
        this.memoryPool = memoryPool || new SharedMemoryPool();
        this.bindingCache = new Map();
        this.tensorCache = new Map();
        this.deviceMemoryAllocations = new Map();
        
        this.options = {
            enableCaching: true,
            maxCachedBindings: 50,
            enableZeroCopy: true,
            enableMemoryReuse: true,
            ...options
        };
        
        this.stats = {
            bindingsCreated: 0,
            bindingsReused: 0,
            zeroCopyOperations: 0,
            memoryAllocations: 0,
            totalMemoryAllocated: 0
        };
    }
    
    /**
     * Create IO binding for zero-copy operations
     */
    async createIOBinding(session, inputs, outputs = null) {
        try {
            const bindingKey = this.generateBindingKey(session, inputs, outputs);
            
            // Check cache first
            if (this.options.enableCaching && this.bindingCache.has(bindingKey)) {
                this.stats.bindingsReused++;
                return this.bindingCache.get(bindingKey);
            }
            
            const ioBinding = session.createIoBinding();
            const bindingInfo = {
                ioBinding,
                inputBindings: new Map(),
                outputBindings: new Map(),
                memoryAllocations: new Map(),
                session,
                created: Date.now()
            };
            
            // Bind inputs
            await this.bindInputs(ioBinding, inputs, bindingInfo);
            
            // Bind outputs
            if (outputs) {
                await this.bindOutputs(ioBinding, outputs, bindingInfo);
            } else {
                await this.bindDefaultOutputs(ioBinding, session, bindingInfo);
            }
            
            // Cache the binding
            if (this.options.enableCaching) {
                this.cacheBinding(bindingKey, bindingInfo);
            }
            
            this.stats.bindingsCreated++;
            this.emit('binding-created', { bindingKey, inputCount: inputs.size || Object.keys(inputs).length });
            
            return bindingInfo;
            
        } catch (error) {
            console.error('[IOBinding] Failed to create IO binding:', error);
            throw error;
        }
    }
    
    /**
     * Bind input tensors to device memory
     */
    async bindInputs(ioBinding, inputs, bindingInfo) {
        for (const [name, tensor] of Object.entries(inputs)) {
            try {
                const boundTensor = await this.bindInputTensor(ioBinding, name, tensor);
                bindingInfo.inputBindings.set(name, boundTensor);
                
            } catch (error) {
                console.error(`[IOBinding] Failed to bind input ${name}:`, error);
                throw error;
            }
        }
    }
    
    /**
     * Bind single input tensor with zero-copy optimization
     */
    async bindInputTensor(ioBinding, name, tensor) {
        try {
            let ortTensor;
            
            if (tensor instanceof ort.Tensor) {
                ortTensor = tensor;
            } else {
                // Create optimized tensor with shared memory if possible
                ortTensor = await this.createOptimizedTensor(tensor);
            }
            
            // Bind tensor to device memory
            if (this.options.enableZeroCopy && this.supportsZeroCopy(ortTensor)) {
                await this.bindTensorZeroCopy(ioBinding, name, ortTensor);
                this.stats.zeroCopyOperations++;
            } else {
                ioBinding.bindInput(name, ortTensor);
            }
            
            return ortTensor;
            
        } catch (error) {
            console.error(`[IOBinding] Failed to bind input tensor ${name}:`, error);
            throw error;
        }
    }
    
    /**
     * Bind tensor with zero-copy optimization
     */
    async bindTensorZeroCopy(ioBinding, name, tensor) {
        try {
            // Allocate device memory if needed
            const deviceMemory = await this.allocateDeviceMemory(tensor);
            
            // Bind tensor directly to device memory
            ioBinding.bindInput(name, tensor);
            
            // Track memory allocation
            this.deviceMemoryAllocations.set(name, deviceMemory);
            this.stats.memoryAllocations++;
            this.stats.totalMemoryAllocated += deviceMemory.size;
            
        } catch (error) {
            console.error(`[IOBinding] Zero-copy binding failed for ${name}:`, error);
            // Fallback to regular binding
            ioBinding.bindInput(name, tensor);
        }
    }
    
    /**
     * Bind output tensors
     */
    async bindOutputs(ioBinding, outputs, bindingInfo) {
        for (const [name, outputSpec] of Object.entries(outputs)) {
            try {
                await this.bindOutputTensor(ioBinding, name, outputSpec);
                bindingInfo.outputBindings.set(name, outputSpec);
                
            } catch (error) {
                console.error(`[IOBinding] Failed to bind output ${name}:`, error);
                throw error;
            }
        }
    }
    
    /**
     * Bind default outputs for session
     */
    async bindDefaultOutputs(ioBinding, session, bindingInfo) {
        try {
            const outputNames = session.outputNames;
            
            for (const outputName of outputNames) {
                // Bind output to device memory
                ioBinding.bindOutput(outputName);
                bindingInfo.outputBindings.set(outputName, { name: outputName, bound: true });
            }
            
        } catch (error) {
            console.error('[IOBinding] Failed to bind default outputs:', error);
            throw error;
        }
    }
    
    /**
     * Bind single output tensor
     */
    async bindOutputTensor(ioBinding, name, outputSpec) {
        try {
            if (outputSpec.preallocated) {
                // Use pre-allocated memory
                const tensor = await this.createOptimizedTensor(outputSpec);
                ioBinding.bindOutput(name, tensor);
            } else {
                // Let ONNX Runtime allocate output memory
                ioBinding.bindOutput(name);
            }
            
        } catch (error) {
            console.error(`[IOBinding] Failed to bind output tensor ${name}:`, error);
            throw error;
        }
    }
    
    /**
     * Create optimized tensor with shared memory
     */
    async createOptimizedTensor(tensorSpec) {
        try {
            const { data, dims, type = 'float32' } = tensorSpec;
            
            // Calculate tensor size
            const elementCount = dims.reduce((a, b) => a * b, 1);
            const bytesPerElement = this.getBytesPerElement(type);
            const totalBytes = elementCount * bytesPerElement;
            
            // Use shared memory for large tensors
            if (totalBytes > 1024 * 1024 && this.memoryPool) { // > 1MB
                const allocation = this.memoryPool.allocate(totalBytes, 16, 'tensor');
                
                // Copy data to shared memory
                const view = this.createTypedArrayView(allocation.view, type);
                if (data) {
                    view.set(data);
                }
                
                return new ort.Tensor(type, view, dims);
            } else {
                // Use regular memory for small tensors
                return new ort.Tensor(type, data, dims);
            }
            
        } catch (error) {
            console.error('[IOBinding] Failed to create optimized tensor:', error);
            throw error;
        }
    }
    
    /**
     * Create typed array view for specific data type
     */
    createTypedArrayView(buffer, type) {
        switch (type) {
            case 'float32':
                return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
            case 'float64':
                return new Float64Array(buffer.buffer, buffer.byteOffset, buffer.length / 8);
            case 'int32':
                return new Int32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
            case 'int64':
                return new BigInt64Array(buffer.buffer, buffer.byteOffset, buffer.length / 8);
            case 'uint8':
                return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
            case 'int8':
                return new Int8Array(buffer.buffer, buffer.byteOffset, buffer.length);
            default:
                return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
        }
    }
    
    /**
     * Get bytes per element for data type
     */
    getBytesPerElement(type) {
        switch (type) {
            case 'float32':
            case 'int32':
                return 4;
            case 'float64':
            case 'int64':
                return 8;
            case 'float16':
                return 2;
            case 'uint8':
            case 'int8':
                return 1;
            default:
                return 4;
        }
    }
    
    /**
     * Check if tensor supports zero-copy operations
     */
    supportsZeroCopy(tensor) {
        try {
            // Check if tensor data is in a format that supports zero-copy
            return tensor.data instanceof ArrayBuffer || 
                   ArrayBuffer.isView(tensor.data) ||
                   tensor.data instanceof SharedArrayBuffer;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Allocate device memory for tensor
     */
    async allocateDeviceMemory(tensor) {
        try {
            const size = tensor.data.byteLength || tensor.data.length * this.getBytesPerElement(tensor.type);
            
            // Use shared memory pool for device memory simulation
            const allocation = this.memoryPool.allocate(size, 16, 'device');
            
            return {
                allocation,
                size,
                type: 'device',
                tensor
            };
            
        } catch (error) {
            console.error('[IOBinding] Device memory allocation failed:', error);
            throw error;
        }
    }
    
    /**
     * Run inference with IO binding
     */
    async runWithBinding(bindingInfo, options = {}) {
        try {
            const startTime = Date.now();
            
            // Run inference with IO binding
            await bindingInfo.session.runWithIoBinding(bindingInfo.ioBinding);
            
            // Get outputs
            const outputs = {};
            for (const [name] of bindingInfo.outputBindings) {
                try {
                    outputs[name] = bindingInfo.ioBinding.getOutputBuffer(name);
                } catch (error) {
                    console.warn(`[IOBinding] Failed to get output ${name}:`, error);
                }
            }
            
            const inferenceTime = Date.now() - startTime;
            this.emit('inference-complete', { inferenceTime, outputCount: Object.keys(outputs).length });
            
            return outputs;
            
        } catch (error) {
            console.error('[IOBinding] Inference with binding failed:', error);
            throw error;
        }
    }
    
    /**
     * Generate cache key for binding
     */
    generateBindingKey(session, inputs, outputs) {
        const inputKeys = Object.keys(inputs).sort().join(',');
        const outputKeys = outputs ? Object.keys(outputs).sort().join(',') : 'default';
        return `${session.constructor.name}_${inputKeys}_${outputKeys}`;
    }
    
    /**
     * Cache binding with LRU eviction
     */
    cacheBinding(key, bindingInfo) {
        if (this.bindingCache.size >= this.options.maxCachedBindings) {
            // Remove oldest binding
            const oldestKey = this.bindingCache.keys().next().value;
            const oldBinding = this.bindingCache.get(oldestKey);
            this.disposeBinding(oldBinding);
            this.bindingCache.delete(oldestKey);
        }
        
        this.bindingCache.set(key, bindingInfo);
    }
    
    /**
     * Dispose of IO binding and free resources
     */
    disposeBinding(bindingInfo) {
        try {
            if (bindingInfo.ioBinding) {
                bindingInfo.ioBinding.dispose();
            }
            
            // Free device memory allocations
            for (const [name, allocation] of bindingInfo.memoryAllocations) {
                if (allocation.allocation) {
                    this.memoryPool.deallocate(allocation.allocation.offset);
                }
            }
            
            bindingInfo.memoryAllocations.clear();
            
        } catch (error) {
            console.error('[IOBinding] Failed to dispose binding:', error);
        }
    }
    
    /**
     * Get IO binding statistics
     */
    getStats() {
        return {
            ...this.stats,
            cachedBindings: this.bindingCache.size,
            deviceAllocations: this.deviceMemoryAllocations.size,
            memoryPoolStats: this.memoryPool.getStats()
        };
    }
    
    /**
     * Clear all cached bindings
     */
    clearCache() {
        for (const bindingInfo of this.bindingCache.values()) {
            this.disposeBinding(bindingInfo);
        }
        
        this.bindingCache.clear();
        this.deviceMemoryAllocations.clear();
        
        console.log('[IOBinding] Cache cleared');
    }
    
    /**
     * Dispose of the IO binding manager
     */
    dispose() {
        this.clearCache();
        this.removeAllListeners();
        
        console.log('[IOBinding] IO Binding Manager disposed');
    }
}

module.exports = IOBindingManager;
