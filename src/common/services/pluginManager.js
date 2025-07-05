const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');
const crypto = require('crypto');
const { PluginSecurityManager } = require('./pluginSecurity');
const { PluginAPI } = require('./pluginAPI');

/**
 * Core Plugin Manager for Glass Assistant
 * Handles plugin lifecycle, security, and communication
 */
class PluginManager extends EventEmitter {
    constructor() {
        super();
        this.plugins = new Map(); // pluginId -> PluginInstance
        this.registry = new Map(); // pluginId -> PluginMetadata
        this.extensionPoints = new Map(); // extensionPoint -> Set<pluginId>
        this.pluginDirectory = path.join(app.getPath('userData'), 'plugins');
        this.isInitialized = false;
        this.securityManager = new PluginSecurityManager();
    }

    /**
     * Initialize the plugin system
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            await this.ensurePluginDirectory();
            await this.loadPluginRegistry();
            await this.discoverPlugins();
            await this.loadEnabledPlugins();

            this.isInitialized = true;
            this.emit('initialized');
            console.log('[PluginManager] Plugin system initialized successfully');
        } catch (error) {
            console.error('[PluginManager] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Discover plugins in the plugin directory
     */
    async discoverPlugins() {
        try {
            const entries = await fs.readdir(this.pluginDirectory, { withFileTypes: true });
            const pluginDirs = entries.filter(entry => entry.isDirectory());

            for (const dir of pluginDirs) {
                const pluginPath = path.join(this.pluginDirectory, dir.name);
                await this.scanPlugin(pluginPath);
            }
        } catch (error) {
            console.error('[PluginManager] Plugin discovery failed:', error);
        }
    }

    /**
     * Scan and validate a plugin directory
     */
    async scanPlugin(pluginPath) {
        try {
            const manifestPath = path.join(pluginPath, 'plugin.json');
            const manifestExists = await fs
                .access(manifestPath)
                .then(() => true)
                .catch(() => false);

            if (!manifestExists) {
                console.warn(`[PluginManager] No manifest found in ${pluginPath}`);
                return;
            }

            const manifestContent = await fs.readFile(manifestPath, 'utf8');
            const manifest = JSON.parse(manifestContent);

            // Validate manifest
            const validationResult = this.validatePluginManifest(manifest);
            if (!validationResult.valid) {
                console.error(`[PluginManager] Invalid manifest in ${pluginPath}:`, validationResult.errors);
                return;
            }

            // Security check
            const securityCheck = await this.securityManager.validatePlugin(pluginPath, manifest);
            if (!securityCheck.safe) {
                console.error(`[PluginManager] Security check failed for ${manifest.id}:`, securityCheck.issues);
                return;
            }

            // Register plugin
            this.registry.set(manifest.id, {
                ...manifest,
                path: pluginPath,
                status: 'discovered',
                lastScanned: Date.now(),
            });

            console.log(`[PluginManager] Discovered plugin: ${manifest.id} v${manifest.version}`);
        } catch (error) {
            console.error(`[PluginManager] Failed to scan plugin at ${pluginPath}:`, error);
        }
    }

    /**
     * Load a specific plugin
     */
    async loadPlugin(pluginId) {
        const metadata = this.registry.get(pluginId);
        if (!metadata) {
            throw new Error(`Plugin ${pluginId} not found in registry`);
        }

        if (this.plugins.has(pluginId)) {
            console.warn(`[PluginManager] Plugin ${pluginId} is already loaded`);
            return this.plugins.get(pluginId);
        }

        try {
            // Create plugin sandbox
            const sandbox = await this.securityManager.createSandbox(metadata);

            // Load plugin main file
            const mainPath = path.join(metadata.path, metadata.main || 'index.js');
            const PluginClass = require(mainPath);

            // Create plugin instance
            const pluginInstance = new PluginClass({
                id: pluginId,
                metadata,
                sandbox,
                api: this.createPluginAPI(pluginId),
            });

            // Initialize plugin
            await pluginInstance.initialize();

            // Register extension points
            if (metadata.extensionPoints) {
                for (const extensionPoint of metadata.extensionPoints) {
                    this.registerExtensionPoint(extensionPoint, pluginId);
                }
            }

            this.plugins.set(pluginId, pluginInstance);
            this.updatePluginStatus(pluginId, 'loaded');

            this.emit('pluginLoaded', { pluginId, plugin: pluginInstance });
            console.log(`[PluginManager] Loaded plugin: ${pluginId}`);

            return pluginInstance;
        } catch (error) {
            console.error(`[PluginManager] Failed to load plugin ${pluginId}:`, error);
            this.updatePluginStatus(pluginId, 'error', error.message);
            throw error;
        }
    }

