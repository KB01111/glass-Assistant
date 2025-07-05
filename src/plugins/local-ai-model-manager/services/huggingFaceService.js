/**
 * Hugging Face Service
 * 
 * Handles integration with Hugging Face Hub for:
 * - Model browsing and search
 * - Model downloading with progress tracking
 * - Model metadata retrieval
 * - Compatibility checking
 */
class HuggingFaceService {
    constructor(options = {}) {
        this.apiEnabled = options.apiEnabled !== false;
        this.logger = options.logger || console;
        this.baseUrl = 'https://huggingface.co/api';
        this.downloadProgress = new Map();
    }

    /**
     * Initialize the Hugging Face service
     */
    async initialize() {
        if (!this.apiEnabled) {
            this.logger.info('Hugging Face API disabled in configuration');
            return;
        }

        try {
            // Test API connectivity
            await this.testConnection();
            this.logger.info('Hugging Face service initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Hugging Face service:', error);
            throw error;
        }
    }

    /**
     * Test connection to Hugging Face API
     */
    async testConnection() {
        const fetch = require('node-fetch');
        const response = await fetch(`${this.baseUrl}/models?limit=1`);
        
        if (!response.ok) {
            throw new Error(`Hugging Face API test failed: ${response.status}`);
        }
        
        return true;
    }

    /**
     * Browse models from Hugging Face Hub
     * @param {Object} filters - Filtering options
     * @returns {Array} Array of model information
     */
    async browseModels(filters = {}) {
        if (!this.apiEnabled) {
            throw new Error('Hugging Face API is disabled');
        }

        const {
            task = null,
            library = null,
            language = null,
            sort = 'downloads',
            limit = 20,
            search = null,
            minDownloads = 0,
            maxModelSize = null
        } = filters;

        try {
            const params = new URLSearchParams();
            
            if (task) params.append('filter', `task:${task}`);
            if (library) params.append('filter', `library:${library}`);
            if (language) params.append('filter', `language:${language}`);
            if (search) params.append('search', search);
            params.append('sort', sort);
            params.append('limit', limit.toString());

            const fetch = require('node-fetch');
            const response = await fetch(`${this.baseUrl}/models?${params}`);
            
            if (!response.ok) {
                throw new Error(`Failed to browse models: ${response.status}`);
            }

            const models = await response.json();
            
            // Apply additional filters
            let filteredModels = models.filter(model => {
                if (minDownloads && model.downloads < minDownloads) return false;
                if (maxModelSize && this.estimateModelSize(model) > maxModelSize) return false;
                return true;
            });

            // Enhance model information
            filteredModels = await Promise.all(
                filteredModels.map(async model => ({
                    ...model,
                    estimatedSize: this.estimateModelSize(model),
                    compatibility: await this.checkCompatibility(model),
                    downloadUrl: this.getDownloadUrl(model.id)
                }))
            );

            return filteredModels;
        } catch (error) {
            this.logger.error('Error browsing models:', error);
            throw error;
        }
    }

