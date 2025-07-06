/**
 * Cache Statistics and Monitoring
 * Implements comprehensive cache metrics including hit rates, latency,
 * memory usage, and performance analytics across all cache layers
 */

const EventEmitter = require('events');

class CacheStatisticsMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            monitoringInterval: 30000, // 30 seconds
            retentionPeriod: 86400000, // 24 hours
            enableDetailedMetrics: true,
            enablePerformanceAlerts: true,
            alertThresholds: {
                hitRate: 0.7, // Alert if hit rate < 70%
                latency: 1000, // Alert if latency > 1000ms
                memoryUsage: 0.9, // Alert if memory usage > 90%
                errorRate: 0.05 // Alert if error rate > 5%
            },
            enableTrendAnalysis: true,
            trendWindowSize: 100, // Number of data points for trend analysis
            ...options
        };
        
        this.cacheReferences = new Map(); // layer -> cache instance
        this.metrics = new Map(); // layer -> metrics
        this.historicalData = new Map(); // layer -> historical metrics
        this.alerts = [];
        this.trends = new Map(); // layer -> trend data
        
        this.globalStats = {
            totalRequests: 0,
            totalHits: 0,
            totalMisses: 0,
            totalErrors: 0,
            averageLatency: 0,
            totalLatency: 0,
            startTime: Date.now()
        };
        
        this.isInitialized = false;
        this.initializeMonitor();
    }
    
    async initializeMonitor() {
        try {
            console.log('[Cache Monitor] Initializing cache statistics monitor...');
            
            // Start monitoring interval
            this.startMonitoring();
            
            // Start cleanup interval for old data
            this.startCleanup();
            
            this.isInitialized = true;
            this.emit('initialized');
            
        } catch (error) {
            console.error('[Cache Monitor] Initialization failed:', error);
            this.emit('initialization-failed', error);
        }
    }
    
    /**
     * Register cache for monitoring
     */
    registerCache(layer, cacheInstance) {
        this.cacheReferences.set(layer, cacheInstance);
        
        // Initialize metrics for this layer
        this.metrics.set(layer, {
            hits: 0,
            misses: 0,
            errors: 0,
            totalRequests: 0,
            totalLatency: 0,
            averageLatency: 0,
            hitRate: 0,
            errorRate: 0,
            memoryUsage: 0,
            cacheSize: 0,
            lastUpdated: Date.now()
        });
        
        this.historicalData.set(layer, []);
        this.trends.set(layer, {
            hitRate: { trend: 'stable', change: 0 },
            latency: { trend: 'stable', change: 0 },
            memoryUsage: { trend: 'stable', change: 0 }
        });
        
        // Listen to cache events
        this.setupCacheEventListeners(layer, cacheInstance);
        
        console.log(`[Cache Monitor] Registered ${layer} cache for monitoring`);
    }
    
    /**
     * Setup event listeners for cache
     */
    setupCacheEventListeners(layer, cacheInstance) {
        cacheInstance.on('cache-hit', (event) => {
            this.recordHit(layer, event);
        });
        
        cacheInstance.on('cache-miss', (event) => {
            this.recordMiss(layer, event);
        });
        
        cacheInstance.on('cache-error', (event) => {
            this.recordError(layer, event);
        });
        
        cacheInstance.on('cache-set', (event) => {
            this.recordSet(layer, event);
        });
        
        // Listen for batch operations
        cacheInstance.on('batch-get', (event) => {
            this.recordBatchOperation(layer, 'get', event);
        });
        
        cacheInstance.on('batch-set', (event) => {
            this.recordBatchOperation(layer, 'set', event);
        });
    }
    
    /**
     * Record cache hit
     */
    recordHit(layer, event) {
        const metrics = this.metrics.get(layer);
        if (metrics) {
            metrics.hits++;
            metrics.totalRequests++;
            
            if (event.latency) {
                metrics.totalLatency += event.latency;
                metrics.averageLatency = metrics.totalLatency / metrics.totalRequests;
            }
            
            this.updateDerivedMetrics(layer);
            this.updateGlobalStats('hit', event.latency);
        }
    }
    
    /**
     * Record cache miss
     */
    recordMiss(layer, event) {
        const metrics = this.metrics.get(layer);
        if (metrics) {
            metrics.misses++;
            metrics.totalRequests++;
            
            if (event.latency) {
                metrics.totalLatency += event.latency;
                metrics.averageLatency = metrics.totalLatency / metrics.totalRequests;
            }
            
            this.updateDerivedMetrics(layer);
            this.updateGlobalStats('miss', event.latency);
        }
    }
    
    /**
     * Record cache error
     */
    recordError(layer, event) {
        const metrics = this.metrics.get(layer);
        if (metrics) {
            metrics.errors++;
            metrics.totalRequests++;
            
            this.updateDerivedMetrics(layer);
            this.updateGlobalStats('error');
        }
    }
    
    /**
     * Record cache set operation
     */
    recordSet(layer, event) {
        const metrics = this.metrics.get(layer);
        if (metrics && event.size) {
            // Update memory usage if size information is available
            metrics.memoryUsage += event.size;
        }
    }
    
    /**
     * Record batch operation
     */
    recordBatchOperation(layer, operation, event) {
        const metrics = this.metrics.get(layer);
        if (metrics) {
            if (operation === 'get') {
                metrics.hits += event.hits || 0;
                metrics.misses += (event.count - (event.hits || 0));
                metrics.totalRequests += event.count;
            }
            
            if (event.totalTime) {
                metrics.totalLatency += event.totalTime;
                metrics.averageLatency = metrics.totalLatency / metrics.totalRequests;
            }
            
            this.updateDerivedMetrics(layer);
        }
    }
    
    /**
     * Update derived metrics
     */
    updateDerivedMetrics(layer) {
        const metrics = this.metrics.get(layer);
        if (metrics) {
            metrics.hitRate = metrics.totalRequests > 0 ? 
                metrics.hits / metrics.totalRequests : 0;
            metrics.errorRate = metrics.totalRequests > 0 ? 
                metrics.errors / metrics.totalRequests : 0;
            metrics.lastUpdated = Date.now();
        }
    }
    
    /**
     * Update global statistics
     */
    updateGlobalStats(type, latency = 0) {
        this.globalStats.totalRequests++;
        
        switch (type) {
            case 'hit':
                this.globalStats.totalHits++;
                break;
            case 'miss':
                this.globalStats.totalMisses++;
                break;
            case 'error':
                this.globalStats.totalErrors++;
                break;
        }
        
        if (latency > 0) {
            this.globalStats.totalLatency += latency;
            this.globalStats.averageLatency = 
                this.globalStats.totalLatency / this.globalStats.totalRequests;
        }
    }
    
    /**
     * Start monitoring interval
     */
    startMonitoring() {
        setInterval(async () => {
            await this.collectMetrics();
            await this.analyzePerformance();
            
            if (this.options.enableTrendAnalysis) {
                await this.analyzeTrends();
            }
            
            if (this.options.enablePerformanceAlerts) {
                await this.checkAlerts();
            }
            
        }, this.options.monitoringInterval);
    }
    
    /**
     * Collect current metrics from all caches
     */
    async collectMetrics() {
        try {
            for (const [layer, cacheInstance] of this.cacheReferences) {
                const metrics = this.metrics.get(layer);
                if (metrics && typeof cacheInstance.getStats === 'function') {
                    const cacheStats = cacheInstance.getStats();
                    
                    // Update cache-specific metrics
                    if (cacheStats.cacheSize !== undefined) {
                        metrics.cacheSize = cacheStats.cacheSize;
                    }
                    
                    if (cacheStats.memoryUsage !== undefined) {
                        metrics.memoryUsage = cacheStats.memoryUsage;
                    }
                    
                    // Store historical data
                    const historical = this.historicalData.get(layer);
                    historical.push({
                        timestamp: Date.now(),
                        ...metrics
                    });
                    
                    // Keep only recent data
                    const cutoff = Date.now() - this.options.retentionPeriod;
                    this.historicalData.set(layer, 
                        historical.filter(data => data.timestamp > cutoff));
                }
            }
            
        } catch (error) {
            console.error('[Cache Monitor] Metrics collection failed:', error);
        }
    }
    
    /**
     * Analyze performance and generate insights
     */
    async analyzePerformance() {
        try {
            const analysis = {
                timestamp: Date.now(),
                layers: {},
                global: this.getGlobalStats(),
                recommendations: []
            };
            
            for (const [layer, metrics] of this.metrics) {
                analysis.layers[layer] = {
                    ...metrics,
                    performance: this.calculatePerformanceScore(metrics),
                    efficiency: this.calculateEfficiency(metrics)
                };
                
                // Generate recommendations
                const recommendations = this.generateRecommendations(layer, metrics);
                analysis.recommendations.push(...recommendations);
            }
            
            this.emit('performance-analysis', analysis);
            
        } catch (error) {
            console.error('[Cache Monitor] Performance analysis failed:', error);
        }
    }
    
    /**
     * Analyze trends in cache performance
     */
    async analyzeTrends() {
        try {
            for (const [layer, historical] of this.historicalData) {
                if (historical.length < 2) continue;
                
                const trends = this.trends.get(layer);
                const recent = historical.slice(-this.options.trendWindowSize);
                
                // Analyze hit rate trend
                trends.hitRate = this.calculateTrend(recent, 'hitRate');
                
                // Analyze latency trend
                trends.latency = this.calculateTrend(recent, 'averageLatency');
                
                // Analyze memory usage trend
                trends.memoryUsage = this.calculateTrend(recent, 'memoryUsage');
                
                this.emit('trend-analysis', { layer, trends });
            }
            
        } catch (error) {
            console.error('[Cache Monitor] Trend analysis failed:', error);
        }
    }
    
    /**
     * Calculate trend for a metric
     */
    calculateTrend(data, metric) {
        if (data.length < 2) return { trend: 'stable', change: 0 };
        
        const values = data.map(d => d[metric]).filter(v => v !== undefined);
        if (values.length < 2) return { trend: 'stable', change: 0 };
        
        const first = values[0];
        const last = values[values.length - 1];
        const change = ((last - first) / first) * 100;
        
        let trend = 'stable';
        if (Math.abs(change) > 5) {
            trend = change > 0 ? 'increasing' : 'decreasing';
        }
        
        return { trend, change: change.toFixed(2) };
    }
    
    /**
     * Check for performance alerts
     */
    async checkAlerts() {
        try {
            const now = Date.now();
            
            for (const [layer, metrics] of this.metrics) {
                const alerts = [];
                
                // Check hit rate
                if (metrics.hitRate < this.options.alertThresholds.hitRate) {
                    alerts.push({
                        type: 'low_hit_rate',
                        layer,
                        value: metrics.hitRate,
                        threshold: this.options.alertThresholds.hitRate,
                        severity: 'warning'
                    });
                }
                
                // Check latency
                if (metrics.averageLatency > this.options.alertThresholds.latency) {
                    alerts.push({
                        type: 'high_latency',
                        layer,
                        value: metrics.averageLatency,
                        threshold: this.options.alertThresholds.latency,
                        severity: 'warning'
                    });
                }
                
                // Check error rate
                if (metrics.errorRate > this.options.alertThresholds.errorRate) {
                    alerts.push({
                        type: 'high_error_rate',
                        layer,
                        value: metrics.errorRate,
                        threshold: this.options.alertThresholds.errorRate,
                        severity: 'critical'
                    });
                }
                
                // Store and emit alerts
                for (const alert of alerts) {
                    alert.timestamp = now;
                    this.alerts.push(alert);
                    this.emit('performance-alert', alert);
                }
            }
            
            // Clean old alerts
            this.alerts = this.alerts.filter(alert => 
                now - alert.timestamp < this.options.retentionPeriod);
            
        } catch (error) {
            console.error('[Cache Monitor] Alert checking failed:', error);
        }
    }
    
    /**
     * Calculate performance score
     */
    calculatePerformanceScore(metrics) {
        const hitRateScore = metrics.hitRate * 40; // 40% weight
        const latencyScore = Math.max(0, 30 - (metrics.averageLatency / 100)) * 30; // 30% weight
        const errorScore = Math.max(0, 30 - (metrics.errorRate * 100)) * 30; // 30% weight
        
        return Math.min(100, hitRateScore + latencyScore + errorScore);
    }
    
    /**
     * Calculate efficiency score
     */
    calculateEfficiency(metrics) {
        if (metrics.totalRequests === 0) return 0;
        
        const requestsPerSecond = metrics.totalRequests / 
            ((Date.now() - this.globalStats.startTime) / 1000);
        
        return Math.min(100, requestsPerSecond * 10); // Normalize to 0-100
    }
    
    /**
     * Generate performance recommendations
     */
    generateRecommendations(layer, metrics) {
        const recommendations = [];
        
        if (metrics.hitRate < 0.7) {
            recommendations.push({
                layer,
                type: 'hit_rate',
                message: `Consider increasing cache size or adjusting eviction policy for ${layer}`,
                priority: 'medium'
            });
        }
        
        if (metrics.averageLatency > 500) {
            recommendations.push({
                layer,
                type: 'latency',
                message: `High latency detected in ${layer}. Consider optimizing data access patterns`,
                priority: 'high'
            });
        }
        
        if (metrics.errorRate > 0.01) {
            recommendations.push({
                layer,
                type: 'errors',
                message: `Error rate is elevated in ${layer}. Check system health and connectivity`,
                priority: 'critical'
            });
        }
        
        return recommendations;
    }
    
    /**
     * Get comprehensive statistics
     */
    getStats() {
        return {
            global: this.getGlobalStats(),
            layers: Object.fromEntries(this.metrics),
            trends: Object.fromEntries(this.trends),
            alerts: this.alerts.slice(-10), // Last 10 alerts
            uptime: Date.now() - this.globalStats.startTime
        };
    }
    
    /**
     * Get global statistics
     */
    getGlobalStats() {
        const totalRequests = this.globalStats.totalRequests;
        
        return {
            ...this.globalStats,
            globalHitRate: totalRequests > 0 ? 
                this.globalStats.totalHits / totalRequests : 0,
            globalErrorRate: totalRequests > 0 ? 
                this.globalStats.totalErrors / totalRequests : 0,
            uptime: Date.now() - this.globalStats.startTime
        };
    }
    
    /**
     * Start cleanup interval
     */
    startCleanup() {
        setInterval(() => {
            const cutoff = Date.now() - this.options.retentionPeriod;
            
            // Clean historical data
            for (const [layer, historical] of this.historicalData) {
                this.historicalData.set(layer, 
                    historical.filter(data => data.timestamp > cutoff));
            }
            
            // Clean old alerts
            this.alerts = this.alerts.filter(alert => 
                alert.timestamp > cutoff);
            
        }, 3600000); // Clean every hour
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        this.cacheReferences.clear();
        this.metrics.clear();
        this.historicalData.clear();
        this.trends.clear();
        this.alerts = [];
        this.removeAllListeners();
    }
}

module.exports = CacheStatisticsMonitor;
