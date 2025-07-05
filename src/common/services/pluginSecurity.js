const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const vm = require('vm');

/**
 * Plugin Security Manager
 * Handles plugin validation, sandboxing, and security enforcement
 */
class PluginSecurityManager {
    constructor() {
        this.trustedPublishers = new Set(['glass-assistant-official', 'pickle-team']);
        this.bannedPatterns = [
            /require\s*\(\s*['"]child_process['"]\s*\)/,
            /require\s*\(\s*['"]fs['"]\s*\)/,
            /require\s*\(\s*['"]net['"]\s*\)/,
            /require\s*\(\s*['"]http['"]\s*\)/,
            /require\s*\(\s*['"]https['"]\s*\)/,
            /eval\s*\(/,
            /Function\s*\(/,
            /process\.exit/,
            /process\.kill/,
        ];
    }

    /**
     * Validate plugin security before loading
     */
    async validatePlugin(pluginPath, manifest) {
        const issues = [];
        let safe = true;

        try {
            // 1. Validate manifest security
            const manifestIssues = this.validateManifest(manifest);
            issues.push(...manifestIssues);

            // 2. Check file integrity
            const integrityIssues = await this.checkFileIntegrity(pluginPath, manifest);
            issues.push(...integrityIssues);

            // 3. Scan code for dangerous patterns
            const codeIssues = await this.scanPluginCode(pluginPath);
            issues.push(...codeIssues);

            // 4. Validate permissions
            const permissionIssues = this.validatePermissions(manifest);
            issues.push(...permissionIssues);

            // 5. Check publisher trust
            const publisherIssues = this.validatePublisher(manifest);
            issues.push(...publisherIssues);

            safe = issues.length === 0;
        } catch (error) {
            issues.push(`Security validation failed: ${error.message}`);
            safe = false;
        }

        return { safe, issues };
    }

    /**
     * Validate plugin manifest for security issues
     */
    validateManifest(manifest) {
        const issues = [];

        // Check for suspicious permissions
        if (manifest.permissions) {
            const dangerousPermissions = ['*', 'system:*', 'fs:*'];
            for (const permission of manifest.permissions) {
                if (dangerousPermissions.includes(permission)) {
                    issues.push(`Dangerous permission requested: ${permission}`);
                }
            }

            // Check for excessive permissions
            if (manifest.permissions.length > 10) {
                issues.push('Plugin requests excessive permissions');
            }
        }

        // Validate URLs
        if (manifest.homepage && !this.isValidUrl(manifest.homepage)) {
            issues.push('Invalid homepage URL');
        }

        if (manifest.repository && !this.isValidUrl(manifest.repository)) {
            issues.push('Invalid repository URL');
        }

        // Check for suspicious scripts
        if (manifest.scripts) {
            for (const [scriptName, scriptPath] of Object.entries(manifest.scripts)) {
                if (scriptPath.includes('..') || path.isAbsolute(scriptPath)) {
                    issues.push(`Suspicious script path: ${scriptName}`);
                }
            }
        }

        return issues;
    }

    /**
     * Check file integrity and signatures
     */
    async checkFileIntegrity(pluginPath, manifest) {
        const issues = [];

        try {
            // Check if main file exists
            const mainFile = path.join(pluginPath, manifest.main || 'index.js');
            const mainExists = await fs
                .access(mainFile)
                .then(() => true)
                .catch(() => false);

            if (!mainExists) {
                issues.push('Main plugin file not found');
                return issues;
            }

            // Validate file checksums if provided
            if (manifest.checksums) {
                for (const [filePath, expectedHash] of Object.entries(manifest.checksums)) {
                    const fullPath = path.join(pluginPath, filePath);
                    try {
                        const fileContent = await fs.readFile(fullPath);
                        const actualHash = crypto.createHash('sha256').update(fileContent).digest('hex');

                        if (actualHash !== expectedHash) {
                            issues.push(`File integrity check failed: ${filePath}`);
                        }
                    } catch (error) {
                        issues.push(`Cannot verify file: ${filePath}`);
                    }
                }
            }

            // Check for suspicious files
            const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1'];
            const files = await this.getAllFiles(pluginPath);

            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                if (suspiciousExtensions.includes(ext)) {
                    issues.push(`Suspicious file found: ${file}`);
                }
            }
        } catch (error) {
            issues.push(`File integrity check failed: ${error.message}`);
        }

        return issues;
    }

    /**
     * Scan plugin code for dangerous patterns
     */
    async scanPluginCode(pluginPath) {
        const issues = [];

        try {
            const jsFiles = await this.getJavaScriptFiles(pluginPath);

            for (const filePath of jsFiles) {
                const content = await fs.readFile(filePath, 'utf8');

                // Check for banned patterns
                for (const pattern of this.bannedPatterns) {
                    if (pattern.test(content)) {
                        issues.push(`Dangerous code pattern found in ${path.relative(pluginPath, filePath)}`);
                    }
                }

                // Check for obfuscated code
                if (this.isObfuscated(content)) {
                    issues.push(`Potentially obfuscated code in ${path.relative(pluginPath, filePath)}`);
                }

                // Check for network requests to suspicious domains
                const suspiciousDomains = this.findSuspiciousDomains(content);
                if (suspiciousDomains.length > 0) {
                    issues.push(`Suspicious network requests to: ${suspiciousDomains.join(', ')}`);
                }
            }
        } catch (error) {
            issues.push(`Code scanning failed: ${error.message}`);
        }

        return issues;
    }

    /**
     * Validate plugin permissions
     */
    validatePermissions(manifest) {
        const issues = [];

        if (!manifest.permissions || !Array.isArray(manifest.permissions)) {
            return issues; // No permissions is fine
        }

        const validPermissions = [
            'ai:access',
            'ai:middleware',
            'ai:context',
            'ai:models',
            'ipc:register',
            'ipc:send',
            'ipc:invoke',
            'features:extend',
            'ui:modify',
            'ui:extension',
            'storage:access',
            'storage:read',
            'storage:write',
            'network:http',
            'system:hardware',
            'config:read',
            'config:write',
            'notifications:show',
            'plugins:communicate',
            'plugins:receive',
        ];

        for (const permission of manifest.permissions) {
            if (permission === '*') {
                issues.push('Wildcard permission (*) is not allowed');
                continue;
            }

            if (!validPermissions.includes(permission)) {
                issues.push(`Unknown permission: ${permission}`);
            }
        }

        return issues;
    }

    /**
     * Validate plugin publisher
     */
    validatePublisher(manifest) {
        const issues = [];

        if (!manifest.author) {
            issues.push('Plugin author not specified');
            return issues;
        }

        const author = typeof manifest.author === 'string' ? manifest.author : manifest.author.name;

        // Check if publisher is trusted
        if (!this.trustedPublishers.has(author)) {
            // For untrusted publishers, apply stricter validation
            if (manifest.permissions && manifest.permissions.length > 5) {
                issues.push('Untrusted publisher requesting many permissions');
            }
        }

        return issues;
    }

    /**
     * Create secure sandbox for plugin execution
     */
    async createSandbox(metadata) {
        const sandbox = {
            // Allowed globals
            console: {
                log: (...args) => console.log(`[Plugin:${metadata.id}]`, ...args),
                warn: (...args) => console.warn(`[Plugin:${metadata.id}]`, ...args),
                error: (...args) => console.error(`[Plugin:${metadata.id}]`, ...args),
            },

            // Restricted require function
            require: this.createSecureRequire(metadata),

            // Plugin metadata
            __plugin: {
                id: metadata.id,
                version: metadata.version,
                permissions: metadata.permissions || [],
            },

            // Safe globals
            Buffer,
            setTimeout,
            setInterval,
            clearTimeout,
            clearInterval,

            // Restricted process object
            process: {
                env: {
                    NODE_ENV: process.env.NODE_ENV,
                },
                version: process.version,
                platform: process.platform,
            },
        };

        // Create VM context
        const context = vm.createContext(sandbox);

        return {
            context,
            runCode: (code, filename) => {
                try {
                    return vm.runInContext(code, context, {
                        filename,
                        timeout: 5000, // 5 second timeout
                        displayErrors: true,
                    });
                } catch (error) {
                    throw new Error(`Plugin execution error: ${error.message}`);
                }
            },
        };
    }

    /**
     * Create secure require function for plugins
     */
    createSecureRequire(metadata) {
        const allowedModules = new Set(['events', 'util', 'crypto', 'querystring', 'url']);

        // Add modules based on permissions
        if (metadata.permissions?.includes('storage:access')) {
            allowedModules.add('path');
        }

        return moduleName => {
            // Allow relative requires within plugin directory
            if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
                return require(path.resolve(metadata.path, moduleName));
            }

            // Check if module is allowed
            if (!allowedModules.has(moduleName)) {
                throw new Error(`Module '${moduleName}' is not allowed for plugin ${metadata.id}`);
            }

            return require(moduleName);
        };
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Check if URL is valid and safe
     */
    isValidUrl(urlString) {
        try {
            const url = new URL(urlString);
            return ['http:', 'https:'].includes(url.protocol);
        } catch {
            return false;
        }
    }

    /**
     * Get all files in directory recursively
     */
    async getAllFiles(dirPath) {
        const files = [];

        async function scan(currentPath) {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                if (entry.isDirectory()) {
                    await scan(fullPath);
                } else {
                    files.push(fullPath);
                }
            }
        }

        await scan(dirPath);
        return files;
    }

    /**
     * Get all JavaScript files in directory
     */
    async getJavaScriptFiles(dirPath) {
        const allFiles = await this.getAllFiles(dirPath);
        return allFiles.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.js', '.mjs', '.ts'].includes(ext);
        });
    }

    /**
     * Check if code appears to be obfuscated
     */
    isObfuscated(code) {
        // Simple heuristics for obfuscated code
        const indicators = [
            // Very long variable names with random characters
            /[a-zA-Z_$][a-zA-Z0-9_$]{50,}/,
            // Excessive use of escape sequences
            /\\x[0-9a-fA-F]{2}/g,
            // Hex encoded strings
            /\\u[0-9a-fA-F]{4}/g,
            // Base64 patterns
            /[A-Za-z0-9+/]{50,}={0,2}/,
        ];

        let suspiciousCount = 0;
        for (const pattern of indicators) {
            const matches = code.match(pattern);
            if (matches && matches.length > 5) {
                suspiciousCount++;
            }
        }

        // Also check for very low readability
        const lines = code.split('\n');
        const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;

        return suspiciousCount >= 2 || avgLineLength > 200;
    }

    /**
     * Find suspicious domains in code
     */
    findSuspiciousDomains(code) {
        const suspiciousDomains = [];

        // Known malicious TLDs and patterns
        const suspiciousPatterns = [
            /https?:\/\/[^\/\s]+\.tk[\/\s"']/g,
            /https?:\/\/[^\/\s]+\.ml[\/\s"']/g,
            /https?:\/\/[^\/\s]+\.ga[\/\s"']/g,
            /https?:\/\/[^\/\s]+\.cf[\/\s"']/g,
            /https?:\/\/\d+\.\d+\.\d+\.\d+/g, // IP addresses
            /https?:\/\/[^\/\s]*bit\.ly[\/\s"']/g,
            /https?:\/\/[^\/\s]*tinyurl[\/\s"']/g,
        ];

        for (const pattern of suspiciousPatterns) {
            const matches = code.match(pattern);
            if (matches) {
                suspiciousDomains.push(...matches.map(match => match.trim()));
            }
        }

        return [...new Set(suspiciousDomains)]; // Remove duplicates
    }

    /**
     * Generate plugin signature for integrity checking
     */
    async generatePluginSignature(pluginPath) {
        const files = await this.getJavaScriptFiles(pluginPath);
        const hash = crypto.createHash('sha256');

        // Sort files for consistent hashing
        files.sort();

        for (const file of files) {
            const content = await fs.readFile(file);
            hash.update(content);
        }

        return hash.digest('hex');
    }

    /**
     * Verify plugin signature
     */
    async verifyPluginSignature(pluginPath, expectedSignature) {
        const actualSignature = await this.generatePluginSignature(pluginPath);
        return actualSignature === expectedSignature;
    }

    /**
     * Create resource limits for plugin
     */
    createResourceLimits(metadata) {
        const limits = {
            maxMemory: 100 * 1024 * 1024, // 100MB
            maxCpuTime: 5000, // 5 seconds
            maxFileSize: 10 * 1024 * 1024, // 10MB
            maxNetworkRequests: 100,
            maxStorageSize: 50 * 1024 * 1024, // 50MB
        };

        // Adjust limits based on permissions
        if (metadata.permissions?.includes('ai:access')) {
            limits.maxMemory *= 2; // AI operations need more memory
            limits.maxCpuTime *= 2;
        }

        if (metadata.permissions?.includes('storage:access')) {
            limits.maxStorageSize *= 2;
        }

        return limits;
    }

    /**
     * Monitor plugin resource usage
     */
    createResourceMonitor(pluginId, limits) {
        const usage = {
            memory: 0,
            cpuTime: 0,
            networkRequests: 0,
            storageSize: 0,
        };

        return {
            checkMemory: currentMemory => {
                usage.memory = currentMemory;
                if (currentMemory > limits.maxMemory) {
                    throw new Error(`Plugin ${pluginId} exceeded memory limit`);
                }
            },

            checkCpuTime: currentCpuTime => {
                usage.cpuTime = currentCpuTime;
                if (currentCpuTime > limits.maxCpuTime) {
                    throw new Error(`Plugin ${pluginId} exceeded CPU time limit`);
                }
            },

            incrementNetworkRequests: () => {
                usage.networkRequests++;
                if (usage.networkRequests > limits.maxNetworkRequests) {
                    throw new Error(`Plugin ${pluginId} exceeded network request limit`);
                }
            },

            checkStorageSize: currentStorageSize => {
                usage.storageSize = currentStorageSize;
                if (currentStorageSize > limits.maxStorageSize) {
                    throw new Error(`Plugin ${pluginId} exceeded storage size limit`);
                }
            },

            getUsage: () => ({ ...usage }),
            getLimits: () => ({ ...limits }),
        };
    }
}

module.exports = { PluginSecurityManager };
