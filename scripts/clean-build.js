/**
 * Clean Build Script for Glass Assistant
 * Handles file locks and ensures clean builds
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class CleanBuildManager {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '..');
        this.distPath = path.join(this.projectRoot, 'dist');
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 seconds
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '✅';
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async killElectronProcesses() {
        this.log('Killing any running Electron processes...');

        const processesToKill = [
            'electron.exe',
            'pickle-glass.exe',
            'Glass.exe',
            'app-builder.exe',
            'node.exe'
        ];

        for (const processName of processesToKill) {
            try {
                execSync(`taskkill /f /im "${processName}" /t 2>nul`, { stdio: 'ignore' });
                this.log(`Killed ${processName}`);
            } catch (error) {
                // Process not running, ignore
            }
        }

        // Wait longer for processes to fully terminate
        await this.sleep(3000);
        this.log('Process cleanup completed');
    }

    async forceRemoveDirectory(dirPath, retries = 0) {
        if (!fs.existsSync(dirPath)) {
            this.log(`Directory ${dirPath} does not exist, skipping removal`);
            return true;
        }

        this.log(`Attempting to remove ${dirPath} (attempt ${retries + 1}/${this.maxRetries})`);

        // Method 1: Windows rmdir command
        try {
            execSync(`cmd /c "rd /s /q "${dirPath}""`, { stdio: 'ignore' });
            this.log(`Successfully removed ${dirPath} with rmdir`);
            return true;
        } catch (error) {
            this.log(`rmdir failed for ${dirPath}`, 'warn');
        }

        // Method 2: PowerShell Remove-Item with force
        try {
            execSync(`powershell -Command "Remove-Item -Path '${dirPath}' -Recurse -Force -ErrorAction SilentlyContinue"`, { stdio: 'ignore' });
            if (!fs.existsSync(dirPath)) {
                this.log(`Successfully removed ${dirPath} with PowerShell`);
                return true;
            }
        } catch (error) {
            this.log(`PowerShell failed for ${dirPath}`, 'warn');
        }

        // Method 3: Handle.exe to close file handles (if available)
        try {
            execSync(`handle.exe "${dirPath}" -accepteula -nobanner | findstr /i "pid" | for /f "tokens=3" %i in ('more') do taskkill /f /pid %i`, { stdio: 'ignore' });
            this.log(`Closed file handles for ${dirPath}`);
        } catch (error) {
            // Handle.exe not available, continue
        }

        // Method 4: Node.js recursive removal with file attribute handling
        try {
            this.removeRecursiveWithAttributes(dirPath);
            if (!fs.existsSync(dirPath)) {
                this.log(`Successfully removed ${dirPath} with Node.js`);
                return true;
            }
        } catch (error) {
            this.log(`Node.js removal failed for ${dirPath}: ${error.message}`, 'warn');
        }

        // Retry if we haven't exceeded max attempts
        if (retries < this.maxRetries) {
            this.log(`Retrying removal of ${dirPath} in ${this.retryDelay}ms...`, 'warn');
            await this.sleep(this.retryDelay);
            return this.forceRemoveDirectory(dirPath, retries + 1);
        } else {
            this.log(`Failed to remove ${dirPath} after ${this.maxRetries} attempts`, 'error');
            return false;
        }
    }

    removeRecursiveWithAttributes(dirPath) {
        if (!fs.existsSync(dirPath)) return;

        const files = fs.readdirSync(dirPath);

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = fs.lstatSync(filePath);

            if (stat.isDirectory()) {
                this.removeRecursiveWithAttributes(filePath);
            } else {
                try {
                    // Remove read-only and system attributes
                    execSync(`attrib -R -S -H "${filePath}"`, { stdio: 'ignore' });
                    fs.unlinkSync(filePath);
                } catch (error) {
                    // Force delete with del command
                    try {
                        execSync(`del /F /Q "${filePath}"`, { stdio: 'ignore' });
                    } catch (delError) {
                        this.log(`Could not delete file: ${filePath}`, 'warn');
                    }
                }
            }
        }

        try {
            fs.rmdirSync(dirPath);
        } catch (error) {
            this.log(`Could not remove directory: ${dirPath}`, 'warn');
        }
    }

    async cleanNodeModules() {
        this.log('Cleaning node_modules cache...');
        try {
            execSync('npm cache clean --force', { stdio: 'inherit' });
            this.log('npm cache cleaned');
        } catch (error) {
            this.log('Failed to clean npm cache', 'warn');
        }
    }

    async buildRenderer() {
        this.log('Building renderer process...');
        try {
            execSync('npm run build:renderer', { 
                stdio: 'inherit',
                cwd: this.projectRoot 
            });
            this.log('Renderer build successful');
            return true;
        } catch (error) {
            this.log('Renderer build failed', 'error');
            console.error(error.message);
            return false;
        }
    }

    async buildElectron() {
        this.log('Building Electron application...');
        try {
            // Use temporary config with different output directory
            execSync('npx electron-builder --config electron-builder-temp.yml --publish never', {
                stdio: 'inherit',
                cwd: this.projectRoot
            });
            this.log('Electron build successful');
            return true;
        } catch (error) {
            this.log('Electron build failed', 'error');
            console.error(error.message);
            return false;
        }
    }

    async validateBuild() {
        this.log('Validating build output...');

        // Check for multiple possible build outputs
        const possibleOutputs = [
            'dist-simple',           // Simple build output
            'build-output/win-unpacked', // Electron-builder output
            'dist/win-unpacked',     // Alternative electron-builder output
            'out'                    // Electron-forge output
        ];

        let foundOutput = false;

        for (const output of possibleOutputs) {
            const outputPath = path.join(this.projectRoot, output);
            if (fs.existsSync(outputPath)) {
                this.log(`✓ Found build output: ${output}`);

                // List contents
                try {
                    const contents = fs.readdirSync(outputPath);
                    this.log(`  Contents: ${contents.join(', ')}`);
                } catch (error) {
                    this.log(`  Could not list contents: ${error.message}`, 'warn');
                }

                foundOutput = true;
                break;
            }
        }

        if (foundOutput) {
            this.log('Build validation successful');
        } else {
            this.log('Build validation failed - no output found', 'error');
        }

        return foundOutput;
    }

    async runCleanBuild() {
        this.log('Starting clean build process for Glass Assistant...');

        try {
            // Step 1: Kill any running processes
            await this.killElectronProcesses();

            // Step 2: Clean all build directories
            this.log('Cleaning all build directories...');
            const dirsToClean = [
                'dist',
                'dist-new',
                'build-output',
                'out',
                '.tmp'
            ];

            for (const dir of dirsToClean) {
                const dirPath = path.join(this.projectRoot, dir);
                await this.forceRemoveDirectory(dirPath);
            }

            // Step 3: Clean node modules cache
            await this.cleanNodeModules();

            // Step 4: Wait a bit more for file system to settle
            await this.sleep(2000);

            // Step 5: Build renderer
            const rendererSuccess = await this.buildRenderer();
            if (!rendererSuccess) {
                throw new Error('Renderer build failed');
            }

            // Step 6: Try simple build first, fallback to electron-builder
            let buildSuccess = false;

            // Try simple build method first
            try {
                this.log('Attempting simple build method...');
                execSync('node scripts/simple-build.js', {
                    stdio: 'inherit',
                    cwd: this.projectRoot
                });
                buildSuccess = true;
                this.log('Simple build completed successfully');
            } catch (simpleError) {
                this.log('Simple build failed, trying electron-builder...', 'warn');

                // Fallback to electron-builder
                const electronSuccess = await this.buildElectron();
                if (electronSuccess) {
                    buildSuccess = true;
                }
            }

            if (!buildSuccess) {
                throw new Error('All build methods failed');
            }

            // Step 7: Validate build
            const validationSuccess = await this.validateBuild();
            if (!validationSuccess) {
                this.log('Build validation failed - some expected files are missing', 'warn');
            }

            this.log('🎉 Clean build process completed successfully!');
            return true;

        } catch (error) {
            this.log(`Build process failed: ${error.message}`, 'error');
            return false;
        }
    }

    async runQuickBuild() {
        this.log('Starting quick build (renderer only)...');
        
        try {
            await this.killElectronProcesses();
            const success = await this.buildRenderer();
            
            if (success) {
                this.log('🎉 Quick build completed successfully!');
            }
            
            return success;
        } catch (error) {
            this.log(`Quick build failed: ${error.message}`, 'error');
            return false;
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const buildManager = new CleanBuildManager();
    
    if (args.includes('--quick') || args.includes('-q')) {
        await buildManager.runQuickBuild();
    } else {
        await buildManager.runCleanBuild();
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = CleanBuildManager;
