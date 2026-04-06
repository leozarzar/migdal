/**
 * @module routes/materials
 * @description Material catalog CRUD routes.
 * Manages the materials master data table with optional color and group assignment.
 */

const router = require("express").Router();
const db = require("../db");

// ── Table Setup ──────────────────────────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )
`, (err) => {
    if (err) {
        console.error("Erro ao garantir tabela materials:", err.message);
    }
});

// ── Migrations ───────────────────────────────────────────────────────────

// Migration: add color column if it doesn't exist yet
db.run(`ALTER TABLE materials ADD COLUMN color TEXT`, () => {});

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /materials - Lista todos os materiais
 */
router.get("/", (req, res) => {
    db.all("SELECT * FROM materials ORDER BY name", [], (err, rows) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Erro ao carregar materiais",
                error: err.message
            });
        }
        res.json(rows || []);
    });
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /materials - Cria um novo material
 */
router.post("/", (req, res) => {
    const { name, color, group_id } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Nome do material é obrigatório"
        });
    }

    db.run(
        `INSERT INTO materials (name, color, group_id) VALUES (?, ?, ?)`,
        [name.trim(), color || null, group_id || null],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({
                        success: false,
                        message: "Este material já existe"
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: "Erro ao criar material",
                    error: err.message
                });
            }
            res.status(201).json({
                success: true,
                message: "Material criado com sucesso",
                id: this.lastID
            });
        }
    );
});

// ── PUT Endpoints ─────────────────────────────────────────────────────────

/**
 * PUT /materials/:id - Atualiza um material
 */
router.put("/:id", (req, res) => {
    const { id } = req.params;
    const { name, color, group_id } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Nome do material é obrigatório"
        });
    }

    db.run(
        `UPDATE materials SET name = ?, color = ?, group_id = ? WHERE id = ?`,
        [name.trim(), color || null, group_id || null, id],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({
                        success: false,
                        message: "Este material já existe"
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: "Erro ao atualizar material",
                    error: err.message
                });
            }
            res.json({
                success: true,
                message: "Material atualizado com sucesso",
                updated: this.changes
            });
        }
    );
});

// ── DELETE Endpoints ──────────────────────────────────────────────────────

/**
 * DELETE /materials/:id - Deleta um material
 */
router.delete("/:id", (req, res) => {
    const { id } = req.params;

    db.run(
        `DELETE FROM materials WHERE id = ?`,
        [id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao deletar material",
                    error: err.message
                });
            }
            res.json({
                success: true,
                message: "Material deletado com sucesso",
                deleted: this.changes
            });
        }
    );
});

module.exports = router;
