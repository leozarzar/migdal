/**
 * ── app.js ──
 * Módulo principal de roteamento da aplicação WCM.
 * Define o mapa de rotas, controla a navegação entre telas
 * e gerencia o sistema de abas no header.
 *
 * Cada aba possui um elemento DOM persistente (.tab-content) — o conteúdo
 * NÃO é destruído ao trocar de aba, preservando estado de formulários.
 * Navegar via sidebar dentro de uma aba RE-renderiza a tela (com guard canLeave).
 * Trocar de aba NÃO dispara canLeave e NÃO re-renderiza.
 * Fechar uma aba dispara canLeave apenas no módulo da aba fechada.
 */

const API = window.location.origin;

/**
 * Encerra a sessão do usuário: invalida o token no backend,
 * limpa o localStorage e redireciona para /login.
 */
async function appLogout() {
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
    window.location.replace('/login');
}

/**
 * Mapa de rotas da aplicação.
 * Define título e módulo renderizador para cada tela.
 */
const ROUTES = {
    // ── Analítico ──
    dashboard:              { title: "Dashboard",              module: Dashboard },
    'consumption-stats':    { title: "Estatística de Consumo", module: ConsumptionStats },
    'kpi-dashboard':        { title: "KPIs",                   module: KpiDashboard },

    // ── Estoque ──
    'stock-units':            { title: "Estoque",             module: StockUnits },
    'stock-monitor':          { title: "Monitor de Estoque",  module: StockMonitor },
    'stock-policies':         { title: "Política de Estoque", module: StockPolicies },
    'stock-policies-details': { title: "Política de Estoque", module: StockPoliciesDetails, parent: 'stock-policies' },

    // ── Compras ──
    orders:            { title: "Pedidos",                 module: Orders },
    "order-details":   { title: "Detalhes",                module: OrdersDetails,         parent: 'orders' },
    receipts:          { title: "Recebimentos",            module: Receipts },
    "receipt-details": { title: "Detalhes",                module: ReceiptsDetails,        parent: 'receipts' },

    // ── Cadastros ──
    materials:        { title: "Materiais",    module: Materials },
    suppliers:        { title: "Fornecedores", module: Suppliers },
    operators:        { title: "Operadores",   module: Operators },
    groups:           { title: "Grupos",       module: Groups },
    'groups-details': { title: "Grupo",        module: GroupsDetails, parent: 'groups' },
};

// ══════════════════════════════════════════════════════════════════
// ══ Estado de abas ══
// ══════════════════════════════════════════════════════════════════

const TAB_STORAGE_KEY = 'wcm.tabs';
const TAB_MAX = 3;

/** @type {Array<{id: number, route: string, title: string}>} */
let _tabs        = [];
let _activeTabId = null;
let _nextTabId   = 1;

/** Elemento DOM persistente de cada aba. @type {Map<number, HTMLElement>} */
const _tabEls = new Map();

/** Rota atualmente renderizada em cada aba. @type {Map<number, string>} */
const _tabRoutes = new Map();

/**
 * innerHTML de #headerOptionsContent salvo por aba.
 * Capturado ao SAIR da aba — momento em que load() certamente terminou.
 * @type {Map<number, string>}
 */
const _tabHeaderOptions = new Map();

// ══════════════════════════════════════════════════════════════════
// ══ Persistência ══
// ══════════════════════════════════════════════════════════════════

function _saveTabs() {
    try {
        localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify({
            tabs: _tabs,
            activeId: _activeTabId,
            nextId: _nextTabId,
        }));
    } catch { /* quota exceeded — ignorar */ }
}

