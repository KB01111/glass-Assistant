const EventEmitter = require('events');
const { EXTENSION_POINTS } = require('./pluginAPI');

/**
 * Plugin Integration Manager
 * Handles integration between plugins and Glass Assistant features
 */
class PluginIntegrationManager extends EventEmitter {
    constructor(pluginManager) {
        super();
        this.pluginManager = pluginManager;
        this.aiMiddleware = new Map(); // stage -> [handlers]
        this.featureExtensions = new Map(); // feature:point -> [handlers]
        this.uiComponents = new Map(); // location -> [components]
        this.systemHooks = new Map(); // hook -> [handlers]
        this.modelExtensions = new Map(); // extension type -> [handlers]
        this.uiExtensions = new Map(); // component type -> [configs]

        this.setupEventListeners();
    }

    /**
     * Setup event listeners for plugin integration
     */
    setupEventListeners() {
        this.pluginManager.on('registerAIMiddleware', this.handleAIMiddlewareRegistration.bind(this));
        this.pluginManager.on('registerFeatureExtension', this.handleFeatureExtensionRegistration.bind(this));
        this.pluginManager.on('addUIComponent', this.handleUIComponentAddition.bind(this));
        this.pluginManager.on('registerExtension', this.handleExtensionRegistration.bind(this));
        this.pluginManager.on('registerUIExtension', this.handleUIExtensionRegistration.bind(this));
        this.pluginManager.on('pluginUnloaded', this.handlePluginUnload.bind(this));
    }

    // ==================== AI PIPELINE INTEGRATION ====================

    /**
     * Handle AI middleware registration
     */
    handleAIMiddlewareRegistration({ pluginId, stage, handler, hookId }) {
        if (!this.aiMiddleware.has(stage)) {
            this.aiMiddleware.set(stage, []);
        }

        this.aiMiddleware.get(stage).push({
            pluginId,
            handler,
            hookId,
            priority: 0, // Default priority
        });

        // Sort by priority (higher priority first)
        this.aiMiddleware.get(stage).sort((a, b) => b.priority - a.priority);

        console.log(`[PluginIntegration] Registered AI middleware: ${pluginId} -> ${stage}`);
    }

    /**
     * Execute AI middleware for a specific stage
     */
    async executeAIMiddleware(stage, context) {
        const middlewares = this.aiMiddleware.get(stage) || [];
        let result = context;

        for (const middleware of middlewares) {
            try {
                const pluginResult = await middleware.handler(result);

                // Middleware can return modified context or null to continue with original
                if (pluginResult !== null && pluginResult !== undefined) {
                    result = pluginResult;
                }

                console.log(`[PluginIntegration] AI middleware executed: ${middleware.pluginId} -> ${stage}`);
            } catch (error) {
                console.error(`[PluginIntegration] AI middleware error in ${middleware.pluginId}:`, error);
                // Continue with other middleware even if one fails
            }
        }

        return result;
    }

    /**
     * Integrate with OpenAI client for AI processing
     */
    async enhanceAIProcessing(originalFunction, stage, context) {
        // Pre-process stage
        if (stage === 'pre-process') {
            context = await this.executeAIMiddleware('pre-process', context);
        }

        // Execute original AI function
        let result;
        try {
            result = await originalFunction(context);
        } catch (error) {
            // Allow middleware to handle errors
            const errorContext = { ...context, error };
            await this.executeAIMiddleware('error', errorContext);
            throw error;
        }

        // Post-process stage
        if (stage === 'post-process') {
            const postContext = { ...context, result };
            const enhancedResult = await this.executeAIMiddleware('post-process', postContext);
            result = enhancedResult.result || result;
        }

        return result;
    }

    // ==================== FEATURE INTEGRATION ====================

    /**
     * Handle feature extension registration
     */
    handleFeatureExtensionRegistration({ pluginId, featureName, extensionPoint, handler, hookId }) {
        const key = `${featureName}:${extensionPoint}`;

        if (!this.featureExtensions.has(key)) {
            this.featureExtensions.set(key, []);
        }

        this.featureExtensions.get(key).push({
            pluginId,
            handler,
            hookId,
            priority: 0,
        });

        // Sort by priority
        this.featureExtensions.get(key).sort((a, b) => b.priority - a.priority);

        console.log(`[PluginIntegration] Registered feature extension: ${pluginId} -> ${key}`);
    }

