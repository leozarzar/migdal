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

// ── Supplier–Location junction table ─────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS supplier_locations (
        supplier_id INTEGER NOT NULL,
        location_id INTEGER NOT NULL,
        PRIMARY KEY (supplier_id, location_id)
    )
`, (err) => {
    if (err) {
        console.error("Erro ao garantir tabela supplier_locations:", err.message);
        return;
    }
    // One-time migration: populate from historical receipts
    db.run(`
        INSERT OR IGNORE INTO supplier_locations (supplier_id, location_id)
        SELECT DISTINCT s.id, r.location_id
        FROM suppliers s
        JOIN receipts r ON r.supplier = s.name
        WHERE r.location_id IS NOT NULL
    `);
});

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /suppliers - Lista fornecedores visíveis ao usuário.
 * Non-admin: apenas fornecedores vinculados às localizações do usuário.
 * Admin: todos os fornecedores.
 * Query params: page, limit, search, sort_by, sort_dir
 *   Quando page/limit presentes: retorna { data, total }
 */
router.get("/", (req, res) => {
    const { page, limit, search, sort_by, sort_dir } = req.query;
    const user = req.user || {};

    const paginated = page != null || limit != null;
    const pageNum   = Math.max(1, parseInt(page, 10) || 1);
    const limitNum  = Math.max(1, parseInt(limit, 10) || 13);
    const offset    = (pageNum - 1) * limitNum;

    const SORT_WHITELIST = { name: 'name' };
    const sortCol = SORT_WHITELIST[sort_by] || 'name';
    const sortDirSafe = sort_dir === 'desc' ? 'DESC' : 'ASC';

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
        join  = `INNER JOIN supplier_locations sl ON sl.supplier_id = s.id`;
        where = `WHERE sl.location_id IN (${userLocs.map(() => '?').join(',')})`;
        params.push(...userLocs);
    }

    if (search) {
        where += ` AND s.name LIKE ?`;
        params.push(`%${search}%`);
    }

    const distinct = user.isAdmin ? '' : 'DISTINCT';
    const dataSql  = `SELECT ${distinct} s.* FROM suppliers s ${join} ${where} ORDER BY ${sortCol} ${sortDirSafe}${paginated ? ' LIMIT ? OFFSET ?' : ''}`;

    if (paginated) {
        const countSql = `SELECT COUNT(${distinct} s.id) as total FROM suppliers s ${join} ${where}`;
        db.get(countSql, params, (err, countRow) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar fornecedores", error: err.message });
            db.all(dataSql, [...params, limitNum, offset], (err2, rows) => {
                if (err2) return res.status(500).json({ success: false, message: "Erro ao carregar fornecedores", error: err2.message });
                res.json({ data: rows || [], total: countRow?.total || 0 });
            });
        });
    } else {
        db.all(dataSql, params, (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar fornecedores", error: err.message });
            res.json(rows || []);
        });
    }
});

/**
 * GET /suppliers/global - Catálogo global para importação.
 * Non-admin: fornecedores NÃO vinculados às localizações do usuário.
 * Admin: todos os fornecedores.
 */
router.get("/global", (req, res) => {
    const user = req.user || {};
    const userLocs = (!user.isAdmin && user.locationIds && user.locationIds.length > 0) ? user.locationIds : null;

    if (!userLocs) {
        db.all("SELECT * FROM suppliers ORDER BY name", [], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar catálogo", error: err.message });
            res.json(rows || []);
        });
        return;
    }

    const placeholders = userLocs.map(() => '?').join(',');
    db.all(
        `SELECT s.* FROM suppliers s
         WHERE s.id NOT IN (
             SELECT sl.supplier_id FROM supplier_locations sl
             WHERE sl.location_id IN (${placeholders})
         )
         ORDER BY s.name`,
        userLocs,
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar catálogo", error: err.message });
            res.json(rows || []);
        }
    );
});

/**
 * GET /suppliers/:id/prices - Tabela de preços do fornecedor (para pré-preenchimento em faturas).
 * Retorna [] se não houver tabela ou fornecedor.
 */
router.get("/:id/prices", (req, res) => {
    db.all(
        `SELECT * FROM supplier_prices WHERE supplier_id = ?`,
        [req.params.id],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar preços", error: err.message });
            res.json(rows || []);
        }
    );
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /suppliers - Cria um novo fornecedor.
 * Se o nome já existe, retorna 409 com os dados do fornecedor existente.
 */
router.post("/", (req, res) => {
    const { name, location_id } = req.body;
    const user = req.user || {};

    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: "Nome do fornecedor é obrigatório" });
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

    db.get("SELECT * FROM suppliers WHERE name = ?", [trimmedName], (err, existing) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao verificar fornecedor", error: err.message });

        if (existing) {
            return res.status(409).json({
                success: false,
                conflict: true,
                message: "Um fornecedor com esse nome já existe no catálogo global.",
                existing: existing
            });
        }

        db.run(`INSERT INTO suppliers (name) VALUES (?)`, [trimmedName], function (insertErr) {
            if (insertErr) {
                return res.status(500).json({ success: false, message: "Erro ao criar fornecedor", error: insertErr.message });
            }
            const newId = this.lastID;
            if (location_id) {
                db.run(
                    `INSERT OR IGNORE INTO supplier_locations (supplier_id, location_id) VALUES (?, ?)`,
                    [newId, location_id],
                    () => res.status(201).json({ success: true, message: "Fornecedor criado com sucesso", id: newId })
                );
            } else {
                res.status(201).json({ success: true, message: "Fornecedor criado com sucesso", id: newId });
            }
        });
    });
});

/**
 * POST /suppliers/:id/link - Vincula um fornecedor existente a uma localização.
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

    db.get("SELECT id FROM suppliers WHERE id = ?", [id], (err, supplier) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao verificar fornecedor", error: err.message });
        if (!supplier) return res.status(404).json({ success: false, message: "Fornecedor não encontrado" });

        db.run(
            `INSERT OR IGNORE INTO supplier_locations (supplier_id, location_id) VALUES (?, ?)`,
            [id, location_id],
            function (linkErr) {
                if (linkErr) return res.status(500).json({ success: false, message: "Erro ao vincular fornecedor", error: linkErr.message });
                res.json({ success: true, message: "Fornecedor vinculado à localização com sucesso" });
            }
        );
    });
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
 * DELETE /suppliers/:id/link - Desvincula um fornecedor de uma localização (sem excluir do catálogo).
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
        `DELETE FROM supplier_locations WHERE supplier_id = ? AND location_id = ?`,
        [id, location_id],
        function (err) {
            if (err) return res.status(500).json({ success: false, message: "Erro ao desvincular fornecedor", error: err.message });
            res.json({ success: true, message: "Fornecedor desvinculado da localização" });
        }
    );
});

/**
 * DELETE /suppliers/:id - Deleta um fornecedor
 */
router.delete("/:id", (req, res) => {
    const { id } = req.params;

    db.run(`DELETE FROM supplier_locations WHERE supplier_id = ?`, [id], () => {
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
});

module.exports = router;
