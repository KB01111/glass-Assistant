const { BasePlugin } = require('glass-assistant/plugin-api');

/**
 * {{PLUGIN_NAME}} Plugin
 * {{PLUGIN_DESCRIPTION}}
 */
class {{PLUGIN_CLASS_NAME}} extends BasePlugin {
    constructor(context) {
        super(context);

        // Plugin-specific properties
        this.settings = {};
        this.isActive = false;
    }

    /**
     * Initialize the plugin
     */
    async initialize() {
        await super.initialize();

        try {
            // Load plugin configuration
            this.settings = this.api.getConfig();

            // Register extension points
            await this.registerExtensions();

            // Setup event listeners
            this.setupEventListeners();

            // Initialize plugin-specific functionality
            await this.initializeFeatures();

            this.isActive = true;
            this.logger.info('Plugin initialized successfully');

        } catch (error) {
            this.logger.error('Failed to initialize plugin:', error);
            throw error;
        }
    }

    /**
     * Register plugin extensions
     */
    async registerExtensions() {
        // Example: Register AI middleware
        if (this.api.hasPermission('ai:middleware')) {
            this.api.registerAIMiddleware('pre-process', this.handleAIPreProcess.bind(this));
        }

        // Example: Register feature extension
        if (this.api.hasPermission('features:extend')) {
            this.api.registerFeatureExtension('ask', 'before-send', this.handleAskBeforeSend.bind(this));
        }

        // Example: Add UI component
        if (this.api.hasPermission('ui:modify')) {
            this.api.addUIComponent('sidebar:right', {
                type: 'button',
                label: '{{PLUGIN_NAME}}',
                icon: 'plugin-icon',
                onClick: this.handleUIClick.bind(this)
            });
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for configuration changes
        this.api.on('configChange', this.handleConfigChange.bind(this));

        // Listen for plugin messages
        this.api.on('message', this.handleMessage.bind(this));
    }

    /**
     * Initialize plugin-specific features
     */
    async initializeFeatures() {
        // Implement your plugin's core functionality here
        this.logger.info('Initializing plugin features...');

        // Example: Setup storage
        if (this.api.hasPermission('storage:access')) {
            const storage = this.api.getStorage();
            const savedData = await storage.get('plugin-data');
            if (savedData) {
                this.logger.info('Loaded saved data:', savedData);
            }
        }

        // Example: Setup notifications
        if (this.api.hasPermission('notifications:show')) {
            this.api.showNotification('{{PLUGIN_NAME}}', 'Plugin loaded successfully!');
        }
    }

    // ==================== EVENT HANDLERS ====================

    /**
     * Handle AI pre-processing
     */
    async handleAIPreProcess(context) {
        this.logger.info('Processing AI request:', context);

        // Modify the context as needed
        // Return modified context or null to continue with original
        return context;
    }

    /**
     * Handle Ask feature before send
     */
    async handleAskBeforeSend(context) {
        this.logger.info('Processing ask request:', context);

        // Example: Add custom prompt enhancement
        if (this.settings.enhancePrompts) {
            context.prompt = `Enhanced: ${context.prompt}`;
        }

        return context;
    }

    /**
     * Handle UI component click
     */
    async handleUIClick() {
        this.logger.info('UI component clicked');

        // Example: Show plugin status
        this.api.showNotification('{{PLUGIN_NAME}}', `Plugin is ${this.isActive ? 'active' : 'inactive'}`);
    }

    /**
     * Handle configuration changes
     */
    async handleConfigChange(newConfig) {
        await super.onConfigChange(newConfig);

        this.settings = { ...this.settings, ...newConfig };
        this.logger.info('Configuration updated:', this.settings);

        // Restart features if needed
        if (this.isActive) {
            await this.reinitializeFeatures();
        }
    }

    /**
     * Handle plugin messages
     */
    async handleMessage(from, message, data) {
        await super.onMessage(from, message, data);

        switch (message) {
            case 'ping':
                this.logger.info(`Received ping from ${from}`);
                break;
            case 'status':
                return { active: this.isActive, settings: this.settings };
            default:
                this.logger.warn(`Unknown message: ${message} from ${from}`);
        }
    }

    // ==================== PLUGIN METHODS ====================

    /**
     * Reinitialize features after configuration change
     */
    async reinitializeFeatures() {
        this.logger.info('Reinitializing features...');

        // Cleanup existing features
        await this.cleanupFeatures();

        // Reinitialize with new settings
        await this.initializeFeatures();
    }

    /**
     * Cleanup features
     */
    async cleanupFeatures() {
        // Cleanup plugin-specific resources
        this.logger.info('Cleaning up features...');
    }

    /**
     * Get plugin status
     */
    getStatus() {
        return {
            id: this.id,
            name: this.metadata.name,
            version: this.metadata.version,
            active: this.isActive,
            settings: this.settings
        };
    }

    /**
     * Plugin cleanup
     */
    async cleanup() {
        await super.cleanup();

        try {
            // Cleanup plugin-specific resources
            await this.cleanupFeatures();

            // Save any important data
            if (this.api.hasPermission('storage:access')) {
                const storage = this.api.getStorage();
                await storage.set('plugin-data', this.getStatus());
            }

            this.isActive = false;
            this.logger.info('Plugin cleaned up successfully');

        } catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }
}

module.exports = {{PLUGIN_CLASS_NAME}};