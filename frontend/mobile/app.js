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
    /** \u00cdndice do item sendo editado inline no formul\u00e1rio (null = nenhum) */
    _editingItemIndex: null,
    /** Tela anterior (para o botão voltar) */
    _previousScreen: 'home',

    // ── Inicialização ────────────────────────────────────────────────────────

    async init() {
        // ── Redirecionamento por tamanho de tela ─────────────────
        if (window.innerWidth >= 768) {
            window.location.replace('/app');
            return;
        }

        // ── Guarda de autenticação ────────────────────────────────
        const token = localStorage.getItem('wcm.auth.token');
        if (!token) {
            window.location.replace('/mobile/login');
            return;
        }
        try {
            const res = await fetch(`${API}/auth/verify`, {
                headers: { 'x-auth-token': token }
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            if (data.name)  localStorage.setItem('wcm.auth.name',  data.name);
            if (data.email) localStorage.setItem('wcm.auth.email', data.email);

            // Armazena usuário e permissões (mesma estrutura do desktop)
            window.AppUser = data.user || null;
            if (window.AppUser) {
                if (!window.AppUser.email && data.email) window.AppUser.email = data.email;
                if (!window.AppUser.name  && data.name)  window.AppUser.name  = data.name;
            }
            window.AppPermissions = data.permissions || [];
        } catch {
            localStorage.removeItem('wcm.auth.token');
            localStorage.removeItem('wcm.auth.email');
            localStorage.removeItem('wcm.auth.name');
            window.location.replace('/mobile/login');
            return;
        }

        // Carrega configurações globais
        await loadAppSettings();

        try {
            const [suppliers, materials, operators] = await Promise.all([
                apiCall(API + '/suppliers'),
                apiCall(API + '/materials'),
                apiCall(API + '/operators'),
            ]);

            _fillSelect('mobSupplier', suppliers, 'name', 'Selecione...');
            _fillSelect('mobListSupplierFilter', suppliers, 'name', 'Fornecedor');
            _fillSelect('mobItemMaterial', materials, 'name', 'Selecione...');
            this._materialsCache = materials || [];
            // Atualiza visibilidade do campo código ao trocar material
            const matEl = document.getElementById('mobItemMaterial');
            if (matEl) matEl.addEventListener('change', () => MobApp._onMobMaterialChange());
            _fillSelect('mobItemOperator', operators, 'name', 'Selecione...');

            {
                const locations = await apiCall(API + '/locations');
                const filtered = filterUserLocations(locations || []);
                const locEl = document.getElementById('mobLocation');
                if (locEl) {
                    locEl.innerHTML = '<option value="">Selecione...</option>'
                        + filtered.map(l => `<option value="${l.id}">${_esc(l.name)}</option>`).join('');
                }
                document.getElementById('fieldLocation').style.display = '';
            }
        } catch {
            this._toast('Erro ao carregar dados do servidor', 'error');
        }

        this._applyMobilePermissions();
        this.showScreen('home');
    },

    // ── Navegação entre telas ────────────────────────────────────────────────

    /** Mapa de telas mobile → permissão necessária (módulo + tela) */
    _screenPermissions: {
        'list':          { module: 'procurement', screen: 'receipts' },
        'form':          { module: 'procurement', screen: 'receipts' },
        'stock-list':    { module: 'inventory',   screen: 'stock-units' },
        'stock-details': { module: 'inventory',   screen: 'stock-units' },
    },

    /**
     * Oculta atalhos / itens do bottom nav que o usuário não tem permissão de ver.
     */
    _applyMobilePermissions() {
        const receiptsNav = document.getElementById('mobBottomNavReceipts');
        const stockNav    = document.getElementById('mobBottomNavStock');
        if (receiptsNav) receiptsNav.style.display = hasScreenAccess('procurement', 'receipts') ? '' : 'none';
        if (stockNav)    stockNav.style.display    = hasScreenAccess('inventory', 'stock-units') ? '' : 'none';
    },

    /**
     * Alterna entre tema claro e escuro, persistindo a escolha.
     */
    toggleTheme() {
        const root = document.documentElement;
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('wcm.mobile.theme', next); } catch { /* ignora */ }
        this._updateThemeChrome();
        // Redesenha o gráfico para atualizar cores que dependem das CSS vars
        if (this.HomeScreen && this.HomeScreen._policyFull) {
            this.HomeScreen.refresh();
        }
    },

    /**
     * Atualiza estado ativo dos itens do bottom nav.
     */
    _syncBottomNav(screen) {
        const map = {
            'home': 'home',
            'profile': 'home',
            'list': 'list', 'form': 'list',
            'stock-list': 'stock-list', 'stock-details': 'stock-list',
            'orders': 'orders',
            'more': 'more',
        };
        const target = map[screen] || 'home';
        document.querySelectorAll('.mob-bottom-nav-item').forEach(el => {
            el.classList.toggle('mob-bottom-nav-item--active', el.dataset.screen === target);
        });
    },

    /** Telas top-level — exibem o bottom nav. */
    _toplevelScreens: new Set(['home', 'list', 'stock-list', 'orders', 'more', 'profile']),

    /** Telas com layout temático (escondem o header legado). */
    _themedScreens: new Set(['home', 'profile', 'orders', 'more']),

    /**
     * Renderiza/atualiza o avatar e os campos do perfil a partir do AppUser.
     */
    _renderUserChrome() {
        const user  = window.AppUser || null;
        const name  = (user && user.name)  || localStorage.getItem('wcm.auth.name')  || '';
        const email = (user && user.email) || localStorage.getItem('wcm.auth.email') || '';

        const initials = (() => {
            const trimmed = (name || '').trim();
            if (!trimmed) return '·';
            const parts = trimmed.split(/\s+/);
            if (parts.length === 1) return parts[0].slice(0, 2);
            return (parts[0][0] + parts[parts.length - 1][0]);
        })();

        const homeAvatar = document.getElementById('mobHomeAvatarInitials');
        if (homeAvatar) homeAvatar.textContent = initials;

        const profileInit  = document.getElementById('mobProfileInitials');
        const profileName  = document.getElementById('mobProfileName');
        const profileEmail = document.getElementById('mobProfileEmail');
        if (profileInit)  profileInit.textContent  = initials;
        if (profileName)  profileName.textContent  = name  || 'Usuário';
        if (profileEmail) profileEmail.textContent = email || '—';

        this._updateThemeChrome();
    },

    /** Atualiza textos/estado relacionados ao tema (label e badge no perfil). */
    _updateThemeChrome() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const title  = document.getElementById('mobProfileThemeTitle');
        const sub    = document.getElementById('mobProfileThemeSub');
        const state  = document.getElementById('mobProfileThemeState');
        if (title) title.textContent = isDark ? 'Modo claro' : 'Modo escuro';
        if (sub)   sub.textContent   = 'Toque para alternar';
        if (state) state.textContent = isDark ? 'escuro' : 'claro';
    },

    showScreen(screen) {
        // Verificar permissão (home é sempre acessível)
        const perm = this._screenPermissions[screen];
        if (perm && !hasScreenAccess(perm.module, perm.screen)) {
            this._toast('Sem permissão para acessar esta tela', 'error');
            return;
        }

        const screensById = {
            'home':          'screenHome',
            'list':          'screenList',
            'form':          'screenForm',
            'stock-list':    'screenStockList',
            'stock-details': 'screenStockDetails',
            'profile':       'screenProfile',
            'orders':        'screenOrders',
            'more':          'screenMore',
        };
        Object.entries(screensById).forEach(([key, id]) => {
            const el = document.getElementById(id);
            if (el) el.style.display = (screen === key) ? '' : 'none';
        });

        document.body.classList.toggle('mob-on-toplevel', this._toplevelScreens.has(screen));
        document.body.classList.toggle('mob-on-themed',   this._themedScreens.has(screen));
        this._syncBottomNav(screen);

        const backBtn = document.getElementById('mobBackBtn');
        if (backBtn) backBtn.style.display = screen === 'home' ? 'none' : '';

        if (screen === 'home') {
            document.getElementById('mobHeaderSubtitle').textContent = '';
            this._renderUserChrome();
            this.HomeScreen.load();
        } else if (screen === 'profile') {
            this._renderUserChrome();
        } else if (screen === 'more') {
            this.MoreScreen.load();
        } else if (screen === 'orders') {
            /* placeholder — sem load */
        } else if (screen === 'list') {
            this._editingReceipt = null;
            this._previousScreen = 'home';
            document.getElementById('mobHeaderSubtitle').textContent = 'Recebimentos';
            this.loadReceipts();
        } else if (screen === 'form') {
            this._editingReceipt = null;
            this._editingItemIndex = null;
            this._previousScreen = 'list';
            document.getElementById('mobHeaderSubtitle').textContent = 'Novo Recebimento';
            document.getElementById('mobSaveBtn').textContent = 'Salvar Recebimento';
            this._resetReceiptForm();
        } else if (screen === 'stock-list') {
            this._previousScreen = 'home';
            document.getElementById('mobHeaderSubtitle').textContent = this._stockDetailMaterial
                ? _esc(this._stockDetailMaterial)
                : 'Estoque';
            this.loadStockList();
        } else if (screen === 'stock-details') {
            document.getElementById('mobHeaderSubtitle').textContent = 'Detalhe';
            this._renderStockDetails();
        }
    },

    goBack() {
        // Se estiver no detalhe de lotes, voltar para a visão agregada
        if (this._stockDetailMaterial) {
            this._stockDetailMaterial = null;
            this.showScreen('stock-list');
            return;
        }
        this.showScreen(this._previousScreen || 'home');
    },

    // ── Utilitários internos ─────────────────────────────────────────────────

    /**
     * Exibe um bottom-sheet modal de confirmação.
     * @param {string} title - Título do modal.
     * @param {string} bodyHTML - HTML do corpo do modal.
     * @returns {Promise<boolean>} true se confirmado, false se cancelado.
     */
    _mobConfirm(title, bodyHTML) {
        return new Promise((resolve) => {
            const backdrop = document.getElementById('mobConfirmBackdrop');
            document.getElementById('mobConfirmTitle').textContent = title;
            document.getElementById('mobConfirmBody').innerHTML = bodyHTML;
            backdrop.style.display = 'flex';
            const done = (val) => { backdrop.style.display = 'none'; resolve(val); };
            document.getElementById('mobConfirmOk').onclick     = () => done(true);
            document.getElementById('mobConfirmCancel').onclick = () => done(false);
            backdrop.onclick = (e) => { if (e.target === backdrop) done(false); };
        });
    },

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
 * Encerra a sessão do usuário: invalida o token no backend,
 * limpa o localStorage e redireciona para /mobile/login.
 */
async function mobLogout() {
    const token = localStorage.getItem('wcm.auth.token');
    if (token) {
        try {
            await fetch(`${API}/auth/logout`, {
                method: 'POST',
                headers: { 'x-auth-token': token }
            });
        } catch { /* ignora erros de rede */ }
    }
    localStorage.removeItem('wcm.auth.token');
    localStorage.removeItem('wcm.auth.email');
    localStorage.removeItem('wcm.auth.name');
    window.location.replace('/mobile/login');
}

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