    /**
     * Get detailed information about a specific model
     * @param {string} modelId - The model identifier
     * @returns {Object} Detailed model information
     */
    async getModelInfo(modelId) {
        if (!this.apiEnabled) {
            throw new Error('Hugging Face API is disabled');
        }

        try {
            const fetch = require('node-fetch');
            const response = await fetch(`${this.baseUrl}/models/${modelId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to get model info: ${response.status}`);
            }

            const modelInfo = await response.json();
            
            return {
                ...modelInfo,
                estimatedSize: this.estimateModelSize(modelInfo),
                compatibility: await this.checkCompatibility(modelInfo),
                downloadUrl: this.getDownloadUrl(modelId),
                files: await this.getModelFiles(modelId)
            };
        } catch (error) {
            this.logger.error(`Error getting model info for ${modelId}:`, error);
            throw error;
        }
    }

    /**
     * Download a model from Hugging Face Hub
     * @param {string} modelId - The model identifier
     * @param {Object} options - Download options
     * @returns {Promise} Download promise with progress tracking
     */
    async downloadModel(modelId, options = {}) {
        if (!this.apiEnabled) {
            throw new Error('Hugging Face API is disabled');
        }

        const {
            targetPath = null,
            onProgress = null,
            includeTokenizer = true,
            includeConfig = true,
            revision = 'main'
        } = options;

        try {
            // Get model files list
            const files = await this.getModelFiles(modelId, revision);
            
            // Filter files based on options
            const filesToDownload = files.filter(file => {
                if (!includeTokenizer && file.path.includes('tokenizer')) return false;
                if (!includeConfig && file.path.includes('config')) return false;
                return true;
            });

            const totalSize = filesToDownload.reduce((sum, file) => sum + (file.size || 0), 0);
            let downloadedSize = 0;

            this.downloadProgress.set(modelId, {
                status: 'downloading',
                progress: 0,
                totalSize,
                downloadedSize: 0,
                files: filesToDownload.length
            });

            const downloadedFiles = [];

            for (const file of filesToDownload) {
                const fileUrl = `https://huggingface.co/${modelId}/resolve/${revision}/${file.path}`;
                const filePath = targetPath ? `${targetPath}/${file.path}` : null;

                try {
                    const downloadedFile = await this.downloadFile(fileUrl, filePath, (progress) => {
                        downloadedSize += progress.delta || 0;
                        const totalProgress = Math.round((downloadedSize / totalSize) * 100);
                        
                        this.downloadProgress.set(modelId, {
                            ...this.downloadProgress.get(modelId),
                            progress: totalProgress,
                            downloadedSize,
                            currentFile: file.path
                        });

                        if (onProgress) {
                            onProgress({
                                modelId,
                                progress: totalProgress,
                                currentFile: file.path,
                                downloadedSize,
                                totalSize
                            });
                        }
                    });

                    downloadedFiles.push(downloadedFile);
                } catch (error) {
                    this.logger.error(`Failed to download file ${file.path}:`, error);
                    throw error;
                }
            }

            this.downloadProgress.set(modelId, {
                status: 'completed',
                progress: 100,
                totalSize,
                downloadedSize: totalSize,
                files: downloadedFiles.length
            });

            return {
                modelId,
                files: downloadedFiles,
                totalSize,
                downloadPath: targetPath
            };

        } catch (error) {
            this.downloadProgress.set(modelId, {
                status: 'error',
                error: error.message
            });
            
            this.logger.error(`Error downloading model ${modelId}:`, error);
            throw error;
        }
    }

    /**
     * Get download progress for a model
     * @param {string} modelId - The model identifier
     * @returns {Object} Progress information
     */
    getDownloadProgress(modelId) {
        return this.downloadProgress.get(modelId) || { status: 'not_started' };
    }

    /**
     * Cancel model download
     * @param {string} modelId - The model identifier
     */
    cancelDownload(modelId) {
        const progress = this.downloadProgress.get(modelId);
        if (progress && progress.status === 'downloading') {
            this.downloadProgress.set(modelId, {
                ...progress,
                status: 'cancelled'
            });
        }
    }

    /**
     * Update an existing model
     * @param {string} modelId - The model identifier
     * @param {Object} options - Update options
     */
    async updateModel(modelId, options = {}) {
        // Check if newer version is available
        const currentInfo = await this.getModelInfo(modelId);
        const latestInfo = await this.getModelInfo(modelId); // This would check latest revision
        
        if (currentInfo.sha !== latestInfo.sha) {
            return await this.downloadModel(modelId, {
                ...options,
                revision: 'main' // Download latest
            });
        }
        
        return { updated: false, message: 'Model is already up to date' };
    }

    // Helper methods
    estimateModelSize(model) {
        // Estimate model size based on parameters and architecture
        // This is a rough estimation - actual size may vary
        const params = model.config?.num_parameters || 0;
        const bytesPerParam = 4; // Assuming float32
        return params * bytesPerParam;
    }

    async checkCompatibility(model) {
        // Check if model is compatible with our system
        const supportedTasks = [
            'text-generation',
            'text-classification',
            'token-classification',
            'question-answering',
            'summarization',
            'translation'
        ];

        const supportedLibraries = [
            'transformers',
            'pytorch',
            'onnx'
        ];

        return {
            taskSupported: model.pipeline_tag ? supportedTasks.includes(model.pipeline_tag) : false,
            librarySupported: model.library_name ? supportedLibraries.includes(model.library_name) : false,
            amgGaiaCompatible: this.checkAMDGaiaCompatibility(model)
        };
    }

    checkAMDGaiaCompatibility(model) {
        // Check if model is compatible with AMD Gaia
        // This would involve checking model architecture, format, etc.
        return model.library_name === 'onnx' || model.library_name === 'transformers';
    }

    getDownloadUrl(modelId) {
        return `https://huggingface.co/${modelId}`;
    }

    async getModelFiles(modelId, revision = 'main') {
        const fetch = require('node-fetch');
        const response = await fetch(`${this.baseUrl}/models/${modelId}/tree/${revision}`);
        
        if (!response.ok) {
            throw new Error(`Failed to get model files: ${response.status}`);
        }

        return await response.json();
    }

    async downloadFile(url, targetPath, onProgress) {
        const fetch = require('node-fetch');
        const fs = require('fs');
        const path = require('path');

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.status}`);
        }

        const totalSize = parseInt(response.headers.get('content-length') || '0');
        let downloadedSize = 0;

        if (targetPath) {
            // Ensure directory exists
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const fileStream = fs.createWriteStream(targetPath);
            
            return new Promise((resolve, reject) => {
                response.body.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (onProgress) {
                        onProgress({
                            delta: chunk.length,
                            downloaded: downloadedSize,
                            total: totalSize,
                            progress: Math.round((downloadedSize / totalSize) * 100)
                        });
                    }
                });

                response.body.pipe(fileStream);
                
                fileStream.on('finish', () => {
                    resolve({
                        path: targetPath,
                        size: downloadedSize,
                        url
                    });
                });

                fileStream.on('error', reject);
                response.body.on('error', reject);
            });
        } else {
            // Return buffer if no target path specified
            const buffer = await response.buffer();
            return {
                buffer,
                size: buffer.length,
                url
            };
        }
    }

    /**
     * Cleanup service resources
     */
    async cleanup() {
        this.downloadProgress.clear();
        this.logger.info('Hugging Face service cleaned up');
    }
}

module.exports = HuggingFaceService;
