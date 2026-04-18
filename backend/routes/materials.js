/**
 * @module routes/materials
 * @description Material catalog CRUD routes.
 * Manages the materials master data table with optional color, group,
 * unit of measure, tracking mode and packagings.
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

db.run(`
    CREATE TABLE IF NOT EXISTS material_packagings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        quantity REAL,
        FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela material_packagings:", err.message);
});

// ── Migrations ───────────────────────────────────────────────────────────

db.run(`ALTER TABLE materials ADD COLUMN color TEXT`, () => {});
db.run(`ALTER TABLE materials ADD COLUMN group_id INTEGER`, () => {});
db.run(`ALTER TABLE materials ADD COLUMN tracking_mode TEXT DEFAULT 'simple'`, (err) => {
    if (!err) {
        db.run(`UPDATE materials SET tracking_mode = COALESCE(
            (SELECT value FROM app_settings WHERE key = 'inventory.tracking_mode'), 'lots'
        ) WHERE tracking_mode = 'simple'`);
    }
});
db.run(`ALTER TABLE materials ADD COLUMN allow_partial_exit INTEGER DEFAULT 0`, () => {});
db.run(`ALTER TABLE materials ADD COLUMN packaging_unit TEXT`, () => {});
db.run(`ALTER TABLE materials ADD COLUMN packaging_weight REAL`, () => {});
db.run(`ALTER TABLE materials ADD COLUMN unit_of_measure TEXT DEFAULT 'kg'`, () => {});

// Migrate legacy single-packaging to packagings table
db.all(`SELECT id, packaging_unit, packaging_weight FROM materials WHERE packaging_unit IS NOT NULL AND packaging_unit != ''`, [], (err, rows) => {
    if (err || !rows || !rows.length) return;
    for (const row of rows) {
        db.get(`SELECT id FROM material_packagings WHERE material_id = ? AND name = ?`, [row.id, row.packaging_unit], (e2, existing) => {
            if (!e2 && !existing) {
                db.run(`INSERT INTO material_packagings (material_id, name, quantity) VALUES (?, ?, ?)`,
                    [row.id, row.packaging_unit, row.packaging_weight || null]);
            }
        });
    }
});

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /materials - Lista todos os materiais.
 * Query params:
 *   hasMovements=1  — retorna apenas materiais que possuem movimentações em stock_movements
 *   location_id=N   — (combinado com hasMovements) restringe às movimentações da localização
 */
router.get("/", (req, res) => {
    const { hasMovements, location_id } = req.query;

    if (hasMovements === '1') {
        let sql = `
            SELECT DISTINCT m.*
            FROM materials m
            INNER JOIN stock_movements sm ON sm.material_id = m.id
        `;
        const params = [];
        if (location_id) {
            sql += ` WHERE sm.location_id = ?`;
            params.push(location_id);
        }
        sql += ` ORDER BY m.name`;
        db.all(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar materiais", error: err.message });
            res.json(rows || []);
        });
        return;
    }

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

/**
 * GET /materials/:id - Retorna material com embalagens
 */
router.get("/:id", (req, res) => {
    const { id } = req.params;
    db.get("SELECT * FROM materials WHERE id = ?", [id], (err, material) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Erro ao carregar material", error: err.message });
        }
        if (!material) {
            return res.status(404).json({ success: false, message: "Material não encontrado" });
        }
        db.all("SELECT * FROM material_packagings WHERE material_id = ? ORDER BY name", [id], (err2, packagings) => {
            if (err2) {
                material.packagings = [];
            } else {
                material.packagings = packagings || [];
            }
            res.json(material);
        });
    });
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /materials - Cria um novo material
 */
router.post("/", (req, res) => {
    const { name, color, group_id, tracking_mode, allow_partial_exit, unit_of_measure } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Nome do material é obrigatório"
        });
    }

    const mode = (tracking_mode === 'lots' || tracking_mode === 'simple') ? tracking_mode : 'simple';
    const uom = unit_of_measure || 'kg';

    db.run(
        `INSERT INTO materials (name, color, group_id, tracking_mode, allow_partial_exit, unit_of_measure) VALUES (?, ?, ?, ?, ?, ?)`,
        [name.trim(), color || null, group_id || null, mode, allow_partial_exit ? 1 : 0, uom],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ success: false, message: "Este material já existe" });
                }
                return res.status(500).json({ success: false, message: "Erro ao criar material", error: err.message });
            }
            res.status(201).json({ success: true, message: "Material criado com sucesso", id: this.lastID });
        }
    );
});

// ── PUT Endpoints ─────────────────────────────────────────────────────────

/**
 * PUT /materials/:id - Atualiza um material
 */
router.put("/:id", (req, res) => {
    const { id } = req.params;
    const { name, color, group_id, tracking_mode, allow_partial_exit, unit_of_measure } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Nome do material é obrigatório"
        });
    }

    const mode = (tracking_mode === 'lots' || tracking_mode === 'simple') ? tracking_mode : 'simple';
    const uom = unit_of_measure || 'kg';

    db.run(
        `UPDATE materials SET name = ?, color = ?, group_id = ?, tracking_mode = ?, allow_partial_exit = ?, unit_of_measure = ? WHERE id = ?`,
        [name.trim(), color || null, group_id || null, mode, allow_partial_exit ? 1 : 0, uom, id],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ success: false, message: "Este material já existe" });
                }
                return res.status(500).json({ success: false, message: "Erro ao atualizar material", error: err.message });
            }
            res.json({ success: true, message: "Material atualizado com sucesso", updated: this.changes });
        }
    );
});

// ── DELETE Endpoints ──────────────────────────────────────────────────────

/**
 * DELETE /materials/:id - Deleta um material e suas embalagens
 */
router.delete("/:id", (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM material_packagings WHERE material_id = ?`, [id], () => {
        db.run(`DELETE FROM materials WHERE id = ?`, [id], function (err) {
            if (err) {
                return res.status(500).json({ success: false, message: "Erro ao deletar material", error: err.message });
            }
            res.json({ success: true, message: "Material deletado com sucesso", deleted: this.changes });
        });
    });
});

// ── Packagings Endpoints ─────────────────────────────────────────────────

/**
 * POST /materials/:id/packagings - Adiciona embalagem ao material
 */
router.post("/:id/packagings", (req, res) => {
    const { id } = req.params;
    const { name, quantity } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: "Nome da embalagem é obrigatório" });
    }

    db.run(
        `INSERT INTO material_packagings (material_id, name, quantity) VALUES (?, ?, ?)`,
        [id, name.trim(), quantity || null],
        function (err) {
            if (err) {
                return res.status(500).json({ success: false, message: "Erro ao adicionar embalagem", error: err.message });
            }
            res.status(201).json({ success: true, id: this.lastID });
        }
    );
});

/**
 * DELETE /materials/:id/packagings/:pkgId - Remove embalagem
 */
router.delete("/:id/packagings/:pkgId", (req, res) => {
    const { id, pkgId } = req.params;
    db.run(
        `DELETE FROM material_packagings WHERE id = ? AND material_id = ?`,
        [pkgId, id],
        function (err) {
            if (err) {
                return res.status(500).json({ success: false, message: "Erro ao remover embalagem", error: err.message });
            }
            res.json({ success: true, deleted: this.changes });
        }
    );
});

module.exports = router;
