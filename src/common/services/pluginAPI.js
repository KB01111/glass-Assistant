const { ipcMain, BrowserWindow } = require('electron');
const EventEmitter = require('events');

/**
 * Plugin API - Provides controlled access to Glass Assistant functionality
 * This is the main interface that plugins use to interact with the application
 */
class PluginAPI extends EventEmitter {
    constructor(pluginId, pluginManager) {
        super();
        this.pluginId = pluginId;
        this.pluginManager = pluginManager;
        this.permissions = new Set();
        this.ipcHandlers = new Map();
        this.extensionHooks = new Map();

        // Initialize with plugin metadata permissions
        const metadata = pluginManager.registry.get(pluginId);
        if (metadata && metadata.permissions) {
            metadata.permissions.forEach(permission => this.permissions.add(permission));
        }
    }

    /**
     * Check if plugin has specific permission
     */
    hasPermission(permission) {
        return this.permissions.has(permission) || this.permissions.has('*');
    }

    /**
     * Require permission or throw error
     */
    requirePermission(permission) {
        if (!this.hasPermission(permission)) {
            throw new Error(`Plugin ${this.pluginId} lacks permission: ${permission}`);
        }
    }

    // ==================== AI PIPELINE INTEGRATION ====================

    /**
     * Register AI processing middleware
     */
    registerAIMiddleware(stage, handler) {
        this.requirePermission('ai:middleware');

        const validStages = ['pre-process', 'post-process', 'transform', 'analyze', 'ai-provider'];
        if (!validStages.includes(stage)) {
            throw new Error(`Invalid AI middleware stage: ${stage}`);
        }

        const hookId = `ai:${stage}:${this.pluginId}`;
        this.extensionHooks.set(hookId, handler);

        // Register with the AI pipeline
        this.pluginManager.emit('registerAIMiddleware', {
            pluginId: this.pluginId,
            stage,
            handler,
            hookId,
        });

        return hookId;
    }

    /**
     * Access AI models and services
     */
    getAIService() {
        this.requirePermission('ai:access');

        return {
            // Wrapper for OpenAI client with plugin context
            generateText: async (prompt, options = {}) => {
                const { createOpenAiGenerativeClient, getOpenAiGenerativeModel } = require('./openAiClient');
                const dataService = require('./dataService');

                const apiKey = await dataService.getApiKey();
                if (!apiKey) {
                    throw new Error('No API key available');
                }

                const client = createOpenAiGenerativeClient(apiKey);
                const model = getOpenAiGenerativeModel(client, options.model);

                const result = await model.generateContent([prompt]);

                // Log plugin usage
                this.pluginManager.emit('aiUsage', {
                    pluginId: this.pluginId,
                    action: 'generateText',
                    model: options.model || 'gpt-4.1',
                    timestamp: Date.now(),
                });

                return result.response.text();
            },

            // Access to conversation context
            getConversationContext: () => {
                this.requirePermission('ai:context');
                // Return sanitized conversation context
                return this.pluginManager.emit('getConversationContext', this.pluginId);
            },
        };
    }

    // ==================== MODEL MANAGEMENT ====================

    /**
     * Register model management extension
     */
    registerExtension(extensionType, methods) {
        this.requirePermission('ai:models');

        const validExtensions = ['model-management', 'model-conversion', 'model-monitoring'];
        if (!validExtensions.includes(extensionType)) {
            throw new Error(`Invalid extension type: ${extensionType}`);
        }

        const extensionId = `${extensionType}:${this.pluginId}`;
        this.extensionHooks.set(extensionId, methods);

        // Register with the plugin manager
        this.pluginManager.emit('registerExtension', {
            pluginId: this.pluginId,
            extensionType,
            methods,
            extensionId,
        });

        return extensionId;
    }

