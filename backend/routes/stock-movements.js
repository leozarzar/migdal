/**
 * @module routes/stock-movements
 * @description Stock movement endpoints for simple tracking mode.
 * Records material entries and exits directly, without lot/batch management.
 */

const router = require("express").Router();
const db = require("../db");
const requirePermission = require('../middleware/require-permission');

// ── Helpers ───────────────────────────────────────────────────────────────

function dbRun(sql, params) {
    return new Promise((resolve, reject) =>
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })
    );
}

function dbAll(sql, params) {
    return new Promise((resolve, reject) =>
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []))
    );
}

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /stock-movements
 * Lista movimentações com filtros opcionais.
 * Query params: material_id, lot_id, type (entry|exit), startDate, endDate, location_id, page, limit
 *   Quando page/limit presentes: retorna { data, total }
 */
router.get("/", (req, res) => {
    const { material_id, lot_id, type, startDate, endDate, limit, location_id, page } = req.query;
    const user = req.user || {};
    const userLocs = (!user.isAdmin && user.locationIds && user.locationIds.length > 0) ? user.locationIds : null;

    const paginated = page != null || (limit != null && !material_id && !lot_id);
    const pageNum   = Math.max(1, parseInt(page, 10) || 1);
    const limitNum  = Math.max(1, parseInt(limit, 10) || 13);
    const offset    = (pageNum - 1) * limitNum;

    let where = "WHERE sm.status NOT IN ('DRAFT', 'ABANDONED')";
    const params = [];

    if (location_id) {
        if (userLocs && !userLocs.includes(Number(location_id))) {
            return paginated ? res.json({ data: [], total: 0 }) : res.json([]);
        }
        where += ` AND sm.location_id = ?`;
        params.push(location_id);
    } else if (userLocs) {
        where += ` AND sm.location_id IN (${userLocs.map(() => '?').join(',')})`;
        params.push(...userLocs);
    }
    if (material_id) { where += ` AND sm.material_id = ?`; params.push(material_id); }
    if (lot_id)       { where += ` AND sm.lot_id = ?`;       params.push(lot_id); }
    if (type === 'entry' || type === 'exit') { where += ` AND sm.type = ?`; params.push(type); }
    if (startDate)    { where += ` AND sm.date >= ?`;        params.push(startDate); }
    if (endDate)      { where += ` AND sm.date <= ?`;        params.push(endDate); }

    const selectSql = `
        SELECT sm.*, m.name AS material_name, l.name AS location_name
        FROM stock_movements sm
        JOIN materials m ON m.id = sm.material_id
        LEFT JOIN locations l ON l.id = sm.location_id
    `;

    if (paginated) {
        const countSql = `SELECT COUNT(*) as total FROM stock_movements sm JOIN materials m ON m.id = sm.material_id LEFT JOIN locations l ON l.id = sm.location_id ${where}`;
        db.get(countSql, params, (err, countRow) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar movimentações", error: err.message });
            db.all(`${selectSql} ${where} ORDER BY sm.date DESC, sm.id DESC LIMIT ? OFFSET ?`, [...params, limitNum, offset], (err2, rows) => {
                if (err2) return res.status(500).json({ success: false, message: "Erro ao carregar movimentações", error: err2.message });
                res.json({ data: rows || [], total: countRow?.total || 0 });
            });
        });
    } else {
        let sql = `${selectSql} ${where} ORDER BY sm.date DESC, sm.id DESC`;
        if (limit && !paginated) {
            const parsedLimit = parseInt(limit, 10);
            if (parsedLimit > 0) { sql += ` LIMIT ?`; params.push(parsedLimit); }
        }
        db.all(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar movimentações", error: err.message });
            res.json(rows || []);
        });
    }
});

/**
 * GET /stock-movements/balance
 * Retorna saldo atual por material (entradas - saídas).
 * Query params: material_id (opcional, filtra por material específico).
 */
router.get("/balance", (req, res) => {
    const { material_id, location_id } = req.query;
    let sql = `
        SELECT
            sm.material_id,
            m.name AS material_name,
            m.color AS material_color,
            g.id AS group_id,
            g.name AS group_name,
            COALESCE(SUM(CASE WHEN sm.type = 'entry' THEN sm.quantity ELSE -sm.quantity END), 0) AS balance,
            MAX(CASE WHEN sm.type = 'entry' THEN sm.date END) AS last_entry,
            MAX(CASE WHEN sm.type = 'exit' THEN sm.date END) AS last_exit
        FROM stock_movements sm
        JOIN materials m ON m.id = sm.material_id
        LEFT JOIN groups g ON g.id = m.group_id
        WHERE sm.status NOT IN ('DRAFT', 'ABANDONED')
    `;
    const params = [];

    if (material_id) {
        sql += ` AND sm.material_id = ?`;
        params.push(material_id);
    }
    if (location_id) {
        sql += ` AND sm.location_id = ?`;
        params.push(location_id);
    }

    sql += ` GROUP BY sm.material_id ORDER BY m.name`;

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Erro ao calcular saldo",
                error: err.message
            });
        }
        res.json(rows || []);
    });
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /stock-movements/entry
 * Registra uma movimentação de entrada (modo simples).
 * Body: { material_id, quantity, date, receipt_id?, operator?, reason?, notes? }
 */
