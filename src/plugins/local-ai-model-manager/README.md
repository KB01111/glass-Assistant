# Local AI Model Manager Plugin

A comprehensive local AI model management system for Glass Assistant that integrates with Hugging Face Hub and provides seamless AMD Gaia compatibility with NPU acceleration.

## Features

### 🤗 Hugging Face Integration
- Browse and search models from Hugging Face Hub
- Filter by task type, model size, and compatibility
- Download models with progress tracking
- Automatic model updates and version management

### 💾 Local Model Storage
- Secure local storage with integrity checking
- Intelligent caching with size limits
- Model versioning and metadata management
- Automatic cleanup of unused models

### 🚀 AMD Gaia Integration
- Seamless integration with existing AMD Gaia plugin
- Automatic NPU/GPU/CPU device detection
- Model format conversion (PyTorch → ONNX)
- NPU-optimized model variants

### 📊 Performance Monitoring
- Real-time inference performance tracking
- Memory usage and device utilization metrics
- Model performance comparisons
- Optimization recommendations

### 🎨 User Interface
- Model browser with search and filtering
- Local model management interface
- Model selection in Ask/Listen features
- Performance dashboards and analytics

## Installation

The plugin is automatically available in Glass Assistant. To enable:

1. Open Glass Assistant Settings
2. Navigate to Plugins section
3. Enable "Local AI Model Manager"
4. Configure storage path and preferences

## Configuration

### Default Settings

```json
{
  "enabled": true,
  "autoStart": true,
  "modelStoragePath": "~/.glass-assistant/models",
  "maxModelCacheSize": "10GB",
  "preferredInferenceDevice": "auto",
  "enableNPUAcceleration": true,
  "huggingFaceApiEnabled": true,
  "autoModelUpdates": false,
  "performanceMonitoring": true
}
```

### Configuration Options

- **modelStoragePath**: Directory for storing downloaded models
- **maxModelCacheSize**: Maximum disk space for model cache
- **preferredInferenceDevice**: Device preference (auto/npu/gpu/cpu)
- **enableNPUAcceleration**: Enable AMD NPU acceleration when available
- **huggingFaceApiEnabled**: Enable Hugging Face Hub integration
- **autoModelUpdates**: Automatically update models to latest versions
- **performanceMonitoring**: Track and analyze model performance

## Usage

### Browsing Models

```javascript
// Get plugin instance
const modelManager = pluginManager.getPlugin('local-ai-model-manager');

// Browse models with filters
const models = await modelManager.browseHuggingFaceModels({
  task: 'text-generation',
  library: 'transformers',
  minDownloads: 1000,
  maxModelSize: '2GB'
});
```

### Downloading Models

```javascript
// Download a model with progress tracking
const result = await modelManager.downloadModel('microsoft/DialoGPT-medium', {
  onProgress: (progress) => {
    console.log(`Download progress: ${progress.progress}%`);
  }
});
```

### Using Local Models

```javascript
// Get available local models
const localModels = await modelManager.getLocalModels();

// Use local model for inference
const response = await glassAssistant.ask("Hello, how are you?", {
  useLocalModel: true,
  modelId: 'microsoft/DialoGPT-medium'
});
```

### Performance Monitoring

```javascript
// Get performance metrics
const metrics = await modelManager.getPerformanceMetrics('microsoft/DialoGPT-medium');

console.log(`Average inference time: ${metrics.averageInferenceTime}ms`);
console.log(`Tokens per second: ${metrics.averageTokensPerSecond}`);
```

## API Reference

### Model Management

- `browseHuggingFaceModels(filters)` - Browse Hugging Face models
- `downloadModel(modelId, options)` - Download a model
- `getLocalModels()` - Get list of installed models
- `deleteModel(modelId)` - Delete a local model
- `getModelInfo(modelId)` - Get detailed model information
- `updateModel(modelId)` - Update model to latest version

### Model Conversion

- `convertModel(modelId, targetFormat, options)` - Convert model format
- `getConversionProgress(modelId)` - Get conversion progress
- `isAMDGaiaCompatible(format)` - Check AMD Gaia compatibility

### Performance Monitoring

- `getMetrics(modelId, options)` - Get performance metrics
- `compareModels(modelIds)` - Compare model performance
- `getSystemMetrics()` - Get system performance metrics

## AMD Gaia Integration

The plugin seamlessly integrates with AMD Gaia for hardware-accelerated inference:

### NPU Acceleration
- Automatic NPU detection and configuration
- Model optimization for NPU architecture
- Fallback to GPU/CPU when NPU unavailable

### Model Compatibility
- Automatic format conversion (PyTorch → ONNX)
- NPU-optimized model variants
- Compatibility validation before download

### Performance Optimization
- Device-specific model optimization
- Precision optimization (FP32 → FP16)
- Batch size optimization for throughput

## Supported Model Formats

- **PyTorch** (.bin, .pt, .pth) - Converted to ONNX for AMD Gaia
- **ONNX** (.onnx) - Native AMD Gaia support
- **SafeTensors** (.safetensors) - Converted to ONNX
- **Transformers** - Hugging Face Transformers format

## Supported Tasks

- Text Generation
- Text Classification
- Token Classification
- Question Answering
- Summarization
- Translation
- Embedding Generation

## Storage Management

### Automatic Cleanup
- LRU-based model eviction when storage limit reached
- Configurable cache size limits
- Integrity checking and corruption detection

### Version Management
- Multiple model versions supported
- Automatic update notifications
- Rollback to previous versions

## Security

### Model Validation
- Checksum verification for downloaded models
- Malware scanning integration
- Sandboxed model execution

### Privacy
- Local-only model storage
- No model usage data sent to external services
- Encrypted model metadata storage

## Troubleshooting

### Common Issues

**Model Download Fails**
- Check internet connection
- Verify Hugging Face model exists
- Check available disk space

**NPU Not Detected**
- Ensure AMD NPU drivers installed
- Check NPU compatibility with model
- Verify NPU is not in use by other applications

**Poor Performance**
- Check device selection (NPU > GPU > CPU)
- Consider model quantization
- Monitor system resource usage

### Debug Mode

Enable debug logging in plugin configuration:

```json
{
  "debugLogging": true,
  "logLevel": "debug"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

Apache-2.0 License - see LICENSE file for details.

## Support

- GitHub Issues: Report bugs and feature requests
- Documentation: Comprehensive guides and API reference
- Community: Join our Discord for support and discussions
