/**
 * Document Metadata Management
 * Implements efficient document metadata storage, indexing, and retrieval system
 * integrated with embedding cache and processing pipeline
 */

const EventEmitter = require('events');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

class DocumentMetadataManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            dbPath: './cache/document_metadata.db',
            enableIndexing: true,
            enableFullTextSearch: true,
            cacheSize: 1000,
            enableCompression: false,
            ...options
        };
        
        this.db = null;
        this.metadataCache = new Map(); // documentId -> metadata
        this.indexCache = new Map(); // index -> documentIds
        this.isInitialized = false;
        
        this.initializeManager();
    }
    
    async initializeManager() {
        try {
            console.log('[Document Metadata] Initializing document metadata manager...');
            
            // Create database directory
            const dbDir = path.dirname(this.options.dbPath);
            await fs.mkdir(dbDir, { recursive: true });
            
            // Initialize database
            await this.initializeDatabase();
            
            // Create indexes
            if (this.options.enableIndexing) {
                await this.createIndexes();
            }
            
            this.isInitialized = true;
            this.emit('initialized');
            
        } catch (error) {
            console.error('[Document Metadata] Initialization failed:', error);
            this.emit('initialization-failed', error);
        }
    }
    
    /**
     * Initialize SQLite database
     */
    async initializeDatabase() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.options.dbPath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Create tables
                this.createTables()
                    .then(resolve)
                    .catch(reject);
            });
        });
    }
    
    /**
     * Create database tables
     */
    async createTables() {
        const tables = [
            // Main documents table
            `CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                filename TEXT NOT NULL,
                size INTEGER,
                hash TEXT,
                mime_type TEXT,
                created_at INTEGER,
                modified_at INTEGER,
                processed_at INTEGER,
                status TEXT DEFAULT 'pending',
                metadata TEXT,
                UNIQUE(path)
            )`,
            
            // Document chunks table
            `CREATE TABLE IF NOT EXISTS document_chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT,
                start_pos INTEGER,
                end_pos INTEGER,
                token_count INTEGER,
                embedding_id TEXT,
                metadata TEXT,
                FOREIGN KEY(document_id) REFERENCES documents(id),
                UNIQUE(document_id, chunk_index)
            )`,
            
            // Document tags table
            `CREATE TABLE IF NOT EXISTS document_tags (
                document_id TEXT NOT NULL,
                tag TEXT NOT NULL,
                value TEXT,
                created_at INTEGER,
                PRIMARY KEY(document_id, tag),
                FOREIGN KEY(document_id) REFERENCES documents(id)
            )`,
            
            // Processing history table
            `CREATE TABLE IF NOT EXISTS processing_history (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at INTEGER,
                completed_at INTEGER,
                error_message TEXT,
                metadata TEXT,
                FOREIGN KEY(document_id) REFERENCES documents(id)
            )`
        ];
        
        for (const sql of tables) {
            await this.runQuery(sql);
        }
        
        // Enable FTS if requested
        if (this.options.enableFullTextSearch) {
            await this.runQuery(`
                CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                    document_id,
                    filename,
                    content,
                    tags
                )
            `);
        }
    }
    
    /**
     * Create database indexes
     */
    async createIndexes() {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path)',
            'CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(hash)',
            'CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)',
            'CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id)',
            'CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks(embedding_id)',
            'CREATE INDEX IF NOT EXISTS idx_tags_document ON document_tags(document_id)',
            'CREATE INDEX IF NOT EXISTS idx_tags_tag ON document_tags(tag)',
            'CREATE INDEX IF NOT EXISTS idx_history_document ON processing_history(document_id)',
            'CREATE INDEX IF NOT EXISTS idx_history_operation ON processing_history(operation)'
        ];
        
        for (const sql of indexes) {
            await this.runQuery(sql);
        }
    }
    
    /**
     * Store document metadata
     */
    async storeDocument(documentInfo) {
        try {
            const {
                id,
                path: filePath,
                filename,
                size,
                mimeType,
                content,
                metadata = {},
                tags = []
            } = documentInfo;
            
            // Generate hash
            const hash = this.generateHash(filePath + size + Date.now());
            
            const now = Date.now();
            
            // Insert document
            await this.runQuery(`
                INSERT OR REPLACE INTO documents 
                (id, path, filename, size, hash, mime_type, created_at, modified_at, processed_at, status, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id,
                filePath,
                filename,
                size,
                hash,
                mimeType,
                now,
                now,
                now,
                'processed',
                JSON.stringify(metadata)
            ]);
            
            // Store tags
            for (const tag of tags) {
                await this.storeTag(id, tag.name, tag.value);
            }
            
            // Update FTS if enabled
            if (this.options.enableFullTextSearch && content) {
                await this.updateFullTextSearch(id, filename, content, tags);
            }
            
            // Cache metadata
            this.metadataCache.set(id, {
                id,
                path: filePath,
                filename,
                size,
                hash,
                mimeType,
                metadata,
                tags,
                createdAt: now
            });
            
            this.emit('document-stored', { documentId: id });
            
            return id;
            
        } catch (error) {
            console.error('[Document Metadata] Failed to store document:', error);
            throw error;
        }
    }
    
    /**
     * Store document chunk metadata
     */
    async storeChunk(chunkInfo) {
        try {
            const {
                id,
                documentId,
                chunkIndex,
                content,
                startPos,
                endPos,
                tokenCount,
                embeddingId,
                metadata = {}
            } = chunkInfo;
            
            await this.runQuery(`
                INSERT OR REPLACE INTO document_chunks
                (id, document_id, chunk_index, content, start_pos, end_pos, token_count, embedding_id, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id,
                documentId,
                chunkIndex,
                content,
                startPos,
                endPos,
                tokenCount,
                embeddingId,
                JSON.stringify(metadata)
            ]);
            
            this.emit('chunk-stored', { chunkId: id, documentId });
            
        } catch (error) {
            console.error('[Document Metadata] Failed to store chunk:', error);
            throw error;
        }
    }
    
    /**
     * Store document tag
     */
    async storeTag(documentId, tag, value = null) {
        try {
            await this.runQuery(`
                INSERT OR REPLACE INTO document_tags (document_id, tag, value, created_at)
                VALUES (?, ?, ?, ?)
            `, [documentId, tag, value, Date.now()]);
            
        } catch (error) {
            console.error('[Document Metadata] Failed to store tag:', error);
            throw error;
        }
    }
    
    /**
     * Get document metadata
     */
    async getDocument(documentId) {
        try {
            // Check cache first
            if (this.metadataCache.has(documentId)) {
                return this.metadataCache.get(documentId);
            }
            
            const row = await this.getQuery(`
                SELECT * FROM documents WHERE id = ?
            `, [documentId]);
            
            if (!row) {
                return null;
            }
            
            // Get tags
            const tags = await this.getAllQuery(`
                SELECT tag, value FROM document_tags WHERE document_id = ?
            `, [documentId]);
            
            const document = {
                id: row.id,
                path: row.path,
                filename: row.filename,
                size: row.size,
                hash: row.hash,
                mimeType: row.mime_type,
                createdAt: row.created_at,
                modifiedAt: row.modified_at,
                processedAt: row.processed_at,
                status: row.status,
                metadata: JSON.parse(row.metadata || '{}'),
                tags: tags.map(t => ({ name: t.tag, value: t.value }))
            };
            
            // Cache result
            this.metadataCache.set(documentId, document);
            
            return document;
            
        } catch (error) {
            console.error('[Document Metadata] Failed to get document:', error);
            throw error;
        }
    }
    
    /**
     * Get document chunks
     */
    async getDocumentChunks(documentId) {
        try {
            const chunks = await this.getAllQuery(`
                SELECT * FROM document_chunks 
                WHERE document_id = ? 
                ORDER BY chunk_index
            `, [documentId]);
            
            return chunks.map(chunk => ({
                id: chunk.id,
                documentId: chunk.document_id,
                chunkIndex: chunk.chunk_index,
                content: chunk.content,
                startPos: chunk.start_pos,
                endPos: chunk.end_pos,
                tokenCount: chunk.token_count,
                embeddingId: chunk.embedding_id,
                metadata: JSON.parse(chunk.metadata || '{}')
            }));
            
        } catch (error) {
            console.error('[Document Metadata] Failed to get chunks:', error);
            throw error;
        }
    }
    
    /**
     * Search documents
     */
    async searchDocuments(query, options = {}) {
        try {
            const {
                tags = [],
                status = null,
                limit = 100,
                offset = 0,
                sortBy = 'created_at',
                sortOrder = 'DESC'
            } = options;
            
            let sql = 'SELECT * FROM documents WHERE 1=1';
            const params = [];
            
            // Add tag filters
            if (tags.length > 0) {
                const tagPlaceholders = tags.map(() => '?').join(',');
                sql += ` AND id IN (
                    SELECT document_id FROM document_tags 
                    WHERE tag IN (${tagPlaceholders})
                )`;
                params.push(...tags);
            }
            
            // Add status filter
            if (status) {
                sql += ' AND status = ?';
                params.push(status);
            }
            
            // Add full-text search
            if (query && this.options.enableFullTextSearch) {
                sql += ` AND id IN (
                    SELECT document_id FROM documents_fts 
                    WHERE documents_fts MATCH ?
                )`;
                params.push(query);
            }
            
            // Add sorting and pagination
            sql += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
            params.push(limit, offset);
            
            const documents = await this.getAllQuery(sql, params);
            
            return documents.map(doc => ({
                id: doc.id,
                path: doc.path,
                filename: doc.filename,
                size: doc.size,
                mimeType: doc.mime_type,
                createdAt: doc.created_at,
                status: doc.status,
                metadata: JSON.parse(doc.metadata || '{}')
            }));
            
        } catch (error) {
            console.error('[Document Metadata] Search failed:', error);
            throw error;
        }
    }
    
    /**
     * Update full-text search index
     */
    async updateFullTextSearch(documentId, filename, content, tags) {
        try {
            const tagText = tags.map(t => `${t.name}:${t.value || ''}`).join(' ');
            
            await this.runQuery(`
                INSERT OR REPLACE INTO documents_fts (document_id, filename, content, tags)
                VALUES (?, ?, ?, ?)
            `, [documentId, filename, content, tagText]);
            
        } catch (error) {
            console.error('[Document Metadata] FTS update failed:', error);
        }
    }
    
    /**
     * Generate hash for document
     */
    generateHash(input) {
        return crypto.createHash('sha256').update(input).digest('hex');
    }
    
    /**
     * Run SQL query
     */
    async runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }
    
    /**
     * Get single row
     */
    async getQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
    
    /**
     * Get all rows
     */
    async getAllQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
    
    /**
     * Get statistics
     */
    async getStats() {
        try {
            const totalDocs = await this.getQuery('SELECT COUNT(*) as count FROM documents');
            const totalChunks = await this.getQuery('SELECT COUNT(*) as count FROM document_chunks');
            const statusCounts = await this.getAllQuery(`
                SELECT status, COUNT(*) as count 
                FROM documents 
                GROUP BY status
            `);
            
            return {
                totalDocuments: totalDocs.count,
                totalChunks: totalChunks.count,
                statusCounts: Object.fromEntries(statusCounts.map(s => [s.status, s.count])),
                cacheSize: this.metadataCache.size
            };
            
        } catch (error) {
            console.error('[Document Metadata] Failed to get stats:', error);
            return null;
        }
    }
    
    /**
     * Dispose resources
     */
    async dispose() {
        try {
            if (this.db) {
                await new Promise((resolve) => {
                    this.db.close(resolve);
                });
            }
            
            this.metadataCache.clear();
            this.indexCache.clear();
            
        } catch (error) {
            console.error('[Document Metadata] Disposal failed:', error);
        }
    }
}

module.exports = DocumentMetadataManager;
