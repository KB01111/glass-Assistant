/**
 * Local Model Management Handlers
 * Handles IPC communication for local AI model management
 */

const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

class LocalModelHandlers {
    constructor() {
        this.modelStoragePath = path.join(os.homedir(), '.glass-assistant', 'models');
        this.configPath = path.join(os.homedir(), '.glass-assistant', 'local-model-config.json');
        this.installedModels = new Map();
        this.activeModel = null;
        this.downloadProgress = new Map();
        
        this.initializeHandlers();
        this.ensureDirectories();
        this.loadConfiguration();
    }

    initializeHandlers() {
        // Hardware detection
        ipcMain.handle('detect-hardware-capabilities', this.detectHardwareCapabilities.bind(this));
        
        // Model management
        ipcMain.handle('get-installed-models', this.getInstalledModels.bind(this));
        ipcMain.handle('get-active-model', this.getActiveModel.bind(this));
        ipcMain.handle('activate-model', this.activateModel.bind(this));
        ipcMain.handle('deactivate-model', this.deactivateModel.bind(this));
        ipcMain.handle('download-model', this.downloadModel.bind(this));
        ipcMain.handle('remove-model', this.removeModel.bind(this));
        
        // Configuration
        ipcMain.handle('get-local-model-config', this.getConfiguration.bind(this));
        ipcMain.handle('save-local-model-config', this.saveConfiguration.bind(this));
        
        // Navigation
        ipcMain.on('open-local-model-setup', this.openLocalModelSetup.bind(this));
        ipcMain.on('open-model-browser', this.openModelBrowser.bind(this));
        
        console.log('[Local Model Handlers] Initialized IPC handlers');
    }

    async ensureDirectories() {
        try {
            await fs.mkdir(this.modelStoragePath, { recursive: true });
            await fs.mkdir(path.dirname(this.configPath), { recursive: true });
        } catch (error) {
            console.error('[Local Model Handlers] Failed to create directories:', error);
        }
    }

    async detectHardwareCapabilities() {
        try {
            const capabilities = {
                npu: { available: false, status: 'unavailable' },
                gpu: { available: false, status: 'unavailable' },
                cpu: { available: true, status: 'available' }
            };

            // Check for AMD Gaia NPU
            try {
                // This would be replaced with actual NPU detection logic
                const { hardwareDetectionService } = require('../../common/services/hardwareDetectionService');
                const hardware = await hardwareDetectionService.detectHardware();
                
                if (hardware.npu?.available) {
                    capabilities.npu = {
                        available: true,
                        status: 'available',
                        name: 'AMD Gaia NPU',
                        capabilities: hardware.npu.capabilities
                    };
                }
                
                if (hardware.gpu?.available) {
                    capabilities.gpu = {
                        available: true,
                        status: 'available',
                        name: 'DirectML GPU',
                        capabilities: hardware.gpu.capabilities
                    };
                }
            } catch (error) {
                console.warn('[Local Model Handlers] Hardware detection service not available:', error.message);
            }

            // Check for DirectML GPU support
            try {
                const ort = require('onnxruntime-node');
                const providers = ort.InferenceSession.getAvailableProviders();
                
                if (providers.includes('DmlExecutionProvider')) {
                    capabilities.gpu = {
                        available: true,
                        status: 'available',
                        name: 'DirectML GPU',
                        providers: providers
                    };
                }
            } catch (error) {
                console.warn('[Local Model Handlers] ONNX Runtime not available:', error.message);
            }

            return capabilities;
        } catch (error) {
            console.error('[Local Model Handlers] Hardware detection failed:', error);
            return {
                npu: { available: false, status: 'error', error: error.message },
                gpu: { available: false, status: 'error', error: error.message },
                cpu: { available: true, status: 'available' }
            };
        }
    }

