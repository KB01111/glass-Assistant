# Configuration Reference

## Overview

This document provides a comprehensive reference for configuring the AMD Gaia NPU + LLMware integration in Glass Assistant.

## Configuration Files

### Main Configuration (`config/integration.js`)

```javascript
module.exports = {
  // Hardware acceleration settings
  hardware: {
    enableNPU: true,                    // Enable AMD Gaia NPU
    enableGPU: true,                    // Enable GPU acceleration
    enableCPU: true,                    // Enable CPU fallback
    fallbackStrategy: 'performance',   // 'performance', 'power', 'balanced'
    healthCheckInterval: 30000,         // Health check interval (ms)
    maxConcurrentInferences: 10,        // Max concurrent inferences
    loadBalancingStrategy: 'performance' // Load balancing strategy
  },
  
  // Cache configuration
  cache: {
    l1: {
      maxSize: 1000,                    // Max number of entries
      maxMemoryMB: 512,                 // Max memory usage (MB)
      ttl: 3600000,                     // Time to live (ms)
      enableCompression: false,         // Enable compression
      enableHashIndex: true,            // Enable hash indexing
      cleanupInterval: 300000           // Cleanup interval (ms)
    },
    l2: {
      dbPath: './cache/embeddings.db', // Database path
      maxSizeMB: 10240,                // Max size (MB)
      enableVectorSearch: true,         // Enable vector search
      vectorDimensions: 384,            // Vector dimensions
      indexType: 'IVF_FLAT',          // Index type
      batchSize: 1000                   // Batch size
    },
    l3: {
      endpoints: ['http://localhost:8000/cache'], // Cache endpoints
      timeout: 5000,                    // Request timeout (ms)
      retries: 2,                       // Retry attempts
      enableEncryption: true,           // Enable encryption
      replicationFactor: 2,             // Replication factor
      consistencyLevel: 'eventual'      // Consistency level
    },
    promotion: {
      promotionThreshold: 3,            // Promote after N accesses
      demotionThreshold: 0.1,           // Demote if frequency < threshold
      recencyWeight: 0.4,               // Weight for recency
      frequencyWeight: 0.6,             // Weight for frequency
      enablePredictivePromotion: true   // Enable predictive promotion
    }
  },
  
  // Processing configuration
  processing: {
    maxWorkers: require('os').cpus().length, // Number of workers
    maxQueueSize: 1000,                // Max queue size
    workerTimeout: 300000,             // Worker timeout (ms)
    enableBatching: true,              // Enable batch processing
    batchSize: 10,                     // Batch size
    batchTimeout: 5000,                // Batch timeout (ms)
    enablePriority: true               // Enable priority queues
  },
  
  // Resource allocation
  resources: {
    memoryThreshold: 0.8,              // Memory usage threshold
    cpuThreshold: 0.9,                 // CPU usage threshold
    storageThreshold: 0.85,            // Storage usage threshold
    enablePredictiveAllocation: true,  // Enable predictive allocation
    enableAutoScaling: true,           // Enable auto-scaling
    maxMemoryAllocation: 0.9,          // Max memory allocation
    reservedMemoryMB: 1024             // Reserved memory (MB)
  }
};
```

### ONNX Runtime Configuration (`config/onnx.js`)

```javascript
module.exports = {
  optimization: {
    enableFP16Quantization: true,      // Enable FP16 quantization
    enableGraphOptimization: true,     // Enable graph optimization
    enableHardwareOptimization: true,  // Enable hardware optimization
    optimizationLevel: 'all',          // Optimization level
    cacheOptimizedModels: true,        // Cache optimized models
    cacheDirectory: './cache/optimized_models' // Cache directory
  },
  
  session: {
    maxPoolSize: 10,                   // Max session pool size
    maxIdleTime: 300000,               // Max idle time (ms)
    enableSessionCaching: true,        // Enable session caching
    enableModelCaching: true,          // Enable model caching
    sessionTimeout: 60000,             // Session timeout (ms)
    defaultProviders: ['DmlExecutionProvider', 'CPUExecutionProvider']
  },
  
  directml: {
    deviceFilter: 'npu',               // Device filter
    enableGraphCapture: true,          // Enable graph capture
    enableDynamicGraphFusion: true     // Enable dynamic graph fusion
  }
};
```

