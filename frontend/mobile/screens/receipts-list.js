/**
 * @file mobile/screens/receipts-list.js
 * @description Tela de lista de recebimentos do mobile.
 *   Filtro por texto (fornecedor + #ID) e chips de natureza.
 *
 * Carregado após mobile/app.js.
 */

Object.assign(MobApp, {

    // ── Estado: Lista ────────────────────────────────────────────────────────

    /** Filtro de natureza ativo ('C', 'S', 'P' ou '' = todos) */
    _listNatureFilter: '',

    // ── Tela: Lista de Recebimentos ──────────────────────────────────────────

    /**
     * Define o filtro de natureza, atualiza os chips e filtra a lista.
     * @param {string} nature - 'C', 'S', 'P' ou '' para todos
     */
    setListNatureFilter(nature) {
        this._listNatureFilter = nature;
        ['', 'C', 'S', 'P'].forEach(n => {
            const id = n === '' ? 'rcpChipAll' : 'rcpChip' + n;
            const el = document.getElementById(id);
            if (el) el.classList.toggle('rcp-chip--active', nature === n);
        });
        this.applyListFilters();
    },

    /**
     * Carrega os recebimentos do servidor e exibe skeleton durante o fetch.
     */
    async loadReceipts() {
        this._listNatureFilter = '';
        const list = document.getElementById('rcpList');

        // Skeleton enquanto carrega
        list.innerHTML = [1, 2, 3].map(() =>
            '<li class="rcp-skeleton" aria-hidden="true"></li>'
        ).join('');

        // Resetar chips para "Todos"
        ['', 'C', 'S', 'P'].forEach(n => {
            const el = document.getElementById(n === '' ? 'rcpChipAll' : 'rcpChip' + n);
            if (el) el.classList.toggle('rcp-chip--active', n === '');
        });

        // Limpar busca
        const searchEl = document.getElementById('rcpSearch');
        if (searchEl) searchEl.value = '';

        try {
            const [receipts, stockUnits] = await Promise.all([
                apiCall(API + '/receipts'),
                apiCall(API + '/stock-units').catch(() => []),
            ]);
            this._receipts = receipts || [];
            this._receiptItemTotals = _sumQuantitiesByReceipt(stockUnits || []);
            this.applyListFilters();
        } catch {
            list.innerHTML = '<li class="rcp-empty">Erro ao carregar recebimentos.</li>';
        }
    },

    /**
     * Filtra a lista exibida por texto (fornecedor/ID) e natureza.
     */
    applyListFilters() {
        const search = (document.getElementById('rcpSearch')?.value || '').toLowerCase().trim();
        const nature = this._listNatureFilter;

        const filtered = this._receipts.filter(r => {
            if (nature && r.nature !== nature) return false;
            if (search) {
                const idStr = (r.nature || '') + String(r.id);
                const idMatch      = idStr.toLowerCase().includes(search);
                const supplierMatch = (r.supplier || '').toLowerCase().includes(search);
                if (!idMatch && !supplierMatch) return false;
            }
            return true;
        });

        this._renderReceiptsList(filtered);
    },

    /**
     * Renderiza os cards de recebimento na lista.
     * @param {Array} receipts
     */
    _renderReceiptsList(receipts) {
        const list = document.getElementById('rcpList');
        if (!receipts.length) {
            list.innerHTML = '<li class="rcp-empty">Nenhum recebimento encontrado.</li>';
            return;
        }

        list.innerHTML = receipts.map(r => {
            const origin     = _getReceiptOrigin(r);
            const qty        = this._receiptItemTotals[String(r.id)] || 0;
            const badgeLabel = r.order_id ? `Pedido #${_esc(String(r.order_id))}` : '';

            // Mapear classes antigas para novas
            let originClass = 'rcp-card-origin';
            if (r.nature === 'P')   originClass += ' rcp-card-origin--production';
            if (!r.supplier && r.nature !== 'P') originClass += ' rcp-card-origin--missing';

            return `<li class="rcp-card"
                        onclick="MobApp.openReceipt(${r.id})"
                        role="button"
                        aria-label="Recebimento #${_esc(r.nature || '')}${_esc(String(r.id))}">
                <div class="rcp-card-body">
                    <div class="rcp-card-row1">
                        <span class="rcp-card-id">#${_esc(r.nature || '')}${_esc(String(r.id))}</span>
                        ${badgeLabel ? `<span class="rcp-card-badge">${badgeLabel}</span>` : ''}
                    </div>
                    <div class="${originClass}">${_esc(origin.label)}</div>
                    <div class="rcp-card-row3">
                        <span class="rcp-card-date">${r.date ? _esc(_formatDateLongBr(r.date)) : '—'}</span>
                        <span class="rcp-card-qty">${_esc(_formatQuantityLabel(qty))}</span>
                    </div>
                </div>
            </li>`;
        }).join('');
    },
});

