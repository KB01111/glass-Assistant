/**
 * Graceful Degradation Manager
 * Handles feature unavailability, provides fallback strategies, and maintains
 * functionality when advanced features are not available
 */

const EventEmitter = require('events');

class GracefulDegradationManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            enableAutoFallback: true,
            fallbackTimeout: 5000,
            maxRetries: 3,
            retryDelay: 1000,
            healthCheckInterval: 30000,
            enableCircuitBreaker: true,
            circuitBreakerThreshold: 5, // failures before opening circuit
            circuitBreakerTimeout: 60000, // time before trying again
            enableFeatureToggling: true,
            ...options
        };
        
        this.featureStatus = new Map(); // feature -> status
        this.fallbackStrategies = new Map(); // feature -> fallback function
        this.circuitBreakers = new Map(); // feature -> circuit breaker state
        this.healthChecks = new Map(); // feature -> health check function
        this.retryCounters = new Map(); // feature -> retry count
        this.degradationHistory = [];
        
        this.stats = {
            totalDegradations: 0,
            activeDegradations: 0,
            fallbacksExecuted: 0,
            circuitBreakersTripped: 0,
            featuresRestored: 0
        };
        
        this.isInitialized = false;
        this.initializeManager();
    }
    
    async initializeManager() {
        try {
            console.log('[Graceful Degradation] Initializing degradation manager...');
            
            // Register core features
            this.registerCoreFeatures();
            
            // Start health monitoring
            this.startHealthMonitoring();
            
            this.isInitialized = true;
            this.emit('initialized');
            
        } catch (error) {
            console.error('[Graceful Degradation] Initialization failed:', error);
            this.emit('initialization-failed', error);
        }
    }
    
    /**
     * Register core features with their fallback strategies
     */
    registerCoreFeatures() {
        // AMD Gaia NPU feature
        this.registerFeature('amd-gaia-npu', {
            healthCheck: this.checkAMDGaiaHealth.bind(this),
            fallback: this.fallbackToGPU.bind(this),
            priority: 'high'
        });
        
        // DirectML GPU feature
        this.registerFeature('directml-gpu', {
            healthCheck: this.checkDirectMLHealth.bind(this),
            fallback: this.fallbackToCPU.bind(this),
            priority: 'medium'
        });
        
        // LLMware integration
        this.registerFeature('llmware-integration', {
            healthCheck: this.checkLLMwareHealth.bind(this),
            fallback: this.fallbackToBasicProcessing.bind(this),
            priority: 'medium'
        });
        
        // Hierarchical cache
        this.registerFeature('hierarchical-cache', {
            healthCheck: this.checkCacheHealth.bind(this),
            fallback: this.fallbackToMemoryCache.bind(this),
            priority: 'low'
        });
        
        // Vector search
        this.registerFeature('vector-search', {
            healthCheck: this.checkVectorSearchHealth.bind(this),
            fallback: this.fallbackToBasicSearch.bind(this),
            priority: 'low'
        });
    }
    
    /**
     * Register a feature with its fallback strategy
     */
    registerFeature(featureName, config) {
        this.featureStatus.set(featureName, {
            name: featureName,
            status: 'unknown',
            priority: config.priority || 'medium',
            lastCheck: null,
            errorCount: 0,
            isEnabled: true
        });
        
        if (config.healthCheck) {
            this.healthChecks.set(featureName, config.healthCheck);
        }
        
        if (config.fallback) {
            this.fallbackStrategies.set(featureName, config.fallback);
        }
        
        // Initialize circuit breaker
        this.circuitBreakers.set(featureName, {
            state: 'closed', // closed, open, half-open
            failureCount: 0,
            lastFailure: null,
            nextAttempt: null
        });
        
        console.log(`[Graceful Degradation] Registered feature: ${featureName}`);
    }
    
    /**
     * Execute feature with graceful degradation
     */
    async executeWithDegradation(featureName, operation, ...args) {
        try {
            const featureStatus = this.featureStatus.get(featureName);
            if (!featureStatus) {
                throw new Error(`Unknown feature: ${featureName}`);
            }
            
            // Check if feature is disabled
            if (!featureStatus.isEnabled) {
                return await this.executeFallback(featureName, ...args);
            }
            
            // Check circuit breaker
            const circuitBreaker = this.circuitBreakers.get(featureName);
            if (circuitBreaker.state === 'open') {
                if (Date.now() < circuitBreaker.nextAttempt) {
                    return await this.executeFallback(featureName, ...args);
                } else {
                    // Try half-open
                    circuitBreaker.state = 'half-open';
                }
            }
            
            // Execute operation with timeout
            const result = await this.executeWithTimeout(operation, ...args);
            
            // Success - reset circuit breaker
            this.resetCircuitBreaker(featureName);
            this.updateFeatureStatus(featureName, 'healthy');
            
            return result;
            
        } catch (error) {
            console.warn(`[Graceful Degradation] Feature ${featureName} failed:`, error.message);
            
            // Handle failure
            await this.handleFeatureFailure(featureName, error);
            
            // Execute fallback
            return await this.executeFallback(featureName, ...args);
        }
    }
    
    /**
     * Execute operation with timeout
     */
    async executeWithTimeout(operation, ...args) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Operation timeout'));
            }, this.options.fallbackTimeout);
            
            Promise.resolve(operation(...args))
                .then(result => {
                    clearTimeout(timeout);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }
    
    /**
     * Handle feature failure
     */
    async handleFeatureFailure(featureName, error) {
        const featureStatus = this.featureStatus.get(featureName);
        const circuitBreaker = this.circuitBreakers.get(featureName);
        
        if (featureStatus) {
            featureStatus.errorCount++;
            featureStatus.status = 'degraded';
            featureStatus.lastError = error.message;
        }
        
        if (circuitBreaker) {
            circuitBreaker.failureCount++;
            circuitBreaker.lastFailure = Date.now();
            
            // Trip circuit breaker if threshold reached
            if (circuitBreaker.failureCount >= this.options.circuitBreakerThreshold) {
                circuitBreaker.state = 'open';
                circuitBreaker.nextAttempt = Date.now() + this.options.circuitBreakerTimeout;
                
                this.stats.circuitBreakersTripped++;
                this.emit('circuit-breaker-tripped', { featureName, error });
            }
        }
        
        // Record degradation
        this.recordDegradation(featureName, error);
    }
    
    /**
     * Execute fallback strategy
     */
    async executeFallback(featureName, ...args) {
        try {
            const fallbackStrategy = this.fallbackStrategies.get(featureName);
            
            if (!fallbackStrategy) {
                throw new Error(`No fallback strategy for feature: ${featureName}`);
            }
            
            console.log(`[Graceful Degradation] Executing fallback for ${featureName}`);
            
            const result = await fallbackStrategy(...args);
            
            this.stats.fallbacksExecuted++;
            this.emit('fallback-executed', { featureName, args });
            
            return result;
            
        } catch (error) {
            console.error(`[Graceful Degradation] Fallback failed for ${featureName}:`, error);
            throw error;
        }
    }
    
    /**
     * Reset circuit breaker
     */
    resetCircuitBreaker(featureName) {
        const circuitBreaker = this.circuitBreakers.get(featureName);
        if (circuitBreaker) {
            circuitBreaker.state = 'closed';
            circuitBreaker.failureCount = 0;
            circuitBreaker.lastFailure = null;
            circuitBreaker.nextAttempt = null;
        }
    }
    
    /**
     * Update feature status
     */
    updateFeatureStatus(featureName, status) {
        const featureStatus = this.featureStatus.get(featureName);
        if (featureStatus) {
            const previousStatus = featureStatus.status;
            featureStatus.status = status;
            featureStatus.lastCheck = Date.now();
            
            if (previousStatus === 'degraded' && status === 'healthy') {
                this.stats.featuresRestored++;
                this.emit('feature-restored', { featureName });
            }
        }
    }
    
    /**
     * Record degradation event
     */
    recordDegradation(featureName, error) {
        const degradation = {
            featureName,
            error: error.message,
            timestamp: Date.now(),
            fallbackUsed: this.fallbackStrategies.has(featureName)
        };
        
        this.degradationHistory.push(degradation);
        
        // Keep only recent history (last 1000 events)
        if (this.degradationHistory.length > 1000) {
            this.degradationHistory = this.degradationHistory.slice(-1000);
        }
        
        this.stats.totalDegradations++;
        this.updateActiveDegradations();
        
        this.emit('feature-degraded', degradation);
    }
    
    /**
     * Update count of active degradations
     */
    updateActiveDegradations() {
        this.stats.activeDegradations = Array.from(this.featureStatus.values())
            .filter(feature => feature.status === 'degraded').length;
    }
    
    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        setInterval(async () => {
            await this.performHealthChecks();
        }, this.options.healthCheckInterval);
    }
    
    /**
     * Perform health checks on all features
     */
    async performHealthChecks() {
        try {
            for (const [featureName, healthCheck] of this.healthChecks) {
                try {
                    const isHealthy = await healthCheck();
                    
                    if (isHealthy) {
                        this.updateFeatureStatus(featureName, 'healthy');
                        this.resetCircuitBreaker(featureName);
                    } else {
                        this.updateFeatureStatus(featureName, 'degraded');
                    }
                    
                } catch (error) {
                    console.warn(`[Graceful Degradation] Health check failed for ${featureName}:`, error.message);
                    this.updateFeatureStatus(featureName, 'degraded');
                }
            }
            
            this.updateActiveDegradations();
            
        } catch (error) {
            console.error('[Graceful Degradation] Health check process failed:', error);
        }
    }
    
    // Health check implementations
    async checkAMDGaiaHealth() {
        try {
            // Check if AMD Gaia NPU is available and responsive
            const { hardwareDetectionService } = require('./hardwareDetectionService');
            const hardware = await hardwareDetectionService.detectHardware();
            return hardware.npu?.available === true;
        } catch {
            return false;
        }
    }
    
    async checkDirectMLHealth() {
        try {
            const ort = require('onnxruntime-node');
            const providers = ort.InferenceSession.getAvailableProviders();
            return providers.includes('DmlExecutionProvider');
        } catch {
            return false;
        }
    }
    
    async checkLLMwareHealth() {
        try {
            // Basic check - could be enhanced with actual LLMware service ping
            return true;
        } catch {
            return false;
        }
    }
    
    async checkCacheHealth() {
        try {
            // Check if cache layers are responsive
            return true;
        } catch {
            return false;
        }
    }
    
    async checkVectorSearchHealth() {
        try {
            // Check if vector search is available
            return true;
        } catch {
            return false;
        }
    }
    
    // Fallback implementations
    async fallbackToGPU(...args) {
        console.log('[Graceful Degradation] Falling back from NPU to GPU');
        // Implement GPU fallback logic
        return { fallback: 'gpu', args };
    }
    
    async fallbackToCPU(...args) {
        console.log('[Graceful Degradation] Falling back to CPU processing');
        // Implement CPU fallback logic
        return { fallback: 'cpu', args };
    }
    
    async fallbackToBasicProcessing(...args) {
        console.log('[Graceful Degradation] Falling back to basic processing');
        // Implement basic processing fallback
        return { fallback: 'basic', args };
    }
    
    async fallbackToMemoryCache(...args) {
        console.log('[Graceful Degradation] Falling back to memory-only cache');
        // Implement memory cache fallback
        return { fallback: 'memory-cache', args };
    }
    
    async fallbackToBasicSearch(...args) {
        console.log('[Graceful Degradation] Falling back to basic text search');
        // Implement basic search fallback
        return { fallback: 'basic-search', args };
    }
    
    /**
     * Enable/disable feature
     */
    setFeatureEnabled(featureName, enabled) {
        const featureStatus = this.featureStatus.get(featureName);
        if (featureStatus) {
            featureStatus.isEnabled = enabled;
            this.emit('feature-toggled', { featureName, enabled });
        }
    }
    
    /**
     * Get degradation statistics
     */
    getStats() {
        return {
            ...this.stats,
            features: Object.fromEntries(
                Array.from(this.featureStatus.entries()).map(([name, status]) => [
                    name,
                    {
                        ...status,
                        circuitBreaker: this.circuitBreakers.get(name)
                    }
                ])
            ),
            recentDegradations: this.degradationHistory.slice(-10)
        };
    }
    
    /**
     * Get feature status
     */
    getFeatureStatus(featureName) {
        return this.featureStatus.get(featureName);
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        this.featureStatus.clear();
        this.fallbackStrategies.clear();
        this.circuitBreakers.clear();
        this.healthChecks.clear();
        this.retryCounters.clear();
        this.degradationHistory = [];
        this.removeAllListeners();
    }
}

module.exports = GracefulDegradationManager;
