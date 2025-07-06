/**
 * Cache Promotion and Demotion Manager
 * Implements intelligent cache promotion strategies based on access patterns,
 * frequency, and recency for optimal cache utilization across L1, L2, and L3 layers
 */

const EventEmitter = require('events');

class CachePromotionManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            promotionThreshold: 3, // Promote after N accesses
            demotionThreshold: 0.1, // Demote if access frequency < threshold
            recencyWeight: 0.4, // Weight for recency in scoring
            frequencyWeight: 0.6, // Weight for frequency in scoring
            promotionInterval: 60000, // Check every minute
            demotionInterval: 300000, // Check every 5 minutes
            maxL1Promotions: 10, // Max promotions to L1 per interval
            maxL2Promotions: 50, // Max promotions to L2 per interval
            enableAdaptiveThresholds: true,
            enablePredictivePromotion: true,
            ...options
        };
        
        this.accessPatterns = new Map(); // key -> AccessPattern
        this.promotionQueue = new Map(); // layer -> [keys]
        this.demotionQueue = new Map(); // layer -> [keys]
        this.cacheReferences = new Map(); // layer -> cache instance
        this.stats = {
            promotions: { l1: 0, l2: 0, l3: 0 },
            demotions: { l1: 0, l2: 0, l3: 0 },
            adaptiveAdjustments: 0,
            predictivePromotions: 0
        };
        
        this.isInitialized = false;
        this.initializeManager();
    }
    
    async initializeManager() {
        try {
            console.log('[Cache Promotion] Initializing cache promotion manager...');
            
            // Start promotion/demotion intervals
            this.startPromotionInterval();
            this.startDemotionInterval();
            
            this.isInitialized = true;
            this.emit('initialized');
            
        } catch (error) {
            console.error('[Cache Promotion] Initialization failed:', error);
            this.emit('initialization-failed', error);
        }
    }
    
    /**
     * Register cache instances
     */
    registerCache(layer, cacheInstance) {
        this.cacheReferences.set(layer, cacheInstance);
        
        // Listen to cache events
        cacheInstance.on('cache-hit', (event) => {
            this.recordAccess(event.key, layer, 'hit');
        });
        
        cacheInstance.on('cache-miss', (event) => {
            this.recordAccess(event.key, layer, 'miss');
        });
        
        console.log(`[Cache Promotion] Registered ${layer} cache`);
    }
    
    /**
     * Record access pattern
     */
    recordAccess(key, layer, type) {
        if (!this.accessPatterns.has(key)) {
            this.accessPatterns.set(key, {
                key,
                totalAccesses: 0,
                hits: 0,
                misses: 0,
                lastAccess: Date.now(),
                firstAccess: Date.now(),
                accessHistory: [],
                currentLayer: layer,
                promotionScore: 0,
                demotionScore: 0
            });
        }
        
        const pattern = this.accessPatterns.get(key);
        pattern.totalAccesses++;
        pattern.lastAccess = Date.now();
        pattern.currentLayer = layer;
        
        if (type === 'hit') {
            pattern.hits++;
        } else {
            pattern.misses++;
        }
        
        // Keep limited access history
        pattern.accessHistory.push({
            timestamp: Date.now(),
            layer,
            type
        });
        
        // Keep only recent history (last 100 accesses)
        if (pattern.accessHistory.length > 100) {
            pattern.accessHistory = pattern.accessHistory.slice(-100);
        }
        
        // Update scores
        this.updatePromotionScore(pattern);
        this.updateDemotionScore(pattern);
        
        // Check for immediate promotion/demotion
        this.checkImmediateActions(pattern);
    }
    
    /**
     * Update promotion score based on access patterns
     */
    updatePromotionScore(pattern) {
        const now = Date.now();
        const age = now - pattern.firstAccess;
        const recency = now - pattern.lastAccess;
        const frequency = pattern.totalAccesses / Math.max(age / 1000, 1); // accesses per second
        const hitRate = pattern.hits / Math.max(pattern.totalAccesses, 1);
        
        // Calculate recency score (higher for recent access)
        const recencyScore = Math.exp(-recency / 300000); // Decay over 5 minutes
        
        // Calculate frequency score
        const frequencyScore = Math.min(frequency * 100, 1); // Normalize
        
        // Calculate hit rate bonus
        const hitRateBonus = hitRate * 0.5;
        
        // Combined score
        pattern.promotionScore = 
            (this.options.recencyWeight * recencyScore) +
            (this.options.frequencyWeight * frequencyScore) +
            hitRateBonus;
        
        // Predictive promotion based on access pattern
        if (this.options.enablePredictivePromotion) {
            const predictiveScore = this.calculatePredictiveScore(pattern);
            pattern.promotionScore += predictiveScore * 0.2;
        }
    }
    
    /**
     * Update demotion score
     */
    updateDemotionScore(pattern) {
        const now = Date.now();
        const timeSinceLastAccess = now - pattern.lastAccess;
        const frequency = pattern.totalAccesses / Math.max(now - pattern.firstAccess, 1);
        
        // Higher demotion score means more likely to be demoted
        pattern.demotionScore = 
            (timeSinceLastAccess / 3600000) + // Hours since last access
            (1 - Math.min(frequency * 1000, 1)); // Inverse frequency
    }
    
    /**
     * Calculate predictive score based on access patterns
     */
    calculatePredictiveScore(pattern) {
        if (pattern.accessHistory.length < 5) return 0;
        
        const recentAccesses = pattern.accessHistory.slice(-10);
        const intervals = [];
        
        for (let i = 1; i < recentAccesses.length; i++) {
            intervals.push(recentAccesses[i].timestamp - recentAccesses[i-1].timestamp);
        }
        
        if (intervals.length === 0) return 0;
        
        // Calculate average interval
        const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
        
        // Calculate variance
        const variance = intervals.reduce((sum, interval) => 
            sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
        
        // Regular access patterns get higher predictive score
        const regularity = 1 / (1 + Math.sqrt(variance) / avgInterval);
        
        return regularity;
    }
    
    /**
     * Check for immediate promotion/demotion actions
     */
    checkImmediateActions(pattern) {
        // Immediate promotion conditions
        if (pattern.totalAccesses >= this.options.promotionThreshold) {
            if (pattern.currentLayer === 'l2' && pattern.promotionScore > 0.7) {
                this.queuePromotion(pattern.key, 'l1');
            } else if (pattern.currentLayer === 'l3' && pattern.promotionScore > 0.5) {
                this.queuePromotion(pattern.key, 'l2');
            }
        }
        
        // Immediate demotion conditions
        if (pattern.demotionScore > 2.0) {
            if (pattern.currentLayer === 'l1') {
                this.queueDemotion(pattern.key, 'l2');
            } else if (pattern.currentLayer === 'l2') {
                this.queueDemotion(pattern.key, 'l3');
            }
        }
    }
    
    /**
     * Queue item for promotion
     */
    queuePromotion(key, targetLayer) {
        if (!this.promotionQueue.has(targetLayer)) {
            this.promotionQueue.set(targetLayer, []);
        }
        
        const queue = this.promotionQueue.get(targetLayer);
        if (!queue.includes(key)) {
            queue.push(key);
            this.emit('promotion-queued', { key, targetLayer });
        }
    }
    
    /**
     * Queue item for demotion
     */
    queueDemotion(key, targetLayer) {
        if (!this.demotionQueue.has(targetLayer)) {
            this.demotionQueue.set(targetLayer, []);
        }
        
        const queue = this.demotionQueue.get(targetLayer);
        if (!queue.includes(key)) {
            queue.push(key);
            this.emit('demotion-queued', { key, targetLayer });
        }
    }
    
    /**
     * Start promotion interval
     */
    startPromotionInterval() {
        setInterval(async () => {
            await this.processPromotions();
        }, this.options.promotionInterval);
    }
    
    /**
     * Start demotion interval
     */
    startDemotionInterval() {
        setInterval(async () => {
            await this.processDemotions();
        }, this.options.demotionInterval);
    }
    
    /**
     * Process queued promotions
     */
    async processPromotions() {
        try {
            for (const [targetLayer, queue] of this.promotionQueue) {
                const maxPromotions = targetLayer === 'l1' ? 
                    this.options.maxL1Promotions : this.options.maxL2Promotions;
                
                // Sort by promotion score
                const sortedKeys = queue
                    .map(key => ({ key, score: this.accessPatterns.get(key)?.promotionScore || 0 }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, maxPromotions)
                    .map(item => item.key);
                
                for (const key of sortedKeys) {
                    await this.executePromotion(key, targetLayer);
                }
                
                // Clear processed items
                this.promotionQueue.set(targetLayer, 
                    queue.filter(key => !sortedKeys.includes(key)));
            }
            
        } catch (error) {
            console.error('[Cache Promotion] Promotion processing failed:', error);
        }
    }
    
    /**
     * Process queued demotions
     */
    async processDemotions() {
        try {
            for (const [targetLayer, queue] of this.demotionQueue) {
                // Sort by demotion score (highest first)
                const sortedKeys = queue
                    .map(key => ({ key, score: this.accessPatterns.get(key)?.demotionScore || 0 }))
                    .sort((a, b) => b.score - a.score)
                    .map(item => item.key);
                
                for (const key of sortedKeys) {
                    await this.executeDemotion(key, targetLayer);
                }
                
                // Clear processed items
                this.demotionQueue.set(targetLayer, []);
            }
            
        } catch (error) {
            console.error('[Cache Promotion] Demotion processing failed:', error);
        }
    }
    
    /**
     * Execute promotion
     */
    async executePromotion(key, targetLayer) {
        try {
            const pattern = this.accessPatterns.get(key);
            if (!pattern) return;
            
            const sourceLayer = pattern.currentLayer;
            const sourceCache = this.cacheReferences.get(sourceLayer);
            const targetCache = this.cacheReferences.get(targetLayer);
            
            if (!sourceCache || !targetCache) return;
            
            // Get data from source cache
            const [documentId, chunkId] = this.parseKey(key);
            const data = await sourceCache.get(documentId, chunkId);
            
            if (data) {
                // Store in target cache
                await targetCache.set(documentId, chunkId, data.embedding, data.metadata);
                
                // Update pattern
                pattern.currentLayer = targetLayer;
                
                this.stats.promotions[targetLayer]++;
                this.emit('promotion-executed', { key, sourceLayer, targetLayer });
            }
            
        } catch (error) {
            console.error('[Cache Promotion] Promotion execution failed:', error);
        }
    }
    
    /**
     * Execute demotion
     */
    async executeDemotion(key, targetLayer) {
        try {
            const pattern = this.accessPatterns.get(key);
            if (!pattern) return;
            
            const sourceLayer = pattern.currentLayer;
            const sourceCache = this.cacheReferences.get(sourceLayer);
            const targetCache = this.cacheReferences.get(targetLayer);
            
            if (!sourceCache || !targetCache) return;
            
            // Get data from source cache
            const [documentId, chunkId] = this.parseKey(key);
            const data = await sourceCache.get(documentId, chunkId);
            
            if (data) {
                // Store in target cache
                await targetCache.set(documentId, chunkId, data.embedding, data.metadata);
                
                // Remove from source cache (if it has a remove method)
                if (typeof sourceCache.remove === 'function') {
                    await sourceCache.remove(documentId, chunkId);
                }
                
                // Update pattern
                pattern.currentLayer = targetLayer;
                
                this.stats.demotions[sourceLayer]++;
                this.emit('demotion-executed', { key, sourceLayer, targetLayer });
            }
            
        } catch (error) {
            console.error('[Cache Promotion] Demotion execution failed:', error);
        }
    }
    
    /**
     * Parse key to extract documentId and chunkId
     */
    parseKey(key) {
        const parts = key.split(':');
        return [parts[0], parts[1]];
    }
    
    /**
     * Get promotion statistics
     */
    getStats() {
        return {
            ...this.stats,
            accessPatterns: this.accessPatterns.size,
            promotionQueue: Object.fromEntries(
                Array.from(this.promotionQueue.entries()).map(([k, v]) => [k, v.length])
            ),
            demotionQueue: Object.fromEntries(
                Array.from(this.demotionQueue.entries()).map(([k, v]) => [k, v.length])
            )
        };
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        this.accessPatterns.clear();
        this.promotionQueue.clear();
        this.demotionQueue.clear();
        this.cacheReferences.clear();
        this.removeAllListeners();
    }
}

module.exports = CachePromotionManager;