    /**
     * Execute feature extensions
     */
    async executeFeatureExtensions(featureName, extensionPoint, context) {
        const key = `${featureName}:${extensionPoint}`;
        const extensions = this.featureExtensions.get(key) || [];
        let result = context;

        for (const extension of extensions) {
            try {
                const pluginResult = await extension.handler(result);

                if (pluginResult !== null && pluginResult !== undefined) {
                    result = pluginResult;
                }

                console.log(`[PluginIntegration] Feature extension executed: ${extension.pluginId} -> ${key}`);
            } catch (error) {
                console.error(`[PluginIntegration] Feature extension error in ${extension.pluginId}:`, error);
            }
        }

        return result;
    }

    // ==================== MODEL MANAGEMENT INTEGRATION ====================

    /**
     * Handle model extension registration
     */
    handleExtensionRegistration({ pluginId, extensionType, methods, extensionId }) {
        if (!this.modelExtensions.has(extensionType)) {
            this.modelExtensions.set(extensionType, []);
        }

        this.modelExtensions.get(extensionType).push({
            pluginId,
            methods,
            extensionId,
            priority: 0,
        });

        // Sort by priority
        this.modelExtensions.get(extensionType).sort((a, b) => b.priority - a.priority);

        console.log(`[PluginIntegration] Registered model extension: ${pluginId} -> ${extensionType}`);
    }

    /**
     * Handle UI extension registration
     */
    handleUIExtensionRegistration({ pluginId, componentType, config, extensionId }) {
        if (!this.uiExtensions.has(componentType)) {
            this.uiExtensions.set(componentType, []);
        }

        this.uiExtensions.get(componentType).push({
            pluginId,
            config,
            extensionId,
            priority: 0,
        });

        // Sort by priority
        this.uiExtensions.get(componentType).sort((a, b) => b.priority - a.priority);

        console.log(`[PluginIntegration] Registered UI extension: ${pluginId} -> ${componentType}`);
    }

    /**
     * Get model management extensions
     */
    getModelExtensions(extensionType) {
        return this.modelExtensions.get(extensionType) || [];
    }

    /**
     * Get UI extensions
     */
    getUIExtensions(componentType) {
        return this.uiExtensions.get(componentType) || [];
    }

    /**
     * Integrate with Ask feature
     */
    async enhanceAskFeature(originalAskFunction) {
        return async (prompt, options = {}) => {
            // Before send extensions
            const beforeContext = { prompt, options };
            const enhancedBefore = await this.executeFeatureExtensions('ask', 'before-send', beforeContext);

            // Execute original ask function
            const result = await originalAskFunction(enhancedBefore.prompt, enhancedBefore.options);

            // After response extensions
            const afterContext = { prompt: enhancedBefore.prompt, options: enhancedBefore.options, result };
            const enhancedAfter = await this.executeFeatureExtensions('ask', 'after-response', afterContext);

            return enhancedAfter.result || result;
        };
    }

    /**
     * Integrate with Listen feature
     */
    async enhanceListenFeature(originalListenFunction) {
        return async (audioData, options = {}) => {
            // Audio processing extensions
            const audioContext = { audioData, options };
            const enhancedAudio = await this.executeFeatureExtensions('listen', 'audio-process', audioContext);

            // Execute original listen function
            const transcript = await originalListenFunction(enhancedAudio.audioData, enhancedAudio.options);

            // Transcript processing extensions
            const transcriptContext = { audioData: enhancedAudio.audioData, transcript, options: enhancedAudio.options };
            const enhancedTranscript = await this.executeFeatureExtensions('listen', 'transcript-process', transcriptContext);

            return enhancedTranscript.transcript || transcript;
        };
    }

    // ==================== UI INTEGRATION ====================

    /**
     * Handle UI component addition
     */
    handleUIComponentAddition({ pluginId, location, component }) {
        if (!this.uiComponents.has(location)) {
            this.uiComponents.set(location, []);
        }

        this.uiComponents.get(location).push({
            pluginId,
            component,
            id: `plugin-${pluginId}-${Date.now()}`,
        });

        // Emit event for UI to update
        this.emit('uiComponentAdded', { pluginId, location, component });

        console.log(`[PluginIntegration] UI component added: ${pluginId} -> ${location}`);
    }

