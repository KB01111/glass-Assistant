/**
 * ONNX Runtime Session Management
 * Implements session pooling, model caching, and lifecycle management
 * for ONNX Runtime sessions with DirectML execution provider optimization
 */

const ort = require('onnxruntime-node');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

class ONNXSessionManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            maxPoolSize: 10,
            maxIdleTime: 300000, // 5 minutes
            enableSessionCaching: true,
            enableModelCaching: true,
            cacheDirectory: './cache/onnx_sessions',
            defaultProviders: ['DmlExecutionProvider', 'CPUExecutionProvider'],
            sessionTimeout: 60000, // 1 minute
            ...options
        };
        
        this.sessionPools = new Map(); // modelPath -> SessionPool
        this.modelCache = new Map(); // modelPath -> ModelInfo
        this.activeSessions = new Map(); // sessionId -> SessionInfo
        this.sessionStats = new Map(); // modelPath -> Stats
        this.isInitialized = false;
        
        this.initializeManager();
    }
    
    async initializeManager() {
        try {
            console.log('[ONNX Session Manager] Initializing session manager...');
            
            // Create cache directory
            if (this.options.enableModelCaching) {
                await fs.mkdir(this.options.cacheDirectory, { recursive: true });
            }
            
            // Start cleanup interval
            this.startCleanupInterval();
            
            this.isInitialized = true;
            this.emit('initialized');
            
        } catch (error) {
            console.error('[ONNX Session Manager] Initialization failed:', error);
            this.emit('initialization-failed', error);
        }
    }
    
    /**
     * Get or create session from pool
     */
    async getSession(modelPath, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('ONNX Session Manager not initialized');
            }
            
            const sessionPool = await this.getOrCreatePool(modelPath, options);
            const session = await sessionPool.acquireSession();
            
            const sessionId = this.generateSessionId();
            this.activeSessions.set(sessionId, {
                id: sessionId,
                modelPath,
                session,
                acquiredAt: Date.now(),
                lastUsed: Date.now()
            });
            
            this.updateStats(modelPath, 'sessions_acquired');
            
            return {
                sessionId,
                session,
                release: () => this.releaseSession(sessionId)
            };
            
        } catch (error) {
            console.error('[ONNX Session Manager] Failed to get session:', error);
            throw error;
        }
    }
    
    /**
     * Release session back to pool
     */
    async releaseSession(sessionId) {
        try {
            const sessionInfo = this.activeSessions.get(sessionId);
            if (!sessionInfo) {
                console.warn(`[ONNX Session Manager] Session ${sessionId} not found`);
                return;
            }
            
            const sessionPool = this.sessionPools.get(sessionInfo.modelPath);
            if (sessionPool) {
                await sessionPool.releaseSession(sessionInfo.session);
            }
            
            this.activeSessions.delete(sessionId);
            this.updateStats(sessionInfo.modelPath, 'sessions_released');
            
        } catch (error) {
            console.error('[ONNX Session Manager] Failed to release session:', error);
        }
    }
    
    /**
     * Get or create session pool for model
     */
    async getOrCreatePool(modelPath, options = {}) {
        if (this.sessionPools.has(modelPath)) {
            return this.sessionPools.get(modelPath);
        }
        
        const sessionPool = new SessionPool(modelPath, {
            ...this.options,
            ...options
        });
        
        await sessionPool.initialize();
        this.sessionPools.set(modelPath, sessionPool);
        
        return sessionPool;
    }
    
    /**
     * Preload model into cache
     */
    async preloadModel(modelPath, options = {}) {
        try {
            console.log(`[ONNX Session Manager] Preloading model: ${modelPath}`);
            
            const sessionPool = await this.getOrCreatePool(modelPath, options);
            await sessionPool.warmup();
            
            this.updateStats(modelPath, 'models_preloaded');
            
        } catch (error) {
            console.error('[ONNX Session Manager] Model preload failed:', error);
            throw error;
        }
    }
    
    /**
     * Clear model from cache
     */
    async clearModel(modelPath) {
        try {
            const sessionPool = this.sessionPools.get(modelPath);
            if (sessionPool) {
                await sessionPool.dispose();
                this.sessionPools.delete(modelPath);
            }
            
            this.modelCache.delete(modelPath);
            this.sessionStats.delete(modelPath);
            
            console.log(`[ONNX Session Manager] Cleared model: ${modelPath}`);
            
        } catch (error) {
            console.error('[ONNX Session Manager] Failed to clear model:', error);
        }
    }
    
    /**
     * Start cleanup interval for idle sessions
     */
    startCleanupInterval() {
        setInterval(async () => {
            await this.cleanupIdleSessions();
        }, 60000); // Check every minute
    }
    
    /**
     * Cleanup idle sessions
     */
    async cleanupIdleSessions() {
        const now = Date.now();
        const idleThreshold = now - this.options.maxIdleTime;
        
        for (const [sessionId, sessionInfo] of this.activeSessions) {
            if (sessionInfo.lastUsed < idleThreshold) {
                console.log(`[ONNX Session Manager] Cleaning up idle session: ${sessionId}`);
                await this.releaseSession(sessionId);
            }
        }
        
        // Cleanup idle pools
        for (const [modelPath, sessionPool] of this.sessionPools) {
            await sessionPool.cleanupIdleSessions();
        }
    }
    
    /**
     * Update statistics
     */
    updateStats(modelPath, metric) {
        if (!this.sessionStats.has(modelPath)) {
            this.sessionStats.set(modelPath, {
                sessions_acquired: 0,
                sessions_released: 0,
                models_preloaded: 0,
                cache_hits: 0,
                cache_misses: 0
            });
        }
        
        const stats = this.sessionStats.get(modelPath);
        stats[metric] = (stats[metric] || 0) + 1;
    }
    
    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Get session statistics
     */
    getStats() {
        return {
            activeSessions: this.activeSessions.size,
            sessionPools: this.sessionPools.size,
            modelCache: this.modelCache.size,
            stats: Object.fromEntries(this.sessionStats)
        };
    }
    
    /**
     * Dispose all resources
     */
    async dispose() {
        try {
            console.log('[ONNX Session Manager] Disposing all resources...');
            
            // Release all active sessions
            for (const sessionId of this.activeSessions.keys()) {
                await this.releaseSession(sessionId);
            }
            
            // Dispose all pools
            for (const sessionPool of this.sessionPools.values()) {
                await sessionPool.dispose();
            }
            
            this.sessionPools.clear();
            this.modelCache.clear();
            this.activeSessions.clear();
            this.sessionStats.clear();
            
        } catch (error) {
            console.error('[ONNX Session Manager] Disposal failed:', error);
        }
    }
}

