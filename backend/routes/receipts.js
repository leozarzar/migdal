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
db.run(`ALTER TABLE receipts ADD COLUMN status TEXT DEFAULT 'COMPLETED'`, () => {});
db.run(`ALTER TABLE receipts ADD COLUMN total_qty_snapshot REAL`, () => {});
db.run(`ALTER TABLE receipts ADD COLUMN created_at TEXT`, () => {});
db.run(`ALTER TABLE receipts ADD COLUMN supplier_id INTEGER`, () => {
    // Backfill: tenta resolver supplier_id a partir do nome (apenas onde estiver NULL)
    db.run(`
        UPDATE receipts
           SET supplier_id = (SELECT id FROM suppliers WHERE name = receipts.supplier)
         WHERE supplier_id IS NULL AND supplier IS NOT NULL AND supplier != ''
    `, () => {});
});

// Helper: resolve supplier_id a partir do nome quando não enviado (compat com frontend)
function _resolveSupplierId(body, cb) {
    if (body.supplier_id != null && body.supplier_id !== '') return cb(null, Number(body.supplier_id));
    if (!body.supplier) return cb(null, null);
    db.get(`SELECT id FROM suppliers WHERE name = ?`, [body.supplier], (err, row) => {
        if (err) return cb(err);
        cb(null, row ? row.id : null);
    });
}

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /receipts - Lista todos os recebimentos.
 * Query params: page, limit, supplier
 *   Quando page/limit presentes: retorna { data, total }
 *   Inclui total_qty calculado via subquery em stock_units.
 */
router.get("/", (req, res) => {
    const { page, limit, supplier, status_filter } = req.query;

    const paginated = page != null || limit != null;
    const pageNum   = Math.max(1, parseInt(page, 10) || 1);
    const limitNum  = Math.max(1, parseInt(limit, 10) || 13);
    const offset    = (pageNum - 1) * limitNum;

    let where = 'WHERE 1=1';
    const params = [];
    if (supplier) {
        // Aceita filtro por nome: bate via supplier_id (resolvido na hora) ou pelo texto legado
        where += ` AND (COALESCE(s.name, r.supplier) = ?)`;
        params.push(supplier);
    }
    if (status_filter === 'active') {
        where += ` AND r.status IN ('COMPLETED', 'DRAFT')`;
    } else if (status_filter === 'saved') {
        where += ` AND r.status = 'COMPLETED'`;
    }

    const selectEnriched = `
        SELECT
            r.id, r.code, r.nature, r.date, r.order_id, r.operator,
            r.location_id, r.status, r.total_qty_snapshot, r.created_at,
            r.supplier_id,
            COALESCE(s.name, r.supplier) AS supplier,
            COALESCE((SELECT SUM(su.weight) FROM stock_units su WHERE su.receipt_id = r.id), 0) +
            COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm WHERE sm.receipt_id = r.id AND sm.type = 'entry' AND sm.status IN ('DRAFT', 'ABANDONED')), 0)
            as total_qty
        FROM receipts r
        LEFT JOIN suppliers s ON s.id = r.supplier_id
    `;

    const dataSql = `${selectEnriched} ${where} ORDER BY COALESCE(r.date, r.created_at) DESC, r.id DESC${paginated ? ' LIMIT ? OFFSET ?' : ''}`;

    if (paginated) {
        const countSql = `SELECT COUNT(*) as total FROM receipts r LEFT JOIN suppliers s ON s.id = r.supplier_id ${where}`;
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
    db.all(
        `SELECT DISTINCT COALESCE(s.name, r.supplier) AS supplier
           FROM receipts r
           LEFT JOIN suppliers s ON s.id = r.supplier_id
          WHERE COALESCE(s.name, r.supplier) IS NOT NULL AND COALESCE(s.name, r.supplier) != ''
          ORDER BY supplier`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar fornecedores", error: err.message });
            res.json((rows || []).map(r => r.supplier));
        }
    );
});

/**
 * GET /receipts/items/:id - Lista unidades de estoque e movimentos simples em rascunho de um recebimento
 */
