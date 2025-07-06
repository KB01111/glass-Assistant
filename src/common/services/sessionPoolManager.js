/**
 * Session Pool Manager for ONNX Runtime
 * Implements session caching with LRU eviction and session pooling for concurrent operations
 */

const EventEmitter = require('events');
const { DirectMLAcceleratedInference } = require('./directMLProvider');

class SessionPool extends EventEmitter {
    constructor(modelPath, options = {}) {
        super();
        
        this.modelPath = modelPath;
        this.sessions = [];
        this.activeSessions = new Set();
        this.waitingQueue = [];
        
        this.options = {
            minSessions: 1,
            maxSessions: 4,
            sessionTimeout: 300000, // 5 minutes
            createOnDemand: true,
            ...options
        };
        
        this.stats = {
            created: 0,
            destroyed: 0,
            borrowed: 0,
            returned: 0,
            timeouts: 0,
            queueWaits: 0
        };
        
        this.directMLProvider = new DirectMLAcceleratedInference();
        this.initializePool();
    }
    
    async initializePool() {
        try {
            // Create minimum number of sessions
            for (let i = 0; i < this.options.minSessions; i++) {
                const session = await this.createSession();
                this.sessions.push(session);
            }
            
            console.log(`[SessionPool] Initialized pool for ${this.modelPath} with ${this.sessions.length} sessions`);
            this.emit('pool-initialized', { modelPath: this.modelPath, sessionCount: this.sessions.length });
            
        } catch (error) {
            console.error(`[SessionPool] Failed to initialize pool for ${this.modelPath}:`, error);
            this.emit('pool-error', error);
        }
    }
    
    async createSession() {
        try {
            const session = await this.directMLProvider.createOptimizedSession(this.modelPath);
            
            const sessionWrapper = {
                session,
                id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                created: Date.now(),
                lastUsed: Date.now(),
                useCount: 0,
                isActive: false
            };
            
            this.stats.created++;
            this.emit('session-created', { sessionId: sessionWrapper.id, modelPath: this.modelPath });
            
            return sessionWrapper;
            
        } catch (error) {
            console.error(`[SessionPool] Failed to create session for ${this.modelPath}:`, error);
            throw error;
        }
    }
    
