const { BasePlugin } = require('../../common/services/pluginAPI');
const HuggingFaceService = require('./services/huggingFaceService');
const ModelStorageService = require('./services/modelStorageService');
const ModelConversionService = require('./services/modelConversionService');
const PerformanceMonitor = require('./services/performanceMonitor');
const path = require('path');
const os = require('os');

/**
 * Local AI Model Manager Plugin
 * 
 * Provides comprehensive local AI model management with:
 * - Hugging Face model browsing and downloading
 * - Local model storage and version management
 * - AMD Gaia integration with NPU acceleration
 * - Performance monitoring and optimization
 */
class LocalAIModelManagerPlugin extends BasePlugin {
    constructor() {
        super();
        this.services = {};
        this.localModels = new Map();
        this.performanceMetrics = new Map();
    }

    /**
     * Initialize the plugin and all its services
     */
    async initialize() {
        await super.initialize();

        try {
            // Initialize core services
            await this.initializeServices();

            // Register AI middleware for local model routing
            await this.registerAIMiddleware();

            // Register model management capabilities
            await this.registerModelManagement();

            // Setup AMD Gaia integration
            await this.setupAMDGaiaIntegration();

            // Initialize UI components
            await this.initializeUIComponents();

            // Start performance monitoring
            await this.startPerformanceMonitoring();

            this.logger.info('Local AI Model Manager Plugin initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Local AI Model Manager Plugin:', error);
            throw error;
        }
    }

    /**
     * Initialize all plugin services
     */
    async initializeServices() {
        const config = this.api.getConfig();
        
        // Resolve model storage path
        const modelStoragePath = config.modelStoragePath.startsWith('~') 
            ? path.join(os.homedir(), config.modelStoragePath.slice(1))
            : config.modelStoragePath;

        // Initialize Hugging Face service
        this.services.huggingFace = new HuggingFaceService({
            apiEnabled: config.huggingFaceApiEnabled,
            logger: this.logger
        });

        // Initialize model storage service
        this.services.modelStorage = new ModelStorageService({
            storagePath: modelStoragePath,
            maxCacheSize: config.maxModelCacheSize,
            logger: this.logger
        });

        // Initialize model conversion service
        this.services.modelConversion = new ModelConversionService({
            logger: this.logger
        });

        // Initialize performance monitor
        this.services.performanceMonitor = new PerformanceMonitor({
            enabled: config.performanceMonitoring,
            logger: this.logger
        });

        // Initialize all services
        await Promise.all([
            this.services.huggingFace.initialize(),
            this.services.modelStorage.initialize(),
            this.services.modelConversion.initialize(),
            this.services.performanceMonitor.initialize()
        ]);

        this.logger.info('All plugin services initialized');
    }

    /**
     * Register AI middleware for local model processing
     */
    async registerAIMiddleware() {
        // Pre-process middleware for model selection
        this.api.registerAIMiddleware('pre-process', async (context) => {
            if (context.useLocalModel && context.modelId) {
                const model = await this.getLocalModel(context.modelId);
                if (model) {
                    context.localModel = model;
                    context.inferenceDevice = await this.selectOptimalDevice();
                }
            }
            return context;
        });

        // AI provider middleware for local inference
        this.api.registerAIMiddleware('ai-provider', async (context) => {
            if (context.localModel) {
                const startTime = Date.now();
                
                try {
                    const result = await this.performLocalInference(context);
                    
                    // Record performance metrics
                    const inferenceTime = Date.now() - startTime;
                    await this.services.performanceMonitor.recordInference({
                        modelId: context.modelId,
                        inferenceTime,
                        inputTokens: context.prompt?.length || 0,
                        outputTokens: result?.length || 0,
                        device: context.inferenceDevice
                    });

                    return { ...context, result, provider: 'local-ai' };
                } catch (error) {
                    this.logger.error('Local inference failed:', error);
                    // Fallback to cloud provider
                    context.useLocalModel = false;
                    return context;
                }
            }
            return context;
        });

        this.logger.info('AI middleware registered');
    }

