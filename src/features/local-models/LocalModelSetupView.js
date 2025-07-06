import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class LocalModelSetupView extends LitElement {
    static styles = css`
        * {
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: default;
            user-select: none;
        }

        :host {
            display: block;
            width: 100%;
            min-height: 100vh;
            color: white;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
        }

        .setup-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            text-align: center;
            margin-bottom: 40px;
        }

        .header h1 {
            font-size: 32px;
            font-weight: 600;
            margin: 0 0 10px 0;
            background: linear-gradient(135deg, #4f46e5, #7c3aed);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .header p {
            font-size: 16px;
            color: rgba(255, 255, 255, 0.7);
            margin: 0;
        }

        .setup-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 40px;
        }

        @media (max-width: 768px) {
            .setup-grid {
                grid-template-columns: 1fr;
            }
        }

        .setup-card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 24px;
            backdrop-filter: blur(10px);
        }

        .card-header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
        }

        .card-icon {
            width: 24px;
            height: 24px;
            margin-right: 12px;
            opacity: 0.8;
        }

        .card-title {
            font-size: 18px;
            font-weight: 600;
            margin: 0;
        }

        .hardware-status {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .hardware-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
        }

        .hardware-name {
            font-weight: 500;
        }

        .status-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }

        .status-available {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
        }

        .status-unavailable {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }

        .status-unknown {
            background: rgba(156, 163, 175, 0.2);
            color: #9ca3af;
        }

        .model-browser {
            max-height: 400px;
            overflow-y: auto;
        }

        .model-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .model-info {
            flex: 1;
        }

        .model-name {
            font-weight: 500;
            margin-bottom: 4px;
        }

        .model-details {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.6);
        }

        .model-actions {
            display: flex;
            gap: 8px;
        }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-primary {
            background: #4f46e5;
            color: white;
        }

        .btn-primary:hover {
            background: #4338ca;
        }

        .btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.15);
        }

        .btn-danger {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .btn-danger:hover {
            background: rgba(239, 68, 68, 0.3);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .progress-bar {
            width: 100%;
            height: 4px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            overflow: hidden;
            margin-top: 8px;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4f46e5, #7c3aed);
            transition: width 0.3s ease;
        }

        .config-section {
            margin-bottom: 24px;
        }

        .config-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 12px;
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 6px;
            color: rgba(255, 255, 255, 0.9);
        }

        .form-input, .form-select {
            width: 100%;
            padding: 10px 12px;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: white;
            font-size: 14px;
        }

        .form-input:focus, .form-select:focus {
            outline: none;
            border-color: #4f46e5;
            box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
        }

        .form-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .form-checkbox input {
            width: 16px;
            height: 16px;
        }

        .tabs {
            display: flex;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: 24px;
        }

        .tab {
            padding: 12px 24px;
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.6);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s ease;
        }

        .tab.active {
            color: white;
            border-bottom-color: #4f46e5;
        }

        .tab:hover {
            color: rgba(255, 255, 255, 0.8);
        }

        .notification {
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .notification-success {
            background: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.3);
            color: #22c55e;
        }

        .notification-error {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #ef4444;
        }

        .notification-warning {
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.3);
            color: #f59e0b;
        }

        .loading-spinner {
            width: 20px;
            height: 20px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top: 2px solid #4f46e5;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .full-width-card {
            grid-column: 1 / -1;
        }

        .action-buttons {
            display: flex;
            gap: 12px;
            justify-content: center;
            margin-top: 32px;
        }
    `;

    static properties = {
        activeTab: { type: String },
        hardwareStatus: { type: Object },
        availableModels: { type: Array },
        installedModels: { type: Array },
        isLoading: { type: Boolean },
        downloadProgress: { type: Object },
        notifications: { type: Array },
        config: { type: Object },
        routeParams: { type: Object }
    };

    constructor() {
        super();
        this.activeTab = 'hardware';
        this.hardwareStatus = {
            npu: { available: false, status: 'unknown' },
            gpu: { available: false, status: 'unknown' },
            cpu: { available: true, status: 'available' }
        };
        this.availableModels = [];
        this.installedModels = [];
        this.isLoading = false;
        this.downloadProgress = {};
        this.notifications = [];
        this.routeParams = {};
        this.config = {
            enableNPU: true,
            enableGPU: true,
            enableCPU: true,
            modelStoragePath: '',
            maxCacheSize: '10GB',
            autoUpdates: false,
            performanceMonitoring: true
        };

        this.initializeSetup();
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        // Handle route parameter changes
        if (changedProperties.has('routeParams') && this.routeParams?.tab) {
            this.activeTab = this.routeParams.tab;
        }
    }

    async initializeSetup() {
        this.isLoading = true;
        try {
            await this.detectHardware();
            await this.loadAvailableModels();
            await this.loadInstalledModels();
            await this.loadConfiguration();
        } catch (error) {
            this.addNotification('error', 'Failed to initialize setup: ' + error.message);
        } finally {
            this.isLoading = false;
        }
    }

    async detectHardware() {
        try {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                const hardware = await ipcRenderer.invoke('detect-hardware-capabilities');
                this.hardwareStatus = hardware;
            } else {
                // Fallback for web environment
                this.hardwareStatus = {
                    npu: { available: false, status: 'unavailable', reason: 'Not supported in web' },
                    gpu: { available: false, status: 'unavailable', reason: 'Not supported in web' },
                    cpu: { available: true, status: 'available' }
                };
            }
            this.requestUpdate();
        } catch (error) {
            console.error('Hardware detection failed:', error);
            this.addNotification('error', 'Hardware detection failed');
        }
    }

    async loadAvailableModels() {
        try {
            // Mock data for now - in real implementation, this would fetch from Hugging Face API
            this.availableModels = [
                {
                    id: 'microsoft/DialoGPT-medium',
                    name: 'DialoGPT Medium',
                    size: '345MB',
                    type: 'conversational',
                    description: 'Medium-sized conversational AI model'
                },
                {
                    id: 'sentence-transformers/all-MiniLM-L6-v2',
                    name: 'All-MiniLM-L6-v2',
                    size: '90MB',
                    type: 'embedding',
                    description: 'Sentence embedding model'
                },
                {
                    id: 'microsoft/codebert-base',
                    name: 'CodeBERT Base',
                    size: '500MB',
                    type: 'code',
                    description: 'Code understanding model'
                }
            ];
            this.requestUpdate();
        } catch (error) {
            console.error('Failed to load available models:', error);
        }
    }

    async loadInstalledModels() {
        try {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                this.installedModels = await ipcRenderer.invoke('get-installed-models');
            } else {
                this.installedModels = [];
            }
            this.requestUpdate();
        } catch (error) {
            console.error('Failed to load installed models:', error);
        }
    }

    async loadConfiguration() {
        try {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                const config = await ipcRenderer.invoke('get-local-model-config');
                this.config = { ...this.config, ...config };
            }
            this.requestUpdate();
        } catch (error) {
            console.error('Failed to load configuration:', error);
        }
    }

    addNotification(type, message) {
        const notification = {
            id: Date.now(),
            type,
            message,
            timestamp: new Date()
        };
        this.notifications = [notification, ...this.notifications.slice(0, 4)];
        this.requestUpdate();

        // Auto-remove after 5 seconds
        setTimeout(() => {
            this.removeNotification(notification.id);
        }, 5000);
    }

    removeNotification(id) {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.requestUpdate();
    }

    async downloadModel(modelId) {
        try {
            this.downloadProgress[modelId] = { progress: 0, status: 'downloading' };
            this.requestUpdate();

            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                
                // Listen for progress updates
                ipcRenderer.on('model-download-progress', (event, data) => {
                    if (data.modelId === modelId) {
                        this.downloadProgress[modelId] = data;
                        this.requestUpdate();
                    }
                });

                await ipcRenderer.invoke('download-model', modelId);
                
                this.addNotification('success', `Model ${modelId} downloaded successfully`);
                await this.loadInstalledModels();
            }
        } catch (error) {
            this.addNotification('error', `Failed to download model: ${error.message}`);
        } finally {
            delete this.downloadProgress[modelId];
            this.requestUpdate();
        }
    }

    async removeModel(modelId) {
        try {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('remove-model', modelId);
                this.addNotification('success', `Model ${modelId} removed successfully`);
                await this.loadInstalledModels();
            }
        } catch (error) {
            this.addNotification('error', `Failed to remove model: ${error.message}`);
        }
    }

    async saveConfiguration() {
        try {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('save-local-model-config', this.config);
                this.addNotification('success', 'Configuration saved successfully');
            }
        } catch (error) {
            this.addNotification('error', `Failed to save configuration: ${error.message}`);
        }
    }

    handleConfigChange(key, value) {
        this.config = { ...this.config, [key]: value };
        this.requestUpdate();
    }

    render() {
        return html`
            <div class="setup-container">
                <div class="header">
                    <h1>Local AI Model Setup</h1>
                    <p>Configure and manage your local AI models with hardware acceleration</p>
                </div>

                ${this.notifications.map(notification => html`
                    <div class="notification notification-${notification.type}">
                        <span>${notification.message}</span>
                        <button @click=${() => this.removeNotification(notification.id)} style="margin-left: auto; background: none; border: none; color: inherit; cursor: pointer;">×</button>
                    </div>
                `)}

                <div class="tabs">
                    <button class="tab ${this.activeTab === 'hardware' ? 'active' : ''}" @click=${() => this.activeTab = 'hardware'}>
                        Hardware Status
                    </button>
                    <button class="tab ${this.activeTab === 'models' ? 'active' : ''}" @click=${() => this.activeTab = 'models'}>
                        Model Management
                    </button>
                    <button class="tab ${this.activeTab === 'config' ? 'active' : ''}" @click=${() => this.activeTab = 'config'}>
                        Configuration
                    </button>
                </div>

                ${this.renderTabContent()}

                <div class="action-buttons">
                    <button class="btn btn-secondary" @click=${this.handleBack}>
                        Back to Settings
                    </button>
                    <button class="btn btn-primary" @click=${this.saveConfiguration}>
                        Save Configuration
                    </button>
                </div>
            </div>
        `;
    }

    renderTabContent() {
        switch (this.activeTab) {
            case 'hardware':
                return this.renderHardwareTab();
            case 'models':
                return this.renderModelsTab();
            case 'config':
                return this.renderConfigTab();
            default:
                return html``;
        }
    }

    renderHardwareTab() {
        return html`
            <div class="setup-grid">
                <div class="setup-card">
                    <div class="card-header">
                        <div class="card-icon">🔧</div>
                        <h3 class="card-title">Hardware Detection</h3>
                    </div>
                    <div class="hardware-status">
                        <div class="hardware-item">
                            <span class="hardware-name">AMD Gaia NPU</span>
                            <span class="status-badge status-${this.hardwareStatus.npu?.status || 'unknown'}">
                                ${this.hardwareStatus.npu?.available ? 'Available' : 'Unavailable'}
                            </span>
                        </div>
                        <div class="hardware-item">
                            <span class="hardware-name">DirectML GPU</span>
                            <span class="status-badge status-${this.hardwareStatus.gpu?.status || 'unknown'}">
                                ${this.hardwareStatus.gpu?.available ? 'Available' : 'Unavailable'}
                            </span>
                        </div>
                        <div class="hardware-item">
                            <span class="hardware-name">CPU Processing</span>
                            <span class="status-badge status-${this.hardwareStatus.cpu?.status || 'available'}">
                                Available
                            </span>
                        </div>
                    </div>
                    <button class="btn btn-secondary" @click=${this.detectHardware} style="margin-top: 16px; width: 100%;">
                        Refresh Hardware Detection
                    </button>
                </div>

                <div class="setup-card">
                    <div class="card-header">
                        <div class="card-icon">⚡</div>
                        <h3 class="card-title">Performance Recommendations</h3>
                    </div>
                    <div style="color: rgba(255, 255, 255, 0.7); line-height: 1.5;">
                        ${this.hardwareStatus.npu?.available 
                            ? html`<p>✅ NPU acceleration available - expect up to 10x performance improvement</p>`
                            : html`<p>⚠️ NPU not available - consider upgrading hardware for optimal performance</p>`
                        }
                        ${this.hardwareStatus.gpu?.available 
                            ? html`<p>✅ GPU acceleration available - good fallback option</p>`
                            : html`<p>ℹ️ GPU acceleration not available - CPU processing will be used</p>`
                        }
                        <p>💡 Recommended: Enable hierarchical caching for better performance</p>
                    </div>
                </div>
            </div>
        `;
    }

    renderModelsTab() {
        return html`
            <div class="setup-grid">
                <div class="setup-card">
                    <div class="card-header">
                        <div class="card-icon">📦</div>
                        <h3 class="card-title">Available Models</h3>
                    </div>
                    <div class="model-browser">
                        ${this.availableModels.map(model => html`
                            <div class="model-item">
                                <div class="model-info">
                                    <div class="model-name">${model.name}</div>
                                    <div class="model-details">${model.size} • ${model.type} • ${model.description}</div>
                                    ${this.downloadProgress[model.id] ? html`
                                        <div class="progress-bar">
                                            <div class="progress-fill" style="width: ${this.downloadProgress[model.id].progress}%"></div>
                                        </div>
                                    ` : ''}
                                </div>
                                <div class="model-actions">
                                    <button 
                                        class="btn btn-primary" 
                                        @click=${() => this.downloadModel(model.id)}
                                        ?disabled=${this.downloadProgress[model.id] || this.installedModels.some(m => m.id === model.id)}
                                    >
                                        ${this.downloadProgress[model.id] ? 'Downloading...' : 
                                          this.installedModels.some(m => m.id === model.id) ? 'Installed' : 'Download'}
                                    </button>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>

                <div class="setup-card">
                    <div class="card-header">
                        <div class="card-icon">💾</div>
                        <h3 class="card-title">Installed Models</h3>
                    </div>
                    <div class="model-browser">
                        ${this.installedModels.length === 0 ? html`
                            <p style="color: rgba(255, 255, 255, 0.6); text-align: center; padding: 20px;">
                                No models installed yet. Download models from the Available Models section.
                            </p>
                        ` : this.installedModels.map(model => html`
                            <div class="model-item">
                                <div class="model-info">
                                    <div class="model-name">${model.name}</div>
                                    <div class="model-details">${model.size} • Installed: ${new Date(model.installedAt).toLocaleDateString()}</div>
                                </div>
                                <div class="model-actions">
                                    <button class="btn btn-danger" @click=${() => this.removeModel(model.id)}>
                                        Remove
                                    </button>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>
            </div>
        `;
    }

    renderConfigTab() {
        return html`
            <div class="setup-card full-width-card">
                <div class="card-header">
                    <div class="card-icon">⚙️</div>
                    <h3 class="card-title">Configuration Settings</h3>
                </div>

                <div class="config-section">
                    <h4 class="config-title">Hardware Acceleration</h4>
                    <div class="form-group">
                        <label class="form-checkbox">
                            <input 
                                type="checkbox" 
                                ?checked=${this.config.enableNPU}
                                @change=${(e) => this.handleConfigChange('enableNPU', e.target.checked)}
                            >
                            <span>Enable AMD Gaia NPU acceleration</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="form-checkbox">
                            <input 
                                type="checkbox" 
                                ?checked=${this.config.enableGPU}
                                @change=${(e) => this.handleConfigChange('enableGPU', e.target.checked)}
                            >
                            <span>Enable GPU acceleration (DirectML)</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="form-checkbox">
                            <input 
                                type="checkbox" 
                                ?checked=${this.config.enableCPU}
                                @change=${(e) => this.handleConfigChange('enableCPU', e.target.checked)}
                            >
                            <span>Enable CPU fallback</span>
                        </label>
                    </div>
                </div>

                <div class="config-section">
                    <h4 class="config-title">Storage Settings</h4>
                    <div class="form-group">
                        <label class="form-label">Model Storage Path</label>
                        <input 
                            type="text" 
                            class="form-input"
                            .value=${this.config.modelStoragePath}
                            @input=${(e) => this.handleConfigChange('modelStoragePath', e.target.value)}
                            placeholder="~/.glass-assistant/models"
                        >
                    </div>
                    <div class="form-group">
                        <label class="form-label">Maximum Cache Size</label>
                        <select 
                            class="form-select"
                            .value=${this.config.maxCacheSize}
                            @change=${(e) => this.handleConfigChange('maxCacheSize', e.target.value)}
                        >
                            <option value="5GB">5 GB</option>
                            <option value="10GB">10 GB</option>
                            <option value="20GB">20 GB</option>
                            <option value="50GB">50 GB</option>
                        </select>
                    </div>
                </div>

                <div class="config-section">
                    <h4 class="config-title">Advanced Options</h4>
                    <div class="form-group">
                        <label class="form-checkbox">
                            <input 
                                type="checkbox" 
                                ?checked=${this.config.autoUpdates}
                                @change=${(e) => this.handleConfigChange('autoUpdates', e.target.checked)}
                            >
                            <span>Enable automatic model updates</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="form-checkbox">
                            <input 
                                type="checkbox" 
                                ?checked=${this.config.performanceMonitoring}
                                @change=${(e) => this.handleConfigChange('performanceMonitoring', e.target.checked)}
                            >
                            <span>Enable performance monitoring</span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    handleBack() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('navigate-to-view', 'customize');
        } else {
            // For web environment
            window.history.back();
        }
    }
}

customElements.define('local-model-setup-view', LocalModelSetupView);
