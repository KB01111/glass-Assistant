/**
 * Document Worker for Parallel Processing
 * Handles document processing tasks in separate worker threads
 */

const { parentPort, workerData } = require('worker_threads');

class DocumentWorker {
    constructor(workerId, options) {
        this.workerId = workerId;
        this.options = options;
        this.isReady = false;
        
        this.initialize();
    }
    
    async initialize() {
        try {
            console.log(`[DocumentWorker ${this.workerId}] Initializing worker...`);
            
            this.isReady = true;
            
            // Send ready signal to main thread
            parentPort.postMessage({
                type: 'worker-ready',
                workerId: this.workerId
            });
            
        } catch (error) {
            console.error(`[DocumentWorker ${this.workerId}] Initialization failed:`, error);
            
            parentPort.postMessage({
                type: 'worker-error',
                workerId: this.workerId,
                error: error.message
            });
        }
    }
    
    async processDocument(document, config) {
        try {
            const result = {
                id: document.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                originalDocument: document,
                chunks: [],
                metadata: {},
                processingTime: 0
            };
            
            const startTime = Date.now();
            
            // Extract metadata
            if (config.extractMetadata) {
                result.metadata = this.extractMetadata(document);
            }
            
            // Chunk document
            if (config.enableChunking) {
                result.chunks = this.chunkDocument(document, config);
            } else {
                result.chunks = [{ text: document.content || document.text, index: 0 }];
            }
            
            result.processingTime = Date.now() - startTime;
            
            return result;
            
        } catch (error) {
            console.error(`[DocumentWorker ${this.workerId}] Document processing failed:`, error);
            throw error;
        }
    }
    
    extractMetadata(document) {
        try {
            const metadata = {
                type: this.detectDocumentType(document),
                size: this.estimateDocumentSize(document),
                complexity: this.estimateDocumentComplexity(document),
                wordCount: 0,
                language: 'en',
                extractedAt: Date.now(),
                workerId: this.workerId
            };
            
            const content = document.content || document.text || '';
            metadata.wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
            
            if (document.title) metadata.title = document.title;
            if (document.author) metadata.author = document.author;
            if (document.createdAt) metadata.createdAt = document.createdAt;
            
            return metadata;
            
        } catch (error) {
            console.error(`[DocumentWorker ${this.workerId}] Metadata extraction failed:`, error);
            return {};
        }
    }
    
    chunkDocument(document, config) {
        try {
            const content = document.content || document.text || '';
            const chunks = [];
            
            const chunkSize = config.chunkSize || this.options.chunkSize || 512;
            const overlapSize = config.overlapSize || this.options.overlapSize || 50;
            
            // Sentence-aware chunking
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
                        length: currentChunk.trim().length,
                        workerId: this.workerId
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
                    length: currentChunk.trim().length,
                    workerId: this.workerId
                });
            }
            
            return chunks;
            
        } catch (error) {
            console.error(`[DocumentWorker ${this.workerId}] Document chunking failed:`, error);
            return [{ text: document.content || document.text, index: 0, workerId: this.workerId }];
        }
    }
    
    detectDocumentType(document) {
        if (document.type) return document.type;
        
        const content = document.content || document.text || '';
        if (content.includes('<html>') || content.includes('<!DOCTYPE')) return 'html';
        if (content.includes('%PDF')) return 'pdf';
        
        return 'text';
    }
    
    estimateDocumentSize(document) {
        const content = document.content || document.text || '';
        return Math.ceil(content.length / 1000);
    }
    
    estimateDocumentComplexity(document) {
        const content = document.content || document.text || '';
        let complexity = 1;
        
        complexity += Math.min(content.length / 10000, 10);
        
        if (document.type === 'pdf') complexity += 2;
        if (document.type === 'html') complexity += 1;
        if (content.includes('table') || content.includes('<table>')) complexity += 2;
        
        return Math.min(complexity, 20);
    }
    
    async handleMessage(message) {
        try {
            switch (message.type) {
                case 'process-document':
                    const result = await this.processDocument(message.document, message.config);
                    
                    parentPort.postMessage({
                        type: 'document-processed',
                        taskId: message.taskId,
                        workerId: this.workerId,
                        result
                    });
                    break;
                    
                case 'process-batch':
                    const batchResults = [];
                    
                    for (const document of message.documents) {
                        const docResult = await this.processDocument(document, message.config);
                        batchResults.push(docResult);
                    }
                    
                    parentPort.postMessage({
                        type: 'batch-processed',
                        taskId: message.taskId,
                        workerId: this.workerId,
                        results: batchResults
                    });
                    break;
                    
                case 'ping':
                    parentPort.postMessage({
                        type: 'pong',
                        workerId: this.workerId,
                        timestamp: Date.now()
                    });
                    break;
                    
                default:
                    console.warn(`[DocumentWorker ${this.workerId}] Unknown message type: ${message.type}`);
            }
            
        } catch (error) {
            console.error(`[DocumentWorker ${this.workerId}] Message handling failed:`, error);
            
            parentPort.postMessage({
                type: 'worker-error',
                taskId: message.taskId,
                workerId: this.workerId,
                error: error.message
            });
        }
    }
}

// Initialize worker
const worker = new DocumentWorker(workerData.workerId, workerData.options);

// Listen for messages from main thread
parentPort.on('message', (message) => {
    worker.handleMessage(message);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error(`[DocumentWorker ${workerData.workerId}] Uncaught exception:`, error);
    
    parentPort.postMessage({
        type: 'worker-error',
        workerId: workerData.workerId,
        error: error.message,
        fatal: true
    });
    
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error(`[DocumentWorker ${workerData.workerId}] Unhandled rejection:`, reason);
    
    parentPort.postMessage({
        type: 'worker-error',
        workerId: workerData.workerId,
        error: reason.toString(),
        fatal: false
    });
});
