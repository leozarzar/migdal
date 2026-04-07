/**
 * @file mobile.js
 * @description Lógica da versão mobile do WCM App.
 *   - Tela "list": lista de recebimentos recentes.
 *   - Tela "form": formulário de novo recebimento.
 *
 * Depende de `utils.js` (apiCall) carregado antes deste script.
 */

const API = window.location.origin;

const MobApp = {

    // ── Estado ──────────────────────────────────────────────────────────────

    /** Itens adicionados ao recebimento em progresso */
    _items: [],

    /** Snapshot dos itens originais carregados do banco (para diff na edição) */
    _originalItems: [],

    /** Recebimento sendo editado (null = novo recebimento) */
    _editingReceipt: null,

    /** Cache dos recebimentos carregados na lista */
    _receipts: [],

    /** Soma das quantidades por recebimento (chave: receipt_id) */
    _receiptItemTotals: {},

    // ── Inicialização ────────────────────────────────────────────────────────

    async init() {
        try {
            const [suppliers, materials, operators] = await Promise.all([
                apiCall(API + '/suppliers'),
                apiCall(API + '/materials'),
                apiCall(API + '/operators'),
            ]);

            _fillSelect('mobSupplier', suppliers, 'name', 'Selecione...');
            _fillSelect('mobItemMaterial', materials, 'name', 'Selecione...');
            _fillSelect('mobItemOperator', operators, 'name', 'Selecione...');
        } catch {
            this._toast('Erro ao carregar dados do servidor', 'error');
        }

        await this.loadReceipts();
    },

    // ── Navegação entre telas ────────────────────────────────────────────────

    showScreen(screen) {
        const isList = screen === 'list';
        document.getElementById('screenList').style.display = isList ? '' : 'none';
        document.getElementById('screenForm').style.display = isList ? 'none' : '';
        document.getElementById('mobBackBtn').style.display = isList ? 'none' : '';

        if (isList) {
            this._editingReceipt = null;
            document.getElementById('mobHeaderSubtitle').textContent = 'Recebimentos';
            this.loadReceipts();
        } else {
            this._editingReceipt = null;
            document.getElementById('mobHeaderSubtitle').textContent = 'Novo Recebimento';
            document.getElementById('mobSaveBtn').textContent = 'Salvar Recebimento';
            this._resetReceiptForm();
        }
    },

    // ── Tela: Lista de Recebimentos ────────────────────────────────────────────

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
            this._renderReceiptsList(this._receipts);
        } catch {
            list.innerHTML = '<li class="mob-items-empty">Erro ao carregar recebimentos.</li>';
        }
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

    // ── Tela: Formulário de Novo/Editar Recebimento ──────────────────────────────

    async openReceipt(id) {
        document.getElementById('screenList').style.display = 'none';
        document.getElementById('screenForm').style.display = '';
        document.getElementById('mobBackBtn').style.display = '';
        document.getElementById('mobHeaderSubtitle').textContent = 'Editar Recebimento';
        document.getElementById('mobSaveBtn').textContent = 'Atualizar Recebimento';
        this._resetReceiptForm();

        // Usa o cache local — evita re-fetch e problema de comparação de tipos
        const receipt = this._receipts.find(r => String(r.id) === String(id));
        if (!receipt) {
            this._toast('Recebimento não encontrado', 'error');
            return;
        }

        this._editingReceipt = receipt;

        document.getElementById('mobNature').value   = receipt.nature   || '';
        document.getElementById('mobDate').value     = receipt.date     || '';
        this.onNatureChange();
        // Supplier precisa ser definido DEPOIS de onNatureChange mostrar o campo
        document.getElementById('mobSupplier').value = receipt.supplier || '';

        try {
            const rawItems = await apiCall(API + '/receipts/items/' + id);
            this._items = (rawItems || []).map(i => ({
                _stockUnitId:    i.id,
                _originalStatus: i.status,
                code:            i.volume_id == null ? '' : Number(i.volume_id),
                material:        i.material,
                materialLabel:   i.material,
                quantity:        i.weight,
                operator:        i.operator || '',
                operatorLabel:   i.operator || '',
            }));
            // Snapshot imutável para calcular o diff ao salvar
            this._originalItems = [...this._items];
            this._renderItemsList();
            this._setNextItemCode();
        } catch {
            this._toast('Erro ao carregar itens do recebimento', 'error');
        }
    },

    onNatureChange() {
        const nature = document.getElementById('mobNature').value;
        const showSupplier = nature === 'C' || nature === 'S';
        document.getElementById('fieldSupplier').style.display      = showSupplier ? '' : 'none';
        document.getElementById('fieldItemOperator').style.display  = nature === 'P' ? '' : 'none';
    },

    addItem() {
        const nature   = document.getElementById('mobNature').value;
        const materialEl = document.getElementById('mobItemMaterial');
        const material = materialEl.value;
        const qty      = parseFloat(document.getElementById('mobItemQty').value);
        const code     = document.getElementById('mobItemCode').value.trim();
        const operatorEl = document.getElementById('mobItemOperator');
        const operator = operatorEl.value;

        if (!material) {
            this._toast('Selecione o material', 'error');
            return;
        }
        if (!qty || isNaN(qty) || qty <= 0) {
            this._toast('Informe a quantidade', 'error');
            return;
        }
        if (nature === 'P' && !operator) {
            this._toast('Selecione o operador', 'error');
            return;
        }

        const nextCode = code
            ? Number.parseInt(code, 10)
            : this._getNextItemCode();

        this._items.push({
            code:          nextCode,
            material,
            materialLabel: materialEl.options[materialEl.selectedIndex].text,
            quantity:      qty,
            operator:      nature === 'P' ? operator : '',
            operatorLabel: nature === 'P' ? operatorEl.options[operatorEl.selectedIndex].text : '',
        });

        // Limpa campos do formulário de item
        document.getElementById('mobItemMaterial').value = '';
        document.getElementById('mobItemQty').value     = '';
        document.getElementById('mobItemOperator').value = '';

        this._renderItemsList();
        this._setNextItemCode();
    },

    removeItem(index) {
        this._items.splice(index, 1);
        this._renderItemsList();
        this._setNextItemCode();
    },

    async saveReceipt() {
        const nature   = document.getElementById('mobNature').value;
        const date     = document.getElementById('mobDate').value;
        const supplier = document.getElementById('mobSupplier').value;

        if (!nature) { this._toast('Selecione a natureza', 'error'); return; }
        if (!date)   { this._toast('Informe a data', 'error'); return; }
        if ((nature === 'C' || nature === 'S') && !supplier) {
            this._toast('Selecione o fornecedor', 'error');
            return;
        }
        if (this._items.length === 0) {
            this._toast('Adicione ao menos um item', 'error');
            return;
        }

        try {
            let receiptId;

            if (this._editingReceipt) {
                // ── Edição ──
                await apiCall(API + '/receipts/update', {
                    method:  'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        id:       this._editingReceipt.id,
                        nature,
                        date,
                        supplier: supplier || null,
                        order_id: this._editingReceipt.order_id || null,
                    }),
                });

                // Diff: only delete removed items, only insert new items
                const deletedItems = this._originalItems.filter(orig =>
                    !this._items.some(cur => cur._stockUnitId === orig._stockUnitId)
                );

                // Confirm before deleting any OUT_STOCK item
                const loweredItems = deletedItems.filter(i => i._originalStatus === 'OUT_STOCK');
                if (loweredItems.length > 0) {
                    const list = loweredItems
                        .map(i => `  • Código ${i.code} — ${i.material}`)
                        .join('\n');
                    const ok = confirm(
                        `Atenção: os itens abaixo já foram baixados do estoque e serão deletados permanentemente:\n\n${list}\n\nDeseja continuar mesmo assim?`
                    );
                    if (!ok) return;
                }

                for (const item of deletedItems) {
                    await apiCall(API + `/stock-units/${item._stockUnitId}`, { method: 'DELETE' });
                }

                // Only the items without an existing stock-unit ID are new
                const newItems = this._items.filter(cur => !cur._stockUnitId);
                receiptId = this._editingReceipt.id;

                // Insert only new items (skip the loop below for existing ones)
                for (const item of newItems) {
                    await apiCall(API + '/stock-units', {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify({
                            receipt_id: receiptId,
                            volume_id:  Number.parseInt(item.code, 10),
                            material:   item.material,
                            weight:     item.quantity,
                            supplier:   supplier || null,
                            operator:   item.operator || null,
                            status:     'IN_STOCK',
                            date_in:    date,
                            notes:      '',
                        }),
                    });
                }

                this._toast('Recebimento atualizado!', 'success');
                this.showScreen('list');
                return;
            } else {
                // ── Criação ──
                const receipt = await apiCall(API + '/receipts', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ nature, date, supplier: supplier || null, order_id: null }),
                });
                receiptId = receipt && receipt.id;
                if (!receiptId) throw new Error('ID do recebimento não retornado');
            }

            for (const item of this._items) {
                await apiCall(API + '/stock-units', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        receipt_id: receiptId,
                        volume_id:  Number.parseInt(item.code, 10),
                        material:   item.material,
                        weight:     item.quantity,
                        supplier:   supplier || null,
                        operator:   item.operator || null,
                        status:     'IN_STOCK',
                        date_in:    date,
                        notes:      '',
                    }),
                });
            }

            this._toast(this._editingReceipt ? 'Recebimento atualizado!' : 'Recebimento salvo!', 'success');
            this.showScreen('list');
        } catch {
            this._toast('Erro ao salvar recebimento', 'error');
        }
    },

    _resetReceiptForm() {
        this._items = [];
        this._originalItems = [];
        document.getElementById('mobNature').value            = '';
        document.getElementById('mobDate').value              = new Date().toISOString().slice(0, 10);
        document.getElementById('mobSupplier').value          = '';
        document.getElementById('mobItemMaterial').value      = '';
        document.getElementById('mobItemQty').value           = '';
        document.getElementById('mobItemOperator').value      = '';
        document.getElementById('fieldSupplier').style.display     = 'none';
        document.getElementById('fieldItemOperator').style.display = 'none';
        this._renderItemsList();
        this._setNextItemCode();
    },

    _getNextItemCode() {
        if (!this._items.length) {
            return 1;
        }

        const maxCode = this._items.reduce((currentMax, item) => {
            const parsedCode = Number.parseInt(item.code, 10);
            if (!Number.isInteger(parsedCode)) {
                return currentMax;
            }

            return Math.max(currentMax, parsedCode);
        }, 0);

        return maxCode + 1;
    },

    _setNextItemCode() {
        const codeInput = document.getElementById('mobItemCode');
        if (!codeInput) {
            return;
        }

        codeInput.value = this._getNextItemCode();
    },

    _renderItemsList() {
        const list = document.getElementById('mobItemsList');
        const totalEl = document.getElementById('mobReceiptTotal');
        const totalQtyEl = document.getElementById('mobTotalQty');

        if (this._items.length === 0) {
            list.innerHTML = '<li class="mob-items-empty">Nenhum item adicionado.</li>';
            totalEl.style.display = 'none';
            return;
        }

        list.innerHTML = this._items.map((item, i) => `
            <li class="mob-item-row">
                <div class="mob-item-info">
                    <div class="mob-item-material">${_esc(item.materialLabel)}</div>
                    <div class="mob-item-meta">
                        Código: ${_esc(item.code)} &nbsp;·&nbsp; Qtd: ${item.quantity}
                        ${item.operatorLabel ? ` &nbsp;·&nbsp; Op: ${_esc(item.operatorLabel)}` : ''}
                    </div>
                </div>
                <button class="mob-item-remove" onclick="MobApp.removeItem(${i})" aria-label="Remover item">×</button>
            </li>
        `).join('');

        const total = this._items.reduce((s, it) => s + it.quantity, 0);
        totalQtyEl.textContent = total;
        totalEl.style.display  = '';
    },

    // ── Utilitários internos ─────────────────────────────────────────────────

    _toastTimer: null,

    _toast(message, type = '') {
        const el = document.getElementById('mobToast');
        el.textContent = message;
        el.className = 'mob-toast mob-toast--visible' + (type ? ` mob-toast--${type}` : '');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            el.className = 'mob-toast';
        }, 3000);
    },
};

