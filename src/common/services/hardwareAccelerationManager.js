/**
 * Hardware Acceleration Manager
 * Coordinates between NPU, GPU, and CPU resources with intelligent workload distribution
 * and device health monitoring
 */

const EventEmitter = require('events');
const { hardwareDetectionService } = require('./hardwareDetectionService');
const { IntelligentFallbackManager } = require('./intelligentFallbackManager');
const { HardwareAdaptiveConfig } = require('./hardwareAdaptiveConfig');

class HardwareAccelerationManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            enableNPU: true,
            enableGPU: true,
            enableCPU: true,
            healthCheckInterval: 30000, // 30 seconds
            loadBalancingStrategy: 'performance', // 'performance', 'power', 'balanced'
            maxConcurrentInferences: 10,
            ...options
        };
        
        this.devices = new Map(); // deviceId -> DeviceInfo
        this.workloadQueue = [];
        this.activeInferences = new Map(); // inferenceId -> InferenceInfo
        this.deviceHealth = new Map(); // deviceId -> HealthMetrics
        this.loadBalancer = null;
        this.fallbackManager = null;
        this.adaptiveConfig = null;
        this.isInitialized = false;
        
        this.initializeManager();
    }
    
    async initializeManager() {
        try {
            console.log('[Hardware Manager] Initializing Hardware Acceleration Manager...');
            
            // Initialize hardware detection
            await this.detectAvailableHardware();
            
            // Initialize fallback manager
            this.fallbackManager = new IntelligentFallbackManager({
                devices: Array.from(this.devices.values())
            });
            
            // Initialize adaptive configuration
            this.adaptiveConfig = new HardwareAdaptiveConfig({
                devices: Array.from(this.devices.values())
            });
            
            // Start health monitoring
            this.startHealthMonitoring();
            
            // Initialize load balancer
            this.initializeLoadBalancer();
            
            this.isInitialized = true;
            this.emit('initialized', { devices: Array.from(this.devices.keys()) });
            
        } catch (error) {
            console.error('[Hardware Manager] Initialization failed:', error);
            this.emit('initialization-failed', error);
        }
    }
    
    /**
     * Detect available hardware devices
     */
    async detectAvailableHardware() {
        try {
            const hardwareInfo = await hardwareDetectionService.detectHardware();
            
            // Process NPU devices
            if (this.options.enableNPU && hardwareInfo.npu?.available) {
                this.devices.set('amd-gaia-npu', {
                    id: 'amd-gaia-npu',
                    type: 'npu',
                    name: 'AMD Gaia NPU',
                    capabilities: hardwareInfo.npu.capabilities,
                    performance: hardwareInfo.npu.performance || {},
                    status: 'available',
                    priority: 1, // Highest priority
                    maxConcurrent: 4
                });
            }
            
            // Process GPU devices
            if (this.options.enableGPU && hardwareInfo.gpu?.available) {
                this.devices.set('directml-gpu', {
                    id: 'directml-gpu',
                    type: 'gpu',
                    name: 'DirectML GPU',
                    capabilities: hardwareInfo.gpu.capabilities,
                    performance: hardwareInfo.gpu.performance || {},
                    status: 'available',
                    priority: 2,
                    maxConcurrent: 6
                });
            }
            
            // Process CPU
            if (this.options.enableCPU) {
                this.devices.set('cpu', {
                    id: 'cpu',
                    type: 'cpu',
                    name: 'CPU',
                    capabilities: { threads: require('os').cpus().length },
                    performance: {},
                    status: 'available',
                    priority: 3, // Lowest priority
                    maxConcurrent: 2
                });
            }
            
            console.log(`[Hardware Manager] Detected ${this.devices.size} devices:`, 
                Array.from(this.devices.keys()));
            
        } catch (error) {
            console.error('[Hardware Manager] Hardware detection failed:', error);
            throw error;
        }
    }
    
    /**
     * Schedule inference on optimal device
     */
    async scheduleInference(inferenceRequest) {
        try {
            if (!this.isInitialized) {
                throw new Error('Hardware Acceleration Manager not initialized');
            }
            
            const inferenceId = this.generateInferenceId();
            const optimalDevice = await this.selectOptimalDevice(inferenceRequest);
            
            if (!optimalDevice) {
                throw new Error('No suitable device available for inference');
            }
            
            const inferenceInfo = {
                id: inferenceId,
                request: inferenceRequest,
                deviceId: optimalDevice.id,
                status: 'scheduled',
                scheduledAt: Date.now()
            };
            
            this.activeInferences.set(inferenceId, inferenceInfo);
            
            // Execute inference
            const result = await this.executeInference(inferenceInfo);
            
            // Update device metrics
            this.updateDeviceMetrics(optimalDevice.id, {
                inferenceTime: result.inferenceTime,
                success: true
            });
            
            this.activeInferences.delete(inferenceId);
            
            return result;
            
        } catch (error) {
            console.error('[Hardware Manager] Inference scheduling failed:', error);
            
            // Try fallback
            if (this.fallbackManager) {
                return await this.fallbackManager.handleFailure(inferenceRequest, error);
            }
            
            throw error;
        }
    }
    
    /**
     * Select optimal device for inference
     */
    async selectOptimalDevice(inferenceRequest) {
        const availableDevices = Array.from(this.devices.values())
            .filter(device => device.status === 'available')
            .filter(device => this.canHandleInference(device, inferenceRequest))
            .sort((a, b) => this.compareDevices(a, b, inferenceRequest));
        
        if (availableDevices.length === 0) {
            return null;
        }
        
        // Check device load
        for (const device of availableDevices) {
            const currentLoad = this.getCurrentDeviceLoad(device.id);
            if (currentLoad < device.maxConcurrent) {
                return device;
            }
        }
        
        // All devices at capacity, queue the request
        return await this.queueInference(inferenceRequest);
    }
    
    /**
     * Check if device can handle inference
     */
    canHandleInference(device, inferenceRequest) {
        const { modelType, inputSize, precision } = inferenceRequest;
        
        switch (device.type) {
            case 'npu':
                // NPU is optimized for AI workloads
                return true;
            case 'gpu':
                // GPU can handle most AI workloads
                return true;
            case 'cpu':
                // CPU as fallback, but check if model is too large
                return inputSize < 1000000; // 1M parameter limit for CPU
            default:
                return false;
        }
    }
    
    /**
     * Compare devices for optimal selection
     */
    compareDevices(deviceA, deviceB, inferenceRequest) {
        const strategy = this.options.loadBalancingStrategy;
        
        switch (strategy) {
            case 'performance':
                return deviceA.priority - deviceB.priority;
            case 'power':
                return this.getPowerEfficiency(deviceB) - this.getPowerEfficiency(deviceA);
            case 'balanced':
                const scoreA = this.getBalancedScore(deviceA, inferenceRequest);
                const scoreB = this.getBalancedScore(deviceB, inferenceRequest);
                return scoreB - scoreA;
            default:
                return deviceA.priority - deviceB.priority;
        }
    }
    
    /**
     * Execute inference on selected device
     */
    async executeInference(inferenceInfo) {
        const { deviceId, request } = inferenceInfo;
        const device = this.devices.get(deviceId);
        
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        
        const startTime = Date.now();
        
        try {
            // Update inference status
            inferenceInfo.status = 'running';
            inferenceInfo.startedAt = startTime;
            
            // Get device-specific provider
            const provider = await this.getDeviceProvider(deviceId);
            
            // Execute inference
            const result = await provider.runInference(
                request.modelPath,
                request.inputs,
                request.options
            );
            
            const inferenceTime = Date.now() - startTime;
            
            return {
                ...result,
                inferenceTime,
                deviceId,
                deviceType: device.type
            };
            
        } catch (error) {
            const inferenceTime = Date.now() - startTime;
            
            // Update device health
            this.updateDeviceHealth(deviceId, {
                lastError: error.message,
                errorCount: (this.deviceHealth.get(deviceId)?.errorCount || 0) + 1,
                lastErrorTime: Date.now()
            });
            
            throw error;
        }
    }
    
    /**
     * Get device provider instance
     */
    async getDeviceProvider(deviceId) {
        const device = this.devices.get(deviceId);
        
        switch (device.type) {
            case 'npu':
                const { AMDGaiaProvider } = require('./amdGaiaProvider');
                return new AMDGaiaProvider();
            case 'gpu':
                const { DirectMLAcceleratedInference } = require('./directMLProvider');
                return new DirectMLAcceleratedInference({
                    providers: ['DmlExecutionProvider', 'CPUExecutionProvider']
                });
            case 'cpu':
                const { DirectMLAcceleratedInference: CPUProvider } = require('./directMLProvider');
                return new CPUProvider({
                    providers: ['CPUExecutionProvider']
                });
            default:
                throw new Error(`Unsupported device type: ${device.type}`);
        }
    }
    
    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        setInterval(async () => {
            await this.checkDeviceHealth();
        }, this.options.healthCheckInterval);
    }
    
    /**
     * Check health of all devices
     */
    async checkDeviceHealth() {
        for (const [deviceId, device] of this.devices) {
            try {
                const health = await this.performHealthCheck(device);
                this.deviceHealth.set(deviceId, {
                    ...this.deviceHealth.get(deviceId),
                    ...health,
                    lastChecked: Date.now()
                });
                
                // Update device status based on health
                if (health.status === 'unhealthy') {
                    device.status = 'unavailable';
                    this.emit('device-unhealthy', { deviceId, health });
                } else if (device.status === 'unavailable' && health.status === 'healthy') {
                    device.status = 'available';
                    this.emit('device-recovered', { deviceId, health });
                }
                
            } catch (error) {
                console.error(`[Hardware Manager] Health check failed for ${deviceId}:`, error);
            }
        }
    }
    
    /**
     * Perform health check on device
     */
    async performHealthCheck(device) {
        // Basic health check - in production this would be more comprehensive
        return {
            status: 'healthy',
            temperature: Math.random() * 80, // Mock temperature
            utilization: Math.random() * 100, // Mock utilization
            memoryUsage: Math.random() * 100, // Mock memory usage
            errorRate: 0
        };
    }
    
    /**
     * Get current device load
     */
    getCurrentDeviceLoad(deviceId) {
        return Array.from(this.activeInferences.values())
            .filter(inference => inference.deviceId === deviceId && inference.status === 'running')
            .length;
    }
    
    /**
     * Generate unique inference ID
     */
    generateInferenceId() {
        return `inf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Update device metrics
     */
    updateDeviceMetrics(deviceId, metrics) {
        const device = this.devices.get(deviceId);
        if (device) {
            device.performance = {
                ...device.performance,
                ...metrics,
                lastUpdated: Date.now()
            };
        }
    }
    
    /**
     * Update device health
     */
    updateDeviceHealth(deviceId, healthUpdate) {
        const currentHealth = this.deviceHealth.get(deviceId) || {};
        this.deviceHealth.set(deviceId, {
            ...currentHealth,
            ...healthUpdate,
            lastUpdated: Date.now()
        });
    }
    
    /**
     * Get device statistics
     */
    getDeviceStats() {
        const stats = {};
        
        for (const [deviceId, device] of this.devices) {
            stats[deviceId] = {
                device: device,
                health: this.deviceHealth.get(deviceId),
                currentLoad: this.getCurrentDeviceLoad(deviceId),
                activeInferences: Array.from(this.activeInferences.values())
                    .filter(inf => inf.deviceId === deviceId)
            };
        }
        
        return stats;
    }
}

module.exports = HardwareAccelerationManager;
