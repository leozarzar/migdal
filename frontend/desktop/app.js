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

// ══════════════════════════════════════════════════════════════════
// ══ Registro de Módulos ══
// ══════════════════════════════════════════════════════════════════

/**
 * Registro central de módulos do ERP.
 * Cada módulo agrupa telas relacionadas e define metadados para a sidebar.
 *
 * Propriedades de tela:
 *   title  — título exibido na sidebar e na aba
 *   module — objeto literal da tela (Screen Object)
 *   icon   — ícone Material Symbols (opcional; para itens da sidebar)
 *   parent — rota pai para breadcrumb (telas de detalhe)
 *   hidden — se true, não aparece na sidebar (telas de detalhe)
 */
const MODULE_REGISTRY = {
    panel: {
        name: 'Painel',
        icon: 'dashboard',
        order: 1,
        screens: {
            dashboard:       { title: 'Dashboard',    module: Dashboard,    icon: 'dashboard',    actions: ['view'] },
            'kpi-dashboard': { title: 'KPIs',         module: KpiDashboard, icon: 'query_stats',  actions: ['view'] },
        }
    },
    inventory: {
        name: 'Estoque',
        icon: 'inventory_2',
        order: 2,
        screens: {
            'stock-units':            { title: 'Estoque',             module: StockUnits,           icon: 'inventory_2', actions: ['view', 'edit', 'delete'] },
            'stock-monitor':          { title: 'Monitor de Estoque',  module: StockMonitor,         icon: 'monitoring',  actions: ['view'] },
            'consumption-stats':      { title: 'Estat. de Consumo',   module: ConsumptionStats,     icon: 'bar_chart',   actions: ['view', 'edit'] },
            'stock-policies':         { title: 'Política de Estoque', module: StockPolicies,        icon: 'policy',      actions: ['view', 'create', 'edit', 'delete'] },
            'stock-policies-details': { title: 'Política de Estoque', module: StockPoliciesDetails, parent: 'stock-policies', hidden: true },
        }
    },
    procurement: {
        name: 'Compras',
        icon: 'shopping_cart',
        order: 3,
        screens: {
            orders:            { title: 'Pedidos',       module: Orders,          icon: 'shopping_cart',  actions: ['view', 'create', 'edit', 'delete'] },
            'order-details':   { title: 'Detalhes',      module: OrdersDetails,   parent: 'orders',   hidden: true },
            receipts:          { title: 'Recebimentos',  module: Receipts,        icon: 'move_to_inbox',  actions: ['view', 'create', 'edit', 'delete'] },
            'receipt-details': { title: 'Detalhes',      module: ReceiptsDetails, parent: 'receipts', hidden: true },
        }
    },
    registry: {
        name: 'Cadastros',
        icon: 'app_registration',
        order: 4,
        screens: {
            materials:        { title: 'Materiais',    module: Materials,     icon: 'category',  actions: ['view', 'create', 'edit', 'delete'] },
            suppliers:        { title: 'Fornecedores', module: Suppliers,     icon: 'store',     actions: ['view', 'create', 'edit', 'delete'] },
            operators:        { title: 'Operadores',   module: Operators,     icon: 'badge',     actions: ['view', 'create', 'edit', 'delete'] },
            groups:           { title: 'Grupos',       module: Groups,        icon: 'folder',    actions: ['view', 'create', 'edit', 'delete'] },
            'groups-details': { title: 'Grupo',        module: GroupsDetails, parent: 'groups', hidden: true },
        }
    },
    admin: {
        name: 'Admin',
        icon: 'admin_panel_settings',
        order: 99,
        screens: {
            'admin-roles':         { title: 'Papéis',    module: AdminRoles,        icon: 'shield_person',  actions: ['view', 'create', 'edit', 'delete'] },
            'admin-roles-details': { title: 'Detalhes',  module: AdminRolesDetails, parent: 'admin-roles', hidden: true },
            'admin-users':         { title: 'Usuários',  module: AdminUsers,        icon: 'group',          actions: ['view', 'create', 'edit', 'delete'] },
        }
    },
};