router.post("/entry", requirePermission('inventory', 'stock-movements', 'create'), async (req, res) => {
    const { material_id, quantity, date, receipt_id, operator, reason, notes, location_id, packaging_id, packaging_count, status } = req.body;

    if (!material_id || !quantity || !date) {
        return res.status(400).json({
            success: false,
            message: "material_id, quantity e date são obrigatórios"
        });
    }

    if (quantity <= 0) {
        return res.status(400).json({
            success: false,
            message: "quantity deve ser maior que zero"
        });
    }

    try {
        const result = await dbRun(
            `INSERT INTO stock_movements (type, material_id, quantity, date, receipt_id, lot_id, location_id, operator, reason, notes, packaging_id, packaging_count, status)
             VALUES ('entry', ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
            [material_id, quantity, date, receipt_id || null, location_id || null, operator || null, reason || 'purchase', notes || null, packaging_id || null, packaging_count || null, status || 'CONFIRMED']
        );

        res.json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Erro ao registrar entrada",
            error: err.message
        });
    }
});

/**
 * POST /stock-movements/exit
 * Registra uma movimentação de saída (modo simples).
 * Body: { material_id, quantity, date, operator?, reason?, notes? }
 */
router.post("/exit", requirePermission('inventory', 'stock-movements', 'create'), async (req, res) => {
    const { material_id, quantity, date, operator, reason, notes, location_id } = req.body;

    if (!material_id || !quantity || !date) {
        return res.status(400).json({
            success: false,
            message: "material_id, quantity e date são obrigatórios"
        });
    }

    if (quantity <= 0) {
        return res.status(400).json({
            success: false,
            message: "quantity deve ser maior que zero"
        });
    }

    try {
        const result = await dbRun(
            `INSERT INTO stock_movements (type, material_id, quantity, date, lot_id, location_id, operator, reason, notes)
             VALUES ('exit', ?, ?, ?, NULL, ?, ?, ?, ?)`,
            [material_id, quantity, date, location_id || null, operator || null, reason || 'consumption', notes || null]
        );

        res.json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Erro ao registrar saída",
            error: err.message
        });
    }
});

/**
 * POST /stock-movements/transfer
 * Transferência entre localizações: cria uma saída da origem e uma entrada no destino.
 * Body: { material_id, quantity, date, from_location_id, to_location_id, operator?, notes? }
 */
router.post("/transfer", requirePermission('inventory', 'stock-movements', 'create'), async (req, res) => {
    const { material_id, quantity, date, from_location_id, to_location_id, operator, notes } = req.body;

    if (!material_id || !quantity || !date || !from_location_id || !to_location_id) {
        return res.status(400).json({
            success: false,
            message: "material_id, quantity, date, from_location_id e to_location_id são obrigatórios"
        });
    }

    if (quantity <= 0) {
        return res.status(400).json({
            success: false,
            message: "quantity deve ser maior que zero"
        });
    }

    if (String(from_location_id) === String(to_location_id)) {
        return res.status(400).json({
            success: false,
            message: "Origem e destino devem ser diferentes"
        });
    }

    try {
        // Verify material is linked to destination location
        const destLink = await dbAll(
            `SELECT 1 FROM material_locations WHERE material_id = ? AND location_id = ?`,
            [material_id, to_location_id]
        );
        if (destLink.length === 0) {
            return res.status(400).json({
                success: false,
                message: "O material não está vinculado à localização de destino. Importe-o antes de realizar a transferência."
            });
        }
        const exitResult = await dbRun(
            `INSERT INTO stock_movements (type, material_id, quantity, date, lot_id, location_id, operator, reason, notes)
             VALUES ('exit', ?, ?, ?, NULL, ?, ?, 'transfer', ?)`,
            [material_id, quantity, date, from_location_id, operator || null, notes || null]
        );

        const entryResult = await dbRun(
            `INSERT INTO stock_movements (type, material_id, quantity, date, lot_id, location_id, operator, reason, notes)
             VALUES ('entry', ?, ?, ?, NULL, ?, ?, 'transfer', ?)`,
            [material_id, quantity, date, to_location_id, operator || null, notes || null]
        );

        res.json({
            success: true,
            exit_id: exitResult.lastID,
            entry_id: entryResult.lastID
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Erro ao registrar transferência",
            error: err.message
        });
    }
});

// ── DELETE Endpoints ──────────────────────────────────────────────────────

/**
 * DELETE /stock-movements/:id
 * Remove uma movimentação específica (apenas DRAFT).
 */
router.delete("/:id", requirePermission('inventory', 'stock-movements', 'delete'), (req, res) => {
    const id = parseInt(req.params.id, 10);

    if (!id || isNaN(id)) {
        return res.status(400).json({ success: false, message: "ID inválido" });
    }

    db.get(`SELECT status FROM stock_movements WHERE id = ?`, [id], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao verificar movimentação", error: err.message });
        if (!row) return res.status(404).json({ success: false, message: "Movimentação não encontrada" });
        if (row.status !== 'DRAFT') return res.status(400).json({ success: false, message: "Apenas movimentos em rascunho podem ser deletados por este endpoint" });

        db.run(`DELETE FROM stock_movements WHERE id = ?`, [id], function (err2) {
            if (err2) return res.status(500).json({ success: false, message: "Erro ao deletar movimentação", error: err2.message });
            res.json({ success: true, deleted: this.changes });
        });
    });
});

module.exports = router;