    /**
     * Register UI extension for model management
     */
    registerUIExtension(componentType, config) {
        this.requirePermission('ui:extension');

        const validComponents = ['model-browser', 'model-manager', 'model-selector'];
        if (!validComponents.includes(componentType)) {
            throw new Error(`Invalid UI component type: ${componentType}`);
        }

        const extensionId = `ui:${componentType}:${this.pluginId}`;
        this.extensionHooks.set(extensionId, config);

        // Register with the plugin manager
        this.pluginManager.emit('registerUIExtension', {
            pluginId: this.pluginId,
            componentType,
            config,
            extensionId,
        });

        return extensionId;
    }

    /**
     * Access model storage service
     */
    getModelStorage() {
        this.requirePermission('storage:read');

        return {
            getModels: async () => {
                // Get stored models
                return this.pluginManager.getStoredModels();
            },

            storeModel: async modelData => {
                this.requirePermission('storage:write');
                return this.pluginManager.storeModel(modelData);
            },

            deleteModel: async modelId => {
                this.requirePermission('storage:write');
                return this.pluginManager.deleteModel(modelId);
            },
        };
    }

    // ==================== IPC COMMUNICATION ====================

    /**
     * Register IPC handler
     */
    registerIpcHandler(channel, handler) {
        this.requirePermission('ipc:register');

        const prefixedChannel = `plugin:${this.pluginId}:${channel}`;

        if (this.ipcHandlers.has(prefixedChannel)) {
            throw new Error(`IPC handler already registered for channel: ${channel}`);
        }

        const wrappedHandler = async (event, ...args) => {
            try {
                return await handler(event, ...args);
            } catch (error) {
                console.error(`[Plugin ${this.pluginId}] IPC handler error on ${channel}:`, error);
                throw error;
            }
        };

        ipcMain.handle(prefixedChannel, wrappedHandler);
        this.ipcHandlers.set(prefixedChannel, wrappedHandler);

        return prefixedChannel;
    }

    /**
     * Send IPC message to renderer
     */
    sendToRenderer(channel, data) {
        this.requirePermission('ipc:send');

        const prefixedChannel = `plugin:${this.pluginId}:${channel}`;

        BrowserWindow.getAllWindows().forEach(window => {
            if (!window.isDestroyed()) {
                window.webContents.send(prefixedChannel, data);
            }
        });
    }

