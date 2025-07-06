/**
 * Local Model Router
 * Handles navigation and routing for local model management views
 */

import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import './LocalModelSetupView.js';

export class LocalModelRouter extends LitElement {
    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100vh;
        }
    `;

    static properties = {
        currentView: { type: String },
        routeParams: { type: Object }
    };

    constructor() {
        super();
        this.currentView = 'setup';
        this.routeParams = {};
        
        this.setupNavigation();
    }

    setupNavigation() {
        // Listen for navigation events from main process
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            
            ipcRenderer.on('navigate-to-view', (event, viewName, params = {}) => {
                this.navigateToView(viewName, params);
            });
        }

        // Listen for browser navigation events
        window.addEventListener('popstate', (event) => {
            this.handleBrowserNavigation(event);
        });

        // Parse initial route
        this.parseCurrentRoute();
    }

    parseCurrentRoute() {
        const path = window.location.pathname;
        const searchParams = new URLSearchParams(window.location.search);
        
        if (path.includes('/settings/ai-models')) {
            this.currentView = 'setup';
            this.routeParams = {
                tab: searchParams.get('tab') || 'hardware'
            };
        }
    }

    handleBrowserNavigation(event) {
        this.parseCurrentRoute();
        this.requestUpdate();
    }

    navigateToView(viewName, params = {}) {
        this.currentView = viewName;
        this.routeParams = params;
        
        // Update browser URL if in web environment
        if (!window.require) {
            const url = this.getUrlForView(viewName, params);
            window.history.pushState({ view: viewName, params }, '', url);
        }
        
        this.requestUpdate();
    }

    getUrlForView(viewName, params = {}) {
        switch (viewName) {
            case 'local-model-setup':
            case 'setup':
                const searchParams = new URLSearchParams();
                if (params.tab) searchParams.set('tab', params.tab);
                return `/settings/ai-models${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
            default:
                return '/settings/ai-models';
        }
    }

    render() {
        switch (this.currentView) {
            case 'local-model-setup':
            case 'setup':
                return html`<local-model-setup-view .routeParams=${this.routeParams}></local-model-setup-view>`;
            default:
                return html`<local-model-setup-view .routeParams=${this.routeParams}></local-model-setup-view>`;
        }
    }
}

customElements.define('local-model-router', LocalModelRouter);
