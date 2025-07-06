/**
 * Resource Sharing Manager for inter-plugin resource sharing
 * Implements copy-on-write semantics, access control, and usage metrics
 */

const EventEmitter = require('events');
const SharedMemoryPool = require('./sharedMemoryPool');

class SharedResource {
    constructor(id, data, policy, memoryPool) {
        this.id = id;
        this.originalData = data;
        this.policy = policy;
        this.memoryPool = memoryPool;
        this.refCount = 0;
        this.accessCount = 0;
        this.lastAccessed = Date.now();
        this.created = Date.now();
        this.copies = new Map(); // pluginId -> copy data
        this.accessLog = [];
        this.isReadOnly = policy.readOnly || false;
        this.maxRefs = policy.maxRefs || Infinity;
        this.ttl = policy.ttl || null;
        
        // Allocate shared memory if data is large
        if (this.shouldUseSharedMemory(data)) {
            this.allocateSharedMemory(data);
        }
    }
    
    shouldUseSharedMemory(data) {
        // Use shared memory for large data (>1MB) or specific types
        if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
            return data.byteLength > 1024 * 1024;
        }
        if (data instanceof Float32Array || data instanceof Float64Array) {
            return data.byteLength > 1024 * 1024;
        }
        return false;
    }
    
    allocateSharedMemory(data) {
        try {
            const size = data.byteLength || Buffer.byteLength(JSON.stringify(data));
            this.sharedAllocation = this.memoryPool.allocate(size, 16, 'tensor');
            
            // Copy data to shared memory
            if (data instanceof ArrayBuffer) {
                const view = new Uint8Array(data);
                this.sharedAllocation.view.set(view);
            } else if (ArrayBuffer.isView(data)) {
                const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                this.sharedAllocation.view.set(bytes);
            }
            
            this.isInSharedMemory = true;
        } catch (error) {
            console.warn('Failed to allocate shared memory, using regular memory:', error);
            this.isInSharedMemory = false;
        }
    }
    
    getData(pluginId, accessType = 'read') {
        this.updateAccess(pluginId, accessType);
        
        if (accessType === 'read' || this.isReadOnly) {
            return this.getReadOnlyData();
        } else if (accessType === 'write') {
            return this.getWritableData(pluginId);
        }
        
        throw new Error(`Invalid access type: ${accessType}`);
    }
    
    getReadOnlyData() {
        if (this.isInSharedMemory) {
            return this.sharedAllocation.view;
        }
        return this.originalData;
    }
    
    getWritableData(pluginId) {
        if (this.isReadOnly) {
            throw new Error('Resource is read-only');
        }
        
        // Implement copy-on-write
        if (!this.copies.has(pluginId)) {
            this.copies.set(pluginId, this.createCopy());
        }
        
        return this.copies.get(pluginId);
    }
    
    createCopy() {
        if (this.isInSharedMemory) {
            // Create a copy of shared memory data
            const copy = new ArrayBuffer(this.sharedAllocation.size);
            const copyView = new Uint8Array(copy);
            copyView.set(this.sharedAllocation.view);
            return copy;
        }
        
        // Deep copy for regular objects
        if (typeof this.originalData === 'object') {
            return JSON.parse(JSON.stringify(this.originalData));
        }
        
        return this.originalData;
    }
    
    updateAccess(pluginId, accessType) {
        this.accessCount++;
        this.lastAccessed = Date.now();
        
        this.accessLog.push({
            pluginId,
            accessType,
            timestamp: Date.now()
        });
        
        // Keep only recent access log entries
        if (this.accessLog.length > 1000) {
            this.accessLog = this.accessLog.slice(-500);
        }
    }
    
    addRef(pluginId) {
        if (this.refCount >= this.maxRefs) {
            throw new Error(`Maximum reference count (${this.maxRefs}) exceeded`);
        }
        
        this.refCount++;
        return this.refCount;
    }
    
    removeRef(pluginId) {
        this.refCount = Math.max(0, this.refCount - 1);
        
        // Clean up plugin-specific copy
        if (this.copies.has(pluginId)) {
            this.copies.delete(pluginId);
        }
        
        return this.refCount;
    }
    
    isExpired() {
        if (!this.ttl) return false;
        return Date.now() - this.created > this.ttl;
    }
    
    getStats() {
        return {
            id: this.id,
            refCount: this.refCount,
            accessCount: this.accessCount,
            lastAccessed: this.lastAccessed,
            created: this.created,
            age: Date.now() - this.created,
            idleTime: Date.now() - this.lastAccessed,
            copyCount: this.copies.size,
            isInSharedMemory: this.isInSharedMemory,
            memoryUsage: this.getMemoryUsage(),
            isExpired: this.isExpired()
        };
    }
    
    getMemoryUsage() {
        let usage = 0;
        
        if (this.isInSharedMemory) {
            usage += this.sharedAllocation.size;
        } else {
            usage += this.estimateObjectSize(this.originalData);
        }
        
        // Add copy memory usage
        for (const copy of this.copies.values()) {
            usage += this.estimateObjectSize(copy);
        }
        
        return usage;
    }
    
    estimateObjectSize(obj) {
        if (obj instanceof ArrayBuffer) return obj.byteLength;
        if (ArrayBuffer.isView(obj)) return obj.byteLength;
        if (typeof obj === 'string') return obj.length * 2; // UTF-16
        if (typeof obj === 'object') {
            return Buffer.byteLength(JSON.stringify(obj));
        }
        return 8; // Primitive types
    }
    
    dispose() {
        if (this.isInSharedMemory && this.sharedAllocation) {
            this.memoryPool.deallocate(this.sharedAllocation.offset);
        }
        
        this.copies.clear();
        this.accessLog = [];
    }
}

