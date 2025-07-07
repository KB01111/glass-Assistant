const esbuild = require('esbuild');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

const baseConfig = {
    bundle: true,
    platform: 'browser',
    format: 'esm',
    loader: { '.js': 'jsx' },
    sourcemap: !isProduction, // Disable sourcemaps in production
    minify: isProduction, // Enable minification in production
    treeShaking: true, // Enable tree shaking
    external: ['electron'],
    define: {
        'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'development'}"`,
    },
    // Performance optimizations
    splitting: true, // Enable code splitting
    chunkNames: 'chunks/[name]-[hash]',
    metafile: isProduction, // Generate metafile for analysis
    drop: isProduction ? ['console', 'debugger'] : [], // Remove console.log in production
    legalComments: 'none', // Remove legal comments

    // Additional optimizations
    target: ['es2020'], // Modern target for better optimization
    mangleProps: isProduction ? /^_/ : undefined, // Mangle private properties in production
    keepNames: !isProduction, // Keep function names in development

    // Compression and size optimizations
    write: true,
};

const entryPoints = [
    { in: 'src/app/HeaderController.js', out: 'public/build/header' },
    { in: 'src/app/PickleGlassApp.js', out: 'public/build/content' },
];

async function build() {
    try {
        console.log('Building renderer process code...');

        const results = await Promise.all(entryPoints.map(point => {
            const config = { ...baseConfig };

            // Disable code splitting for individual builds
            if (config.splitting) {
                delete config.splitting;
                delete config.chunkNames;
            }

            return esbuild.build({
                ...config,
                entryPoints: [point.in],
                outfile: `${point.out}.js`,
            });
        }));

        // Log build statistics and analysis
        if (isProduction) {
            console.log('📊 Build Statistics:');
            let totalSize = 0;

            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const entry = entryPoints[i];

                if (result.metafile) {
                    const outputs = Object.keys(result.metafile.outputs);
                    for (const output of outputs) {
                        const outputInfo = result.metafile.outputs[output];
                        const size = outputInfo.bytes;
                        totalSize += size;

                        console.log(`  ${entry.out}.js: ${(size / 1024).toFixed(2)} KB`);
                    }

                    // Save metafile for analysis
                    const fs = require('fs');
                    fs.writeFileSync(`${entry.out}-meta.json`, JSON.stringify(result.metafile, null, 2));
                }
            }

            console.log(`📦 Total bundle size: ${(totalSize / 1024).toFixed(2)} KB`);

            // Performance recommendations
            if (totalSize > 500 * 1024) { // 500KB
                console.warn('⚠️  Bundle size is large. Consider code splitting or lazy loading.');
            }

            if (totalSize > 1024 * 1024) { // 1MB
                console.error('🚨 Bundle size is very large! Optimization required.');
            }
        }

        console.log('✅ Renderer builds successful!');
    } catch (e) {
        console.error('Renderer build failed:', e);
        process.exit(1);
    }
}

async function watch() {
    try {
        const contexts = await Promise.all(entryPoints.map(point => esbuild.context({
            ...baseConfig,
            entryPoints: [point.in],
            outfile: `${point.out}.js`,
        })));
        
        console.log('Watching for changes...');
        await Promise.all(contexts.map(context => context.watch()));

    } catch (e) {
        console.error('Watch mode failed:', e);
        process.exit(1);
    }
}

if (process.argv.includes('--watch')) {
    watch();
} else {
    build();
} 