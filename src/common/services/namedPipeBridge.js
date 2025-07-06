/**
 * Named Pipes Communication Bridge for high-throughput inter-plugin communication
 * Uses Protocol Buffers for efficient serialization and async message queues
 */

const net = require('net');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');
const { Worker } = require('worker_threads');

// Protocol Buffers schema definition (simplified)
const MessageSchema = {
    encode: (message) => {
        // Simplified protobuf-like encoding
        const buffer = Buffer.alloc(1024);
        let offset = 0;
        
        // Message type (4 bytes)
        buffer.writeUInt32LE(message.type || 0, offset);
        offset += 4;
        
        // Plugin ID length and data
        const pluginIdBuffer = Buffer.from(message.pluginId || '', 'utf8');
        buffer.writeUInt32LE(pluginIdBuffer.length, offset);
        offset += 4;
        pluginIdBuffer.copy(buffer, offset);
        offset += pluginIdBuffer.length;
        
        // Payload length and data
        const payloadBuffer = Buffer.from(JSON.stringify(message.payload || {}), 'utf8');
        buffer.writeUInt32LE(payloadBuffer.length, offset);
        offset += 4;
        payloadBuffer.copy(buffer, offset);
        offset += payloadBuffer.length;
        
        // Timestamp (8 bytes)
        buffer.writeBigUInt64LE(BigInt(message.timestamp || Date.now()), offset);
        offset += 8;
        
        return buffer.slice(0, offset);
    },
    
    decode: (buffer) => {
        let offset = 0;
        
        // Message type
        const type = buffer.readUInt32LE(offset);
        offset += 4;
        
        // Plugin ID
        const pluginIdLength = buffer.readUInt32LE(offset);
        offset += 4;
        const pluginId = buffer.slice(offset, offset + pluginIdLength).toString('utf8');
        offset += pluginIdLength;
        
        // Payload
        const payloadLength = buffer.readUInt32LE(offset);
        offset += 4;
        const payloadStr = buffer.slice(offset, offset + payloadLength).toString('utf8');
        const payload = JSON.parse(payloadStr);
        offset += payloadLength;
        
        // Timestamp
        const timestamp = Number(buffer.readBigUInt64LE(offset));
        
        return { type, pluginId, payload, timestamp };
    }
};

class AsyncMessageQueue extends EventEmitter {
    constructor(maxSize = 10000) {
        super();
        this.queue = [];
        this.maxSize = maxSize;
        this.processing = false;
        this.stats = {
            enqueued: 0,
            processed: 0,
            dropped: 0,
            averageProcessingTime: 0
        };
    }
    
    enqueue(message, priority = 0) {
        if (this.queue.length >= this.maxSize) {
            // Drop oldest low-priority message
            const droppedIndex = this.queue.findIndex(item => item.priority <= priority);
            if (droppedIndex !== -1) {
                this.queue.splice(droppedIndex, 1);
                this.stats.dropped++;
            } else {
                this.stats.dropped++;
                return false; // Queue full, message dropped
            }
        }
        
        const queueItem = {
            message,
            priority,
            timestamp: Date.now(),
            id: this.generateMessageId()
        };
        
        // Insert based on priority (higher priority first)
        const insertIndex = this.queue.findIndex(item => item.priority < priority);
        if (insertIndex === -1) {
            this.queue.push(queueItem);
        } else {
            this.queue.splice(insertIndex, 0, queueItem);
        }
        
        this.stats.enqueued++;
        this.emit('enqueued', queueItem);
        
        if (!this.processing) {
            this.processQueue();
        }
        
        return queueItem.id;
    }
    
    async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return;
        }
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            const startTime = Date.now();
            
            try {
                await this.processMessage(item);
                
                const processingTime = Date.now() - startTime;
                this.updateAverageProcessingTime(processingTime);
                this.stats.processed++;
                
                this.emit('processed', item);
            } catch (error) {
                console.error('Error processing message:', error);
                this.emit('error', { error, item });
            }
        }
        
        this.processing = false;
    }
    
    async processMessage(item) {
        // Override in subclass or set handler
        if (this.messageHandler) {
            await this.messageHandler(item.message);
        } else {
            this.emit('message', item.message);
        }
    }
    
    setMessageHandler(handler) {
        this.messageHandler = handler;
    }
    
    updateAverageProcessingTime(newTime) {
        const alpha = 0.1; // Exponential moving average factor
        this.stats.averageProcessingTime = 
            this.stats.averageProcessingTime * (1 - alpha) + newTime * alpha;
    }
    
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    getStats() {
        return {
            ...this.stats,
            queueLength: this.queue.length,
            processing: this.processing
        };
    }
    
    clear() {
        this.queue = [];
        this.processing = false;
    }
}

class NamedPipeServer extends EventEmitter {
    constructor(pipeName, options = {}) {
        super();
        this.pipeName = pipeName;
        this.server = null;
        this.clients = new Map();
        this.messageQueue = new AsyncMessageQueue(options.maxQueueSize);
        this.options = {
            maxConnections: 100,
            keepAlive: true,
            ...options
        };
        
        this.setupMessageQueue();
    }
    
    setupMessageQueue() {
        this.messageQueue.setMessageHandler(async (message) => {
            await this.broadcastMessage(message);
        });
        
        this.messageQueue.on('error', (error) => {
            console.error('Message queue error:', error);
        });
    }
    
