const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');
const AdmZip = require('adm-zip');
const semver = require('semver');

/**
 * Plugin Lifecycle Manager
 * Handles plugin installation, updates, and lifecycle management
 */
class PluginLifecycleManager {
    constructor(pluginManager) {
        this.pluginManager = pluginManager;
        this.pluginDirectory = pluginManager.pluginDirectory;
        this.tempDirectory = path.join(app.getPath('temp'), 'glass-plugins');
        this.marketplaceUrl = 'https://plugins.glass-assistant.com/api';
    }

    // ==================== PLUGIN INSTALLATION ====================

    /**
     * Install plugin from package file
     */
    async installFromPackage(packagePath, options = {}) {
        const installId = `install-${Date.now()}`;
        console.log(`[PluginLifecycle] Starting installation: ${installId}`);

        try {
            // 1. Extract package to temp directory
            const tempPath = await this.extractPackage(packagePath, installId);

            // 2. Validate plugin structure
            const manifest = await this.validatePluginStructure(tempPath);

            // 3. Check for conflicts
            await this.checkInstallationConflicts(manifest);

            // 4. Security validation
            const securityCheck = await this.pluginManager.securityManager.validatePlugin(tempPath, manifest);
            if (!securityCheck.safe) {
                throw new Error(`Security validation failed: ${securityCheck.issues.join(', ')}`);
            }

            // 5. Install dependencies if needed
            if (manifest.dependencies) {
                await this.installDependencies(tempPath, manifest.dependencies);
            }

            // 6. Move to plugin directory
            const finalPath = path.join(this.pluginDirectory, manifest.id);
            await this.movePlugin(tempPath, finalPath);

            // 7. Register plugin
            this.pluginManager.registry.set(manifest.id, {
                ...manifest,
                path: finalPath,
                status: 'installed',
                installedAt: Date.now(),
                version: manifest.version,
            });

            await this.pluginManager.savePluginRegistry();

            // 8. Auto-load if enabled
            if (options.autoLoad !== false) {
                await this.pluginManager.loadPlugin(manifest.id);
            }

            console.log(`[PluginLifecycle] Successfully installed plugin: ${manifest.id} v${manifest.version}`);

            return {
                success: true,
                pluginId: manifest.id,
                version: manifest.version,
                path: finalPath,
            };
        } catch (error) {
            console.error(`[PluginLifecycle] Installation failed:`, error);

            // Cleanup on failure
            try {
                await this.cleanupFailedInstallation(installId);
            } catch (cleanupError) {
                console.error(`[PluginLifecycle] Cleanup failed:`, cleanupError);
            }

            throw error;
        }
    }

    /**
     * Install plugin from marketplace
     */
    async installFromMarketplace(pluginId, version = 'latest') {
        console.log(`[PluginLifecycle] Installing from marketplace: ${pluginId}@${version}`);

        try {
            // 1. Fetch plugin metadata from marketplace
            const pluginInfo = await this.fetchPluginInfo(pluginId, version);

            // 2. Download plugin package
            const packagePath = await this.downloadPlugin(pluginInfo.downloadUrl);

            // 3. Install from downloaded package
            return await this.installFromPackage(packagePath, { autoLoad: true });
        } catch (error) {
            console.error(`[PluginLifecycle] Marketplace installation failed:`, error);
            throw error;
        }
    }

