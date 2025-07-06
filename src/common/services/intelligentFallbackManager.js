/**
 * Intelligent Fallback Manager
 * Implements performance history tracking, device health monitoring, and optimal device selection
 */

const EventEmitter = require('events');

class DevicePerformanceTracker {
    constructor(deviceType) {
        this.deviceType = deviceType;
        this.performanceHistory = [];
        this.healthHistory = [];
        this.currentHealth = 'unknown';
        this.averageLatency = 0;
        this.successRate = 1.0;
        this.lastHealthCheck = 0;
        
        this.stats = {
            totalInferences: 0,
            successfulInferences: 0,
            failedInferences: 0,
            totalLatency: 0,
            minLatency: Infinity,
            maxLatency: 0
        };
    }
    
    recordInference(latency, success, metadata = {}) {
        const record = {
            timestamp: Date.now(),
            latency,
            success,
            metadata
        };
        
        this.performanceHistory.push(record);
        
        // Keep only recent history (last 1000 records)
        if (this.performanceHistory.length > 1000) {
            this.performanceHistory = this.performanceHistory.slice(-500);
        }
        
        // Update statistics
        this.stats.totalInferences++;
        if (success) {
            this.stats.successfulInferences++;
            this.stats.totalLatency += latency;
            this.stats.minLatency = Math.min(this.stats.minLatency, latency);
            this.stats.maxLatency = Math.max(this.stats.maxLatency, latency);
        } else {
            this.stats.failedInferences++;
        }
        
        // Update derived metrics
        this.successRate = this.stats.successfulInferences / this.stats.totalInferences;
        this.averageLatency = this.stats.successfulInferences > 0 ? 
            this.stats.totalLatency / this.stats.successfulInferences : 0;
    }
    
    recordHealthCheck(health, details = {}) {
        const record = {
            timestamp: Date.now(),
            health,
            details
        };
        
        this.healthHistory.push(record);
        this.currentHealth = health;
        this.lastHealthCheck = Date.now();
        
        // Keep only recent health history
        if (this.healthHistory.length > 100) {
            this.healthHistory = this.healthHistory.slice(-50);
        }
    }
    
    getPerformanceScore() {
        if (this.stats.totalInferences === 0) {
            return 0.5; // Neutral score for untested devices
        }
        
        // Calculate composite score based on success rate and latency
        let score = this.successRate * 0.7; // 70% weight on success rate
        
        // Add latency component (lower latency = higher score)
        if (this.averageLatency > 0) {
            const latencyScore = Math.max(0, 1 - (this.averageLatency / 10000)); // Normalize to 10s max
            score += latencyScore * 0.3; // 30% weight on latency
        }
        
        // Apply health penalty
        if (this.currentHealth === 'critical') {
            score *= 0.1;
        } else if (this.currentHealth === 'warning') {
            score *= 0.5;
        } else if (this.currentHealth === 'unknown') {
            score *= 0.7;
        }
        
        return Math.max(0, Math.min(1, score));
    }
    
    getRecentPerformance(timeWindowMs = 300000) { // 5 minutes
        const cutoff = Date.now() - timeWindowMs;
        const recentRecords = this.performanceHistory.filter(record => record.timestamp > cutoff);
        
        if (recentRecords.length === 0) {
            return {
                successRate: this.successRate,
                averageLatency: this.averageLatency,
                sampleSize: 0
            };
        }
        
        const successful = recentRecords.filter(r => r.success);
        const recentSuccessRate = successful.length / recentRecords.length;
        const recentAverageLatency = successful.length > 0 ?
            successful.reduce((sum, r) => sum + r.latency, 0) / successful.length : 0;
        
        return {
            successRate: recentSuccessRate,
            averageLatency: recentAverageLatency,
            sampleSize: recentRecords.length
        };
    }
    
    isHealthy() {
        return this.currentHealth === 'healthy';
    }
    
    needsHealthCheck(maxAge = 60000) { // 1 minute
        return Date.now() - this.lastHealthCheck > maxAge;
    }
}

class IntelligentFallbackManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            healthCheckInterval: 60000, // 1 minute
            performanceWindowMs: 300000, // 5 minutes
            minSuccessRate: 0.8,
            maxLatencyMs: 5000,
            fallbackCooldownMs: 30000, // 30 seconds
            enableAdaptiveFallback: true,
            ...options
        };
        
        this.devices = new Map(); // deviceType -> DevicePerformanceTracker
        this.fallbackOrder = ['npu', 'gpu', 'cpu'];
        this.currentDevice = null;
        this.fallbackCooldowns = new Map(); // deviceType -> timestamp
        this.hardwareManager = options.hardwareManager;
        
        this.stats = {
            totalRequests: 0,
            fallbacksTriggered: 0,
            deviceSwitches: 0,
            healthChecksPerformed: 0
        };
        
        this.initializeDevices();
        this.startHealthMonitoring();
    }
    
    initializeDevices() {
        for (const deviceType of this.fallbackOrder) {
            this.devices.set(deviceType, new DevicePerformanceTracker(deviceType));
        }
        
        // Set initial device
        this.currentDevice = this.fallbackOrder[0];
        
        console.log('[FallbackManager] Initialized with devices:', this.fallbackOrder);
    }
    
    async selectOptimalDevice(workloadType = 'inference', options = {}) {
        try {
            this.stats.totalRequests++;
            
            // Check if current device is still optimal
            if (this.currentDevice && await this.isDeviceOptimal(this.currentDevice, workloadType)) {
                return this.currentDevice;
            }
            
            // Find best available device
            const bestDevice = await this.findBestDevice(workloadType, options);
            
            if (bestDevice !== this.currentDevice) {
                console.log(`[FallbackManager] Switching from ${this.currentDevice} to ${bestDevice}`);
                this.currentDevice = bestDevice;
                this.stats.deviceSwitches++;
                
                this.emit('device-switched', {
                    from: this.currentDevice,
                    to: bestDevice,
                    reason: 'optimization'
                });
            }
            
            return bestDevice;
            
        } catch (error) {
            console.error('[FallbackManager] Device selection failed:', error);
            return this.getFallbackDevice();
        }
    }
    
    async isDeviceOptimal(deviceType, workloadType) {
        const tracker = this.devices.get(deviceType);
        if (!tracker) return false;
        
        // Check if device is in cooldown
        if (this.isInCooldown(deviceType)) {
            return false;
        }
        
        // Check health
        if (!tracker.isHealthy()) {
            return false;
        }
        
        // Check recent performance
        const recentPerf = tracker.getRecentPerformance(this.options.performanceWindowMs);
        
        if (recentPerf.sampleSize > 5) { // Need sufficient samples
            if (recentPerf.successRate < this.options.minSuccessRate) {
                return false;
            }
            
            if (recentPerf.averageLatency > this.options.maxLatencyMs) {
                return false;
            }
        }
        
        return true;
    }
    
    async findBestDevice(workloadType, options = {}) {
        const availableDevices = [];
        
        for (const deviceType of this.fallbackOrder) {
            if (this.isInCooldown(deviceType)) {
                continue;
            }
            
            const tracker = this.devices.get(deviceType);
            const isAvailable = await this.checkDeviceAvailability(deviceType);
            
            if (isAvailable) {
                availableDevices.push({
                    type: deviceType,
                    score: tracker.getPerformanceScore(),
                    tracker
                });
            }
        }
        
        if (availableDevices.length === 0) {
            return this.getFallbackDevice();
        }
        
        // Sort by performance score (descending)
        availableDevices.sort((a, b) => b.score - a.score);
        
        return availableDevices[0].type;
    }
    
    async checkDeviceAvailability(deviceType) {
        try {
            if (!this.hardwareManager) {
                return true; // Assume available if no hardware manager
            }
            
            switch (deviceType) {
                case 'npu':
                    return await this.hardwareManager.isNPUAvailable();
                case 'gpu':
                    return await this.hardwareManager.isGPUAvailable();
                case 'cpu':
                    return true; // CPU always available
                default:
                    return false;
            }
            
        } catch (error) {
            console.error(`[FallbackManager] Device availability check failed for ${deviceType}:`, error);
            return false;
        }
    }
    
    async executeWithFallback(operation, workloadType = 'inference', options = {}) {
        const maxRetries = options.maxRetries || this.fallbackOrder.length;
        let lastError = null;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const deviceType = await this.selectOptimalDevice(workloadType, options);
            const startTime = Date.now();
            
            try {
                console.log(`[FallbackManager] Executing on ${deviceType} (attempt ${attempt + 1})`);
                
                const result = await operation(deviceType);
                const latency = Date.now() - startTime;
                
                // Record successful execution
                this.recordInferenceResult(deviceType, latency, true);
                
                this.emit('execution-success', {
                    deviceType,
                    latency,
                    attempt: attempt + 1
                });
                
                return result;
                
            } catch (error) {
                const latency = Date.now() - startTime;
                lastError = error;
                
                // Record failed execution
                this.recordInferenceResult(deviceType, latency, false, { error: error.message });
                
                console.warn(`[FallbackManager] Execution failed on ${deviceType}:`, error.message);
                
                // Trigger fallback
                await this.triggerFallback(deviceType, error);
                
                this.emit('execution-failed', {
                    deviceType,
                    error: error.message,
                    attempt: attempt + 1
                });
            }
        }
        
        // All devices failed
        this.emit('all-devices-failed', { lastError });
        throw new Error(`All devices failed. Last error: ${lastError?.message}`);
    }
    
    async triggerFallback(failedDevice, error) {
        this.stats.fallbacksTriggered++;
        
        // Put failed device in cooldown
        this.fallbackCooldowns.set(failedDevice, Date.now());
        
        // Update device health
        const tracker = this.devices.get(failedDevice);
        if (tracker) {
            tracker.recordHealthCheck('warning', { error: error.message });
        }
        
        this.emit('fallback-triggered', {
            failedDevice,
            error: error.message,
            cooldownUntil: Date.now() + this.options.fallbackCooldownMs
        });
        
        console.log(`[FallbackManager] Fallback triggered for ${failedDevice}`);
    }
    
    recordInferenceResult(deviceType, latency, success, metadata = {}) {
        const tracker = this.devices.get(deviceType);
        if (tracker) {
            tracker.recordInference(latency, success, metadata);
        }
    }
    
    isInCooldown(deviceType) {
        const cooldownTime = this.fallbackCooldowns.get(deviceType);
        if (!cooldownTime) return false;
        
        const isInCooldown = Date.now() - cooldownTime < this.options.fallbackCooldownMs;
        
        if (!isInCooldown) {
            this.fallbackCooldowns.delete(deviceType);
        }
        
        return isInCooldown;
    }
    
    getFallbackDevice() {
        // Return the last device in fallback order (usually CPU)
        return this.fallbackOrder[this.fallbackOrder.length - 1];
    }
    
    startHealthMonitoring() {
        this.healthInterval = setInterval(async () => {
            await this.performHealthChecks();
        }, this.options.healthCheckInterval);
        
        console.log('[FallbackManager] Health monitoring started');
    }
    
    async performHealthChecks() {
        try {
            for (const [deviceType, tracker] of this.devices) {
                if (tracker.needsHealthCheck()) {
                    await this.checkDeviceHealth(deviceType);
                }
            }
            
            this.stats.healthChecksPerformed++;
            
        } catch (error) {
            console.error('[FallbackManager] Health check failed:', error);
        }
    }
    
    async checkDeviceHealth(deviceType) {
        try {
            const tracker = this.devices.get(deviceType);
            if (!tracker) return;
            
            let health = 'healthy';
            const details = {};
            
            // Check device availability
            const isAvailable = await this.checkDeviceAvailability(deviceType);
            if (!isAvailable) {
                health = 'critical';
                details.availability = false;
            }
            
            // Check recent performance
            const recentPerf = tracker.getRecentPerformance();
            if (recentPerf.sampleSize > 5) {
                if (recentPerf.successRate < 0.5) {
                    health = 'critical';
                } else if (recentPerf.successRate < this.options.minSuccessRate) {
                    health = 'warning';
                }
                
                details.recentPerformance = recentPerf;
            }
            
            tracker.recordHealthCheck(health, details);
            
            this.emit('health-check-completed', {
                deviceType,
                health,
                details
            });
            
        } catch (error) {
            const tracker = this.devices.get(deviceType);
            if (tracker) {
                tracker.recordHealthCheck('unknown', { error: error.message });
            }
            
            console.error(`[FallbackManager] Health check failed for ${deviceType}:`, error);
        }
    }
    
    getDeviceStats(deviceType) {
        const tracker = this.devices.get(deviceType);
        if (!tracker) return null;
        
        return {
            deviceType,
            performanceScore: tracker.getPerformanceScore(),
            currentHealth: tracker.currentHealth,
            stats: tracker.stats,
            recentPerformance: tracker.getRecentPerformance(),
            isInCooldown: this.isInCooldown(deviceType)
        };
    }
    
    getAllDeviceStats() {
        const deviceStats = {};
        
        for (const deviceType of this.fallbackOrder) {
            deviceStats[deviceType] = this.getDeviceStats(deviceType);
        }
        
        return {
            currentDevice: this.currentDevice,
            devices: deviceStats,
            fallbackOrder: this.fallbackOrder,
            stats: this.stats
        };
    }
    
    dispose() {
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
        }
        
        this.devices.clear();
        this.fallbackCooldowns.clear();
        this.removeAllListeners();
        
        console.log('[FallbackManager] Intelligent fallback manager disposed');
    }
}

module.exports = IntelligentFallbackManager;
