/**
 * @module routes/services
 * @description Services registry CRUD routes.
 * Manages the services master data table.
 * service_type: 'quantity' (charged per unit) | 'fixed' (flat total price)
 */

const router = require("express").Router();
const db = require("../db");

// ── Table Setup ──────────────────────────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS services (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT UNIQUE NOT NULL,
        service_type TEXT NOT NULL DEFAULT 'quantity',
        unit_price  REAL NOT NULL DEFAULT 0
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela services:", err.message);
});

// ── GET ───────────────────────────────────────────────────────────────────

/**
 * GET /services - Lista todos os serviços ordenados por nome
 */
router.get("/", (req, res) => {
    db.all("SELECT * FROM services ORDER BY name", [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao carregar serviços.", error: err.message });
        res.json(rows || []);
    });
});

/**
 * GET /services/:id - Retorna um serviço pelo ID
 */
router.get("/:id", (req, res) => {
    db.get("SELECT * FROM services WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao buscar serviço.", error: err.message });
        if (!row) return res.status(404).json({ success: false, message: "Serviço não encontrado." });
        res.json(row);
    });
});

// ── POST ──────────────────────────────────────────────────────────────────

/**
 * POST /services - Cria um novo serviço
 */
router.post("/", (req, res) => {
    const { name, service_type, unit_price } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ success: false, message: "Nome do serviço é obrigatório." });
    if (!["quantity", "fixed"].includes(service_type)) return res.status(400).json({ success: false, message: "Tipo de serviço inválido. Use 'quantity' ou 'fixed'." });
    if (unit_price == null || isNaN(Number(unit_price))) return res.status(400).json({ success: false, message: "Valor do serviço é obrigatório." });

    db.run(
        `INSERT INTO services (name, service_type, unit_price) VALUES (?, ?, ?)`,
        [name.trim(), service_type, Number(unit_price)],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) return res.status(400).json({ success: false, message: "Este serviço já existe." });
                return res.status(500).json({ success: false, message: "Erro ao criar serviço.", error: err.message });
            }
            res.status(201).json({ success: true, message: "Serviço criado com sucesso.", id: this.lastID });
        }
    );
});

// ── PUT ───────────────────────────────────────────────────────────────────

/**
 * PUT /services/:id - Atualiza um serviço
 */
router.put("/:id", (req, res) => {
    const { name, service_type, unit_price } = req.body;
    const { id } = req.params;

    if (!name || !name.trim()) return res.status(400).json({ success: false, message: "Nome do serviço é obrigatório." });
    if (!["quantity", "fixed"].includes(service_type)) return res.status(400).json({ success: false, message: "Tipo de serviço inválido." });
    if (unit_price == null || isNaN(Number(unit_price))) return res.status(400).json({ success: false, message: "Valor do serviço é obrigatório." });

    db.run(
        `UPDATE services SET name = ?, service_type = ?, unit_price = ? WHERE id = ?`,
        [name.trim(), service_type, Number(unit_price), id],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) return res.status(400).json({ success: false, message: "Este serviço já existe." });
                return res.status(500).json({ success: false, message: "Erro ao atualizar serviço.", error: err.message });
            }
            res.json({ success: true, message: "Serviço atualizado com sucesso.", updated: this.changes });
        }
    );
});

// ── DELETE ────────────────────────────────────────────────────────────────

/**
 * DELETE /services/:id - Deleta um serviço
 */
router.delete("/:id", (req, res) => {
    db.run(`DELETE FROM services WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ success: false, message: "Erro ao deletar serviço.", error: err.message });
        res.json({ success: true, message: "Serviço deletado com sucesso.", deleted: this.changes });
    });
});

module.exports = router;
