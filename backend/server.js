/**
 * @module server
 * @description Express application entry point.
 * Configures middleware, mounts route modules, and starts the HTTP server.
 */

const express = require("express");
const cors    = require("cors");
const path    = require("path");

// ── Database Initialization ───────────────────────────────────────────────

require("./db");

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
const consumptionRoutes = require("./routes/consumption");   // Consumption statistics
const kpisRoutes         = require('./routes/kpis');          // KPI dashboard
// ── Middleware ────────────────────────────────────────────────────────────

const app = express();

app.use(cors());
app.use(express.json());

// ── Static Files ──────────────────────────────────────────────────────────

const frontendDir = path.join(__dirname, "../frontend");

// Assets compartilhados (JS, CSS, ícones etc.)
app.use(express.static(frontendDir));

// Desktop app  →  GET /app
app.get("/app", (req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
});

// Mobile app   →  GET /mobile
app.get("/mobile", (req, res) => {
    res.sendFile(path.join(frontendDir, "mobile.html"));
});

// ── Route Mounting ────────────────────────────────────────────────────────

app.use("/stock-units", stockUnitsRoutes);
app.use("/stock-monitor", stockMonitorRoutes);
app.use("/stock-policies", stockPoliciesRoutes);

app.use("/orders", ordersRoutes);
app.use("/receipts", receiptsRoutes);
app.use("/suppliers", suppliersRoutes);

app.use("/materials", materialsRoutes);
app.use("/groups", groupsRoutes);
app.use("/operators", operatorsRoutes);
app.use("/consumption", consumptionRoutes);app.use('/kpis',        kpisRoutes);
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