/**
 * Session Pool for individual models
 */
class SessionPool {
    constructor(modelPath, options = {}) {
        this.modelPath = modelPath;
        this.options = options;
        this.availableSessions = [];
        this.busySessions = new Set();
        this.isInitialized = false;
        this.sessionOptions = null;
    }
    
    async initialize() {
        try {
            this.sessionOptions = this.createSessionOptions();
            this.isInitialized = true;
            
        } catch (error) {
            console.error(`[Session Pool] Initialization failed for ${this.modelPath}:`, error);
            throw error;
        }
    }
    
    async acquireSession() {
        if (this.availableSessions.length > 0) {
            const session = this.availableSessions.pop();
            this.busySessions.add(session);
            return session;
        }
        
        // Create new session if under limit
        if (this.busySessions.size < this.options.maxPoolSize) {
            const session = await this.createSession();
            this.busySessions.add(session);
            return session;
        }
        
        // Wait for available session
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Session acquisition timeout'));
            }, this.options.sessionTimeout);
            
            const checkAvailable = () => {
                if (this.availableSessions.length > 0) {
                    clearTimeout(timeout);
                    const session = this.availableSessions.pop();
                    this.busySessions.add(session);
                    resolve(session);
                } else {
                    setTimeout(checkAvailable, 100);
                }
            };
            
            checkAvailable();
        });
    }
    
    async releaseSession(session) {
        if (this.busySessions.has(session)) {
            this.busySessions.delete(session);
            this.availableSessions.push(session);
        }
    }
    
    async createSession() {
        return await ort.InferenceSession.create(this.modelPath, this.sessionOptions);
    }
    
    createSessionOptions() {
        return {
            executionProviders: this.options.defaultProviders,
            graphOptimizationLevel: 'all',
            enableMemPattern: true,
            enableCpuMemArena: true
        };
    }
    
    async warmup() {
        // Create initial sessions
        const initialSize = Math.min(2, this.options.maxPoolSize);
        for (let i = 0; i < initialSize; i++) {
            const session = await this.createSession();
            this.availableSessions.push(session);
        }
    }
    
    async cleanupIdleSessions() {
        // Keep minimum number of sessions
        const minSessions = 1;
        while (this.availableSessions.length > minSessions) {
            const session = this.availableSessions.pop();
            await session.release();
        }
    }
    
    async dispose() {
        // Dispose all sessions
        for (const session of this.availableSessions) {
            await session.release();
        }
        for (const session of this.busySessions) {
            await session.release();
        }
        
        this.availableSessions = [];
        this.busySessions.clear();
    }
}

module.exports = { ONNXSessionManager, SessionPool };
