/**
 * @file mobile/screens/stock-list.js
 * @description Tela de lista de estoque do mobile.
 *   Estende MobApp com os métodos de carregamento, filtros e renderização.
 *
 * Carregado após mobile/app.js.
 */

Object.assign(MobApp, {

    // ── Estado ───────────────────────────────────────────────────────────────

    _stockUnits: [],
    _stockBalances: [],
    _stockDetailMaterial: null,
    _stockStatusFilter: '',
    _stockSelectedIds: new Set(),
    _stockSelectionMode: false,
    _stockShowOnlySelected: false,

    // ── Tela: Lista de Estoque ───────────────────────────────────────────────

    async loadStockList() {
        const list = document.getElementById('mobStockList');
        list.innerHTML = '<li class="mob-items-empty">Carregando...</li>';

        // Modo detalhado: se veio de um material lot-tracked, mostra unidades individuais
        if (this._stockDetailMaterial) {
            return this._loadStockListLotDetail();
        }

        // Modo agregado (padrão): posição por material
        this._stockSelectedIds = new Set();
        this._stockSelectionMode = false;
        this._stockShowOnlySelected = false;

        // Ocultar batch bar e status filter (só se aplicam no modo detalhado)
        const batchBar = document.getElementById('mobStockBatchBar');
        if (batchBar) batchBar.style.display = 'none';
        document.querySelectorAll('#screenStockList .mob-stock-status-btn').forEach(btn => {
            btn.style.display = 'none';
        });

        try {
            this._stockBalances = await apiCall(API + '/stock-units/position') || [];
            const searchEl = document.getElementById('mobStockSearch');
            if (searchEl) searchEl.value = '';
            this._applyStockFiltersPosition();
        } catch {
            list.innerHTML = '<li class="mob-items-empty">Erro ao carregar estoque.</li>';
        }
    },

    /** Carrega unidades individuais para um material lot-tracked */
    async _loadStockListLotDetail() {
        const list = document.getElementById('mobStockList');
        this._stockSelectedIds = new Set();
        this._stockSelectionMode = false;
        this._stockShowOnlySelected = false;

        // Mostrar status filters e batch bar
        document.querySelectorAll('#screenStockList .mob-stock-status-btn').forEach(btn => {
            btn.style.display = '';
        });

        try {
            const units = await apiCall(API + '/stock-units');
            this._stockUnits = (units || []).filter(u => u.material === this._stockDetailMaterial);

            this._stockStatusFilter = '';
            document.querySelectorAll('#screenStockList .mob-stock-status-btn').forEach(btn => {
                btn.classList.toggle('mob-stock-status-btn--active', btn.dataset.status === '');
            });
            const searchEl = document.getElementById('mobStockSearch');
            if (searchEl) searchEl.value = '';

            _fillSelect('mobStockSupplierFilter', this._stockUnits.map(u => ({ name: u.supplier })), 'name', 'Todos');
            _fillSelect('mobStockMaterialFilter', this._stockUnits.map(u => ({ name: u.material })), 'name', 'Todos');

            this._updateStockFilterBadge();
            this._applyStockFiltersLotDetail();
        } catch {
            list.innerHTML = '<li class="mob-items-empty">Erro ao carregar estoque.</li>';
        }
    },

    setStockStatusFilter(status) {
        this._stockStatusFilter = status;
        document.querySelectorAll('#screenStockList .mob-stock-status-btn').forEach(btn => {
            btn.classList.toggle('mob-stock-status-btn--active', btn.dataset.status === status);
        });
        this._updateStockFilterBadge();
        this.applyStockFilters();
    },

    applyStockFilters() {
        if (this._stockDetailMaterial) {
            this._applyStockFiltersLotDetail();
            return;
        }
        this._applyStockFiltersPosition();
    },

    /** Filtra e renderiza a visão agregada (posição por material) */
    _applyStockFiltersPosition() {
        const search = (document.getElementById('mobStockSearch')?.value || '').toLowerCase().trim();
        const filtered = this._stockBalances.filter(b => {
            if (search) {
                const hay = [b.material, b.group_name].filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(search)) return false;
            }
            return true;
        });

        this._renderStockListPosition(filtered);

        const countEl = document.getElementById('mobStockCount');
        if (countEl) {
            const total = this._stockBalances.length;
            countEl.textContent = filtered.length === total
                ? `${total} material${total !== 1 ? 'is' : ''}`
                : `${filtered.length} material${filtered.length !== 1 ? 'is' : ''}`;
        }
    },

    /** Filtra e renderiza units individuais no modo detalhado de lotes */
    _applyStockFiltersLotDetail() {
        const filtered = this._getFilteredStockUnits();
        this._renderStockList(filtered);
        const countEl = document.getElementById('mobStockCount');
        if (countEl) {
            const total = (this._stockUnits || []).length;
            countEl.textContent = filtered.length === total
                ? `${total} item${total !== 1 ? 's' : ''}`
                : `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;
        }
    },

    _getFilteredStockUnits() {
        const supplier = document.getElementById('mobStockSupplierFilter')?.value || '';
        const material = document.getElementById('mobStockMaterialFilter')?.value || '';
        const search   = (document.getElementById('mobStockSearch')?.value || '').toLowerCase().trim();
        const status   = this._stockStatusFilter;

        return this._stockUnits.filter(u => {
            if (this._stockShowOnlySelected && !this._stockSelectedIds.has(String(u.id))) return false;
            if (supplier && u.supplier !== supplier) return false;
            if (material && u.material !== material) return false;
            if (status   && u.status   !== status)   return false;
            if (search) {
                const hay = [
                    u.material, u.supplier,
                    this._stockCodeFor(u),
                    String(u.volume_id ?? ''), String(u.old_id ?? ''),
                    u.notes
                ].join(' ').toLowerCase();
                if (!hay.includes(search)) return false;
            }
            return true;
        });
    },

    _stockCodeFor(u) {
        const prefix = (u.nature || '').charAt(0);
        const vol    = String(u.volume_id ?? '').padStart(3, '0');
        return `#${prefix}${u.receipt_id}-${vol}`;
    },

    _stockShortDate(value) {
        if (!value) return '';
        const d = new Date(value + 'T00:00:00');
        if (Number.isNaN(d.getTime())) return value;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${dd}/${mm}/${yy}`;
    },

    _renderStockList(units) {
        const list = document.getElementById('mobStockList');
        if (!units.length) {
            list.innerHTML = '<li class="mob-items-empty">Nenhum item encontrado.</li>';
            return;
        }

        list.innerHTML = units.map(u => {
            const isIn        = u.status === 'IN_STOCK';
            const isPartial   = u.status === 'PARTIAL';
            const isActive    = isIn || isPartial;
            const code        = this._stockCodeFor(u);
            const nature      = (u.nature || 'X').charAt(0);
            const isProducao  = nature === 'P';
            const dateVal     = isActive ? u.date_in : u.date_out;
            const dateLabel   = this._stockShortDate(dateVal);
            const leadtime    = (u.date_in)
                ? calculateDaysDifference(u.date_in, isActive ? null : u.date_out)
                : null;
            const secondLine  = isProducao
                ? (u.operator || '')
                : (u.supplier || '');
            const isSelected  = this._stockSelectedIds.has(String(u.id));

            const statusIcon = isIn ? ''
                : isPartial ? '<span class="mob-stock-partial material-symbols-outlined">timelapse</span>'
                : '<span class="mob-stock-check material-symbols-outlined">check_circle</span>';

            const weightDisplay = isPartial
                ? `${u.remaining_weight != null ? u.remaining_weight : u.weight} <span class="mob-stock-remaining-hint">/ ${u.weight}</span> kg`
                : `${u.weight != null ? _esc(String(u.weight)) + ' kg' : '-'}`;

            return `
            <li class="mob-stock-row${isSelected ? ' mob-stock-row--selected' : ''}"
                id="mob-stock-row-${u.id}"
                onclick="MobApp._onStockRowClick(event, ${u.id})"
                oncontextmenu="MobApp._onStockRowLongPress(event, ${u.id})"
                data-id="${u.id}">
                <div class="mob-stock-row-top">
                    <div class="mob-stock-row-top-left">
                        ${this._stockSelectionMode
                            ? `<input type="checkbox" class="mob-stock-row-check" ${isSelected ? 'checked' : ''}
                                onclick="event.stopPropagation()" onchange="MobApp._onStockRowCheck(this, ${u.id})">`
                            : `<span class="mob-receipt-dot mob-receipt-dot--${_esc(nature)}"></span>`
                        }
                        <div class="mob-stock-row-code">${_esc(code)}</div>
                    </div>
                    <div class="mob-stock-row-top-right">${statusIcon}</div>
                </div>
                <div class="mob-stock-row-main">
                    <div class="mob-stock-row-details">
                        <div class="mob-stock-material">${_esc(u.material || '-')}</div>
                        ${secondLine ? `<div class="mob-stock-row-supplier">${_esc(secondLine)}</div>` : ''}
                        ${dateLabel ? `
                        <div class="mob-stock-row-date">
                            <span>${_esc(dateLabel)}</span>
                            ${leadtime !== null ? `<span class="mob-stock-leadtime"><img src="icons/clock.svg" class="mob-stock-clock-icon" alt="">${leadtime}d</span>` : ''}
                        </div>` : ''}
                    </div>
                    <div class="mob-stock-row-weight">
                        <div class="mob-stock-weight-label">${isPartial ? 'Restante' : 'Peso'}</div>
                        <div class="mob-stock-weight-value">${weightDisplay}</div>
                    </div>
                </div>
            </li>`;
        }).join('');

        // Long-press via touch (500ms)
        list.querySelectorAll('.mob-stock-row').forEach(li => {
            let timer = null;
            li.addEventListener('touchstart', e => {
                timer = setTimeout(() => {
                    const id = Number(li.dataset.id);
                    MobApp._onStockRowLongPress(e, id);
                }, 500);
            }, { passive: true });
            li.addEventListener('touchend', () => clearTimeout(timer));
            li.addEventListener('touchmove', () => clearTimeout(timer));
        });
    },

    // ── Seleção em lote ───────────────────────────────────────────────────────

    _onStockRowClick(event, id) {
        if (this._stockSelectionMode) {
            this._toggleStockSelection(id);
        } else {
            this.openStockUnit(id);
        }
    },

    _onStockRowLongPress(event, id) {
        event.preventDefault();
        if (!this._stockSelectionMode) {
            this._stockSelectionMode = true;
        }
        this._toggleStockSelection(id);
        this.applyStockFilters();
    },

    _toggleStockSelection(id) {
        const key = String(id);
        if (this._stockSelectedIds.has(key)) {
            this._stockSelectedIds.delete(key);
        } else {
            this._stockSelectedIds.add(key);
        }
        if (this._stockSelectedIds.size === 0) {
            this._stockSelectionMode = false;
        }
        this.applyStockFilters();
        this._updateStockBatchBar();
    },

    _onStockRowCheck(checkbox, id) {
        const key = String(id);
        if (checkbox.checked) {
            this._stockSelectedIds.add(key);
        } else {
            this._stockSelectedIds.delete(key);
            if (this._stockSelectedIds.size === 0) {
                this._stockSelectionMode = false;
                this.applyStockFilters();
            }
        }
        this._updateStockBatchBar();
    },

    _updateStockBatchBar() {
        const bar = document.getElementById('mobStockBatchBar');
        const countEl = document.getElementById('mobStockBatchCount');
        if (!bar) return;
        const n = this._stockSelectedIds.size;
        bar.style.display = n > 0 ? '' : 'none';
        if (countEl) countEl.textContent = `${n} ${n === 1 ? 'item' : 'itens'}`;
    },

    clearStockSelection() {
        this._stockSelectedIds = new Set();
        this._stockSelectionMode = false;
        this._stockShowOnlySelected = false;
        this._updateShowSelectedBtn();
        this._updateStockFilterBadge();
        this.applyStockFilters();
        this._updateStockBatchBar();
    },

    toggleStockShowSelected() {
        this._stockShowOnlySelected = !this._stockShowOnlySelected;
        this._updateShowSelectedBtn();
        this._updateStockFilterBadge();
        this.applyStockFilters();
    },

    _updateShowSelectedBtn() {
        const btn = document.getElementById('mobStockShowSelectedBtn');
        if (!btn) return;
        btn.classList.toggle('mob-stock-show-selected-btn--active', this._stockShowOnlySelected);
    },

    openStockBatchDialog() {
        const dialog = document.getElementById('mobStockBatchDialog');
        const sub = document.getElementById('mobStockBatchDialogSub');
        const dateEl = document.getElementById('mobBatchDateOut');
        if (!dialog) return;
        const n = this._stockSelectedIds.size;
        sub.textContent = `${n} ${n === 1 ? 'item será baixado' : 'itens serão baixados'}.`;
        dateEl.value = new Date().toISOString().slice(0, 10);
        document.getElementById('mobBatchDeductionType').value = 'uso';
        dialog.style.display = '';
    },

    closeStockBatchDialog() {
        const dialog = document.getElementById('mobStockBatchDialog');
        if (dialog) dialog.style.display = 'none';
    },

    async confirmStockBatchOut() {
        const dateOut = document.getElementById('mobBatchDateOut').value;
        const deductionType = document.getElementById('mobBatchDeductionType').value;
        if (!dateOut) {
            this._toast('Informe a data de saída', 'error');
            return;
        }
        this.closeStockBatchDialog();

        const ids = [...this._stockSelectedIds];
        try {
            await Promise.all(ids.map(id =>
                apiCall(API + '/stock-units/update', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, date_out: dateOut, status: 'OUT_STOCK', notes: '', deduction_type: deductionType })
                })
            ));
            ids.forEach(id => {
                const idx = this._stockUnits.findIndex(u => String(u.id) === String(id));
                if (idx !== -1) Object.assign(this._stockUnits[idx], { status: 'OUT_STOCK', date_out: dateOut, deduction_type: deductionType });
            });
            this.clearStockSelection();
            this._toast(`${ids.length} ${ids.length === 1 ? 'item baixado' : 'itens baixados'}`, 'success');
        } catch {
            this._toast('Erro ao dar saída nos itens', 'error');
        }
    },

    // ── Painel de filtros ─────────────────────────────────────────────────────

    openStockFilterSheet() {
        const sheet = document.getElementById('mobStockFilterSheet');
        if (sheet) sheet.style.display = '';
    },

    closeStockFilterSheet() {
        const sheet = document.getElementById('mobStockFilterSheet');
        if (sheet) sheet.style.display = 'none';
    },

    _onStockFilterBackdropClick(event) {
        if (event.target === document.getElementById('mobStockFilterSheet')) {
            this.closeStockFilterSheet();
        }
    },

    resetStockFilters() {
        const supplier = document.getElementById('mobStockSupplierFilter');
        const material = document.getElementById('mobStockMaterialFilter');
        if (supplier) supplier.value = '';
        if (material) material.value = '';
        this._stockStatusFilter = '';
        document.querySelectorAll('#screenStockList .mob-stock-status-btn').forEach(btn => {
            btn.classList.toggle('mob-stock-status-btn--active', btn.dataset.status === '');
        });
        this._stockShowOnlySelected = false;
        this._updateShowSelectedBtn();
        this._updateStockFilterBadge();
        this.applyStockFilters();
    },

    _updateStockFilterBadge() {
        const supplier = document.getElementById('mobStockSupplierFilter')?.value || '';
        const material = document.getElementById('mobStockMaterialFilter')?.value || '';
        const count = [
            supplier !== '',
            material !== '',
            this._stockStatusFilter !== '',
            this._stockShowOnlySelected,
        ].filter(Boolean).length;

        const badge = document.getElementById('mobStockFilterBadge');
        const btn   = document.getElementById('mobStockFilterBtn');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = String(count);
            badge.style.display = '';
            btn?.classList.add('mob-stock-filter-btn--active');
        } else {
            badge.style.display = 'none';
            btn?.classList.remove('mob-stock-filter-btn--active');
        }
    },

    // ── Visão Agregada (Posição por Material) ────────────────────────────────

    _renderStockListPosition(items) {
        const list = document.getElementById('mobStockList');
        if (!items.length) {
            list.innerHTML = '<li class="mob-items-empty">Nenhum material encontrado.</li>';
            return;
        }

        list.innerHTML = items.map(b => {
            const hasBalance = b.balance > 0;
            const isLot = b.tracking_mode === 'lots';
            const onClick = isLot
                ? `MobApp._openStockLotDetail('${_esc(b.material)}')`
                : `MobApp._openMobileExitDialog(${b.material_id})`;

            return `
            <li class="mob-stock-row" onclick="${onClick}">
                <div class="mob-stock-row-main">
                    <div class="mob-stock-row-details">
                        <div class="mob-stock-material">${_esc(b.material || '-')}</div>
                        ${b.group_name ? `<div class="mob-stock-row-supplier">${_esc(b.group_name)}</div>` : ''}
                        ${isLot && b.lots_in_stock > 0 ? `<div class="mob-stock-row-date"><span>${b.lots_in_stock} lote${b.lots_in_stock !== 1 ? 's' : ''} em estoque</span></div>` : ''}
                    </div>
                    <div class="mob-stock-row-weight">
                        <div class="mob-stock-weight-label">Saldo</div>
                        <div class="mob-stock-weight-value${!hasBalance ? ' mob-stock-weight--zero' : ''}">${b.balance.toLocaleString('pt-BR')} kg</div>
                    </div>
                </div>
            </li>`;
        }).join('');
    },

    /** Navega para a visão detalhada de lotes de um material */
    _openStockLotDetail(materialName) {
        this._stockDetailMaterial = materialName;
        this.loadStockList();
    },

    /** Volta da visão detalhada para a visão agregada */
    _backToStockPosition() {
        this._stockDetailMaterial = null;
        this.loadStockList();
    },

    async _openMobileExitDialog(materialId) {
        const item = this._stockBalances.find(b => b.material_id === materialId);
        if (!item) return;

        const existing = document.getElementById('mobSimpleExitDialog');
        if (existing) existing.remove();

        // Fetch packagings from material detail endpoint
        let packagings = [];
        try {
            const mat = await apiCall(API + `/materials/${materialId}`);
            packagings = (mat.packagings || []).filter(p => p.quantity);
        } catch { /* silencioso */ }
        const hasPkg = packagings.length > 0;

        let pkgSelectHTML = '';
        let pkgFieldHTML = '';
        if (hasPkg) {
            const opts = packagings.map(p =>
                `<option value="${p.id}" data-qty="${p.quantity}">${_esc(p.name)} (${p.quantity} kg)</option>`
            ).join('');
            pkgSelectHTML = `
                <div class="mob-form-field">
                    <label class="mob-label">Modo de saída</label>
                    <select id="mobSimpleExitMode" class="mob-select" onchange="MobApp._onMobExitModeChange()">
                        <option value="kg">Por peso (kg)</option>
                        <option value="pkg">Por embalagem</option>
                    </select>
                </div>`;
            pkgFieldHTML = `
                <div class="mob-form-field" id="mobSimpleExitPkgField" style="display:none">
                    <label class="mob-label">Embalagem</label>
                    <select id="mobSimpleExitPkgSelect" class="mob-select" onchange="MobApp._onMobPkgSelectChange()">
                        ${opts}
                    </select>
                </div>
                <div class="mob-form-field" id="mobSimpleExitPkgCountField" style="display:none">
                    <label class="mob-label">Quantidade de embalagens</label>
                    <input type="number" id="mobSimpleExitPkgCount" class="mob-input" step="1" min="1" placeholder="0"
                           oninput="MobApp._onMobPkgCountChange()">
                    <span id="mobSimpleExitPkgHint" class="mob-pkg-hint"></span>
                </div>`;
        }

        const backdrop = document.createElement('div');
        backdrop.id = 'mobSimpleExitDialog';
        backdrop.className = 'mob-stock-batch-dialog-backdrop';
        backdrop.innerHTML = `
            <div class="mob-stock-batch-dialog">
                <h3 class="mob-stock-batch-dialog-title">Registrar Saída</h3>
                <p class="mob-stock-batch-dialog-sub">${_esc(item.material)} — Saldo: ${item.balance.toLocaleString('pt-BR')} kg</p>
                ${pkgSelectHTML}
                <div class="mob-form-field" id="mobSimpleExitQtyField">
                    <label class="mob-label">Quantidade (kg)</label>
                    <input type="number" id="mobSimpleExitQty" class="mob-input" step="any" min="0.01" placeholder="0,00">
                </div>
                ${pkgFieldHTML}
                <div class="mob-form-field">
                    <label class="mob-label">Motivo</label>
                    <select id="mobSimpleExitReason" class="mob-select">
                        <option value="consumption">Consumo</option>
                        <option value="adjustment">Ajuste</option>
                    </select>
                </div>
                <div class="mob-form-field">
                    <label class="mob-label">Observações</label>
                    <input type="text" id="mobSimpleExitNotes" class="mob-input" placeholder="Opcional">
                </div>
                <div class="mob-stock-batch-dialog-actions">
                    <button class="mob-btn mob-btn--primary" onclick="MobApp._submitMobileExit(${materialId})">Confirmar</button>
                    <button class="mob-btn mob-btn--secondary" onclick="MobApp._closeMobileExitDialog()">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        backdrop.style.display = '';
        this._onMobPkgSelectChange();
    },

    /** Alterna entre modo kg/embalagem no mobile */
    _onMobExitModeChange() {
        const mode = document.getElementById('mobSimpleExitMode')?.value;
        const qtyField = document.getElementById('mobSimpleExitQtyField');
        const pkgField = document.getElementById('mobSimpleExitPkgField');
        const pkgCountField = document.getElementById('mobSimpleExitPkgCountField');
        if (mode === 'pkg') {
            if (qtyField) qtyField.style.display = 'none';
            if (pkgField) pkgField.style.display = '';
            if (pkgCountField) pkgCountField.style.display = '';
        } else {
            if (qtyField) qtyField.style.display = '';
            if (pkgField) pkgField.style.display = 'none';
            if (pkgCountField) pkgCountField.style.display = 'none';
        }
    },

    /** Atualiza hint quando a embalagem selecionada muda no mobile */
    _onMobPkgSelectChange() {
        const sel = document.getElementById('mobSimpleExitPkgSelect');
        if (!sel) return;
        const qty = parseFloat(sel.selectedOptions[0]?.dataset.qty) || 0;
        const hint = document.getElementById('mobSimpleExitPkgHint');
        if (hint) hint.textContent = qty ? `${qty} kg por embalagem` : '';
    },

    /** Calcula peso a partir da qtd de embalagens no mobile */
    _onMobPkgCountChange() {
        const sel = document.getElementById('mobSimpleExitPkgSelect');
        const pkgWeight = parseFloat(sel?.selectedOptions[0]?.dataset.qty) || 0;
        const count = parseInt(document.getElementById('mobSimpleExitPkgCount')?.value) || 0;
        const qtyEl = document.getElementById('mobSimpleExitQty');
        if (qtyEl) qtyEl.value = Math.round(count * pkgWeight * 1000) / 1000;
    },

    _closeMobileExitDialog() {
        const dialog = document.getElementById('mobSimpleExitDialog');
        if (dialog) dialog.remove();
    },

    async _submitMobileExit(materialId) {
        const item = this._stockBalances.find(b => b.material_id === materialId);
        if (!item) return;

        const mode = document.getElementById('mobSimpleExitMode')?.value || 'kg';
        let qty;
        if (mode === 'pkg') {
            const sel = document.getElementById('mobSimpleExitPkgSelect');
            const pkgWeight = parseFloat(sel?.selectedOptions[0]?.dataset.qty) || 0;
            const count = parseInt(document.getElementById('mobSimpleExitPkgCount')?.value);
            if (!count || count <= 0) { this._toast('Informe a quantidade de embalagens', 'error'); return; }
            qty = Math.round(count * pkgWeight * 1000) / 1000;
        } else {
            qty = parseFloat(document.getElementById('mobSimpleExitQty')?.value);
        }
        const reason = document.getElementById('mobSimpleExitReason')?.value || 'consumption';
        const notes = document.getElementById('mobSimpleExitNotes')?.value || '';

        if (!qty || qty <= 0) { this._toast('Informe uma quantidade válida', 'error'); return; }
        if (qty > item.balance) { this._toast('Quantidade excede o saldo', 'error'); return; }

        try {
            await apiCall(API + '/stock-movements/exit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    material_id: materialId,
                    quantity: qty,
                    date: new Date().toISOString().slice(0, 10),
                    reason,
                    notes: notes || null
                })
            });
            this._closeMobileExitDialog();
            this._toast('Saída registrada!', 'success');
            this._stockDetailMaterial = null;
            await this.loadStockList();
        } catch {
            this._toast('Erro ao registrar saída', 'error');
        }
    },
});