/** @returns {boolean} true se restaurou estado válido */
function _restoreTabs() {
    try {
        const raw = localStorage.getItem(TAB_STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data.tabs || !data.tabs.length) return false;
        const valid = data.tabs.filter(t => ROUTES[t.route]);
        if (!valid.length) return false;
        // Nunca restaurar telas de detalhe — redirecionar para a tela pai
        _tabs = valid.map(t => {
            const route = ROUTES[t.route];
            if (!route.parent) return t;
            const parentRoute = ROUTES[route.parent];
            return { ...t, route: route.parent, title: parentRoute ? parentRoute.title : t.title };
        });
        _nextTabId   = data.nextId || (_tabs.length + 1);
        _activeTabId = _tabs.some(t => t.id === data.activeId) ? data.activeId : _tabs[0].id;
        return true;
    } catch { return false; }
}

// ══════════════════════════════════════════════════════════════════
// ══ Renderização da tab bar ══
// ══════════════════════════════════════════════════════════════════

function _escTab(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _renderTabBar() {
    const container = document.getElementById('headerTabs');
    if (!container) return;

    const canClose = _tabs.length > 1;
    const canAdd   = _tabs.length < TAB_MAX;

    const tabsHtml = _tabs.map(tab => {
        const isActive = tab.id === _activeTabId;
        const closeBtn = canClose
            ? `<span class="header-tab-close" onclick="event.stopPropagation(); closeTab(${tab.id})" title="Fechar aba">×</span>`
            : '';
        return `<div class="header-tab${isActive ? ' header-tab--active' : ''}"
                     onclick="switchTab(${tab.id})"
                     title="${_escTab(tab.title)}">
                    <span class="header-tab-label">${_escTab(tab.title)}</span>
                    ${closeBtn}
                </div>`;
    }).join('');

    const addBtn = canAdd
        ? `<button class="header-tab-new" onclick="openNewTab()" title="Nova aba">+</button>`
        : '';

    container.innerHTML = `<div class="header-tabs-strip">${tabsHtml}${addBtn}</div>`;
}

// ══════════════════════════════════════════════════════════════════
// ══ Utilitários internos ══
// ══════════════════════════════════════════════════════════════════

/** Atualiza o item ativo da sidebar para a rota informada. */
function _updateSidebarActive(routeName) {
    const route = ROUTES[routeName];
    if (!route) return;
    const activeRouteKey = route.parent || routeName;
    document.querySelectorAll('.sidebar button[data-route]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.route === activeRouteKey);
    });
}

/** Salva o conteúdo de #headerOptionsContent para a aba especificada. */
function _saveHeaderOptions(tabId) {
    const el = document.getElementById('headerOptionsContent');
    _tabHeaderOptions.set(tabId, el ? el.innerHTML : '');
}

/**
 * Mostra o elemento DOM da aba indicada, oculta os demais,
 * restaura #headerOptionsContent e atualiza a sidebar — sem re-renderizar.
 */
function _activateTabDisplay(tabId) {
    _tabEls.forEach((el, id) => {
        el.classList.toggle('tab-content--active', id === tabId);
    });

    const headerOptionsEl = document.getElementById('headerOptionsContent');
    if (headerOptionsEl) {
        headerOptionsEl.innerHTML = _tabHeaderOptions.get(tabId) || '';
    }

    const routeName = _tabRoutes.get(tabId);
    if (routeName) {
        _updateSidebarActive(routeName);
        const route = ROUTES[routeName];
        if (route?.module?.onTabFocus) route.module.onTabFocus();
    }
}

/** Retorna o objeto de rota atualmente ativo na aba ativa, ou null. */
function _getActiveRoute() {
    const routeName = _tabRoutes.get(_activeTabId);
    return routeName ? ROUTES[routeName] : null;
}

// ══════════════════════════════════════════════════════════════════
// ══ Renderização de rota ══
// ══════════════════════════════════════════════════════════════════

/**
 * Renderiza uma rota dentro do elemento DOM da aba especificada.
 * Cria o elemento se ainda não existir.
 * @param {string} name   - Nome da rota
 * @param {number} tabId  - ID da aba alvo
 */
