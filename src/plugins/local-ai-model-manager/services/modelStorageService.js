const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

/**
 * Model Storage Service
 * 
 * Handles local storage and management of AI models:
 * - Secure file storage with integrity checking
 * - Model metadata database management
 * - Version control and caching
 * - Disk space management
 */
class ModelStorageService {
    constructor(options = {}) {
        this.storagePath = options.storagePath || path.join(process.cwd(), 'models');
        this.maxCacheSize = this.parseSize(options.maxCacheSize || '10GB');
        this.logger = options.logger || console;
        this.db = null;
        this.dbPath = path.join(this.storagePath, 'models.db');
    }

    /**
     * Initialize the model storage service
     */
    async initialize() {
        try {
            // Create storage directory if it doesn't exist
            if (!fs.existsSync(this.storagePath)) {
                fs.mkdirSync(this.storagePath, { recursive: true });
                this.logger.info(`Created model storage directory: ${this.storagePath}`);
            }

            // Initialize database
            await this.initializeDatabase();

            // Perform initial cleanup and validation
            await this.validateStoredModels();

            this.logger.info('Model storage service initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize model storage service:', error);
            throw error;
        }
    }

    /**
     * Initialize SQLite database for model metadata
     */
    async initializeDatabase() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Create tables
                const createTables = `
                    CREATE TABLE IF NOT EXISTS models (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        version TEXT NOT NULL,
                        file_path TEXT NOT NULL,
                        file_size INTEGER NOT NULL,
                        checksum TEXT NOT NULL,
                        download_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_used DATETIME,
                        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                        status TEXT DEFAULT 'active',
                        metadata TEXT,
                        config TEXT
                    );

                    CREATE TABLE IF NOT EXISTS model_files (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        model_id TEXT NOT NULL,
                        file_name TEXT NOT NULL,
                        file_path TEXT NOT NULL,
                        file_size INTEGER NOT NULL,
                        checksum TEXT NOT NULL,
                        file_type TEXT,
                        FOREIGN KEY (model_id) REFERENCES models (id)
                    );

                    CREATE TABLE IF NOT EXISTS model_performance (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        model_id TEXT NOT NULL,
                        inference_time REAL,
                        memory_usage INTEGER,
                        device_type TEXT,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (model_id) REFERENCES models (id)
                    );

                    CREATE INDEX IF NOT EXISTS idx_models_status ON models(status);
                    CREATE INDEX IF NOT EXISTS idx_models_last_used ON models(last_used);
                    CREATE INDEX IF NOT EXISTS idx_model_files_model_id ON model_files(model_id);
                    CREATE INDEX IF NOT EXISTS idx_performance_model_id ON model_performance(model_id);
                `;

