/**
 * @module routes/suppliers
 * @description Supplier registry CRUD routes.
 * Manages the suppliers master data table.
 */

const router = require("express").Router();
const db = require("../db");

// ── Table Setup ──────────────────────────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )
`, (err) => {
    if (err) {
        console.error("Erro ao garantir tabela suppliers:", err.message);
    }
});

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /suppliers - Lista todos os fornecedores
 */
router.get("/", (req, res) => {
    db.all("SELECT * FROM suppliers ORDER BY name", [], (err, rows) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Erro ao carregar fornecedores",
                error: err.message
            });
        }
        res.json(rows || []);
    });
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /suppliers - Cria um novo fornecedor
 */
router.post("/", (req, res) => {
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Nome do fornecedor é obrigatório"
        });
    }

    db.run(
        `INSERT INTO suppliers (name) VALUES (?)`,
        [name.trim()],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({
                        success: false,
                        message: "Este fornecedor já existe"
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: "Erro ao criar fornecedor",
                    error: err.message
                });
            }
            res.status(201).json({
                success: true,
                message: "Fornecedor criado com sucesso",
                id: this.lastID
            });
        }
    );
});

// ── PUT Endpoints ─────────────────────────────────────────────────────────

/**
 * PUT /suppliers/:id - Atualiza um fornecedor
 */
router.put("/:id", (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Nome do fornecedor é obrigatório"
        });
    }

    db.run(
        `UPDATE suppliers SET name = ? WHERE id = ?`,
        [name.trim(), id],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({
                        success: false,
                        message: "Este fornecedor já existe"
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: "Erro ao atualizar fornecedor",
                    error: err.message
                });
            }
            res.json({
                success: true,
                message: "Fornecedor atualizado com sucesso",
                updated: this.changes
            });
        }
    );
});

// ── DELETE Endpoints ──────────────────────────────────────────────────────

/**
 * DELETE /suppliers/:id - Deleta um fornecedor
 */
router.delete("/:id", (req, res) => {
    const { id } = req.params;

    db.run(
        `DELETE FROM suppliers WHERE id = ?`,
        [id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao deletar fornecedor",
                    error: err.message
                });
            }
            res.json({
                success: true,
                message: "Fornecedor deletado com sucesso",
                deleted: this.changes
            });
        }
    );
});

module.exports = router;
