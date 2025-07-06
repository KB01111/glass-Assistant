import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import '../local-models/ModelManagerComponent.js';

export class LocalModelSettingsPanel extends LitElement {
    static styles = css`
        * {
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: default;
            user-select: none;
        }

        :host {
            display: block;
            width: 100%;
            color: white;
        }

        .settings-panel {
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
        }

        .panel-header {
            margin-bottom: 24px;
        }

        .panel-title {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 8px 0;
            background: linear-gradient(135deg, #4f46e5, #7c3aed);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .panel-description {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
            margin: 0;
            line-height: 1.5;
        }

        .settings-section {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin: 0 0 16px 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .section-icon {
            font-size: 18px;
        }

        .quick-setup-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 20px;
        }

        .quick-setup-card {
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 16px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .quick-setup-card:hover {
            background: rgba(0, 0, 0, 0.3);
            border-color: rgba(255, 255, 255, 0.2);
            transform: translateY(-2px);
        }

        .card-icon {
            font-size: 32px;
            margin-bottom: 8px;
        }

        .card-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .card-description {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.6);
            line-height: 1.3;
        }

        .status-overview {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
        }

        .status-item {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 6px;
            padding: 12px;
            text-align: center;
        }

        .status-value {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .status-label {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.6);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status-available {
            color: #22c55e;
        }

        .status-unavailable {
            color: #ef4444;
        }

        .status-partial {
            color: #f59e0b;
        }

        .action-buttons {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }

        .btn {
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
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

        .feature-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .feature-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 0;
            font-size: 14px;
        }

        .feature-icon {
            color: #22c55e;
        }

        .warning-banner {
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.3);
            border-radius: 6px;
            padding: 12px 16px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .warning-icon {
            color: #f59e0b;
            font-size: 18px;
        }

        .warning-text {
            font-size: 13px;
            color: #f59e0b;
            line-height: 1.4;
        }
    `;

    static properties = {
        hardwareStatus: { type: Object },
        modelStats: { type: Object },
        isLoading: { type: Boolean }
    };

    constructor() {
        super();
        this.hardwareStatus = {
            npu: false,
            gpu: false,
            cpu: true
        };
        this.modelStats = {
            installed: 0,
            active: 0,
            totalSize: '0 MB'
        };
        this.isLoading = false;

        this.loadData();
    }

    async loadData() {
        this.isLoading = true;
        try {
            await Promise.all([
                this.loadHardwareStatus(),
                this.loadModelStats()
            ]);
        } catch (error) {
            console.error('Failed to load local model settings data:', error);
        } finally {
            this.isLoading = false;
        }
    }