// ── Funções auxiliares de escopo global ──────────────────────────────────────

/**
 * Escapa HTML para prevenir XSS.
 * @param {string} value
 * @returns {string}
 */
function _esc(value) {
    return String(value)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
}

/**
 * Preenche um <select> com itens de um array, usando uma propriedade como valor e label.
 * @param {string} selectId
 * @param {Array}  items
 * @param {string} prop
 * @param {string} placeholder
 */
function _fillSelect(selectId, items, prop, placeholder) {
    const el = document.getElementById(selectId);
    if (!el) return;
    const current = el.value;
    const unique = [...new Set((items || []).map(i => i[prop]).filter(Boolean))];
    el.innerHTML = `<option value="">${placeholder}</option>`
        + unique.map(v => `<option value="${_esc(v)}">${_esc(v)}</option>`).join('');
    if (current) el.value = current;
}

function _hasOrder(orderId) {
    return orderId !== null && orderId !== undefined && String(orderId).trim() !== '';
}

function _sumQuantitiesByReceipt(stockUnits) {
    return (stockUnits || []).reduce((acc, item) => {
        const key = String(item.receipt_id || '');
        if (!key) {
            return acc;
        }

        const quantity = Number.parseFloat(item.weight) || 0;
        acc[key] = (acc[key] || 0) + quantity;
        return acc;
    }, {});
}