class ResourceSharingManager extends EventEmitter {
    constructor(memoryPool) {
        super();
        
        this.memoryPool = memoryPool || new SharedMemoryPool();
        this.resources = new Map(); // resourceId -> SharedResource
        this.pluginResources = new Map(); // pluginId -> Set<resourceId>
        this.accessPolicies = new Map(); // policyName -> policy
        this.usageMetrics = {
            totalResources: 0,
            totalAccesses: 0,
            totalMemoryUsage: 0,
            averageRefCount: 0
        };
        
        this.setupDefaultPolicies();
        this.startCleanupTimer();
    }
    
    setupDefaultPolicies() {
        this.accessPolicies.set('read-only', {
            readOnly: true,
            maxRefs: Infinity,
            ttl: null,
            allowedPlugins: null
        });
        
        this.accessPolicies.set('shared-write', {
            readOnly: false,
            maxRefs: 10,
            ttl: 60 * 60 * 1000, // 1 hour
            allowedPlugins: null
        });
        
        this.accessPolicies.set('exclusive', {
            readOnly: false,
            maxRefs: 1,
            ttl: 30 * 60 * 1000, // 30 minutes
            allowedPlugins: null
        });
        
        this.accessPolicies.set('embedding-cache', {
            readOnly: true,
            maxRefs: Infinity,
            ttl: 24 * 60 * 60 * 1000, // 24 hours
            allowedPlugins: null
        });
    }
    
    /**
     * Share a resource with specified policy
     */
    shareResource(resourceId, data, policyName = 'shared-write', pluginId) {
        if (this.resources.has(resourceId)) {
            throw new Error(`Resource ${resourceId} already exists`);
        }
        
        const policy = this.accessPolicies.get(policyName);
        if (!policy) {
            throw new Error(`Unknown policy: ${policyName}`);
        }
        
        // Check if plugin is allowed to share this resource
        if (policy.allowedPlugins && !policy.allowedPlugins.includes(pluginId)) {
            throw new Error(`Plugin ${pluginId} not allowed to share with policy ${policyName}`);
        }
        
        const resource = new SharedResource(resourceId, data, policy, this.memoryPool);
        this.resources.set(resourceId, resource);
        
        // Track plugin resources
        if (!this.pluginResources.has(pluginId)) {
            this.pluginResources.set(pluginId, new Set());
        }
        this.pluginResources.get(pluginId).add(resourceId);
        
        this.updateMetrics();
        this.emit('resource-shared', { resourceId, pluginId, policy: policyName });
        
        return resourceId;
    }
    