    async loadHardwareStatus() {
        try {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                const hardware = await ipcRenderer.invoke('detect-hardware-capabilities');
                this.hardwareStatus = {
                    npu: hardware.npu?.available || false,
                    gpu: hardware.gpu?.available || false,
                    cpu: hardware.cpu?.available || true
                };
            }
            this.requestUpdate();
        } catch (error) {
            console.error('Failed to load hardware status:', error);
        }
    }

    async loadModelStats() {
        try {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                const models = await ipcRenderer.invoke('get-installed-models') || [];
                const activeModel = await ipcRenderer.invoke('get-active-model');
                
                this.modelStats = {
                    installed: models.length,
                    active: activeModel ? 1 : 0,
                    totalSize: this.calculateTotalSize(models)
                };
            }
            this.requestUpdate();
        } catch (error) {
            console.error('Failed to load model stats:', error);
        }
    }

    calculateTotalSize(models) {
        // Simple calculation - in real implementation would parse actual sizes
        const totalMB = models.length * 100; // Assume 100MB per model
        if (totalMB < 1024) {
            return `${totalMB} MB`;
        } else {
            return `${(totalMB / 1024).toFixed(1)} GB`;
        }
    }

    openFullSetup() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('navigate-to-view', 'local-model-setup');
        } else {
            window.location.href = '/settings/ai-models';
        }
    }

    openModelBrowser() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('open-model-browser');
        } else {
            window.open('https://huggingface.co/models', '_blank');
        }
    }

    openHardwareSetup() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('navigate-to-view', 'local-model-setup', { tab: 'hardware' });
        } else {
            window.location.href = '/settings/ai-models?tab=hardware';
        }
    }

    openConfiguration() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('navigate-to-view', 'local-model-setup', { tab: 'config' });
        } else {
            window.location.href = '/settings/ai-models?tab=config';
        }
    }

    render() {
        const hasNPU = this.hardwareStatus.npu;
        const hasGPU = this.hardwareStatus.gpu;
        const hasModels = this.modelStats.installed > 0;

        return html`
            <div class="settings-panel">
                <div class="panel-header">
                    <h2 class="panel-title">Local AI Models</h2>
                    <p class="panel-description">
                        Configure and manage local AI models with hardware acceleration for improved performance and privacy.
                    </p>
                </div>

                ${!hasNPU && !hasGPU ? html`
                    <div class="warning-banner">
                        <div class="warning-icon">⚠️</div>
                        <div class="warning-text">
                            No hardware acceleration detected. Local models will run on CPU only, which may be slower. 
                            Consider upgrading to AMD Gaia NPU or DirectML-compatible GPU for optimal performance.
                        </div>
                    </div>
                ` : ''}

                <div class="settings-section">
                    <h3 class="section-title">
                        <span class="section-icon">📊</span>
                        Status Overview
                    </h3>
                    
                    <div class="status-overview">
                        <div class="status-item">
                            <div class="status-value ${hasNPU ? 'status-available' : 'status-unavailable'}">
                                ${hasNPU ? '✓' : '✗'}
                            </div>
                            <div class="status-label">NPU Acceleration</div>
                        </div>
                        <div class="status-item">
                            <div class="status-value ${hasGPU ? 'status-available' : 'status-unavailable'}">
                                ${hasGPU ? '✓' : '✗'}
                            </div>
                            <div class="status-label">GPU Acceleration</div>
                        </div>
                        <div class="status-item">
                            <div class="status-value status-available">${this.modelStats.installed}</div>
                            <div class="status-label">Models Installed</div>
                        </div>
                        <div class="status-item">
                            <div class="status-value ${this.modelStats.active > 0 ? 'status-available' : 'status-unavailable'}">
                                ${this.modelStats.active}
                            </div>
                            <div class="status-label">Active Models</div>
                        </div>
                        <div class="status-item">
                            <div class="status-value">${this.modelStats.totalSize}</div>
                            <div class="status-label">Storage Used</div>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3 class="section-title">
                        <span class="section-icon">🚀</span>
                        Quick Setup
                    </h3>
                    
                    <div class="quick-setup-grid">
                        <div class="quick-setup-card" @click=${this.openFullSetup}>
                            <div class="card-icon">🔧</div>
                            <div class="card-title">Full Setup</div>
                            <div class="card-description">Complete model management interface</div>
                        </div>
                        
                        <div class="quick-setup-card" @click=${this.openModelBrowser}>
                            <div class="card-icon">📦</div>
                            <div class="card-title">Browse Models</div>
                            <div class="card-description">Download models from Hugging Face</div>
                        </div>
                        
                        <div class="quick-setup-card" @click=${this.openHardwareSetup}>
                            <div class="card-icon">⚡</div>
                            <div class="card-title">Hardware Setup</div>
                            <div class="card-description">Configure acceleration settings</div>
                        </div>
                        
                        <div class="quick-setup-card" @click=${this.openConfiguration}>
                            <div class="card-icon">⚙️</div>
                            <div class="card-title">Configuration</div>
                            <div class="card-description">Advanced settings and options</div>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3 class="section-title">
                        <span class="section-icon">🤖</span>
                        Model Management
                    </h3>
                    
                    <model-manager-component></model-manager-component>
                </div>

                <div class="settings-section">
                    <h3 class="section-title">
                        <span class="section-icon">✨</span>
                        Features
                    </h3>
                    
                    <ul class="feature-list">
                        <li class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>AMD Gaia NPU acceleration for up to 10x performance</span>
                        </li>
                        <li class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>DirectML GPU acceleration with automatic fallback</span>
                        </li>
                        <li class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>Hierarchical caching for improved response times</span>
                        </li>
                        <li class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>Batch processing for efficient document handling</span>
                        </li>
                        <li class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>Privacy-focused local processing</span>
                        </li>
                        <li class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>Automatic model optimization and quantization</span>
                        </li>
                    </ul>
                </div>

                <div class="action-buttons">
                    <button class="btn btn-primary" @click=${this.openFullSetup}>
                        <span>🔧</span>
                        <span>Open Full Setup</span>
                    </button>
                    <button class="btn btn-secondary" @click=${this.loadData}>
                        <span>🔄</span>
                        <span>Refresh Status</span>
                    </button>
                </div>
            </div>
        `;
    }
}

customElements.define('local-model-settings-panel', LocalModelSettingsPanel);
