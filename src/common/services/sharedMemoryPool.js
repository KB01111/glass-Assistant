/**
 * Shared Memory Pool System for inter-plugin resource sharing
 * Provides efficient memory allocation with alignment support and garbage collection
 */

const { CrossPlatformSharedBuffer, MemoryAlignment, MemoryBlock } = require('./sharedMemory');
const EventEmitter = require('events');

class SharedMemoryPool extends EventEmitter {
    constructor(totalSize = 2048 * 1024 * 1024) { // Default 2GB
        super();
        
        this.totalSize = totalSize;
        this.buffer = new CrossPlatformSharedBuffer(totalSize);
        this.allocatedBlocks = new Map(); // offset -> MemoryBlock
        this.freeBlocks = [{ offset: 0, size: totalSize }];
        this.allocationHistory = [];
        this.gcThreshold = 0.8; // Trigger GC when 80% full
        this.gcEnabled = true;
        
        // Statistics
        this.stats = {
            totalAllocations: 0,
            totalDeallocations: 0,
            currentAllocations: 0,
            bytesAllocated: 0,
            bytesWasted: 0,
            gcRuns: 0,
            fragmentationRatio: 0
        };
        
        this.initializePool();
    }
    
    initializePool() {
        console.log(`Initializing SharedMemoryPool: ${this.totalSize} bytes`);
        console.log(`Shared memory support: ${this.buffer.isSharedMemory()}`);
        
        // Set up periodic garbage collection
        if (this.gcEnabled) {
            this.gcInterval = setInterval(() => {
                this.runGarbageCollection();
            }, 30000); // Run GC every 30 seconds
        }
    }
    
    /**
     * Allocate memory block with specified alignment
     */
    allocate(size, alignment = 8, dataType = 'uint8') {
        if (size <= 0) {
            throw new Error('Allocation size must be positive');
        }
        
        // Get optimal alignment for data type
        const optimalAlignment = Math.max(alignment, MemoryAlignment.getOptimalAlignment(dataType));
        
        // Find suitable free block
        const blockIndex = this.findFreeBlock(size, optimalAlignment);
        if (blockIndex === -1) {
            // Try garbage collection first
            if (this.gcEnabled) {
                this.runGarbageCollection();
                const retryBlockIndex = this.findFreeBlock(size, optimalAlignment);
                if (retryBlockIndex !== -1) {
                    return this.performAllocation(retryBlockIndex, size, optimalAlignment);
                }
            }
            throw new Error(`Insufficient memory: requested ${size} bytes with ${optimalAlignment} alignment`);
        }
        
        return this.performAllocation(blockIndex, size, optimalAlignment);
    }
    
    performAllocation(blockIndex, size, alignment) {
        const freeBlock = this.freeBlocks[blockIndex];
        const alignedOffset = MemoryAlignment.alignOffset(freeBlock.offset, alignment);
        const padding = alignedOffset - freeBlock.offset;
        const totalSize = size + padding;
        
        if (totalSize > freeBlock.size) {
            throw new Error('Block too small after alignment');
        }
        
        // Create allocation record
        const allocation = new MemoryBlock(alignedOffset, size, alignment);
        this.allocatedBlocks.set(alignedOffset, allocation);
        
        // Update free blocks
        this.updateFreeBlocks(blockIndex, alignedOffset, size);
        
        // Update statistics
        this.updateAllocationStats(size, padding);
        
        // Create memory view
        const view = this.buffer.createView(alignedOffset, size);
        
        // Record allocation history
        this.allocationHistory.push({
            offset: alignedOffset,
            size,
            alignment,
            timestamp: Date.now()
        });
        
        this.emit('allocated', { offset: alignedOffset, size, alignment, view });
        
        return {
            offset: alignedOffset,
            size,
            view,
            alignment,
            block: allocation
        };
    }
    
    /**
     * Deallocate memory block
     */
    deallocate(offset) {
        const block = this.allocatedBlocks.get(offset);
        if (!block) {
            throw new Error(`No allocation found at offset ${offset}`);
        }
        
        // Remove from allocated blocks
        this.allocatedBlocks.delete(offset);
        
        // Add to free blocks
        this.addFreeBlock(offset, block.size);
        
        // Merge adjacent free blocks
        this.mergeFreeBlocks();
        
        // Update statistics
        this.updateDeallocationStats(block.size);
        
        this.emit('deallocated', { offset, size: block.size });
        
        return true;
    }
    