### Degradation Configuration (`config/degradation.js`)

```javascript
module.exports = {
  gracefulDegradation: {
    enableAutoFallback: true,          // Enable auto fallback
    fallbackTimeout: 5000,             // Fallback timeout (ms)
    maxRetries: 3,                     // Max retry attempts
    retryDelay: 1000,                  // Retry delay (ms)
    healthCheckInterval: 30000,        // Health check interval (ms)
    enableCircuitBreaker: true,        // Enable circuit breaker
    circuitBreakerThreshold: 5,        // Failures before opening
    circuitBreakerTimeout: 60000       // Circuit breaker timeout (ms)
  },
  
  features: {
    'amd-gaia-npu': {
      priority: 'high',                // Feature priority
      fallback: 'directml-gpu',        // Fallback feature
      healthCheck: true                // Enable health check
    },
    'directml-gpu': {
      priority: 'medium',
      fallback: 'cpu',
      healthCheck: true
    },
    'hierarchical-cache': {
      priority: 'low',
      fallback: 'memory-cache',
      healthCheck: true
    }
  }
};
```

### Monitoring Configuration (`config/monitoring.js`)

```javascript
module.exports = {
  performance: {
    enableDetailedMetrics: true,       // Enable detailed metrics
    enablePerformanceAlerts: true,     // Enable performance alerts
    monitoringInterval: 30000,         // Monitoring interval (ms)
    retentionPeriod: 86400000,         // Data retention period (ms)
    enableTrendAnalysis: true,         // Enable trend analysis
    trendWindowSize: 100               // Trend window size
  },
  
  alerts: {
    hitRate: 0.7,                      // Hit rate threshold
    latency: 1000,                     // Latency threshold (ms)
    memoryUsage: 0.9,                  // Memory usage threshold
    errorRate: 0.05                    // Error rate threshold
  },
  
  statistics: {
    enableCacheStats: true,            // Enable cache statistics
    enableHardwareStats: true,         // Enable hardware statistics
    enableProcessingStats: true,       // Enable processing statistics
    enableResourceStats: true         // Enable resource statistics
  }
};
```

## Environment Variables

### Core Settings

```bash
# Debug settings
DEBUG=glass-assistant:*
LOG_LEVEL=info                         # debug, info, warn, error

# Hardware settings
ENABLE_NPU=true
ENABLE_GPU=true
ENABLE_CPU=true
HARDWARE_DETECTION_TIMEOUT=10000

# Cache settings
CACHE_L1_SIZE=1000
CACHE_L2_SIZE_MB=10240
CACHE_L3_ENDPOINTS=http://localhost:8000/cache

# Processing settings
MAX_WORKERS=8
BATCH_SIZE=16
ENABLE_ASYNC_PROCESSING=true

# Resource settings
MEMORY_THRESHOLD=0.8
CPU_THRESHOLD=0.9
ENABLE_PREDICTIVE_ALLOCATION=true
```

### DirectML Settings

```bash
# DirectML configuration
DIRECTML_DEVICE_FILTER=npu
DIRECTML_ENABLE_GRAPH_CAPTURE=true
DIRECTML_ENABLE_DYNAMIC_FUSION=true

# ONNX Runtime settings
ONNX_OPTIMIZATION_LEVEL=all
ONNX_ENABLE_FP16=true
ONNX_CACHE_OPTIMIZED_MODELS=true
```

### Security Settings

```bash
# Encryption settings
CACHE_ENCRYPTION_ENABLED=true
CACHE_ENCRYPTION_KEY=your-encryption-key-here

# Network settings
NETWORK_TIMEOUT=5000
NETWORK_RETRIES=2
ENABLE_COMPRESSION=true
```