    /**
     * Update plugin to newer version
     */
    async updatePlugin(pluginId, targetVersion = 'latest') {
        console.log(`[PluginLifecycle] Updating plugin: ${pluginId} to ${targetVersion}`);

        const currentPlugin = this.pluginManager.registry.get(pluginId);
        if (!currentPlugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        try {
            // 1. Check for available updates
            const updateInfo = await this.checkForUpdates(pluginId, targetVersion);
            if (!updateInfo.hasUpdate) {
                return { success: true, message: 'Plugin is already up to date' };
            }

            // 2. Backup current plugin
            const backupPath = await this.backupPlugin(pluginId);

            // 3. Unload current plugin
            if (this.pluginManager.plugins.has(pluginId)) {
                await this.pluginManager.unloadPlugin(pluginId);
            }

            // 4. Install new version
            const installResult = await this.installFromMarketplace(pluginId, targetVersion);

            // 5. Migrate data if needed
            await this.migratePluginData(pluginId, currentPlugin.version, targetVersion);

            // 6. Clean up backup if successful
            await this.cleanupBackup(backupPath);

            console.log(`[PluginLifecycle] Successfully updated plugin: ${pluginId} to ${targetVersion}`);

            return {
                success: true,
                pluginId,
                oldVersion: currentPlugin.version,
                newVersion: targetVersion,
            };
        } catch (error) {
            console.error(`[PluginLifecycle] Update failed:`, error);

            // Restore from backup on failure
            try {
                await this.restoreFromBackup(pluginId, backupPath);
            } catch (restoreError) {
                console.error(`[PluginLifecycle] Backup restoration failed:`, restoreError);
            }

            throw error;
        }
    }

    /**
     * Uninstall plugin
     */
    async uninstallPlugin(pluginId, options = {}) {
        console.log(`[PluginLifecycle] Uninstalling plugin: ${pluginId}`);

        const plugin = this.pluginManager.registry.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        try {
            // 1. Unload plugin if loaded
            if (this.pluginManager.plugins.has(pluginId)) {
                await this.pluginManager.unloadPlugin(pluginId);
            }

            // 2. Backup plugin data if requested
            if (options.backupData) {
                await this.backupPluginData(pluginId);
            }

            // 3. Clean up plugin data
            if (!options.keepData) {
                await this.cleanupPluginData(pluginId);
            }

            // 4. Remove plugin files
            await fs.rmdir(plugin.path, { recursive: true });

            // 5. Remove from registry
            this.pluginManager.registry.delete(pluginId);
            await this.pluginManager.savePluginRegistry();

            console.log(`[PluginLifecycle] Successfully uninstalled plugin: ${pluginId}`);

            return { success: true, pluginId };
        } catch (error) {
            console.error(`[PluginLifecycle] Uninstallation failed:`, error);
            throw error;
        }
    }

    // ==================== PLUGIN DISCOVERY ====================

    /**
     * Search marketplace for plugins
     */
    async searchMarketplace(query, options = {}) {
        const searchParams = new URLSearchParams({
            q: query,
            category: options.category || '',
            sort: options.sort || 'relevance',
            limit: options.limit || 20,
            offset: options.offset || 0,
        });

        const response = await fetch(`${this.marketplaceUrl}/search?${searchParams}`);
        if (!response.ok) {
            throw new Error(`Marketplace search failed: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Get featured plugins
     */
    async getFeaturedPlugins() {
        const response = await fetch(`${this.marketplaceUrl}/featured`);
        if (!response.ok) {
            throw new Error(`Failed to fetch featured plugins: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Check for plugin updates
     */
    async checkForUpdates(pluginId, targetVersion = 'latest') {
        const currentPlugin = this.pluginManager.registry.get(pluginId);
        if (!currentPlugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        const pluginInfo = await this.fetchPluginInfo(pluginId, targetVersion);
        const hasUpdate = semver.gt(pluginInfo.version, currentPlugin.version);

        return {
            hasUpdate,
            currentVersion: currentPlugin.version,
            latestVersion: pluginInfo.version,
            changelog: pluginInfo.changelog,
        };
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Extract plugin package
     */
    async extractPackage(packagePath, installId) {
        const tempPath = path.join(this.tempDirectory, installId);
        await fs.mkdir(tempPath, { recursive: true });

        const zip = new AdmZip(packagePath);
        zip.extractAllTo(tempPath, true);

        return tempPath;
    }

    /**
     * Validate plugin structure
     */
    async validatePluginStructure(pluginPath) {
        const manifestPath = path.join(pluginPath, 'plugin.json');

        try {
            const manifestContent = await fs.readFile(manifestPath, 'utf8');
            const manifest = JSON.parse(manifestContent);

            // Validate required fields
            const validationResult = this.pluginManager.validatePluginManifest(manifest);
            if (!validationResult.valid) {
                throw new Error(`Invalid manifest: ${validationResult.errors.join(', ')}`);
            }

            // Check if main file exists
            const mainFile = path.join(pluginPath, manifest.main || 'index.js');
            await fs.access(mainFile);

            return manifest;
        } catch (error) {
            throw new Error(`Plugin structure validation failed: ${error.message}`);
        }
    }

    /**
     * Check for installation conflicts
     */
    async checkInstallationConflicts(manifest) {
        const existingPlugin = this.pluginManager.registry.get(manifest.id);

        if (existingPlugin) {
            throw new Error(`Plugin ${manifest.id} is already installed (version ${existingPlugin.version})`);
        }

        // Check for conflicting extension points
        if (manifest.extensionPoints) {
            for (const extensionPoint of manifest.extensionPoints) {
                const conflictingPlugins = this.pluginManager.getPluginsForExtensionPoint(extensionPoint);
                if (conflictingPlugins.length > 0) {
                    console.warn(`[PluginLifecycle] Extension point conflict detected: ${extensionPoint}`);
                }
            }
        }
    }

    /**
     * Install plugin dependencies
     */
    async installDependencies(pluginPath, dependencies) {
        // For now, we'll just validate that dependencies are available
        // In a full implementation, this would install npm packages
        console.log(`[PluginLifecycle] Checking dependencies:`, dependencies);

        for (const [depName, depVersion] of Object.entries(dependencies)) {
            try {
                require.resolve(depName);
                console.log(`[PluginLifecycle] Dependency available: ${depName}`);
            } catch (error) {
                console.warn(`[PluginLifecycle] Dependency not available: ${depName}@${depVersion}`);
            }
        }
    }

    /**
     * Move plugin to final location
     */
    async movePlugin(sourcePath, targetPath) {
        // Remove target if it exists
        try {
            await fs.rmdir(targetPath, { recursive: true });
        } catch (error) {
            // Target doesn't exist, which is fine
        }

        // Create parent directory
        await fs.mkdir(path.dirname(targetPath), { recursive: true });

        // Move plugin
        await fs.rename(sourcePath, targetPath);
    }

    /**
     * Fetch plugin info from marketplace
     */
    async fetchPluginInfo(pluginId, version = 'latest') {
        const url = `${this.marketplaceUrl}/plugins/${pluginId}/${version}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch plugin info: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Download plugin package
     */
    async downloadPlugin(downloadUrl) {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`Failed to download plugin: ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const tempPath = path.join(this.tempDirectory, `download-${Date.now()}.zip`);

        await fs.mkdir(path.dirname(tempPath), { recursive: true });
        await fs.writeFile(tempPath, Buffer.from(buffer));

        return tempPath;
    }

    /**
     * Backup plugin before update
     */
    async backupPlugin(pluginId) {
        const plugin = this.pluginManager.registry.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        const backupPath = path.join(this.tempDirectory, `backup-${pluginId}-${Date.now()}`);
        await fs.mkdir(backupPath, { recursive: true });

        // Copy plugin files
        await this.copyDirectory(plugin.path, backupPath);

        return backupPath;
    }

    /**
     * Restore plugin from backup
     */
    async restoreFromBackup(pluginId, backupPath) {
        const plugin = this.pluginManager.registry.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        // Remove current version
        await fs.rmdir(plugin.path, { recursive: true });

        // Restore from backup
        await this.copyDirectory(backupPath, plugin.path);

        // Reload plugin
        await this.pluginManager.loadPlugin(pluginId);
    }

    /**
     * Copy directory recursively
     */
    async copyDirectory(source, target) {
        await fs.mkdir(target, { recursive: true });

        const entries = await fs.readdir(source, { withFileTypes: true });

        for (const entry of entries) {
            const sourcePath = path.join(source, entry.name);
            const targetPath = path.join(target, entry.name);

            if (entry.isDirectory()) {
                await this.copyDirectory(sourcePath, targetPath);
            } else {
                await fs.copyFile(sourcePath, targetPath);
            }
        }
    }

    /**
     * Migrate plugin data between versions
     */
    async migratePluginData(pluginId, oldVersion, newVersion) {
        console.log(`[PluginLifecycle] Migrating data for ${pluginId}: ${oldVersion} -> ${newVersion}`);

        // Plugin-specific migration logic would go here
        // For now, we'll just log the migration

        const plugin = this.pluginManager.plugins.get(pluginId);
        if (plugin && typeof plugin.migrateData === 'function') {
            await plugin.migrateData(oldVersion, newVersion);
        }
    }

    /**
     * Backup plugin data
     */
    async backupPluginData(pluginId) {
        const dataService = require('./dataService');
        const backupPath = path.join(this.tempDirectory, `data-backup-${pluginId}-${Date.now()}.json`);

        // Get all plugin data
        const allKeys = await dataService.getAllKeys();
        const pluginKeys = allKeys.filter(key => key.startsWith(`plugin:${pluginId}:`));

        const pluginData = {};
        for (const key of pluginKeys) {
            pluginData[key] = await dataService.getData(key);
        }

        await fs.writeFile(backupPath, JSON.stringify(pluginData, null, 2));
        console.log(`[PluginLifecycle] Plugin data backed up to: ${backupPath}`);

        return backupPath;
    }

    /**
     * Clean up plugin data
     */
    async cleanupPluginData(pluginId) {
        const dataService = require('./dataService');
        const allKeys = await dataService.getAllKeys();
        const pluginKeys = allKeys.filter(key => key.startsWith(`plugin:${pluginId}:`));

        for (const key of pluginKeys) {
            await dataService.deleteData(key);
        }

        console.log(`[PluginLifecycle] Cleaned up data for plugin: ${pluginId}`);
    }

    /**
     * Clean up failed installation
     */
    async cleanupFailedInstallation(installId) {
        const tempPath = path.join(this.tempDirectory, installId);

        try {
            await fs.rmdir(tempPath, { recursive: true });
        } catch (error) {
            console.warn(`[PluginLifecycle] Failed to cleanup temp directory: ${tempPath}`);
        }
    }

    /**
     * Clean up backup
     */
    async cleanupBackup(backupPath) {
        try {
            await fs.rmdir(backupPath, { recursive: true });
        } catch (error) {
            console.warn(`[PluginLifecycle] Failed to cleanup backup: ${backupPath}`);
        }
    }
}

module.exports = { PluginLifecycleManager };
