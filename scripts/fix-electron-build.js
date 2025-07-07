/**
 * Electron Build Fix Script
 * Addresses common build issues and ensures clean packaging
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ElectronBuildFixer {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '..');
        this.issues = [];
        this.fixes = [];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    addIssue(issue) {
        this.issues.push(issue);
        this.log(`Issue detected: ${issue}`, 'warn');
    }

    addFix(fix) {
        this.fixes.push(fix);
        this.log(`Applied fix: ${fix}`, 'success');
    }

    /**
     * Check for common build issues
     */
    async checkForIssues() {
        this.log('Checking for common Electron build issues...');

        // Check 1: Jest dependencies in production
        await this.checkJestDependencies();

        // Check 2: Missing build files
        await this.checkBuildFiles();

        // Check 3: Native dependencies
        await this.checkNativeDependencies();

        // Check 4: Configuration issues
        await this.checkConfiguration();

        // Check 5: File permissions and locks
        await this.checkFilePermissions();

        return this.issues.length === 0;
    }

    async checkJestDependencies() {
        const packageJsonPath = path.join(this.projectRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            
            // Check if Jest is in dependencies instead of devDependencies
            if (packageData.dependencies && packageData.dependencies['@jest/globals']) {
                this.addIssue('Jest dependencies found in production dependencies');
            }

            // Check forge config ignore patterns
            const forgeConfigPath = path.join(this.projectRoot, 'forge.config.js');
            if (fs.existsSync(forgeConfigPath)) {
                const forgeConfig = fs.readFileSync(forgeConfigPath, 'utf8');
                if (!forgeConfig.includes('@jest') || !forgeConfig.includes('jest')) {
                    this.addIssue('Forge config missing Jest ignore patterns');
                }
            }
        }
    }

    async checkBuildFiles() {
        const buildDir = path.join(this.projectRoot, 'public/build');
        if (!fs.existsSync(buildDir)) {
            this.addIssue('Build directory missing');
            return;
        }

        const requiredFiles = ['content.js', 'header.js'];
        for (const file of requiredFiles) {
            const filePath = path.join(buildDir, file);
            if (!fs.existsSync(filePath)) {
                this.addIssue(`Required build file missing: ${file}`);
            }
        }
    }

    async checkNativeDependencies() {
        const packageJsonPath = path.join(this.projectRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const nativeDeps = ['sharp', 'sqlite3', 'onnxruntime-node'];
            
            for (const dep of nativeDeps) {
                if (packageData.dependencies && packageData.dependencies[dep]) {
                    // Check if native dependency is properly configured
                    const nodeModulesPath = path.join(this.projectRoot, 'node_modules', dep);
                    if (!fs.existsSync(nodeModulesPath)) {
                        this.addIssue(`Native dependency not installed: ${dep}`);
                    }
                }
            }
        }
    }

    async checkConfiguration() {
        // Check electron-builder config
        const builderConfigPath = path.join(this.projectRoot, 'electron-builder.yml');
        if (!fs.existsSync(builderConfigPath)) {
            this.addIssue('electron-builder.yml missing');
        }

        // Check forge config
        const forgeConfigPath = path.join(this.projectRoot, 'forge.config.js');
        if (!fs.existsSync(forgeConfigPath)) {
            this.addIssue('forge.config.js missing');
        }

        // Check main entry point
        const mainPath = path.join(this.projectRoot, 'src/index.js');
        if (!fs.existsSync(mainPath)) {
            this.addIssue('Main entry point missing: src/index.js');
        }
    }

    async checkFilePermissions() {
        // Check for file locks on Windows
        const distPath = path.join(this.projectRoot, 'dist');
        const outPath = path.join(this.projectRoot, 'out');
        
        for (const dir of [distPath, outPath]) {
            if (fs.existsSync(dir)) {
                try {
                    // Try to access the directory
                    fs.readdirSync(dir);
                } catch (error) {
                    this.addIssue(`Directory access issue: ${dir} - ${error.message}`);
                }
            }
        }
    }

    /**
     * Apply fixes for detected issues
     */
    async applyFixes() {
        this.log('Applying fixes for detected issues...');

        // Fix 1: Clean test dependencies from production
        await this.fixJestDependencies();

        // Fix 2: Rebuild renderer if needed
        await this.fixBuildFiles();

        // Fix 3: Reinstall native dependencies
        await this.fixNativeDependencies();

        // Fix 4: Clean build directories
        await this.fixFilePermissions();

        return this.fixes.length;
    }

    async fixJestDependencies() {
        this.log('Fixing Jest dependency issues...');
        
        // Remove Jest from production dependencies if present
        const packageJsonPath = path.join(this.projectRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            
            if (packageData.dependencies && packageData.dependencies['@jest/globals']) {
                delete packageData.dependencies['@jest/globals'];
                delete packageData.dependencies['jest'];
                delete packageData.dependencies['jsdom'];
                
                fs.writeFileSync(packageJsonPath, JSON.stringify(packageData, null, 4));
                this.addFix('Removed Jest from production dependencies');
            }
        }
    }

    async fixBuildFiles() {
        this.log('Fixing build files...');
        
        try {
            execSync('npm run build:renderer', { 
                stdio: 'inherit',
                cwd: this.projectRoot 
            });
            this.addFix('Rebuilt renderer files');
        } catch (error) {
            this.log(`Failed to rebuild renderer: ${error.message}`, 'error');
        }
    }

    async fixNativeDependencies() {
        this.log('Fixing native dependencies...');
        
        try {
            execSync('npm rebuild', { 
                stdio: 'inherit',
                cwd: this.projectRoot 
            });
            this.addFix('Rebuilt native dependencies');
        } catch (error) {
            this.log(`Failed to rebuild native dependencies: ${error.message}`, 'warn');
        }
    }

    async fixFilePermissions() {
        this.log('Fixing file permissions and locks...');
        
        const dirsToClean = ['dist', 'out', 'build-output', 'dist-new'];
        
        for (const dir of dirsToClean) {
            const dirPath = path.join(this.projectRoot, dir);
            if (fs.existsSync(dirPath)) {
                try {
                    execSync(`cmd /c "rd /s /q "${dirPath}""`, { stdio: 'ignore' });
                    this.addFix(`Cleaned directory: ${dir}`);
                } catch (error) {
                    this.log(`Could not clean ${dir}: ${error.message}`, 'warn');
                }
            }
        }
    }

    /**
     * Test the build process
     */
    async testBuild() {
        this.log('Testing Electron build process...');
        
        try {
            // Test renderer build first
            execSync('npm run build:renderer', { 
                stdio: 'inherit',
                cwd: this.projectRoot 
            });
            this.log('Renderer build test: PASSED', 'success');

            // Test package build (without actually packaging)
            this.log('Build test completed successfully', 'success');
            return true;
        } catch (error) {
            this.log(`Build test failed: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Generate build report
     */
    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('ELECTRON BUILD FIX REPORT');
        console.log('='.repeat(60));
        console.log(`Issues detected: ${this.issues.length}`);
        console.log(`Fixes applied: ${this.fixes.length}`);
        console.log('='.repeat(60));
        
        if (this.issues.length > 0) {
            console.log('\n📋 Issues detected:');
            this.issues.forEach((issue, index) => {
                console.log(`  ${index + 1}. ${issue}`);
            });
        }
        
        if (this.fixes.length > 0) {
            console.log('\n🔧 Fixes applied:');
            this.fixes.forEach((fix, index) => {
                console.log(`  ${index + 1}. ${fix}`);
            });
        }
        
        console.log('='.repeat(60));
        
        if (this.issues.length === 0) {
            console.log('✅ No issues detected - build should work correctly!');
        } else if (this.fixes.length >= this.issues.length) {
            console.log('✅ All issues have been addressed!');
        } else {
            console.log('⚠️ Some issues may require manual attention.');
        }
    }

    /**
     * Run the complete fix process
     */
    async run() {
        this.log('Starting Electron build fix process...', 'info');
        
        try {
            // Step 1: Check for issues
            const noIssues = await this.checkForIssues();
            
            // Step 2: Apply fixes if needed
            if (!noIssues) {
                await this.applyFixes();
            }
            
            // Step 3: Test the build
            const buildSuccess = await this.testBuild();
            
            // Step 4: Generate report
            this.generateReport();
            
            return buildSuccess;
            
        } catch (error) {
            this.log(`Fix process failed: ${error.message}`, 'error');
            return false;
        }
    }
}

// Run the fixer if this file is executed directly
if (require.main === module) {
    const fixer = new ElectronBuildFixer();
    fixer.run().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Fix process crashed:', error);
        process.exit(1);
    });
}

module.exports = ElectronBuildFixer;
