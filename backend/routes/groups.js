/**
 * @module routes/groups
 * @description Material group CRUD routes.
 * Manages groups that organize materials into logical categories.
 */

const router = require("express").Router();
const db = require("../db");

// ── Table Setup ──────────────────────────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )
`, (err) => {
    if (err) {
        console.error("Erro ao garantir tabela groups:", err.message);
    }
});

// ── Migrations ───────────────────────────────────────────────────────────

// Migration: add group_id to materials table if not exists
db.run(`ALTER TABLE materials ADD COLUMN group_id INTEGER`, () => {});

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /groups - Lista todos os grupos
 */
router.get("/", (req, res) => {
    db.all(
        `SELECT g.id, g.name, COUNT(m.id) AS material_count
         FROM groups g
         LEFT JOIN materials m ON m.group_id = g.id
         GROUP BY g.id
         ORDER BY g.name`,
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao carregar grupos",
                    error: err.message
                });
            }
            res.json(rows || []);
        }
    );
});

/**
 * GET /groups/:id - Busca grupo com seus materiais
 */
router.get("/:id", (req, res) => {
    const { id } = req.params;
    db.get("SELECT * FROM groups WHERE id = ?", [id], (err, group) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao buscar grupo" });
        if (!group) return res.status(404).json({ success: false, message: "Grupo não encontrado" });

        db.all(
            "SELECT id, name, color FROM materials WHERE group_id = ? ORDER BY name",
            [id],
            (err2, materials) => {
                if (err2) return res.status(500).json({ success: false, message: "Erro ao buscar materiais do grupo" });
                res.json({ ...group, materials: materials || [] });
            }
        );
    });
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /groups - Cria um novo grupo
 */
router.post("/", (req, res) => {
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: "Nome do grupo é obrigatório" });
    }

    db.run(`INSERT INTO groups (name) VALUES (?)`, [name.trim()], function (err) {
        if (err) {
            if (err.message.includes("UNIQUE")) {
                return res.status(400).json({ success: false, message: "Este grupo já existe" });
            }
            return res.status(500).json({ success: false, message: "Erro ao criar grupo", error: err.message });
        }
        res.status(201).json({ success: true, message: "Grupo criado com sucesso", id: this.lastID });
    });
});

// ── PUT Endpoints ─────────────────────────────────────────────────────────

/**
 * PUT /groups/:id - Atualiza um grupo
 */
router.put("/:id", (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: "Nome do grupo é obrigatório" });
    }

    db.run(`UPDATE groups SET name = ? WHERE id = ?`, [name.trim(), id], function (err) {
        if (err) {
            if (err.message.includes("UNIQUE")) {
                return res.status(400).json({ success: false, message: "Este grupo já existe" });
            }
            return res.status(500).json({ success: false, message: "Erro ao atualizar grupo" });
        }
        if (this.changes === 0) return res.status(404).json({ success: false, message: "Grupo não encontrado" });
        res.json({ success: true, message: "Grupo atualizado com sucesso" });
    });
});

// ── DELETE Endpoints ──────────────────────────────────────────────────────

/**
 * DELETE /groups/:id - Deleta um grupo
 */
router.delete("/:id", (req, res) => {
    const { id } = req.params;

    db.run(`UPDATE materials SET group_id = NULL WHERE group_id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao remover associações" });

        db.run(`DELETE FROM groups WHERE id = ?`, [id], function (delErr) {
            if (delErr) return res.status(500).json({ success: false, message: "Erro ao deletar grupo" });
            if (this.changes === 0) return res.status(404).json({ success: false, message: "Grupo não encontrado" });
            res.json({ success: true, message: "Grupo deletado com sucesso" });
        });
    });
});

/**
 * PUT /groups/:id/materials - Define os materiais associados ao grupo
 * Clears all current associations and re-assigns the provided material_ids.
 */
router.put("/:id/materials", (req, res) => {
    const { id } = req.params;
    const { material_ids } = req.body;

    db.get("SELECT id FROM groups WHERE id = ?", [id], (err, group) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao verificar grupo" });
        if (!group) return res.status(404).json({ success: false, message: "Grupo não encontrado" });

        db.run(`UPDATE materials SET group_id = NULL WHERE group_id = ?`, [id], (err2) => {
            if (err2) return res.status(500).json({ success: false, message: "Erro ao atualizar materiais" });

            if (!material_ids || material_ids.length === 0) {
                return res.json({ success: true, message: "Materiais atualizados" });
            }

            const placeholders = material_ids.map(() => "?").join(",");
            db.run(
                `UPDATE materials SET group_id = ? WHERE id IN (${placeholders})`,
                [id, ...material_ids],
                (err3) => {
                    if (err3) return res.status(500).json({ success: false, message: "Erro ao associar materiais" });
                    res.json({ success: true, message: "Materiais atualizados com sucesso" });
                }
            );
        });
    });
});

module.exports = router;
