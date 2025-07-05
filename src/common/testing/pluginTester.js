const { PluginManager } = require('../services/pluginManager');
const { PluginAPI } = require('../services/pluginAPI');
const { PluginSecurityManager } = require('../services/pluginSecurity');
const EventEmitter = require('events');

/**
 * Plugin Testing Framework
 * Provides utilities for testing plugins in isolation
 */
class PluginTester extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            mockAI: true,
            mockStorage: true,
            mockIPC: true,
            ...options,
        };

        this.loadedPlugins = new Map();
        this.mockServices = {};
        this.setupMocks();
    }

    /**
     * Setup mock services for testing
     */
    setupMocks() {
        if (this.options.mockAI) {
            this.mockServices.ai = {
                generateText: jest.fn().mockResolvedValue('Mock AI response'),
                getConversationContext: jest.fn().mockReturnValue({ messages: [] }),
            };
        }

        if (this.options.mockStorage) {
            this.mockServices.storage = new Map();
        }

        if (this.options.mockIPC) {
            this.mockServices.ipc = {
                handlers: new Map(),
                messages: [],
            };
        }
    }

    /**
     * Load a plugin for testing
     */
    async loadPlugin(PluginClass, metadata = {}) {
        const pluginId = metadata.id || `test-plugin-${Date.now()}`;

        const defaultMetadata = {
            id: pluginId,
            name: 'Test Plugin',
            version: '1.0.0',
            description: 'Plugin for testing',
            author: 'Test Author',
            permissions: [],
            ...metadata,
        };

        // Create mock plugin API
        const mockAPI = this.createMockAPI(pluginId, defaultMetadata);

        // Create plugin context
        const context = {
            id: pluginId,
            metadata: defaultMetadata,
            sandbox: this.createMockSandbox(),
            api: mockAPI,
        };

        // Instantiate plugin
        const plugin = new PluginClass(context);

        // Initialize plugin
        await plugin.initialize();

        this.loadedPlugins.set(pluginId, plugin);

        return plugin;
    }

    /**
     * Create mock plugin API
     */
    createMockAPI(pluginId, metadata) {
        const mockAPI = new EventEmitter();

        // Mock permission system
        mockAPI.hasPermission = jest.fn(permission => {
            return metadata.permissions.includes(permission) || metadata.permissions.includes('*');
        });

        mockAPI.requirePermission = jest.fn(permission => {
            if (!mockAPI.hasPermission(permission)) {
                throw new Error(`Plugin ${pluginId} lacks permission: ${permission}`);
            }
        });

        // Mock AI services
        mockAPI.getAIService = jest.fn(() => this.mockServices.ai);

        mockAPI.registerAIMiddleware = jest.fn((stage, handler) => {
            this.emit('aiMiddlewareRegistered', { pluginId, stage, handler });
        });

        // Mock feature extensions
        mockAPI.registerFeatureExtension = jest.fn((feature, point, handler) => {
            this.emit('featureExtensionRegistered', { pluginId, feature, point, handler });
        });

        // Mock UI components
        mockAPI.addUIComponent = jest.fn((location, component) => {
            this.emit('uiComponentAdded', { pluginId, location, component });
        });

        // Mock storage
        mockAPI.getStorage = jest.fn(() => ({
            set: jest.fn(async (key, value) => {
                this.mockServices.storage.set(`${pluginId}:${key}`, value);
            }),
            get: jest.fn(async key => {
                return this.mockServices.storage.get(`${pluginId}:${key}`);
            }),
            delete: jest.fn(async key => {
                this.mockServices.storage.delete(`${pluginId}:${key}`);
            }),
            clear: jest.fn(async () => {
                for (const key of this.mockServices.storage.keys()) {
                    if (key.startsWith(`${pluginId}:`)) {
                        this.mockServices.storage.delete(key);
                    }
                }
            }),
        }));

        // Mock IPC
        mockAPI.registerIpcHandler = jest.fn((channel, handler) => {
            this.mockServices.ipc.handlers.set(`plugin:${pluginId}:${channel}`, handler);
        });

        mockAPI.sendToRenderer = jest.fn((channel, data) => {
            this.mockServices.ipc.messages.push({
                channel: `plugin:${pluginId}:${channel}`,
                data,
                timestamp: Date.now(),
            });
        });

        // Mock notifications
        mockAPI.showNotification = jest.fn((title, message, options) => {
            this.emit('notificationShown', { pluginId, title, message, options });
        });

        // Mock configuration
        mockAPI.getConfig = jest.fn(() => metadata.config || {});
        mockAPI.updateConfig = jest.fn(async config => {
            metadata.config = { ...metadata.config, ...config };
        });

        // Mock logging
        mockAPI.getLogger = jest.fn(() => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        }));

        // Mock metadata access
        mockAPI.getMetadata = jest.fn(() => metadata);
        mockAPI.isPluginLoaded = jest.fn(id => this.loadedPlugins.has(id));
        mockAPI.getLoadedPlugins = jest.fn(() => Array.from(this.loadedPlugins.keys()));

        return mockAPI;
    }

    /**
     * Create mock sandbox
     */
    createMockSandbox() {
        return {
            context: {},
            runCode: jest.fn((code, filename) => {
                // Mock code execution
                return eval(code);
            }),
        };
    }

    /**
     * Cleanup test environment
     */
    async cleanup() {
        // Cleanup all loaded plugins
        for (const [pluginId, plugin] of this.loadedPlugins) {
            try {
                if (typeof plugin.cleanup === 'function') {
                    await plugin.cleanup();
                }
            } catch (error) {
                console.warn(`Error cleaning up plugin ${pluginId}:`, error);
            }
        }

        this.loadedPlugins.clear();
        this.mockServices = {};
        this.removeAllListeners();
    }
}

module.exports = { PluginTester };
