/**
 * @file mobile/screens/receipts-list.js
 * @description Tela de lista de recebimentos do mobile.
 *   Estende MobApp com os métodos de carregamento e renderização da lista.
 *
 * Carregado após mobile/app.js.
 */

Object.assign(MobApp, {

    // ── Tela: Lista de Recebimentos ──────────────────────────────────────────

    async loadReceipts() {
        const list = document.getElementById('mobReceiptsList');
        list.innerHTML = '<li class="mob-items-empty">Carregando...</li>';
        try {
            const receipts = await apiCall(API + '/receipts');
            let receiptItemTotals = {};

            try {
                const stockUnits = await apiCall(API + '/stock-units');
                receiptItemTotals = _sumQuantitiesByReceipt(stockUnits || []);
            } catch {
                receiptItemTotals = {};
            }

            this._receipts = receipts || [];
            this._receiptItemTotals = receiptItemTotals;
            this.applyListFilters();
        } catch {
            list.innerHTML = '<li class="mob-items-empty">Erro ao carregar recebimentos.</li>';
        }
    },

    applyListFilters() {
        this._renderReceiptsList(this._getFilteredReceipts());
    },

    _getFilteredReceipts() {
        const natureFilter = document.getElementById('mobListNatureFilter')?.value || '';
        const supplierFilter = document.getElementById('mobListSupplierFilter')?.value || '';

        return this._receipts.filter((receipt) => {
            if (natureFilter && receipt.nature !== natureFilter) {
                return false;
            }

            if (supplierFilter && receipt.supplier !== supplierFilter) {
                return false;
            }

            return true;
        });
    },

    _renderReceiptsList(receipts) {
        const list = document.getElementById('mobReceiptsList');
        if (!receipts.length) {
            list.innerHTML = '<li class="mob-items-empty">Nenhum recebimento encontrado.</li>';
            return;
        }

        list.innerHTML = receipts.map(r => `
            <li class="mob-receipt-row" onclick="MobApp.openReceipt(${r.id})" role="button">
                <div class="mob-receipt-top">
                    <div class="mob-receipt-top-left">
                        <span class="mob-receipt-dot mob-receipt-dot--${_esc(r.nature || 'X')}"></span>
                        <div class="mob-receipt-id">#${_esc(String(r.nature || ''))}${_esc(String(r.id))}</div>
                    </div>
                    ${_hasOrder(r.order_id) ? `
                    <div class="mob-receipt-top-order">
                        ${_buildOrderIcon(r.order_id)}
                        <span class="mob-receipt-top-order-text">#${_esc(String(r.order_id))}</span>
                    </div>
                    ` : ''}
                </div>
                <div class="mob-receipt-main">
                    <div class="mob-receipt-details">
                        ${(() => {
                            const origin = _getReceiptOrigin(r);
                            return `<div class="${_esc(origin.className)}">${_esc(origin.label)}</div>`;
                        })()}
                        <div class="mob-receipt-date">${r.date ? _esc(_formatDateLongBr(r.date)) : '-'}</div>
                    </div>
                    <div class="mob-receipt-quantity">
                        <div class="mob-receipt-quantity-label">Quantidade</div>
                        <div class="mob-receipt-quantity-value">${_esc(_formatQuantityLabel(this._receiptItemTotals[String(r.id)] || 0))}</div>
                    </div>
                </div>
            </li>
        `).join('');
    },
});
