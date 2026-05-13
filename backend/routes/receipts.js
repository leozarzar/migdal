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
 * GET /receipts - Lista todos os recebimentos.
 * Query params: page, limit, supplier
 *   Quando page/limit presentes: retorna { data, total }
 *   Inclui total_qty calculado via subquery em stock_units.
 */
router.get("/", (req, res) => {
    const { page, limit, supplier } = req.query;

    const paginated = page != null || limit != null;
    const pageNum   = Math.max(1, parseInt(page, 10) || 1);
    const limitNum  = Math.max(1, parseInt(limit, 10) || 13);
    const offset    = (pageNum - 1) * limitNum;

    let where = 'WHERE 1=1';
    const params = [];
    if (supplier) {
        where += ` AND r.supplier = ?`;
        params.push(supplier);
    }

    const selectEnriched = `
        SELECT
            r.*,
            COALESCE((SELECT SUM(su.weight) FROM stock_units su WHERE su.receipt_id = r.id), 0) as total_qty
        FROM receipts r
    `;

    const dataSql = `${selectEnriched} ${where} ORDER BY r.date DESC, r.id DESC${paginated ? ' LIMIT ? OFFSET ?' : ''}`;

    if (paginated) {
        const countSql = `SELECT COUNT(*) as total FROM receipts r ${where}`;
        db.get(countSql, params, (err, countRow) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar recebimentos", error: err.message });
            db.all(dataSql, [...params, limitNum, offset], (err2, rows) => {
                if (err2) return res.status(500).json({ success: false, message: "Erro ao carregar recebimentos", error: err2.message });
                res.json({ data: rows || [], total: countRow?.total || 0 });
            });
        });
    } else {
        db.all(dataSql, params, (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar recebimentos", error: err.message });
            res.json(rows || []);
        });
    }
});

/**
 * GET /receipts/suppliers - Lista distinta de fornecedores em recebimentos (para filtro).
 */
router.get("/suppliers", (req, res) => {
    db.all("SELECT DISTINCT supplier FROM receipts WHERE supplier IS NOT NULL AND supplier != '' ORDER BY supplier", [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao carregar fornecedores", error: err.message });
        res.json((rows || []).map(r => r.supplier));
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