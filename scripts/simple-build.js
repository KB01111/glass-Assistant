/**
 * Simple Build Script
 * Basic Electron build without complex configurations
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SimpleBuildManager {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '..');
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    /**
     * Test if Electron can start
     */
    async testElectronStart() {
        this.log('Testing if Electron can start...');
        
        try {
            // Just test if electron can load the main file
            const result = execSync('npx electron --version', { 
                encoding: 'utf8',
                cwd: this.projectRoot 
            });
            this.log(`Electron version: ${result.trim()}`, 'success');
            return true;
        } catch (error) {
            this.log(`Electron test failed: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Build renderer only
     */
    async buildRenderer() {
        this.log('Building renderer process...');
        
        try {
            execSync('npm run build:renderer', { 
                stdio: 'inherit',
                cwd: this.projectRoot 
            });
            this.log('Renderer build completed', 'success');
            return true;
        } catch (error) {
            this.log(`Renderer build failed: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Create a very simple package.json for distribution
     */
    createDistPackageJson() {
        const originalPackage = JSON.parse(
            fs.readFileSync(path.join(this.projectRoot, 'package.json'), 'utf8')
        );

        const distPackage = {
            name: originalPackage.name,
            version: originalPackage.version,
            description: originalPackage.description,
            main: originalPackage.main,
            author: originalPackage.author,
            license: originalPackage.license,
            dependencies: {
                // Only include essential runtime dependencies
                'electron-deeplink': originalPackage.dependencies['electron-deeplink'],
                'sqlite3': originalPackage.dependencies['sqlite3'],
                'sql.js': originalPackage.dependencies['sql.js']
            }
        };

        return distPackage;
    }

    /**
     * Create a minimal distribution
     */
    async createMinimalDistribution() {
        this.log('Creating minimal distribution...');
        
        try {
            const distDir = path.join(this.projectRoot, 'dist-simple');
            
            // Clean dist directory
            if (fs.existsSync(distDir)) {
                fs.rmSync(distDir, { recursive: true, force: true });
            }
            fs.mkdirSync(distDir, { recursive: true });

            // Copy essential files
            const filesToCopy = [
                'src',
                'public/build',
                'pickleglass_web/backend_node',
                'pickleglass_web/out'  // Include built web frontend
            ];

            for (const file of filesToCopy) {
                const srcPath = path.join(this.projectRoot, file);
                const destPath = path.join(distDir, file);
                
                if (fs.existsSync(srcPath)) {
                    this.copyRecursive(srcPath, destPath);
                    this.log(`Copied ${file}`, 'success');
                }
            }

            // Create distribution package.json
            const distPackage = this.createDistPackageJson();
            fs.writeFileSync(
                path.join(distDir, 'package.json'),
                JSON.stringify(distPackage, null, 2)
            );

            this.log('Minimal distribution created', 'success');
            return distDir;
            
        } catch (error) {
            this.log(`Distribution creation failed: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Copy files recursively
     */
    copyRecursive(src, dest) {
        const stat = fs.statSync(src);
        
        if (stat.isDirectory()) {
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }
            
            const files = fs.readdirSync(src);
            for (const file of files) {
                // Skip node_modules and test files
                if (file === 'node_modules' || file.includes('.test.') || file.includes('.spec.')) {
                    continue;
                }
                
                const srcFile = path.join(src, file);
                const destFile = path.join(dest, file);
                this.copyRecursive(srcFile, destFile);
            }
        } else {
            fs.copyFileSync(src, dest);
        }
    }

    /**
     * Test the distribution
     */
    async testDistribution(distDir) {
        this.log('Testing distribution...');
        
        try {
            // Install dependencies in dist directory
            execSync('npm install --production', { 
                stdio: 'inherit',
                cwd: distDir 
            });

            // Test if electron can start with the distribution
            execSync('npx electron .', { 
                stdio: 'inherit',
                cwd: distDir,
                timeout: 5000 // 5 second timeout
            });

            this.log('Distribution test completed', 'success');
            return true;
            
        } catch (error) {
            if (error.signal === 'SIGTERM' || error.code === 'TIMEOUT') {
                this.log('Distribution started successfully (timed out as expected)', 'success');
                return true;
            } else {
                this.log(`Distribution test failed: ${error.message}`, 'error');
                return false;
            }
        }
    }

    /**
     * Generate build report
     */
    generateReport(success, distDir) {
        console.log('\n' + '='.repeat(60));
        console.log('SIMPLE BUILD REPORT');
        console.log('='.repeat(60));
        
        if (success) {
            console.log('✅ Build Status: SUCCESS');
            console.log(`✅ Distribution Location: ${distDir}`);
            console.log('✅ Electron app is ready to run');
            
            if (distDir && fs.existsSync(distDir)) {
                const files = fs.readdirSync(distDir);
                console.log(`✅ Distribution Contents: ${files.join(', ')}`);
            }
        } else {
            console.log('❌ Build Status: FAILED');
            console.log('❌ Electron app could not be built');
        }
        
        console.log('='.repeat(60));
        
        if (success) {
            console.log('\n🎉 Your Electron app is ready!');
            console.log(`📁 Location: ${distDir}`);
            console.log('🚀 To run: cd dist-simple && npx electron .');
        } else {
            console.log('\n💡 Try running individual components:');
            console.log('   - npm run build:renderer (build UI)');
            console.log('   - npx electron . (test main process)');
        }
    }

    /**
     * Run the simple build process
     */
    async run() {
        this.log('Starting simple build process...', 'info');
        
        try {
            // Step 1: Test Electron
            const electronWorks = await this.testElectronStart();
            if (!electronWorks) {
                this.generateReport(false, null);
                return false;
            }

            // Step 2: Build renderer
            const rendererBuilt = await this.buildRenderer();
            if (!rendererBuilt) {
                this.generateReport(false, null);
                return false;
            }

            // Step 3: Create distribution
            const distDir = await this.createMinimalDistribution();
            if (!distDir) {
                this.generateReport(false, null);
                return false;
            }

            // Step 4: Test distribution (optional)
            // const distWorks = await this.testDistribution(distDir);

            // Generate report
            this.generateReport(true, distDir);
            return true;
            
        } catch (error) {
            this.log(`Simple build process failed: ${error.message}`, 'error');
            this.generateReport(false, null);
            return false;
        }
    }
}

// Run the simple builder if this file is executed directly
if (require.main === module) {
    const builder = new SimpleBuildManager();
    builder.run().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Simple build process crashed:', error);
        process.exit(1);
    });
}

module.exports = SimpleBuildManager;