/**
 * Mapa de rotas da aplicação.
 * Gerado automaticamente a partir do MODULE_REGISTRY.
 */
const ROUTES = {};
for (const [moduleId, mod] of Object.entries(MODULE_REGISTRY)) {
    for (const [screenId, screen] of Object.entries(mod.screens)) {
        ROUTES[screenId] = {
            title:  screen.title,
            module: screen.module,
            parent: screen.parent || undefined,
            _moduleId: moduleId,
        };
    }
}

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
// ══ Sidebar dinâmica ══
// ══════════════════════════════════════════════════════════════════

const SIDEBAR_STORAGE_PREFIX = 'wcm.sidebar.';

/**
 * Gera o HTML da sidebar a partir do MODULE_REGISTRY.
 * Cada módulo é uma seção colapsável (accordion).
 * Módulos/telas são filtrados conforme permissões do usuário.
 * O estado aberto/fechado é salvo em localStorage.
 */
function _renderSidebar() {
    const nav = document.getElementById('sidebarNav');
    if (!nav) return;

    const sorted = Object.entries(MODULE_REGISTRY)
        .sort(([, a], [, b]) => a.order - b.order);

    let html = '';
    for (const [moduleId, mod] of sorted) {
        // Filtrar por permissão de módulo
        if (!hasModuleAccess(moduleId)) continue;

        // Coletar telas visíveis (não hidden e com permissão)
        const visibleScreens = Object.entries(mod.screens)
            .filter(([, s]) => !s.hidden)
            .filter(([screenId]) => hasScreenAccess(moduleId, screenId));

        if (visibleScreens.length === 0) continue;

        const storageKey = SIDEBAR_STORAGE_PREFIX + moduleId;
        const isOpen = localStorage.getItem(storageKey) !== 'closed';

        html += `<div class="sidebar-module" data-module="${moduleId}">`;
        html += `<button class="sidebar-module-header" onclick="_toggleSidebarModule('${moduleId}')">
                    <span class="material-symbols-outlined sidebar-module-icon">${mod.icon}</span>
                    <span class="sidebar-module-name">${mod.name}</span>
                    <span class="material-symbols-outlined sidebar-module-chevron">${isOpen ? 'expand_less' : 'expand_more'}</span>
                 </button>`;
        html += `<div class="sidebar-module-screens${isOpen ? '' : ' sidebar-module-screens--collapsed'}">`;

        for (const [screenId, screen] of visibleScreens) {
            html += `<button class="sidebar-screen-btn" data-route="${screenId}" onclick="showScreen('${screenId}')">${screen.title}</button>`;
        }

        html += `</div></div>`;
    }

    nav.innerHTML = html;
}

/**
 * Alterna o estado de um módulo da sidebar (aberto/fechado).
 * @param {string} moduleId
 */
function _toggleSidebarModule(moduleId) {
    const storageKey = SIDEBAR_STORAGE_PREFIX + moduleId;
    const moduleEl = document.querySelector(`.sidebar-module[data-module="${moduleId}"]`);
    if (!moduleEl) return;

    const screensEl = moduleEl.querySelector('.sidebar-module-screens');
    const chevronEl = moduleEl.querySelector('.sidebar-module-chevron');
    if (!screensEl) return;

    const isCollapsed = screensEl.classList.toggle('sidebar-module-screens--collapsed');
    localStorage.setItem(storageKey, isCollapsed ? 'closed' : 'open');
    if (chevronEl) chevronEl.textContent = isCollapsed ? 'expand_more' : 'expand_less';
}

// ══════════════════════════════════════════════════════════════════
// ══ Utilitários internos ══
// ══════════════════════════════════════════════════════════════════

