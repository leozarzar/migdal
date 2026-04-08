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
    _stockStatusFilter: '',
    _stockSelectedIds: new Set(),
    _stockSelectionMode: false,
    _stockShowOnlySelected: false,

    // ── Tela: Lista de Estoque ───────────────────────────────────────────────

    async loadStockList() {
        const list = document.getElementById('mobStockList');
        list.innerHTML = '<li class="mob-items-empty">Carregando...</li>';

        this._stockSelectedIds = new Set();
        this._stockSelectionMode = false;
        this._stockShowOnlySelected = false;

        try {
            const units = await apiCall(API + '/stock-units');
            this._stockUnits = units || [];

            // Resetar filtros visuais
            this._stockStatusFilter = '';
            document.querySelectorAll('#screenStockList .mob-stock-status-btn').forEach(btn => {
                btn.classList.toggle('mob-stock-status-btn--active', btn.dataset.status === '');
            });
            const searchEl = document.getElementById('mobStockSearch');
            if (searchEl) searchEl.value = '';

            // Popular selects de fornecedor e material com os dados presentes no estoque
            _fillSelect(
                'mobStockSupplierFilter',
                this._stockUnits.map(u => ({ name: u.supplier })),
                'name',
                'Todos'
            );
            _fillSelect(
                'mobStockMaterialFilter',
                this._stockUnits.map(u => ({ name: u.material })),
                'name',
                'Todos'
            );

            this._updateStockFilterBadge();
            this.applyStockFilters();
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
            const code        = this._stockCodeFor(u);
            const nature      = (u.nature || 'X').charAt(0);
            const isProducao  = nature === 'P';
            const dateVal     = isIn ? u.date_in : u.date_out;
            const dateLabel   = this._stockShortDate(dateVal);
            const leadtime    = (u.date_in)
                ? calculateDaysDifference(u.date_in, isIn ? null : u.date_out)
                : null;
            const secondLine  = isProducao
                ? (u.operator || '')
                : (u.supplier || '');
            const isSelected  = this._stockSelectedIds.has(String(u.id));

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
                    <div class="mob-stock-row-top-right">
                        ${!isIn ? `<span class="mob-stock-check material-symbols-outlined">check_circle</span>` : ''}
                    </div>
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
                        <div class="mob-stock-weight-label">Peso</div>
                        <div class="mob-stock-weight-value">${u.weight != null ? _esc(String(u.weight)) + ' kg' : '-'}</div>
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
});
