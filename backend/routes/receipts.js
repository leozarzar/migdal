/**
 * @module routes/receipts
 * @description Goods receipt CRUD routes.
 * Manages receipts (incoming deliveries) and their linked stock units.
 */

const router = require("express").Router();
const db = require("../db");
const requirePermission = require('../middleware/require-permission');

// ── Table Setup ──────────────────────────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT,
        nature TEXT,
        date TEXT,
        supplier TEXT,
        order_id TEXT,
        operator TEXT
    )
`, (err) => {
    if (err) {
        console.error("Erro ao garantir tabela receipts:", err.message);
    }
});

// ── Migrations ───────────────────────────────────────────────────────────

// Adiciona colunas se não existirem (migração)
db.run(`ALTER TABLE receipts ADD COLUMN nature TEXT`, () => {});
db.run(`ALTER TABLE receipts ADD COLUMN operator TEXT`, () => {});
db.run(`ALTER TABLE receipts ADD COLUMN location_id INTEGER`, () => {});

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /receipts - Lista todos os recebimentos
 */
router.get("/", (req, res) => {
    db.all("SELECT * FROM receipts ORDER BY date DESC, id DESC", [], (err, rows) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Erro ao carregar recebimentos",
                error: err.message
            });
        }
        res.json(rows);
    });
});

/**
 * GET /receipts/items/:id - Lista unidades de estoque de um recebimento
 */
router.get("/items/:id", (req, res) => {
    const { id } = req.params;

    db.all(
        `SELECT * FROM stock_units
         WHERE receipt_id = ?`,
        [id],
        (err, rows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao carregar itens do recebimento",
                    error: err.message
                });
            }
            res.json(rows || []);
        }
    );
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /receipts - Cria um novo recebimento
 */
router.post("/", requirePermission('procurement', 'receipts', 'create'), (req, res) => {
    const { code, nature, date, supplier, order_id, operator, location_id } = req.body;

    // Validação
    if (!nature || !date) {
        return res.status(400).json({
            success: false,
            message: "Natureza e data são obrigatórios"
        });
    }

    db.run(
        `INSERT INTO receipts (code, nature, date, supplier, order_id, operator, location_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [code, nature, date, supplier || null, order_id || null, operator || null, location_id || null],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao salvar recebimento",
                    error: err.message
                });
            }
            res.json({
                success: true,
                message: "Recebimento salvo com sucesso",
                id: this.lastID,
                code: code
            });
        }
    );
});

// ── PUT Endpoints ─────────────────────────────────────────────────────────

/**
 * PUT /receipts/update - Atualiza um recebimento
 */
router.put("/update", requirePermission('procurement', 'receipts', 'edit'), (req, res) => {
    const { id, nature, date, supplier, order_id, operator, location_id } = req.body;

    // Validação
    if (!nature || !date) {
        return res.status(400).json({
            success: false,
            message: "Natureza e data são obrigatórios"
        });
    }

    db.run(
        `UPDATE receipts
         SET nature = ?, date = ?, supplier = ?, order_id = ?, operator = ?, location_id = ?
         WHERE id = ?`,
        [nature, date, supplier || null, order_id || null, operator || null, location_id || null, id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao atualizar recebimento",
                    error: err.message
                });
            }

            // Cascata: propaga location_id para stock_units e stock_movements deste recebimento
            const locVal = location_id || null;
            db.run(`UPDATE stock_units SET location_id = ? WHERE receipt_id = ?`, [locVal, id]);
            db.run(`UPDATE stock_movements SET location_id = ? WHERE receipt_id = ?`, [locVal, id]);

            res.json({
                success: true,
                message: "Recebimento atualizado com sucesso",
                updated: this.changes
            });
        }
    );
});

// ── DELETE Endpoints ──────────────────────────────────────────────────────

/**
 * DELETE /receipts/:id - Deleta um recebimento
 */
router.delete("/:id", requirePermission('procurement', 'receipts', 'delete'), (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "ID do recebimento é obrigatório"
        });
    }

    db.run(
        `DELETE FROM receipts WHERE id = ?`,
        [id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao deletar recebimento",
                    error: err.message
                });
            }
            res.json({
                success: true,
                message: "Recebimento deletado com sucesso",
                deleted: this.changes
            });
        }
    );
});

/**
 * DELETE /receipts/items/:id - Deleta todas as unidades de estoque de um recebimento
 */
router.delete("/items/:id", requirePermission('procurement', 'receipts', 'edit'), (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "ID do recebimento é obrigatório"
        });
    }

    db.run(
        `DELETE FROM stock_units WHERE receipt_id = ?`,
        [id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao deletar recebimento",
                    error: err.message
                });
            }

            // Sync: remove all movements for this receipt
            db.run(`DELETE FROM stock_movements WHERE receipt_id = ?`, [id]);

            res.json({
                success: true,
                message: "Recebimento deletado com sucesso",
                deleted: this.changes
            });
        }
    );
});

module.exports = router;