## Configuration Validation

### Validation Schema

The system validates configuration using JSON Schema:

```javascript
const configSchema = {
  type: 'object',
  properties: {
    hardware: {
      type: 'object',
      properties: {
        enableNPU: { type: 'boolean' },
        enableGPU: { type: 'boolean' },
        enableCPU: { type: 'boolean' },
        fallbackStrategy: { 
          type: 'string', 
          enum: ['performance', 'power', 'balanced'] 
        }
      },
      required: ['enableNPU', 'enableGPU', 'enableCPU']
    },
    cache: {
      type: 'object',
      properties: {
        l1: { type: 'object' },
        l2: { type: 'object' },
        l3: { type: 'object' }
      }
    }
  },
  required: ['hardware', 'cache']
};
```

### Configuration Loading

```javascript
const { loadConfiguration } = require('./src/common/utils/configLoader');

// Load and validate configuration
const config = await loadConfiguration({
  configPath: './config',
  validateSchema: true,
  enableEnvironmentOverrides: true
});
```

## Performance Tuning

### Memory Optimization

```javascript
// Optimize for memory-constrained environments
const memoryOptimizedConfig = {
  cache: {
    l1: {
      maxSize: 500,                    // Reduce cache size
      maxMemoryMB: 256                 // Reduce memory usage
    }
  },
  processing: {
    maxWorkers: 2,                     // Reduce worker count
    batchSize: 8                       // Reduce batch size
  },
  resources: {
    memoryThreshold: 0.7,              // Lower threshold
    enablePredictiveAllocation: false  // Disable prediction
  }
};
```

### Performance Optimization

```javascript
// Optimize for maximum performance
const performanceOptimizedConfig = {
  hardware: {
    fallbackStrategy: 'performance',
    maxConcurrentInferences: 20        // Increase concurrency
  },
  cache: {
    l1: {
      maxSize: 2000,                   // Increase cache size
      maxMemoryMB: 1024                // Increase memory
    }
  },
  processing: {
    maxWorkers: require('os').cpus().length * 2, // More workers
    batchSize: 32                      // Larger batches
  }
};
```

### Power Optimization

```javascript
// Optimize for power efficiency
const powerOptimizedConfig = {
  hardware: {
    fallbackStrategy: 'power',
    healthCheckInterval: 60000         // Less frequent checks
  },
  processing: {
    maxWorkers: Math.ceil(require('os').cpus().length / 2), // Fewer workers
    batchTimeout: 10000                // Longer batch timeout
  },
  resources: {
    cpuThreshold: 0.7,                 // Lower CPU threshold
    enableAutoScaling: true            // Enable auto-scaling
  }
};
```

## Troubleshooting Configuration

### Common Configuration Issues

1. **Invalid JSON**: Check syntax and structure
2. **Missing Required Fields**: Ensure all required fields are present
3. **Type Mismatches**: Verify data types match schema
4. **Resource Conflicts**: Check resource allocation limits

### Configuration Validation

```javascript
// Validate configuration
const { validateConfiguration } = require('./src/common/utils/configValidator');

try {
  const isValid = validateConfiguration(config);
  if (!isValid) {
    console.error('Configuration validation failed');
  }
} catch (error) {
  console.error('Configuration error:', error.message);
}
```

### Debug Configuration

```javascript
// Enable configuration debugging
process.env.DEBUG_CONFIG = 'true';
process.env.LOG_LEVEL = 'debug';

// Load configuration with debugging
const config = await loadConfiguration({
  debug: true,
  verbose: true
});
```

## Best Practices

1. **Use Environment Variables**: Override config with environment variables
2. **Validate Configuration**: Always validate before use
3. **Monitor Performance**: Track configuration impact on performance
4. **Document Changes**: Document configuration modifications
5. **Test Thoroughly**: Test configuration changes in development
6. **Backup Configurations**: Keep backup copies of working configurations

---

*For additional configuration options and advanced settings, refer to the source code documentation and inline comments.*
