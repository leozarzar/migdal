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
    'stock-policies-details': { title: "Política de Estoque", module: StockPoliciesDetails },

    // ── Compras ──
    orders:            { title: "Pedidos",                 module: Orders },
    "order-details":   { title: "Detalhes do Pedido",      module: OrdersDetails },
    receipts:          { title: "Recebimentos",            module: Receipts },
    "receipt-details": { title: "Detalhes do Recebimento", module: ReceiptsDetails },

    // ── Cadastros ──
    materials:        { title: "Materiais",    module: Materials },
    suppliers:        { title: "Fornecedores", module: Suppliers },
    operators:        { title: "Operadores",   module: Operators },
    groups:           { title: "Grupos",       module: Groups },
    'groups-details': { title: "Grupo",        module: GroupsDetails },
};

showScreen("dashboard");

/**
 * Exibe a tela solicitada e atualiza o header.
 * @param {string} name - Nome da rota
 */
async function showScreen(name) {
    const headerOptions = document.getElementById("headerOptionsContent");
    headerOptions.innerHTML = "";

    const route = ROUTES[name];
    if (!route) {
        console.error(`Rota não encontrada: ${name}`);
        return;
    }

    const content = document.getElementById("content");
    const title = document.getElementById("headerTitle");

    title.textContent = route.title;

    if (route.module) {
        content.innerHTML = await route.module.render();
        route.module.load();
    }
}