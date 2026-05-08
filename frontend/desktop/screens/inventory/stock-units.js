/**
 * stock-units.js
 * Tela de Lotes — listagem, edição, uso/devolução e exclusão de lotes.
 */
const StockUnits = {

    // ── Estado ──

    selectedBag: null,
    _filterStatus: '',
    _materialSelect: null,
    _supplierSelect: null,
    _dataTable: null,
    _batchDialog: null,
    _detailDialog: null,
    _partialExitDialog: null,
    _exitDialog: null,
    _returnDialog: null,
    _deleteDialog: null,
    _simpleExitDialog: null,
    _simpleExitData: null,
    _exitBag: null,
    _selectedIds: new Set(),
    _showOnlySelected: false,

    // ── Ciclo de Vida ──

    render() {
        this._batchDialog?.destroy();       this._batchDialog       = null;
        this._detailDialog?.destroy();      this._detailDialog      = null;
        this._partialExitDialog?.destroy(); this._partialExitDialog = null;
        this._exitDialog?.destroy();        this._exitDialog        = null;
        this._returnDialog?.destroy();      this._returnDialog      = null;
        this._deleteDialog?.destroy();      this._deleteDialog      = null;
        this._simpleExitDialog?.destroy();  this._simpleExitDialog  = null;
        this._simpleExitData = null;
        this._exitBag = null;
        this._materialSelect?.destroy(); this._materialSelect = null;
        this._supplierSelect?.destroy(); this._supplierSelect = null;
        this._dataTable?.destroy();      this._dataTable      = null;
        this._filterStatus = '';
        this._selectedIds = new Set();
        this._showOnlySelected = false;
        return `
        <div class="stock-units-container">
            <div id="stockUnitsBatchBar" class="stock-units-batch-bar" style="display:none">
                <span id="stockUnitsBatchCount"></span>
                <button class="stock-units-batch-btn" onclick="StockUnits.openBatchOut()">
                    <span class="material-symbols-outlined">output</span>
                    Dar saída
                </button>
                <button class="stock-units-batch-cancel" onclick="StockUnits._clearSelection()">Cancelar seleção</button>
            </div>
            <div class="stock-units-filters">
                <div class="stock-units-filters-icon-wrap">
                    <span class="material-symbols-outlined stock-units-filters-icon">filter_list</span>
                </div>
                <div class="stock-units-status-pills">
                    <button class="stock-units-status-pill" data-value="" onclick="StockUnits._setStatus('')">Todos</button>
                    <button class="stock-units-status-pill" data-value="IN_STOCK" onclick="StockUnits._setStatus('IN_STOCK')">Em estoque</button>
                    <button class="stock-units-status-pill" data-value="OUT_STOCK" onclick="StockUnits._setStatus('OUT_STOCK')">Usado</button>
                </div>
                <div id="stockUnitsMaterialContainer" class="stock-units-filter-select-wrap"></div>
                <div id="stockUnitsSupplierContainer" class="stock-units-filter-select-wrap"></div>
                <input id="search" class="stock-units-search" placeholder="Buscar" oninput="StockUnits.load()">
                <button id="filterSelectedBtn" class="stock-units-filter-selected-btn" onclick="StockUnits._toggleShowSelected()" title="Mostrar apenas selecionados">
                    <span class="material-symbols-outlined">checklist</span>
                    Selecionados
                </button>
            </div>
            <div id="stockUnitsTableContainer"></div>
        </div>
        `;
    },

    async load() {
        this._resetForm();

        if (!this._batchDialog)  this._batchDialog  = this._createBatchDialog();
        if (!this._detailDialog) this._detailDialog = this._createDetailDialog();

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    {
                        key: '_check',
                        header: `<input type="checkbox" id="checkAll" onchange="StockUnits._onCheckAll(this)" title="Selecionar todos">`,
                        width: '36px',
                        render: r => {
                            if (r.tracking_mode === 'simple') return '';
                            const isActive = r.status === 'IN_STOCK' || r.status === 'PARTIAL';
                            if (!isActive || !hasPermission('inventory', 'stock-units', 'edit')) return '';
                            const isChecked = StockUnits._selectedIds.has(String(r.id));
                            return `<span onclick="event.stopPropagation()"><input type="checkbox" class="stock-units-row-check" data-id="${r.id}" onchange="StockUnits._onRowCheck(this,'${r.id}')" ${isChecked ? 'checked' : ''}></span>`;
                        },
                    },
                    {
                        key: '_status', header: '', width: '32px',
                        render: r => {
                            if (r.tracking_mode === 'simple') return '';
                            if (r.status === 'PARTIAL') return '<span class="material-symbols-outlined stock-units-status-partial">timelapse</span>';
                            if (r.status !== 'IN_STOCK') return '<span class="material-symbols-outlined stock-units-status-check">check_circle</span>';
                            return '';
                        },
                    },
                    {
                        key: 'id', header: 'Código',
                        render: r => r.tracking_mode === 'simple'
                            ? `<span class="code-badge stock-units-badge-simple">Simples</span>`
                            : `<span class="code-badge">${StockUnits._codeFor(r)}</span>`,
                    },
                    {
                        key: 'old_id', header: 'ID Antigo', width: '130px',
                        render: r => {
                            if (r.tracking_mode === 'simple') return '';
                            return r.old_id && r.old_id !== StockUnits._codeFor(r) ? r.old_id : '';
                        },
                    },
                    { key: 'material', header: 'Material', render: r => r.material },
                    { key: 'supplier', header: 'Fornecedor', render: r => r.supplier || '' },
                    { key: 'operator', header: 'Operador', render: r => r.operator || '' },
                    {
                        key: 'weight', header: 'Quantidade',
                        render: r => {
                            if (r.tracking_mode === 'simple') return String(r.balance);
                            if (r.status === 'PARTIAL') return `${r.remaining_weight} <span class="stock-units-remaining-label">/ ${r.weight}</span>`;
                            return String(r.weight);
                        },
                    },
                    {
                        key: '_wait', header: '⏱', width: '60px',
                        render: r => {
                            if (r.tracking_mode === 'simple') return '—';
                            return `${calculateDaysDifference(r.date_in, r.date_out)}d`;
                        },
                    },
                    { key: 'notes', header: 'Obs', render: r => r.notes ?? '' },
                ],
                getRowKey: r => r.tracking_mode === 'simple' ? `simple-${r.material_id}` : String(r.id),
                onRowClick: r => StockUnits.selectStockUnit(r),
                actions: [
                    {
                        label: 'Saída parcial', icon: 'timelapse',
                        hidden: r => r.tracking_mode === 'simple' || !r.allow_partial_exit
                            || (r.status !== 'IN_STOCK' && r.status !== 'PARTIAL')
                            || !hasPermission('inventory', 'stock-units', 'edit'),
                        onClick: r => StockUnits.openPartialExit(null, r.id),
                    },
                    {
                        label: 'Saída total', icon: 'output',
                        hidden: r => r.tracking_mode === 'simple'
                            || (r.status !== 'IN_STOCK' && r.status !== 'PARTIAL')
                            || !hasPermission('inventory', 'stock-units', 'edit'),
                        onClick: r => StockUnits.openExitDialog(null, r.id),
                    },
                    {
                        label: 'Saída', icon: 'output',
                        hidden: r => r.tracking_mode !== 'simple' || !(Number(r.balance || 0) > 0)
                            || !hasPermission('inventory', 'stock-units', 'edit'),
                        onClick: r => StockUnits.openSimpleExitDialog(null, r.material_id),
                    },
                    {
                        label: 'Retornar ao estoque', icon: 'undo',
                        hidden: r => r.tracking_mode === 'simple' || r.status === 'IN_STOCK'
                            || !hasPermission('inventory', 'stock-units', 'edit'),
                        onClick: r => StockUnits.openReturnDialog(null, r.id),
                    },
                    {
                        label: 'Excluir', icon: 'delete', variant: 'destructive',
                        hidden: () => !hasPermission('inventory', 'stock-units', 'delete'),
                        onClick: r => StockUnits.deleteStockUnit(null, r.id),
                    },
                ],
                emptyMessage: 'Nenhuma unidade de estoque encontrada.',
                emptyIcon: 'inventory_2',
            });
            this._dataTable.mount(document.getElementById('stockUnitsTableContainer'));
        }

        this._dataTable.setLoading(true);

        try {
            const stockUnits = await apiCall(API + '/stock-units') || [];

            const isFirstLoad = !this._materialSelect;
            this._populateFilters(stockUnits);

            if (isFirstLoad) {
                this._filterStatus = localStorage.getItem('wcm.stockUnits.status') || '';
                const presetMaterial = this._presetMaterial || '';
                this._presetMaterial = null;
                const savedMaterial = presetMaterial || localStorage.getItem('wcm.stockUnits.material') || '';
                const savedSupplier = localStorage.getItem('wcm.stockUnits.supplier') || '';
                const searchEl = document.getElementById('search');
                if (searchEl) searchEl.value = localStorage.getItem('wcm.stockUnits.search') || '';
                if (presetMaterial) {
                    this._filterStatus = 'IN_STOCK';
                    localStorage.setItem('wcm.stockUnits.material', presetMaterial);
                }
                if (savedMaterial) this._materialSelect.select('material', savedMaterial);
                if (savedSupplier) this._supplierSelect.select('supplier', savedSupplier);
            }

            localStorage.setItem('wcm.stockUnits.search', document.getElementById('search')?.value || '');
            this._updateStatusPills();

            const filters = this._getFilters();
            const filtered = stockUnits.filter(bag => this._matchesFilters(bag, filters));

            this._dataTable.setData(filtered);
            this._updateSelectedFilterBtn();
            this._updateBatchBar();
        } catch {
            alert('Erro ao carregar estoque');
            this._dataTable.setLoading(false);
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    selectStockUnit(bag) {
        clearTableSelection();

        document.getElementById('code').value = this._codeFor(bag);
        document.getElementById('old_id').value = bag.old_id || '';
        document.getElementById('material').value = bag.material;
        document.getElementById('supplier').value = bag.supplier || '';
        document.getElementById('operator').value = bag.operator || '';
        document.getElementById('weight').value = bag.weight;
        document.getElementById('stockUnitsRemainingWeight').value = bag.remaining_weight != null ? bag.remaining_weight : bag.weight;
        document.getElementById('date_in').value = bag.date_in;
        document.getElementById('date_out').value = bag.date_out || '';
        document.getElementById('notes').value = bag.notes ?? '';
        document.getElementById('deduction_type').value = bag.deduction_type || 'uso';

        const _detailToggle = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; };
        _detailToggle('stockUnitsFieldOldId',      !!(bag.old_id && bag.old_id !== this._codeFor(bag)));
        _detailToggle('stockUnitsFieldSupplier',   !!bag.supplier);
        _detailToggle('stockUnitsFieldOperator',   !!bag.operator);
        _detailToggle('stockUnitsRemainingField',  bag.status === 'PARTIAL');
        _detailToggle('stockUnitsFieldDateOut',    !!bag.date_out);
        _detailToggle('deductionTypeField',        !!bag.date_out);
        _detailToggle('stockUnitsFieldNotes',      !!bag.notes);

        this._detailDialog.setTitle(this._codeFor(bag));
        this._detailDialog.open();
        this.selectedBag = bag.id;
    },

    async editStockUnit() {
        const dateOut = document.getElementById('date_out').value;
        const data = {
            id: this.selectedBag,
            date_out: dateOut,
            status: getStatusFromDate(dateOut),
            notes: document.getElementById('notes').value,
            deduction_type: dateOut ? document.getElementById('deduction_type').value : null
        };

        try {
            await apiCall(API + '/stock-units/update', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            this._clearAndReload();
            alert('Salvo com sucesso');
        } catch {
            alert('Erro ao salvar');
        }
    },

    openExitDialog(event, id) {
        if (event) event.stopPropagation();
        apiCall(API + '/stock-units').then(stockUnits => {
            const bag = (stockUnits || []).find(b => String(b.id) === String(id));
            if (!bag) { alert('Unidade não encontrada'); return; }
            this._exitBag = bag;

            this._exitDialog?.destroy();
            const isPartial = bag.status === 'PARTIAL';
            const remaining = bag.remaining_weight != null ? bag.remaining_weight : bag.weight;
            const subtitleHTML = isPartial
                ? `<span style="color:var(--color-warning)">Este lote tem saída parcial. Será dado saída no saldo restante: <strong>${remaining} kg</strong>.</span>`
                : `Peso total: <strong>${bag.weight} kg</strong>`;

            this._exitDialog = createDialog({
                title: `Saída — ${this._codeFor(bag)}`,
                subtitleHTML: subtitleHTML,
                bodyHTML: `
                    <div class="dialog-field">
                        <label for="stockUnitsExitDate">Data de saída</label>
                        <input type="date" id="stockUnitsExitDate" class="stock-units-edit-input" value="${new Date().toISOString().slice(0, 10)}">
                    </div>
                    <div class="dialog-field">
                        <label for="stockUnitsExitType">Tipo de baixa</label>
                        <select id="stockUnitsExitType" class="stock-units-edit-input">
                            <option value="uso">Uso</option>
                            <option value="ajuste">Ajuste</option>
                        </select>
                    </div>
                `,
                actions: [
                    { label: 'Confirmar saída', className: 'btn-primary', icon: 'output', onClick: () => StockUnits._confirmExitDialog() },
                    { label: 'Cancelar', className: 'btn-secondary', onClick: () => StockUnits._exitDialog?.close() },
                ],
            });
            this._exitDialog.open();
        }).catch(() => alert('Erro ao carregar unidade'));
    },

    async _confirmExitDialog() {
        const dateOut = document.getElementById('stockUnitsExitDate')?.value;
        const deductionType = document.getElementById('stockUnitsExitType')?.value || 'uso';
        if (!dateOut) { alert('Informe a data de saída'); return; }

        const bag = this._exitBag;
        this._exitDialog?.close();

        try {
            await apiCall(`${API}/stock-units/${bag.id}/out`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: dateOut, deduction_type: deductionType }),
            });
            this.load();
        } catch (e) {
            alert(e.message || 'Erro ao registrar saída');
        }
    },

    openReturnDialog(event, id) {
        if (event) event.stopPropagation();
        Promise.all([
            apiCall(API + '/stock-units'),
            apiCall(`${API}/stock-movements?lot_id=${id}&type=exit`),
        ]).then(([stockUnits, exits]) => {
            const bag = (stockUnits || []).find(b => String(b.id) === String(id));
            if (!bag) { alert('Unidade não encontrada'); return; }

            const exitRows = exits || [];
            if (!exitRows.length) {
                alert('Nenhuma saída encontrada para este lote.');
                return;
            }

            this._returnDialog?.destroy();
            const rowsHTML = exitRows.map((m) => {
                const date = m.date ? new Date(m.date + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
                const type = m.reason === 'adjustment' ? 'Ajuste' : 'Uso';
                return `<label class="stock-units-return-row">
                    <input type="checkbox" class="stock-units-return-chk" data-movement-id="${m.id}" checked>
                    <span class="stock-units-return-date">${date}</span>
                    <span class="stock-units-return-qty">${m.quantity} kg</span>
                    <span class="stock-units-return-type">${type}</span>
                </label>`;
            }).join('');

            this._returnDialog = createDialog({
                title: `Retornar ao estoque — ${this._codeFor(bag)}`,
                subtitle: 'Selecione as saídas que deseja reverter:',
                bodyHTML: `<div class="stock-units-return-list">${rowsHTML}</div>`,
                actions: [
                    { label: 'Confirmar retorno', className: 'btn-primary', icon: 'undo', onClick: () => StockUnits._confirmReturnDialog() },
                    { label: 'Cancelar', className: 'btn-secondary', onClick: () => StockUnits._returnDialog?.close() },
                ],
            });
            this._returnDialog.open();
        }).catch(() => alert('Erro ao carregar saídas do lote'));
    },

    async _confirmReturnDialog() {
        const checkboxes = document.querySelectorAll('.stock-units-return-chk:checked');
        const movementIds = [...checkboxes].map(cb => cb.dataset.movementId);
        if (!movementIds.length) { alert('Selecione ao menos uma saída para reverter'); return; }

        this._returnDialog?.close();
        try {
            await Promise.all(movementIds.map(mid =>
                apiCall(`${API}/stock-movements/${mid}`, { method: 'DELETE' })
            ));
            this.load();
        } catch (e) {
            alert(e.message || 'Erro ao reverter saídas');
        }
    },

    async useStockUnit(event, id) {
        if (event) event.stopPropagation();
        await this._updateStockUnitStatus(id, 'out');
    },

    async returnStockUnit(event, id) {
        if (event) event.stopPropagation();
        await this._updateStockUnitStatus(id, 'in');
    },

    async deleteStockUnit(event, id) {
        if (event) event.stopPropagation();

        const canDeleteLot    = hasPermission('inventory', 'stock-units', 'delete');
        const canEditReceipts = hasPermission('procurement', 'receipts', 'edit');
        if (!canDeleteLot) return;

        const stockUnits = await apiCall(API + '/stock-units').catch(() => []);
        const bag = (stockUnits || []).find(b => String(b.id) === String(id));
        const receiptId = bag?.receipt_id || null;

        this._deleteDialog?.destroy();
        this._deleteDialog = createDialog({
            title: 'Excluir lote',
            subtitle: 'Esta ação não pode ser desfeita.',
            wide: true,
            bodyHTML: `<p class="stock-units-delete-warning">A exclusão do lote <strong>${bag ? this._codeFor(bag) : '#' + id}</strong> também removerá os movimentos de estoque vinculados e impactará o recebimento associado.</p>`,
            actions: [
                { label: 'Excluir', className: 'btn-danger', icon: 'delete', onClick: async () => {
                    this._deleteDialog?.close();
                    try {
                        await apiCall(`${API}/stock-units/${id}`, { method: 'DELETE' });
                        this.load();
                    } catch (e) { alert(e.message || 'Erro ao excluir lote'); }
                }},
                ...(receiptId && canEditReceipts ? [{ label: 'Editar recebimento', icon: 'edit', onClick: async () => {
                    this._deleteDialog?.close();
                    try {
                        const receipts = await apiCall(API + '/receipts');
                        Receipts.selectedReceipt = (receipts || []).find(r => String(r.id) === String(receiptId)) || null;
                    } catch { Receipts.selectedReceipt = null; }
                    openNewTab('receipt-details');
                }}] : []),
                { label: 'Cancelar', className: 'btn-secondary', onClick: () => this._deleteDialog?.close() },
            ],
        });
        this._deleteDialog.open();
    },

    cancelEdit() {
        this._clearAndReload();
    },

    // ── Filtros ──

    _populateFilters(bags) {
        const activeLoc = AppState.getLocationFilter();
        const visibleBags = activeLoc ? bags.filter(b => String(b.location_id) === String(activeLoc)) : bags;
        const materials = [...new Set(visibleBags.map(b => b.material).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        const suppliers = [...new Set(visibleBags.map(b => b.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b));

        if (!this._materialSelect) {
            this._materialSelect = createSearchSelect({
                id: 'stockUnitsMaterial',
                placeholder: 'Material',
                searchable: true,
                multiple: false,
                sections: [{ key: 'material', items: [] }],
                onChange: ({ value }) => {
                    localStorage.setItem('wcm.stockUnits.material', value != null ? String(value) : '');
                    StockUnits.load();
                }
            });
            this._materialSelect.mount(document.getElementById('stockUnitsMaterialContainer'));
        }

        if (!this._supplierSelect) {
            this._supplierSelect = createSearchSelect({
                id: 'stockUnitsSupplier',
                placeholder: 'Fornecedor',
                searchable: true,
                multiple: false,
                sections: [{ key: 'supplier', items: [] }],
                onChange: ({ value }) => {
                    localStorage.setItem('wcm.stockUnits.supplier', value != null ? String(value) : '');
                    StockUnits.load();
                }
            });
            this._supplierSelect.mount(document.getElementById('stockUnitsSupplierContainer'));
        }

        this._materialSelect.setItems('material', materials.map(m => ({ value: m, label: m })));
        this._supplierSelect.setItems('supplier', suppliers.map(s => ({ value: s, label: s })));
    },

    _getFilters() {
        const materialSel = this._materialSelect?.getValue();
        const supplierSel = this._supplierSelect?.getValue();
        return {
            status: this._filterStatus || null,
            material: materialSel ? String(materialSel.value) : null,
            supplier: supplierSel ? String(supplierSel.value) : null,
            search: document.getElementById('search')?.value.toLowerCase() || null,
            onlySelected: this._showOnlySelected,
            location: AppState.getLocationFilter() || null,
        };
    },

    _matchesFilters(bag, filters) {
        if (filters.onlySelected && !this._selectedIds.has(String(bag.id))) return false;
        if (filters.status === 'IN_STOCK' && bag.status !== 'IN_STOCK' && bag.status !== 'PARTIAL') return false;
        if (filters.status && filters.status !== 'IN_STOCK' && bag.status !== filters.status) return false;
        if (filters.material && bag.material !== filters.material) return false;
        if (filters.supplier && bag.supplier !== filters.supplier) return false;
        if (filters.location && String(bag.location_id) !== String(filters.location)) return false;

        if (filters.search) {
            const searchText = [
                this._codeFor(bag),
                bag.old_id ?? '',
                bag.material ?? '',
                bag.supplier ?? '',
                bag.operator ?? '',
                bag.notes ?? ''
            ].join('-').toLowerCase();
            if (!searchText.includes(filters.search)) return false;
        }

        return true;
    },

    // ── Seleção em lote ──

    _onCheckAll(checkbox) {
        this._selectedIds = new Set();
        document.querySelectorAll('.stock-units-row-check').forEach(cb => {
            cb.checked = checkbox.checked;
            if (checkbox.checked) this._selectedIds.add(String(cb.dataset.id));
        });
        this._updateBatchBar();
    },

    _onRowCheck(checkbox, id) {
        if (checkbox.checked) {
            this._selectedIds.add(String(id));
        } else {
            this._selectedIds.delete(String(id));
            const checkAll = document.getElementById('checkAll');
            if (checkAll) checkAll.checked = false;
        }
        this._updateBatchBar();
    },

    _updateBatchBar() {
        const bar = document.getElementById('stockUnitsBatchBar');
        const countEl = document.getElementById('stockUnitsBatchCount');
        if (!bar) return;
        const n = this._selectedIds.size;
        if (n > 0) {
            bar.style.display = '';
            countEl.textContent = `${n} ${n === 1 ? 'item selecionado' : 'itens selecionados'}`;
        } else {
            bar.style.display = 'none';
        }
    },

    _clearSelection() {
        this._selectedIds = new Set();
        this._showOnlySelected = false;
        document.querySelectorAll('.stock-units-row-check').forEach(cb => cb.checked = false);
        const checkAll = document.getElementById('checkAll');
        if (checkAll) checkAll.checked = false;
        this._updateBatchBar();
        this._updateSelectedFilterBtn();
        this.load();
    },

    _setStatus(value) {
        this._filterStatus = value;
        localStorage.setItem('wcm.stockUnits.status', value);
        this.load();
    },

    _updateStatusPills() {
        document.querySelectorAll('.stock-units-status-pill').forEach(btn => {
            btn.classList.toggle('stock-units-status-pill--active', btn.dataset.value === (this._filterStatus || ''));
        });
    },

    _toggleShowSelected() {
        this._showOnlySelected = !this._showOnlySelected;
        this._updateSelectedFilterBtn();
        this.load();
    },

    _updateSelectedFilterBtn() {
        const btn = document.getElementById('filterSelectedBtn');
        if (!btn) return;
        btn.classList.toggle('stock-units-filter-selected-btn--active', this._showOnlySelected);
    },

    openBatchOut() {
        if (!this._batchDialog) return;
        const n = this._selectedIds.size;
        this._batchDialog.setSubtitle(`${n} ${n === 1 ? 'item será baixado' : 'itens serão baixados'}.`);
        document.getElementById('batchDateOut').value = new Date().toISOString().slice(0, 10);
        document.getElementById('batchDeductionType').value = 'uso';
        this._batchDialog.open();
    },

    closeBatchDialog() {
        this._batchDialog?.close();
    },

    async confirmBatchOut() {
        const dateOut = document.getElementById('batchDateOut').value;
        const deductionType = document.getElementById('batchDeductionType').value;
        if (!dateOut) { alert('Informe a data de saída'); return; }
        this.closeBatchDialog();

        const ids = [...this._selectedIds];
        try {
            await Promise.all(ids.map(id =>
                apiCall(`${API}/stock-units/update`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, date_out: dateOut, status: 'OUT_STOCK', notes: '', deduction_type: deductionType })
                })
            ));
            this._selectedIds = new Set();
            this.load();
        } catch {
            alert('Erro ao dar saída nos itens selecionados');
        }
    },

    _onDateOutChange() {
        const dateOut = document.getElementById('date_out').value;
        const field = document.getElementById('deductionTypeField');
        field.style.display = dateOut ? '' : 'none';
        if (!dateOut) document.getElementById('deduction_type').value = 'uso';
    },

    // ── Utilitários Privados ──

    _codeFor(bag) {
        const prefix = bag.nature?.charAt(0) ?? '';
        const vol = String(bag.volume_id ?? '').padStart(3, '0');
        return `#${prefix}${bag.receipt_id}-${vol}`;
    },

    _resetForm() {
        this._detailDialog?.close();
        const headerOptions = document.getElementById('headerOptionsContent');
        if (headerOptions) headerOptions.innerHTML = '';
    },

    _clearForm() {
        clearFormInputs(['code', 'material', 'supplier', 'operator', 'weight', 'date_in', 'date_out', 'notes']);
        const deductionTypeField = document.getElementById('deductionTypeField');
        if (deductionTypeField) deductionTypeField.style.display = 'none';
        const deductionTypeEl = document.getElementById('deduction_type');
        if (deductionTypeEl) deductionTypeEl.value = 'uso';
        clearTableSelection();
    },

    _clearAndReload() {
        this._clearForm();
        this.load();
    },

    async _updateStockUnitStatus(id, action) {
        try {
            await apiCall(`${API}/stock-units/${id}/${action}`, { method: 'PUT' });
            this.load();
        } catch {
            alert(`Erro ao ${action === 'out' ? 'usar' : 'devolver'} unidade de estoque`);
        }
    },

    _createBatchDialog() {
        return createDialog({
            title: 'Saída em Lote',
            subtitle: '',
            bodyHTML: `
                <div class="dialog-field">
                    <label for="batchDateOut">Data de saída</label>
                    <input type="date" id="batchDateOut" class="stock-units-edit-input">
                </div>
                <div class="dialog-field">
                    <label for="batchDeductionType">Tipo de baixa</label>
                    <select id="batchDeductionType" class="stock-units-edit-input">
                        <option value="uso">Uso</option>
                        <option value="ajuste">Ajuste</option>
                    </select>
                </div>
            `,
            actions: [
                { label: 'Confirmar', className: 'btn-primary', onClick: () => StockUnits.confirmBatchOut() },
                { label: 'Cancelar',  className: 'btn-secondary', onClick: () => StockUnits.closeBatchDialog() },
            ],
        });
    },

    _createDetailDialog() {
        return createDialog({
            title: '',
            wide: true,
            closeOnBackdrop: true,
            onClose: () => clearTableSelection(),
            bodyHTML: `
                <div class="stock-units-edit-fields">
                    <div class="stock-units-edit-field">
                        <label>Código</label>
                        <input readonly id="code" class="stock-units-edit-input" placeholder="Código">
                    </div>
                    <div id="stockUnitsFieldOldId" class="stock-units-edit-field">
                        <label>ID Antigo</label>
                        <input readonly id="old_id" class="stock-units-edit-input" placeholder="ID Antigo">
                    </div>
                    <div class="stock-units-edit-field">
                        <label>Material</label>
                        <input readonly id="material" class="stock-units-edit-input" placeholder="Material">
                    </div>
                    <div id="stockUnitsFieldSupplier" class="stock-units-edit-field">
                        <label>Fornecedor</label>
                        <input readonly id="supplier" class="stock-units-edit-input" placeholder="Fornecedor">
                    </div>
                    <div id="stockUnitsFieldOperator" class="stock-units-edit-field">
                        <label>Operador</label>
                        <input readonly id="operator" class="stock-units-edit-input" placeholder="Operador">
                    </div>
                    <div class="stock-units-edit-field">
                        <label>Peso</label>
                        <input readonly id="weight" class="stock-units-edit-input" placeholder="Peso">
                    </div>
                    <div id="stockUnitsRemainingField" class="stock-units-edit-field" style="display:none">
                        <label>Restante</label>
                        <input readonly id="stockUnitsRemainingWeight" class="stock-units-edit-input" placeholder="Restante">
                    </div>
                    <div class="stock-units-edit-field">
                        <label>Entrada</label>
                        <input readonly id="date_in" type="date" class="stock-units-edit-input">
                    </div>
                    <div id="stockUnitsFieldDateOut" class="stock-units-edit-field">
                        <label>Saída</label>
                        <input readonly id="date_out" type="date" class="stock-units-edit-input">
                    </div>
                    <div id="deductionTypeField" class="stock-units-edit-field" style="display:none">
                        <label>Tipo de Baixa</label>
                        <select id="deduction_type" class="stock-units-edit-input" disabled>
                            <option value="uso">Uso</option>
                            <option value="ajuste">Ajuste</option>
                        </select>
                    </div>
                    <div id="stockUnitsFieldNotes" class="stock-units-edit-field stock-units-edit-field-obs">
                        <label>Obs</label>
                        <input readonly id="notes" class="stock-units-edit-input" placeholder="Observação">
                    </div>
                </div>
            `,
            actions: [
                { label: 'Fechar', className: 'btn-secondary', onClick: () => StockUnits._detailDialog?.close() },
            ],
        });
    },

    openPartialExit(event, id) {
        if (event) event.stopPropagation();
        apiCall(API + '/stock-units').then(async stockUnits => {
            const bag = (stockUnits || []).find(b => String(b.id) === String(id));
            if (!bag) { alert('Unidade não encontrada'); return; }
            try {
                const mat = await apiCall(API + `/materials/${bag.material_id}`);
                bag._packagings = mat.packagings || [];
            } catch { bag._packagings = []; }
            this._showPartialExitDialog(bag);
        }).catch(() => alert('Erro ao carregar dados'));
    },

    _showPartialExitDialog(bag) {
        this._partialExitDialog?.destroy();
        this._partialExitBagLocationId = bag.location_id || null;

        const packagings = bag._packagings || [];
        const hasPkg = packagings.some(p => p.quantity);
        const remaining = bag.remaining_weight != null ? bag.remaining_weight : bag.weight;

        let pkgOptionsHTML = '';
        if (hasPkg) {
            const opts = packagings.filter(p => p.quantity).map(p => {
                const maxPkgs = Math.floor(remaining / p.quantity);
                return `<option value="${p.id}" data-qty="${p.quantity}" data-max="${maxPkgs}">${_esc(p.name)}</option>`;
            }).join('');
            pkgOptionsHTML = `
                <label>Modo de saída
                    <select id="stockUnitsPartialMode" class="dialog-input" onchange="StockUnits._onPartialModeChange()">
                        <option value="kg">Por peso (kg)</option>
                        <option value="pkg">Por embalagem</option>
                    </select>
                </label>
                <label id="stockUnitsPartialPkgLabel" style="display:none">Embalagem
                    <select id="stockUnitsPartialPkgSelect" class="dialog-input" onchange="StockUnits._onPkgSelectChange()">
                        ${opts}
                    </select>
                </label>
                <label id="stockUnitsPartialPkgCountLabel" style="display:none">Quantidade de embalagens <span class="required">*</span>
                    <input id="stockUnitsPartialPkgCount" type="number" step="1" min="1" class="dialog-input" placeholder="0"
                           oninput="StockUnits._onPkgCountChange()">
                    <span id="stockUnitsPartialPkgHint" class="stock-units-pkg-hint"></span>
                </label>`;
        }

        this._partialExitDialog = createDialog({
            title: 'Saída Parcial',
            subtitle: `${this._codeFor(bag)} — ${bag.material} — Restante: ${remaining} kg`,
            bodyHTML: `
                <div class="stock-movements-dialog-form">
                    ${pkgOptionsHTML}
                    <label id="stockUnitsPartialQtyLabel">Quantidade (kg) <span class="required">*</span>
                        <input id="stockUnitsPartialQty" type="number" step="any" min="0.01" max="${remaining}" class="dialog-input" placeholder="0,00">
                    </label>
                    <label>Data de saída <span class="required">*</span>
                        <input id="stockUnitsPartialDate" type="date" class="dialog-input" value="${new Date().toISOString().slice(0, 10)}">
                    </label>
                    <label>Motivo
                        <select id="stockUnitsPartialReason" class="dialog-input">
                            <option value="consumption">Consumo</option>
                            <option value="adjustment">Ajuste</option>
                        </select>
                    </label>
                    <label>Observações
                        <input id="stockUnitsPartialNotes" type="text" class="dialog-input" placeholder="Opcional">
                    </label>
                </div>
            `,
            actions: [
                { label: 'Confirmar Saída', className: 'btn-primary', icon: 'check', onClick: () => this._submitPartialExit(bag.id) },
                { label: 'Cancelar', className: 'btn-secondary', onClick: () => this._partialExitDialog.close() },
            ],
        });
        this._partialExitDialog.open();
        this._onPkgSelectChange();
    },

    _onPartialModeChange() {
        const mode = document.getElementById('stockUnitsPartialMode')?.value;
        const qtyLabel = document.getElementById('stockUnitsPartialQtyLabel');
        const pkgLabel = document.getElementById('stockUnitsPartialPkgLabel');
        const pkgCountLabel = document.getElementById('stockUnitsPartialPkgCountLabel');
        if (mode === 'pkg') {
            if (qtyLabel) qtyLabel.style.display = 'none';
            if (pkgLabel) pkgLabel.style.display = '';
            if (pkgCountLabel) pkgCountLabel.style.display = '';
        } else {
            if (qtyLabel) qtyLabel.style.display = '';
            if (pkgLabel) pkgLabel.style.display = 'none';
            if (pkgCountLabel) pkgCountLabel.style.display = 'none';
        }
    },

    _onPkgSelectChange() {
        const sel = document.getElementById('stockUnitsPartialPkgSelect');
        if (!sel) return;
        const opt = sel.selectedOptions[0];
        const qty = parseFloat(opt?.dataset.qty) || 0;
        const max = parseInt(opt?.dataset.max) || 0;
        const hint = document.getElementById('stockUnitsPartialPkgHint');
        if (hint) hint.textContent = qty ? `Máx: ${max} (${qty} kg cada)` : '';
        const countEl = document.getElementById('stockUnitsPartialPkgCount');
        if (countEl) { countEl.max = max; countEl.value = ''; }
    },

    _onPkgCountChange() {
        const sel = document.getElementById('stockUnitsPartialPkgSelect');
        const pkgWeight = parseFloat(sel?.selectedOptions[0]?.dataset.qty) || 0;
        const count = parseInt(document.getElementById('stockUnitsPartialPkgCount')?.value) || 0;
        const qtyEl = document.getElementById('stockUnitsPartialQty');
        if (qtyEl) qtyEl.value = Math.round(count * pkgWeight * 1000) / 1000;
    },

    async _submitPartialExit(id) {
        const mode = document.getElementById('stockUnitsPartialMode')?.value || 'kg';
        let quantity;
        if (mode === 'pkg') {
            const count = parseInt(document.getElementById('stockUnitsPartialPkgCount')?.value);
            if (!count || count <= 0) { alert('Informe a quantidade de embalagens.'); return; }
            quantity = parseFloat(document.getElementById('stockUnitsPartialQty')?.value);
        } else {
            quantity = parseFloat(document.getElementById('stockUnitsPartialQty')?.value);
        }
        if (!quantity || quantity <= 0) { alert('Informe uma quantidade válida.'); return; }

        const reason = document.getElementById('stockUnitsPartialReason')?.value || 'consumption';
        const notes = document.getElementById('stockUnitsPartialNotes')?.value || '';
        const date = document.getElementById('stockUnitsPartialDate')?.value || new Date().toISOString().slice(0, 10);
        if (!date) { alert('Informe a data de saída'); return; }

        try {
            await apiCall(`${API}/stock-units/${id}/partial-exit`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity, reason, notes: notes || null, location_id: this._partialExitBagLocationId || null, date })
            });
            this._partialExitDialog?.close();
            if (typeof showToast === 'function') showToast('Saída parcial registrada.', 'success');
            this.load();
        } catch (e) {
            alert(e.message || 'Erro ao registrar saída parcial');
        }
    },
};