    findFreeBlock(size, alignment) {
        for (let i = 0; i < this.freeBlocks.length; i++) {
            const block = this.freeBlocks[i];
            const alignedOffset = MemoryAlignment.alignOffset(block.offset, alignment);
            const padding = alignedOffset - block.offset;
            const requiredSize = size + padding;
            
            if (requiredSize <= block.size) {
                return i;
            }
        }
        return -1;
    }
    
    updateFreeBlocks(blockIndex, allocatedOffset, allocatedSize) {
        const freeBlock = this.freeBlocks[blockIndex];
        const endOffset = allocatedOffset + allocatedSize;
        
        // Remove the used free block
        this.freeBlocks.splice(blockIndex, 1);
        
        // Add remaining free space before allocation (if any)
        if (allocatedOffset > freeBlock.offset) {
            this.freeBlocks.push({
                offset: freeBlock.offset,
                size: allocatedOffset - freeBlock.offset
            });
        }
        
        // Add remaining free space after allocation (if any)
        const remainingSize = freeBlock.size - (endOffset - freeBlock.offset);
        if (remainingSize > 0) {
            this.freeBlocks.push({
                offset: endOffset,
                size: remainingSize
            });
        }
        
        // Sort free blocks by offset
        this.freeBlocks.sort((a, b) => a.offset - b.offset);
    }
    
    addFreeBlock(offset, size) {
        this.freeBlocks.push({ offset, size });
        this.freeBlocks.sort((a, b) => a.offset - b.offset);
    }
    
    mergeFreeBlocks() {
        const merged = [];
        let current = null;
        
        for (const block of this.freeBlocks) {
            if (!current) {
                current = { ...block };
            } else if (current.offset + current.size === block.offset) {
                // Merge adjacent blocks
                current.size += block.size;
            } else {
                merged.push(current);
                current = { ...block };
            }
        }
        
        if (current) {
            merged.push(current);
        }
        
        this.freeBlocks = merged;
    }
    
    updateAllocationStats(size, padding) {
        this.stats.totalAllocations++;
        this.stats.currentAllocations++;
        this.stats.bytesAllocated += size;
        this.stats.bytesWasted += padding;
        this.updateFragmentationRatio();
    }
    
    updateDeallocationStats(size) {
        this.stats.totalDeallocations++;
        this.stats.currentAllocations--;
        this.stats.bytesAllocated -= size;
        this.updateFragmentationRatio();
    }
    
    updateFragmentationRatio() {
        const totalFreeSpace = this.freeBlocks.reduce((sum, block) => sum + block.size, 0);
        const largestFreeBlock = Math.max(...this.freeBlocks.map(block => block.size), 0);
        this.stats.fragmentationRatio = totalFreeSpace > 0 ? 1 - (largestFreeBlock / totalFreeSpace) : 0;
    }
    
    /**
     * Get memory pool statistics
     */
    getStats() {
        return {
            ...this.stats,
            totalSize: this.totalSize,
            usedBytes: this.stats.bytesAllocated,
            freeBytes: this.totalSize - this.stats.bytesAllocated,
            utilizationRatio: this.stats.bytesAllocated / this.totalSize,
            freeBlockCount: this.freeBlocks.length,
            allocatedBlockCount: this.allocatedBlocks.size
        };
    }
    
    /**
     * Check if garbage collection should run
     */
    shouldRunGC() {
        const utilization = this.stats.bytesAllocated / this.totalSize;
        return utilization > this.gcThreshold || this.stats.fragmentationRatio > 0.5;
    }

    /**
     * Run garbage collection to optimize memory layout
     */
    runGarbageCollection() {
        if (!this.shouldRunGC()) {
            return false;
        }

        const startTime = Date.now();
        const initialFragmentation = this.stats.fragmentationRatio;

        console.log('Running garbage collection...');

        // Strategy 1: Merge free blocks (already done in mergeFreeBlocks)
        this.mergeFreeBlocks();

        // Strategy 2: Compact memory if fragmentation is high
        if (this.stats.fragmentationRatio > 0.7) {
            this.compactMemory();
        }

        // Strategy 3: Clean up old allocation history
        this.cleanupAllocationHistory();

        // Update statistics
        this.stats.gcRuns++;
        const gcTime = Date.now() - startTime;
        const fragmentationImprovement = initialFragmentation - this.stats.fragmentationRatio;

        console.log(`GC completed in ${gcTime}ms, fragmentation improved by ${(fragmentationImprovement * 100).toFixed(2)}%`);

        this.emit('gc-completed', {
            duration: gcTime,
            fragmentationImprovement,
            initialFragmentation,
            finalFragmentation: this.stats.fragmentationRatio
        });

        return true;
    }

