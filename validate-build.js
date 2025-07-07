/**
 * Glass Assistant - Build Validation Script
 * Validates that all components can be loaded and initialized properly
 */

const fs = require('fs');
const path = require('path');

class BuildValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.validatedFiles = 0;
    }

    async validateBuild() {
        console.log('🔍 Validating Glass Assistant build...\n');

        try {
            await this.validateCoreServices();
            await this.validatePluginSystem();
            await this.validateUIComponents();
            await this.validateIntegrationPoints();
            await this.validateDependencies();
            
            this.printResults();
            return this.errors.length === 0;
            
        } catch (error) {
            console.error('❌ Build validation failed:', error);
            return false;
        }
    }

    async validateCoreServices() {
        console.log('🔧 Validating core services...');

        const coreServices = [
            'src/common/services/aiProcessingService.js',
            'src/common/services/localModelService.js',
            'src/common/services/pluginManager.js',
            'src/common/services/pluginIntegration.js',
            'src/main/handlers/aiProcessingHandlers.js'
        ];

        for (const servicePath of coreServices) {
            await this.validateFile(servicePath, 'Core Service');
        }
    }

    async validatePluginSystem() {
        console.log('🔌 Validating plugin system...');

        const pluginFiles = [
            'src/plugins/local-ai-model-manager/index.js',
            'src/common/services/pluginAPI.js',
            'src/common/services/pluginLifecycle.js'
        ];

        for (const pluginPath of pluginFiles) {
            await this.validateFile(pluginPath, 'Plugin System');
        }

        // Validate plugin structure
        const pluginDir = 'src/plugins/local-ai-model-manager';
        if (fs.existsSync(pluginDir)) {
            const packagePath = path.join(pluginDir, 'package.json');
            if (fs.existsSync(packagePath)) {
                try {
                    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                    if (!packageData.name || !packageData.version) {
                        this.addWarning('Plugin package.json missing required fields');
                    }
                } catch (error) {
                    this.addError('Plugin package.json is invalid JSON');
                }
            } else {
                this.addWarning('Plugin package.json not found');
            }
        }
    }

    async validateUIComponents() {
        console.log('🎨 Validating UI components...');

        const uiComponents = [
            'src/features/customize/AIProviderSelector.js',
            'src/features/ask/ChatBubble.js',
            'src/features/ask/AskView.js',
            'src/features/customize/CustomizeView.js'
        ];

        for (const componentPath of uiComponents) {
            await this.validateFile(componentPath, 'UI Component');
            await this.validateGlassDesign(componentPath);
        }
    }

    async validateIntegrationPoints() {
        console.log('🔗 Validating integration points...');

        // Check main process integration
        const mainIndexPath = 'src/index.js';
        if (fs.existsSync(mainIndexPath)) {
            const content = fs.readFileSync(mainIndexPath, 'utf8');
            
            // Check for AI processing handlers integration
            if (!content.includes('AIProcessingHandlers')) {
                this.addError('AIProcessingHandlers not integrated in main process');
            }
            
            // Check for plugin manager initialization
            if (!content.includes('pluginManager.initialize()')) {
                this.addError('Plugin manager not properly initialized');
            }
            
            this.validatedFiles++;
        } else {
            this.addError('Main index.js file not found');
        }

        // Check renderer integration
        const rendererPath = 'src/features/listen/renderer.js';
        if (fs.existsSync(rendererPath)) {
            const content = fs.readFileSync(rendererPath, 'utf8');
            
            // Check for AI processing service integration
            if (!content.includes('ai-process-message')) {
                this.addError('AI processing service not integrated in renderer');
            }
            
            this.validatedFiles++;
        }
    }

    async validateDependencies() {
        console.log('📦 Validating dependencies...');

        const packageJsonPath = 'package.json';
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                
                // Check for required dependencies
                const requiredDeps = [
                    'electron',
                    'onnxruntime-node'
                ];
                
                const allDeps = {
                    ...packageData.dependencies,
                    ...packageData.devDependencies
                };
                
                for (const dep of requiredDeps) {
                    if (!allDeps[dep]) {
                        this.addWarning(`Missing dependency: ${dep}`);
                    }
                }
                
                this.validatedFiles++;
            } catch (error) {
                this.addError('package.json is invalid JSON');
            }
        } else {
            this.addError('package.json not found');
        }
    }

    async validateFile(filePath, category) {
        if (!fs.existsSync(filePath)) {
            this.addError(`${category}: ${filePath} not found`);
            return;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Basic syntax validation
            if (filePath.endsWith('.js')) {
                // Check for basic JavaScript syntax issues
                if (content.includes('import') && content.includes('require(')) {
                    this.addWarning(`${filePath}: Mixed import/require syntax`);
                }
                
                // Check for proper exports
                if (!content.includes('module.exports') && !content.includes('export')) {
                    this.addWarning(`${filePath}: No exports found`);
                }
            }
            
            this.validatedFiles++;
            
        } catch (error) {
            this.addError(`${category}: Failed to read ${filePath} - ${error.message}`);
        }
    }

    async validateGlassDesign(componentPath) {
        if (!fs.existsSync(componentPath)) return;

        try {
            const content = fs.readFileSync(componentPath, 'utf8');
            
            // Check for glass design elements
            const glassDesignPatterns = [
                'backdrop-filter',
                'rgba(',
                'blur(',
                'transparent',
                'glass'
            ];
            
            const hasGlassDesign = glassDesignPatterns.some(pattern => 
                content.includes(pattern)
            );
            
            if (!hasGlassDesign) {
                this.addWarning(`${componentPath}: May not follow glass design aesthetic`);
            }
            
        } catch (error) {
            this.addWarning(`Failed to validate glass design for ${componentPath}`);
        }
    }

    addError(message) {
        this.errors.push(message);
        console.log(`❌ ${message}`);
    }

    addWarning(message) {
        this.warnings.push(message);
        console.log(`⚠️ ${message}`);
    }

    printResults() {
        console.log('\n📊 Build Validation Results:');
        console.log(`📁 Files validated: ${this.validatedFiles}`);
        console.log(`❌ Errors: ${this.errors.length}`);
        console.log(`⚠️ Warnings: ${this.warnings.length}`);
        
        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log('✅ Build validation passed with no issues!');
        } else if (this.errors.length === 0) {
            console.log('✅ Build validation passed with warnings');
        } else {
            console.log('❌ Build validation failed');
        }
        
        if (this.errors.length > 0) {
            console.log('\n🐛 Errors that must be fixed:');
            this.errors.forEach(error => console.log(`  - ${error}`));
        }
        
        if (this.warnings.length > 0) {
            console.log('\n⚠️ Warnings to consider:');
            this.warnings.forEach(warning => console.log(`  - ${warning}`));
        }
    }
}

// Run validation if this file is executed directly
if (require.main === module) {
    const validator = new BuildValidator();
    validator.validateBuild().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = BuildValidator;