                this.db.exec(createTables, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    /**
     * Store a downloaded model
     * @param {Object} modelData - Model information and files
     * @returns {Promise<Object>} Storage result
     */
    async storeModel(modelData) {
        const { modelId, files, metadata = {}, config = {} } = modelData;

        try {
            // Create model directory
            const modelDir = path.join(this.storagePath, this.sanitizeModelId(modelId));
            if (!fs.existsSync(modelDir)) {
                fs.mkdirSync(modelDir, { recursive: true });
            }

            // Store files and calculate checksums
            const storedFiles = [];
            let totalSize = 0;

            for (const file of files) {
                const targetPath = path.join(modelDir, file.name || path.basename(file.path));
                
                // Copy or move file to storage location
                if (file.buffer) {
                    fs.writeFileSync(targetPath, file.buffer);
                } else if (file.path && file.path !== targetPath) {
                    fs.copyFileSync(file.path, targetPath);
                }

                // Calculate checksum
                const checksum = await this.calculateChecksum(targetPath);
                const fileSize = fs.statSync(targetPath).size;
                totalSize += fileSize;

                storedFiles.push({
                    name: path.basename(targetPath),
                    path: targetPath,
                    size: fileSize,
                    checksum,
                    type: this.getFileType(targetPath)
                });
            }

            // Store model metadata in database
            const modelChecksum = this.calculateModelChecksum(storedFiles);
            
            await this.insertModel({
                id: modelId,
                name: metadata.name || modelId,
                version: metadata.version || '1.0.0',
                file_path: modelDir,
                file_size: totalSize,
                checksum: modelChecksum,
                metadata: JSON.stringify(metadata),
                config: JSON.stringify(config)
            });

            // Store file information
            for (const file of storedFiles) {
                await this.insertModelFile({
                    model_id: modelId,
                    file_name: file.name,
                    file_path: file.path,
                    file_size: file.size,
                    checksum: file.checksum,
                    file_type: file.type
                });
            }

            // Check storage limits and cleanup if necessary
            await this.enforceStorageLimits();

            this.logger.info(`Model ${modelId} stored successfully (${this.formatSize(totalSize)})`);

            return {
                modelId,
                storagePath: modelDir,
                files: storedFiles,
                totalSize,
                checksum: modelChecksum
            };

        } catch (error) {
            this.logger.error(`Failed to store model ${modelId}:`, error);
            throw error;
        }
    }

    /**
     * Get information about a stored model
     * @param {string} modelId - Model identifier
     * @returns {Promise<Object>} Model information
     */
    async getModelInfo(modelId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT m.*, 
                       COUNT(mf.id) as file_count,
                       GROUP_CONCAT(mf.file_name) as files
                FROM models m
                LEFT JOIN model_files mf ON m.id = mf.model_id
                WHERE m.id = ? AND m.status = 'active'
                GROUP BY m.id
            `;

            this.db.get(query, [modelId], (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    resolve(null);
                } else {
                    resolve({
                        ...row,
                        metadata: row.metadata ? JSON.parse(row.metadata) : {},
                        config: row.config ? JSON.parse(row.config) : {},
                        files: row.files ? row.files.split(',') : []
                    });
                }
            });
        });
    }

    /**
     * Get list of all installed models
     * @returns {Promise<Array>} List of installed models
     */
    async getInstalledModels() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT m.id, m.name, m.version, m.file_size, m.download_date, 
                       m.last_used, m.status, COUNT(mf.id) as file_count
                FROM models m
                LEFT JOIN model_files mf ON m.id = mf.model_id
                WHERE m.status = 'active'
                GROUP BY m.id
                ORDER BY m.last_used DESC, m.download_date DESC
            `;

            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(row => ({
                        ...row,
                        formattedSize: this.formatSize(row.file_size)
                    })));
                }
            });
        });
    }

    /**
     * Delete a model from storage
     * @param {string} modelId - Model identifier
     * @returns {Promise<boolean>} Success status
     */
    async deleteModel(modelId) {
        try {
            const modelInfo = await this.getModelInfo(modelId);
            if (!modelInfo) {
                throw new Error(`Model ${modelId} not found`);
            }

            // Mark model as deleted in database
            await this.updateModelStatus(modelId, 'deleted');

            // Delete physical files
            const modelDir = modelInfo.file_path;
            if (fs.existsSync(modelDir)) {
                fs.rmSync(modelDir, { recursive: true, force: true });
            }

            this.logger.info(`Model ${modelId} deleted successfully`);
            return true;

        } catch (error) {
            this.logger.error(`Failed to delete model ${modelId}:`, error);
            throw error;
        }
    }

    /**
     * Update model usage timestamp
     * @param {string} modelId - Model identifier
     */
    async updateModelUsage(modelId) {
        return new Promise((resolve, reject) => {
            const query = 'UPDATE models SET last_used = CURRENT_TIMESTAMP WHERE id = ?';
            this.db.run(query, [modelId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            });
        });
    }

    /**
     * Validate integrity of stored models
     */
    async validateStoredModels() {
        const models = await this.getInstalledModels();
        const corruptedModels = [];

        for (const model of models) {
            try {
                const isValid = await this.validateModelIntegrity(model.id);
                if (!isValid) {
                    corruptedModels.push(model.id);
                }
            } catch (error) {
                this.logger.warn(`Failed to validate model ${model.id}:`, error);
                corruptedModels.push(model.id);
            }
        }

        if (corruptedModels.length > 0) {
            this.logger.warn(`Found ${corruptedModels.length} corrupted models:`, corruptedModels);
            // Optionally mark them for re-download or deletion
        }

        return corruptedModels;
    }

    /**
     * Validate integrity of a specific model
     * @param {string} modelId - Model identifier
     * @returns {Promise<boolean>} Validation result
     */
    async validateModelIntegrity(modelId) {
        const modelInfo = await this.getModelInfo(modelId);
        if (!modelInfo) return false;

        // Check if model directory exists
        if (!fs.existsSync(modelInfo.file_path)) {
            return false;
        }

        // Validate each file
        const files = await this.getModelFiles(modelId);
        for (const file of files) {
            if (!fs.existsSync(file.file_path)) {
                return false;
            }

            const currentChecksum = await this.calculateChecksum(file.file_path);
            if (currentChecksum !== file.checksum) {
                return false;
            }
        }

        return true;
    }

    /**
     * Enforce storage size limits
     */
    async enforceStorageLimits() {
        const currentSize = await this.getCurrentStorageSize();
        
        if (currentSize > this.maxCacheSize) {
            const excessSize = currentSize - this.maxCacheSize;
            this.logger.info(`Storage limit exceeded by ${this.formatSize(excessSize)}, cleaning up...`);
            
            await this.cleanupOldModels(excessSize);
        }
    }

    /**
     * Clean up old models to free space
     * @param {number} targetSize - Amount of space to free
     */
    async cleanupOldModels(targetSize) {
        // Get models sorted by last used (oldest first)
        const models = await this.getInstalledModels();
        models.sort((a, b) => new Date(a.last_used || 0) - new Date(b.last_used || 0));

        let freedSpace = 0;
        for (const model of models) {
            if (freedSpace >= targetSize) break;

            await this.deleteModel(model.id);
            freedSpace += model.file_size;
            
            this.logger.info(`Cleaned up model ${model.id} (${this.formatSize(model.file_size)})`);
        }
    }

    // Helper methods
    async calculateChecksum(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    calculateModelChecksum(files) {
        const hash = crypto.createHash('sha256');
        files.forEach(file => hash.update(file.checksum));
        return hash.digest('hex');
    }

    sanitizeModelId(modelId) {
        return modelId.replace(/[^a-zA-Z0-9-_]/g, '_');
    }

    getFileType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const typeMap = {
            '.bin': 'model',
            '.safetensors': 'model',
            '.onnx': 'model',
            '.json': 'config',
            '.txt': 'tokenizer',
            '.model': 'tokenizer'
        };
        return typeMap[ext] || 'unknown';
    }

    parseSize(sizeStr) {
        const units = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3, TB: 1024**4 };
        const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
        if (!match) throw new Error(`Invalid size format: ${sizeStr}`);
        return parseFloat(match[1]) * (units[match[2].toUpperCase()] || 1);
    }

    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    async getCurrentStorageSize() {
        return new Promise((resolve, reject) => {
            const query = 'SELECT SUM(file_size) as total_size FROM models WHERE status = "active"';
            this.db.get(query, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row.total_size || 0);
                }
            });
        });
    }

    // Database helper methods
    async insertModel(modelData) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT OR REPLACE INTO models 
                (id, name, version, file_path, file_size, checksum, metadata, config)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            this.db.run(query, [
                modelData.id, modelData.name, modelData.version,
                modelData.file_path, modelData.file_size, modelData.checksum,
                modelData.metadata, modelData.config
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async insertModelFile(fileData) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO model_files 
                (model_id, file_name, file_path, file_size, checksum, file_type)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            this.db.run(query, [
                fileData.model_id, fileData.file_name, fileData.file_path,
                fileData.file_size, fileData.checksum, fileData.file_type
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async updateModelStatus(modelId, status) {
        return new Promise((resolve, reject) => {
            const query = 'UPDATE models SET status = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?';
            this.db.run(query, [status, modelId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            });
        });
    }

    async getModelFiles(modelId) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM model_files WHERE model_id = ?';
            this.db.all(query, [modelId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Cleanup service resources
     */
    async cleanup() {
        if (this.db) {
            await new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        this.logger.error('Error closing database:', err);
                    }
                    resolve();
                });
            });
        }
        
        this.logger.info('Model storage service cleaned up');
    }
}

module.exports = ModelStorageService;