    /**
     * Compact memory by moving allocations to reduce fragmentation
     */
    compactMemory() {
        const allocations = Array.from(this.allocatedBlocks.entries())
            .map(([offset, block]) => ({ offset, block }))
            .sort((a, b) => a.offset - b.offset);

        if (allocations.length === 0) return;

        let newOffset = 0;
        const relocations = [];

        // Calculate new positions for all allocations
        for (const { offset, block } of allocations) {
            const alignedOffset = MemoryAlignment.alignOffset(newOffset, block.alignment);

            if (alignedOffset !== offset) {
                relocations.push({
                    oldOffset: offset,
                    newOffset: alignedOffset,
                    size: block.size,
                    block
                });
            }

            newOffset = alignedOffset + block.size;
        }

        // Perform relocations
        for (const relocation of relocations) {
            this.relocateBlock(relocation);
        }

        // Update free blocks after compaction
        this.rebuildFreeBlocks(newOffset);

        console.log(`Compacted ${relocations.length} blocks, freed ${this.totalSize - newOffset} bytes`);
    }

    /**
     * Relocate a memory block to a new position
     */
    relocateBlock({ oldOffset, newOffset, size, block }) {
        // Copy data from old location to new location
        const oldView = this.buffer.createView(oldOffset, size);
        const newView = this.buffer.createView(newOffset, size);

        // Copy the data
        newView.set(oldView);

        // Update allocation tracking
        this.allocatedBlocks.delete(oldOffset);
        block.offset = newOffset;
        this.allocatedBlocks.set(newOffset, block);

        this.emit('block-relocated', { oldOffset, newOffset, size });
    }

    /**
     * Rebuild free blocks list after compaction
     */
    rebuildFreeBlocks(usedSize) {
        this.freeBlocks = [];

        if (usedSize < this.totalSize) {
            this.freeBlocks.push({
                offset: usedSize,
                size: this.totalSize - usedSize
            });
        }

        this.updateFragmentationRatio();
    }

    /**
     * Clean up old allocation history to prevent memory leaks
     */
    cleanupAllocationHistory() {
        const maxHistoryAge = 24 * 60 * 60 * 1000; // 24 hours
        const cutoffTime = Date.now() - maxHistoryAge;

        const initialLength = this.allocationHistory.length;
        this.allocationHistory = this.allocationHistory.filter(
            entry => entry.timestamp > cutoffTime
        );

        const cleaned = initialLength - this.allocationHistory.length;
        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} old allocation history entries`);
        }
    }

    /**
     * Configure garbage collection settings
     */
    configureGC(options = {}) {
        if (options.threshold !== undefined) {
            this.gcThreshold = Math.max(0.1, Math.min(0.95, options.threshold));
        }

        if (options.enabled !== undefined) {
            this.gcEnabled = options.enabled;

            if (this.gcEnabled && !this.gcInterval) {
                this.gcInterval = setInterval(() => {
                    this.runGarbageCollection();
                }, options.interval || 30000);
            } else if (!this.gcEnabled && this.gcInterval) {
                clearInterval(this.gcInterval);
                this.gcInterval = null;
            }
        }

        if (options.interval !== undefined && this.gcInterval) {
            clearInterval(this.gcInterval);
            this.gcInterval = setInterval(() => {
                this.runGarbageCollection();
            }, options.interval);
        }
    }

    /**
     * Force garbage collection run
     */
    forceGC() {
        return this.runGarbageCollection();
    }
    
    /**
     * Get buffer reference for direct access
     */
    getBuffer() {
        return this.buffer.getBuffer();
    }
    
    /**
     * Create a view of allocated memory
     */
    createView(offset, size, type = 'Uint8Array') {
        const block = this.allocatedBlocks.get(offset);
        if (!block) {
            throw new Error(`No allocation found at offset ${offset}`);
        }
        
        if (size > block.size) {
            throw new Error(`View size ${size} exceeds allocated size ${block.size}`);
        }
        
        block.updateAccess();
        return this.buffer.createView(offset, size, type);
    }
    
    /**
     * Dispose of the memory pool
     */
    dispose() {
        if (this.gcInterval) {
            clearInterval(this.gcInterval);
        }
        
        this.allocatedBlocks.clear();
        this.freeBlocks = [];
        this.buffer.dispose();
        
        this.emit('disposed');
    }
}

module.exports = SharedMemoryPool;