    start() {
        return new Promise((resolve, reject) => {
            const pipePath = this.getPipePath();
            
            this.server = net.createServer((socket) => {
                this.handleClientConnection(socket);
            });
            
            this.server.listen(pipePath, () => {
                console.log(`Named pipe server listening on ${pipePath}`);
                resolve();
            });
            
            this.server.on('error', (error) => {
                console.error('Named pipe server error:', error);
                reject(error);
            });
        });
    }
    
    handleClientConnection(socket) {
        const clientId = this.generateClientId();
        
        console.log(`Client connected: ${clientId}`);
        
        this.clients.set(clientId, {
            socket,
            id: clientId,
            connected: Date.now(),
            lastActivity: Date.now()
        });
        
        socket.on('data', (data) => {
            this.handleClientMessage(clientId, data);
        });
        
        socket.on('close', () => {
            console.log(`Client disconnected: ${clientId}`);
            this.clients.delete(clientId);
        });
        
        socket.on('error', (error) => {
            console.error(`Client error ${clientId}:`, error);
            this.clients.delete(clientId);
        });
        
        this.emit('client-connected', { clientId, socket });
    }
    
    handleClientMessage(clientId, data) {
        try {
            const message = MessageSchema.decode(data);
            message.clientId = clientId;
            
            // Update client activity
            const client = this.clients.get(clientId);
            if (client) {
                client.lastActivity = Date.now();
            }
            
            // Enqueue message for processing
            this.messageQueue.enqueue(message, message.priority || 0);
            
            this.emit('message', message);
        } catch (error) {
            console.error('Error decoding message:', error);
        }
    }
    
    async broadcastMessage(message) {
        const encodedMessage = MessageSchema.encode(message);
        
        for (const [clientId, client] of this.clients) {
            try {
                if (client.socket.writable) {
                    client.socket.write(encodedMessage);
                }
            } catch (error) {
                console.error(`Error sending to client ${clientId}:`, error);
                this.clients.delete(clientId);
            }
        }
    }
    
    async sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client || !client.socket.writable) {
            throw new Error(`Client ${clientId} not found or not writable`);
        }
        
        const encodedMessage = MessageSchema.encode(message);
        client.socket.write(encodedMessage);
    }
    
    getPipePath() {
        if (os.platform() === 'win32') {
            return `\\\\.\\pipe\\${this.pipeName}`;
        } else {
            return path.join(os.tmpdir(), `${this.pipeName}.sock`);
        }
    }
    
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    getStats() {
        return {
            connectedClients: this.clients.size,
            messageQueue: this.messageQueue.getStats(),
            uptime: Date.now() - this.startTime
        };
    }
    
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                // Close all client connections
                for (const [clientId, client] of this.clients) {
                    client.socket.destroy();
                }
                this.clients.clear();
                
                // Close server
                this.server.close(() => {
                    console.log('Named pipe server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

class NamedPipeClient extends EventEmitter {
    constructor(pipeName, options = {}) {
        super();
        this.pipeName = pipeName;
        this.socket = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.reconnectDelay = options.reconnectDelay || 1000;
        this.messageQueue = new AsyncMessageQueue(options.maxQueueSize);
        
        this.setupMessageQueue();
    }
    
    setupMessageQueue() {
        this.messageQueue.setMessageHandler(async (message) => {
            if (this.connected) {
                await this.sendMessage(message);
            } else {
                throw new Error('Not connected to server');
            }
        });
    }
    
    connect() {
        return new Promise((resolve, reject) => {
            const pipePath = this.getPipePath();
            
            this.socket = net.createConnection(pipePath, () => {
                console.log(`Connected to named pipe: ${pipePath}`);
                this.connected = true;
                this.reconnectAttempts = 0;
                this.emit('connected');
                resolve();
            });
            
            this.socket.on('data', (data) => {
                this.handleServerMessage(data);
            });
            
            this.socket.on('close', () => {
                console.log('Disconnected from named pipe server');
                this.connected = false;
                this.emit('disconnected');
                this.attemptReconnect();
            });
            
            this.socket.on('error', (error) => {
                console.error('Named pipe client error:', error);
                this.connected = false;
                reject(error);
            });
        });
    }
    
    handleServerMessage(data) {
        try {
            const message = MessageSchema.decode(data);
            this.emit('message', message);
        } catch (error) {
            console.error('Error decoding server message:', error);
        }
    }
    
    async sendMessage(message) {
        if (!this.connected) {
            throw new Error('Not connected to server');
        }
        
        const encodedMessage = MessageSchema.encode(message);
        this.socket.write(encodedMessage);
    }
    
    queueMessage(message, priority = 0) {
        return this.messageQueue.enqueue(message, priority);
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        setTimeout(() => {
            this.connect().catch((error) => {
                console.error('Reconnection failed:', error);
            });
        }, this.reconnectDelay * this.reconnectAttempts);
    }
    
    getPipePath() {
        if (os.platform() === 'win32') {
            return `\\\\.\\pipe\\${this.pipeName}`;
        } else {
            return path.join(os.tmpdir(), `${this.pipeName}.sock`);
        }
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.destroy();
            this.connected = false;
        }
    }
}

module.exports = {
    NamedPipeServer,
    NamedPipeClient,
    AsyncMessageQueue,
    MessageSchema
};