    async getInstalledModels() {
        try {
            const models = [];
            const modelDirs = await fs.readdir(this.modelStoragePath);
            
            for (const modelDir of modelDirs) {
                const modelPath = path.join(this.modelStoragePath, modelDir);
                const stat = await fs.stat(modelPath);
                
                if (stat.isDirectory()) {
                    try {
                        const configPath = path.join(modelPath, 'model-config.json');
                        const configData = await fs.readFile(configPath, 'utf8');
                        const config = JSON.parse(configData);
                        
                        models.push({
                            id: config.id || modelDir,
                            name: config.name || modelDir,
                            size: await this.calculateDirectorySize(modelPath),
                            type: config.type || 'unknown',
                            installedAt: stat.birthtime.getTime(),
                            isActive: this.activeModel === (config.id || modelDir),
                            path: modelPath,
                            config: config
                        });
                    } catch (error) {
                        // If no config file, create basic model info
                        models.push({
                            id: modelDir,
                            name: modelDir,
                            size: await this.calculateDirectorySize(modelPath),
                            type: 'unknown',
                            installedAt: stat.birthtime.getTime(),
                            isActive: this.activeModel === modelDir,
                            path: modelPath
                        });
                    }
                }
            }
            
            return models;
        } catch (error) {
            console.error('[Local Model Handlers] Failed to get installed models:', error);
            return [];
        }
    }

