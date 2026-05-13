/**
 * @module routes/orders
 * @description Purchase order CRUD routes.
 * Manages orders and their line items (order_items), plus related stock unit lookups.
 */

const router = require("express").Router();
const db = require("../db");
const requirePermission = require('../middleware/require-permission');

// ── Table Setup ──────────────────────────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT,
        date TEXT,
        supplier TEXT,
        due_date TEXT,
        expected_date TEXT,
        status TEXT
    )
`, (err) => {
    if (err) {
        console.error("Erro ao garantir tabela orders:", err.message);
    }
});

db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        material TEXT,
        quantity REAL
    )
`, (err) => {
    if (err) {
        console.error("Erro ao garantir tabela order_items:", err.message);
    }
});

// ── Migrations ───────────────────────────────────────────────────────────

db.run(`ALTER TABLE order_items ADD COLUMN group_id INTEGER`, () => {});
db.run(`ALTER TABLE order_items ADD COLUMN group_quantity REAL`, () => {});

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /orders - Lista todos os pedidos ordenados por data.
 * Query params: page, limit, supplier
 *   Quando page/limit presentes: retorna { data, total }
 *   Inclui total_qty (order_items) e received_qty (stock_units) calculados via subquery.
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
        where += ` AND o.supplier = ?`;
        params.push(supplier);
    }

    const selectEnriched = `
        SELECT
            o.*,
            COALESCE((
                SELECT SUM(CASE WHEN oi.group_id IS NOT NULL THEN oi.group_quantity ELSE oi.quantity END)
                FROM order_items oi WHERE oi.order_id = o.id
            ), 0) as total_qty,
            COALESCE((
                SELECT SUM(su.weight)
                FROM stock_units su
                INNER JOIN receipts r ON su.receipt_id = r.id
                WHERE CAST(r.order_id AS INTEGER) = o.id
            ), 0) as received_qty,
            (
                SELECT ROUND(AVG(julianday(r.date) - julianday(o.date)))
                FROM receipts r WHERE CAST(r.order_id AS INTEGER) = o.id
            ) as lead_time
        FROM orders o
    `;

    const dataSql = `${selectEnriched} ${where} ORDER BY o.date DESC, o.id DESC${paginated ? ' LIMIT ? OFFSET ?' : ''}`;

    if (paginated) {
        const countSql = `SELECT COUNT(*) as total FROM orders o ${where}`;
        db.get(countSql, params, (err, countRow) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar pedidos", error: err.message });
            db.all(dataSql, [...params, limitNum, offset], (err2, rows) => {
                if (err2) return res.status(500).json({ success: false, message: "Erro ao carregar pedidos", error: err2.message });
                res.json({ data: rows || [], total: countRow?.total || 0 });
            });
        });
    } else {
        db.all(dataSql, params, (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar pedidos", error: err.message });
            res.json(rows || []);
        });
    }
});

/**
 * GET /orders/suppliers - Lista distinta de fornecedores em pedidos (para filtro).
 */
router.get("/suppliers", (req, res) => {
    db.all("SELECT DISTINCT supplier FROM orders WHERE supplier IS NOT NULL AND supplier != '' ORDER BY supplier", [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao carregar fornecedores", error: err.message });
        res.json((rows || []).map(r => r.supplier));
    });
});

/**
 * GET /orders/:id - Retorna um pedido pelo ID (com dados enriquecidos).
 */
router.get("/:id", (req, res) => {
    const { id } = req.params;
    const selectEnriched = `
        SELECT
            o.*,
            COALESCE((
                SELECT SUM(CASE WHEN oi.group_id IS NOT NULL THEN oi.group_quantity ELSE oi.quantity END)
                FROM order_items oi WHERE oi.order_id = o.id
            ), 0) as total_qty,
            COALESCE((
                SELECT SUM(su.weight)
                FROM stock_units su
                INNER JOIN receipts r ON su.receipt_id = r.id
                WHERE CAST(r.order_id AS INTEGER) = o.id
            ), 0) as received_qty,
            (
                SELECT ROUND(AVG(julianday(r.date) - julianday(o.date)))
                FROM receipts r WHERE CAST(r.order_id AS INTEGER) = o.id
            ) as lead_time
        FROM orders o
    `;
    db.get(`${selectEnriched} WHERE o.id = ?`, [id], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao carregar pedido", error: err.message });
        if (!row) return res.status(404).json({ success: false, message: "Pedido não encontrado" });
        res.json(row);
    });
});