function _getReceiptOrigin(receipt) {
    if (receipt?.nature === 'P') {
        return {
            label: 'Produção',
            className: 'mob-receipt-origin mob-receipt-origin--production',
        };
    }

    if (receipt?.supplier) {
        return {
            label: receipt.supplier,
            className: 'mob-receipt-origin mob-receipt-origin--supplier',
        };
    }

    return {
        label: 'Sem fornecedor',
        className: 'mob-receipt-origin mob-receipt-origin--missing',
    };
}

function _formatQuantityLabel(quantity) {
    const normalizedQuantity = Number(quantity) || 0;
    if (Number.isInteger(normalizedQuantity)) {
        return String(normalizedQuantity);
    }

    return normalizedQuantity.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

function _formatOrderLabel(orderId) {
    return _hasOrder(orderId) ? `Pedido: #${orderId}` : 'Sem pedido';
}

function _buildOrderIcon(orderId) {
    const iconName = _hasOrder(orderId) ? 'order2.svg' : 'order-off.svg';
    const iconClass = _hasOrder(orderId) ? 'mob-order-icon mob-order-icon--linked' : 'mob-order-icon mob-order-icon--unlinked';
    return `<span class="${iconClass}" aria-hidden="true"><img src="icons/${iconName}" alt=""></span>`;
}

function _formatDateLongBr(value) {
    const date = new Date(value + 'T00:00:00');
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => MobApp.init());