    /**
     * Register model management capabilities with the plugin API
     */
    async registerModelManagement() {
        // Extend plugin API with model management methods
        this.api.registerExtension('model-management', {
            browseModels: this.browseHuggingFaceModels.bind(this),
            downloadModel: this.downloadModel.bind(this),
            getLocalModels: this.getLocalModels.bind(this),
            deleteModel: this.deleteModel.bind(this),
            getModelInfo: this.getModelInfo.bind(this),
            updateModel: this.updateModel.bind(this),
            convertModel: this.convertModel.bind(this),
            getPerformanceMetrics: this.getPerformanceMetrics.bind(this)
        });

        this.logger.info('Model management capabilities registered');
    }

    /**
     * Setup AMD Gaia integration for local models
     */
    async setupAMDGaiaIntegration() {
        const integration = this.api.pluginIntegration.createAMDGaiaIntegration();
        
        // Register local model provider for AMD Gaia
        integration.registerAIProvider(this.id, {
            process: async (prompt, options) => {
                const context = {
                    prompt,
                    options,
                    useLocalModel: true,
                    modelId: options.modelId || 'default'
                };
                
                return await this.performLocalInference(context);
            },
            
            loadModel: async (modelId) => {
                return await this.loadModelForGaia(modelId);
            },
            
            getAvailableModels: async () => {
                return Array.from(this.localModels.keys());
            }
        });

        this.logger.info('AMD Gaia integration setup complete');
    }

    /**
     * Initialize UI components for model management
     */
    async initializeUIComponents() {
        // Register UI extension points
        this.api.registerUIExtension('model-browser', {
            component: 'ModelBrowserComponent',
            location: 'settings-panel',
            title: 'AI Model Browser'
        });

        this.api.registerUIExtension('model-manager', {
            component: 'ModelManagerComponent',
            location: 'settings-panel',
            title: 'Local Models'
        });

        this.api.registerUIExtension('model-selector', {
            component: 'ModelSelectorComponent',
            location: 'ask-interface',
            title: 'Model Selection'
        });

        this.logger.info('UI components initialized');
    }

    /**
     * Start performance monitoring
     */
    async startPerformanceMonitoring() {
        if (this.services.performanceMonitor) {
            await this.services.performanceMonitor.start();
            this.logger.info('Performance monitoring started');
        }
    }

    // Model management methods will be implemented in the next phase
    async browseHuggingFaceModels(filters = {}) {
        return await this.services.huggingFace.browseModels(filters);
    }

    async downloadModel(modelId, options = {}) {
        return await this.services.huggingFace.downloadModel(modelId, options);
    }

    async getLocalModels() {
        return await this.services.modelStorage.getInstalledModels();
    }

    async deleteModel(modelId) {
        return await this.services.modelStorage.deleteModel(modelId);
    }

    async getModelInfo(modelId) {
        return await this.services.modelStorage.getModelInfo(modelId);
    }

    async updateModel(modelId) {
        return await this.services.huggingFace.updateModel(modelId);
    }

    async convertModel(modelId, targetFormat) {
        return await this.services.modelConversion.convertModel(modelId, targetFormat);
    }

    async getPerformanceMetrics(modelId) {
        return await this.services.performanceMonitor.getMetrics(modelId);
    }

    // Internal methods
    async getLocalModel(modelId) {
        return this.localModels.get(modelId);
    }

    async selectOptimalDevice() {
        const config = this.api.getConfig();
        
        if (config.preferredInferenceDevice !== 'auto') {
            return config.preferredInferenceDevice;
        }

        // Auto-detect optimal device
        if (config.enableNPUAcceleration && await this.detectNPU()) {
            return 'npu';
        } else if (await this.detectGPU()) {
            return 'gpu';
        } else {
            return 'cpu';
        }
    }

