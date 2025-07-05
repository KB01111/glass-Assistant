# Glass Assistant Plugin Development Guide

## Overview

The Glass Assistant Plugin System provides a comprehensive framework for extending the functionality of Glass Assistant through third-party plugins. This guide covers everything you need to know to develop, test, and distribute plugins.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Plugin Architecture](#plugin-architecture)
3. [Plugin API Reference](#plugin-api-reference)
4. [Extension Points](#extension-points)
5. [Security & Permissions](#security--permissions)
6. [Development Workflow](#development-workflow)
7. [Testing & Validation](#testing--validation)
8. [Distribution](#distribution)
9. [Best Practices](#best-practices)
10. [Examples](#examples)

## Getting Started

### Prerequisites

-   Node.js 16.0.0 or higher
-   Glass Assistant 1.0.0 or higher
-   Basic knowledge of JavaScript/TypeScript
-   Understanding of Electron applications (helpful but not required)

### Creating Your First Plugin

1. **Use the Plugin Template**

    ```bash
    # Clone the basic plugin template
    cp -r templates/plugin-basic my-awesome-plugin
    cd my-awesome-plugin
    ```

2. **Configure Plugin Manifest**
   Edit `plugin.json` with your plugin details:

    ```json
    {
        "id": "my-awesome-plugin",
        "name": "My Awesome Plugin",
        "version": "1.0.0",
        "description": "An awesome plugin that does amazing things",
        "author": {
            "name": "Your Name",
            "email": "your.email@example.com"
        },
        "permissions": ["ai:access", "notifications:show"],
        "extensionPoints": ["ai:pre-process"]
    }
    ```

3. **Implement Plugin Logic**
   Edit `index.js`:

    ```javascript
    const { BasePlugin } = require('glass-assistant/plugin-api');

    class MyAwesomePlugin extends BasePlugin {
        async initialize() {
            await super.initialize();

            // Register AI middleware
            this.api.registerAIMiddleware('pre-process', this.enhancePrompt.bind(this));

            this.logger.info('My Awesome Plugin initialized!');
        }

        async enhancePrompt(context) {
            // Add custom enhancement to AI prompts
            context.prompt = `Enhanced: ${context.prompt}`;
            return context;
        }
    }

    module.exports = MyAwesomePlugin;
    ```

## Plugin Architecture

### Core Components

#### 1. Plugin Manager

-   **Purpose**: Central coordinator for all plugin operations
-   **Responsibilities**: Loading, unloading, registry management
-   **Location**: `src/common/services/pluginManager.js`

#### 2. Plugin API

-   **Purpose**: Provides controlled access to Glass Assistant functionality
-   **Responsibilities**: Permission enforcement, feature integration
-   **Location**: `src/common/services/pluginAPI.js`

#### 3. Security Manager

-   **Purpose**: Ensures plugin safety and security
-   **Responsibilities**: Code validation, sandboxing, resource limits
-   **Location**: `src/common/services/pluginSecurity.js`

#### 4. Integration Manager

-   **Purpose**: Handles plugin integration with core features
-   **Responsibilities**: Extension point management, event routing
-   **Location**: `src/common/services/pluginIntegration.js`

### Plugin Lifecycle

The plugin lifecycle follows these stages:

1. **Discovery** - Plugin is found in the plugins directory
2. **Validation** - Security and structure validation
3. **Loading** - Plugin code is loaded into memory
4. **Initialization** - Plugin's initialize() method is called
5. **Active** - Plugin is running and handling events
6. **Cleanup** - Plugin's cleanup() method is called
7. **Unloading** - Plugin is removed from memory

## Plugin API Reference

### Core API Methods

#### Plugin Initialization

```javascript
class MyPlugin extends BasePlugin {
    async initialize() {
        // Called when plugin is loaded
        await super.initialize();
        // Your initialization code here
    }

    async cleanup() {
        // Called when plugin is unloaded
        await super.cleanup();
        // Your cleanup code here
    }
}
```

#### AI Integration

```javascript
// Register AI middleware
this.api.registerAIMiddleware('pre-process', async context => {
    // Modify AI request before processing
    context.prompt = enhancePrompt(context.prompt);
    return context;
});

// Access AI services
const aiService = this.api.getAIService();
const response = await aiService.generateText('Hello, world!');
```

#### Feature Extensions

```javascript
// Extend the Ask feature
this.api.registerFeatureExtension('ask', 'before-send', async context => {
    // Modify ask request before sending
    context.options.temperature = 0.7;
    return context;
});

// Extend the Listen feature
this.api.registerFeatureExtension('listen', 'transcript-process', async context => {
    // Process audio transcript
    context.transcript = processTranscript(context.transcript);
    return context;
});
```

#### UI Components

```javascript
// Add UI component
this.api.addUIComponent('sidebar:right', {
    type: 'button',
    label: 'My Plugin',
    icon: 'plugin-icon',
    onClick: () => {
        this.api.showNotification('My Plugin', 'Button clicked!');
    },
});
```

#### Data Storage

```javascript
// Plugin-specific storage
const storage = this.api.getStorage();

// Store data
await storage.set('user-preference', { theme: 'dark' });

// Retrieve data
const preference = await storage.get('user-preference');

// Delete data
await storage.delete('user-preference');
```

#### IPC Communication

```javascript
// Register IPC handler
this.api.registerIpcHandler('my-plugin-action', async (event, data) => {
    // Handle IPC request from renderer
    return { success: true, result: processData(data) };
});

// Send to renderer
this.api.sendToRenderer('my-plugin-update', { status: 'active' });
```

## Extension Points

### AI Pipeline Extensions

#### Pre-Process

-   **When**: Before AI request is sent
-   **Use Case**: Prompt enhancement, context injection
-   **Context**: `{ prompt, options, metadata }`

#### Post-Process

-   **When**: After AI response is received
-   **Use Case**: Response filtering, formatting
-   **Context**: `{ prompt, response, options }`

#### Transform

-   **When**: During response processing
-   **Use Case**: Content transformation, translation
-   **Context**: `{ content, format, options }`

### Feature Extensions

#### Ask Feature

-   **before-send**: Modify request before sending to AI
-   **after-response**: Process AI response before display

#### Listen Feature

-   **audio-process**: Process raw audio data
-   **transcript-process**: Process speech-to-text transcript

#### Customize Feature

-   **settings-panel**: Add custom settings UI

### UI Extensions

#### Available Locations

-   `header:menu` - Header menu items
-   `sidebar:left` - Left sidebar components
-   `sidebar:right` - Right sidebar components
-   `footer:status` - Footer status indicators
-   `modal:overlay` - Modal overlays

## Security & Permissions

### Permission System

Plugins must declare required permissions in their manifest:

```json
{
    "permissions": [
        "ai:access", // Access AI services
        "ai:middleware", // Register AI middleware
        "features:extend", // Extend core features
        "ui:modify", // Add UI components
        "storage:access", // Access plugin storage
        "notifications:show", // Show notifications
        "ipc:register", // Register IPC handlers
        "plugins:communicate" // Communicate with other plugins
    ]
}
```

### Security Measures

#### Code Validation

-   Static analysis for dangerous patterns
-   Dependency scanning
-   File integrity checks

#### Sandboxing

-   VM-based execution environment
-   Restricted module access
-   Resource limits (memory, CPU, network)

#### Permission Enforcement

-   Runtime permission checks
-   API access control
-   Feature-based restrictions

## Development Workflow

### 1. Setup Development Environment

```bash
# Clone Glass Assistant
git clone https://github.com/your-org/glass-assistant.git
cd glass-assistant

# Install dependencies
npm install

# Create plugin directory
mkdir -p plugins/my-plugin
cd plugins/my-plugin
```

### 2. Create Plugin Structure

```
my-plugin/
├── plugin.json          # Plugin manifest
├── index.js            # Main plugin file
├── lib/               # Plugin libraries
├── assets/            # Static assets
├── test/              # Test files
├── README.md          # Plugin documentation
└── LICENSE            # License file
```

### 3. Development Commands

```bash
# Start Glass Assistant in development mode
npm run dev

# Run plugin tests
npm run test:plugins

# Validate plugin
npm run validate:plugin my-plugin

# Package plugin
npm run package:plugin my-plugin
```

### 4. Hot Reload

During development, plugins support hot reload:

```javascript
// Enable hot reload in development
if (process.env.NODE_ENV === 'development') {
    this.api.enableHotReload();
}
```

## Testing & Validation

### Plugin Testing Framework

Create tests in the `test/` directory:

```javascript
// test/plugin.test.js
const { PluginTester } = require('glass-assistant/testing');
const MyPlugin = require('../index.js');

describe('MyPlugin', () => {
    let tester;
    let plugin;

    beforeEach(async () => {
        tester = new PluginTester();
        plugin = await tester.loadPlugin(MyPlugin, {
            id: 'test-plugin',
            permissions: ['ai:access', 'notifications:show'],
        });
    });

    afterEach(async () => {
        await tester.cleanup();
    });

    test('should initialize successfully', async () => {
        expect(plugin.isActive).toBe(true);
    });

    test('should enhance prompts', async () => {
        const context = { prompt: 'Hello' };
        const result = await plugin.enhancePrompt(context);
        expect(result.prompt).toBe('Enhanced: Hello');
    });
});
```

### Validation Tools

```bash
# Validate plugin manifest
npm run validate:manifest my-plugin

# Security scan
npm run security:scan my-plugin

# Performance test
npm run perf:test my-plugin
```

## Distribution

### Plugin Packaging

```bash
# Create plugin package
npm run package my-plugin

# This creates: my-plugin-1.0.0.zip
```

### Marketplace Submission

1. **Prepare Package**

    - Ensure all tests pass
    - Complete security validation
    - Include comprehensive documentation

2. **Submit to Marketplace**

    ```bash
    npm run marketplace:submit my-plugin-1.0.0.zip
    ```

3. **Review Process**
    - Automated security scanning
    - Manual code review
    - Functionality testing
    - Documentation review

## Best Practices

### Code Quality

-   Use TypeScript for better type safety
-   Follow ESLint configuration
-   Write comprehensive tests
-   Document all public APIs

### Performance

-   Minimize initialization time
-   Use lazy loading for heavy operations
-   Implement proper cleanup
-   Monitor resource usage

### Security

-   Request minimal permissions
-   Validate all inputs
-   Use secure communication
-   Follow OWASP guidelines

### User Experience

-   Provide clear error messages
-   Implement graceful degradation
-   Support accessibility features
-   Follow UI/UX guidelines

## Examples

### AMD Gaia Plugin Integration

```javascript
const { BasePlugin } = require('glass-assistant/plugin-api');

class AMDGaiaPlugin extends BasePlugin {
    async initialize() {
        await super.initialize();

        // Initialize AMD Gaia client
        this.gaiaClient = await this.initializeGaiaClient();

        // Register as AI provider
        const integration = this.api.pluginIntegration.createAMDGaiaIntegration();
        integration.registerAIProvider(this.id, this.gaiaClient);

        this.logger.info('AMD Gaia Plugin initialized');
    }

    async initializeGaiaClient() {
        const config = this.api.getConfig();
        return new GaiaClient({
            modelPath: config.modelPath,
            deviceType: config.deviceType || 'gpu',
        });
    }
}

module.exports = AMDGaiaPlugin;
```

### LLMware Plugin Integration

```javascript
const { BasePlugin } = require('glass-assistant/plugin-api');

class LLMwarePlugin extends BasePlugin {
    async initialize() {
        await super.initialize();

        // Initialize LLMware client
        this.llmwareClient = await this.initializeLLMwareClient();

        // Register document processor
        const integration = this.api.pluginIntegration.createLLMwareIntegration();
        integration.registerDocumentProcessor(this.id, this.llmwareClient);
        integration.registerRAGProvider(this.id, this.llmwareClient);

        this.logger.info('LLMware Plugin initialized');
    }

    async initializeLLMwareClient() {
        const config = this.api.getConfig();
        return new LLMwareClient({
            apiKey: config.apiKey,
            endpoint: config.endpoint,
        });
    }
}

module.exports = LLMwarePlugin;
```

### Custom UI Plugin

```javascript
const { BasePlugin } = require('glass-assistant/plugin-api');

class CustomUIPlugin extends BasePlugin {
    async initialize() {
        await super.initialize();

        // Add custom sidebar component
        this.api.addUIComponent('sidebar:right', {
            type: 'panel',
            title: 'Custom Tools',
            content: this.createCustomPanel(),
            collapsible: true,
        });

        // Register IPC handlers for UI interactions
        this.api.registerIpcHandler('custom-action', this.handleCustomAction.bind(this));
    }

    createCustomPanel() {
        return `
      <div class="custom-panel">
        <button onclick="window.electronAPI.invoke('plugin:${this.id}:custom-action', 'test')">
          Test Action
        </button>
      </div>
    `;
    }

    async handleCustomAction(event, data) {
        this.logger.info('Custom action triggered:', data);
        this.api.showNotification('Custom Plugin', `Action: ${data}`);
        return { success: true };
    }
}

module.exports = CustomUIPlugin;
```

---

For more examples and advanced usage, see the [Plugin Examples Repository](https://github.com/glass-assistant/plugin-examples).
