/**
 * @module routes/orders
 * @description Purchase order CRUD routes.
 * Manages orders and their line items (order_items), plus related stock unit lookups.
 */

const router = require("express").Router();
const db = require("../db");

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
 * GET /orders - Lista todos os pedidos ordenados por data
 */
router.get("/", (req, res) => {
    db.all("SELECT * FROM orders ORDER BY date DESC, id DESC", [], (err, rows) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Erro ao carregar pedidos",
                error: err.message
            });
        }
        res.json(rows || []);
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
router.post("/", (req, res) => {
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
router.post("/items", (req, res) => {
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
router.put("/update", (req, res) => {
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
router.delete("/items", (req, res) => {
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
router.delete("/:id", (req, res) => {
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