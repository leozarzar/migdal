/**
 * @module routes/operators
 * @description Operator registry CRUD routes.
 * Manages the operators master data table.
 */

const router = require("express").Router();
const db = require("../db");

// ── Table Setup ──────────────────────────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS operators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )
`, (err) => {
    if (err) {
        console.error("Erro ao garantir tabela operators:", err.message);
    }
});

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /operators - Lista todos os operadores
 */
router.get("/", (req, res) => {
    db.all("SELECT * FROM operators ORDER BY name", [], (err, rows) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Erro ao carregar operadores",
                error: err.message
            });
        }
        res.json(rows || []);
    });
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /operators - Cria um novo operador
 */
router.post("/", (req, res) => {
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Nome do operador e obrigatorio"
        });
    }

    db.run(
        `INSERT INTO operators (name) VALUES (?)`,
        [name.trim()],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({
                        success: false,
                        message: "Este operador ja existe"
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: "Erro ao criar operador",
                    error: err.message
                });
            }
            res.status(201).json({
                success: true,
                message: "Operador criado com sucesso",
                id: this.lastID
            });
        }
    );
});

// ── PUT Endpoints ─────────────────────────────────────────────────────────

/**
 * PUT /operators/:id - Atualiza um operador
 */
router.put("/:id", (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Nome do operador e obrigatorio"
        });
    }

    db.run(
        `UPDATE operators SET name = ? WHERE id = ?`,
        [name.trim(), id],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({
                        success: false,
                        message: "Este operador ja existe"
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: "Erro ao atualizar operador",
                    error: err.message
                });
            }
            res.json({
                success: true,
                message: "Operador atualizado com sucesso",
                updated: this.changes
            });
        }
    );
});

// ── DELETE Endpoints ──────────────────────────────────────────────────────

/**
 * DELETE /operators/:id - Deleta um operador
 */
router.delete("/:id", (req, res) => {
    const { id } = req.params;

    db.run(
        `DELETE FROM operators WHERE id = ?`,
        [id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao deletar operador",
                    error: err.message
                });
            }
            res.json({
                success: true,
                message: "Operador deletado com sucesso",
                deleted: this.changes
            });
        }
    );
});

module.exports = router;
