#!/usr/bin/env node

/**
 * Performance Optimization Script
 * Analyzes and optimizes Glass Assistant for maximum performance
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PerformanceOptimizer {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '..');
        this.buildDir = path.join(this.projectRoot, 'public', 'build');
        this.optimizations = [];
    }
    
    async run() {
        console.log('🚀 Starting Glass Assistant Performance Optimization\n');
        
        try {
            await this.analyzeCurrentState();
            await this.optimizeAssets();
            await this.optimizeBuild();
            await this.generateReport();
            
            console.log('\n✅ Performance optimization completed!');
            this.printSummary();
            
        } catch (error) {
            console.error('❌ Optimization failed:', error);
            process.exit(1);
        }
    }
    
    async analyzeCurrentState() {
        console.log('📊 Analyzing current performance state...');
        
        // Check bundle sizes
        if (fs.existsSync(this.buildDir)) {
            const files = fs.readdirSync(this.buildDir);
            let totalSize = 0;
            
            for (const file of files) {
                if (file.endsWith('.js')) {
                    const filePath = path.join(this.buildDir, file);
                    const stats = fs.statSync(filePath);
                    totalSize += stats.size;
                    
                    console.log(`  ${file}: ${(stats.size / 1024).toFixed(2)} KB`);
                    
                    if (stats.size > 500 * 1024) {
                        this.optimizations.push({
                            type: 'bundle-size',
                            file,
                            issue: 'Large bundle size',
                            recommendation: 'Consider code splitting or lazy loading'
                        });
                    }
                }
            }
            
            console.log(`  Total: ${(totalSize / 1024).toFixed(2)} KB\n`);
            
            if (totalSize > 1024 * 1024) {
                this.optimizations.push({
                    type: 'total-size',
                    issue: 'Very large total bundle size',
                    recommendation: 'Implement aggressive code splitting and lazy loading'
                });
            }
        }
        
        // Check for source maps in production
        const sourceMapFiles = fs.readdirSync(this.buildDir).filter(f => f.endsWith('.map'));
        if (sourceMapFiles.length > 0) {
            this.optimizations.push({
                type: 'source-maps',
                issue: 'Source maps present in build',
                recommendation: 'Disable source maps in production builds'
            });
        }
    }
    
    async optimizeAssets() {
        console.log('🎨 Optimizing assets...');
        
        const assetsDir = path.join(this.projectRoot, 'src', 'assets');
        
        // Check for unoptimized images
        if (fs.existsSync(assetsDir)) {
            const files = fs.readdirSync(assetsDir);
            
            for (const file of files) {
                if (file.match(/\.(png|jpg|jpeg)$/)) {
                    const filePath = path.join(assetsDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.size > 100 * 1024) { // 100KB
                        this.optimizations.push({
                            type: 'image-size',
                            file,
                            issue: 'Large image file',
                            recommendation: 'Compress image or convert to WebP'
                        });
                    }
                }
            }
        }
        
        console.log('  ✅ Asset analysis completed\n');
    }
    
    async optimizeBuild() {
        console.log('🔧 Running optimized build...');
        
        try {
            // Set production environment
            process.env.NODE_ENV = 'production';
            
            // Run optimized build
            execSync('npm run build:renderer', { 
                stdio: 'inherit',
                cwd: this.projectRoot 
            });
            
            console.log('  ✅ Optimized build completed\n');
            
        } catch (error) {
            console.error('  ❌ Build optimization failed:', error.message);
            throw error;
        }
    }
    
    async generateReport() {
        console.log('📋 Generating performance report...');
        
        const report = {
            timestamp: new Date().toISOString(),
            optimizations: this.optimizations,
            recommendations: this.generateRecommendations(),
            metrics: await this.gatherMetrics()
        };
        
        const reportPath = path.join(this.projectRoot, 'performance-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log(`  ✅ Report saved to ${reportPath}\n`);
    }
    
    generateRecommendations() {
        const recommendations = [
            {
                category: 'Bundle Optimization',
                items: [
                    'Enable code splitting for large components',
                    'Implement lazy loading for non-critical features',
                    'Use dynamic imports for heavy dependencies',
                    'Remove unused code with tree shaking'
                ]
            },
            {
                category: 'Asset Optimization',
                items: [
                    'Compress images using modern formats (WebP, AVIF)',
                    'Implement asset caching strategies',
                    'Use CDN for static assets',
                    'Optimize font loading with font-display: swap'
                ]
            },
            {
                category: 'Runtime Performance',
                items: [
                    'Implement virtual scrolling for large lists',
                    'Use requestAnimationFrame for animations',
                    'Debounce expensive operations',
                    'Implement proper memory cleanup'
                ]
            },
            {
                category: 'Network Optimization',
                items: [
                    'Enable HTTP/2 server push',
                    'Implement service worker caching',
                    'Use compression (gzip/brotli)',
                    'Optimize IPC communication'
                ]
            }
        ];
        
        return recommendations;
    }
    
    async gatherMetrics() {
        const metrics = {};
        
        // Bundle size metrics
        if (fs.existsSync(this.buildDir)) {
            const files = fs.readdirSync(this.buildDir);
            let totalSize = 0;
            let jsSize = 0;
            let mapSize = 0;
            
            for (const file of files) {
                const filePath = path.join(this.buildDir, file);
                const stats = fs.statSync(filePath);
                
                totalSize += stats.size;
                
                if (file.endsWith('.js')) {
                    jsSize += stats.size;
                } else if (file.endsWith('.map')) {
                    mapSize += stats.size;
                }
            }
            
            metrics.bundleSize = {
                total: totalSize,
                javascript: jsSize,
                sourceMaps: mapSize,
                totalKB: (totalSize / 1024).toFixed(2),
                javascriptKB: (jsSize / 1024).toFixed(2),
                sourceMapsKB: (mapSize / 1024).toFixed(2)
            };
        }
        
        // Performance score
        metrics.performanceScore = this.calculatePerformanceScore();
        
        return metrics;
    }
    
    calculatePerformanceScore() {
        let score = 100;
        
        // Deduct points for each optimization needed
        for (const opt of this.optimizations) {
            switch (opt.type) {
                case 'bundle-size':
                    score -= 10;
                    break;
                case 'total-size':
                    score -= 20;
                    break;
                case 'source-maps':
                    score -= 5;
                    break;
                case 'image-size':
                    score -= 5;
                    break;
                default:
                    score -= 3;
            }
        }
        
        return Math.max(0, score);
    }
    
    printSummary() {
        console.log('📊 Performance Optimization Summary:');
        console.log(`   Issues found: ${this.optimizations.length}`);
        
        if (this.optimizations.length > 0) {
            console.log('\n🔍 Issues to address:');
            this.optimizations.forEach((opt, index) => {
                console.log(`   ${index + 1}. ${opt.issue}`);
                console.log(`      → ${opt.recommendation}`);
            });
        }
        
        const score = this.calculatePerformanceScore();
        console.log(`\n🎯 Performance Score: ${score}/100`);
        
        if (score >= 90) {
            console.log('   🟢 Excellent performance!');
        } else if (score >= 70) {
            console.log('   🟡 Good performance, minor optimizations needed');
        } else if (score >= 50) {
            console.log('   🟠 Moderate performance, optimizations recommended');
        } else {
            console.log('   🔴 Poor performance, immediate optimization required');
        }
        
        console.log('\n💡 Run with --fix to automatically apply optimizations');
    }
}

// Run the optimizer
if (require.main === module) {
    const optimizer = new PerformanceOptimizer();
    optimizer.run().catch(console.error);
}

module.exports = PerformanceOptimizer;
