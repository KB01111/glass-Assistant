/**
 * Compatibility Layer
 * Ensures backward compatibility with existing plugins while providing
 * enhanced capabilities for optimized plugins
 */

const EventEmitter = require('events');

class CompatibilityLayer extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            enableLegacySupport: true,
            enableAPIVersioning: true,
            enableFeatureDetection: true,
            enableGradualMigration: true,
            defaultAPIVersion: '1.0',
            supportedVersions: ['1.0', '1.1', '2.0'],
            enableDeprecationWarnings: true,
            migrationGracePeriod: 90, // days
            ...options
        };
        
        this.pluginRegistry = new Map(); // pluginId -> PluginInfo
        this.apiAdapters = new Map(); // version -> adapter
        this.featureFlags = new Map(); // feature -> enabled
        this.migrationStatus = new Map(); // pluginId -> migration status
        this.deprecationWarnings = new Map(); // api -> warning info
        
        this.stats = {
            legacyPlugins: 0,
            optimizedPlugins: 0,
            migratedPlugins: 0,
            deprecationWarnings: 0,
            compatibilityIssues: 0
        };
        
        this.isInitialized = false;
        this.initializeLayer();
    }
    
    async initializeLayer() {
        try {
            console.log('[Compatibility Layer] Initializing compatibility layer...');
            
            // Initialize API adapters
            this.initializeAPIAdapters();
            
            // Initialize feature flags
            this.initializeFeatureFlags();
            
            // Setup deprecation tracking
            this.setupDeprecationTracking();
            
            this.isInitialized = true;
            this.emit('initialized');
            
        } catch (error) {
            console.error('[Compatibility Layer] Initialization failed:', error);
            this.emit('initialization-failed', error);
        }
    }
    
    /**
     * Initialize API adapters for different versions
     */
    initializeAPIAdapters() {
        // API v1.0 adapter (legacy)
        this.apiAdapters.set('1.0', {
            adaptRequest: this.adaptV1Request.bind(this),
            adaptResponse: this.adaptV1Response.bind(this),
            supportedFeatures: ['basic-inference', 'simple-cache'],
            deprecated: false
        });
        
        // API v1.1 adapter (transitional)
        this.apiAdapters.set('1.1', {
            adaptRequest: this.adaptV11Request.bind(this),
            adaptResponse: this.adaptV11Response.bind(this),
            supportedFeatures: ['basic-inference', 'simple-cache', 'batch-processing'],
            deprecated: false
        });
        
        // API v2.0 adapter (optimized)
        this.apiAdapters.set('2.0', {
            adaptRequest: this.adaptV2Request.bind(this),
            adaptResponse: this.adaptV2Response.bind(this),
            supportedFeatures: [
                'hardware-acceleration', 'hierarchical-cache', 'batch-processing',
                'async-processing', 'vector-search', 'graceful-degradation'
            ],
            deprecated: false
        });
    }
    
    /**
     * Initialize feature flags
     */
    initializeFeatureFlags() {
        this.featureFlags.set('hardware-acceleration', true);
        this.featureFlags.set('hierarchical-cache', true);
        this.featureFlags.set('batch-processing', true);
        this.featureFlags.set('async-processing', true);
        this.featureFlags.set('vector-search', true);
        this.featureFlags.set('graceful-degradation', true);
        this.featureFlags.set('legacy-support', true);
    }
    
    /**
     * Setup deprecation tracking
     */
    setupDeprecationTracking() {
        // Track deprecated APIs
        this.deprecationWarnings.set('syncInference', {
            message: 'Synchronous inference is deprecated. Use async inference instead.',
            replacement: 'runInferenceAsync',
            deprecatedSince: '2.0',
            removalVersion: '3.0'
        });
        
        this.deprecationWarnings.set('simpleCache', {
            message: 'Simple cache is deprecated. Use hierarchical cache instead.',
            replacement: 'HierarchicalEmbeddingCache',
            deprecatedSince: '2.0',
            removalVersion: '3.0'
        });
    }
    
    /**
     * Register plugin with compatibility layer
     */
    registerPlugin(pluginInfo) {
        const {
            id,
            version,
            apiVersion = this.options.defaultAPIVersion,
            capabilities = [],
            isOptimized = false
        } = pluginInfo;
        
        // Detect plugin type
        const pluginType = this.detectPluginType(pluginInfo);
        
        // Check API version compatibility
        const isCompatible = this.checkAPICompatibility(apiVersion);
        
        if (!isCompatible) {
            throw new Error(`Unsupported API version: ${apiVersion}`);
        }
        
        const registrationInfo = {
            ...pluginInfo,
            pluginType,
            registeredAt: Date.now(),
            migrationStatus: isOptimized ? 'optimized' : 'legacy',
            compatibilityIssues: []
        };
        
        this.pluginRegistry.set(id, registrationInfo);
        
        // Update statistics
        if (isOptimized) {
            this.stats.optimizedPlugins++;
        } else {
            this.stats.legacyPlugins++;
        }
        
        // Check for migration opportunities
        if (!isOptimized) {
            this.assessMigrationOpportunity(id, pluginInfo);
        }
        
        this.emit('plugin-registered', { id, pluginType, isOptimized });
        
        console.log(`[Compatibility Layer] Registered ${pluginType} plugin: ${id} (API v${apiVersion})`);
        
        return registrationInfo;
    }
    
    /**
     * Detect plugin type based on capabilities
     */
    detectPluginType(pluginInfo) {
        const { capabilities = [], name = '' } = pluginInfo;
        
        if (capabilities.includes('hardware-acceleration') || 
            capabilities.includes('amd-gaia-npu')) {
            return 'hardware-accelerated';
        }
        
        if (capabilities.includes('llmware-integration')) {
            return 'llmware-enhanced';
        }
        
        if (capabilities.includes('document-processing')) {
            return 'document-processor';
        }
        
        if (name.toLowerCase().includes('ai') || 
            capabilities.includes('model-inference')) {
            return 'ai-model';
        }
        
        return 'generic';
    }
    
    /**
     * Check API version compatibility
     */
    checkAPICompatibility(apiVersion) {
        return this.options.supportedVersions.includes(apiVersion);
    }
    
    /**
     * Adapt API call based on plugin version
     */
    async adaptAPICall(pluginId, method, args, apiVersion) {
        try {
            const adapter = this.apiAdapters.get(apiVersion);
            if (!adapter) {
                throw new Error(`No adapter for API version: ${apiVersion}`);
            }
            
            // Check for deprecated APIs
            this.checkDeprecation(method, apiVersion);
            
            // Adapt request
            const adaptedArgs = await adapter.adaptRequest(method, args);
            
            // Execute with enhanced capabilities if available
            const result = await this.executeWithEnhancements(
                pluginId, method, adaptedArgs, apiVersion
            );
            
            // Adapt response
            const adaptedResult = await adapter.adaptResponse(method, result);
            
            return adaptedResult;
            
        } catch (error) {
            console.error(`[Compatibility Layer] API adaptation failed:`, error);
            this.stats.compatibilityIssues++;
            throw error;
        }
    }
    
    /**
     * Execute method with enhancements if available
     */
    async executeWithEnhancements(pluginId, method, args, apiVersion) {
        const pluginInfo = this.pluginRegistry.get(pluginId);
        
        // For optimized plugins, use enhanced features
        if (pluginInfo?.migrationStatus === 'optimized') {
            return await this.executeOptimized(method, args);
        }
        
        // For legacy plugins, use compatibility mode
        return await this.executeLegacy(method, args, apiVersion);
    }
    
    /**
     * Execute with optimized features
     */
    async executeOptimized(method, args) {
        switch (method) {
            case 'runInference':
                return await this.runOptimizedInference(args);
            case 'processDocument':
                return await this.processDocumentOptimized(args);
            case 'cacheEmbedding':
                return await this.cacheEmbeddingOptimized(args);
            default:
                return await this.executeGeneric(method, args);
        }
    }
    
    /**
     * Execute in legacy compatibility mode
     */
    async executeLegacy(method, args, apiVersion) {
        switch (method) {
            case 'runInference':
                return await this.runLegacyInference(args, apiVersion);
            case 'processDocument':
                return await this.processDocumentLegacy(args, apiVersion);
            case 'cacheEmbedding':
                return await this.cacheEmbeddingLegacy(args, apiVersion);
            default:
                return await this.executeGeneric(method, args);
        }
    }
    
    /**
     * Check for deprecated API usage
     */
    checkDeprecation(method, apiVersion) {
        const deprecation = this.deprecationWarnings.get(method);
        
        if (deprecation && this.options.enableDeprecationWarnings) {
            console.warn(`[Compatibility Layer] DEPRECATION WARNING: ${deprecation.message}`);
            console.warn(`[Compatibility Layer] Use ${deprecation.replacement} instead.`);
            console.warn(`[Compatibility Layer] Will be removed in version ${deprecation.removalVersion}`);
            
            this.stats.deprecationWarnings++;
            
            this.emit('deprecation-warning', {
                method,
                apiVersion,
                deprecation
            });
        }
    }
    
    /**
     * Assess migration opportunity for legacy plugin
     */
    assessMigrationOpportunity(pluginId, pluginInfo) {
        const opportunities = [];
        
        // Check for hardware acceleration opportunity
        if (pluginInfo.capabilities?.includes('model-inference')) {
            opportunities.push({
                type: 'hardware-acceleration',
                benefit: 'Up to 10x faster inference with AMD Gaia NPU',
                effort: 'medium'
            });
        }
        
        // Check for caching optimization
        if (pluginInfo.capabilities?.includes('embedding-generation')) {
            opportunities.push({
                type: 'hierarchical-cache',
                benefit: 'Improved cache hit rates and reduced latency',
                effort: 'low'
            });
        }
        
        // Check for batch processing
        if (pluginInfo.capabilities?.includes('document-processing')) {
            opportunities.push({
                type: 'batch-processing',
                benefit: 'Better throughput for large document sets',
                effort: 'medium'
            });
        }
        
        if (opportunities.length > 0) {
            this.migrationStatus.set(pluginId, {
                status: 'assessment-complete',
                opportunities,
                assessedAt: Date.now()
            });
            
            this.emit('migration-opportunity', { pluginId, opportunities });
        }
    }
    
    // API Adapters
    async adaptV1Request(method, args) {
        // Convert v1.0 format to internal format
        switch (method) {
            case 'runInference':
                return {
                    modelPath: args.model,
                    inputs: args.input,
                    options: { precision: 'fp32' }
                };
            default:
                return args;
        }
    }
    
    async adaptV1Response(method, result) {
        // Convert internal format to v1.0 format
        switch (method) {
            case 'runInference':
                return {
                    output: result.outputs,
                    time: result.inferenceTime
                };
            default:
                return result;
        }
    }
    
    async adaptV11Request(method, args) {
        // Convert v1.1 format to internal format
        switch (method) {
            case 'runInference':
                return {
                    modelPath: args.modelPath,
                    inputs: args.inputs,
                    options: {
                        precision: args.precision || 'fp32',
                        batchSize: args.batchSize || 1
                    }
                };
            default:
                return args;
        }
    }
    
    async adaptV11Response(method, result) {
        // Convert internal format to v1.1 format
        return result; // v1.1 is mostly compatible
    }
    
    async adaptV2Request(method, args) {
        // v2.0 is the native format
        return args;
    }
    
    async adaptV2Response(method, result) {
        // v2.0 is the native format
        return result;
    }
    
    // Implementation methods (simplified for compatibility layer)
    async runOptimizedInference(args) {
        // Use hardware acceleration manager
        return {
            outputs: new Float32Array(10).fill(0.5),
            inferenceTime: 50,
            deviceType: 'npu',
            optimized: true
        };
    }
    
    async runLegacyInference(args, apiVersion) {
        // Use CPU fallback for legacy plugins
        return {
            outputs: new Float32Array(10).fill(0.5),
            inferenceTime: 200,
            deviceType: 'cpu',
            optimized: false
        };
    }
    
    async processDocumentOptimized(args) {
        return {
            chunks: args.document?.content ? [{ id: 'chunk1', content: args.document.content }] : [],
            processingTime: 100,
            optimized: true
        };
    }
    
    async processDocumentLegacy(args, apiVersion) {
        return {
            chunks: args.document?.content ? [{ id: 'chunk1', content: args.document.content }] : [],
            processingTime: 300,
            optimized: false
        };
    }
    
    async cacheEmbeddingOptimized(args) {
        return {
            cached: true,
            layer: 'hierarchical',
            cacheTime: 10
        };
    }
    
    async cacheEmbeddingLegacy(args, apiVersion) {
        return {
            cached: true,
            layer: 'simple',
            cacheTime: 50
        };
    }
    
    async executeGeneric(method, args) {
        return { method, args, executed: true };
    }
    
    /**
     * Get migration recommendations for plugin
     */
    getMigrationRecommendations(pluginId) {
        const migrationStatus = this.migrationStatus.get(pluginId);
        const pluginInfo = this.pluginRegistry.get(pluginId);
        
        if (!migrationStatus || !pluginInfo) {
            return null;
        }
        
        return {
            pluginId,
            currentStatus: pluginInfo.migrationStatus,
            opportunities: migrationStatus.opportunities,
            estimatedBenefits: this.calculateMigrationBenefits(migrationStatus.opportunities),
            migrationPath: this.generateMigrationPath(pluginInfo, migrationStatus.opportunities)
        };
    }
    
    /**
     * Calculate migration benefits
     */
    calculateMigrationBenefits(opportunities) {
        let performanceGain = 1;
        let efficiencyGain = 1;
        
        opportunities.forEach(opportunity => {
            switch (opportunity.type) {
                case 'hardware-acceleration':
                    performanceGain *= 5; // 5x improvement
                    break;
                case 'hierarchical-cache':
                    efficiencyGain *= 2; // 2x cache efficiency
                    break;
                case 'batch-processing':
                    performanceGain *= 1.5; // 1.5x throughput
                    break;
            }
        });
        
        return {
            performanceGain: `${performanceGain}x`,
            efficiencyGain: `${efficiencyGain}x`,
            estimatedROI: performanceGain * efficiencyGain
        };
    }
    
    /**
     * Generate migration path
     */
    generateMigrationPath(pluginInfo, opportunities) {
        const steps = [];
        
        // Sort opportunities by effort (low to high)
        const sortedOpportunities = opportunities.sort((a, b) => {
            const effortOrder = { low: 1, medium: 2, high: 3 };
            return effortOrder[a.effort] - effortOrder[b.effort];
        });
        
        sortedOpportunities.forEach((opportunity, index) => {
            steps.push({
                step: index + 1,
                type: opportunity.type,
                effort: opportunity.effort,
                benefit: opportunity.benefit,
                estimatedTime: this.estimateMigrationTime(opportunity.effort),
                dependencies: index > 0 ? [steps[index - 1].type] : []
            });
        });
        
        return steps;
    }
    
    /**
     * Estimate migration time
     */
    estimateMigrationTime(effort) {
        switch (effort) {
            case 'low': return '1-2 days';
            case 'medium': return '1-2 weeks';
            case 'high': return '2-4 weeks';
            default: return 'unknown';
        }
    }
    
    /**
     * Get compatibility statistics
     */
    getStats() {
        return {
            ...this.stats,
            totalPlugins: this.pluginRegistry.size,
            migrationOpportunities: this.migrationStatus.size,
            supportedAPIVersions: this.options.supportedVersions,
            activeFeatures: Array.from(this.featureFlags.entries())
                .filter(([_, enabled]) => enabled)
                .map(([feature, _]) => feature)
        };
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        this.pluginRegistry.clear();
        this.apiAdapters.clear();
        this.featureFlags.clear();
        this.migrationStatus.clear();
        this.deprecationWarnings.clear();
        this.removeAllListeners();
    }
}

module.exports = CompatibilityLayer;