    /**
     * Get UI components for a specific location
     */
    getUIComponents(location) {
        return this.uiComponents.get(location) || [];
    }

    /**
     * Remove UI components for a plugin
     */
    removeUIComponents(pluginId) {
        for (const [location, components] of this.uiComponents) {
            const filtered = components.filter(comp => comp.pluginId !== pluginId);
            this.uiComponents.set(location, filtered);
        }

        this.emit('uiComponentsRemoved', { pluginId });
    }

    // ==================== SYSTEM INTEGRATION ====================

    /**
     * Handle plugin unload cleanup
     */
    handlePluginUnload({ pluginId }) {
        // Remove AI middleware
        for (const [stage, middlewares] of this.aiMiddleware) {
            const filtered = middlewares.filter(m => m.pluginId !== pluginId);
            this.aiMiddleware.set(stage, filtered);
        }

        // Remove feature extensions
        for (const [key, extensions] of this.featureExtensions) {
            const filtered = extensions.filter(e => e.pluginId !== pluginId);
            this.featureExtensions.set(key, filtered);
        }

        // Remove UI components
        this.removeUIComponents(pluginId);

        // Remove system hooks
        for (const [hook, handlers] of this.systemHooks) {
            const filtered = handlers.filter(h => h.pluginId !== pluginId);
            this.systemHooks.set(hook, filtered);
        }

        // Remove model extensions
        for (const [extensionType, extensions] of this.modelExtensions) {
            const filtered = extensions.filter(e => e.pluginId !== pluginId);
            this.modelExtensions.set(extensionType, filtered);
        }

        // Remove UI extensions
        for (const [componentType, extensions] of this.uiExtensions) {
            const filtered = extensions.filter(e => e.pluginId !== pluginId);
            this.uiExtensions.set(componentType, filtered);
        }

        console.log(`[PluginIntegration] Cleaned up integrations for plugin: ${pluginId}`);
    }

    /**
     * Execute system hooks
     */
    async executeSystemHooks(hookName, context) {
        const hooks = this.systemHooks.get(hookName) || [];

        for (const hook of hooks) {
            try {
                await hook.handler(context);
                console.log(`[PluginIntegration] System hook executed: ${hook.pluginId} -> ${hookName}`);
            } catch (error) {
                console.error(`[PluginIntegration] System hook error in ${hook.pluginId}:`, error);
            }
        }
    }

    // ==================== SPECIFIC INTEGRATIONS ====================

    /**
     * Create AMD Gaia Plugin integration point
     */
    createAMDGaiaIntegration() {
        return {
            // Register AMD Gaia as an AI provider
            registerAIProvider: (pluginId, gaiaClient) => {
                this.handleAIMiddlewareRegistration({
                    pluginId,
                    stage: 'ai-provider',
                    handler: async context => {
                        // Use AMD Gaia for AI processing
                        if (context.useGaia) {
                            const result = await gaiaClient.process(context.prompt, context.options);
                            return { ...context, result, provider: 'amd-gaia' };
                        }
                        return context;
                    },
                    hookId: `amd-gaia-${pluginId}`,
                });
            },

            // AMD Gaia specific configuration
            configureGaia: config => {
                // Configuration for AMD Gaia integration
                return {
                    modelPath: config.modelPath,
                    deviceType: config.deviceType || 'gpu',
                    maxTokens: config.maxTokens || 2048,
                    temperature: config.temperature || 0.7,
                };
            },
        };
    }

    /**
     * Create LLMware integration point
     */
    createLLMwareIntegration() {
        return {
            // Register LLMware as a document processing provider
            registerDocumentProcessor: (pluginId, llmwareClient) => {
                this.handleFeatureExtensionRegistration({
                    pluginId,
                    featureName: 'ask',
                    extensionPoint: 'document-process',
                    handler: async context => {
                        if (context.documents && context.documents.length > 0) {
                            const processedDocs = await llmwareClient.processDocuments(context.documents);
                            return { ...context, processedDocuments: processedDocs };
                        }
                        return context;
                    },
                    hookId: `llmware-docs-${pluginId}`,
                });
            },

            // LLMware RAG integration
            registerRAGProvider: (pluginId, ragClient) => {
                this.handleAIMiddlewareRegistration({
                    pluginId,
                    stage: 'pre-process',
                    handler: async context => {
                        if (context.useRAG) {
                            const relevantDocs = await ragClient.retrieveRelevantDocuments(context.prompt);
                            return { ...context, relevantDocuments: relevantDocs };
                        }
                        return context;
                    },
                    hookId: `llmware-rag-${pluginId}`,
                });
            },
        };
    }