    /**
     * Access a shared resource
     */
    accessResource(resourceId, pluginId, accessType = 'read') {
        const resource = this.resources.get(resourceId);
        if (!resource) {
            throw new Error(`Resource ${resourceId} not found`);
        }
        
        if (resource.isExpired()) {
            this.removeResource(resourceId);
            throw new Error(`Resource ${resourceId} has expired`);
        }
        
        // Check access permissions
        if (resource.policy.allowedPlugins && !resource.policy.allowedPlugins.includes(pluginId)) {
            throw new Error(`Plugin ${pluginId} not allowed to access resource ${resourceId}`);
        }
        
        // Add reference
        resource.addRef(pluginId);
        
        // Track plugin access
        if (!this.pluginResources.has(pluginId)) {
            this.pluginResources.set(pluginId, new Set());
        }
        this.pluginResources.get(pluginId).add(resourceId);
        
        const data = resource.getData(pluginId, accessType);
        
        this.updateMetrics();
        this.emit('resource-accessed', { resourceId, pluginId, accessType });
        
        return data;
    }
    
    /**
     * Release a resource reference
     */
    releaseResource(resourceId, pluginId) {
        const resource = this.resources.get(resourceId);
        if (!resource) {
            return false;
        }
        
        const refCount = resource.removeRef(pluginId);
        
        // Remove from plugin tracking
        if (this.pluginResources.has(pluginId)) {
            this.pluginResources.get(pluginId).delete(resourceId);
        }
        
        // Remove resource if no more references
        if (refCount === 0) {
            this.removeResource(resourceId);
        }
        
        this.updateMetrics();
        this.emit('resource-released', { resourceId, pluginId, refCount });
        
        return true;
    }
    
    removeResource(resourceId) {
        const resource = this.resources.get(resourceId);
        if (resource) {
            resource.dispose();
            this.resources.delete(resourceId);
            
            // Remove from all plugin tracking
            for (const pluginSet of this.pluginResources.values()) {
                pluginSet.delete(resourceId);
            }
            
            this.emit('resource-removed', { resourceId });
        }
    }
    
    updateMetrics() {
        this.usageMetrics.totalResources = this.resources.size;
        this.usageMetrics.totalAccesses = Array.from(this.resources.values())
            .reduce((sum, resource) => sum + resource.accessCount, 0);
        this.usageMetrics.totalMemoryUsage = Array.from(this.resources.values())
            .reduce((sum, resource) => sum + resource.getMemoryUsage(), 0);
        this.usageMetrics.averageRefCount = this.resources.size > 0 
            ? Array.from(this.resources.values()).reduce((sum, resource) => sum + resource.refCount, 0) / this.resources.size
            : 0;
    }
    
    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredResources();
        }, 60000); // Check every minute
    }
    
    cleanupExpiredResources() {
        const expired = [];
        
        for (const [resourceId, resource] of this.resources) {
            if (resource.isExpired() || resource.refCount === 0) {
                expired.push(resourceId);
            }
        }
        
        for (const resourceId of expired) {
            this.removeResource(resourceId);
        }
        
        if (expired.length > 0) {
            console.log(`Cleaned up ${expired.length} expired resources`);
        }
    }
    
    getResourceStats(resourceId) {
        const resource = this.resources.get(resourceId);
        return resource ? resource.getStats() : null;
    }
    
    getAllResourceStats() {
        const stats = [];
        for (const [resourceId, resource] of this.resources) {
            stats.push(resource.getStats());
        }
        return stats;
    }
    
    getUsageMetrics() {
        this.updateMetrics();
        return { ...this.usageMetrics };
    }
    
    dispose() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Dispose all resources
        for (const resource of this.resources.values()) {
            resource.dispose();
        }
        
        this.resources.clear();
        this.pluginResources.clear();
        
        this.emit('disposed');
    }
}

module.exports = { ResourceSharingManager, SharedResource };
