/**
 * stock-movements.js
 * Tela de Movimentações — registro de entradas, saídas e transferências + histórico com filtros.
 */
const StockMovements = {

    // ── Estado ──────────────────────────────────────────────────────

    _data: [],
    _materials: [],
    _locations: [],
    _filterType: '',
    _filterStartDate: '',
    _filterEndDate: '',
    _materialSelect: null,
    _toggleGroup: null,
    _datePicker: null,
    _dataTable: null,
    _entryBtn: null,
    _exitBtn: null,
    _transferBtn: null,
    _entryDialog: null,
    _exitDialog: null,
    _transferDialog: null,
    _dialogMaterialSelect: null,
    _dialogLocationSelect: null,
    _dialogFromLocSelect: null,
    _dialogToLocSelect: null,
    _exitPkgWeight: null,
    _exitPackagings: [],
    _entryMaterialData: null,
    _entryPackagings: [],
    _entryPkgWeight: null,

    // ── Ciclo de Vida ────────────────────────────────────────────────

    render() {
        this._entryDialog?.destroy();      this._entryDialog = null;
        this._exitDialog?.destroy();       this._exitDialog = null;
        this._transferDialog?.destroy();   this._transferDialog = null;
        this._materialSelect?.destroy();   this._materialSelect = null;
        this._dialogMaterialSelect?.destroy(); this._dialogMaterialSelect = null;
        this._dialogLocationSelect?.destroy(); this._dialogLocationSelect = null;
        this._dialogFromLocSelect?.destroy();  this._dialogFromLocSelect = null;
        this._dialogToLocSelect?.destroy();    this._dialogToLocSelect = null;
        this._toggleGroup?.destroy();      this._toggleGroup = null;
        this._datePicker?.destroy();       this._datePicker = null;
        this._dataTable?.destroy();        this._dataTable = null;
        this._entryBtn?.destroy();         this._entryBtn = null;
        this._exitBtn?.destroy();          this._exitBtn = null;
        this._transferBtn?.destroy();      this._transferBtn = null;

        this._filterType = '';

        return `
        <div class="stock-movements-container">
            <div class="stock-movements-toolbar">
                <div class="stock-movements-filters">
                    <div class="stock-movements-filters-icon-wrap">
                        <span class="material-symbols-outlined stock-movements-filters-icon">filter_list</span>
                    </div>
                    <div id="stockMovementsMaterialContainer" class="stock-movements-filter-select-wrap"></div>
                    <div id="stockMovementsTypeToggle"></div>
                    <div id="stockMovementsDatePicker"></div>
                </div>
                <div class="stock-movements-actions" id="stockMovementsActions"></div>
            </div>
            <div id="stockMovementsTableContainer"></div>
        </div>`;
    },

    async load() {
        const today = new Date();
        const thirtyAgo = new Date(Date.now() - 30 * 86400000);
        this._filterStartDate = thirtyAgo.toISOString().slice(0, 10);
        this._filterEndDate = today.toISOString().slice(0, 10);

        try {
            const _matQ = new URLSearchParams({ hasMovements: '1' });
            const _loc = AppState.getLocationFilter();
            if (_loc) _matQ.set('location_id', _loc);
            const [materials, locations] = await Promise.all([
                apiCall(`${API}/materials?${_matQ}`),
                apiCall(API + '/locations')
            ]);
            this._materials = materials || [];
            this._locations = filterUserLocations(locations || []);
        } catch (e) { alert(e.message); return; }

        this._populateMaterialFilter();
        this._mountToggleGroup();
        this._mountDatePicker(thirtyAgo, today);
        this._mountDataTable();
        this._mountActionButtons();

        await this._fetchAndRender();
    },

    // ── Montagem de componentes ──────────────────────────────────────

    _mountToggleGroup() {
        const container = document.getElementById('stockMovementsTypeToggle');
        if (!container) return;
        this._toggleGroup = createToggleGroup({
            options: [
                { value: '', label: 'Todos' },
                { value: 'entry', label: 'Entradas' },
                { value: 'exit', label: 'Saídas' },
            ],
            value: '',
            onChange: (value) => {
                this._filterType = value;
                this._fetchAndRender();
            },
        });
        this._toggleGroup.mount(container);
    },

    _mountDatePicker(start, end) {
        const container = document.getElementById('stockMovementsDatePicker');
        if (!container) return;
        this._datePicker = createDatePicker({
            range: true,
            locale: 'pt-BR',
            value: { start, end },
            onChange: ({ start: s, end: e }) => {
                this._filterStartDate = s ? s.toISOString().slice(0, 10) : '';
                this._filterEndDate = e ? e.toISOString().slice(0, 10) : '';
                this._fetchAndRender();
            },
        });
        this._datePicker.mount(container);
    },

    _mountDataTable() {
        const container = document.getElementById('stockMovementsTableContainer');
        if (!container) return;

        const canDelete = hasPermission('inventory', 'stock-movements', 'delete');

        this._dataTable = createDataTable({
            columns: [
                {
                    key: 'date', header: 'Data', width: '100px',
                    render: row => row.date
                        ? new Date(row.date + 'T00:00:00').toLocaleDateString('pt-BR')
                        : '—',
                },
                {
                    key: 'type', header: 'Tipo', width: '90px',
                    render: row => row.type === 'entry'
                        ? '<span class="stock-movements-type-entry">Entrada</span>'
                        : '<span class="stock-movements-type-exit">Saída</span>',
                },
                {
                    key: 'material_name', header: 'Material', sortable: true,
                    render: row => _esc(row.material_name || ''),
                },
                {
                    key: 'quantity', header: 'Quantidade', width: '120px',
                    render: row => {
                        const qty = Number(row.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                        const cls = row.type === 'entry' ? 'stock-movements-type-entry' : 'stock-movements-type-exit';
                        return `<span class="stock-movements-qty ${cls}">${row.type === 'entry' ? '+' : '-'}${qty}</span>`;
                    },
                },
                {
                    key: 'location_name', header: 'Localização',
                    render: row => row.location_name ? _esc(row.location_name) : '—',
                },
                {
                    key: 'reason', header: 'Motivo', width: '120px',
                    render: row => this._formatReason(row.reason),
                },
                {
                    key: 'notes', header: 'Observações',
                    render: row => row.notes
                        ? `<span class="stock-movements-notes">${_esc(row.notes)}</span>`
                        : '',
                },
            ],
            getRowKey: row => row.id,
            pageSize: 13,
            actions: canDelete ? [
                {
                    label: 'Excluir', icon: 'delete', variant: 'destructive',
                    hidden: row => !!row.lot_id,
                    onClick: row => this.deleteMovement(null, row.id),
                },
            ] : [],
            emptyMessage: 'Nenhuma movimentação encontrada.',
            emptyIcon: 'swap_vert',
        });
        this._dataTable.mount(container);
    },

    _mountActionButtons() {
        const container = document.getElementById('stockMovementsActions');
        if (!container || !hasPermission('inventory', 'stock-movements', 'create')) return;

        this._entryBtn = createButton({
            label: 'Entrada', variant: 'secondary', icon: 'input',
            onClick: () => this.openEntryDialog(),
        });
        this._exitBtn = createButton({
            label: 'Saída', variant: 'secondary', icon: 'output',
            onClick: () => this.openExitDialog(),
        });
        this._transferBtn = createButton({
            label: 'Transferência', variant: 'secondary', icon: 'swap_horiz',
            onClick: () => this.openTransferDialog(),
        });

        container.appendChild(this._entryBtn.el);
        container.appendChild(this._exitBtn.el);
        container.appendChild(this._transferBtn.el);
    },

    // ── Ações Públicas ───────────────────────────────────────────────

    /**
     * Abre diálogo de registro de entrada.
     */
    async openEntryDialog() {
        this._entryDialog?.destroy();
        this._dialogMaterialSelect?.destroy();
        this._dialogLocationSelect?.destroy();
        this._entryMaterialData = null;
        this._entryPackagings = [];
        this._entryPkgWeight = null;

        const globalLoc = AppState.getLocationFilter();
        const showLocField = !globalLoc;
        const today = new Date().toISOString().slice(0, 10);

        // Buscar todos os materiais disponíveis para entrada (sem filtro hasMovements)
        let entryMaterials = this._materials;
        try {
            const q = new URLSearchParams();
            if (globalLoc) q.set('location_id', globalLoc);
            entryMaterials = await apiCall(`${API}/materials?${q}`) || this._materials;
        } catch { /* usa lista já carregada */ }

        this._entryDialog = createDialog({
            title: 'Registrar Entrada',
            bodyHTML: `
                <div class="stock-movements-dialog-form">
                    <label>Material <span class="required">*</span>
                        <div id="stockMovementsEntryMaterial"></div>
                    </label>
                    <div id="stockMovementsEntryTrackingGroup" style="display:none">
                        <label>Modo de lançamento
                            <select id="stockMovementsEntryTrackMode" class="dialog-input" onchange="StockMovements._onEntryTrackModeChange()">
                                <option value="lot">Por lote</option>
                                <option value="single">Avulso</option>
                            </select>
                        </label>
                        <label id="stockMovementsEntryLotLabel">Número do lote <span class="required">*</span>
                            <div id="stockMovementsEntryLotMount"></div>
                        </label>
                    </div>
                    <div id="stockMovementsEntryPkgGroup" style="display:none">
                        <label>Modo de entrada
                            <select id="stockMovementsEntryMode" class="dialog-input" onchange="StockMovements._onEntryModeChange()">
                                <option value="qty">Por quantidade</option>
                                <option value="pkg">Por embalagem</option>
                            </select>
                        </label>
                        <label id="stockMovementsEntryPkgSelectLabel" style="display:none">Embalagem
                            <select id="stockMovementsEntryPkgSelect" class="dialog-input" onchange="StockMovements._onEntryPkgSelectChange()"></select>
                        </label>
                    </div>
                    <label id="stockMovementsEntryQtyLabel">Quantidade <span class="required">*</span>
                        <div id="stockMovementsEntryQtyMount"></div>
                    </label>
                    <label id="stockMovementsEntryPkgCountLabel" style="display:none">Quantidade de embalagens <span class="required">*</span>
                        <div id="stockMovementsEntryPkgCountMount"></div>
                        <span id="stockMovementsEntryPkgHint" class="stock-movements-pkg-hint"></span>
                    </label>
                    <label>Data <span class="required">*</span>
                        <input id="stockMovementsEntryDate" type="date" class="dialog-input" value="${today}">
                    </label>
                    ${showLocField ? `<label>Localização
                        <div id="stockMovementsEntryLocation"></div>
                    </label>` : ''}
                    <label>Observações
                        <div id="stockMovementsEntryNotesMount"></div>
                    </label>
                </div>
            `,
            actions: [
                { label: 'Confirmar', variant: 'primary', icon: 'check', onClick: () => this._submitEntry() },
                { label: 'Cancelar', variant: 'secondary', onClick: () => this._entryDialog.close() },
            ],
        });
        this._entryDialog.open();

        const lot = createInput({ id: 'stockMovementsEntryLot', placeholder: 'Ex: LOT-001' });
        document.getElementById('stockMovementsEntryLotMount').appendChild(lot.el);

        const eQty = createInput({ id: 'stockMovementsEntryQty', type: 'number', placeholder: '0,00' });
        eQty.input.step = 'any'; eQty.input.min = '0.01';
        document.getElementById('stockMovementsEntryQtyMount').appendChild(eQty.el);

        const ePkg = createInput({ id: 'stockMovementsEntryPkgCount', type: 'number', placeholder: '0' });
        ePkg.input.step = '1'; ePkg.input.min = '1';
        document.getElementById('stockMovementsEntryPkgCountMount').appendChild(ePkg.el);

        const eNotes = createInput({ id: 'stockMovementsEntryNotes', placeholder: 'Opcional' });
        document.getElementById('stockMovementsEntryNotesMount').appendChild(eNotes.el);

        this._dialogMaterialSelect = createSelect({
            placeholder: 'Selecione o material',
            searchable: true,
            sections: [{ key: 'mat', items: [] }],
            onChange: (value) => this._onEntryMaterialChange(value),
        });
        this._dialogMaterialSelect.mount(document.getElementById('stockMovementsEntryMaterial'));
        this._dialogMaterialSelect.setItems('mat', entryMaterials.map(m => ({ value: m.id, label: m.name })));

        if (showLocField) {
            this._dialogLocationSelect = createSelect({
                placeholder: 'Selecione a localização',
                searchable: true,
                sections: [{ key: 'loc', items: [] }],
                clearable: true,
            });
            this._dialogLocationSelect.mount(document.getElementById('stockMovementsEntryLocation'));
            this._dialogLocationSelect.setItems('loc', this._locations.map(l => ({ value: l.id, label: l.name })));
            if (this._locations.length === 1) {
                this._dialogLocationSelect.setValue(String(this._locations[0].id));
            }
        } else {
            this._dialogLocationSelect = null;
        }
    },

    /**
     * Abre diálogo de registro de saída.
     */
    openExitDialog() {
        this._exitDialog?.destroy();
        this._dialogMaterialSelect?.destroy();
        this._dialogLocationSelect?.destroy();

        const globalLoc = AppState.getLocationFilter();
        const showLocField = !globalLoc;
        const today = new Date().toISOString().slice(0, 10);

        this._exitDialog = createDialog({
            title: 'Registrar Saída',
            bodyHTML: `
                <div class="stock-movements-dialog-form">
                    <label>Material <span class="required">*</span>
                        <div id="stockMovementsExitMaterial"></div>
                    </label>
                    <div id="stockMovementsExitPkgGroup" style="display:none">
                        <label>Modo de saída
                            <select id="stockMovementsExitMode" class="dialog-input" onchange="StockMovements._onExitModeChange()">
                                <option value="kg">Por peso (kg)</option>
                                <option value="pkg" id="stockMovementsExitPkgOption">Por embalagem</option>
                            </select>
                        </label>
                        <label id="stockMovementsExitPkgSelectLabel" style="display:none">Embalagem
                            <select id="stockMovementsExitPkgSelect" class="dialog-input" onchange="StockMovements._onExitPkgSelectChange()"></select>
                        </label>
                    </div>
                    <label id="stockMovementsExitQtyLabel">Quantidade (kg) <span class="required">*</span>
                        <div id="stockMovementsExitQtyMount"></div>
                    </label>
                    <label id="stockMovementsExitPkgLabel" style="display:none">Embalagens <span class="required">*</span>
                        <div id="stockMovementsExitPkgCountMount"></div>
                        <span id="stockMovementsExitPkgHint" class="stock-movements-pkg-hint"></span>
                    </label>
                    <label>Data <span class="required">*</span>
                        <input id="stockMovementsExitDate" type="date" class="dialog-input" value="${today}">
                    </label>
                    ${showLocField ? `<label>Localização
                        <div id="stockMovementsExitLocation"></div>
                    </label>` : ''}
                    <label>Motivo
                        <select id="stockMovementsExitReason" class="dialog-input">
                            <option value="consumption">Consumo</option>
                            <option value="adjustment">Ajuste</option>
                        </select>
                    </label>
                    <label>Observações
                        <div id="stockMovementsExitNotesMount"></div>
                    </label>
                </div>
            `,
            actions: [
                { label: 'Confirmar', variant: 'primary', icon: 'check', onClick: () => this._submitExit() },
                { label: 'Cancelar', variant: 'secondary', onClick: () => this._exitDialog.close() },
            ],
        });
        this._exitDialog.open();

        const xQty = createInput({ id: 'stockMovementsExitQty', type: 'number', placeholder: '0,00' });
        xQty.input.step = 'any'; xQty.input.min = '0.01';
        document.getElementById('stockMovementsExitQtyMount').appendChild(xQty.el);

        const xPkg = createInput({ id: 'stockMovementsExitPkgCount', type: 'number', placeholder: '0' });
        xPkg.input.step = '1'; xPkg.input.min = '1';
        document.getElementById('stockMovementsExitPkgCountMount').appendChild(xPkg.el);

        const xNotes = createInput({ id: 'stockMovementsExitNotes', placeholder: 'Opcional' });
        document.getElementById('stockMovementsExitNotesMount').appendChild(xNotes.el);

        this._dialogMaterialSelect = createSelect({
            placeholder: 'Selecione o material',
            searchable: true,
            sections: [{ key: 'mat', items: [] }],
            onChange: (value) => this._onExitMaterialChange(value),
        });
        this._dialogMaterialSelect.mount(document.getElementById('stockMovementsExitMaterial'));
        this._dialogMaterialSelect.setItems('mat', this._materials.map(m => ({ value: m.id, label: m.name })));

        if (showLocField) {
            this._dialogLocationSelect = createSelect({
                placeholder: 'Selecione a localização',
                searchable: true,
                sections: [{ key: 'loc', items: [] }],
                clearable: true,
            });
            this._dialogLocationSelect.mount(document.getElementById('stockMovementsExitLocation'));
            this._dialogLocationSelect.setItems('loc', this._locations.map(l => ({ value: l.id, label: l.name })));
            if (this._locations.length === 1) {
                this._dialogLocationSelect.setValue(String(this._locations[0].id));
            }
        } else {
            this._dialogLocationSelect = null;
        }
    },

    /**
     * Abre diálogo de transferência entre localizações.
     */
    openTransferDialog() {
        this._transferDialog?.destroy();
        this._dialogMaterialSelect?.destroy();
        this._dialogFromLocSelect?.destroy();
        this._dialogToLocSelect?.destroy();

        const globalLoc = AppState.getLocationFilter();
        const originLoc = globalLoc ? this._locations.find(l => String(l.id) === String(globalLoc)) : null;
        const today = new Date().toISOString().slice(0, 10);

        this._transferDialog = createDialog({
            title: 'Transferência entre Localizações',
            bodyHTML: `
                <div class="stock-movements-dialog-form">
                    <label>Material <span class="required">*</span>
                        <div id="stockMovementsTransferMaterial"></div>
                    </label>
                    <label>Quantidade (kg) <span class="required">*</span>
                        <div id="stockMovementsTransferQtyMount"></div>
                    </label>
                    <label>Data <span class="required">*</span>
                        <input id="stockMovementsTransferDate" type="date" class="dialog-input" value="${today}">
                    </label>
                    <label>Origem <span class="required">*</span>
                        ${originLoc
                            ? `<div class="stock-movements-loc-locked">${_esc(originLoc.name)}</div>`
                            : `<div id="stockMovementsTransferFrom"></div>`
                        }
                    </label>
                    <label>Destino <span class="required">*</span>
                        <div id="stockMovementsTransferTo"></div>
                    </label>
                    <label>Observações
                        <div id="stockMovementsTransferNotesMount"></div>
                    </label>
                </div>
            `,
            actions: [
                { label: 'Confirmar', variant: 'primary', icon: 'check', onClick: () => this._submitTransfer() },
                { label: 'Cancelar', variant: 'secondary', onClick: () => this._transferDialog.close() },
            ],
        });
        this._transferDialog.open();

        const tQty = createInput({ id: 'stockMovementsTransferQty', type: 'number', placeholder: '0,00' });
        tQty.input.step = 'any'; tQty.input.min = '0.01';
        document.getElementById('stockMovementsTransferQtyMount').appendChild(tQty.el);

        const tNotes = createInput({ id: 'stockMovementsTransferNotes', placeholder: 'Opcional' });
        document.getElementById('stockMovementsTransferNotesMount').appendChild(tNotes.el);

        this._dialogMaterialSelect = createSelect({
            placeholder: 'Selecione o material',
            searchable: true,
            sections: [{ key: 'mat', items: [] }],
        });
        this._dialogMaterialSelect.mount(document.getElementById('stockMovementsTransferMaterial'));
        this._dialogMaterialSelect.setItems('mat', this._materials.map(m => ({ value: m.id, label: m.name })));

        if (!originLoc) {
            this._dialogFromLocSelect = createSelect({
                placeholder: 'Selecione a origem',
                searchable: true,
                sections: [{ key: 'loc', items: [] }],
            });
            this._dialogFromLocSelect.mount(document.getElementById('stockMovementsTransferFrom'));
            this._dialogFromLocSelect.setItems('loc', this._locations.map(l => ({ value: l.id, label: l.name })));
        } else {
            this._dialogFromLocSelect = null;
        }

        this._dialogToLocSelect = createSelect({
            placeholder: 'Selecione o destino',
            searchable: true,
            sections: [{ key: 'loc', items: [] }],
        });
        this._dialogToLocSelect.mount(document.getElementById('stockMovementsTransferTo'));
        const destLocs = originLoc
            ? this._locations.filter(l => String(l.id) !== String(globalLoc))
            : this._locations;
        this._dialogToLocSelect.setItems('loc', destLocs.map(l => ({ value: l.id, label: l.name })));
    },

    /**
     * Exclui uma movimentação.
     * @param {Event|null} event
     * @param {number} id
     */
    async deleteMovement(event, id) {
        if (event) event.stopPropagation();
        if (!confirm('Confirma a exclusão desta movimentação?')) return;
        try {
            await apiCall(API + `/stock-movements/${id}`, { method: 'DELETE' });
            await this._fetchAndRender();
            if (typeof showToast === 'function') showToast('Movimentação excluída.', 'success');
        } catch (e) { alert(e.message); }
    },

    // ── Renderização ─────────────────────────────────────────────────

    _populateMaterialFilter() {
        const container = document.getElementById('stockMovementsMaterialContainer');
        if (!container || this._materialSelect) return;

        this._materialSelect = createSelect({
            placeholder: 'Material',
            clearable: true,
            searchable: true,
            sections: [{ key: 'material', items: [] }],
            onChange: () => this._fetchAndRender()
        });
        this._materialSelect.mount(container);
        this._materialSelect.setItems('material', this._materials.map(m => ({ value: m.id, label: m.name })));
    },

    async _fetchAndRender() {
        const params = new URLSearchParams();
        const selectedMaterial = this._materialSelect?.getValue();
        const locationId = AppState.getLocationFilter();

        if (selectedMaterial) params.set('material_id', selectedMaterial);
        if (locationId) params.set('location_id', locationId);
        if (this._filterType) params.set('type', this._filterType);
        if (this._filterStartDate) params.set('startDate', this._filterStartDate);
        if (this._filterEndDate) params.set('endDate', this._filterEndDate);

        this._dataTable?.setLoading(true);
        try {
            this._data = await apiCall(API + '/stock-movements?' + params.toString()) || [];
        } catch (e) { alert(e.message); this._dataTable?.setLoading(false); return; }

        this._dataTable?.setData(this._data);
    },

    _formatReason(reason) {
        const map = {
            purchase: 'Compra',
            consumption: 'Consumo',
            adjustment: 'Ajuste',
            transfer: 'Transferência',
            production: 'Produção',
            service_return: 'Retorno de Serviço',
        };
        return map[reason] || reason || '—';
    },

    // ── Submit helpers ───────────────────────────────────────────────

    async _onEntryMaterialChange(materialId) {
        this._entryMaterialData = null;
        this._entryPackagings = [];
        this._entryPkgWeight = null;

        const trackingGroup = document.getElementById('stockMovementsEntryTrackingGroup');
        const pkgGroup = document.getElementById('stockMovementsEntryPkgGroup');
        const qtyLabel = document.getElementById('stockMovementsEntryQtyLabel');
        const pkgCountLabel = document.getElementById('stockMovementsEntryPkgCountLabel');

        if (trackingGroup) trackingGroup.style.display = 'none';
        if (pkgGroup) pkgGroup.style.display = 'none';
        if (qtyLabel) qtyLabel.style.display = '';
        if (pkgCountLabel) pkgCountLabel.style.display = 'none';

        if (!materialId) return;

        try {
            this._entryMaterialData = await apiCall(API + `/materials/${materialId}`);
        } catch { return; }

        if (this._entryMaterialData.tracking_mode === 'lot') {
            if (trackingGroup) trackingGroup.style.display = '';
            this._onEntryTrackModeChange();
        }

        this._entryPackagings = this._entryMaterialData.packagings || [];
        if (this._entryPackagings.length > 0) {
            const pkgSelectEl = document.getElementById('stockMovementsEntryPkgSelect');
            if (pkgSelectEl) {
                pkgSelectEl.innerHTML = this._entryPackagings.map(p =>
                    `<option value="${p.id}" data-qty="${p.quantity || ''}">${_esc(p.name)}${p.quantity ? ` (${p.quantity} kg)` : ''}</option>`
                ).join('');
            }
            if (pkgGroup) pkgGroup.style.display = '';
            const modeEl = document.getElementById('stockMovementsEntryMode');
            if (modeEl) modeEl.value = 'qty';
            this._onEntryModeChange();
        }
    },

    _onEntryTrackModeChange() {
        const mode = document.getElementById('stockMovementsEntryTrackMode')?.value;
        const lotLabel = document.getElementById('stockMovementsEntryLotLabel');
        if (lotLabel) lotLabel.style.display = mode === 'lot' ? '' : 'none';
    },

    _onEntryModeChange() {
        const mode = document.getElementById('stockMovementsEntryMode')?.value;
        const pkgSelectLabel = document.getElementById('stockMovementsEntryPkgSelectLabel');
        if (mode === 'pkg') {
            if (pkgSelectLabel) pkgSelectLabel.style.display = '';
            this._onEntryPkgSelectChange();
        } else {
            if (pkgSelectLabel) pkgSelectLabel.style.display = 'none';
            const qtyLabel = document.getElementById('stockMovementsEntryQtyLabel');
            const pkgCountLabel = document.getElementById('stockMovementsEntryPkgCountLabel');
            if (qtyLabel) qtyLabel.style.display = '';
            if (pkgCountLabel) pkgCountLabel.style.display = 'none';
        }
    },

    _onEntryPkgSelectChange() {
        const sel = document.getElementById('stockMovementsEntryPkgSelect');
        if (!sel) return;
        const opt = sel.selectedOptions[0];
        const qty = parseFloat(opt?.dataset.qty) || 0;
        const hintEl = document.getElementById('stockMovementsEntryPkgHint');
        const qtyLabel = document.getElementById('stockMovementsEntryQtyLabel');
        const pkgCountLabel = document.getElementById('stockMovementsEntryPkgCountLabel');
        this._entryPkgWeight = qty || null;
        if (hintEl) hintEl.textContent = qty ? `${qty} kg por embalagem` : '';
        if (qty) {
            if (qtyLabel) qtyLabel.style.display = 'none';
            if (pkgCountLabel) pkgCountLabel.style.display = '';
        } else {
            if (qtyLabel) qtyLabel.style.display = '';
            if (pkgCountLabel) pkgCountLabel.style.display = '';
        }
    },

    async _onExitMaterialChange(materialId) {
        const pkgGroup = document.getElementById('stockMovementsExitPkgGroup');
        const pkgSelectEl = document.getElementById('stockMovementsExitPkgSelect');

        this._exitPackagings = [];
        this._exitPkgWeight = null;

        try {
            const mat = await apiCall(API + `/materials/${materialId}`);
            this._exitPackagings = (mat.packagings || []).filter(p => p.quantity);
        } catch { /* silencioso */ }

        if (this._exitPackagings.length > 0) {
            if (pkgGroup) pkgGroup.style.display = '';
            if (pkgSelectEl) {
                pkgSelectEl.innerHTML = this._exitPackagings.map(p =>
                    `<option value="${p.id}" data-qty="${p.quantity}">${_esc(p.name)}</option>`
                ).join('');
                pkgSelectEl.style.display = '';
            }
            this._onExitPkgSelectChange();
        } else {
            if (pkgGroup) pkgGroup.style.display = 'none';
        }

        const modeEl = document.getElementById('stockMovementsExitMode');
        if (modeEl) modeEl.value = 'kg';
        this._onExitModeChange();
    },

    _onExitPkgSelectChange() {
        const sel = document.getElementById('stockMovementsExitPkgSelect');
        if (!sel) return;
        const opt = sel.selectedOptions[0];
        const qty = parseFloat(opt?.dataset.qty) || 0;
        const hintEl = document.getElementById('stockMovementsExitPkgHint');
        if (hintEl) hintEl.textContent = qty ? `${qty} kg por embalagem` : '';
        this._exitPkgWeight = qty;
    },

    _onExitModeChange() {
        const mode = document.getElementById('stockMovementsExitMode')?.value;
        const qtyLabel = document.getElementById('stockMovementsExitQtyLabel');
        const pkgLabel = document.getElementById('stockMovementsExitPkgLabel');
        const pkgSelectLabel = document.getElementById('stockMovementsExitPkgSelectLabel');
        if (mode === 'pkg') {
            if (qtyLabel) qtyLabel.style.display = 'none';
            if (pkgLabel) pkgLabel.style.display = '';
            if (pkgSelectLabel) pkgSelectLabel.style.display = '';
        } else {
            if (qtyLabel) qtyLabel.style.display = '';
            if (pkgLabel) pkgLabel.style.display = 'none';
            if (pkgSelectLabel) pkgSelectLabel.style.display = 'none';
        }
    },

    async _submitEntry() {
        const material = this._dialogMaterialSelect?.getValue();
        const qty = parseFloat(document.getElementById('stockMovementsEntryQty')?.value);
        const date = document.getElementById('stockMovementsEntryDate')?.value;
        const notes = document.getElementById('stockMovementsEntryNotes')?.value || '';
        const location = this._dialogLocationSelect?.getValue();
        const locationId = location ? Number(location) : (AppState.getLocationFilter() ? Number(AppState.getLocationFilter()) : undefined);

        if (material == null) { alert('Selecione um material.'); return; }
        if (!qty || qty <= 0) { alert('Informe uma quantidade válida.'); return; }
        if (!date) { alert('Informe a data.'); return; }

        try {
            await apiCall(API + '/stock-movements/entry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    material_id: material,
                    quantity: qty,
                    date,
                    reason: 'purchase',
                    notes: notes || null,
                    location_id: locationId,
                })
            });
            this._entryDialog.close();
            if (typeof showToast === 'function') showToast('Entrada registrada.', 'success');
            await this._fetchAndRender();
        } catch (e) { alert(e.message); }
    },

    async _submitExit() {
        const material = this._dialogMaterialSelect?.getValue();
        const mode = document.getElementById('stockMovementsExitMode')?.value || 'kg';
        let qty;
        if (mode === 'pkg' && this._exitPkgWeight) {
            const count = parseInt(document.getElementById('stockMovementsExitPkgCount')?.value);
            if (!count || count <= 0) { alert('Informe a quantidade de embalagens.'); return; }
            qty = Math.round(count * this._exitPkgWeight * 1000) / 1000;
        } else {
            qty = parseFloat(document.getElementById('stockMovementsExitQty')?.value);
        }
        const date = document.getElementById('stockMovementsExitDate')?.value;
        const reason = document.getElementById('stockMovementsExitReason')?.value || 'consumption';
        const notes = document.getElementById('stockMovementsExitNotes')?.value || '';
        const location = this._dialogLocationSelect?.getValue();
        const locationId = location ? Number(location) : (AppState.getLocationFilter() ? Number(AppState.getLocationFilter()) : undefined);

        if (material == null) { alert('Selecione um material.'); return; }
        if (!qty || qty <= 0) { alert('Informe uma quantidade válida.'); return; }
        if (!date) { alert('Informe a data.'); return; }

        try {
            await apiCall(API + '/stock-movements/exit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    material_id: material,
                    quantity: qty,
                    date,
                    reason,
                    notes: notes || null,
                    location_id: locationId,
                })
            });
            this._exitDialog.close();
            if (typeof showToast === 'function') showToast('Saída registrada.', 'success');
            await this._fetchAndRender();
        } catch (e) { alert(e.message); }
    },

    async _submitTransfer() {
        const material = this._dialogMaterialSelect?.getValue();
        const qty = parseFloat(document.getElementById('stockMovementsTransferQty')?.value);
        const date = document.getElementById('stockMovementsTransferDate')?.value;
        const notes = document.getElementById('stockMovementsTransferNotes')?.value || '';
        const fromLoc = this._dialogFromLocSelect?.getValue();
        const toLoc = this._dialogToLocSelect?.getValue();

        const fromLocationId = fromLoc ? Number(fromLoc) : (AppState.getLocationFilter() ? Number(AppState.getLocationFilter()) : null);
        const toLocationId = toLoc ? Number(toLoc) : null;

        if (material == null) { alert('Selecione um material.'); return; }
        if (!qty || qty <= 0) { alert('Informe uma quantidade válida.'); return; }
        if (!date) { alert('Informe a data.'); return; }
        if (!fromLocationId) { alert('Selecione a localização de origem.'); return; }
        if (!toLocationId) { alert('Selecione a localização de destino.'); return; }
        if (fromLocationId === toLocationId) { alert('Origem e destino devem ser diferentes.'); return; }

        try {
            await apiCall(API + '/stock-movements/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    material_id: material,
                    quantity: qty,
                    date,
                    from_location_id: fromLocationId,
                    to_location_id: toLocationId,
                    notes: notes || null,
                })
            });
            this._transferDialog.close();
            if (typeof showToast === 'function') showToast('Transferência registrada.', 'success');
            await this._fetchAndRender();
        } catch (e) { alert(e.message); }
    },
};
