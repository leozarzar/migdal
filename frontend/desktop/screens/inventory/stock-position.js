/**
 * ── StockPosition ──
 * Tela de posição de estoque — visão agregada por material.
 * Exibe saldo, lotes em estoque, entrada mais antiga e grupo.
 */

// ── Estado ──────────────────────────────────────────────────────
const StockPosition = {
    _data: [],
    _groupSelect: null,
    _exitDialog: null,
    _search: '',
    _selectedGroup: '',

// ── Ciclo de Vida ────────────────────────────────────────────────
    render() {
        this._groupSelect?.destroy(); this._groupSelect = null;
        this._exitDialog?.destroy(); this._exitDialog = null;
        this._search = '';
        this._selectedGroup = '';
        return `
        <div class="stock-position-container">
            <div class="stock-position-card">
                <div class="stock-position-filters">
                    <div class="stock-position-filters-icon-wrap">
                        <span class="material-symbols-outlined stock-position-filters-icon">filter_list</span>
                    </div>
                    <div id="stockPositionGroupContainer" class="stock-position-filter-select-wrap"></div>
                    <input id="stockPositionSearch" class="stock-position-search" placeholder="Pesquisar material..." oninput="StockPosition._onSearch(this.value)">
                </div>
                <div id="stockPositionSummary" class="stock-position-summary"></div>
                <div class="stock-position-table-container">
                    <table class="stock-position-table">
                        <thead>
                            <tr>
                                <th>Material</th>
                                <th class="stock-position-col-num">Saldo</th>
                                <th class="stock-position-col-num">Lotes</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="stockPositionTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
    },

    async load() {
        this._search = localStorage.getItem('wcm.stockPosition.search') || '';
        this._selectedGroup = localStorage.getItem('wcm.stockPosition.group') || '';

        const searchEl = document.getElementById('stockPositionSearch');
        if (searchEl) searchEl.value = this._search;

        try {
            let url = API + '/stock-units/position';
            const locationId = AppState.getLocationFilter();
            if (locationId) {
                url += '?location_id=' + encodeURIComponent(locationId);
            }
            this._data = await apiCall(url) || [];
        } catch (e) { alert(e.message); return; }

            await this._populateGroupFilter();
        this._renderTable();
    },

// ── Ações Públicas ───────────────────────────────────────────────

    /**
     * Navega para a tela de estoque filtrada pelo material.
     * @param {string} material - Nome do material
     */
    goToMaterial(material) {
        StockUnits._presetMaterial = material;
        showScreen('stock-units');
    },

    /**
     * Abre diálogo de saída rápida (modo simples).
     * @param {object} row - Dados do material (material_id, material, balance)
     */
    openExitDialog(event, materialId) {
        if (event) event.stopPropagation();
        const row = this._data.find(r => r.material_id === materialId);
        if (!row) return;

        this._exitDialog?.destroy();
        this._exitDialog = createDialog({
            title: 'Registrar Saída',
            subtitle: `${_esc(row.material)} — Saldo: ${row.balance.toLocaleString('pt-BR')} kg`,
            bodyHTML: `
                <div class="stock-position-exit-form">
                    <label>Data da saída
                        <input id="stockPositionExitDate" type="date" class="dialog-input" value="${new Date().toISOString().slice(0, 10)}">
                    </label>
                    <label>Quantidade (kg)
                        <input id="stockPositionExitQty" type="number" step="any" min="0.01" class="dialog-input" placeholder="0,00">
                    </label>
                    <label>Motivo
                        <select id="stockPositionExitReason" class="dialog-input">
                            <option value="consumption">Consumo</option>
                            <option value="adjustment">Ajuste</option>
                        </select>
                    </label>
                    <label>Observações
                        <input id="stockPositionExitNotes" type="text" class="dialog-input" placeholder="Opcional">
                    </label>
                </div>
            `,
            actions: [
                { label: 'Confirmar', className: 'btn-primary', icon: 'check', onClick: () => this._submitExit(row) },
                { label: 'Cancelar', className: 'btn-secondary', onClick: () => this._exitDialog.close() },
            ],
        });
        this._exitDialog.open();
    },

    async _submitExit(row) {
        const qty = parseFloat(document.getElementById('stockPositionExitQty')?.value);
        const reason = document.getElementById('stockPositionExitReason')?.value || 'consumption';
        const notes = document.getElementById('stockPositionExitNotes')?.value || '';
        const date = document.getElementById('stockPositionExitDate')?.value || new Date().toISOString().slice(0, 10);

        if (!qty || qty <= 0) { alert('Informe uma quantidade válida.'); return; }
        if (qty > row.balance) { alert('Quantidade excede o saldo disponível.'); return; }
        if (!date) { alert('Informe a data da saída.'); return; }

        try {
            await apiCall(API + '/stock-movements/exit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    material_id: row.material_id,
                    quantity: qty,
                    date,
                    reason,
                    notes: notes || null,
                    location_id: AppState.getLocationFilter() ? Number(AppState.getLocationFilter()) : undefined
                })
            });
            this._exitDialog.close();
            await this.load();
        } catch (e) { alert(e.message); }
    },

// ── Renderização ─────────────────────────────────────────────────

    _onSearch(value) {
        this._search = value;
        localStorage.setItem('wcm.stockPosition.search', value);
        this._renderTable();
    },

    _onGroupChange(groupId) {
        this._selectedGroup = groupId;
        localStorage.setItem('wcm.stockPosition.group', groupId);
        this._renderTable();
    },

    async _populateGroupFilter() {
        const container = document.getElementById('stockPositionGroupContainer');
        if (!container) return;

        if (!this._groupSelect) {
            this._groupSelect = createSearchSelect({
                placeholder: 'Grupo',
                size: 'small',
                sections: [{ key: 'groups', items: [] }],
                onChange: (sel) => this._onGroupChange(sel && sel.value != null ? String(sel.value) : '')
            });
            this._groupSelect.mount(container);
        }

        let groups = [];
        try {
            groups = await apiCall(API + '/groups');
        } catch (e) {
            groups = [];
        }

        const items = groups
            .map(g => ({ value: g.id, label: g.name }))
            .sort((a, b) => a.label.localeCompare(b.label));
        this._groupSelect.setItems('groups', items);

        if (this._selectedGroup) {
            this._groupSelect.select('groups', this._selectedGroup);
        }
    },

    _getFilteredData() {
        return this._data.filter(row => {
            if (this._selectedGroup && String(row.group_id) !== this._selectedGroup) return false;
            if (this._search) {
                const q = this._search.toLowerCase();
                const haystack = [row.material, row.group_name].filter(Boolean).join(' ').toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
    },

    _renderTable() {
        const tbody = document.getElementById('stockPositionTableBody');
        const summaryEl = document.getElementById('stockPositionSummary');
        if (!tbody) return;

        const filtered = this._getFilteredData();

        // Resumo
        // Descobrir unidades de medida distintas
        const units = Array.from(new Set(filtered.map(r => r.unit).filter(Boolean)));
        const totalBalance = filtered.reduce((s, r) => s + r.balance, 0);
        const totalLots = filtered.reduce((s, r) => s + r.lots_in_stock, 0);
        const materialsWithStock = filtered.filter(r => r.balance > 0).length;

        if (summaryEl) {
            summaryEl.innerHTML = `
                <span class="stock-position-summary-item">
                    <strong>${filtered.length}</strong> materiais
                </span>
                <span class="stock-position-summary-sep">·</span>
                <span class="stock-position-summary-item">
                    <strong>${materialsWithStock}</strong> com saldo
                </span>
                ${units.length === 1 ? `
                <span class="stock-position-summary-sep">·</span>
                <span class="stock-position-summary-item">
                    <strong>${totalBalance.toLocaleString('pt-BR')} ${units[0]}</strong> total
                </span>` : ''}
                ${totalLots > 0 ? `
                <span class="stock-position-summary-sep">·</span>
                <span class="stock-position-summary-item">
                    <strong>${totalLots}</strong> lotes em estoque
                </span>` : ''}
            `;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="stock-position-empty">Nenhum material encontrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        for (const row of filtered) {
            tbody.appendChild(this._createRow(row));
        }
    },

    _createRow(row) {
        const tr = document.createElement('tr');
        const hasStock = row.balance > 0;
        const isLot = row.tracking_mode === 'lots';
        const clickable = isLot ? hasStock : true;
        const cursorClass = clickable ? 'stock-position-row--clickable' : '';

        tr.className = cursorClass;
        if (isLot && hasStock) {
            tr.onclick = () => StockPosition.goToMaterial(row.material);
        }

        tr.innerHTML = `
            <td>
                <span class="stock-position-material-name">${_esc(row.material)}</span>
            </td>
            <td class="stock-position-col-num"><strong>${row.balance.toLocaleString('pt-BR')} ${row.unit || ''}</strong></td>
            <td class="stock-position-col-num">${isLot ? row.lots_in_stock : '—'}</td>
            <td class="stock-position-col-action">
                ${!isLot && hasStock ? `<button class="stock-position-exit-btn" onclick="StockPosition.openExitDialog(event, ${row.material_id})" title="Registrar saída">
                    <span class="material-symbols-outlined">output</span>
                </button>` : ''}
            </td>
        `;
        return tr;
    }
};