    async calculateDirectorySize(dirPath) {
        try {
            let totalSize = 0;
            const files = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const file of files) {
                const filePath = path.join(dirPath, file.name);
                if (file.isDirectory()) {
                    totalSize += await this.calculateDirectorySize(filePath);
                } else {
                    const stat = await fs.stat(filePath);
                    totalSize += stat.size;
                }
            }
            
            return this.formatFileSize(totalSize);
        } catch (error) {
            return 'Unknown';
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    async getActiveModel() {
        return this.activeModel;
    }

    async activateModel(modelId) {
        try {
            // Deactivate current model if any
            if (this.activeModel) {
                await this.deactivateModel(this.activeModel);
            }
            
            // Activate new model
            this.activeModel = modelId;
            
            // Initialize model if needed
            await this.initializeModel(modelId);
            
            console.log(`[Local Model Handlers] Activated model: ${modelId}`);
            return true;
        } catch (error) {
            console.error('[Local Model Handlers] Failed to activate model:', error);
            throw error;
        }
    }

    async deactivateModel(modelId) {
        try {
            if (this.activeModel === modelId) {
                this.activeModel = null;
                
                // Cleanup model resources if needed
                await this.cleanupModel(modelId);
                
                console.log(`[Local Model Handlers] Deactivated model: ${modelId}`);
            }
            return true;
        } catch (error) {
            console.error('[Local Model Handlers] Failed to deactivate model:', error);
            throw error;
        }
    }

    async downloadModel(modelId) {
        try {
            console.log(`[Local Model Handlers] Starting download for model: ${modelId}`);
            
            // Initialize download progress
            this.downloadProgress.set(modelId, {
                modelId,
                progress: 0,
                status: 'starting',
                startTime: Date.now()
            });
            
            // Create model directory
            const modelDir = path.join(this.modelStoragePath, modelId.replace('/', '_'));
            await fs.mkdir(modelDir, { recursive: true });
            
            // Simulate download progress (in real implementation, this would download from Hugging Face)
            for (let progress = 0; progress <= 100; progress += 10) {
                this.downloadProgress.set(modelId, {
                    modelId,
                    progress,
                    status: 'downloading',
                    startTime: Date.now()
                });
                
                // Send progress update to renderer
                const mainWindow = require('../main').getMainWindow();
                if (mainWindow) {
                    mainWindow.webContents.send('model-download-progress', {
                        modelId,
                        progress,
                        status: 'downloading'
                    });
                }
                
                // Simulate download time
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            // Create model config
            const modelConfig = {
                id: modelId,
                name: this.getModelDisplayName(modelId),
                type: this.getModelType(modelId),
                downloadedAt: Date.now(),
                version: '1.0.0'
            };
            
            await fs.writeFile(
                path.join(modelDir, 'model-config.json'),
                JSON.stringify(modelConfig, null, 2)
            );
            
            // Create dummy model file
            await fs.writeFile(
                path.join(modelDir, 'model.onnx'),
                'dummy model file content'
            );
            
            this.downloadProgress.delete(modelId);
            
            console.log(`[Local Model Handlers] Successfully downloaded model: ${modelId}`);
            return true;
        } catch (error) {
            this.downloadProgress.delete(modelId);
            console.error('[Local Model Handlers] Failed to download model:', error);
            throw error;
        }
    }

    async removeModel(modelId) {
        try {
            // Deactivate if currently active
            if (this.activeModel === modelId) {
                await this.deactivateModel(modelId);
            }
            
            // Remove model directory
            const modelDir = path.join(this.modelStoragePath, modelId.replace('/', '_'));
            await fs.rmdir(modelDir, { recursive: true });
            
            console.log(`[Local Model Handlers] Removed model: ${modelId}`);
            return true;
        } catch (error) {
            console.error('[Local Model Handlers] Failed to remove model:', error);
            throw error;
        }
    }

    async initializeModel(modelId) {
        try {
            // Initialize model for inference
            // This would load the model into the appropriate hardware acceleration service
            console.log(`[Local Model Handlers] Initializing model: ${modelId}`);
            
            // In real implementation, this would:
            // 1. Load the model with ONNX Runtime
            // 2. Configure hardware acceleration
            // 3. Warm up the model
            
            return true;
        } catch (error) {
            console.error('[Local Model Handlers] Failed to initialize model:', error);
            throw error;
        }
    }

    async cleanupModel(modelId) {
        try {
            // Cleanup model resources
            console.log(`[Local Model Handlers] Cleaning up model: ${modelId}`);
            
            // In real implementation, this would:
            // 1. Release model from memory
            // 2. Cleanup hardware resources
            // 3. Clear caches
            
            return true;
        } catch (error) {
            console.error('[Local Model Handlers] Failed to cleanup model:', error);
        }
    }

    getModelDisplayName(modelId) {
        const nameMap = {
            'microsoft/DialoGPT-medium': 'DialoGPT Medium',
            'sentence-transformers/all-MiniLM-L6-v2': 'All-MiniLM-L6-v2',
            'microsoft/codebert-base': 'CodeBERT Base'
        };
        return nameMap[modelId] || modelId;
    }

    getModelType(modelId) {
        if (modelId.includes('DialoGPT')) return 'conversational';
        if (modelId.includes('sentence-transformers')) return 'embedding';
        if (modelId.includes('codebert')) return 'code';
        return 'general';
    }

    async loadConfiguration() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            const config = JSON.parse(configData);
            
            // Restore active model
            if (config.activeModel) {
                this.activeModel = config.activeModel;
            }
            
            return config;
        } catch (error) {
            // Return default configuration if file doesn't exist
            return {
                enableNPU: true,
                enableGPU: true,
                enableCPU: true,
                modelStoragePath: this.modelStoragePath,
                maxCacheSize: '10GB',
                autoUpdates: false,
                performanceMonitoring: true
            };
        }
    }

    async getConfiguration() {
        return await this.loadConfiguration();
    }

    async saveConfiguration(config) {
        try {
            // Save active model state
            config.activeModel = this.activeModel;
            
            await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
            console.log('[Local Model Handlers] Configuration saved');
            return true;
        } catch (error) {
            console.error('[Local Model Handlers] Failed to save configuration:', error);
            throw error;
        }
    }

    openLocalModelSetup() {
        // Navigate to local model setup view
        const mainWindow = require('../main').getMainWindow();
        if (mainWindow) {
            mainWindow.webContents.send('navigate-to-view', 'local-model-setup');
        }
    }

    openModelBrowser() {
        // Open external model browser or navigate to model browser view
        shell.openExternal('https://huggingface.co/models');
    }
}

// Export singleton instance
let localModelHandlers = null;

function getLocalModelHandlers() {
    if (!localModelHandlers) {
        localModelHandlers = new LocalModelHandlers();
    }
    return localModelHandlers;
}

module.exports = { getLocalModelHandlers };