    async borrowSession() {
        return new Promise(async (resolve, reject) => {
            try {
                // Try to get available session
                const availableSession = this.getAvailableSession();
                
                if (availableSession) {
                    this.activateSession(availableSession);
                    this.stats.borrowed++;
                    resolve(availableSession);
                    return;
                }
                
                // Try to create new session if under limit
                if (this.sessions.length < this.options.maxSessions && this.options.createOnDemand) {
                    const newSession = await this.createSession();
                    this.sessions.push(newSession);
                    this.activateSession(newSession);
                    this.stats.borrowed++;
                    resolve(newSession);
                    return;
                }
                
                // Add to waiting queue
                this.stats.queueWaits++;
                this.waitingQueue.push({ resolve, reject, timestamp: Date.now() });
                
                // Set timeout for waiting requests
                setTimeout(() => {
                    const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
                    if (index !== -1) {
                        this.waitingQueue.splice(index, 1);
                        this.stats.timeouts++;
                        reject(new Error('Session borrow timeout'));
                    }
                }, this.options.sessionTimeout);
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    getAvailableSession() {
        return this.sessions.find(sessionWrapper => !sessionWrapper.isActive);
    }
    
    activateSession(sessionWrapper) {
        sessionWrapper.isActive = true;
        sessionWrapper.lastUsed = Date.now();
        sessionWrapper.useCount++;
        this.activeSessions.add(sessionWrapper);
        
        this.emit('session-borrowed', { sessionId: sessionWrapper.id, useCount: sessionWrapper.useCount });
    }
    
    returnSession(sessionWrapper) {
        try {
            sessionWrapper.isActive = false;
            this.activeSessions.delete(sessionWrapper);
            this.stats.returned++;
            
            this.emit('session-returned', { sessionId: sessionWrapper.id });
            
            // Process waiting queue
            if (this.waitingQueue.length > 0) {
                const waiting = this.waitingQueue.shift();
                this.activateSession(sessionWrapper);
                waiting.resolve(sessionWrapper);
            }
            
        } catch (error) {
            console.error('[SessionPool] Error returning session:', error);
        }
    }
    
    async destroySession(sessionWrapper) {
        try {
            // Remove from active sessions
            this.activeSessions.delete(sessionWrapper);
            
            // Remove from pool
            const index = this.sessions.indexOf(sessionWrapper);
            if (index !== -1) {
                this.sessions.splice(index, 1);
            }
            
            // Dispose session
            if (sessionWrapper.session && typeof sessionWrapper.session.dispose === 'function') {
                await sessionWrapper.session.dispose();
            }
            
            this.stats.destroyed++;
            this.emit('session-destroyed', { sessionId: sessionWrapper.id });
            
        } catch (error) {
            console.error('[SessionPool] Error destroying session:', error);
        }
    }
    
    getStats() {
        return {
            ...this.stats,
            totalSessions: this.sessions.length,
            activeSessions: this.activeSessions.size,
            waitingRequests: this.waitingQueue.length,
            modelPath: this.modelPath
        };
    }
    
    async dispose() {
        // Destroy all sessions
        const destroyPromises = this.sessions.map(sessionWrapper => this.destroySession(sessionWrapper));
        await Promise.all(destroyPromises);
        
        // Clear waiting queue
        this.waitingQueue.forEach(waiting => {
            waiting.reject(new Error('Session pool disposed'));
        });
        this.waitingQueue = [];
        
        this.removeAllListeners();
        console.log(`[SessionPool] Pool disposed for ${this.modelPath}`);
    }
}

class SessionPoolManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.pools = new Map(); // modelPath -> SessionPool
        this.sessionCache = new Map(); // cacheKey -> sessionWrapper
        this.cacheStats = new Map(); // cacheKey -> { hits, misses, lastAccess }
        
        this.options = {
            maxCachedSessions: 50,
            cacheTimeout: 600000, // 10 minutes
            enableLRUEviction: true,
            poolOptions: {
                minSessions: 1,
                maxSessions: 4,
                sessionTimeout: 300000
            },
            ...options
        };
        
        this.globalStats = {
            totalPools: 0,
            totalSessions: 0,
            cacheHits: 0,
            cacheMisses: 0,
            evictions: 0
        };
        
        this.startCleanupTimer();
    }
    
    async getSession(modelPath, sessionOptions = {}) {
        const cacheKey = this.generateCacheKey(modelPath, sessionOptions);
        
        // Check cache first
        if (this.sessionCache.has(cacheKey)) {
            const sessionWrapper = this.sessionCache.get(cacheKey);
            this.updateCacheStats(cacheKey, 'hit');
            this.globalStats.cacheHits++;
            return sessionWrapper;
        }
        
        // Cache miss - get from pool
        this.updateCacheStats(cacheKey, 'miss');
        this.globalStats.cacheMisses++;
        
        const pool = await this.getOrCreatePool(modelPath);
        const sessionWrapper = await pool.borrowSession();
        
        // Cache the session
        this.cacheSession(cacheKey, sessionWrapper);
        
        return sessionWrapper;
    }
    
    async getOrCreatePool(modelPath) {
        if (this.pools.has(modelPath)) {
            return this.pools.get(modelPath);
        }
        
        const pool = new SessionPool(modelPath, this.options.poolOptions);
        this.pools.set(modelPath, pool);
        this.globalStats.totalPools++;
        
        // Set up pool event listeners
        pool.on('session-created', (data) => {
            this.globalStats.totalSessions++;
            this.emit('session-created', data);
        });
        
        pool.on('session-destroyed', (data) => {
            this.globalStats.totalSessions--;
            this.emit('session-destroyed', data);
        });
        
        pool.on('pool-error', (error) => {
            this.emit('pool-error', { modelPath, error });
        });
        
        return pool;
    }
    
    cacheSession(cacheKey, sessionWrapper) {
        // Implement LRU eviction if cache is full
        if (this.sessionCache.size >= this.options.maxCachedSessions) {
            this.evictLRUSession();
        }
        
        this.sessionCache.set(cacheKey, sessionWrapper);
        this.updateCacheStats(cacheKey, 'cached');
    }
    
    evictLRUSession() {
        if (!this.options.enableLRUEviction) return;
        
        let oldestKey = null;
        let oldestTime = Date.now();
        
        for (const [key, stats] of this.cacheStats) {
            if (stats.lastAccess < oldestTime) {
                oldestTime = stats.lastAccess;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            const sessionWrapper = this.sessionCache.get(oldestKey);
            this.sessionCache.delete(oldestKey);
            this.cacheStats.delete(oldestKey);
            
            // Return session to pool
            const modelPath = this.extractModelPathFromCacheKey(oldestKey);
            const pool = this.pools.get(modelPath);
            if (pool) {
                pool.returnSession(sessionWrapper);
            }
            
            this.globalStats.evictions++;
            this.emit('session-evicted', { cacheKey: oldestKey });
        }
    }
    
    updateCacheStats(cacheKey, operation) {
        if (!this.cacheStats.has(cacheKey)) {
            this.cacheStats.set(cacheKey, { hits: 0, misses: 0, lastAccess: Date.now() });
        }
        
        const stats = this.cacheStats.get(cacheKey);
        stats.lastAccess = Date.now();
        
        if (operation === 'hit') {
            stats.hits++;
        } else if (operation === 'miss') {
            stats.misses++;
        }
    }
    
    generateCacheKey(modelPath, sessionOptions) {
        const optionsHash = JSON.stringify(sessionOptions);
        return `${modelPath}_${Buffer.from(optionsHash).toString('base64')}`;
    }
    
    extractModelPathFromCacheKey(cacheKey) {
        return cacheKey.split('_')[0];
    }
    
    returnSession(sessionWrapper) {
        // Find the pool for this session
        for (const pool of this.pools.values()) {
            if (pool.sessions.includes(sessionWrapper)) {
                pool.returnSession(sessionWrapper);
                break;
            }
        }
    }
    
    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredSessions();
        }, 60000); // Check every minute
    }
    