    async performLocalInference(context) {
        try {
            this.logger.info('Performing local inference with context:', context);

            // Use the local model service for inference
            const LocalModelService = require('../../common/services/localModelService');

            if (!this.localModelService) {
                this.localModelService = new LocalModelService();
                await this.localModelService.initialize();
            }

            // Check if local inference is available
            if (!this.localModelService.isLocalInferenceAvailable()) {
                this.logger.warn('No local model available for inference');
                throw new Error('No local model available');
            }

            // Perform local inference
            const result = await this.localModelService.performInference(context.prompt, {
                maxTokens: context.options?.maxTokens || 150,
                temperature: context.options?.temperature || 0.7,
                topP: context.options?.topP || 0.9
            });

            if (result) {
                this.logger.info('Local inference completed successfully');
                return {
                    response: result.text,
                    model: result.model,
                    tokensUsed: result.tokensUsed,
                    inferenceTime: result.inferenceTime,
                    source: 'local'
                };
            } else {
                throw new Error('Local inference returned null');
            }
        } catch (error) {
            this.logger.error('Local inference failed:', error);
            throw error;
        }
    }

    async loadModelForGaia(modelId) {
        try {
            this.logger.info(`Loading model for Gaia: ${modelId}`);

            if (!this.localModelService) {
                const LocalModelService = require('../../common/services/localModelService');
                this.localModelService = new LocalModelService();
                await this.localModelService.initialize();
            }

            // Activate the specified model
            await this.localModelService.activateModel(modelId);

            this.logger.info(`Model loaded for Gaia: ${modelId}`);
            return {
                modelId,
                status: 'loaded',
                capabilities: ['text-generation'],
                device: await this.selectOptimalDevice()
            };
        } catch (error) {
            this.logger.error(`Failed to load model for Gaia: ${modelId}`, error);
            throw error;
        }
    }

    async detectNPU() {
        try {
            if (!this.hardwareDetectionService) {
                const HardwareDetectionService = require('../../common/services/hardwareDetectionService');
                this.hardwareDetectionService = new HardwareDetectionService();
                await this.hardwareDetectionService.initialize();
            }

            const npuInfo = this.hardwareDetectionService.getNPUInfo();
            return npuInfo?.detected || false;
        } catch (error) {
            this.logger.error('NPU detection failed:', error);
            return false;
        }
    }

    async detectGPU() {
        try {
            if (!this.hardwareDetectionService) {
                const HardwareDetectionService = require('../../common/services/hardwareDetectionService');
                this.hardwareDetectionService = new HardwareDetectionService();
                await this.hardwareDetectionService.initialize();
            }

            const gpuInfo = this.hardwareDetectionService.getGPUInfo();
            return gpuInfo?.hasDedicatedGPU || false;
        } catch (error) {
            this.logger.error('GPU detection failed:', error);
            return false;
        }
    }

    async selectOptimalDevice() {
        try {
            if (!this.hardwareDetectionService) {
                const HardwareDetectionService = require('../../common/services/hardwareDetectionService');
                this.hardwareDetectionService = new HardwareDetectionService();
                await this.hardwareDetectionService.initialize();
            }

            const optimalDevice = await this.hardwareDetectionService.selectOptimalDevice();

            this.logger.info(`Optimal device selected: ${optimalDevice.type} (score: ${optimalDevice.score})`);

            return optimalDevice.type.toLowerCase();
        } catch (error) {
            this.logger.error('Device selection failed:', error);
            return 'cpu'; // Fallback to CPU
        }
    }

    async getHardwareInfo() {
        try {
            if (!this.hardwareDetectionService) {
                const HardwareDetectionService = require('../../common/services/hardwareDetectionService');
                this.hardwareDetectionService = new HardwareDetectionService();
                await this.hardwareDetectionService.initialize();
            }

            return this.hardwareDetectionService.getHardwareInfo();
        } catch (error) {
            this.logger.error('Failed to get hardware info:', error);
            return null;
        }
    }

    /**
     * Cleanup when plugin is disabled or unloaded
     */
    async cleanup() {
        if (this.services.performanceMonitor) {
            await this.services.performanceMonitor.stop();
        }

        // Cleanup all services
        await Promise.all(
            Object.values(this.services).map(service => 
                service.cleanup ? service.cleanup() : Promise.resolve()
            )
        );

        await super.cleanup();
        this.logger.info('Local AI Model Manager Plugin cleaned up');
    }
}

module.exports = LocalAIModelManagerPlugin;
