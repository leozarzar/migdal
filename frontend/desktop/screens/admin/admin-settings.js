/**
 * ── AdminSettings ──
 * Tela de configurações gerais da aplicação.
 */

// ── Estado ──────────────────────────────────────────────────────
const AdminSettings = {
    _settings: {},

// ── Ciclo de Vida ────────────────────────────────────────────────
    render() {
        return `
        <div class="admin-settings-container">
            <div class="admin-settings-card">

                <div class="admin-settings-section">
                    <div class="admin-settings-section-header">
                        <span class="material-symbols-outlined">warehouse</span>
                        Localizações
                    </div>
                    <p class="admin-settings-section-desc">
                        Habilita controle de estoque por localização (armazém, posição, etc.).
                    </p>
                    <div class="admin-settings-toggle-row" id="adminSettingsLocations">
                    </div>
                </div>

            </div>
        </div>`;
    },

    async load() {
        try {
            this._settings = await apiCall(API + '/settings');
        } catch (e) {
            alert(e.message);
            return;
        }
        this._renderLocationsToggle();
    },

// ── Ações Públicas ───────────────────────────────────────────────

    /**
     * Alterna o controle por localização.
     */
    async toggleLocations() {
        const current = this._settings['inventory.locations_enabled'] === 'true';
        const newValue = current ? 'false' : 'true';
        try {
            await apiCall(API + '/settings/inventory.locations_enabled', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: newValue })
            });
            this._settings['inventory.locations_enabled'] = newValue;
            window.AppSettings['inventory.locations_enabled'] = newValue;
            this._renderLocationsToggle();
            if (typeof showToast === 'function') showToast('Configuração atualizada.', 'success');
        } catch (e) { alert(e.message); }
    },

// ── Renderização ─────────────────────────────────────────────────

    _renderLocationsToggle() {
        const container = document.getElementById('adminSettingsLocations');
        if (!container) return;

        const enabled = this._settings['inventory.locations_enabled'] === 'true';

        container.innerHTML = `
            <label class="admin-settings-switch" onclick="AdminSettings.toggleLocations()">
                <span class="admin-settings-switch-track ${enabled ? 'admin-settings-switch-track--on' : ''}">
                    <span class="admin-settings-switch-thumb"></span>
                </span>
                <span class="admin-settings-switch-label">${enabled ? 'Habilitado' : 'Desabilitado'}</span>
            </label>
            <p class="admin-settings-toggle-note">
                ${enabled
                    ? 'Movimentações de estoque podem ser associadas a localizações específicas.'
                    : 'Todo o estoque é tratado como uma única localização.'}
            </p>
        `;
    }
};