/** Atualiza o item ativo da sidebar para a rota informada. */
function _updateSidebarActive(routeName) {
    const route = ROUTES[routeName];
    if (!route) return;
    const activeRouteKey = route.parent || routeName;

    // Expandir o módulo que contém a rota ativa
    if (route._moduleId) {
        const moduleEl = document.querySelector(`.sidebar-module[data-module="${route._moduleId}"]`);
        if (moduleEl) {
            const screensEl = moduleEl.querySelector('.sidebar-module-screens');
            const chevronEl = moduleEl.querySelector('.sidebar-module-chevron');
            if (screensEl && screensEl.classList.contains('sidebar-module-screens--collapsed')) {
                screensEl.classList.remove('sidebar-module-screens--collapsed');
                if (chevronEl) chevronEl.textContent = 'expand_less';
                localStorage.setItem(SIDEBAR_STORAGE_PREFIX + route._moduleId, 'open');
            }
        }
    }

    document.querySelectorAll('.sidebar-screen-btn[data-route]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.route === activeRouteKey);
    });
}

/**
 * Retorna a primeira rota acessível ao usuário (para fallback de navegação).
 * @returns {string}
 */
function _getFirstAccessibleRoute() {
    const sorted = Object.entries(MODULE_REGISTRY)
        .sort(([, a], [, b]) => a.order - b.order);
    for (const [moduleId, mod] of sorted) {
        if (!hasModuleAccess(moduleId)) continue;
        for (const [screenId, screen] of Object.entries(mod.screens)) {
            if (screen.hidden) continue;
            if (hasScreenAccess(moduleId, screenId)) return screenId;
        }
    }
    return 'dashboard'; // fallback absoluto
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
 * Verifica permissão de acesso antes de renderizar.
 * Chamado pelos botões da sidebar e por links internos das telas.
 * @param {string} name - Nome da rota
 */
async function showScreen(name) {
    // Verificar permissão de acesso à rota
    const targetRoute = ROUTES[name];
    if (targetRoute && targetRoute._moduleId) {
        if (!hasScreenAccess(targetRoute._moduleId, targetRoute.parent || name)) {
            alert('Você não tem permissão para acessar esta tela.');
            return;
        }
    }

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
    let authData;
    try {
        const res = await fetch(`${API}/auth/verify`, {
            headers: { 'x-auth-token': token }
        });
        if (!res.ok) throw new Error();
        authData = await res.json();
        if (authData.name) localStorage.setItem('wcm.auth.name', authData.name);

        // Armazenar dados de permissão no estado global
        window.AppUser = authData.user || { id: null, name: authData.name, role: null, isAdmin: false };
        window.AppPermissions = authData.permissions || [];
    } catch {
        localStorage.removeItem('wcm.auth.token');
        localStorage.removeItem('wcm.auth.email');
        localStorage.removeItem('wcm.auth.name');
        window.location.replace('/login');
        return;
    }

    // ── Popula sidebar ────────────────────────────────────────
    _renderSidebar();

    const name    = localStorage.getItem('wcm.auth.name')  || '';
    const email   = localStorage.getItem('wcm.auth.email') || '';
    const nameEl   = document.getElementById('sidebarUserName');
    const emailEl  = document.getElementById('sidebarUserEmail');
    const avatarEl = document.getElementById('sidebarUserAvatar');
    const display  = name || email;
    if (nameEl)   nameEl.textContent   = name || email;
    if (emailEl)  emailEl.textContent  = name ? email : '';
    if (avatarEl) avatarEl.textContent = display.charAt(0).toUpperCase();

    // ── Restauração de abas e roteamento ──────────────────────
    const restored = _restoreTabs();

    if (!restored) {
        const defaultRoute = _getFirstAccessibleRoute();
        const defaultTitle = ROUTES[defaultRoute] ? ROUTES[defaultRoute].title : 'Dashboard';
        _tabs = [{ id: _nextTabId++, route: defaultRoute, title: defaultTitle }];
        _activeTabId = _tabs[0].id;
    }

    _renderTabBar();

    const activeTab = _tabs.find(t => t.id === _activeTabId);
    await _loadRoute(activeTab ? activeTab.route : 'dashboard', _activeTabId);

    NotificationsManager.init();
})();