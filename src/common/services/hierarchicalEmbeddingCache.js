/**
 * Hierarchical Embedding Cache
 * Implements L1 (memory), L2 (SSD), and L3 (network) caching layers with LRU eviction
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class L1MemoryCache extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            maxSize: 1000,
            maxMemoryMB: 512,
            ttl: 3600000, // 1 hour
            enableCompression: false,
            enableHashIndex: true,
            cleanupInterval: 300000, // 5 minutes
            memoryPressureThreshold: 0.8, // 80% of max memory
            ...options
        };

        this.cache = new Map();
        this.accessOrder = new Map(); // For LRU tracking
        this.hashIndex = new Map(); // Hash -> key mapping for fast lookup
        this.sizeIndex = new Map(); // Size-based index for memory management
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            memoryUsage: 0,
            compressionRatio: 1.0,
            averageAccessTime: 0,
            totalAccessTime: 0,
            accessCount: 0
        };

        this.cleanupTimer = null;
        this.startCleanupTimer();
    }
    
    generateKey(documentId, chunkId) {
        return `${documentId}:${chunkId}`;
    }
    
    async get(documentId, chunkId) {
        const startTime = Date.now();
        const key = this.generateKey(documentId, chunkId);

        if (this.cache.has(key)) {
            const entry = this.cache.get(key);

            // Check TTL
            if (Date.now() - entry.timestamp > this.options.ttl) {
                this.removeEntry(key);
                this.stats.misses++;
                this.updateAccessStats(startTime);
                return null;
            }

            // Update access order for LRU
            this.accessOrder.set(key, Date.now());
            this.stats.hits++;

            // Update access statistics
            this.updateAccessStats(startTime);

            this.emit('cache-hit', { key, layer: 'L1', accessTime: Date.now() - startTime });

            // Decompress if needed
            return this.options.enableCompression ? this.decompress(entry.embedding) : entry.embedding;
        }

        this.stats.misses++;
        this.updateAccessStats(startTime);
        this.emit('cache-miss', { key, layer: 'L1' });
        return null;
    }

    /**
     * Get multiple embeddings at once
     */
    async getBatch(requests) {
        const results = [];
        const startTime = Date.now();

        for (const { documentId, chunkId } of requests) {
            const embedding = await this.get(documentId, chunkId);
            results.push({
                documentId,
                chunkId,
                embedding,
                found: embedding !== null
            });
        }

        this.emit('batch-get', {
            count: requests.length,
            hits: results.filter(r => r.found).length,
            totalTime: Date.now() - startTime
        });

        return results;
    }
    
    async set(documentId, chunkId, embedding, metadata = {}) {
        const key = this.generateKey(documentId, chunkId);

        // Check memory pressure before adding
        if (this.isMemoryPressureHigh()) {
            await this.evictByMemoryPressure();
        }

        // Check if we need to evict by size
        if (this.cache.size >= this.options.maxSize) {
            this.evictLRU();
        }

        // Compress embedding if enabled
        const processedEmbedding = this.options.enableCompression ?
            this.compress(embedding) : embedding;

        const entry = {
            embedding: processedEmbedding,
            metadata,
            timestamp: Date.now(),
            size: this.estimateEmbeddingSize(processedEmbedding),
            originalSize: this.estimateEmbeddingSize(embedding),
            compressed: this.options.enableCompression
        };

        // Remove existing entry if present
        if (this.cache.has(key)) {
            this.removeEntry(key);
        }

        this.cache.set(key, entry);
        this.accessOrder.set(key, Date.now());

        // Update indexes
        if (this.options.enableHashIndex) {
            const hash = this.generateEmbeddingHash(embedding);
            this.hashIndex.set(hash, key);
        }

        this.sizeIndex.set(key, entry.size);
        this.updateMemoryUsage();

        this.emit('cache-set', {
            key,
            layer: 'L1',
            size: entry.size,
            compressed: entry.compressed,
            compressionRatio: entry.compressed ? entry.originalSize / entry.size : 1.0
        });

        return true;
    }

    /**
     * Set multiple embeddings at once
     */
    async setBatch(entries) {
        const results = [];
        const startTime = Date.now();

        for (const { documentId, chunkId, embedding, metadata } of entries) {
            const success = await this.set(documentId, chunkId, embedding, metadata);
            results.push({ documentId, chunkId, success });
        }

        this.emit('batch-set', {
            count: entries.length,
            successful: results.filter(r => r.success).length,
            totalTime: Date.now() - startTime
        });

        return results;
    }
    
    evictLRU() {
        if (this.accessOrder.size === 0) return;
        
        // Find least recently used key
        let oldestKey = null;
        let oldestTime = Date.now();
        
        for (const [key, accessTime] of this.accessOrder) {
            if (accessTime < oldestTime) {
                oldestTime = accessTime;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.accessOrder.delete(oldestKey);
            this.stats.evictions++;
            
            this.emit('cache-evicted', { key: oldestKey, layer: 'L1' });
        }
    }
    
    estimateEmbeddingSize(embedding) {
        if (embedding instanceof Float32Array) {
            return embedding.length * 4; // 4 bytes per float32
        } else if (Array.isArray(embedding)) {
            return embedding.length * 4; // Assume float32
        }
        return 1024; // Default estimate
    }
    
    updateMemoryUsage() {
        let totalSize = 0;
        for (const entry of this.cache.values()) {
            totalSize += entry.size;
        }
        this.stats.memoryUsage = totalSize;
    }
    
    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpired();
        }, 60000); // Check every minute
    }
    
    cleanupExpired() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, entry] of this.cache) {
            if (now - entry.timestamp > this.options.ttl) {
                expiredKeys.push(key);
            }
        }
        
        for (const key of expiredKeys) {
            this.cache.delete(key);
            this.accessOrder.delete(key);
        }
        
        if (expiredKeys.length > 0) {
            this.updateMemoryUsage();
            this.emit('cache-cleanup', { expiredCount: expiredKeys.length, layer: 'L1' });
        }
    }

    /**
     * Remove entry and update indexes
     */
    removeEntry(key) {
        const entry = this.cache.get(key);
        if (entry) {
            this.cache.delete(key);
            this.accessOrder.delete(key);
            this.sizeIndex.delete(key);

            // Remove from hash index
            if (this.options.enableHashIndex) {
                for (const [hash, indexKey] of this.hashIndex) {
                    if (indexKey === key) {
                        this.hashIndex.delete(hash);
                        break;
                    }
                }
            }
        }
    }

    /**
     * Check if memory pressure is high
     */
    isMemoryPressureHigh() {
        const maxMemoryBytes = this.options.maxMemoryMB * 1024 * 1024;
        return this.stats.memoryUsage > (maxMemoryBytes * this.options.memoryPressureThreshold);
    }

    /**
     * Update access statistics
     */
    updateAccessStats(startTime) {
        const accessTime = Date.now() - startTime;
        this.stats.totalAccessTime += accessTime;
        this.stats.accessCount++;
        this.stats.averageAccessTime = this.stats.totalAccessTime / this.stats.accessCount;
    }

    /**
     * Generate hash for embedding (for duplicate detection)
     */
    generateEmbeddingHash(embedding) {
        const crypto = require('crypto');
        const embeddingStr = Array.isArray(embedding) ?
            embedding.join(',') : JSON.stringify(embedding);
        return crypto.createHash('md5').update(embeddingStr).digest('hex');
    }

    /**
     * Compress embedding data
     */
    compress(embedding) {
        if (!this.options.enableCompression) return embedding;

        try {
            const zlib = require('zlib');
            const data = JSON.stringify(embedding);
            return zlib.deflateSync(data);
        } catch (error) {
            console.warn('[L1 Cache] Compression failed:', error);
            return embedding;
        }
    }

    /**
     * Decompress embedding data
     */
    decompress(compressedEmbedding) {
        if (!this.options.enableCompression) return compressedEmbedding;

        try {
            const zlib = require('zlib');
            const decompressed = zlib.inflateSync(compressedEmbedding);
            return JSON.parse(decompressed.toString());
        } catch (error) {
            console.warn('[L1 Cache] Decompression failed:', error);
            return compressedEmbedding;
        }
    }

    getStats() {
        const hitRate = this.stats.accessCount > 0 ?
            (this.stats.hits / this.stats.accessCount) * 100 : 0;

        const memoryEfficiency = this.options.maxMemoryMB > 0 ?
            (this.stats.memoryUsage / (this.options.maxMemoryMB * 1024 * 1024)) * 100 : 0;

        return {
            ...this.stats,
            hitRate: hitRate.toFixed(2) + '%',
            memoryEfficiency: memoryEfficiency.toFixed(2) + '%',
            cacheSize: this.cache.size,
            maxSize: this.options.maxSize,
            averageEntrySize: this.cache.size > 0 ?
                this.stats.memoryUsage / this.cache.size : 0,
            compressionEnabled: this.options.enableCompression,
            hashIndexEnabled: this.options.enableHashIndex
        };
    }
    
    clear() {
        this.cache.clear();
        this.accessOrder.clear();
        this.stats.memoryUsage = 0;
    }
    
    dispose() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.clear();
        this.removeAllListeners();
    }
}

