/**
 * Error Recovery System
 * Implements automatic error recovery, retry mechanisms, and graceful degradation
 */

const EventEmitter = require('events');

class ErrorRecoverySystem extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            maxRetries: 3,
            retryDelayMs: 1000,
            exponentialBackoff: true,
            maxBackoffMs: 30000,
            enableCircuitBreaker: true,
            circuitBreakerThreshold: 5,
            circuitBreakerTimeoutMs: 60000,
            enableGracefulDegradation: true,
            ...options
        };
        
        this.retryStrategies = new Map();
        this.circuitBreakers = new Map();
        this.errorHistory = [];
        this.recoveryActions = new Map();
        this.fallbackManager = options.fallbackManager;
        
        this.stats = {
            totalErrors: 0,
            recoveredErrors: 0,
            failedRecoveries: 0,
            circuitBreakerTrips: 0,
            gracefulDegradations: 0
        };
        
        this.initializeDefaultStrategies();
    }
    
    initializeDefaultStrategies() {
        // Hardware failure recovery
        this.registerRetryStrategy('hardware_failure', {
            maxRetries: 2,
            retryDelay: 2000,
            shouldRetry: (error) => error.code === 'HARDWARE_UNAVAILABLE',
            recoveryAction: async (error, context) => {
                if (this.fallbackManager) {
                    return await this.fallbackManager.triggerFallback(context.device, error);
                }
                return false;
            }
        });
        
        // Memory allocation failure recovery
        this.registerRetryStrategy('memory_failure', {
            maxRetries: 3,
            retryDelay: 1000,
            shouldRetry: (error) => error.code === 'OUT_OF_MEMORY',
            recoveryAction: async (error, context) => {
                // Force garbage collection
                if (global.gc) {
                    global.gc();
                }
                
                // Reduce batch size if available
                if (context.batchSize && context.batchSize > 1) {
                    context.batchSize = Math.max(1, Math.floor(context.batchSize / 2));
                    return true;
                }
                
                return false;
            }
        });
        
        // Network failure recovery
        this.registerRetryStrategy('network_failure', {
            maxRetries: 5,
            retryDelay: 2000,
            exponentialBackoff: true,
            shouldRetry: (error) => error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT',
            recoveryAction: async (error, context) => {
                // Switch to local processing if available
                if (context.enableLocalFallback) {
                    context.useLocalProcessing = true;
                    return true;
                }
                return false;
            }
        });
        
        // Model loading failure recovery
        this.registerRetryStrategy('model_failure', {
            maxRetries: 2,
            retryDelay: 3000,
            shouldRetry: (error) => error.code === 'MODEL_LOAD_FAILED',
            recoveryAction: async (error, context) => {
                // Try alternative model format
                if (context.alternativeModelPath) {
                    context.modelPath = context.alternativeModelPath;
                    return true;
                }
                
                // Use CPU fallback model
                if (context.cpuFallbackModel) {
                    context.modelPath = context.cpuFallbackModel;
                    context.device = 'cpu';
                    return true;
                }
                
                return false;
            }
        });
    }
    
    registerRetryStrategy(errorType, strategy) {
        this.retryStrategies.set(errorType, {
            maxRetries: this.options.maxRetries,
            retryDelay: this.options.retryDelayMs,
            exponentialBackoff: this.options.exponentialBackoff,
            shouldRetry: () => true,
            recoveryAction: null,
            ...strategy
        });
    }
    
    async executeWithRecovery(operation, context = {}, errorType = 'default') {
        const strategy = this.retryStrategies.get(errorType) || this.getDefaultStrategy();
        const operationId = this.generateOperationId();
        
        // Check circuit breaker
        if (this.isCircuitBreakerOpen(errorType)) {
            throw new Error(`Circuit breaker open for ${errorType}`);
        }
        
        let lastError = null;
        let attempt = 0;
        
        while (attempt <= strategy.maxRetries) {
            try {
                const result = await operation(context);
                
                // Reset circuit breaker on success
                this.resetCircuitBreaker(errorType);
                
                if (attempt > 0) {
                    this.stats.recoveredErrors++;
                    this.emit('recovery-success', {
                        operationId,
                        errorType,
                        attempt,
                        context
                    });
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                this.stats.totalErrors++;
                
                this.recordError(error, errorType, attempt, context);
                
                // Check if we should retry
                if (attempt >= strategy.maxRetries || !strategy.shouldRetry(error)) {
                    break;
                }
                
                // Attempt recovery
                const recovered = await this.attemptRecovery(error, context, strategy);
                
                if (!recovered && !this.shouldRetryAfterFailure(error, strategy)) {
                    break;
                }
                
                // Calculate delay with exponential backoff
                const delay = this.calculateRetryDelay(attempt, strategy);
                
                this.emit('retry-attempt', {
                    operationId,
                    errorType,
                    attempt: attempt + 1,
                    delay,
                    error: error.message
                });
                
                await this.sleep(delay);
                attempt++;
            }
        }
        
        // All retries failed
        this.stats.failedRecoveries++;
        this.updateCircuitBreaker(errorType);
        
        // Attempt graceful degradation
        if (this.options.enableGracefulDegradation) {
            const degradedResult = await this.attemptGracefulDegradation(lastError, context, errorType);
            if (degradedResult !== null) {
                this.stats.gracefulDegradations++;
                this.emit('graceful-degradation', {
                    operationId,
                    errorType,
                    originalError: lastError.message,
                    degradedResult
                });
                return degradedResult;
            }
        }
        
        this.emit('recovery-failed', {
            operationId,
            errorType,
            attempts: attempt,
            finalError: lastError.message,
            context
        });
        
        throw lastError;
    }
    
    async attemptRecovery(error, context, strategy) {
        try {
            if (strategy.recoveryAction) {
                const recovered = await strategy.recoveryAction(error, context);
                
                if (recovered) {
                    this.emit('recovery-action-success', {
                        error: error.message,
                        context
                    });
                    return true;
                }
            }
            
            return false;
            
        } catch (recoveryError) {
            this.emit('recovery-action-failed', {
                originalError: error.message,
                recoveryError: recoveryError.message,
                context
            });
            return false;
        }
    }
    
    async attemptGracefulDegradation(error, context, errorType) {
        try {
            // Hardware degradation
            if (errorType === 'hardware_failure') {
                if (context.device === 'npu' && this.fallbackManager) {
                    context.device = 'cpu';
                    return { degraded: true, fallbackDevice: 'cpu' };
                }
            }
            
            // Quality degradation
            if (errorType === 'memory_failure') {
                if (context.quality && context.quality > 'low') {
                    context.quality = 'low';
                    context.batchSize = 1;
                    return { degraded: true, quality: 'low' };
                }
            }
            
            // Feature degradation
            if (errorType === 'model_failure') {
                if (context.enableAdvancedFeatures) {
                    context.enableAdvancedFeatures = false;
                    return { degraded: true, features: 'basic' };
                }
            }
            
            return null;
            
        } catch (degradationError) {
            this.emit('degradation-failed', {
                originalError: error.message,
                degradationError: degradationError.message,
                context
            });
            return null;
        }
    }
    
    shouldRetryAfterFailure(error, strategy) {
        // Don't retry certain types of errors
        const nonRetryableErrors = [
            'INVALID_INPUT',
            'PERMISSION_DENIED',
            'NOT_FOUND',
            'INVALID_CONFIGURATION'
        ];
        
        return !nonRetryableErrors.includes(error.code);
    }
    
    calculateRetryDelay(attempt, strategy) {
        let delay = strategy.retryDelay;
        
        if (strategy.exponentialBackoff) {
            delay = Math.min(
                strategy.retryDelay * Math.pow(2, attempt),
                this.options.maxBackoffMs
            );
        }
        
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.1 * delay;
        return Math.floor(delay + jitter);
    }
    
    recordError(error, errorType, attempt, context) {
        const errorRecord = {
            timestamp: Date.now(),
            error: {
                message: error.message,
                code: error.code,
                stack: error.stack
            },
            errorType,
            attempt,
            context: this.sanitizeContext(context)
        };
        
        this.errorHistory.push(errorRecord);
        
        // Keep only recent errors
        if (this.errorHistory.length > 1000) {
            this.errorHistory = this.errorHistory.slice(-500);
        }
        
        this.emit('error-recorded', errorRecord);
    }
    
    sanitizeContext(context) {
        // Remove sensitive information from context
        const sanitized = { ...context };
        delete sanitized.apiKey;
        delete sanitized.password;
        delete sanitized.token;
        return sanitized;
    }
    
    // Circuit Breaker Implementation
    isCircuitBreakerOpen(errorType) {
        if (!this.options.enableCircuitBreaker) return false;
        
        const breaker = this.circuitBreakers.get(errorType);
        if (!breaker) return false;
        
        if (breaker.state === 'open') {
            // Check if timeout has passed
            if (Date.now() - breaker.lastFailure > this.options.circuitBreakerTimeoutMs) {
                breaker.state = 'half-open';
                breaker.consecutiveFailures = 0;
                return false;
            }
            return true;
        }
        
        return false;
    }
    
    updateCircuitBreaker(errorType) {
        if (!this.options.enableCircuitBreaker) return;
        
        if (!this.circuitBreakers.has(errorType)) {
            this.circuitBreakers.set(errorType, {
                state: 'closed',
                consecutiveFailures: 0,
                lastFailure: 0
            });
        }
        
        const breaker = this.circuitBreakers.get(errorType);
        breaker.consecutiveFailures++;
        breaker.lastFailure = Date.now();
        
        if (breaker.consecutiveFailures >= this.options.circuitBreakerThreshold) {
            breaker.state = 'open';
            this.stats.circuitBreakerTrips++;
            
            this.emit('circuit-breaker-opened', {
                errorType,
                consecutiveFailures: breaker.consecutiveFailures
            });
        }
    }
    
    resetCircuitBreaker(errorType) {
        if (!this.options.enableCircuitBreaker) return;
        
        const breaker = this.circuitBreakers.get(errorType);
        if (breaker) {
            breaker.state = 'closed';
            breaker.consecutiveFailures = 0;
            
            this.emit('circuit-breaker-reset', { errorType });
        }
    }
    
    getDefaultStrategy() {
        return {
            maxRetries: this.options.maxRetries,
            retryDelay: this.options.retryDelayMs,
            exponentialBackoff: this.options.exponentialBackoff,
            shouldRetry: () => true,
            recoveryAction: null
        };
    }
    
    generateOperationId() {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    getErrorStats(timeWindowMs = 3600000) { // 1 hour default
        const cutoff = Date.now() - timeWindowMs;
        const recentErrors = this.errorHistory.filter(e => e.timestamp > cutoff);
        
        const errorsByType = {};
        for (const error of recentErrors) {
            if (!errorsByType[error.errorType]) {
                errorsByType[error.errorType] = 0;
            }
            errorsByType[error.errorType]++;
        }
        
        return {
            ...this.stats,
            recentErrors: recentErrors.length,
            errorsByType,
            circuitBreakerStates: Object.fromEntries(this.circuitBreakers),
            recoveryRate: this.stats.totalErrors > 0 ? 
                this.stats.recoveredErrors / this.stats.totalErrors : 0
        };
    }
    
    getCircuitBreakerStatus() {
        const status = {};
        for (const [errorType, breaker] of this.circuitBreakers) {
            status[errorType] = {
                state: breaker.state,
                consecutiveFailures: breaker.consecutiveFailures,
                lastFailure: breaker.lastFailure,
                isOpen: this.isCircuitBreakerOpen(errorType)
            };
        }
        return status;
    }
    
    dispose() {
        this.retryStrategies.clear();
        this.circuitBreakers.clear();
        this.errorHistory = [];
        this.recoveryActions.clear();
        this.removeAllListeners();
        
        console.log('[ErrorRecovery] Error recovery system disposed');
    }
}

module.exports = ErrorRecoverySystem;
