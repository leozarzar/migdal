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

// ── Material–Location junction table ─────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS material_locations (
        material_id INTEGER NOT NULL,
        location_id INTEGER NOT NULL,
        PRIMARY KEY (material_id, location_id)
    )
`, (err) => {
    if (err) {
        console.error("Erro ao garantir tabela material_locations:", err.message);
        return;
    }
    // One-time migration: populate from historical stock_movements
    db.run(`
        INSERT OR IGNORE INTO material_locations (material_id, location_id)
        SELECT DISTINCT material_id, location_id
        FROM stock_movements
        WHERE material_id IS NOT NULL AND location_id IS NOT NULL
    `);
});

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /materials - Lista materiais visíveis ao usuário.
 * Non-admin: apenas materiais vinculados às localizações do usuário.
 * Admin: todos os materiais.
 * Query params:
 *   hasMovements=1  — retorna apenas materiais que possuem movimentações em stock_movements
 *   location_id=N   — (combinado com hasMovements) restringe às movimentações da localização
 *   page=N, limit=M — paginação server-side; resposta: { data, total }
 *   search=X        — filtro por nome (LIKE)
 *   sort_by=col     — coluna de ordenação (whitelist: name, unit_of_measure, tracking_mode)
 *   sort_dir=asc|desc
 */
router.get("/", (req, res) => {
    const { hasMovements, location_id, page, limit, search, sort_by, sort_dir } = req.query;
    const user = req.user || {};

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

    const paginated = page != null || limit != null;
    const pageNum   = Math.max(1, parseInt(page, 10) || 1);
    const limitNum  = Math.max(1, parseInt(limit, 10) || 13);
    const offset    = (pageNum - 1) * limitNum;

    const SORT_WHITELIST = { name: 'name', unit_of_measure: 'unit_of_measure', tracking_mode: 'tracking_mode' };
    const sortCol = SORT_WHITELIST[sort_by] || 'name';
    const sortDirSafe = sort_dir === 'desc' ? 'DESC' : 'ASC';

    // Montar cláusula WHERE e params conforme permissão do usuário
    let join = '';
    let where = 'WHERE 1=1';
    const params = [];

    if (user.isAdmin) {
        // sem restrição de localização
    } else {
        const userLocs = user.locationIds || [];
        if (userLocs.length === 0) {
            return paginated ? res.json({ data: [], total: 0 }) : res.json([]);
        }
        join  = `INNER JOIN material_locations ml ON ml.material_id = m.id`;
        where = `WHERE ml.location_id IN (${userLocs.map(() => '?').join(',')})`;
        params.push(...userLocs);
    }

    if (search) {
        where += ` AND m.name LIKE ?`;
        params.push(`%${search}%`);
    }

    const distinct = user.isAdmin ? '' : 'DISTINCT';
    const dataSql  = `SELECT ${distinct} m.* FROM materials m ${join} ${where} ORDER BY ${sortCol} ${sortDirSafe}${paginated ? ' LIMIT ? OFFSET ?' : ''}`;

    if (paginated) {
        const countSql = `SELECT COUNT(${distinct} m.id) as total FROM materials m ${join} ${where}`;
        db.get(countSql, params, (err, countRow) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar materiais", error: err.message });
            db.all(dataSql, [...params, limitNum, offset], (err2, rows) => {
                if (err2) return res.status(500).json({ success: false, message: "Erro ao carregar materiais", error: err2.message });
                res.json({ data: rows || [], total: countRow?.total || 0 });
            });
        });
    } else {
        db.all(dataSql, params, (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar materiais", error: err.message });
            res.json(rows || []);
        });
    }
});

/**
 * GET /materials/global - Catálogo global para importação.
 * Non-admin: materiais NÃO vinculados às localizações do usuário.
 * Admin: todos os materiais.
 */
router.get("/global", (req, res) => {
    const user = req.user || {};
    const userLocs = (!user.isAdmin && user.locationIds && user.locationIds.length > 0) ? user.locationIds : null;

    if (!userLocs) {
        db.all(
            `SELECT m.*, g.name AS group_name FROM materials m
             LEFT JOIN groups g ON g.id = m.group_id
             ORDER BY m.name`,
            [],
            (err, rows) => {
                if (err) return res.status(500).json({ success: false, message: "Erro ao carregar catálogo", error: err.message });
                res.json(rows || []);
            }
        );
        return;
    }

    const placeholders = userLocs.map(() => '?').join(',');
    db.all(
        `SELECT m.*, g.name AS group_name FROM materials m
         LEFT JOIN groups g ON g.id = m.group_id
         WHERE m.id NOT IN (
             SELECT ml.material_id FROM material_locations ml
             WHERE ml.location_id IN (${placeholders})
         )
         ORDER BY m.name`,
        userLocs,
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar catálogo", error: err.message });
            res.json(rows || []);
        }
    );
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
 * POST /materials - Cria um novo material.
 * Se o nome já existe, retorna 409 com os dados do material existente.
 */
router.post("/", (req, res) => {
    const { name, color, group_id, tracking_mode, allow_partial_exit, unit_of_measure, location_id } = req.body;
    const user = req.user || {};

    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: "Nome do material é obrigatório" });
    }

    if (!user.isAdmin && !location_id) {
        return res.status(400).json({ success: false, message: "Selecione uma localização antes de cadastrar" });
    }

    if (!user.isAdmin && location_id) {
        const userLocs = user.locationIds || [];
        if (!userLocs.includes(Number(location_id))) {
            return res.status(403).json({ success: false, message: "Sem permissão para esta localização" });
        }
    }

    const trimmedName = name.trim();
    const mode = (tracking_mode === 'lots' || tracking_mode === 'simple') ? tracking_mode : 'simple';
    const uom = unit_of_measure || 'kg';

    // Check for existing material with same name
    db.get("SELECT * FROM materials WHERE name = ?", [trimmedName], (err, existing) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao verificar material", error: err.message });

        if (existing) {
            return res.status(409).json({
                success: false,
                conflict: true,
                message: "Um material com esse nome já existe no catálogo global.",
                existing: existing
            });
        }

        db.run(
            `INSERT INTO materials (name, color, group_id, tracking_mode, allow_partial_exit, unit_of_measure) VALUES (?, ?, ?, ?, ?, ?)`,
            [trimmedName, color || null, group_id || null, mode, allow_partial_exit ? 1 : 0, uom],
            function (insertErr) {
                if (insertErr) {
                    return res.status(500).json({ success: false, message: "Erro ao criar material", error: insertErr.message });
                }
                const newId = this.lastID;
                if (location_id) {
                    db.run(
                        `INSERT OR IGNORE INTO material_locations (material_id, location_id) VALUES (?, ?)`,
                        [newId, location_id],
                        () => res.status(201).json({ success: true, message: "Material criado com sucesso", id: newId })
                    );
                } else {
                    res.status(201).json({ success: true, message: "Material criado com sucesso", id: newId });
                }
            }
        );
    });
});

/**
 * POST /materials/:id/link - Vincula um material existente a uma localização.
 */
router.post("/:id/link", (req, res) => {
    const { id } = req.params;
    const { location_id } = req.body;
    const user = req.user || {};

    if (!location_id) {
        return res.status(400).json({ success: false, message: "location_id é obrigatório" });
    }

    if (!user.isAdmin) {
        const userLocs = user.locationIds || [];
        if (!userLocs.includes(Number(location_id))) {
            return res.status(403).json({ success: false, message: "Sem permissão para esta localização" });
        }
    }

    db.get("SELECT id FROM materials WHERE id = ?", [id], (err, material) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao verificar material", error: err.message });
        if (!material) return res.status(404).json({ success: false, message: "Material não encontrado" });

        db.run(
            `INSERT OR IGNORE INTO material_locations (material_id, location_id) VALUES (?, ?)`,
            [id, location_id],
            function (linkErr) {
                if (linkErr) return res.status(500).json({ success: false, message: "Erro ao vincular material", error: linkErr.message });
                res.json({ success: true, message: "Material vinculado à localização com sucesso" });
            }
        );
    });
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
 * DELETE /materials/:id/link - Desvincula um material de uma localização (sem excluir do catálogo).
 */
router.delete("/:id/link", (req, res) => {
    const { id } = req.params;
    const { location_id } = req.body;
    const user = req.user || {};

    if (!location_id) {
        return res.status(400).json({ success: false, message: "location_id é obrigatório" });
    }

    if (!user.isAdmin) {
        const userLocs = user.locationIds || [];
        if (!userLocs.includes(Number(location_id))) {
            return res.status(403).json({ success: false, message: "Sem permissão para esta localização" });
        }
    }

    db.run(
        `DELETE FROM material_locations WHERE material_id = ? AND location_id = ?`,
        [id, location_id],
        function (err) {
            if (err) return res.status(500).json({ success: false, message: "Erro ao desvincular material", error: err.message });
            res.json({ success: true, message: "Material desvinculado da localização" });
        }
    );
});

/**
 * DELETE /materials/:id - Deleta um material e suas embalagens
 */
router.delete("/:id", (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM material_locations WHERE material_id = ?`, [id], () => {
        db.run(`DELETE FROM material_packagings WHERE material_id = ?`, [id], () => {
            db.run(`DELETE FROM materials WHERE id = ?`, [id], function (err) {
                if (err) {
                    return res.status(500).json({ success: false, message: "Erro ao deletar material", error: err.message });
                }
                res.json({ success: true, message: "Material deletado com sucesso", deleted: this.changes });
            });
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