class L2SSDCache extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            dbPath: './cache/embeddings.db',
            maxSizeMB: 10240, // 10GB
            compressionEnabled: true,
            enableVectorSearch: true,
            vectorDimensions: 384, // Default embedding dimension
            indexType: 'IVF_FLAT', // Vector index type
            nprobes: 10, // Number of probes for search
            batchSize: 1000, // Batch size for bulk operations
            ...options
        };

        this.stats = {
            hits: 0,
            misses: 0,
            writes: 0,
            reads: 0,
            compressionRatio: 0,
            vectorSearches: 0,
            indexBuilds: 0,
            totalSize: 0
        };

        this.db = null;
        this.table = null;
        this.isInitialized = false;
        this.writeQueue = [];
        this.isProcessingQueue = false;

        this.initializeDatabase();
    }
    
    async initializeDatabase() {
        try {
            console.log('[L2 Cache] Initializing LanceDB for vector storage...');

            // Initialize LanceDB for vector storage
            const lancedb = require('lancedb');
            this.db = await lancedb.connect(this.options.dbPath);

            // Create table if it doesn't exist
            try {
                this.table = await this.db.openTable('embeddings');
                console.log('[L2 Cache] Opened existing embeddings table');
            } catch (error) {
                // Table doesn't exist, create it
                console.log('[L2 Cache] Creating new embeddings table...');

                const schema = {
                    id: 'string',
                    document_id: 'string',
                    chunk_id: 'string',
                    embedding: `vector(${this.options.vectorDimensions})`,
                    metadata: 'string',
                    timestamp: 'int64',
                    size: 'int32',
                    hash: 'string'
                };

                // Create table with sample data to establish schema
                const sampleData = [{
                    id: 'sample',
                    document_id: 'sample_doc',
                    chunk_id: 'sample_chunk',
                    embedding: new Array(this.options.vectorDimensions).fill(0),
                    metadata: '{}',
                    timestamp: Date.now(),
                    size: 0,
                    hash: 'sample_hash'
                }];

                this.table = await this.db.createTable('embeddings', sampleData, schema);

                // Remove sample data
                await this.table.delete("id = 'sample'");
            }

            // Build vector index if enabled
            if (this.options.enableVectorSearch) {
                await this.buildVectorIndex();
            }

            // Start batch processing
            this.startBatchProcessing();

            this.isInitialized = true;
            this.emit('l2-initialized');

        } catch (error) {
            console.error('[L2Cache] Database initialization failed:', error);
            this.emit('l2-error', error);
        }
    }

    /**
     * Build vector index for similarity search
     */
    async buildVectorIndex() {
        try {
            console.log('[L2 Cache] Building vector index...');

            await this.table.createIndex('embedding', {
                type: this.options.indexType,
                nprobes: this.options.nprobes
            });

            this.stats.indexBuilds++;
            console.log('[L2 Cache] Vector index built successfully');

        } catch (error) {
            console.warn('[L2 Cache] Vector index creation failed:', error);
            // Continue without index - search will still work but slower
        }
    }

    /**
     * Start batch processing for write operations
     */
    startBatchProcessing() {
        setInterval(async () => {
            if (this.writeQueue.length > 0 && !this.isProcessingQueue) {
                await this.processBatchWrites();
            }
        }, 1000); // Process every second
    }
    
    async get(documentId, chunkId) {
        try {
            if (!this.isInitialized) {
                await this.waitForInitialization();
            }

            const id = this.generateId(documentId, chunkId);

            const results = await this.table
                .search()
                .where(`id = '${id}'`)
                .limit(1)
                .toArray();

            if (results.length > 0) {
                this.stats.hits++;
                this.stats.reads++;

                const result = results[0];
                const metadata = JSON.parse(result.metadata);

                this.emit('cache-hit', {
                    key: id,
                    layer: 'L2',
                    size: result.size,
                    timestamp: result.timestamp
                });

                return {
                    embedding: result.embedding,
                    metadata,
                    timestamp: result.timestamp
                };
            }

            this.stats.misses++;
            this.emit('cache-miss', { key: id, layer: 'L2' });
            return null;

        } catch (error) {
            console.error('[L2Cache] Get operation failed:', error);
            this.stats.misses++;
            return null;
        }
    }

    /**
     * Get multiple embeddings at once
     */
    async getBatch(requests) {
        try {
            if (!this.isInitialized) {
                await this.waitForInitialization();
            }

            const ids = requests.map(r => this.generateId(r.documentId, r.chunkId));
            const whereClause = ids.map(id => `id = '${id}'`).join(' OR ');

            const results = await this.table
                .search()
                .where(whereClause)
                .toArray();

            const resultMap = new Map();
            results.forEach(result => {
                resultMap.set(result.id, {
                    embedding: result.embedding,
                    metadata: JSON.parse(result.metadata),
                    timestamp: result.timestamp
                });
            });

            const batchResults = requests.map(({ documentId, chunkId }) => {
                const id = this.generateId(documentId, chunkId);
                const result = resultMap.get(id);

                if (result) {
                    this.stats.hits++;
                } else {
                    this.stats.misses++;
                }

                return {
                    documentId,
                    chunkId,
                    embedding: result?.embedding || null,
                    metadata: result?.metadata || null,
                    found: !!result
                };
            });

            this.stats.reads++;
            this.emit('batch-get', {
                count: requests.length,
                hits: batchResults.filter(r => r.found).length
            });

            return batchResults;

        } catch (error) {
            console.error('[L2Cache] Batch get operation failed:', error);
            return requests.map(({ documentId, chunkId }) => ({
                documentId,
                chunkId,
                embedding: null,
                metadata: null,
                found: false
            }));
        }
    }

    /**
     * Add to write queue for batch processing
     */
    async set(documentId, chunkId, embedding, metadata = {}) {
        try {
            const id = this.generateId(documentId, chunkId);
            const embeddingSize = this.estimateEmbeddingSize(embedding);
            const hash = this.generateEmbeddingHash(embedding);

            const entry = {
                id,
                document_id: documentId,
                chunk_id: chunkId,
                embedding: Array.from(embedding), // Convert to array for LanceDB
                metadata: JSON.stringify(metadata),
                timestamp: Date.now(),
                size: embeddingSize,
                hash
            };

            // Add to write queue for batch processing
            this.writeQueue.push(entry);

            // Process immediately if queue is full
            if (this.writeQueue.length >= this.options.batchSize) {
                await this.processBatchWrites();
            }

            this.emit('cache-queued', { key: id, layer: 'L2', size: embeddingSize });

            return true;

        } catch (error) {
            console.error('[L2Cache] Set operation failed:', error);
            return false;
        }
    }

    /**
     * Process batch writes
     */
    async processBatchWrites() {
        if (this.isProcessingQueue || this.writeQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        try {
            const batch = this.writeQueue.splice(0, this.options.batchSize);

            if (batch.length > 0) {
                await this.table.add(batch);

                this.stats.writes += batch.length;
                this.stats.totalSize += batch.reduce((sum, entry) => sum + entry.size, 0);

                this.emit('batch-write', {
                    count: batch.length,
                    totalSize: batch.reduce((sum, entry) => sum + entry.size, 0)
                });
            }

        } catch (error) {
            console.error('[L2Cache] Batch write failed:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }
    
    /**
     * Enhanced vector similarity search
     */
    async search(queryEmbedding, options = {}) {
        try {
            if (!this.isInitialized) {
                await this.waitForInitialization();
            }

            const {
                limit = 10,
                threshold = 0.7,
                documentId = null,
                includeMetadata = true
            } = options;

            let query = this.table
                .search(Array.from(queryEmbedding))
                .limit(limit);

            // Filter by document if specified
            if (documentId) {
                query = query.where(`document_id = '${documentId}'`);
            }

            const results = await query.toArray();

            // Filter by similarity threshold and format results
            const filteredResults = results
                .filter(result => result._distance >= threshold)
                .map(result => ({
                    documentId: result.document_id,
                    chunkId: result.chunk_id,
                    embedding: result.embedding,
                    metadata: includeMetadata ? JSON.parse(result.metadata) : null,
                    similarity: result._distance,
                    timestamp: result.timestamp
                }));

            this.stats.vectorSearches++;
            this.emit('vector-search', {
                querySize: queryEmbedding.length,
                resultCount: filteredResults.length,
                threshold
            });

            return filteredResults;
            
            this.emit('cache-search', { 
                querySize: queryEmbedding.length, 
                resultCount: filteredResults.length,
                layer: 'L2'
            });
            
            return filteredResults.map(result => ({
                documentId: result.document_id,
                chunkId: result.chunk_id,
                embedding: result.embedding,
                metadata: JSON.parse(result.metadata),
                similarity: result._distance
            }));
            
        } catch (error) {
            console.error('[L2Cache] Search operation failed:', error);
            return [];
        }
    }
    
    generateId(documentId, chunkId) {
        return crypto.createHash('sha256')
            .update(`${documentId}:${chunkId}`)
            .digest('hex');
    }
    
    getStats() {
        return {
            ...this.stats,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }
    
    async dispose() {
        if (this.db) {
            // LanceDB doesn't require explicit closing
        }
        this.removeAllListeners();
    }
}

class L3NetworkCache extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            endpoints: ['http://localhost:8000/cache'],
            timeout: 5000,
            retries: 2,
            compressionEnabled: true,
            encryptionEnabled: true,
            encryptionKey: 'default-key-change-in-production',
            consistencyLevel: 'eventual', // 'strong', 'eventual'
            replicationFactor: 2,
            enableDistributedCoordination: true,
            coordinatorEndpoint: 'http://localhost:8001/coordinator',
            healthCheckInterval: 30000,
            maxConcurrentRequests: 10,
            enableBatching: true,
            batchSize: 50,
            batchTimeout: 1000,
            ...options
        };

        this.stats = {
            hits: 0,
            misses: 0,
            networkErrors: 0,
            avgLatency: 0,
            compressionRatio: 1.0,
            encryptionOverhead: 0,
            batchRequests: 0,
            coordinationRequests: 0
        };

        this.endpointHealth = new Map(); // endpoint -> health status
        this.requestQueue = [];
        this.batchQueue = [];
        this.isProcessingBatch = false;
        this.activeRequests = 0;

        this.initializeCache();
    }

    async initializeCache() {
        try {
            console.log('[L3 Cache] Initializing network cache...');

            // Check endpoint health
            await this.checkEndpointHealth();

            // Start health monitoring
            this.startHealthMonitoring();

            // Start batch processing
            if (this.options.enableBatching) {
                this.startBatchProcessing();
            }

            // Register with coordinator if enabled
            if (this.options.enableDistributedCoordination) {
                await this.registerWithCoordinator();
            }

            this.emit('l3-initialized');

        } catch (error) {
            console.error('[L3 Cache] Initialization failed:', error);
            this.emit('l3-error', error);
        }
    }
    
    async get(documentId, chunkId) {
        const startTime = Date.now();

        try {
            const key = this.generateKey(documentId, chunkId);
            const healthyEndpoints = this.getHealthyEndpoints();

            if (healthyEndpoints.length === 0) {
                this.stats.misses++;
                return null;
            }

            // Try endpoints in order of health
            for (const endpoint of healthyEndpoints) {
                try {
                    if (this.activeRequests >= this.options.maxConcurrentRequests) {
                        await this.waitForAvailableSlot();
                    }

                    this.activeRequests++;

                    const response = await this.makeRequest('GET', `${endpoint}/cache/${key}`);

                    if (response.ok) {
                        const encryptedData = await response.json();

                        // Decrypt and decompress data
                        const data = await this.processIncomingData(encryptedData);

                        this.stats.hits++;
                        this.updateLatency(Date.now() - startTime);

                        this.emit('cache-hit', {
                            key,
                            layer: 'L3',
                            endpoint,
                            latency: Date.now() - startTime
                        });

                        return {
                            embedding: new Float32Array(data.embedding),
                            metadata: data.metadata,
                            timestamp: data.timestamp
                        };
                    }
                } catch (error) {
                    console.warn(`[L3Cache] Endpoint ${endpoint} failed:`, error.message);
                    this.markEndpointUnhealthy(endpoint);
                    continue;
                } finally {
                    this.activeRequests--;
                }
            }

            this.stats.misses++;
            this.emit('cache-miss', { key: documentId + ':' + chunkId, layer: 'L3' });
            return null;

        } catch (error) {
            this.stats.networkErrors++;
            console.error('[L3Cache] Get operation failed:', error);
            return null;
        }
    }

    /**
     * Get multiple embeddings with batching
     */
    async getBatch(requests) {
        try {
            if (this.options.enableBatching) {
                return await this.getBatchOptimized(requests);
            }

            // Fallback to individual requests
            const results = [];
            for (const { documentId, chunkId } of requests) {
                const result = await this.get(documentId, chunkId);
                results.push({
                    documentId,
                    chunkId,
                    embedding: result?.embedding || null,
                    metadata: result?.metadata || null,
                    found: !!result
                });
            }

            return results;

        } catch (error) {
            console.error('[L3Cache] Batch get failed:', error);
            return requests.map(({ documentId, chunkId }) => ({
                documentId,
                chunkId,
                embedding: null,
                metadata: null,
                found: false
            }));
        }
    }

    /**
     * Optimized batch get with single network request
     */
    async getBatchOptimized(requests) {
        const startTime = Date.now();
        const keys = requests.map(r => this.generateKey(r.documentId, r.chunkId));
        const healthyEndpoints = this.getHealthyEndpoints();

        if (healthyEndpoints.length === 0) {
            return requests.map(({ documentId, chunkId }) => ({
                documentId,
                chunkId,
                embedding: null,
                metadata: null,
                found: false
            }));
        }

        try {
            const endpoint = healthyEndpoints[0]; // Use primary endpoint
            const response = await this.makeRequest('POST', `${endpoint}/cache/batch`, {
                keys,
                operation: 'get'
            });

            if (response.ok) {
                const batchData = await response.json();
                const results = [];

                for (let i = 0; i < requests.length; i++) {
                    const { documentId, chunkId } = requests[i];
                    const data = batchData.results[i];

                    if (data && data.found) {
                        const processedData = await this.processIncomingData(data);
                        results.push({
                            documentId,
                            chunkId,
                            embedding: new Float32Array(processedData.embedding),
                            metadata: processedData.metadata,
                            found: true
                        });
                        this.stats.hits++;
                    } else {
                        results.push({
                            documentId,
                            chunkId,
                            embedding: null,
                            metadata: null,
                            found: false
                        });
                        this.stats.misses++;
                    }
                }

                this.stats.batchRequests++;
                this.updateLatency(Date.now() - startTime);

                return results;
            }

        } catch (error) {
            console.error('[L3Cache] Batch get optimized failed:', error);
            this.markEndpointUnhealthy(healthyEndpoints[0]);
        }

        // Fallback to individual requests
        return await this.getBatch(requests);
    }
    
    async set(documentId, chunkId, embedding, metadata = {}) {
        try {
            const key = this.generateKey(documentId, chunkId);
            const payload = {
                embedding: Array.from(embedding),
                metadata,
                timestamp: Date.now()
            };
            
            for (const endpoint of this.options.endpoints) {
                try {
                    const response = await this.makeRequest('PUT', `${endpoint}/${key}`, payload);
                    
                    if (response.ok) {
                        this.emit('cache-set', { key, layer: 'L3' });
                        return true;
                    }
                } catch (error) {
                    console.warn(`[L3Cache] Endpoint ${endpoint} failed:`, error.message);
                    continue;
                }
            }
            
            return false;
            
        } catch (error) {
            this.stats.networkErrors++;
            console.error('[L3Cache] Set operation failed:', error);
            return false;
        }
    }
    
    async makeRequest(method, url, data = null) {
        const fetch = require('node-fetch');
        
        const options = {
            method,
            timeout: this.options.timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        return await fetch(url, options);
    }
    
    generateKey(documentId, chunkId) {
        return crypto.createHash('sha256')
            .update(`${documentId}:${chunkId}`)
            .digest('hex');
    }
    
    updateLatency(latency) {
        const alpha = 0.1; // Exponential moving average factor
        this.stats.avgLatency = this.stats.avgLatency * (1 - alpha) + latency * alpha;
    }
    
    getStats() {
        return {
            ...this.stats,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }
    
    dispose() {
        this.removeAllListeners();
    }
}

class HierarchicalEmbeddingCache extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            enableL1: true,
            enableL2: true,
            enableL3: false,
            promotionThreshold: 3, // Promote to higher cache after N accesses
            ...options
        };
        
        this.l1Cache = this.options.enableL1 ? new L1MemoryCache(options.l1) : null;
        this.l2Cache = this.options.enableL2 ? new L2SSDCache(options.l2) : null;
        this.l3Cache = this.options.enableL3 ? new L3NetworkCache(options.l3) : null;
        
        this.accessCounts = new Map(); // Track access frequency for promotion
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        // Forward cache events
        [this.l1Cache, this.l2Cache, this.l3Cache].forEach(cache => {
            if (cache) {
                cache.on('cache-hit', (data) => this.emit('cache-hit', data));
                cache.on('cache-miss', (data) => this.emit('cache-miss', data));
                cache.on('cache-set', (data) => this.emit('cache-set', data));
            }
        });
    }
    
    async get(documentId, chunkId) {
        const key = `${documentId}:${chunkId}`;
        
        // Try L1 cache first
        if (this.l1Cache) {
            const result = await this.l1Cache.get(documentId, chunkId);
            if (result) {
                this.updateAccessCount(key);
                return result;
            }
        }
        
        // Try L2 cache
        if (this.l2Cache) {
            const result = await this.l2Cache.get(documentId, chunkId);
            if (result) {
                // Promote to L1
                if (this.l1Cache) {
                    await this.l1Cache.set(documentId, chunkId, result.embedding, result.metadata);
                }
                this.updateAccessCount(key);
                return result.embedding;
            }
        }
        
        // Try L3 cache
        if (this.l3Cache) {
            const result = await this.l3Cache.get(documentId, chunkId);
            if (result) {
                // Promote to L2 and L1
                if (this.l2Cache) {
                    await this.l2Cache.set(documentId, chunkId, result.embedding, result.metadata);
                }
                if (this.l1Cache) {
                    await this.l1Cache.set(documentId, chunkId, result.embedding, result.metadata);
                }
                this.updateAccessCount(key);
                return result.embedding;
            }
        }
        
        return null;
    }
    
    async set(documentId, chunkId, embedding, metadata = {}) {
        const key = `${documentId}:${chunkId}`;
        
        // Always store in L1 if available
        if (this.l1Cache) {
            await this.l1Cache.set(documentId, chunkId, embedding, metadata);
        }
        
        // Store in L2 for persistence
        if (this.l2Cache) {
            await this.l2Cache.set(documentId, chunkId, embedding, metadata);
        }
        
        // Optionally store in L3 for sharing
        if (this.l3Cache && this.shouldStoreInL3(key)) {
            await this.l3Cache.set(documentId, chunkId, embedding, metadata);
        }
        
        this.updateAccessCount(key);
        return true;
    }
    
    async search(queryEmbedding, options = {}) {
        // Search in L2 cache (which has vector search capabilities)
        if (this.l2Cache) {
            return await this.l2Cache.search(queryEmbedding, options);
        }
        
        return [];
    }
    
    updateAccessCount(key) {
        const currentCount = this.accessCounts.get(key) || 0;
        this.accessCounts.set(key, currentCount + 1);
        
        // Check for promotion
        if (currentCount + 1 >= this.options.promotionThreshold) {
            this.emit('cache-promotion', { key, accessCount: currentCount + 1 });
        }
    }
    
    shouldStoreInL3(key) {
        const accessCount = this.accessCounts.get(key) || 0;
        return accessCount >= this.options.promotionThreshold;
    }
    
    getStats() {
        const stats = {
            l1: this.l1Cache ? this.l1Cache.getStats() : null,
            l2: this.l2Cache ? this.l2Cache.getStats() : null,
            l3: this.l3Cache ? this.l3Cache.getStats() : null,
            totalAccessCounts: this.accessCounts.size
        };
        
        // Calculate overall hit rate
        const totalHits = (stats.l1?.hits || 0) + (stats.l2?.hits || 0) + (stats.l3?.hits || 0);
        const totalMisses = (stats.l1?.misses || 0) + (stats.l2?.misses || 0) + (stats.l3?.misses || 0);
        stats.overallHitRate = totalHits / (totalHits + totalMisses) || 0;
        
        return stats;
    }
    
    async dispose() {
        if (this.l1Cache) await this.l1Cache.dispose();
        if (this.l2Cache) await this.l2Cache.dispose();
        if (this.l3Cache) await this.l3Cache.dispose();
        
        this.accessCounts.clear();
        this.removeAllListeners();
    }
}

module.exports = {
    HierarchicalEmbeddingCache,
    L1MemoryCache,
    L2SSDCache,
    L3NetworkCache
};
