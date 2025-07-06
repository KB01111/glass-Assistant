/**
 * LLMware Integration Service
 * Handles document parsing, text chunking, embedding generation, and RAG pipeline optimization
 */

const EventEmitter = require('events');
const AMDGaiaProvider = require('./amdGaiaProvider');
const { HierarchicalEmbeddingCache } = require('./hierarchicalEmbeddingCache');
const OptimizedDocumentProcessor = require('./optimizedDocumentProcessor');

class LLMwareIntegrationService extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            enableRAGPipeline: true,
            enableSemanticSearch: true,
            enableDocumentParsing: true,
            chunkingStrategy: 'semantic',
            embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
            maxChunkSize: 512,
            chunkOverlap: 50,
            similarityThreshold: 0.7,
            maxRetrievalResults: 10,
            ...options
        };
        
        this.isInitialized = false;
        this.amdGaiaProvider = null;
        this.embeddingCache = null;
        this.documentProcessor = null;
        this.documentStore = new Map(); // In-memory document store
        
        this.stats = {
            documentsProcessed: 0,
            chunksGenerated: 0,
            embeddingsGenerated: 0,
            queriesProcessed: 0,
            cacheHitRate: 0,
            avgProcessingTime: 0
        };
        
        this.initializeService();
    }
    
    async initializeService() {
        try {
            console.log('[LLMware] Initializing LLMware integration service...');
            
            // Initialize AMD Gaia provider for embeddings
            this.amdGaiaProvider = new AMDGaiaProvider({
                batchSize: 32,
                precision: 'fp16',
                enableBatching: true
            });
            
            // Initialize hierarchical embedding cache
            this.embeddingCache = new HierarchicalEmbeddingCache({
                enableL1: true,
                enableL2: true,
                enableL3: false,
                l1: { maxSize: 1000, maxMemoryMB: 512 },
                l2: { dbPath: './cache/llmware_embeddings.db' }
            });
            
            // Initialize document processor
            this.documentProcessor = new OptimizedDocumentProcessor({
                batchSize: this.options.maxChunkSize / 10,
                enableParallelProcessing: true,
                chunkSize: this.options.maxChunkSize,
                overlapSize: this.options.chunkOverlap
            });
            
            this.isInitialized = true;
            this.emit('initialized');
            
            console.log('[LLMware] Service initialized successfully');
            
        } catch (error) {
            console.error('[LLMware] Service initialization failed:', error);
            this.emit('initialization-failed', error);
        }
    }
    
    /**
     * Process and index documents for RAG pipeline
     */
    async indexDocuments(documents, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('LLMware service not initialized');
            }
            
            console.log(`[LLMware] Indexing ${documents.length} documents`);
            
            const config = {
                generateEmbeddings: true,
                extractMetadata: true,
                enableChunking: true,
                ...options
            };
            
            // Process documents using optimized processor
            const processedResults = await this.documentProcessor.processDocuments(documents, config);
            
            // Store documents and embeddings
            await this.storeProcessedDocuments(processedResults);
            
            this.updateStats(processedResults);
            
            this.emit('documents-indexed', {
                documentCount: documents.length,
                chunkCount: processedResults.totalChunks,
                embeddingCount: processedResults.totalEmbeddings
            });
            
            return {
                success: true,
                documentsIndexed: documents.length,
                chunksGenerated: processedResults.totalChunks,
                embeddingsGenerated: processedResults.totalEmbeddings
            };
            
        } catch (error) {
            console.error('[LLMware] Document indexing failed:', error);
            throw error;
        }
    }
    
    /**
     * Store processed documents and their embeddings
     */
    async storeProcessedDocuments(processedResults) {
        try {
            for (const document of processedResults.documents) {
                // Store document metadata
                this.documentStore.set(document.id, {
                    id: document.id,
                    metadata: document.metadata,
                    chunks: document.chunks.map(chunk => ({
                        ...chunk,
                        documentId: document.id
                    })),
                    processingTime: document.processingTime,
                    indexedAt: Date.now()
                });
                
                // Store embeddings in cache
                if (document.embeddings) {
                    for (const embeddingData of document.embeddings) {
                        await this.embeddingCache.set(
                            document.id,
                            embeddingData.chunkIndex.toString(),
                            embeddingData.embedding,
                            {
                                dimensions: embeddingData.dimensions,
                                chunkText: document.chunks[embeddingData.chunkIndex]?.text,
                                documentMetadata: document.metadata
                            }
                        );
                    }
                }
            }
            
        } catch (error) {
            console.error('[LLMware] Document storage failed:', error);
            throw error;
        }
    }
    
    /**
     * Perform semantic search using RAG pipeline
     */
    async semanticSearch(query, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('LLMware service not initialized');
            }
            
            const config = {
                maxResults: options.maxResults || this.options.maxRetrievalResults,
                similarityThreshold: options.similarityThreshold || this.options.similarityThreshold,
                includeMetadata: options.includeMetadata !== false,
                rerank: options.rerank !== false,
                ...options
            };
            
            console.log(`[LLMware] Performing semantic search for: "${query}"`);
            
            // Generate query embedding
            const queryEmbedding = await this.generateQueryEmbedding(query);
            
            // Search for similar embeddings
            const searchResults = await this.searchSimilarEmbeddings(queryEmbedding, config);
            
            // Rerank results if enabled
            const rankedResults = config.rerank ? 
                await this.rerankResults(query, searchResults, config) : 
                searchResults;
            
            // Prepare response
            const response = await this.prepareSearchResponse(rankedResults, config);
            
            this.stats.queriesProcessed++;
            
            this.emit('search-completed', {
                query,
                resultCount: response.results.length,
                processingTime: response.processingTime
            });
            
            return response;
            
        } catch (error) {
            console.error('[LLMware] Semantic search failed:', error);
            throw error;
        }
    }
    
    /**
     * Generate embedding for search query
     */
    async generateQueryEmbedding(query) {
        try {
            // Check cache first
            const cacheKey = this.generateQueryCacheKey(query);
            const cachedEmbedding = await this.embeddingCache.get('query', cacheKey);
            
            if (cachedEmbedding) {
                return cachedEmbedding;
            }
            
            // Generate new embedding
            const embeddings = await this.amdGaiaProvider.generateEmbeddings([query], {
                batchSize: 1,
                precision: 'fp16'
            });
            
            const queryEmbedding = embeddings[0];
            
            // Cache the query embedding
            await this.embeddingCache.set('query', cacheKey, queryEmbedding, {
                query,
                generatedAt: Date.now()
            });
            
            return queryEmbedding;
            
        } catch (error) {
            console.error('[LLMware] Query embedding generation failed:', error);
            throw error;
        }
    }
    
    /**
     * Search for similar embeddings in the cache
     */
    async searchSimilarEmbeddings(queryEmbedding, config) {
        try {
            // Use L2 cache vector search capabilities
            const searchResults = await this.embeddingCache.search(queryEmbedding, {
                limit: config.maxResults * 2, // Get more results for reranking
                threshold: config.similarityThreshold
            });
            
            return searchResults;
            
        } catch (error) {
            console.error('[LLMware] Embedding search failed:', error);
            return [];
        }
    }
    
    /**
     * Rerank search results based on query relevance
     */
    async rerankResults(query, searchResults, config) {
        try {
            // Simple reranking based on text similarity and metadata
            const rankedResults = searchResults.map(result => {
                let score = result.similarity;
                
                // Boost score based on metadata relevance
                if (result.metadata?.documentMetadata) {
                    const docMeta = result.metadata.documentMetadata;
                    
                    // Boost if query terms appear in title
                    if (docMeta.title && this.containsQueryTerms(query, docMeta.title)) {
                        score += 0.1;
                    }
                    
                    // Boost recent documents
                    if (docMeta.createdAt) {
                        const daysSinceCreation = (Date.now() - new Date(docMeta.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                        if (daysSinceCreation < 30) {
                            score += 0.05;
                        }
                    }
                }
                
                return {
                    ...result,
                    rerankScore: score
                };
            });
            
            // Sort by rerank score
            rankedResults.sort((a, b) => b.rerankScore - a.rerankScore);
            
            return rankedResults.slice(0, config.maxResults);
            
        } catch (error) {
            console.error('[LLMware] Result reranking failed:', error);
            return searchResults.slice(0, config.maxResults);
        }
    }
    
    /**
     * Prepare final search response
     */
    async prepareSearchResponse(searchResults, config) {
        const startTime = Date.now();
        
        try {
            const response = {
                query: config.originalQuery,
                results: [],
                metadata: {
                    totalResults: searchResults.length,
                    processingTime: 0,
                    cacheHitRate: this.embeddingCache.getStats().overallHitRate
                }
            };
            
            for (const result of searchResults) {
                const responseItem = {
                    documentId: result.documentId,
                    chunkId: result.chunkId,
                    text: result.metadata?.chunkText || '',
                    similarity: result.similarity,
                    score: result.rerankScore || result.similarity
                };
                
                if (config.includeMetadata && result.metadata?.documentMetadata) {
                    responseItem.documentMetadata = result.metadata.documentMetadata;
                }
                
                response.results.push(responseItem);
            }
            
            response.metadata.processingTime = Date.now() - startTime;
            
            return response;
            
        } catch (error) {
            console.error('[LLMware] Response preparation failed:', error);
            throw error;
        }
    }
    
    /**
     * Generate RAG context from search results
     */
    async generateRAGContext(searchResults, options = {}) {
        try {
            const config = {
                maxContextLength: options.maxContextLength || 2048,
                includeMetadata: options.includeMetadata !== false,
                ...options
            };
            
            let context = '';
            let currentLength = 0;
            const sources = [];
            
            for (const result of searchResults) {
                const text = result.text || result.metadata?.chunkText || '';
                
                if (currentLength + text.length > config.maxContextLength) {
                    break;
                }
                
                context += text + '\n\n';
                currentLength += text.length + 2;
                
                sources.push({
                    documentId: result.documentId,
                    chunkId: result.chunkId,
                    similarity: result.similarity
                });
            }
            
            return {
                context: context.trim(),
                sources,
                metadata: {
                    contextLength: currentLength,
                    sourceCount: sources.length
                }
            };
            
        } catch (error) {
            console.error('[LLMware] RAG context generation failed:', error);
            throw error;
        }
    }
    
    /**
     * Utility methods
     */
    generateQueryCacheKey(query) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(query.toLowerCase().trim()).digest('hex');
    }
    
    containsQueryTerms(query, text) {
        const queryTerms = query.toLowerCase().split(/\s+/);
        const textLower = text.toLowerCase();
        
        return queryTerms.some(term => textLower.includes(term));
    }
    
    updateStats(processedResults) {
        this.stats.documentsProcessed += processedResults.totalDocuments;
        this.stats.chunksGenerated += processedResults.totalChunks;
        this.stats.embeddingsGenerated += processedResults.totalEmbeddings;
        
        if (processedResults.totalDocuments > 0) {
            this.stats.avgProcessingTime = processedResults.totalProcessingTime / processedResults.totalDocuments;
        }
        
        this.stats.cacheHitRate = this.embeddingCache.getStats().overallHitRate;
    }
    
    /**
     * Get service statistics
     */
    getStats() {
        return {
            ...this.stats,
            documentsStored: this.documentStore.size,
            embeddingCacheStats: this.embeddingCache.getStats(),
            gaiaProviderStats: this.amdGaiaProvider?.getStats(),
            documentProcessorStats: this.documentProcessor?.getStats()
        };
    }
    
    /**
     * Get document by ID
     */
    getDocument(documentId) {
        return this.documentStore.get(documentId);
    }
    
    /**
     * List all indexed documents
     */
    listDocuments(options = {}) {
        const documents = Array.from(this.documentStore.values());
        
        if (options.limit) {
            return documents.slice(0, options.limit);
        }
        
        return documents;
    }
    
    /**
     * Remove document from index
     */
    async removeDocument(documentId) {
        try {
            const document = this.documentStore.get(documentId);
            
            if (document) {
                // Remove from document store
                this.documentStore.delete(documentId);
                
                // Remove embeddings from cache (if possible)
                // Note: L1 and L2 caches don't have direct delete methods in this implementation
                // This would need to be enhanced for production use
                
                this.emit('document-removed', { documentId });
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('[LLMware] Document removal failed:', error);
            throw error;
        }
    }
    
    /**
     * Dispose of the service
     */
    async dispose() {
        try {
            if (this.embeddingCache) {
                await this.embeddingCache.dispose();
            }
            
            if (this.amdGaiaProvider) {
                await this.amdGaiaProvider.dispose();
            }
            
            if (this.documentProcessor) {
                await this.documentProcessor.dispose();
            }
            
            this.documentStore.clear();
            this.removeAllListeners();
            
            console.log('[LLMware] Service disposed');
            
        } catch (error) {
            console.error('[LLMware] Service disposal failed:', error);
        }
    }
}

/**
 * Unified Model Pipeline Manager
 * Coordinates AMD Gaia NPU and LLMware processing with shared resource management
 */
class UnifiedModelPipeline extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            enableParallelProcessing: true,
            enableResourceSharing: true,
            enableIntelligentRouting: true,
            maxConcurrentPipelines: 4,
            pipelineTimeout: 600000, // 10 minutes
            ...options
        };

        this.llmwareService = null;
        this.resourceManager = options.resourceManager;
        this.activePipelines = new Map();
        this.pipelineQueue = [];
        this.isInitialized = false;

        this.stats = {
            pipelinesExecuted: 0,
            totalProcessingTime: 0,
            averageProcessingTime: 0,
            resourceUtilization: 0,
            errorCount: 0
        };

        this.initializePipeline();
    }

    async initializePipeline() {
        try {
            console.log('[UnifiedPipeline] Initializing unified model pipeline...');

            // Initialize LLMware service
            this.llmwareService = new LLMwareIntegrationService({
                enableRAGPipeline: true,
                enableSemanticSearch: true,
                embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2'
            });

            // Wait for LLMware service to initialize
            await new Promise((resolve, reject) => {
                this.llmwareService.once('initialized', resolve);
                this.llmwareService.once('initialization-failed', reject);
            });

            this.isInitialized = true;
            this.emit('pipeline-initialized');

            console.log('[UnifiedPipeline] Pipeline initialized successfully');

        } catch (error) {
            console.error('[UnifiedPipeline] Pipeline initialization failed:', error);
            this.emit('pipeline-initialization-failed', error);
        }
    }

    /**
     * Execute end-to-end document processing pipeline
     */
    async executeDocumentPipeline(documents, query = null, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Unified pipeline not initialized');
            }

            const pipelineId = this.generatePipelineId();
            const startTime = Date.now();

            console.log(`[UnifiedPipeline] Executing pipeline ${pipelineId} for ${documents.length} documents`);

            const config = {
                indexDocuments: true,
                performSearch: !!query,
                generateRAGContext: !!query,
                enableOptimizations: true,
                ...options
            };

            // Track active pipeline
            this.activePipelines.set(pipelineId, {
                id: pipelineId,
                startTime,
                status: 'running',
                documents: documents.length,
                query
            });

            const result = {
                pipelineId,
                indexingResult: null,
                searchResult: null,
                ragContext: null,
                processingTime: 0,
                resourceUsage: {}
            };

            // Step 1: Index documents
            if (config.indexDocuments) {
                result.indexingResult = await this.executeIndexingStep(documents, config);
            }

            // Step 2: Perform semantic search if query provided
            if (config.performSearch && query) {
                result.searchResult = await this.executeSearchStep(query, config);
            }

            // Step 3: Generate RAG context if needed
            if (config.generateRAGContext && result.searchResult) {
                result.ragContext = await this.executeRAGStep(result.searchResult, config);
            }

            // Calculate final metrics
            result.processingTime = Date.now() - startTime;
            result.resourceUsage = await this.getResourceUsage();

            // Update pipeline status
            this.activePipelines.set(pipelineId, {
                ...this.activePipelines.get(pipelineId),
                status: 'completed',
                processingTime: result.processingTime
            });

            this.updateStats(result);

            this.emit('pipeline-completed', {
                pipelineId,
                processingTime: result.processingTime,
                documentsProcessed: documents.length
            });

            return result;

        } catch (error) {
            console.error('[UnifiedPipeline] Pipeline execution failed:', error);
            this.stats.errorCount++;
            throw error;
        }
    }

    async executeIndexingStep(documents, config) {
        try {
            console.log('[UnifiedPipeline] Executing indexing step...');

            const indexingResult = await this.llmwareService.indexDocuments(documents, {
                generateEmbeddings: true,
                extractMetadata: true,
                enableChunking: true
            });

            this.emit('indexing-completed', indexingResult);

            return indexingResult;

        } catch (error) {
            console.error('[UnifiedPipeline] Indexing step failed:', error);
            throw error;
        }
    }

    async executeSearchStep(query, config) {
        try {
            console.log(`[UnifiedPipeline] Executing search step for query: "${query}"`);

            const searchResult = await this.llmwareService.semanticSearch(query, {
                maxResults: config.maxResults || 10,
                similarityThreshold: config.similarityThreshold || 0.7,
                includeMetadata: true,
                rerank: true
            });

            this.emit('search-completed', searchResult);

            return searchResult;

        } catch (error) {
            console.error('[UnifiedPipeline] Search step failed:', error);
            throw error;
        }
    }

    async executeRAGStep(searchResult, config) {
        try {
            console.log('[UnifiedPipeline] Executing RAG context generation step...');

            const ragContext = await this.llmwareService.generateRAGContext(searchResult.results, {
                maxContextLength: config.maxContextLength || 2048,
                includeMetadata: true
            });

            this.emit('rag-completed', ragContext);

            return ragContext;

        } catch (error) {
            console.error('[UnifiedPipeline] RAG step failed:', error);
            throw error;
        }
    }

    /**
     * Execute batch processing pipeline for multiple document sets
     */
    async executeBatchPipeline(documentBatches, options = {}) {
        try {
            const results = [];
            const concurrentLimit = Math.min(
                documentBatches.length,
                this.options.maxConcurrentPipelines
            );

            console.log(`[UnifiedPipeline] Executing batch pipeline for ${documentBatches.length} batches`);

            // Process batches in parallel
            for (let i = 0; i < documentBatches.length; i += concurrentLimit) {
                const batchSlice = documentBatches.slice(i, i + concurrentLimit);

                const batchPromises = batchSlice.map((documents, index) =>
                    this.executeDocumentPipeline(documents, null, {
                        ...options,
                        batchIndex: i + index
                    })
                );

                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            }

            this.emit('batch-pipeline-completed', {
                batchCount: documentBatches.length,
                totalResults: results.length
            });

            return results;

        } catch (error) {
            console.error('[UnifiedPipeline] Batch pipeline execution failed:', error);
            throw error;
        }
    }

    generatePipelineId() {
        return `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async getResourceUsage() {
        try {
            const usage = {
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                timestamp: Date.now()
            };

            // Add service-specific resource usage
            if (this.llmwareService) {
                usage.llmware = this.llmwareService.getStats();
            }

            if (this.resourceManager) {
                usage.sharedResources = this.resourceManager.getUsageMetrics();
            }

            return usage;

        } catch (error) {
            console.error('[UnifiedPipeline] Resource usage collection failed:', error);
            return {};
        }
    }

    updateStats(result) {
        this.stats.pipelinesExecuted++;
        this.stats.totalProcessingTime += result.processingTime;
        this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.pipelinesExecuted;

        // Update resource utilization (simplified)
        if (result.resourceUsage?.memory) {
            this.stats.resourceUtilization = result.resourceUsage.memory.heapUsed / result.resourceUsage.memory.heapTotal;
        }
    }

    getStats() {
        return {
            ...this.stats,
            activePipelines: this.activePipelines.size,
            queuedPipelines: this.pipelineQueue.length,
            llmwareStats: this.llmwareService?.getStats()
        };
    }

    getActivePipelines() {
        return Array.from(this.activePipelines.values());
    }

    async dispose() {
        try {
            if (this.llmwareService) {
                await this.llmwareService.dispose();
            }

            this.activePipelines.clear();
            this.pipelineQueue = [];
            this.removeAllListeners();

            console.log('[UnifiedPipeline] Pipeline disposed');

        } catch (error) {
            console.error('[UnifiedPipeline] Pipeline disposal failed:', error);
        }
    }
}

module.exports = { LLMwareIntegrationService, UnifiedModelPipeline };
