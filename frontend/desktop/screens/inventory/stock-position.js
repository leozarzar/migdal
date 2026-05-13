/**
 * ── StockPosition ──
 * Tela de posição de estoque — visão agregada por material.
 * Exibe saldo, lotes em estoque, entrada mais antiga e grupo.
 */

// ── Estado ──────────────────────────────────────────────────────
const StockPosition = {
    _groupSelect: null,
    _exitDialog: null,
    _dataTable: null,
    _search: '',
    _selectedGroup: '',

// ── Ciclo de Vida ────────────────────────────────────────────────
    render() {
        this._groupSelect?.destroy(); this._groupSelect = null;
        this._exitDialog?.destroy();  this._exitDialog  = null;
        this._dataTable?.destroy();   this._dataTable   = null;
        this._search = '';
        this._selectedGroup = '';
        return `
        <div class="stock-position-container">
            <div class="stock-position-filters">
                <div class="stock-position-filters-icon-wrap">
                    <span class="material-symbols-outlined stock-position-filters-icon">filter_list</span>
                </div>
                <div id="stockPositionGroupContainer" class="stock-position-filter-select-wrap"></div>
                <div id="stockPositionSearchMount"></div>
            </div>
            <div id="stockPositionTableContainer"></div>
        </div>`;
    },

    async load() {
        this._search = localStorage.getItem('wcm.stockPosition.search') || '';
        this._selectedGroup = localStorage.getItem('wcm.stockPosition.group') || '';

        if (!this._searchInput) {
            const mount = document.getElementById('stockPositionSearchMount');
            if (mount) {
                this._searchInput = createInput({
                    id: 'stockPositionSearch',
                    placeholder: 'Buscar',
                    icon: 'Search',
                    onInput: v => StockPosition._onSearch(v),
                });
                mount.appendChild(this._searchInput.el);
            }
        }
        this._searchInput?.setValue(this._search);

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    {
                        key: 'material', header: 'Material', sortable: true,
                        render: r => `<span class="stock-position-material-name">${_esc(r.material)}</span>`,
                    },
                    {
                        key: 'balance', header: 'Saldo', width: '130px', sortable: true,
                        sortValue: r => r.balance,
                        render: r => `<strong>${r.balance.toLocaleString('pt-BR')} ${r.unit || ''}</strong>`,
                    },
                    {
                        key: 'lots_in_stock', header: 'Lotes', width: '80px', sortable: true,
                        sortValue: r => r.lots_in_stock,
                        render: r => r.tracking_mode === 'lots' ? String(r.lots_in_stock) : '—',
                    },
                ],
                getRowKey: r => String(r.material_id),
                pageSize: 13,
                onPageChange: (page) => this._fetchPage(page),
                onRowClick: r => {
                    if (r.tracking_mode === 'lots' && r.balance > 0) StockPosition.goToMaterial(r.material);
                },
                actions: [
                    {
                        label: 'Registrar Saída', icon: 'output',
                        hidden: r => r.tracking_mode !== 'simple' || r.balance <= 0,
                        onClick: r => StockPosition.openExitDialog(null, r),
                    },
                ],
                emptyMessage: 'Nenhum material encontrado.',
                emptyIcon: 'inventory_2',
            });
            this._dataTable.mount(document.getElementById('stockPositionTableContainer'));
        }

        this._dataTable.setLoading(true);

        await this._populateGroupFilter();
        await this._fetchPage(1);
    },

    async onTabFocus() { return this.load(); },

// ── Ações Públicas ───────────────────────────────────────────────

    goToMaterial(material) {
        StockUnits._presetMaterial = material;
        showScreen('stock-units');
    },

    openExitDialog(event, row) {
        if (event) event.stopPropagation();
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
                        <div id="stockPositionExitQtyMount"></div>
                    </label>
                    <label>Motivo
                        <select id="stockPositionExitReason" class="dialog-input">
                            <option value="consumption">Consumo</option>
                            <option value="adjustment">Ajuste</option>
                        </select>
                    </label>
                    <label>Observações
                        <div id="stockPositionExitNotesMount"></div>
                    </label>
                </div>
            `,
            actions: [
                { label: 'Confirmar', variant: 'primary', icon: 'check', onClick: () => this._submitExit(row) },
                { label: 'Cancelar', variant: 'secondary', onClick: () => this._exitDialog.close() },
            ],
        });
        this._exitDialog.open();

        const qty = createInput({ id: 'stockPositionExitQty', type: 'number', placeholder: '0,00' });
        qty.input.step = 'any'; qty.input.min = '0.01';
        document.getElementById('stockPositionExitQtyMount').appendChild(qty.el);

        const notes = createInput({ id: 'stockPositionExitNotes', placeholder: 'Opcional' });
        document.getElementById('stockPositionExitNotesMount').appendChild(notes.el);
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
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this._fetchPage(1), 1000);
    },

    _onGroupChange(groupId) {
        this._selectedGroup = groupId;
        localStorage.setItem('wcm.stockPosition.group', groupId);
        this._fetchPage(1);
    },

    async _populateGroupFilter() {
        const container = document.getElementById('stockPositionGroupContainer');
        if (!container) return;

        if (!this._groupSelect) {
            this._groupSelect = createSelect({
                placeholder: 'Grupo',
                sections: [{ key: 'groups', items: [] }],
                onChange: (value) => this._onGroupChange(value != null ? String(value) : '')
            });
            this._groupSelect.mount(container);
        }

        let groups = [];
        try { groups = await apiCall(API + '/groups'); } catch { groups = []; }

        const items = groups
            .map(g => ({ value: g.id, label: g.name }))
            .sort((a, b) => a.label.localeCompare(b.label));
        this._groupSelect.setItems('groups', items);

        if (this._selectedGroup) this._groupSelect.setValue(this._selectedGroup);
    },

    async _fetchPage(page = 1) {
        const params = new URLSearchParams({ page, limit: 13 });
        const locationId = AppState.getLocationFilter();
        if (locationId) params.set('location_id', encodeURIComponent(locationId));
        if (this._selectedGroup) params.set('group_id', this._selectedGroup);
        if (this._search) params.set('search', this._search);

        this._dataTable?.setLoading(true);
        try {
            const { data, total } = await apiCall(API + '/stock-units/position?' + params);
            this._dataTable?.setData(data || [], total || 0, page);
        } catch (e) {
            alert(e.message);
            this._dataTable?.setLoading(false);
        }
    },
};