async function _loadRoute(name, tabId) {
    const route = ROUTES[name];
    if (!route) { console.error(`Rota não encontrada: ${name}`); return; }

    // Montar título da aba (breadcrumb para telas de detalhe)
    let tabTitle = route.title;
    if (route.parent) {
        const parentRoute = ROUTES[route.parent];
        tabTitle = `${parentRoute ? parentRoute.title : route.parent} › ${route.title}`;
    }

    // Atualizar metadados da aba
    const tab = _tabs.find(t => t.id === tabId);
    if (tab) { tab.route = name; tab.title = tabTitle; }
    _tabRoutes.set(tabId, name);

    _saveTabs();
    _renderTabBar();
    _updateSidebarActive(name);

    // Criar elemento DOM da aba se ainda não existir
    let tabEl = _tabEls.get(tabId);
    if (!tabEl) {
        tabEl = document.createElement('div');
        tabEl.className = 'tab-content';
        tabEl.id = `tab-content-${tabId}`;
        document.getElementById('content').appendChild(tabEl);
        _tabEls.set(tabId, tabEl);
    }

    // Mostrar esta aba, ocultar as demais
    _tabEls.forEach((el, id) => {
        el.classList.toggle('tab-content--active', id === tabId);
    });

    // Limpar botões contextuais antes de renderizar
    const headerOptionsEl = document.getElementById('headerOptionsContent');
    if (headerOptionsEl) headerOptionsEl.innerHTML = '';

    // Renderizar tela no elemento da aba.
    // Desconecta temporariamente outras abas do DOM para evitar colisão de
    // getElementById quando a mesma rota está aberta em mais de uma aba.
    if (route.module) {
        const contentEl = document.getElementById('content');
        const detachedEls = [];
        _tabEls.forEach((el, id) => {
            if (id !== tabId && el.parentNode) {
                detachedEls.push(el);
                contentEl.removeChild(el);
            }
        });
        try {
            tabEl.innerHTML = await route.module.render();
            await route.module.load();
        } finally {
            detachedEls.forEach(el => contentEl.appendChild(el));
        }
    }
}

// ══════════════════════════════════════════════════════════════════
// ══ API pública de abas ══
// ══════════════════════════════════════════════════════════════════

/**
 * Abre uma nova aba e navega para a rota indicada.
 * @param {string} [route='dashboard']
 */
async function openNewTab(route) {
    if (_tabs.length >= TAB_MAX) return;
    route = route || 'dashboard';
    const r = ROUTES[route] || ROUTES['dashboard'];

    // Salvar headerOptions da aba atual antes de sair
    if (_activeTabId !== null) _saveHeaderOptions(_activeTabId);

    const tab = { id: _nextTabId++, route, title: r.title };
    _tabs.push(tab);
    _activeTabId = tab.id;
    _saveTabs();
    _renderTabBar();
    await _loadRoute(route, tab.id);
}

/**
 * Troca para uma aba existente.
 * NÃO dispara canLeave — o estado da aba atual é preservado no DOM.
 * @param {number} tabId
 */
async function switchTab(tabId) {
    if (tabId === _activeTabId) return;

    // Salvar headerOptions da aba atual antes de sair
    _saveHeaderOptions(_activeTabId);

    _activeTabId = tabId;
    _saveTabs();
    _renderTabBar();

    if (_tabEls.has(tabId)) {
        // Aba já renderizada — apenas mostrar e restaurar estado visual
        _activateTabDisplay(tabId);
    } else {
        // Primeira visita nesta sessão — renderizar
        const tab = _tabs.find(t => t.id === tabId);
        if (tab) await _loadRoute(tab.route, tabId);
    }
}

/**
 * Fecha uma aba. Chama canLeave() no módulo da aba sendo fechada.
 * A última aba não pode ser fechada.
 * @param {number} tabId
 */
