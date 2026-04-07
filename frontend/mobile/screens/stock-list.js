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

    // ── Tela: Lista de Estoque ───────────────────────────────────────────────

    async loadStockList() {
        const list = document.getElementById('mobStockList');
        list.innerHTML = '<li class="mob-items-empty">Carregando...</li>';

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
                'Fornecedor'
            );
            _fillSelect(
                'mobStockMaterialFilter',
                this._stockUnits.map(u => ({ name: u.material })),
                'name',
                'Material'
            );

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

            return `
            <li class="mob-stock-row" onclick="MobApp.openStockUnit(${u.id})" role="button">
                <div class="mob-stock-row-top">
                    <div class="mob-stock-row-top-left">
                        <span class="mob-receipt-dot mob-receipt-dot--${_esc(nature)}"></span>
                        <div class="mob-stock-row-code">${_esc(code)}</div>
                    </div>
                    ${!isIn ? `<span class="mob-stock-check material-symbols-outlined">check_circle</span>` : ''}
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
    },
});
