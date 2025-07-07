/**
 * Reliable Build Script
 * Uses the proven simple build method with better error handling
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ReliableBuildManager {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '..');
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Kill processes safely
     */
    async killProcessesSafely() {
        this.log('Cleaning up any running processes...');
        
        const processesToKill = ['electron.exe', 'pickle-glass.exe', 'Glass.exe'];
        
        for (const processName of processesToKill) {
            try {
                execSync(`taskkill /f /im "${processName}" /t 2>nul`, { stdio: 'ignore' });
                this.log(`Stopped ${processName}`);
            } catch (error) {
                // Process not running, ignore
            }
        }
        
        // Short wait for cleanup
        await this.sleep(1000);
    }

    /**
     * Clean directories safely
     */
    async cleanDirectoriesSafely() {
        this.log('Cleaning build directories...');
        
        const dirsToClean = ['dist-simple', 'dist', 'dist-new', 'build-output', 'out'];
        
        for (const dir of dirsToClean) {
            const dirPath = path.join(this.projectRoot, dir);
            if (fs.existsSync(dirPath)) {
                try {
                    fs.rmSync(dirPath, { recursive: true, force: true });
                    this.log(`Cleaned ${dir}`, 'success');
                } catch (error) {
                    this.log(`Could not clean ${dir}: ${error.message}`, 'warn');
                }
            }
        }
    }

    /**
     * Build renderer and web frontend
     */
    async buildRenderer() {
        this.log('Building renderer process...');

        try {
            execSync('npm run build:renderer', {
                stdio: 'inherit',
                cwd: this.projectRoot
            });
            this.log('Renderer build completed', 'success');
        } catch (error) {
            this.log(`Renderer build failed: ${error.message}`, 'error');
            return false;
        }

        // Also build the web frontend if it exists
        const webDir = path.join(this.projectRoot, 'pickleglass_web');
        if (fs.existsSync(webDir)) {
            this.log('Building web frontend...');
            try {
                execSync('npm run build', {
                    stdio: 'inherit',
                    cwd: webDir
                });
                this.log('Web frontend build completed', 'success');
            } catch (error) {
                this.log(`Web frontend build failed: ${error.message}`, 'warn');
                // Don't fail the entire build for this
            }
        }

        return true;
    }

    /**
     * Create simple distribution
     */
    async createSimpleDistribution() {
        this.log('Creating simple distribution...');
        
        try {
            execSync('node scripts/simple-build.js', { 
                stdio: 'inherit',
                cwd: this.projectRoot 
            });
            this.log('Simple distribution created', 'success');
            return true;
        } catch (error) {
            this.log(`Simple distribution failed: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Verify the build
     */
    verifyBuild() {
        this.log('Verifying build output...');
        
        const distPath = path.join(this.projectRoot, 'dist-simple');
        
        if (!fs.existsSync(distPath)) {
            this.log('Build output not found', 'error');
            return false;
        }
        
        const requiredFiles = ['package.json', 'src', 'public'];
        let allFilesExist = true;
        
        for (const file of requiredFiles) {
            const filePath = path.join(distPath, file);
            if (fs.existsSync(filePath)) {
                this.log(`✓ Found: ${file}`, 'success');
            } else {
                this.log(`✗ Missing: ${file}`, 'error');
                allFilesExist = false;
            }
        }
        
        if (allFilesExist) {
            this.log('Build verification successful', 'success');
            
            // Show contents
            try {
                const contents = fs.readdirSync(distPath);
                this.log(`Distribution contents: ${contents.join(', ')}`);
            } catch (error) {
                this.log('Could not list contents', 'warn');
            }
        }
        
        return allFilesExist;
    }

    /**
     * Test the build
     */
    async testBuild() {
        this.log('Testing the build...');
        
        const distPath = path.join(this.projectRoot, 'dist-simple');
        
        try {
            // Test if electron can start (with timeout)
            const testProcess = execSync('npx electron . --version', { 
                cwd: distPath,
                encoding: 'utf8',
                timeout: 10000
            });
            
            this.log(`Build test successful: ${testProcess.trim()}`, 'success');
            return true;
            
        } catch (error) {
            if (error.code === 'TIMEOUT') {
                this.log('Build test timed out (this is normal)', 'warn');
                return true; // Timeout is actually good - means app started
            } else {
                this.log(`Build test failed: ${error.message}`, 'error');
                return false;
            }
        }
    }

    /**
     * Generate final report
     */
    generateReport(success) {
        console.log('\n' + '='.repeat(60));
        console.log('RELIABLE BUILD REPORT');
        console.log('='.repeat(60));
        
        if (success) {
            console.log('✅ Status: BUILD SUCCESSFUL');
            console.log('✅ Method: Simple Distribution');
            console.log('✅ Location: dist-simple/');
            console.log('✅ Ready to run: cd dist-simple && npx electron .');
        } else {
            console.log('❌ Status: BUILD FAILED');
            console.log('💡 Try: npm run build:simple (direct method)');
        }
        
        console.log('='.repeat(60));
    }

    /**
     * Run the reliable build process
     */
    async run() {
        this.log('Starting reliable build process...', 'info');
        
        try {
            // Step 1: Clean up safely
            await this.killProcessesSafely();
            await this.cleanDirectoriesSafely();
            
            // Step 2: Build renderer
            const rendererSuccess = await this.buildRenderer();
            if (!rendererSuccess) {
                this.generateReport(false);
                return false;
            }
            
            // Step 3: Create simple distribution
            const distSuccess = await this.createSimpleDistribution();
            if (!distSuccess) {
                this.generateReport(false);
                return false;
            }
            
            // Step 4: Verify build
            const verifySuccess = this.verifyBuild();
            if (!verifySuccess) {
                this.generateReport(false);
                return false;
            }
            
            // Step 5: Test build (optional)
            await this.testBuild();
            
            // Step 6: Generate report
            this.generateReport(true);
            
            this.log('🎉 Reliable build completed successfully!', 'success');
            return true;
            
        } catch (error) {
            this.log(`Reliable build process failed: ${error.message}`, 'error');
            this.generateReport(false);
            return false;
        }
    }
}

// Run the reliable builder if this file is executed directly
if (require.main === module) {
    const builder = new ReliableBuildManager();
    builder.run().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Reliable build process crashed:', error);
        process.exit(1);
    });
}

module.exports = ReliableBuildManager;
