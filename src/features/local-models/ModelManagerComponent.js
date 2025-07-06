import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class ModelManagerComponent extends LitElement {
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

        .model-manager {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
        }

        .manager-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .manager-title {
            font-size: 16px;
            font-weight: 600;
            margin: 0;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }

        .status-active {
            background: #22c55e;
        }

        .status-inactive {
            background: #ef4444;
        }

        .status-loading {
            background: #f59e0b;
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .quick-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 16px;
        }

        .action-btn {
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: white;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .action-btn:hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.3);
        }

        .action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .action-btn.primary {
            background: rgba(79, 70, 229, 0.3);
            border-color: rgba(79, 70, 229, 0.5);
        }

        .action-btn.primary:hover {
            background: rgba(79, 70, 229, 0.4);
        }

        .model-list {
            max-height: 200px;
            overflow-y: auto;
        }

        .model-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .model-item:last-child {
            border-bottom: none;
        }

        .model-info {
            flex: 1;
        }

        .model-name {
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 2px;
        }

        .model-details {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.6);
        }

        .model-actions {
            display: flex;
            gap: 4px;
        }

        .model-btn {
            padding: 4px 8px;
            background: none;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            color: white;
            font-size: 10px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .model-btn:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .model-btn.active {
            background: rgba(34, 197, 94, 0.2);
            border-color: rgba(34, 197, 94, 0.4);
            color: #22c55e;
        }

        .model-btn.danger {
            border-color: rgba(239, 68, 68, 0.4);
            color: #ef4444;
        }

        .model-btn.danger:hover {
            background: rgba(239, 68, 68, 0.1);
        }

        .hardware-status {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
        }

        .hardware-chip {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 500;
        }

        .hardware-available {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
        }

        .hardware-unavailable {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }

        .empty-state {
            text-align: center;
            padding: 24px 16px;
            color: rgba(255, 255, 255, 0.6);
        }

        .empty-state-icon {
            font-size: 32px;
            margin-bottom: 8px;
        }

        .progress-bar {
            width: 100%;
            height: 3px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            overflow: hidden;
            margin-top: 4px;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4f46e5, #7c3aed);
            transition: width 0.3s ease;
        }

        .notification {
            padding: 8px 12px;
            border-radius: 6px;
            margin-bottom: 12px;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
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
    `;

    static properties = {
        installedModels: { type: Array },
        activeModel: { type: String },
        hardwareStatus: { type: Object },
        isLoading: { type: Boolean },
        downloadProgress: { type: Object },
        notifications: { type: Array }
    };

    constructor() {
        super();
        this.installedModels = [];
        this.activeModel = null;
        this.hardwareStatus = {
            npu: false,
            gpu: false,
            cpu: true
        };
        this.isLoading = false;
        this.downloadProgress = {};
        this.notifications = [];

        this.loadData();
    }

    async loadData() {
        this.isLoading = true;
        try {
            await Promise.all([
                this.loadInstalledModels(),
                this.loadHardwareStatus(),
                this.loadActiveModel()
            ]);
        } catch (error) {
            this.addNotification('error', 'Failed to load model data');
        } finally {
            this.isLoading = false;
        }
    }

    async loadInstalledModels() {
        try {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                this.installedModels = await ipcRenderer.invoke('get-installed-models') || [];
            } else {
                // Mock data for web environment
                this.installedModels = [
                    {
                        id: 'sentence-transformers/all-MiniLM-L6-v2',
                        name: 'All-MiniLM-L6-v2',
                        size: '90MB',
                        type: 'embedding',
                        installedAt: Date.now() - 86400000,
                        isActive: true
                    }
                ];
            }
            this.requestUpdate();
        } catch (error) {
            console.error('Failed to load installed models:', error);
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

    async loadActiveModel() {
        try {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                this.activeModel = await ipcRenderer.invoke('get-active-model');
            }
            this.requestUpdate();
        } catch (error) {
            console.error('Failed to load active model:', error);
        }
    }

    async activateModel(modelId) {
        try {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('activate-model', modelId);
                this.activeModel = modelId;
                this.addNotification('success', 'Model activated successfully');
                await this.loadInstalledModels();
            }
        } catch (error) {
            this.addNotification('error', 'Failed to activate model');
        }
    }

    async deactivateModel(modelId) {
        try {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('deactivate-model', modelId);
                this.activeModel = null;
                this.addNotification('success', 'Model deactivated');
                await this.loadInstalledModels();
            }
        } catch (error) {
            this.addNotification('error', 'Failed to deactivate model');
        }
    }

    async removeModel(modelId) {
        try {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('remove-model', modelId);
                this.addNotification('success', 'Model removed successfully');
                await this.loadInstalledModels();
            }
        } catch (error) {
            this.addNotification('error', 'Failed to remove model');
        }
    }

    openFullSetup() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('open-local-model-setup');
        } else {
            // For web environment, navigate to setup page
            window.location.href = '/settings/ai-models';
        }
    }

    openModelBrowser() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('open-model-browser');
        } else {
            window.location.href = '/settings/ai-models?tab=browse';
        }
    }

    addNotification(type, message) {
        const notification = {
            id: Date.now(),
            type,
            message
        };
        this.notifications = [notification, ...this.notifications.slice(0, 2)];
        this.requestUpdate();

        setTimeout(() => {
            this.removeNotification(notification.id);
        }, 3000);
    }

    removeNotification(id) {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.requestUpdate();
    }

    render() {
        return html`
            <div class="model-manager">
                <div class="manager-header">
                    <h3 class="manager-title">Local AI Models</h3>
                    <div class="status-indicator">
                        <div class="status-dot ${this.activeModel ? 'status-active' : 'status-inactive'}"></div>
                        <span>${this.activeModel ? 'Active' : 'Inactive'}</span>
                    </div>
                </div>

                ${this.notifications.map(notification => html`
                    <div class="notification notification-${notification.type}">
                        <span>${notification.message}</span>
                    </div>
                `)}

                <div class="hardware-status">
                    <div class="hardware-chip ${this.hardwareStatus.npu ? 'hardware-available' : 'hardware-unavailable'}">
                        NPU ${this.hardwareStatus.npu ? '✓' : '✗'}
                    </div>
                    <div class="hardware-chip ${this.hardwareStatus.gpu ? 'hardware-available' : 'hardware-unavailable'}">
                        GPU ${this.hardwareStatus.gpu ? '✓' : '✗'}
                    </div>
                    <div class="hardware-chip hardware-available">
                        CPU ✓
                    </div>
                </div>

                <div class="quick-actions">
                    <button class="action-btn primary" @click=${this.openFullSetup}>
                        🔧 Full Setup
                    </button>
                    <button class="action-btn" @click=${this.openModelBrowser}>
                        📦 Browse Models
                    </button>
                </div>

                <div class="model-list">
                    ${this.installedModels.length === 0 ? html`
                        <div class="empty-state">
                            <div class="empty-state-icon">🤖</div>
                            <div>No models installed</div>
                            <div style="font-size: 10px; margin-top: 4px;">
                                Click "Browse Models" to get started
                            </div>
                        </div>
                    ` : this.installedModels.map(model => html`
                        <div class="model-item">
                            <div class="model-info">
                                <div class="model-name">${model.name}</div>
                                <div class="model-details">
                                    ${model.size} • ${model.type} • 
                                    ${new Date(model.installedAt).toLocaleDateString()}
                                </div>
                                ${this.downloadProgress[model.id] ? html`
                                    <div class="progress-bar">
                                        <div class="progress-fill" style="width: ${this.downloadProgress[model.id].progress}%"></div>
                                    </div>
                                ` : ''}
                            </div>
                            <div class="model-actions">
                                ${model.isActive || this.activeModel === model.id ? html`
                                    <button class="model-btn active" @click=${() => this.deactivateModel(model.id)}>
                                        Active
                                    </button>
                                ` : html`
                                    <button class="model-btn" @click=${() => this.activateModel(model.id)}>
                                        Activate
                                    </button>
                                `}
                                <button class="model-btn danger" @click=${() => this.removeModel(model.id)}>
                                    Remove
                                </button>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }
}

customElements.define('model-manager-component', ModelManagerComponent);