/**
 * GET /orders/items/:id - Lista itens de um pedido
 */
router.get("/items/:id", (req, res) => {
    const { id } = req.params;
    db.all(
        `SELECT oi.*, g.name as group_name
         FROM order_items oi
         LEFT JOIN groups g ON g.id = oi.group_id
         WHERE oi.order_id = ?`,
        [id],
        (err, rows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao carregar itens do pedido",
                    error: err.message
                });
            }
            res.json(rows || []);
        }
    );
});

/**
 * GET /orders/:id/stock-units - Lista unidades de estoque vinculadas a um pedido
 * Joins through receipts to find stock_units belonging to this order.
 */
router.get("/:id/stock-units", (req, res) => {
    const { id } = req.params;

    db.all(
        `SELECT b.*
        FROM stock_units b
        JOIN receipts r ON b.receipt_id = r.id
        JOIN orders o ON r.order_id = o.id
        WHERE o.id = ?`,
        [id],
        (err, rows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao carregar unidades de estoque do pedido",
                    error: err.message
                });
            }
            res.json(rows || []);
        }
    );
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /orders - Cria um novo pedido
 */
router.post("/", requirePermission('procurement', 'orders', 'create'), (req, res) => {
    const { date, supplier, due_date, expected_date, status } = req.body;

    db.run(
        `INSERT INTO orders (date, supplier, due_date, expected_date, status)
        VALUES (?, ?, ?, ?, ?)`,
        [date, supplier, due_date, expected_date, status],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao criar pedido",
                    error: err.message
                });
            }
            res.json({ id: this.lastID });
        }
    );
});

/**
 * POST /orders/items - Adiciona um item a um pedido
 */
router.post("/items", requirePermission('procurement', 'orders', 'edit'), (req, res) => {
    const { order_id, material, quantity, group_id, group_quantity } = req.body;

    db.run(
        `INSERT INTO order_items (order_id, material, quantity, group_id, group_quantity)
        VALUES (?, ?, ?, ?, ?)`,
        [order_id, material || null, quantity || null, group_id || null, group_quantity || null],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao criar item do pedido",
                    error: err.message
                });
            }
            res.json({ id: this.lastID });
        }
    );
});

// ── PUT Endpoints ─────────────────────────────────────────────────────────

/**
 * PUT /orders/update - Atualiza um pedido existente
 */
router.put("/update", requirePermission('procurement', 'orders', 'edit'), (req, res) => {
    const { id, date, supplier, due_date, expected_date, status } = req.body;

    db.run(
        `UPDATE orders
         SET date = ?, supplier = ?, due_date = ?, expected_date = ?, status = ?
         WHERE id = ?`,
        [date, supplier, due_date, expected_date, status, id],
        function (err) {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    message: "Erro ao atualizar pedido",
                    error: err.message 
                });
            }
            res.json({ 
                success: true, 
                message: "Pedido atualizado com sucesso",
                updated: this.changes 
            });
        }
    );
});

// ── DELETE Endpoints ──────────────────────────────────────────────────────

/**
 * DELETE /orders/items - Deleta todos os itens de um pedido por order_id
 */
router.delete("/items", requirePermission('procurement', 'orders', 'edit'), (req, res) => {
    const { id } = req.body;

    db.run(
        `DELETE FROM order_items
         WHERE order_id = ?`,
        [id],
        function (err) {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    message: "Erro ao deletar itens do pedido",
                    error: err.message 
                });
            }
            res.json({ 
                success: true, 
                message: "Itens do pedido deletados com sucesso",
                deleted: this.changes 
            });
        }
    );
});

/**
 * DELETE /orders/:id - Deleta um pedido e todos os seus itens
 */
router.delete("/:id", requirePermission('procurement', 'orders', 'delete'), (req, res) => {
    const { id } = req.params;

    // Deleta itens do pedido primeiro
    db.run(
        `DELETE FROM order_items
         WHERE order_id = ?`,
        [id],
        function (err) {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    message: "Erro ao deletar itens do pedido",
                    error: err.message 
                });
            }

            // Deleta o pedido
            db.run(
                `DELETE FROM orders
                 WHERE id = ?`,
                [id],
                function (err) {
                    if (err) {
                        return res.status(500).json({ 
                            success: false, 
                            message: "Erro ao deletar pedido",
                            error: err.message 
                        });
                    }
                    res.json({ 
                        success: true, 
                        message: "Pedido deletado com sucesso",
                        deleted: this.changes 
                    });
                }
            );
        }
    );
});

module.exports = router;