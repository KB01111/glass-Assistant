const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

class LocalModelService extends EventEmitter {
    constructor() {
        super();
        this.modelsDir = path.join(os.homedir(), '.glass-assistant', 'models');
        this.configFile = path.join(os.homedir(), '.glass-assistant', 'models-config.json');
        this.activeModel = null;
        this.modelInstances = new Map();
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            await this.ensureDirectories();
            await this.loadConfiguration();
            await this.loadActiveModel();
            
            this.isInitialized = true;
            console.log('[LocalModelService] Initialized successfully');
            this.emit('initialized');
        } catch (error) {
            console.error('[LocalModelService] Initialization failed:', error);
            throw error;
        }
    }

    async ensureDirectories() {
        await fs.mkdir(this.modelsDir, { recursive: true });
        await fs.mkdir(path.dirname(this.configFile), { recursive: true });
    }

    async loadConfiguration() {
        try {
            const configData = await fs.readFile(this.configFile, 'utf-8');
            this.config = JSON.parse(configData);
        } catch (error) {
            // Create default configuration
            this.config = {
                models: {},
                activeModel: null,
                lastUpdated: new Date().toISOString(),
                settings: {
                    maxConcurrentInferences: 1,
                    defaultProvider: 'local',
                    fallbackToCloud: true
                }
            };
            await this.saveConfiguration();
        }
    }

    async saveConfiguration() {
        await fs.writeFile(this.configFile, JSON.stringify(this.config, null, 2));
    }

    async loadActiveModel() {
        if (this.config.activeModel && this.config.models[this.config.activeModel]) {
            try {
                await this.activateModel(this.config.activeModel);
            } catch (error) {
                console.error('[LocalModelService] Failed to load active model:', error);
                this.config.activeModel = null;
                await this.saveConfiguration();
            }
        }
    }

    async getInstalledModels() {
        await this.loadConfiguration();
        
        const models = [];
        for (const [modelId, modelConfig] of Object.entries(this.config.models)) {
            try {
                // Verify model file still exists
                await fs.access(modelConfig.path);
                
                const stats = await fs.stat(modelConfig.path);
                models.push({
                    id: modelId,
                    name: modelConfig.name,
                    path: modelConfig.path,
                    size: this.formatFileSize(stats.size),
                    installedAt: modelConfig.installedAt,
                    lastUsed: modelConfig.lastUsed,
                    isActive: modelConfig.isActive || false,
                    type: modelConfig.type || 'text-generation',
                    source: modelConfig.source || 'unknown'
                });
            } catch (error) {
                // Model file doesn't exist, remove from config
                console.warn(`[LocalModelService] Model file not found: ${modelConfig.path}`);
                delete this.config.models[modelId];
            }
        }
        
        await this.saveConfiguration();
        return models;
    }

    async activateModel(modelId) {
        if (!this.config.models[modelId]) {
            throw new Error(`Model not found: ${modelId}`);
        }

        const modelConfig = this.config.models[modelId];
        
        try {
            // Verify model file exists
            await fs.access(modelConfig.path);
            
            // Deactivate current model
            if (this.activeModel) {
                await this.deactivateCurrentModel();
            }
            
            // Load the new model
            const modelInstance = await this.loadModelInstance(modelConfig);
            
            // Update configuration
            Object.keys(this.config.models).forEach(id => {
                this.config.models[id].isActive = false;
            });
            
            this.config.models[modelId].isActive = true;
            this.config.models[modelId].lastUsed = new Date().toISOString();
            this.config.activeModel = modelId;
            
            await this.saveConfiguration();
            
            this.activeModel = {
                id: modelId,
                config: modelConfig,
                instance: modelInstance
            };
            
            console.log(`[LocalModelService] Model activated: ${modelId}`);
            this.emit('modelActivated', { modelId, config: modelConfig });
            
            return true;
        } catch (error) {
            console.error(`[LocalModelService] Failed to activate model ${modelId}:`, error);
            throw error;
        }
    }

    async deactivateCurrentModel() {
        if (this.activeModel) {
            try {
                // Cleanup model instance
                if (this.activeModel.instance && typeof this.activeModel.instance.cleanup === 'function') {
                    await this.activeModel.instance.cleanup();
                }
                
                this.modelInstances.delete(this.activeModel.id);
                console.log(`[LocalModelService] Model deactivated: ${this.activeModel.id}`);
                this.emit('modelDeactivated', { modelId: this.activeModel.id });
            } catch (error) {
                console.error('[LocalModelService] Error deactivating model:', error);
            }
            
            this.activeModel = null;
        }
    }

    async loadModelInstance(modelConfig) {
        // This is a placeholder for actual model loading
        // In a real implementation, this would:
        // 1. Determine the model format (GGUF, ONNX, SafeTensors, etc.)
        // 2. Load the appropriate inference engine
        // 3. Initialize the model with proper configuration
        
        console.log(`[LocalModelService] Loading model instance: ${modelConfig.name}`);
        
        // Simulate model loading
        return {
            id: modelConfig.originalId || modelConfig.name,
            name: modelConfig.name,
            path: modelConfig.path,
            type: modelConfig.type || 'text-generation',
            
            // Placeholder inference method
            async generateText(prompt, options = {}) {
                console.log(`[LocalModelService] Generating text with ${modelConfig.name}:`, prompt);
                
                // This would be replaced with actual inference
                return {
                    text: `[Local AI Response from ${modelConfig.name}] This is a placeholder response to: ${prompt}`,
                    model: modelConfig.name,
                    tokensUsed: prompt.length + 50,
                    inferenceTime: Math.random() * 1000 + 500
                };
            },
            
            async cleanup() {
                console.log(`[LocalModelService] Cleaning up model: ${modelConfig.name}`);
            }
        };
    }

    async performInference(prompt, options = {}) {
        if (!this.activeModel) {
            if (this.config.settings.fallbackToCloud) {
                console.log('[LocalModelService] No active local model, falling back to cloud');
                return null; // Let the caller handle cloud fallback
            } else {
                throw new Error('No active local model available');
            }
        }

        try {
            const startTime = Date.now();
            const result = await this.activeModel.instance.generateText(prompt, options);
            const endTime = Date.now();
            
            // Update usage statistics
            this.config.models[this.activeModel.id].lastUsed = new Date().toISOString();
            await this.saveConfiguration();
            
            this.emit('inferenceCompleted', {
                modelId: this.activeModel.id,
                prompt,
                result,
                duration: endTime - startTime
            });
            
            return result;
        } catch (error) {
            console.error('[LocalModelService] Inference failed:', error);
            this.emit('inferenceError', {
                modelId: this.activeModel.id,
                prompt,
                error: error.message
            });
            
            if (this.config.settings.fallbackToCloud) {
                console.log('[LocalModelService] Local inference failed, falling back to cloud');
                return null; // Let the caller handle cloud fallback
            } else {
                throw error;
            }
        }
    }

    async deleteModel(modelId) {
        if (!this.config.models[modelId]) {
            throw new Error(`Model not found: ${modelId}`);
        }

        const modelConfig = this.config.models[modelId];
        
        try {
            // Deactivate if this is the active model
            if (this.activeModel && this.activeModel.id === modelId) {
                await this.deactivateCurrentModel();
            }
            
            // Delete the model file
            try {
                await fs.unlink(modelConfig.path);
            } catch (error) {
                console.warn(`[LocalModelService] Could not delete model file: ${error.message}`);
            }
            
            // Remove from configuration
            delete this.config.models[modelId];
            
            if (this.config.activeModel === modelId) {
                this.config.activeModel = null;
            }
            
            await this.saveConfiguration();
            
            console.log(`[LocalModelService] Model deleted: ${modelId}`);
            this.emit('modelDeleted', { modelId });
            
            return true;
        } catch (error) {
            console.error(`[LocalModelService] Failed to delete model ${modelId}:`, error);
            throw error;
        }
    }

    getActiveModel() {
        return this.activeModel ? {
            id: this.activeModel.id,
            name: this.activeModel.config.name,
            type: this.activeModel.config.type
        } : null;
    }

    isLocalInferenceAvailable() {
        return this.activeModel !== null;
    }

    formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Bytes';
        
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const size = bytes / Math.pow(1024, i);
        
        return `${size.toFixed(1)} ${sizes[i]}`;
    }
}

module.exports = LocalModelService;