router.get("/items/:id", (req, res) => {
    const { id } = req.params;

    db.all(`SELECT *, 'stock_unit' as item_type FROM stock_units WHERE receipt_id = ?`, [id], (err, units) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao carregar itens do recebimento", error: err.message });

        db.all(
            `SELECT sm.id, sm.quantity, sm.operator, sm.receipt_id, sm.location_id, sm.packaging_id, sm.packaging_count, sm.date AS date_in, m.id AS material_id, m.name AS material, 'movement' AS item_type
             FROM stock_movements sm
             JOIN materials m ON m.id = sm.material_id
             WHERE sm.receipt_id = ? AND sm.status = 'DRAFT'`,
            [id],
            (err2, movements) => {
                if (err2) return res.status(500).json({ success: false, message: "Erro ao carregar movimentos do recebimento", error: err2.message });
                res.json([...(units || []), ...(movements || [])]);
            }
        );
    });
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /receipts/draft - Cria um rascunho de recebimento (sem validações de cabeçalho)
 * Retorna o ID gerado para que o frontend possa exibir o código e persistir itens imediatamente.
 */
router.post("/draft", requirePermission('procurement', 'receipts', 'create'), (req, res) => {
    const { nature, date, location_id } = req.body || {};
    db.run(
        `INSERT INTO receipts (status, created_at, nature, date, location_id) VALUES ('DRAFT', datetime('now'), ?, ?, ?)`,
        [nature || null, date || null, location_id || null],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: "Erro ao criar rascunho", error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

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

    _resolveSupplierId(req.body, (resErr, supplierId) => {
        if (resErr) return res.status(500).json({ success: false, message: "Erro ao resolver fornecedor", error: resErr.message });
        db.run(
            `INSERT INTO receipts (code, nature, date, supplier, supplier_id, order_id, operator, location_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [code, nature, date, supplier || null, supplierId, order_id || null, operator || null, location_id || null],
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

    _resolveSupplierId(req.body, (resErr, supplierId) => {
        if (resErr) return res.status(500).json({ success: false, message: "Erro ao resolver fornecedor", error: resErr.message });
        db.run(
        `UPDATE receipts
         SET nature = ?, date = ?, supplier = ?, supplier_id = ?, order_id = ?, operator = ?, location_id = ?
         WHERE id = ?`,
        [nature, date, supplier || null, supplierId, order_id || null, operator || null, location_id || null, id],
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
});

// ── PATCH Endpoints ───────────────────────────────────────────────────────

/**
 * PATCH /receipts/:id/header - Salva campos do cabeçalho sem validações nem mudança de status
 */
router.patch("/:id/header", requirePermission('procurement', 'receipts', 'create'), (req, res) => {
    const { id } = req.params;
    const { nature, date, supplier, order_id, location_id } = req.body;
    _resolveSupplierId(req.body, (resErr, supplierId) => {
        if (resErr) return res.status(500).json({ success: false, message: "Erro ao resolver fornecedor", error: resErr.message });
        db.run(
            `UPDATE receipts SET nature = ?, date = ?, supplier = ?, supplier_id = ?, order_id = ?, location_id = ? WHERE id = ?`,
            [nature || null, date || null, supplier || null, supplierId, order_id || null, location_id || null, id],
            function(err) {
                if (err) return res.status(500).json({ success: false, message: "Erro ao salvar cabeçalho", error: err.message });
                if (location_id !== undefined) {
                    db.run(`UPDATE stock_units SET location_id = ? WHERE receipt_id = ?`, [location_id || null, id]);
                    db.run(`UPDATE stock_movements SET location_id = ? WHERE receipt_id = ?`, [location_id || null, id]);
                }
                res.json({ success: true });
            }
        );
    });
});

/**
 * PATCH /receipts/:id/confirm - Confirma um rascunho: salva cabeçalho e transiciona itens DRAFT
 */
router.patch("/:id/confirm", requirePermission('procurement', 'receipts', 'create'), (req, res) => {
    const { id } = req.params;
    const { nature, date, supplier, order_id, location_id } = req.body;

    if (!nature || !date) {
        return res.status(400).json({ success: false, message: "Natureza e data são obrigatórios" });
    }

    _resolveSupplierId(req.body, (resErr, supplierId) => {
    if (resErr) return res.status(500).json({ success: false, message: "Erro ao resolver fornecedor", error: resErr.message });
    db.run(
        `UPDATE receipts SET nature = ?, date = ?, supplier = ?, supplier_id = ?, order_id = ?, location_id = ?, status = 'COMPLETED' WHERE id = ?`,
        [nature, date, supplier || null, supplierId, order_id || null, location_id || null, id],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: "Erro ao confirmar recebimento", error: err.message });

            // Confirmar stock_units DRAFT: atualizar status + criar movimentos de entrada
            db.all(`SELECT * FROM stock_units WHERE receipt_id = ? AND status = 'DRAFT'`, [id], (err2, units) => {
                if (err2) return res.status(500).json({ success: false, message: "Erro ao confirmar itens", error: err2.message });

                const locVal = location_id || null;
                db.run(`UPDATE stock_units SET status = 'IN_STOCK', remaining_weight = weight WHERE receipt_id = ? AND status = 'DRAFT'`, [id]);
                db.run(`UPDATE stock_units SET location_id = ? WHERE receipt_id = ?`, [locVal, id]);
                db.run(`UPDATE stock_movements SET location_id = ? WHERE receipt_id = ?`, [locVal, id]);

                for (const su of (units || [])) {
                    db.get(`SELECT id FROM materials WHERE name = ?`, [su.material], (_, mat) => {
                        const materialId = mat ? mat.id : 0;
                        db.run(
                            `INSERT INTO stock_movements (type, material_id, quantity, date, receipt_id, lot_id, location_id, operator, reason, notes)
                             VALUES ('entry', ?, ?, ?, ?, ?, ?, ?, 'purchase', NULL)`,
                            [materialId, su.weight, date, id, su.id, locVal, su.operator || null]
                        );
                    });
                }

                // Confirmar stock_movements DRAFT (itens simples)
                db.run(`UPDATE stock_movements SET status = 'CONFIRMED', date = ? WHERE receipt_id = ? AND status = 'DRAFT'`, [date, id]);

                res.json({ success: true, message: "Recebimento confirmado com sucesso" });
            });
        }
    );
    });
});

/**
 * PATCH /receipts/:id/abandon - Descarta um rascunho e limpa os itens associados
 */
router.patch("/:id/abandon", requirePermission('procurement', 'receipts', 'create'), (req, res) => {
    const { id } = req.params;

    db.run(`UPDATE stock_units SET status = 'ABANDONED' WHERE receipt_id = ? AND status = 'DRAFT'`, [id]);
    db.run(`UPDATE stock_movements SET status = 'ABANDONED' WHERE receipt_id = ? AND status = 'DRAFT'`, [id]);

    db.run(`UPDATE receipts SET status = 'ABANDONED' WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ success: false, message: "Erro ao abandonar recebimento", error: err.message });
        res.json({ success: true, message: "Recebimento abandonado" });
    });
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