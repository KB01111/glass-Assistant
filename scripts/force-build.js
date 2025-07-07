/**
 * Force Build Script
 * Aggressively handles Windows file locks and build issues
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

class ForceBuildManager {
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
     * Kill all processes that might lock files
     */
    async killAllProcesses() {
        this.log('Killing all potentially interfering processes...');
        
        const processesToKill = [
            'electron.exe',
            'pickle-glass.exe',
            'node.exe',
            'app-builder.exe'
        ];

        for (const process of processesToKill) {
            try {
                execSync(`taskkill /F /IM "${process}" /T`, { stdio: 'ignore' });
                this.log(`Killed ${process}`, 'success');
            } catch (error) {
                // Process not running, ignore
            }
        }

        // Wait for processes to fully terminate
        await this.sleep(3000);
    }

    /**
     * Force remove directories using multiple methods
     */
    async forceRemoveDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) {
            return true;
        }

        this.log(`Force removing directory: ${dirPath}`);

        // Method 1: Windows rmdir
        try {
            execSync(`cmd /c "rmdir /s /q "${dirPath}""`, { stdio: 'ignore' });
            this.log(`Removed ${dirPath} with rmdir`, 'success');
            return true;
        } catch (error) {
            this.log(`rmdir failed for ${dirPath}`, 'warn');
        }

        // Method 2: PowerShell Remove-Item
        try {
            execSync(`powershell -Command "Remove-Item -Path '${dirPath}' -Recurse -Force"`, { stdio: 'ignore' });
            this.log(`Removed ${dirPath} with PowerShell`, 'success');
            return true;
        } catch (error) {
            this.log(`PowerShell failed for ${dirPath}`, 'warn');
        }

        // Method 3: Node.js recursive removal
        try {
            this.removeRecursive(dirPath);
            this.log(`Removed ${dirPath} with Node.js`, 'success');
            return true;
        } catch (error) {
            this.log(`Node.js removal failed for ${dirPath}: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Recursive directory removal with file attribute handling
     */
    removeRecursive(dirPath) {
        if (!fs.existsSync(dirPath)) return;

        const files = fs.readdirSync(dirPath);
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = fs.lstatSync(filePath);
            
            if (stat.isDirectory()) {
                this.removeRecursive(filePath);
            } else {
                try {
                    // Remove read-only attribute
                    execSync(`attrib -R "${filePath}"`, { stdio: 'ignore' });
                    fs.unlinkSync(filePath);
                } catch (error) {
                    // Force delete with handle.exe if available
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

    /**
     * Clean all build directories
     */
    async cleanAllBuildDirectories() {
        this.log('Cleaning all build directories...');
        
        const dirsToClean = [
            'dist',
            'dist-new',
            'out',
            'build-output',
            '.tmp',
            'node_modules/.cache'
        ];

        for (const dir of dirsToClean) {
            const dirPath = path.join(this.projectRoot, dir);
            await this.forceRemoveDirectory(dirPath);
        }
    }

    /**
     * Create a minimal electron-builder config without problematic dependencies
     */
    createMinimalConfig() {
        const config = {
            appId: 'com.kbpartner.glass-assistant',
            productName: 'Glass Assistant',
            directories: {
                output: 'dist-final'
            },
            files: [
                'src/**/*',
                'package.json',
                'pickleglass_web/backend_node/**/*',
                'public/build/**/*',
                '!**/node_modules/electron/**',
                '!tests/**',
                '!**/*.test.*',
                '!**/*.spec.*'
            ],
            win: {
                target: 'nsis',
                icon: 'src/assets/icon.ico'
            },
            nsis: {
                oneClick: false,
                allowToChangeInstallationDirectory: true
            }
        };

        const configPath = path.join(this.projectRoot, 'electron-builder-minimal.yml');
        const yamlContent = `
appId: ${config.appId}
productName: "${config.productName}"
directories:
  output: ${config.directories.output}
files:
${config.files.map(f => `  - "${f}"`).join('\n')}
win:
  target: nsis
  icon: src/assets/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
`;

        fs.writeFileSync(configPath, yamlContent);
        return configPath;
    }

    /**
     * Build with minimal configuration
     */
    async buildWithMinimalConfig() {
        this.log('Building with minimal configuration...');
        
        try {
            // Create minimal config
            const configPath = this.createMinimalConfig();
            
            // Build renderer first
            execSync('npm run build:renderer', { 
                stdio: 'inherit',
                cwd: this.projectRoot 
            });
            
            // Build with minimal config
            execSync(`npx electron-builder --config "${configPath}" --publish never`, { 
                stdio: 'inherit',
                cwd: this.projectRoot 
            });
            
            this.log('Build completed successfully!', 'success');
            return true;
            
        } catch (error) {
            this.log(`Build failed: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Verify build output
     */
    verifyBuildOutput() {
        const outputDir = path.join(this.projectRoot, 'dist-final');
        
        if (fs.existsSync(outputDir)) {
            const files = fs.readdirSync(outputDir);
            this.log(`Build output found: ${files.join(', ')}`, 'success');
            return true;
        } else {
            this.log('No build output found', 'error');
            return false;
        }
    }

    /**
     * Run the complete force build process
     */
    async run() {
        this.log('Starting force build process...', 'info');
        
        try {
            // Step 1: Kill all processes
            await this.killAllProcesses();
            
            // Step 2: Clean all directories
            await this.cleanAllBuildDirectories();
            
            // Step 3: Wait a bit more
            await this.sleep(2000);
            
            // Step 4: Build with minimal config
            const buildSuccess = await this.buildWithMinimalConfig();
            
            if (buildSuccess) {
                // Step 5: Verify output
                const outputExists = this.verifyBuildOutput();
                
                if (outputExists) {
                    this.log('Force build completed successfully! 🎉', 'success');
                    return true;
                } else {
                    this.log('Build completed but no output found', 'error');
                    return false;
                }
            } else {
                this.log('Force build failed', 'error');
                return false;
            }
            
        } catch (error) {
            this.log(`Force build process failed: ${error.message}`, 'error');
            return false;
        }
    }
}

// Run the force builder if this file is executed directly
if (require.main === module) {
    const builder = new ForceBuildManager();
    builder.run().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Force build process crashed:', error);
        process.exit(1);
    });
}

module.exports = ForceBuildManager;
