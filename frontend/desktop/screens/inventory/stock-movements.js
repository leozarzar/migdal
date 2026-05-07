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

        this._filterType = '';

        const today = new Date().toISOString().slice(0, 10);
        const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

        return `
        <div class="stock-movements-container">
            <div class="stock-movements-card">
                <div class="stock-movements-toolbar">
                    <div class="stock-movements-filters">
                        <div class="stock-movements-filters-icon-wrap">
                            <span class="material-symbols-outlined stock-movements-filters-icon">filter_list</span>
                        </div>
                        <div id="stockMovementsMaterialContainer" class="stock-movements-filter-select-wrap"></div>
                        <div class="stock-movements-type-pills">
                            <button class="stock-movements-type-pill active" data-value="" onclick="StockMovements._setType('')">Todos</button>
                            <button class="stock-movements-type-pill" data-value="entry" onclick="StockMovements._setType('entry')">Entradas</button>
                            <button class="stock-movements-type-pill" data-value="exit" onclick="StockMovements._setType('exit')">Saídas</button>
                        </div>
                        <input id="stockMovementsStartDate" type="date" class="stock-movements-date-input" value="${thirtyAgo}" onchange="StockMovements._onFilterChange()">
                        <span class="stock-movements-date-sep">até</span>
                        <input id="stockMovementsEndDate" type="date" class="stock-movements-date-input" value="${today}" onchange="StockMovements._onFilterChange()">
                    </div>
                    <div class="stock-movements-actions">
                        ${hasPermission('inventory', 'stock-movements', 'create') ? `
                        <button class="stock-movements-action-btn stock-movements-btn-entry" onclick="StockMovements.openEntryDialog()">
                            <span class="material-symbols-outlined">input</span> Entrada
                        </button>
                        <button class="stock-movements-action-btn stock-movements-btn-exit" onclick="StockMovements.openExitDialog()">
                            <span class="material-symbols-outlined">output</span> Saída
                        </button>
                        <button class="stock-movements-action-btn stock-movements-btn-transfer" onclick="StockMovements.openTransferDialog()">
                            <span class="material-symbols-outlined">swap_horiz</span> Transferência
                        </button>` : ''}
                    </div>
                </div>
                <div class="stock-movements-table-container">
                    <table class="stock-movements-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Tipo</th>
                                <th>Material</th>
                                <th>Quantidade</th>
                                <th>Localização</th>
                                <th>Motivo</th>
                                <th>Observações</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="stockMovementsTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
    },

    async load() {
        this._filterStartDate = document.getElementById('stockMovementsStartDate')?.value || '';
        this._filterEndDate = document.getElementById('stockMovementsEndDate')?.value || '';

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
        await this._fetchAndRender();
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
                            <input id="stockMovementsEntryLot" type="text" class="dialog-input" placeholder="Ex: LOT-001">
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
                        <input id="stockMovementsEntryQty" type="number" step="any" min="0.01" class="dialog-input" placeholder="0,00">
                    </label>
                    <label id="stockMovementsEntryPkgCountLabel" style="display:none">Quantidade de embalagens <span class="required">*</span>
                        <input id="stockMovementsEntryPkgCount" type="number" step="1" min="1" class="dialog-input" placeholder="0">
                        <span id="stockMovementsEntryPkgHint" class="stock-movements-pkg-hint"></span>
                    </label>
                    <label>Data <span class="required">*</span>
                        <input id="stockMovementsEntryDate" type="date" class="dialog-input" value="${today}">
                    </label>
                    ${showLocField ? `<label>Localização
                        <div id="stockMovementsEntryLocation"></div>
                    </label>` : ''}
                    <label>Observações
                        <input id="stockMovementsEntryNotes" type="text" class="dialog-input" placeholder="Opcional">
                    </label>
                </div>
            `,
            actions: [
                { label: 'Confirmar', className: 'btn-primary', icon: 'check', onClick: () => this._submitEntry() },
                { label: 'Cancelar', className: 'btn-secondary', onClick: () => this._entryDialog.close() },
            ],
        });
        this._entryDialog.open();

        this._dialogMaterialSelect = createSearchSelect({
            id: 'smEntryMat',
            placeholder: 'Selecione o material',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [{ key: 'mat', items: [] }],
            onChange: (sel) => this._onEntryMaterialChange(sel.value),
        });
        this._dialogMaterialSelect.mount(document.getElementById('stockMovementsEntryMaterial'));
        this._dialogMaterialSelect.setItems('mat', entryMaterials.map(m => ({ value: m.id, label: m.name })));

        if (showLocField) {
            this._dialogLocationSelect = createSearchSelect({
                id: 'smEntryLoc',
                placeholder: 'Selecione a localização',
                searchable: true,
                searchPlaceholder: 'Buscar...',
                sections: [{ key: 'loc', items: [] }],
                allowClear: true,
            });
            this._dialogLocationSelect.mount(document.getElementById('stockMovementsEntryLocation'));
            this._dialogLocationSelect.setItems('loc', this._locations.map(l => ({ value: l.id, label: l.name })));
            if (this._locations.length === 1) {
                this._dialogLocationSelect.select('loc', String(this._locations[0].id));
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
                        <input id="stockMovementsExitQty" type="number" step="any" min="0.01" class="dialog-input" placeholder="0,00">
                    </label>
                    <label id="stockMovementsExitPkgLabel" style="display:none">Embalagens <span class="required">*</span>
                        <input id="stockMovementsExitPkgCount" type="number" step="1" min="1" class="dialog-input" placeholder="0">
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
                        <input id="stockMovementsExitNotes" type="text" class="dialog-input" placeholder="Opcional">
                    </label>
                </div>
            `,
            actions: [
                { label: 'Confirmar', className: 'btn-primary', icon: 'check', onClick: () => this._submitExit() },
                { label: 'Cancelar', className: 'btn-secondary', onClick: () => this._exitDialog.close() },
            ],
        });
        this._exitDialog.open();

        this._dialogMaterialSelect = createSearchSelect({
            id: 'smExitMat',
            placeholder: 'Selecione o material',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [{ key: 'mat', items: [] }],
            onChange: (sel) => this._onExitMaterialChange(sel.value),
        });
        this._dialogMaterialSelect.mount(document.getElementById('stockMovementsExitMaterial'));
        this._dialogMaterialSelect.setItems('mat', this._materials.map(m => ({ value: m.id, label: m.name })));

        if (showLocField) {
            this._dialogLocationSelect = createSearchSelect({
                id: 'smExitLoc',
                placeholder: 'Selecione a localização',
                searchable: true,
                searchPlaceholder: 'Buscar...',
                sections: [{ key: 'loc', items: [] }],
                allowClear: true,
            });
            this._dialogLocationSelect.mount(document.getElementById('stockMovementsExitLocation'));
            this._dialogLocationSelect.setItems('loc', this._locations.map(l => ({ value: l.id, label: l.name })));
            if (this._locations.length === 1) {
                this._dialogLocationSelect.select('loc', String(this._locations[0].id));
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
                        <input id="stockMovementsTransferQty" type="number" step="any" min="0.01" class="dialog-input" placeholder="0,00">
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
                        <input id="stockMovementsTransferNotes" type="text" class="dialog-input" placeholder="Opcional">
                    </label>
                </div>
            `,
            actions: [
                { label: 'Confirmar', className: 'btn-primary', icon: 'check', onClick: () => this._submitTransfer() },
                { label: 'Cancelar', className: 'btn-secondary', onClick: () => this._transferDialog.close() },
            ],
        });
        this._transferDialog.open();

        this._dialogMaterialSelect = createSearchSelect({
            id: 'smTransferMat',
            placeholder: 'Selecione o material',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [{ key: 'mat', items: [] }],
        });
        this._dialogMaterialSelect.mount(document.getElementById('stockMovementsTransferMaterial'));
        this._dialogMaterialSelect.setItems('mat', this._materials.map(m => ({ value: m.id, label: m.name })));

        if (!originLoc) {
            this._dialogFromLocSelect = createSearchSelect({
                id: 'smTransferFrom',
                placeholder: 'Selecione a origem',
                searchable: true,
                searchPlaceholder: 'Buscar...',
                sections: [{ key: 'loc', items: [] }],
            });
            this._dialogFromLocSelect.mount(document.getElementById('stockMovementsTransferFrom'));
            this._dialogFromLocSelect.setItems('loc', this._locations.map(l => ({ value: l.id, label: l.name })));
        } else {
            this._dialogFromLocSelect = null;
        }

        this._dialogToLocSelect = createSearchSelect({
            id: 'smTransferTo',
            placeholder: 'Selecione o destino',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [{ key: 'loc', items: [] }],
        });
        this._dialogToLocSelect.mount(document.getElementById('stockMovementsTransferTo'));
        // Destino: todas as localizações exceto a origem
        const destLocs = originLoc
            ? this._locations.filter(l => String(l.id) !== String(globalLoc))
            : this._locations;
        this._dialogToLocSelect.setItems('loc', destLocs.map(l => ({ value: l.id, label: l.name })));
    },

    /**
     * Exclui uma movimentação.
     * @param {Event} event
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

        this._materialSelect = createSearchSelect({
            placeholder: 'Material',
            size: 'small',
            allowClear: true,
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [{ key: 'material', items: [] }],
            onChange: () => this._onFilterChange()
        });
        this._materialSelect.mount(container);
        this._materialSelect.setItems('material', this._materials.map(m => ({ value: m.id, label: m.name })));
    },

    _setType(type) {
        this._filterType = type;
        document.querySelectorAll('.stock-movements-type-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === type);
        });
        this._fetchAndRender();
    },

    _onFilterChange() {
        this._filterStartDate = document.getElementById('stockMovementsStartDate')?.value || '';
        this._filterEndDate = document.getElementById('stockMovementsEndDate')?.value || '';
        this._fetchAndRender();
    },

    async _fetchAndRender() {
        const params = new URLSearchParams();
        const selectedMaterial = this._materialSelect?.getValue();
        const locationId = AppState.getLocationFilter();

        if (selectedMaterial) params.set('material_id', selectedMaterial.value);
        if (locationId) params.set('location_id', locationId);
        if (this._filterType) params.set('type', this._filterType);
        if (this._filterStartDate) params.set('startDate', this._filterStartDate);
        if (this._filterEndDate) params.set('endDate', this._filterEndDate);

        try {
            this._data = await apiCall(API + '/stock-movements?' + params.toString()) || [];
        } catch (e) { alert(e.message); return; }

        this._renderTable();
    },

    _renderTable() {
        const tbody = document.getElementById('stockMovementsTableBody');
        if (!tbody) return;

        if (this._data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="stock-movements-empty">Nenhuma movimentação encontrada.</td></tr>';
            return;
        }

        const canDelete = hasPermission('inventory', 'stock-movements', 'delete');

        tbody.innerHTML = this._data.map(row => {
            const date = row.date ? new Date(row.date + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
            const isEntry = row.type === 'entry';
            const typeLabel = isEntry ? 'Entrada' : 'Saída';
            const typeClass = isEntry ? 'stock-movements-type-entry' : 'stock-movements-type-exit';
            const qty = Number(row.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            const reason = this._formatReason(row.reason);
            const location = row.location_name ? _esc(row.location_name) : '—';
            const notes = row.notes ? _esc(row.notes) : '';
            const material = _esc(row.material_name || '');

            const deleteBtn = canDelete && !row.lot_id
                ? `<button class="stock-movements-delete-btn" title="Excluir" onclick="StockMovements.deleteMovement(event, ${row.id})">
                       <span class="material-symbols-outlined">delete</span>
                   </button>`
                : '';

            return `<tr>
                <td>${date}</td>
                <td><span class="${typeClass}">${typeLabel}</span></td>
                <td>${material}</td>
                <td class="stock-movements-qty ${typeClass}">${isEntry ? '+' : '-'}${qty}</td>
                <td>${location}</td>
                <td>${reason}</td>
                <td class="stock-movements-notes">${notes}</td>
                <td>${deleteBtn}</td>
            </tr>`;
        }).join('');
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

    /** Atualiza o dialog de entrada quando o material muda */
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

        // Rastreio por lote
        if (this._entryMaterialData.tracking_mode === 'lot') {
            if (trackingGroup) trackingGroup.style.display = '';
            this._onEntryTrackModeChange();
        }

        // Embalagens
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

    /** Alterna visibilidade do campo de número do lote */
    _onEntryTrackModeChange() {
        const mode = document.getElementById('stockMovementsEntryTrackMode')?.value;
        const lotLabel = document.getElementById('stockMovementsEntryLotLabel');
        if (lotLabel) lotLabel.style.display = mode === 'lot' ? '' : 'none';
    },

    /** Alterna entre modo quantidade / embalagem na entrada */
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

    /** Ajusta campos quando a embalagem selecionada muda */
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
        // Embalagem com quantidade definida: só pede contagem de embalagens
        // Embalagem sem quantidade: pede os dois
        if (qty) {
            if (qtyLabel) qtyLabel.style.display = 'none';
            if (pkgCountLabel) pkgCountLabel.style.display = '';
        } else {
            if (qtyLabel) qtyLabel.style.display = '';
            if (pkgCountLabel) pkgCountLabel.style.display = '';
        }
    },

    /** Atualiza o dialog de saída quando o material muda */
    async _onExitMaterialChange(materialId) {
        const pkgGroup = document.getElementById('stockMovementsExitPkgGroup');
        const pkgOption = document.getElementById('stockMovementsExitPkgOption');
        const hintEl = document.getElementById('stockMovementsExitPkgHint');
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

        // Reset to kg mode
        const modeEl = document.getElementById('stockMovementsExitMode');
        if (modeEl) modeEl.value = 'kg';
        this._onExitModeChange();
    },

    /** Atualiza hint quando a embalagem selecionada muda */
    _onExitPkgSelectChange() {
        const sel = document.getElementById('stockMovementsExitPkgSelect');
        if (!sel) return;
        const opt = sel.selectedOptions[0];
        const qty = parseFloat(opt?.dataset.qty) || 0;
        const hintEl = document.getElementById('stockMovementsExitPkgHint');
        if (hintEl) hintEl.textContent = qty ? `${qty} kg por embalagem` : '';
        this._exitPkgWeight = qty;
    },

    /** Alterna entre modo kg/embalagem no dialog de saída */
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
        const locationId = location ? Number(location.value) : (AppState.getLocationFilter() ? Number(AppState.getLocationFilter()) : undefined);

        if (!material) { alert('Selecione um material.'); return; }
        if (!qty || qty <= 0) { alert('Informe uma quantidade válida.'); return; }
        if (!date) { alert('Informe a data.'); return; }

        try {
            await apiCall(API + '/stock-movements/entry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    material_id: material.value,
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
        const locationId = location ? Number(location.value) : (AppState.getLocationFilter() ? Number(AppState.getLocationFilter()) : undefined);

        if (!material) { alert('Selecione um material.'); return; }
        if (!qty || qty <= 0) { alert('Informe uma quantidade válida.'); return; }
        if (!date) { alert('Informe a data.'); return; }

        try {
            await apiCall(API + '/stock-movements/exit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    material_id: material.value,
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

        const fromLocationId = fromLoc ? Number(fromLoc.value) : (AppState.getLocationFilter() ? Number(AppState.getLocationFilter()) : null);
        const toLocationId = toLoc ? Number(toLoc.value) : null;

        if (!material) { alert('Selecione um material.'); return; }
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
                    material_id: material.value,
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
