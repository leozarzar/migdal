/**
 * @file mobile/app.js
 * @description Shell principal da versão mobile do WCM App.
 *   - Estado global, inicialização, navegação e toast.
 *   - As screens são carregadas por arquivos separados na pasta screens/.
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

    /** Tela anterior (para o botão voltar) */
    _previousScreen: 'home',

    // ── Inicialização ────────────────────────────────────────────────────────

    async init() {
        try {
            const [suppliers, materials, operators] = await Promise.all([
                apiCall(API + '/suppliers'),
                apiCall(API + '/materials'),
                apiCall(API + '/operators'),
            ]);

            _fillSelect('mobSupplier', suppliers, 'name', 'Selecione...');
            _fillSelect('mobListSupplierFilter', suppliers, 'name', 'Fornecedor');
            _fillSelect('mobItemMaterial', materials, 'name', 'Selecione...');
            _fillSelect('mobItemOperator', operators, 'name', 'Selecione...');
        } catch {
            this._toast('Erro ao carregar dados do servidor', 'error');
        }

        this.showScreen('home');
    },

    // ── Navegação entre telas ────────────────────────────────────────────────

    showScreen(screen) {
        document.getElementById('screenHome').style.display         = screen === 'home'          ? '' : 'none';
        document.getElementById('screenList').style.display         = screen === 'list'          ? '' : 'none';
        document.getElementById('screenForm').style.display         = screen === 'form'          ? '' : 'none';
        document.getElementById('screenStockList').style.display    = screen === 'stock-list'    ? '' : 'none';
        document.getElementById('screenStockDetails').style.display = screen === 'stock-details' ? '' : 'none';

        const backBtn = document.getElementById('mobBackBtn');
        backBtn.style.display = screen === 'home' ? 'none' : '';

        if (screen === 'home') {
            document.getElementById('mobHeaderSubtitle').textContent = '';
            this.HomeScreen.load();
        } else if (screen === 'list') {
            this._editingReceipt = null;
            this._previousScreen = 'home';
            document.getElementById('mobHeaderSubtitle').textContent = 'Recebimentos';
            this.loadReceipts();
        } else if (screen === 'form') {
            this._editingReceipt = null;
            this._previousScreen = 'list';
            document.getElementById('mobHeaderSubtitle').textContent = 'Novo Recebimento';
            document.getElementById('mobSaveBtn').textContent = 'Salvar Recebimento';
            this._resetReceiptForm();
        } else if (screen === 'stock-list') {
            this._previousScreen = 'home';
            document.getElementById('mobHeaderSubtitle').textContent = 'Estoque';
            this.loadStockList();
        } else if (screen === 'stock-details') {
            document.getElementById('mobHeaderSubtitle').textContent = 'Detalhe';
            this._renderStockDetails();
        }
    },

    goBack() {
        this.showScreen(this._previousScreen || 'home');
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

function _esc(value) {
    return String(value)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
}

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