    /**
     * Invoke IPC on main process
     */
    async invokeMain(channel, ...args) {
        this.requirePermission('ipc:invoke');

        // Only allow invoking specific whitelisted channels
        const allowedChannels = ['get-api-key', 'save-plugin-data', 'get-plugin-data', 'show-notification'];

        if (!allowedChannels.includes(channel)) {
            throw new Error(`IPC channel not allowed for plugins: ${channel}`);
        }

        return new Promise((resolve, reject) => {
            ipcMain.handleOnce(`plugin-invoke:${this.pluginId}:${Date.now()}`, async () => {
                try {
                    const result = await ipcMain.emit(channel, ...args);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    // ==================== FEATURE INTEGRATION ====================

    /**
     * Register feature extension
     */
    registerFeatureExtension(featureName, extensionPoint, handler) {
        this.requirePermission('features:extend');

        const validFeatures = ['ask', 'listen', 'customize', 'onboarding'];
        if (!validFeatures.includes(featureName)) {
            throw new Error(`Invalid feature name: ${featureName}`);
        }

        const hookId = `feature:${featureName}:${extensionPoint}:${this.pluginId}`;
        this.extensionHooks.set(hookId, handler);

        this.pluginManager.emit('registerFeatureExtension', {
            pluginId: this.pluginId,
            featureName,
            extensionPoint,
            handler,
            hookId,
        });

        return hookId;
    }

    /**
     * Add custom UI components
     */
    addUIComponent(location, component) {
        this.requirePermission('ui:modify');

        const validLocations = ['header:menu', 'sidebar:left', 'sidebar:right', 'footer:status', 'modal:overlay'];

        if (!validLocations.includes(location)) {
            throw new Error(`Invalid UI location: ${location}`);
        }

        this.pluginManager.emit('addUIComponent', {
            pluginId: this.pluginId,
            location,
            component,
        });
    }

    // ==================== DATA STORAGE ====================

    /**
     * Plugin-specific data storage
     */
    getStorage() {
        this.requirePermission('storage:access');

        return {
            set: async (key, value) => {
                const dataService = require('./dataService');
                return await dataService.setPluginData(this.pluginId, key, value);
            },

            get: async key => {
                const dataService = require('./dataService');
                return await dataService.getPluginData(this.pluginId, key);
            },

            delete: async key => {
                const dataService = require('./dataService');
                return await dataService.deletePluginData(this.pluginId, key);
            },

            clear: async () => {
                const dataService = require('./dataService');
                return await dataService.clearPluginData(this.pluginId);
            },
        };
    }

    // ==================== CONFIGURATION ====================

    /**
     * Get plugin configuration
     */
    getConfig() {
        this.requirePermission('config:read');

        const metadata = this.pluginManager.registry.get(this.pluginId);
        return metadata ? metadata.config || {} : {};
    }

    /**
     * Update plugin configuration
     */
    async updateConfig(config) {
        this.requirePermission('config:write');

        const metadata = this.pluginManager.registry.get(this.pluginId);
        if (metadata) {
            metadata.config = { ...metadata.config, ...config };
            await this.pluginManager.savePluginRegistry();
        }
    }

    // ==================== NOTIFICATIONS ====================

    /**
     * Show system notification
     */
    showNotification(title, message, options = {}) {
        this.requirePermission('notifications:show');

        const { Notification } = require('electron');

        const notification = new Notification({
            title: `[${this.pluginId}] ${title}`,
            body: message,
            icon: options.icon,
            silent: options.silent || false,
        });

        notification.show();
        return notification;
    }

    // ==================== LOGGING ====================

    /**
     * Plugin-specific logging
     */
    getLogger() {
        return {
            info: (message, ...args) => {
                console.log(`[Plugin:${this.pluginId}] ${message}`, ...args);
            },
            warn: (message, ...args) => {
                console.warn(`[Plugin:${this.pluginId}] ${message}`, ...args);
            },
            error: (message, ...args) => {
                console.error(`[Plugin:${this.pluginId}] ${message}`, ...args);
            },
            debug: (message, ...args) => {
                if (process.env.NODE_ENV === 'development') {
                    console.debug(`[Plugin:${this.pluginId}] ${message}`, ...args);
                }
            },
        };
    }

    // ==================== CLEANUP ====================

    /**
     * Cleanup plugin resources
     */
    async cleanup() {
        // Remove IPC handlers
        for (const [channel, handler] of this.ipcHandlers) {
            ipcMain.removeHandler(channel);
        }
        this.ipcHandlers.clear();

        // Clear extension hooks
        this.extensionHooks.clear();

        // Remove all listeners
        this.removeAllListeners();
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get plugin metadata
     */
    getMetadata() {
        return this.pluginManager.registry.get(this.pluginId);
    }

    /**
     * Check if another plugin is loaded
     */
    isPluginLoaded(pluginId) {
        return this.pluginManager.plugins.has(pluginId);
    }

    /**
     * Get list of loaded plugins
     */
    getLoadedPlugins() {
        return Array.from(this.pluginManager.plugins.keys());
    }

    /**
     * Communicate with another plugin
     */
    async communicateWithPlugin(targetPluginId, message, data) {
        this.requirePermission('plugins:communicate');

        const targetPlugin = this.pluginManager.plugins.get(targetPluginId);
        if (!targetPlugin) {
            throw new Error(`Plugin ${targetPluginId} is not loaded`);
        }

        // Check if target plugin allows communication
        const targetMetadata = this.pluginManager.registry.get(targetPluginId);
        if (!targetMetadata.permissions?.includes('plugins:receive')) {
            throw new Error(`Plugin ${targetPluginId} does not accept inter-plugin communication`);
        }

        // Send message through plugin manager
        return this.pluginManager.emit('pluginMessage', {
            from: this.pluginId,
            to: targetPluginId,
            message,
            data,
            timestamp: Date.now(),
        });
    }
}

/**
 * Base Plugin Class - All plugins should extend this
 */
class BasePlugin {
    constructor(context) {
        this.id = context.id;
        this.metadata = context.metadata;
        this.api = context.api;
        this.sandbox = context.sandbox;
        this.logger = this.api.getLogger();
    }

    /**
     * Initialize the plugin - Override this method
     */
    async initialize() {
        this.logger.info('Plugin initialized');
    }

    /**
     * Cleanup the plugin - Override this method
     */
    async cleanup() {
        this.logger.info('Plugin cleaned up');
    }

    /**
     * Handle plugin messages - Override this method
     */
    async onMessage(from, message, data) {
        this.logger.info(`Received message from ${from}: ${message}`);
    }

    /**
     * Handle configuration changes - Override this method
     */
    async onConfigChange(newConfig) {
        this.logger.info('Configuration changed');
    }
}

/**
 * Extension Points Registry
 * Defines all available extension points in Glass Assistant
 */
const EXTENSION_POINTS = {
    // AI Pipeline Extension Points
    AI_PRE_PROCESS: 'ai:pre-process',
    AI_POST_PROCESS: 'ai:post-process',
    AI_TRANSFORM: 'ai:transform',
    AI_ANALYZE: 'ai:analyze',

    // Feature Extension Points
    ASK_BEFORE_SEND: 'ask:before-send',
    ASK_AFTER_RESPONSE: 'ask:after-response',
    LISTEN_AUDIO_PROCESS: 'listen:audio-process',
    LISTEN_TRANSCRIPT_PROCESS: 'listen:transcript-process',
    CUSTOMIZE_SETTINGS_PANEL: 'customize:settings-panel',
    ONBOARDING_STEP: 'onboarding:step',

    // UI Extension Points
    HEADER_MENU: 'ui:header-menu',
    SIDEBAR_LEFT: 'ui:sidebar-left',
    SIDEBAR_RIGHT: 'ui:sidebar-right',
    FOOTER_STATUS: 'ui:footer-status',
    MODAL_OVERLAY: 'ui:modal-overlay',

    // System Extension Points
    STARTUP: 'system:startup',
    SHUTDOWN: 'system:shutdown',
    CONFIG_CHANGE: 'system:config-change',
};

/**
 * Permission Registry
 * Defines all available permissions for plugins
 */
const PERMISSIONS = {
    // AI Permissions
    AI_ACCESS: 'ai:access',
    AI_MIDDLEWARE: 'ai:middleware',
    AI_CONTEXT: 'ai:context',
    AI_MODELS: 'ai:models',

    // IPC Permissions
    IPC_REGISTER: 'ipc:register',
    IPC_SEND: 'ipc:send',
    IPC_INVOKE: 'ipc:invoke',

    // Feature Permissions
    FEATURES_EXTEND: 'features:extend',
    UI_MODIFY: 'ui:modify',
    UI_EXTENSION: 'ui:extension',

    // Network Permissions
    NETWORK_HTTP: 'network:http',

    // System Permissions (Hardware)
    SYSTEM_HARDWARE: 'system:hardware',

    // Storage Permissions
    STORAGE_ACCESS: 'storage:access',
    STORAGE_READ: 'storage:read',
    STORAGE_WRITE: 'storage:write',

    // Configuration Permissions
    CONFIG_READ: 'config:read',
    CONFIG_WRITE: 'config:write',

    // System Permissions
    NOTIFICATIONS_SHOW: 'notifications:show',
    PLUGINS_COMMUNICATE: 'plugins:communicate',
    PLUGINS_RECEIVE: 'plugins:receive',

    // Special Permissions
    ALL: '*', // Grants all permissions (use with caution)
};

module.exports = {
    PluginAPI,
    BasePlugin,
    EXTENSION_POINTS,
    PERMISSIONS,
};