    /**
     * Create IPC integration wrapper
     */
    createIPCIntegration() {
        return {
            // Wrap existing IPC handlers with plugin support
            wrapIPCHandler: (originalHandler, extensionPoint) => {
                return async (event, ...args) => {
                    // Pre-process through plugins
                    const context = { event, args, extensionPoint };
                    const enhanced = await this.executeFeatureExtensions('ipc', extensionPoint, context);

                    // Execute original handler
                    const result = await originalHandler(event, ...enhanced.args);

                    // Post-process through plugins
                    const postContext = { event, args: enhanced.args, result, extensionPoint };
                    const finalResult = await this.executeFeatureExtensions('ipc', `${extensionPoint}-post`, postContext);

                    return finalResult.result || result;
                };
            },

            // Plugin-safe IPC channel creation
            createPluginChannel: (pluginId, channelName) => {
                return `plugin:${pluginId}:${channelName}`;
            },
        };
    }

    /**
     * Create data storage integration
     */
    createStorageIntegration() {
        return {
            // Plugin-specific storage wrapper
            createPluginStorage: pluginId => {
                const dataService = require('./dataService');

                return {
                    set: async (key, value) => {
                        const prefixedKey = `plugin:${pluginId}:${key}`;
                        return await dataService.setData(prefixedKey, value);
                    },

                    get: async key => {
                        const prefixedKey = `plugin:${pluginId}:${key}`;
                        return await dataService.getData(prefixedKey);
                    },

                    delete: async key => {
                        const prefixedKey = `plugin:${pluginId}:${key}`;
                        return await dataService.deleteData(prefixedKey);
                    },

                    clear: async () => {
                        // Clear all plugin data
                        const allKeys = await dataService.getAllKeys();
                        const pluginKeys = allKeys.filter(key => key.startsWith(`plugin:${pluginId}:`));

                        for (const key of pluginKeys) {
                            await dataService.deleteData(key);
                        }
                    },
                };
            },
        };
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get integration statistics
     */
    getIntegrationStats() {
        return {
            aiMiddleware: Array.from(this.aiMiddleware.entries()).map(([stage, middlewares]) => ({
                stage,
                count: middlewares.length,
                plugins: middlewares.map(m => m.pluginId),
            })),

            featureExtensions: Array.from(this.featureExtensions.entries()).map(([key, extensions]) => ({
                key,
                count: extensions.length,
                plugins: extensions.map(e => e.pluginId),
            })),

            uiComponents: Array.from(this.uiComponents.entries()).map(([location, components]) => ({
                location,
                count: components.length,
                plugins: components.map(c => c.pluginId),
            })),

            systemHooks: Array.from(this.systemHooks.entries()).map(([hook, handlers]) => ({
                hook,
                count: handlers.length,
                plugins: handlers.map(h => h.pluginId),
            })),
        };
    }

    /**
     * Validate integration compatibility
     */
    validateIntegration(pluginId, integrationType, config) {
        const validationRules = {
            'ai-middleware': {
                requiredPermissions: ['ai:middleware'],
                requiredConfig: ['stage'],
            },
            'feature-extension': {
                requiredPermissions: ['features:extend'],
                requiredConfig: ['featureName', 'extensionPoint'],
            },
            'ui-component': {
                requiredPermissions: ['ui:modify'],
                requiredConfig: ['location'],
            },
        };

        const rule = validationRules[integrationType];
        if (!rule) {
            return { valid: false, error: `Unknown integration type: ${integrationType}` };
        }

        const plugin = this.pluginManager.registry.get(pluginId);
        if (!plugin) {
            return { valid: false, error: `Plugin not found: ${pluginId}` };
        }

        // Check permissions
        for (const permission of rule.requiredPermissions) {
            if (!plugin.permissions?.includes(permission)) {
                return { valid: false, error: `Missing permission: ${permission}` };
            }
        }

        // Check configuration
        for (const configKey of rule.requiredConfig) {
            if (!config[configKey]) {
                return { valid: false, error: `Missing configuration: ${configKey}` };
            }
        }

        return { valid: true };
    }
}

module.exports = { PluginIntegrationManager };