    /**
     * Unload a plugin
     */
    async unloadPlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            console.warn(`[PluginManager] Plugin ${pluginId} is not loaded`);
            return;
        }

        try {
            // Cleanup plugin
            if (typeof plugin.cleanup === 'function') {
                await plugin.cleanup();
            }

            // Unregister extension points
            const metadata = this.registry.get(pluginId);
            if (metadata && metadata.extensionPoints) {
                for (const extensionPoint of metadata.extensionPoints) {
                    this.unregisterExtensionPoint(extensionPoint, pluginId);
                }
            }

            // Remove from memory
            this.plugins.delete(pluginId);
            this.updatePluginStatus(pluginId, 'unloaded');

            // Cleanup require cache
            const pluginPath = path.join(metadata.path, metadata.main || 'index.js');
            delete require.cache[require.resolve(pluginPath)];

            this.emit('pluginUnloaded', { pluginId });
            console.log(`[PluginManager] Unloaded plugin: ${pluginId}`);
        } catch (error) {
            console.error(`[PluginManager] Failed to unload plugin ${pluginId}:`, error);
            throw error;
        }
    }

    /**
     * Create Plugin API for a specific plugin
     */
    createPluginAPI(pluginId) {
        return new PluginAPI(pluginId, this);
    }

    /**
     * Validate plugin manifest
     */
    validatePluginManifest(manifest) {
        const required = ['id', 'name', 'version', 'description', 'author'];
        const errors = [];

        for (const field of required) {
            if (!manifest[field]) {
                errors.push(`Missing required field: ${field}`);
            }
        }

        // Validate version format
        if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
            errors.push('Invalid version format (expected semver)');
        }

        // Validate permissions
        if (manifest.permissions && !Array.isArray(manifest.permissions)) {
            errors.push('Permissions must be an array');
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Register extension point
     */
    registerExtensionPoint(extensionPoint, pluginId) {
        if (!this.extensionPoints.has(extensionPoint)) {
            this.extensionPoints.set(extensionPoint, new Set());
        }
        this.extensionPoints.get(extensionPoint).add(pluginId);
    }

    /**
     * Unregister extension point
     */
    unregisterExtensionPoint(extensionPoint, pluginId) {
        if (this.extensionPoints.has(extensionPoint)) {
            this.extensionPoints.get(extensionPoint).delete(pluginId);
        }
    }

    /**
     * Get plugins for extension point
     */
    getPluginsForExtensionPoint(extensionPoint) {
        const pluginIds = this.extensionPoints.get(extensionPoint) || new Set();
        return Array.from(pluginIds)
            .map(id => this.plugins.get(id))
            .filter(Boolean);
    }

    /**
     * Update plugin status
     */
    updatePluginStatus(pluginId, status, error = null) {
        const metadata = this.registry.get(pluginId);
        if (metadata) {
            metadata.status = status;
            metadata.lastUpdated = Date.now();
            if (error) metadata.error = error;
        }
    }

    /**
     * Ensure plugin directory exists
     */
    async ensurePluginDirectory() {
        try {
            await fs.access(this.pluginDirectory);
        } catch {
            await fs.mkdir(this.pluginDirectory, { recursive: true });
        }
    }

    /**
     * Load plugin registry from disk
     */
    async loadPluginRegistry() {
        const registryPath = path.join(this.pluginDirectory, 'registry.json');
        try {
            const registryData = await fs.readFile(registryPath, 'utf8');
            const registry = JSON.parse(registryData);

            for (const [pluginId, metadata] of Object.entries(registry)) {
                this.registry.set(pluginId, metadata);
            }
        } catch (error) {
            // Registry doesn't exist yet, will be created on save
            console.log('[PluginManager] No existing registry found, starting fresh');
        }
    }

    /**
     * Save plugin registry to disk
     */
    async savePluginRegistry() {
        const registryPath = path.join(this.pluginDirectory, 'registry.json');
        const registryData = Object.fromEntries(this.registry);
        await fs.writeFile(registryPath, JSON.stringify(registryData, null, 2));
    }

    /**
     * Load enabled plugins on startup
     */
    async loadEnabledPlugins() {
        for (const [pluginId, metadata] of this.registry) {
            if (metadata.enabled !== false) {
                // Default to enabled
                try {
                    await this.loadPlugin(pluginId);
                } catch (error) {
                    console.error(`[PluginManager] Failed to auto-load plugin ${pluginId}:`, error);
                }
            }
        }
    }

    /**
     * Get all plugins
     */
    getAllPlugins() {
        return Array.from(this.registry.values());
    }

    /**
     * Get loaded plugins
     */
    getLoadedPlugins() {
        return Array.from(this.plugins.values());
    }

    /**
     * Enable/disable plugin
     */
    async setPluginEnabled(pluginId, enabled) {
        const metadata = this.registry.get(pluginId);
        if (!metadata) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        metadata.enabled = enabled;
        await this.savePluginRegistry();

        if (enabled && !this.plugins.has(pluginId)) {
            await this.loadPlugin(pluginId);
        } else if (!enabled && this.plugins.has(pluginId)) {
            await this.unloadPlugin(pluginId);
        }
    }

    /**
     * Install plugin from package
     */
    async installPlugin(packagePath) {
        // Implementation for installing plugins from .zip or .tar.gz files
        // This would extract the package to the plugin directory
        throw new Error('Plugin installation not yet implemented');
    }

    /**
     * Uninstall plugin
     */
    async uninstallPlugin(pluginId) {
        const metadata = this.registry.get(pluginId);
        if (!metadata) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        // Unload if loaded
        if (this.plugins.has(pluginId)) {
            await this.unloadPlugin(pluginId);
        }

        // Remove from filesystem
        await fs.rmdir(metadata.path, { recursive: true });

        // Remove from registry
        this.registry.delete(pluginId);
        await this.savePluginRegistry();

        this.emit('pluginUninstalled', { pluginId });
        console.log(`[PluginManager] Uninstalled plugin: ${pluginId}`);
    }
}

module.exports = { PluginManager };