async function closeTab(tabId) {
    if (_tabs.length <= 1) return;

    const idx = _tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    // Verificar canLeave() no módulo da aba sendo fechada (apenas se já foi renderizada)
    if (_tabEls.has(tabId)) {
        const routeName = _tabRoutes.get(tabId);
        if (routeName) {
            const routeForTab = ROUTES[routeName];
            if (routeForTab && routeForTab.module && typeof routeForTab.module.canLeave === 'function') {
                const allowed = await routeForTab.module.canLeave();
                if (!allowed) return;
            }
        }
    }

    const isActive = tabId === _activeTabId;

    // Remover elemento DOM
    const tabEl = _tabEls.get(tabId);
    if (tabEl) { tabEl.remove(); _tabEls.delete(tabId); }
    _tabHeaderOptions.delete(tabId);
    _tabRoutes.delete(tabId);
    _tabs.splice(idx, 1);

    if (isActive) {
        const newIdx = Math.min(idx, _tabs.length - 1);
        _activeTabId = _tabs[newIdx].id;
        _saveTabs();
        _renderTabBar();

        const newTabId = _tabs[newIdx].id;
        if (_tabEls.has(newTabId)) {
            _activateTabDisplay(newTabId);
        } else {
            await _loadRoute(_tabs[newIdx].route, newTabId);
        }
    } else {
        _saveTabs();
        _renderTabBar();
    }
}

// ══════════════════════════════════════════════════════════════════
// ══ Roteamento público ══
// ══════════════════════════════════════════════════════════════════

/**
 * Navega para uma tela dentro da aba ativa, re-renderizando seu conteúdo.
 * Dispara canLeave() no módulo atualmente exibido na aba ativa.
 * Chamado pelos botões da sidebar e por links internos das telas.
 * @param {string} name - Nome da rota
 */
async function showScreen(name) {
    const activeRoute = _getActiveRoute();
    if (activeRoute && activeRoute.module && typeof activeRoute.module.canLeave === 'function') {
        const allowed = await activeRoute.module.canLeave();
        if (!allowed) return;
    }
    await _loadRoute(name, _activeTabId);
}

// ══════════════════════════════════════════════════════════════════
// ══ Inicialização ══
// ══════════════════════════════════════════════════════════════════

(async function init() {
    // ── Redirecionamento por tamanho de tela ─────────────────
    if (window.innerWidth < 768) {
        window.location.replace('/mobile/app');
        return;
    }

    // ── Guarda de autenticação ────────────────────────────────
    // Se não há token, redireciona para /login imediatamente.
    // O backend já bloqueia todas as chamadas de API sem token,
    // mas este redirect garante que o usuário não fique numa
    // tela sem dados — e evita aguardar falhas de fetch.
    const token = localStorage.getItem('wcm.auth.token');
    if (!token) {
        window.location.replace('/login');
        return;
    }

    // Valida o token no backend (pode ter expirado)
    try {
        const res = await fetch(`${API}/auth/verify`, {
            headers: { 'x-auth-token': token }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.name) localStorage.setItem('wcm.auth.name', data.name);
    } catch {
        localStorage.removeItem('wcm.auth.token');
        localStorage.removeItem('wcm.auth.email');
        localStorage.removeItem('wcm.auth.name');
        window.location.replace('/login');
        return;
    }

    // ── Popula sidebar ────────────────────────────────────────
    const name    = localStorage.getItem('wcm.auth.name')  || '';
    const email   = localStorage.getItem('wcm.auth.email') || '';
    const display = name || email;
    const emailEl  = document.getElementById('sidebarUserEmail');
    const avatarEl = document.getElementById('sidebarUserAvatar');
    if (emailEl)  emailEl.textContent  = display;
    if (avatarEl) avatarEl.textContent = display.charAt(0).toUpperCase();

    // ── Restauração de abas e roteamento ──────────────────────
    const restored = _restoreTabs();

    if (!restored) {
        _tabs = [{ id: _nextTabId++, route: 'dashboard', title: 'Dashboard' }];
        _activeTabId = _tabs[0].id;
    }

    _renderTabBar();

    const activeTab = _tabs.find(t => t.id === _activeTabId);
    await _loadRoute(activeTab ? activeTab.route : 'dashboard', _activeTabId);

    NotificationsManager.init();
})();