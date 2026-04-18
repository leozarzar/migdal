/**
 * @module server
 * @description Express application entry point.
 * Configures middleware, mounts route modules, and starts the HTTP server.
 */

require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const cron    = require("node-cron");

// ── Database Initialization ───────────────────────────────────────────────

const db = require("./db");

// ── Route Imports ─────────────────────────────────────────────────────────

// Inventory & warehouse
const stockUnitsRoutes = require("./routes/stock-units");       // Individual stock unit tracking
const stockMonitorRoutes = require("./routes/stock-monitor");   // Stock balance timeline
const stockPoliciesRoutes = require("./routes/stock-policies"); // Inventory policies & forecasting

// Procurement
const ordersRoutes = require("./routes/orders");       // Purchase orders
const receiptsRoutes = require("./routes/receipts");   // Goods receipts
const suppliersRoutes = require("./routes/suppliers"); // Supplier registry

// Master data
const materialsRoutes = require("./routes/materials");       // Material catalog
const groupsRoutes = require("./routes/groups");             // Material groups
const operatorsRoutes = require("./routes/operators");       // Operator registry
const consumptionRoutes      = require("./routes/consumption");    // Consumption statistics
const kpisRoutes             = require('./routes/kpis');            // KPI dashboard
const notificationsRoutes    = require("./routes/notifications");   // Notification alerts
const weeklyReportRoutes     = require("./routes/weekly-report");   // Weekly AI report
const authRoutes             = require("./routes/auth");             // Authentication
const rolesRoutes            = require("./routes/roles");            // Roles & permissions
const settingsRoutes         = require("./routes/settings");         // App settings
const stockMovementsRoutes   = require("./routes/stock-movements");   // Stock movements (simple mode)
const locationsRoutes        = require("./routes/locations");         // Storage locations
// ── Middleware ────────────────────────────────────────────────────────────

const app = express();

app.use(cors());
app.use(express.json());

// ── Static Files ──────────────────────────────────────────────────────────

const frontendDir = path.join(__dirname, "../frontend");

// Rotas de página explícitas — devem vir ANTES do static para não serem
// interceptadas pelo index automático do express.static.

// Raiz         →  redireciona para /login
app.get("/", (req, res) => {
    res.redirect("/login");
});

// Login page   →  GET /login
app.get("/login", (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(frontendDir, "login.html"));
});

// Desktop app  →  GET /app
app.get("/app", (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(frontendDir, "index.html"));
});

// Mobile: raiz redireciona para o login mobile
app.get("/mobile", (req, res) => {
    res.redirect("/mobile/login");
});

// Mobile login page  →  GET /mobile/login
app.get("/mobile/login", (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(frontendDir, "mobile-login.html"));
});

// Mobile app         →  GET /mobile/app
app.get("/mobile/app", (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(frontendDir, "mobile.html"));
});

// Assets compartilhados (JS, CSS, ícones etc.) — index desativado para não
// conflitar com a rota "/" acima.
app.use(express.static(frontendDir, { index: false }));

// ── Auth Middleware ──────────────────────────────────────────────────────
// A segurança real dos dados está aqui: mesmo que alguém remova o overlay
// no navegador, todas as chamadas à API retornarão 401 sem token válido.

app.use((req, res, next) => {
    // Rotas de autenticação são públicas
    if (req.path.startsWith('/auth')) return next();

    const token = req.headers['x-auth-token'];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Não autenticado.' });
    }

    db.get(
        `SELECT s.user_id, u.name, u.role_id, r.is_admin
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE s.token = ? AND s.expires_at > datetime('now')`,
        [token],
        (err, session) => {
            if (err || !session) {
                return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada.' });
            }
            req.user = {
                id: session.user_id,
                name: session.name,
                roleId: session.role_id,
                isAdmin: !!session.is_admin
            };
            // Carregar localizações do usuário
            db.all(
                `SELECT location_id FROM user_locations WHERE user_id = ?`,
                [session.user_id],
                (locErr, locRows) => {
                    req.user.locationIds = (locRows || []).map(r => r.location_id);
                    next();
                }
            );
        }
    );
});

const requirePermission = require('./middleware/require-permission');

// ── Route Mounting ────────────────────────────────────────────────────────

// Helper: aplica requirePermission por método HTTP a um router montado
function withPermissions(routeModule, module, screen) {
    const wrapper = express.Router();
    wrapper.use((req, res, next) => {
        let action = null;
        if (req.method === 'POST')   action = 'create';
        if (req.method === 'PUT' || req.method === 'PATCH') action = 'edit';
        if (req.method === 'DELETE') action = 'delete';
        if (!action) return next(); // GET → sem restrição de ação
        requirePermission(module, screen, action)(req, res, next);
    });
    wrapper.use(routeModule);
    return wrapper;
}

app.use("/stock-units", stockUnitsRoutes);
app.use("/stock-monitor", stockMonitorRoutes);
app.use("/stock-policies", stockPoliciesRoutes);

app.use("/orders", ordersRoutes);
app.use("/receipts", receiptsRoutes);
app.use("/suppliers", withPermissions(suppliersRoutes, 'registry', 'suppliers'));

app.use("/materials", withPermissions(materialsRoutes, 'registry', 'materials'));
app.use("/groups", withPermissions(groupsRoutes, 'registry', 'groups'));
app.use("/operators", withPermissions(operatorsRoutes, 'registry', 'operators'));
app.use("/consumption", consumptionRoutes);
app.use('/kpis', kpisRoutes);
app.use("/notifications", notificationsRoutes);
app.use("/weekly-report", weeklyReportRoutes);
app.use("/auth", authRoutes);
app.use("/roles", rolesRoutes);
app.use("/settings", settingsRoutes);
app.use("/stock-movements", stockMovementsRoutes);
app.use("/locations", withPermissions(locationsRoutes, 'registry', 'locations'));

// ── Cron: relatório semanal às segunda-feira 07:00 ────────────────────────

cron.schedule("0 7 * * 1", () => {
    console.log("[cron] Gerando relatório semanal...");
    const http = require("http");
    const req  = http.request({ hostname: "localhost", port: 3000, path: "/weekly-report/generate", method: "POST" });
    req.on("error", err => console.error("[cron] Erro ao gerar relatório:", err.message));
    req.end();
}, { timezone: "America/Sao_Paulo" });
// ── Server Startup ────────────────────────────────────────────────────────

app.listen(3000, () => {
    const { networkInterfaces } = require("os");
    const nets = networkInterfaces();
    const localIP = Object.values(nets)
        .flat()
        .find(n => n.family === "IPv4" && !n.internal)?.address || "localhost";

    console.log("Server running on 3000");
    console.log("");
    console.log("  Desktop  →  http://localhost:3000/app");
    console.log("  Mobile   →  http://localhost:3000/mobile");
    console.log("");
    console.log("  Desktop  →  http://" + localIP + ":3000/app");
    console.log("  Mobile   →  http://" + localIP + ":3000/mobile");
    console.log("");
});