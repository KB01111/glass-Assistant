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
            font-size: 11px;
            font-weight: 500;
            margin: 0;
            color: rgba(255, 255, 255, 0.9);
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            color: rgba(255, 255, 255, 0.6);
        }

        .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
        }

        .status-active {
            background: rgba(52, 199, 89, 0.8);
        }

        .status-inactive {
            background: rgba(255, 59, 48, 0.8);
        }

        .status-loading {
            background: rgba(255, 149, 0, 0.8);
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .quick-actions {
            display: flex;
            gap: 4px;
            margin-bottom: 8px;
        }

        .action-btn {
            flex: 1;
            padding: 4px 6px;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            color: white;
            font-size: 10px;
            font-weight: 400;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 3px;
        }

        .action-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.3);
        }

        .action-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .action-btn.primary {
            background: rgba(0, 122, 255, 0.2);
            border-color: rgba(0, 122, 255, 0.4);
        }

        .action-btn.primary:hover {
            background: rgba(0, 122, 255, 0.3);
        }

        .model-list {
            max-height: 120px;
            overflow-y: auto;
        }

        .model-list::-webkit-scrollbar {
            width: 4px;
        }

        .model-list::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 2px;
        }

        .model-list::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 2px;
        }

        .model-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .model-item:last-child {
            border-bottom: none;
        }

        .model-info {
            flex: 1;
        }

        .model-name {
            font-size: 10px;
            font-weight: 400;
            margin-bottom: 1px;
            color: white;
        }

        .model-details {
            font-size: 9px;
            color: rgba(255, 255, 255, 0.5);
        }

        .model-actions {
            display: flex;
            gap: 2px;
        }

        .model-btn {
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            color: white;
            font-size: 9px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .model-btn:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .model-btn.active {
            background: rgba(52, 199, 89, 0.2);
            border-color: rgba(52, 199, 89, 0.4);
            color: rgba(52, 199, 89, 0.9);
        }

        .model-btn.danger {
            border-color: rgba(255, 59, 48, 0.4);
            color: rgba(255, 59, 48, 0.9);
        }

        .model-btn.danger:hover {
            background: rgba(255, 59, 48, 0.1);
        }

        .hardware-status {
            display: flex;
            gap: 4px;
            margin-bottom: 6px;
        }

        .hardware-chip {
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 8px;
            font-weight: 400;
        }

        .hardware-available {
            background: rgba(52, 199, 89, 0.2);
            color: rgba(52, 199, 89, 0.9);
        }

        .hardware-unavailable {
            background: rgba(255, 59, 48, 0.2);
            color: rgba(255, 59, 48, 0.9);
        }

        .empty-state {
            text-align: center;
            padding: 12px 8px;
            color: rgba(255, 255, 255, 0.5);
        }

        .empty-state-icon {
            font-size: 16px;
            margin-bottom: 4px;
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
            padding: 4px 6px;
            border-radius: 4px;
            margin-bottom: 6px;
            font-size: 9px;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .notification-success {
            background: rgba(52, 199, 89, 0.1);
            border: 1px solid rgba(52, 199, 89, 0.3);
            color: rgba(52, 199, 89, 0.9);
        }

        .notification-error {
            background: rgba(255, 59, 48, 0.1);
            border: 1px solid rgba(255, 59, 48, 0.3);
            color: rgba(255, 59, 48, 0.9);
        }

        .notification-warning {
            background: rgba(255, 149, 0, 0.1);
            border: 1px solid rgba(255, 149, 0, 0.3);
            color: rgba(255, 149, 0, 0.9);
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
                    <h3 class="manager-title">Local AI Models Manager</h3>
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
                        Setup
                    </button>
                    <button class="action-btn" @click=${this.openModelBrowser}>
                        Browse
                    </button>
                </div>

                <div class="model-list">
                    ${this.installedModels.length === 0 ? html`
                        <div class="empty-state">
                            <div class="empty-state-icon">🤖</div>
                            <div style="font-size: 9px;">No models</div>
                            <div style="font-size: 8px; margin-top: 2px; color: rgba(255, 255, 255, 0.4);">
                                Click Browse to start
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