    cleanupExpiredSessions() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, stats] of this.cacheStats) {
            if (now - stats.lastAccess > this.options.cacheTimeout) {
                expiredKeys.push(key);
            }
        }
        
        for (const key of expiredKeys) {
            const sessionWrapper = this.sessionCache.get(key);
            if (sessionWrapper) {
                this.sessionCache.delete(key);
                this.cacheStats.delete(key);
                
                // Return to pool
                const modelPath = this.extractModelPathFromCacheKey(key);
                const pool = this.pools.get(modelPath);
                if (pool) {
                    pool.returnSession(sessionWrapper);
                }
            }
        }
        
        if (expiredKeys.length > 0) {
            console.log(`[SessionPoolManager] Cleaned up ${expiredKeys.length} expired sessions`);
        }
    }
    
    getGlobalStats() {
        const poolStats = {};
        for (const [modelPath, pool] of this.pools) {
            poolStats[modelPath] = pool.getStats();
        }
        
        return {
            ...this.globalStats,
            cachedSessions: this.sessionCache.size,
            pools: poolStats,
            cacheHitRate: this.globalStats.cacheHits / (this.globalStats.cacheHits + this.globalStats.cacheMisses) || 0
        };
    }
    
    async dispose() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Dispose all pools
        const disposePromises = Array.from(this.pools.values()).map(pool => pool.dispose());
        await Promise.all(disposePromises);
        
        this.pools.clear();
        this.sessionCache.clear();
        this.cacheStats.clear();
        
        this.removeAllListeners();
        console.log('[SessionPoolManager] Session pool manager disposed');
    }
}

module.exports = { SessionPool, SessionPoolManager };
