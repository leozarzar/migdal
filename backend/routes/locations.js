/**
 * @module routes/locations
 * @description Location (warehouse/position) CRUD routes.
 * Manages storage locations for multi-warehouse inventory tracking.
 */

const router = require("express").Router();
const db = require("../db");

// ── Table Setup ──────────────────────────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT
    )
`, (err) => {
    if (err) {
        console.error("Erro ao garantir tabela locations:", err.message);
    }
});

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /locations - Lista todas as localizações
 */
router.get("/", (req, res) => {
    db.all("SELECT * FROM locations ORDER BY name", [], (err, rows) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Erro ao carregar localizações",
                error: err.message
            });
        }
        res.json(rows || []);
    });
});

/**
 * GET /locations/:id - Retorna uma localização por ID
 */
router.get("/:id", (req, res) => {
    const { id } = req.params;

    db.get("SELECT * FROM locations WHERE id = ?", [id], (err, row) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Erro ao carregar localização",
                error: err.message
            });
        }
        if (!row) {
            return res.status(404).json({
                success: false,
                message: "Localização não encontrada"
            });
        }
        res.json(row);
    });
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /locations - Cria uma nova localização
 */
router.post("/", (req, res) => {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Nome da localização é obrigatório"
        });
    }

    db.run(
        `INSERT INTO locations (name, description) VALUES (?, ?)`,
        [name.trim(), (description || '').trim() || null],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({
                        success: false,
                        message: "Esta localização já existe"
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: "Erro ao criar localização",
                    error: err.message
                });
            }
            res.status(201).json({
                success: true,
                message: "Localização criada com sucesso",
                id: this.lastID
            });
        }
    );
});

// ── PUT Endpoints ─────────────────────────────────────────────────────────

/**
 * PUT /locations/:id - Atualiza uma localização
 */
router.put("/:id", (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Nome da localização é obrigatório"
        });
    }

    db.run(
        `UPDATE locations SET name = ?, description = ? WHERE id = ?`,
        [name.trim(), (description || '').trim() || null, id],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({
                        success: false,
                        message: "Já existe uma localização com este nome"
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: "Erro ao atualizar localização",
                    error: err.message
                });
            }
            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Localização não encontrada"
                });
            }
            res.json({
                success: true,
                message: "Localização atualizada com sucesso"
            });
        }
    );
});

// ── DELETE Endpoints ──────────────────────────────────────────────────────

/**
 * DELETE /locations/:id - Deleta uma localização
 */
router.delete("/:id", (req, res) => {
    const { id } = req.params;

    // Verifica se há movimentações vinculadas antes de deletar
    db.get(
        `SELECT COUNT(*) as cnt FROM stock_movements WHERE location_id = ?`,
        [id],
        (err, row) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao verificar dependências",
                    error: err.message
                });
            }
            if (row && row.cnt > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Não é possível deletar: ${row.cnt} movimentação(ões) vinculada(s).`
                });
            }

            db.run(`DELETE FROM locations WHERE id = ?`, [id], function (delErr) {
                if (delErr) {
                    return res.status(500).json({
                        success: false,
                        message: "Erro ao deletar localização",
                        error: delErr.message
                    });
                }
                if (this.changes === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Localização não encontrada"
                    });
                }
                res.json({
                    success: true,
                    message: "Localização deletada com sucesso"
                });
            });
        }
    );
});

// ── User–Location Assignment (admin only) ─────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS user_locations (
        user_id    INTEGER NOT NULL,
        location_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, location_id)
    )
`);

/**
 * GET /locations/users/:userId/locations - Lista localizações vinculadas a um usuário
 */
router.get("/users/:userId/locations", (req, res) => {
    const { userId } = req.params;
    db.all(
        `SELECT l.id, l.name FROM user_locations ul
         JOIN locations l ON l.id = ul.location_id
         WHERE ul.user_id = ?
         ORDER BY l.name`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao buscar localizações do usuário.", error: err.message });
            res.json(rows || []);
        }
    );
});

/**
 * PUT /locations/users/:userId/locations - Define localizações de um usuário (substitui todas)
 * Body: { location_ids: [1, 2, 3] }
 */
router.put("/users/:userId/locations", (req, res) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ success: false, message: "Apenas administradores podem alterar vínculos." });
    }

    const { userId } = req.params;
    const { location_ids } = req.body;

    if (!Array.isArray(location_ids)) {
        return res.status(400).json({ success: false, message: "location_ids deve ser um array." });
    }

    db.serialize(() => {
        db.run(`DELETE FROM user_locations WHERE user_id = ?`, [userId]);
        const stmt = db.prepare(`INSERT INTO user_locations (user_id, location_id) VALUES (?, ?)`);
        for (const locId of location_ids) {
            stmt.run(userId, locId);
        }
        stmt.finalize((err) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao salvar vínculos.", error: err.message });
            res.json({ success: true, message: "Localizações atualizadas." });
        });
    });
});

module.exports = router;
