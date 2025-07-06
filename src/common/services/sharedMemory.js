/**
 * Cross-platform SharedArrayBuffer implementation with fallback support
 * Provides shared memory capabilities for inter-plugin resource sharing
 */

class CrossPlatformSharedBuffer {
    constructor(size) {
        this.size = size;
        this.isShared = false;
        this.buffer = null;
        this.views = new Map();
        
        this.initializeBuffer();
    }
    
    initializeBuffer() {
        try {
            // Try to use SharedArrayBuffer if available
            if (typeof SharedArrayBuffer !== 'undefined' && this.isSharedArrayBufferSupported()) {
                this.buffer = new SharedArrayBuffer(this.size);
                this.isShared = true;
                console.log(`Created SharedArrayBuffer of size ${this.size} bytes`);
            } else {
                // Fallback to regular ArrayBuffer
                this.buffer = new ArrayBuffer(this.size);
                this.isShared = false;
                console.warn(`SharedArrayBuffer not available, using ArrayBuffer fallback`);
            }
        } catch (error) {
            console.error('Failed to create shared buffer:', error);
            // Final fallback to regular ArrayBuffer
            this.buffer = new ArrayBuffer(this.size);
            this.isShared = false;
        }
    }
    
    isSharedArrayBufferSupported() {
        try {
            // Check if SharedArrayBuffer is available and functional
            const testBuffer = new SharedArrayBuffer(8);
            return testBuffer instanceof SharedArrayBuffer;
        } catch (error) {
            return false;
        }
    }
    
    createView(offset, length, type = 'Uint8Array') {
        if (offset + length > this.size) {
            throw new Error(`View exceeds buffer bounds: ${offset + length} > ${this.size}`);
        }
        
        const viewKey = `${type}_${offset}_${length}`;
        
        if (this.views.has(viewKey)) {
            return this.views.get(viewKey);
        }
        
        let view;
        switch (type) {
            case 'Uint8Array':
                view = new Uint8Array(this.buffer, offset, length);
                break;
            case 'Uint16Array':
                view = new Uint16Array(this.buffer, offset, length / 2);
                break;
            case 'Uint32Array':
                view = new Uint32Array(this.buffer, offset, length / 4);
                break;
            case 'Float32Array':
                view = new Float32Array(this.buffer, offset, length / 4);
                break;
            case 'Float64Array':
                view = new Float64Array(this.buffer, offset, length / 8);
                break;
            default:
                throw new Error(`Unsupported view type: ${type}`);
        }
        
        this.views.set(viewKey, view);
        return view;
    }
    
    getBuffer() {
        return this.buffer;
    }
    
    getSize() {
        return this.size;
    }
    
    isSharedMemory() {
        return this.isShared;
    }
    
    dispose() {
        this.views.clear();
        this.buffer = null;
    }
}

/**
 * Memory alignment utilities for optimal hardware access
 */
class MemoryAlignment {
    static alignOffset(offset, alignment) {
        return Math.ceil(offset / alignment) * alignment;
    }

    static calculatePadding(offset, alignment) {
        const aligned = this.alignOffset(offset, alignment);
        return aligned - offset;
    }

    static getOptimalAlignment(dataType) {
        switch (dataType) {
            case 'int8':
            case 'uint8':
                return 1;
            case 'int16':
            case 'uint16':
                return 2;
            case 'int32':
            case 'uint32':
            case 'float32':
                return 4;
            case 'int64':
            case 'uint64':
            case 'float64':
                return 8;
            case 'tensor':
                return 16; // Optimal for NPU/GPU operations
            case 'embedding':
                return 32; // Optimal for embedding vectors
            default:
                return 8; // Safe default
        }
    }

    /**
     * Get cache line alignment for optimal CPU cache performance
     */
    static getCacheLineAlignment() {
        return 64; // Most modern CPUs use 64-byte cache lines
    }

    /**
     * Get NPU-optimal alignment for AMD Gaia
     */
    static getNPUAlignment() {
        return 128; // Optimal for NPU memory access patterns
    }

    /**
     * Calculate optimal alignment based on hardware capabilities
     */
    static getHardwareOptimalAlignment(hardwareType = 'cpu') {
        switch (hardwareType) {
            case 'npu':
                return this.getNPUAlignment();
            case 'gpu':
                return 256; // GPU memory alignment
            case 'cpu':
            default:
                return this.getCacheLineAlignment();
        }
    }

    /**
     * Align memory layout for optimal SIMD operations
     */
    static alignForSIMD(size, dataType) {
        const baseAlignment = this.getOptimalAlignment(dataType);
        const simdAlignment = 32; // AVX2 alignment
        return Math.max(baseAlignment, simdAlignment);
    }

    /**
     * Calculate memory layout with padding for array of elements
     */
    static calculateArrayLayout(elementCount, elementSize, alignment) {
        const alignedElementSize = this.alignOffset(elementSize, alignment);
        const totalSize = alignedElementSize * elementCount;
        const padding = alignedElementSize - elementSize;

        return {
            elementSize: alignedElementSize,
            totalSize,
            padding,
            wastedSpace: padding * elementCount
        };
    }

    /**
     * Optimize memory layout for multiple data types
     */
    static optimizeMultiTypeLayout(dataTypes) {
        // Sort by alignment requirements (largest first)
        const sorted = dataTypes.sort((a, b) =>
            this.getOptimalAlignment(b.type) - this.getOptimalAlignment(a.type)
        );

        let offset = 0;
        const layout = [];

        for (const data of sorted) {
            const alignment = this.getOptimalAlignment(data.type);
            const alignedOffset = this.alignOffset(offset, alignment);
            const padding = alignedOffset - offset;

            layout.push({
                ...data,
                offset: alignedOffset,
                padding,
                alignment
            });

            offset = alignedOffset + data.size;
        }

        return {
            layout,
            totalSize: offset,
            totalPadding: layout.reduce((sum, item) => sum + item.padding, 0)
        };
    }
}

/**
 * Memory block descriptor for tracking allocations
 */
class MemoryBlock {
    constructor(offset, size, alignment, timestamp = Date.now()) {
        this.offset = offset;
        this.size = size;
        this.alignment = alignment;
        this.timestamp = timestamp;
        this.lastAccessed = timestamp;
        this.accessCount = 0;
        this.isAllocated = true;
    }
    
    updateAccess() {
        this.lastAccessed = Date.now();
        this.accessCount++;
    }
    
    getAge() {
        return Date.now() - this.timestamp;
    }
    
    getIdleTime() {
        return Date.now() - this.lastAccessed;
    }
}

module.exports = {
    CrossPlatformSharedBuffer,
    MemoryAlignment,
    MemoryBlock
};
