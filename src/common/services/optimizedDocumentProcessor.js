/**
 * Optimized Document Processor
 * Implements intelligent batching, parallel processing, and coordination between AMD Gaia and LLMware
 */

const EventEmitter = require('events');
const AMDGaiaProvider = require('./amdGaiaProvider');
const { Worker } = require('worker_threads');
const path = require('path');

class OptimizedDocumentProcessor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            batchSize: 32,
            maxConcurrentBatches: 4,
            enableParallelProcessing: true,
            enableIntelligentBatching: true,
            chunkSize: 512,
            overlapSize: 50,
            maxWorkers: 4,
            processingTimeout: 300000, // 5 minutes
            ...options
        };
        
        this.amdGaiaProvider = new AMDGaiaProvider(options.gaiaOptions);
        this.processingQueue = [];
        this.activeBatches = new Map();
        this.workerPool = [];
        this.isInitialized = false;
        
        this.stats = {
            documentsProcessed: 0,
            batchesProcessed: 0,
            totalProcessingTime: 0,
            averageProcessingTime: 0,
            chunksGenerated: 0,
            embeddingsGenerated: 0,
            errorCount: 0
        };
        
        this.initializeProcessor();
    }
    
    async initializeProcessor() {
        try {
            console.log('[DocumentProcessor] Initializing optimized document processor...');
            
            // Initialize AMD Gaia provider
            await this.amdGaiaProvider.initializeProvider();
            
            // Initialize worker pool for parallel processing
            if (this.options.enableParallelProcessing) {
                await this.initializeWorkerPool();
            }
            
            this.isInitialized = true;
            this.emit('initialized');
            
            console.log('[DocumentProcessor] Processor initialized successfully');
            
        } catch (error) {
            console.error('[DocumentProcessor] Initialization failed:', error);
            this.emit('initialization-failed', error);
        }
    }
    
    async initializeWorkerPool() {
        try {
            const workerScript = path.join(__dirname, 'workers', 'documentWorker.js');
            
            for (let i = 0; i < this.options.maxWorkers; i++) {
                const worker = new Worker(workerScript, {
                    workerData: {
                        workerId: i,
                        options: this.options
                    }
                });
                
                worker.on('message', (message) => {
                    this.handleWorkerMessage(worker, message);
                });
                
                worker.on('error', (error) => {
                    console.error(`[DocumentProcessor] Worker ${i} error:`, error);
                    this.handleWorkerError(worker, error);
                });
                
                this.workerPool.push({
                    worker,
                    id: i,
                    busy: false,
                    currentTask: null
                });
            }
            
            console.log(`[DocumentProcessor] Worker pool initialized with ${this.workerPool.length} workers`);
            
        } catch (error) {
            console.error('[DocumentProcessor] Worker pool initialization failed:', error);
        }
    }
    
    /**
     * Process documents with intelligent batching and parallel processing
     */
    async processDocuments(documents, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Document processor not initialized');
            }
            
            const config = {
                generateEmbeddings: true,
                extractMetadata: true,
                enableChunking: true,
                ...options
            };
            
            console.log(`[DocumentProcessor] Processing ${documents.length} documents`);
            
            // Create intelligent batches
            const batches = this.createIntelligentBatches(documents, config);
            
            // Process batches
            const results = await this.processBatches(batches, config);
            
            // Aggregate results
            const aggregatedResults = this.aggregateResults(results);
            
            this.updateStats(documents.length, batches.length);
            
            this.emit('documents-processed', {
                documentCount: documents.length,
                batchCount: batches.length,
                results: aggregatedResults
            });
            
            return aggregatedResults;
            
        } catch (error) {
            console.error('[DocumentProcessor] Document processing failed:', error);
            this.stats.errorCount++;
            throw error;
        }
    }
    
    /**
     * Create intelligent batches based on document characteristics
     */
    createIntelligentBatches(documents, config) {
        if (!this.options.enableIntelligentBatching) {
            return this.createSimpleBatches(documents);
        }
        
        try {
            // Analyze documents for optimal batching
            const documentAnalysis = documents.map(doc => ({
                document: doc,
                size: this.estimateDocumentSize(doc),
                complexity: this.estimateDocumentComplexity(doc),
                type: this.detectDocumentType(doc)
            }));
            
            // Sort by processing complexity
            documentAnalysis.sort((a, b) => a.complexity - b.complexity);
            
            // Create balanced batches
            const batches = [];
            let currentBatch = [];
            let currentBatchSize = 0;
            let currentBatchComplexity = 0;
            
            for (const analysis of documentAnalysis) {
                const wouldExceedSize = currentBatchSize + analysis.size > this.options.batchSize;
                const wouldExceedComplexity = currentBatchComplexity + analysis.complexity > 100;
                
                if (wouldExceedSize || wouldExceedComplexity) {
                    if (currentBatch.length > 0) {
                        batches.push(currentBatch);
                        currentBatch = [];
                        currentBatchSize = 0;
                        currentBatchComplexity = 0;
                    }
                }
                
                currentBatch.push(analysis.document);
                currentBatchSize += analysis.size;
                currentBatchComplexity += analysis.complexity;
            }
            
            if (currentBatch.length > 0) {
                batches.push(currentBatch);
            }
            
            console.log(`[DocumentProcessor] Created ${batches.length} intelligent batches`);
            return batches;
            
        } catch (error) {
            console.error('[DocumentProcessor] Intelligent batching failed, using simple batching:', error);
            return this.createSimpleBatches(documents);
        }
    }
    
    createSimpleBatches(documents) {
        const batches = [];
        for (let i = 0; i < documents.length; i += this.options.batchSize) {
            batches.push(documents.slice(i, i + this.options.batchSize));
        }
        return batches;
    }
    
    estimateDocumentSize(document) {
        // Estimate processing size based on content length
        const content = document.content || document.text || '';
        return Math.ceil(content.length / 1000); // Size units
    }
    
    estimateDocumentComplexity(document) {
        // Estimate processing complexity based on document characteristics
        const content = document.content || document.text || '';
        let complexity = 1;
        
        // Add complexity for length
        complexity += Math.min(content.length / 10000, 10);
        
        // Add complexity for special content types
        if (document.type === 'pdf') complexity += 2;
        if (document.type === 'html') complexity += 1;
        if (content.includes('table') || content.includes('<table>')) complexity += 2;
        
        return Math.min(complexity, 20);
    }
    
    detectDocumentType(document) {
        if (document.type) return document.type;
        
        const content = document.content || document.text || '';
        if (content.includes('<html>') || content.includes('<!DOCTYPE')) return 'html';
        if (content.includes('%PDF')) return 'pdf';
        
        return 'text';
    }
    
    /**
     * Process batches with parallel execution
     */
    async processBatches(batches, config) {
        try {
            const results = [];
            const concurrentBatches = Math.min(batches.length, this.options.maxConcurrentBatches);
            
            // Process batches in parallel
            for (let i = 0; i < batches.length; i += concurrentBatches) {
                const batchSlice = batches.slice(i, i + concurrentBatches);
                const batchPromises = batchSlice.map((batch, index) => 
                    this.processBatch(batch, config, i + index)
                );
                
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            }
            
            return results;
            
        } catch (error) {
            console.error('[DocumentProcessor] Batch processing failed:', error);
            throw error;
        }
    }
    
    /**
     * Process a single batch of documents
     */
    async processBatch(documents, config, batchIndex) {
        const startTime = Date.now();
        const batchId = `batch_${batchIndex}_${Date.now()}`;
        
        try {
            console.log(`[DocumentProcessor] Processing batch ${batchIndex} with ${documents.length} documents`);
            
            this.activeBatches.set(batchId, {
                documents: documents.length,
                startTime,
                status: 'processing'
            });
            
            // Process documents in parallel using workers
            const documentPromises = documents.map(doc => this.processDocument(doc, config));
            const documentResults = await Promise.all(documentPromises);
            
            // Generate embeddings for all chunks in batch
            if (config.generateEmbeddings) {
                await this.generateBatchEmbeddings(documentResults, config);
            }
            
            const processingTime = Date.now() - startTime;
            
            this.activeBatches.set(batchId, {
                documents: documents.length,
                startTime,
                processingTime,
                status: 'completed'
            });
            
            this.emit('batch-processed', {
                batchId,
                batchIndex,
                documentCount: documents.length,
                processingTime
            });
            
            return {
                batchId,
                batchIndex,
                documents: documentResults,
                processingTime
            };
            
        } catch (error) {
            console.error(`[DocumentProcessor] Batch ${batchIndex} processing failed:`, error);
            
            this.activeBatches.set(batchId, {
                documents: documents.length,
                startTime,
                status: 'failed',
                error: error.message
            });
            
            throw error;
        }
    }
    
    /**
     * Process a single document
     */
    async processDocument(document, config) {
        try {
            const result = {
                id: document.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                originalDocument: document,
                chunks: [],
                metadata: {},
                embeddings: [],
                processingTime: 0
            };
            
            const startTime = Date.now();
            
            // Extract metadata
            if (config.extractMetadata) {
                result.metadata = await this.extractMetadata(document);
            }
            
            // Chunk document
            if (config.enableChunking) {
                result.chunks = await this.chunkDocument(document, config);
                this.stats.chunksGenerated += result.chunks.length;
            } else {
                result.chunks = [{ text: document.content || document.text, index: 0 }];
            }
            
            result.processingTime = Date.now() - startTime;
            
            return result;
            
        } catch (error) {
            console.error('[DocumentProcessor] Document processing failed:', error);
            throw error;
        }
    }
    
    /**
     * Generate embeddings for batch of document chunks
     */
    async generateBatchEmbeddings(documentResults, config) {
        try {
            // Collect all chunks from all documents
            const allChunks = [];
            const chunkToDocumentMap = new Map();
            
            for (const docResult of documentResults) {
                for (const chunk of docResult.chunks) {
                    allChunks.push(chunk.text);
                    chunkToDocumentMap.set(allChunks.length - 1, {
                        documentId: docResult.id,
                        chunkIndex: chunk.index
                    });
                }
            }
            
            // Generate embeddings using AMD Gaia provider
            const embeddings = await this.amdGaiaProvider.generateEmbeddings(allChunks, {
                batchSize: this.options.batchSize,
                precision: 'fp16'
            });
            
            // Assign embeddings back to documents
            for (let i = 0; i < embeddings.length; i++) {
                const mapping = chunkToDocumentMap.get(i);
                const docResult = documentResults.find(doc => doc.id === mapping.documentId);
                
                if (docResult) {
                    if (!docResult.embeddings) docResult.embeddings = [];
                    docResult.embeddings.push({
                        chunkIndex: mapping.chunkIndex,
                        embedding: embeddings[i],
                        dimensions: embeddings[i].length
                    });
                }
            }
            
            this.stats.embeddingsGenerated += embeddings.length;
            
        } catch (error) {
            console.error('[DocumentProcessor] Batch embedding generation failed:', error);
            throw error;
        }
    }
    
    /**
     * Extract metadata from document
     */
    async extractMetadata(document) {
        try {
            const metadata = {
                type: this.detectDocumentType(document),
                size: this.estimateDocumentSize(document),
                complexity: this.estimateDocumentComplexity(document),
                wordCount: 0,
                language: 'en', // Would use language detection
                extractedAt: Date.now()
            };
            
            const content = document.content || document.text || '';
            metadata.wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
            
            // Add document-specific metadata
            if (document.title) metadata.title = document.title;
            if (document.author) metadata.author = document.author;
            if (document.createdAt) metadata.createdAt = document.createdAt;
            
            return metadata;
            
        } catch (error) {
            console.error('[DocumentProcessor] Metadata extraction failed:', error);
            return {};
        }
    }
    
    /**
     * Chunk document into smaller pieces
     */
    async chunkDocument(document, config) {
        try {
            const content = document.content || document.text || '';
            const chunks = [];
            
            const chunkSize = config.chunkSize || this.options.chunkSize;
            const overlapSize = config.overlapSize || this.options.overlapSize;
            
            // Simple sentence-aware chunking
            const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
            
            let currentChunk = '';
            let chunkIndex = 0;
            
            for (const sentence of sentences) {
                const trimmedSentence = sentence.trim();
                
                if (currentChunk.length + trimmedSentence.length > chunkSize && currentChunk.length > 0) {
                    chunks.push({
                        text: currentChunk.trim(),
                        index: chunkIndex,
                        startPosition: content.indexOf(currentChunk.trim()),
                        length: currentChunk.trim().length
                    });
                    
                    // Handle overlap
                    const words = currentChunk.trim().split(/\s+/);
                    const overlapWords = words.slice(-overlapSize);
                    currentChunk = overlapWords.join(' ') + ' ' + trimmedSentence;
                    chunkIndex++;
                } else {
                    currentChunk += (currentChunk.length > 0 ? ' ' : '') + trimmedSentence;
                }
            }
            
            // Add final chunk
            if (currentChunk.trim().length > 0) {
                chunks.push({
                    text: currentChunk.trim(),
                    index: chunkIndex,
                    startPosition: content.indexOf(currentChunk.trim()),
                    length: currentChunk.trim().length
                });
            }
            
            return chunks;
            
        } catch (error) {
            console.error('[DocumentProcessor] Document chunking failed:', error);
            return [{ text: document.content || document.text, index: 0 }];
        }
    }
    
    aggregateResults(batchResults) {
        const aggregated = {
            totalDocuments: 0,
            totalChunks: 0,
            totalEmbeddings: 0,
            totalProcessingTime: 0,
            documents: [],
            batchStats: []
        };
        
        for (const batchResult of batchResults) {
            aggregated.totalDocuments += batchResult.documents.length;
            aggregated.totalProcessingTime += batchResult.processingTime;
            aggregated.documents.push(...batchResult.documents);
            
            aggregated.batchStats.push({
                batchId: batchResult.batchId,
                documentCount: batchResult.documents.length,
                processingTime: batchResult.processingTime
            });
            
            for (const doc of batchResult.documents) {
                aggregated.totalChunks += doc.chunks.length;
                aggregated.totalEmbeddings += doc.embeddings?.length || 0;
            }
        }
        
        return aggregated;
    }
    
    updateStats(documentCount, batchCount) {
        this.stats.documentsProcessed += documentCount;
        this.stats.batchesProcessed += batchCount;
        
        if (this.stats.documentsProcessed > 0) {
            this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.documentsProcessed;
        }
    }
    
    getStats() {
        return {
            ...this.stats,
            activeBatches: this.activeBatches.size,
            workerPoolSize: this.workerPool.length,
            isInitialized: this.isInitialized,
            gaiaProviderStats: this.amdGaiaProvider.getStats()
        };
    }
    
    async dispose() {
        try {
            // Dispose worker pool
            for (const workerInfo of this.workerPool) {
                await workerInfo.worker.terminate();
            }
            
            // Dispose AMD Gaia provider
            if (this.amdGaiaProvider) {
                await this.amdGaiaProvider.dispose();
            }
            
            this.removeAllListeners();
            
            console.log('[DocumentProcessor] Optimized document processor disposed');
            
        } catch (error) {
            console.error('[DocumentProcessor] Disposal failed:', error);
        }
    }
}

module.exports = OptimizedDocumentProcessor;
