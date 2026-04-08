/**
 * ── app.js ──
 * Módulo principal de roteamento da aplicação WCM.
 * Define o mapa de rotas e controla a navegação entre telas.
 */

const API = window.location.origin;

/**
 * Mapa de rotas da aplicação.
 * Define título e módulo renderizador para cada tela.
 */
const ROUTES = {
    // ── Analítico ──
    dashboard:              { title: "Dashboard",              module: Dashboard },
    'consumption-stats':    { title: "Estatística de Consumo", module: ConsumptionStats },

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

/** Rota atualmente ativa. */
let _currentRoute = null;

showScreen("dashboard");

/**
 * Exibe a tela solicitada e atualiza o header.
 * Antes de navegar, consulta canLeave() no módulo atual — se retornar false,
 * a navegação é cancelada (o módulo exibe o confirm internamente).
 * @param {string} name - Nome da rota
 */
async function showScreen(name) {
    // Navigation guard: módulos de detalhe podem vetar a saída
    if (_currentRoute && _currentRoute.module && typeof _currentRoute.module.canLeave === 'function') {
        const allowed = await _currentRoute.module.canLeave();
        if (!allowed) return;
    }

    const headerOptions = document.getElementById("headerOptionsContent");
    headerOptions.innerHTML = "";

    const route = ROUTES[name];
    if (!route) {
        console.error(`Rota não encontrada: ${name}`);
        return;
    }

    _currentRoute = route;

    // Update sidebar active state — detail routes highlight their parent
    const activeRouteKey = route.parent || name;
    document.querySelectorAll('.sidebar button[data-route]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.route === activeRouteKey);
    });

    const content = document.getElementById("content");
    const titleEl = document.getElementById("headerTitle");

    if (route.parent) {
        const parentRoute = ROUTES[route.parent];
        titleEl.innerHTML = `
            <span class="header-breadcrumb">
                <span class="header-breadcrumb__sep">›</span>
                <button class="header-breadcrumb__parent" onclick="showScreen('${route.parent}')">${parentRoute ? parentRoute.title : route.parent}</button>
                <span class="header-breadcrumb__sep">›</span>
                <span>${route.title}</span>
            </span>`;
    } else {
        titleEl.innerHTML = `<span class="header-breadcrumb"><span class="header-breadcrumb__sep">›</span><span>${route.title}</span></span>`;
    }

    if (route.module) {
        content.innerHTML = await route.module.render();
        route.module.load();
    }
}