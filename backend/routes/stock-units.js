/**
 * @module routes/stock-units
 * @description Stock unit CRUD routes.
 * Manages individual inventory units with status tracking (IN_STOCK / OUT_STOCK).
 */

const router = require("express").Router();
const db = require("../db");
const requirePermission = require('../middleware/require-permission');

function normalizeVolumeId(volumeId) {
    if (volumeId === null || volumeId === undefined || String(volumeId).trim() === "") {
        return null;
    }

    const parsedVolumeId = Number.parseInt(String(volumeId).trim(), 10);
    if (!Number.isInteger(parsedVolumeId) || parsedVolumeId < 0) {
        return null;
    }

    return parsedVolumeId;
}

// ── Movement sync helpers ─────────────────────────────────────────────────

function _mapExitReason(deductionType) {
    if (deductionType === 'ajuste') return 'adjustment';
    return 'consumption';
}

function _insertEntryMovement(lotId, materialId, weight, dateIn, receiptId, operator, locationId) {
    db.run(
        `INSERT INTO stock_movements (type, material_id, quantity, date, receipt_id, lot_id, operator, reason, location_id)
         VALUES ('entry', ?, ?, ?, ?, ?, ?, 'purchase', ?)`,
        [materialId, weight, dateIn, receiptId || null, lotId, operator || null, locationId || null]
    );
}

function _insertExitMovement(lotId, materialId, weight, dateOut, receiptId, operator, deductionType, locationId) {
    db.run(
        `INSERT INTO stock_movements (type, material_id, quantity, date, receipt_id, lot_id, operator, reason, location_id)
         VALUES ('exit', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [materialId, weight, dateOut, receiptId || null, lotId, operator || null, _mapExitReason(deductionType), locationId || null]
    );
}

function _deleteExitMovement(lotId) {
    db.run(`DELETE FROM stock_movements WHERE lot_id = ? AND type = 'exit'`, [lotId]);
}

function _deleteAllMovements(lotId) {
    db.run(`DELETE FROM stock_movements WHERE lot_id = ?`, [lotId]);
}

/** Promisified helpers */
function _dbRun(sql, params) {
    return new Promise((resolve, reject) =>
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })
    );
}
function _dbGet(sql, params) {
    return new Promise((resolve, reject) =>
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
    );
}
function _dbAll(sql, params) {
    return new Promise((resolve, reject) =>
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []))
    );
}

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /stock-units - Lista todas as unidades de estoque.
 * Query params: page, limit, status (IN_STOCK|OUT_STOCK), material, supplier, search, location_id, ids
 *   Quando page/limit presentes: retorna { data, total }
 */
router.get("/", (req, res) => {
    const { page, limit, status, material, supplier, search, location_id, ids } = req.query;

    const paginated = page != null || limit != null;
    const pageNum   = Math.max(1, parseInt(page, 10) || 1);
    const limitNum  = Math.max(1, parseInt(limit, 10) || 13);
    const offset    = (pageNum - 1) * limitNum;

    let where = "WHERE status NOT IN ('DRAFT', 'ABANDONED')";
    const params = [];

    if (location_id) {
        where += ` AND location_id = ?`;
        params.push(location_id);
    }
    if (status === 'IN_STOCK') {
        where += ` AND computed_status != 'OUT_STOCK'`;
    } else if (status === 'OUT_STOCK') {
        where += ` AND computed_status = 'OUT_STOCK'`;
    }
    if (material) {
        where += ` AND material = ?`;
        params.push(material);
    }
    if (supplier) {
        where += ` AND supplier = ?`;
        params.push(supplier);
    }
    if (search) {
        const s = `%${search}%`;
        where += ` AND (material LIKE ? OR supplier LIKE ? OR operator LIKE ? OR old_id LIKE ?`
               + ` OR (COALESCE(SUBSTR(nature,1,1),'') || CAST(receipt_id AS TEXT) || '-' || SUBSTR('000' || CAST(volume_id AS TEXT),-3,3)) LIKE ?)`;
        params.push(s, s, s, s, s);
    }
    if (ids) {
        const idList = ids.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        if (idList.length === 0) {
            return paginated ? res.json({ data: [], total: 0 }) : res.json([]);
        }
        where += ` AND id IN (${idList.map(() => '?').join(',')})`;
        params.push(...idList);
    }

    const cteSql = `
        WITH computed AS (
            SELECT
                b.*,
                COALESCE(r.nature, "")                                           AS nature,
                m.allow_partial_exit,
                ROUND(
                    b.weight - COALESCE((
                        SELECT SUM(x.quantity)
                        FROM stock_movements x
                        WHERE x.lot_id = b.id AND x.type = 'exit'
                    ), 0),
                3)                                                               AS remaining_weight,
                CASE WHEN ROUND(b.weight - COALESCE((
                    SELECT SUM(x.quantity)
                    FROM stock_movements x
                    WHERE x.lot_id = b.id AND x.type = 'exit'
                ), 0), 3) <= 0 THEN (
                    SELECT MAX(x.date)
                    FROM stock_movements x
                    WHERE x.lot_id = b.id AND x.type = 'exit'
                ) ELSE NULL END                                                  AS date_out,
                CASE (
                    SELECT x.reason
                    FROM stock_movements x
                    WHERE x.lot_id = b.id AND x.type = 'exit'
                    ORDER BY x.date DESC, x.id DESC
                    LIMIT 1
                )
                    WHEN 'adjustment' THEN 'ajuste'
                    ELSE 'uso'
                END                                                              AS deduction_type,
                CASE
                    WHEN ROUND(b.weight - COALESCE((
                        SELECT SUM(x.quantity)
                        FROM stock_movements x
                        WHERE x.lot_id = b.id AND x.type = 'exit'
                    ), 0), 3) <= 0              THEN 'OUT_STOCK'
                    WHEN COALESCE((
                        SELECT SUM(x.quantity)
                        FROM stock_movements x
                        WHERE x.lot_id = b.id AND x.type = 'exit'
                    ), 0) > 0                   THEN 'PARTIAL'
                    ELSE                             'IN_STOCK'
                END                                                              AS computed_status
            FROM stock_units b
            LEFT JOIN receipts r ON b.receipt_id = r.id
            LEFT JOIN materials m ON b.material_id = m.id
        )
    `;

    const orderSql = `ORDER BY date_in DESC, receipt_id DESC, CAST(volume_id AS INTEGER) ASC`;

    if (paginated) {
        db.get(`${cteSql} SELECT COUNT(*) as total FROM computed ${where}`, params, (err, countRow) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar estoque", error: err.message });
            db.all(`${cteSql} SELECT * FROM computed ${where} ${orderSql} LIMIT ? OFFSET ?`, [...params, limitNum, offset], (err2, rows) => {
                if (err2) return res.status(500).json({ success: false, message: "Erro ao carregar estoque", error: err2.message });
                const data = (rows || []).map(r => ({ ...r, status: r.computed_status }));
                res.json({ data, total: countRow?.total || 0 });
            });
        });
    } else {
        db.all(`${cteSql} SELECT * FROM computed ${where} ${orderSql}`, params, (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar estoque", error: err.message });
            res.json((rows || []).map(r => ({ ...r, status: r.computed_status })));
        });
    }
});

/**
 * GET /stock-units/filter-options - Retorna materiais e fornecedores distintos (para dropdowns de filtro).
 */
router.get("/filter-options", (req, res) => {
    const { location_id } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (location_id) {
        where += ' AND location_id = ?';
        params.push(location_id);
    }
    db.all(`SELECT DISTINCT material FROM stock_units ${where} AND material IS NOT NULL AND material != '' ORDER BY material`, params, (err, matRows) => {
        if (err) return res.status(500).json({ success: false, message: "Erro", error: err.message });
        db.all(`SELECT DISTINCT supplier FROM stock_units ${where} AND supplier IS NOT NULL AND supplier != '' ORDER BY supplier`, params, (err2, supRows) => {
            if (err2) return res.status(500).json({ success: false, message: "Erro", error: err2.message });
            res.json({
                materials: (matRows || []).map(r => r.material).filter(Boolean),
                suppliers: (supRows || []).map(r => r.supplier).filter(Boolean),
            });
        });
    });
});

/**
 * GET /stock-units/position - Posição de estoque agregada por material.
 * Query params: location_id, page, limit, search, group_id
 *   Quando page/limit presentes: retorna { data, total }
 */
router.get("/position", (req, res) => {
    const { location_id, page, limit, search, group_id } = req.query;
    const user = req.user || {};
    const userLocs = (!user.isAdmin && user.locationIds && user.locationIds.length > 0) ? user.locationIds : null;

    const paginated = page != null || limit != null;
    const pageNum   = Math.max(1, parseInt(page, 10) || 1);
    const limitNum  = Math.max(1, parseInt(limit, 10) || 13);
    const offset    = (pageNum - 1) * limitNum;

    const locParams = [];
    let locFilter = '';
    if (location_id) {
        if (userLocs && !userLocs.includes(Number(location_id))) {
            return paginated ? res.json({ data: [], total: 0 }) : res.json([]);
        }
        locFilter = ' AND e.location_id = ?';
        locParams.push(location_id);
    } else if (userLocs) {
        const placeholders = userLocs.map(() => '?').join(',');
        locFilter = ` AND e.location_id IN (${placeholders})`;
        locParams.push(...userLocs);
    }

    let linkedHaving = '';
    const linkedHavingParams = [];
    if (location_id) {
        linkedHaving = ' OR EXISTS (SELECT 1 FROM material_locations ml WHERE ml.material_id = m.id AND ml.location_id = ?)';
        linkedHavingParams.push(location_id);
    } else if (userLocs) {
        const ph = userLocs.map(() => '?').join(',');
        linkedHaving = ` OR EXISTS (SELECT 1 FROM material_locations ml WHERE ml.material_id = m.id AND ml.location_id IN (${ph}))`;
        linkedHavingParams.push(...userLocs);
    }
    const havingClause = linkedHaving ? `HAVING balance > 0${linkedHaving}` : '';

    let simpleLocFilter = '';
    const simpleParams = [...locParams];
    if (location_id) {
        simpleLocFilter = ' AND sm.location_id = ?';
    } else if (userLocs) {
        const placeholders = userLocs.map(() => '?').join(',');
        simpleLocFilter = ` AND sm.location_id IN (${placeholders})`;
    }
    const simpleHavingClause = havingClause.replace('balance > 0', "COALESCE(SUM(CASE WHEN sm.type = 'entry' THEN sm.quantity ELSE -sm.quantity END), 0) > 0");

    // Outer WHERE (search / group_id)
    let outerWhere = 'WHERE 1=1';
    const filterParams = [];
    if (group_id) {
        outerWhere += ` AND group_id = ?`;
        filterParams.push(group_id);
    }
    if (search) {
        outerWhere += ` AND (material LIKE ? OR group_name LIKE ?)`;
        const s = `%${search}%`;
        filterParams.push(s, s);
    }

    const cteSql = `
        WITH
        lot_balance AS (
            SELECT e.lot_id, e.material_id, e.quantity AS entry_qty,
                   COALESCE(SUM(x.quantity), 0) AS exit_qty,
                   e.date AS entry_date
            FROM stock_movements e
            LEFT JOIN stock_movements x ON x.lot_id = e.lot_id AND x.type = 'exit'
            WHERE e.type = 'entry' AND e.lot_id IS NOT NULL${locFilter}
            GROUP BY e.lot_id
        ),
        lot_position AS (
            SELECT
                m.name AS material, m.id AS material_id, m.color AS material_color,
                m.tracking_mode, m.allow_partial_exit, m.unit_of_measure AS unit,
                g.id AS group_id, g.name AS group_name,
                COALESCE(SUM(lb.entry_qty - lb.exit_qty), 0) AS balance,
                COUNT(CASE WHEN lb.exit_qty < lb.entry_qty THEN 1 END) AS lots_in_stock,
                COUNT(*) AS lots_total,
                MIN(CASE WHEN lb.exit_qty < lb.entry_qty THEN lb.entry_date END) AS oldest_entry
            FROM lot_balance lb
            JOIN materials m ON m.id = lb.material_id AND m.tracking_mode = 'lots'
            LEFT JOIN groups g ON g.id = m.group_id
            GROUP BY lb.material_id
            ${havingClause}
        ),
        simple_position AS (
            SELECT
                m.name AS material, m.id AS material_id, m.color AS material_color,
                m.tracking_mode, m.allow_partial_exit, m.unit_of_measure AS unit,
                g.id AS group_id, g.name AS group_name,
                COALESCE(SUM(CASE WHEN sm.type = 'entry' THEN sm.quantity ELSE -sm.quantity END), 0) AS balance,
                0 AS lots_in_stock, 0 AS lots_total,
                MIN(CASE WHEN sm.type = 'entry' THEN sm.date END) AS oldest_entry
            FROM stock_movements sm
            JOIN materials m ON m.id = sm.material_id AND m.tracking_mode = 'simple'
            LEFT JOIN groups g ON g.id = m.group_id
            WHERE 1=1${simpleLocFilter}
            GROUP BY sm.material_id
            ${simpleHavingClause}
        ),
        all_position AS (
            SELECT * FROM lot_position
            UNION ALL
            SELECT * FROM simple_position
        )
    `;

    // params order: locParams (lot_balance) + linkedHavingParams (lot_position HAVING) + simpleParams + linkedHavingParams (simple HAVING)
    const baseParams = [...locParams, ...linkedHavingParams, ...simpleParams, ...linkedHavingParams];

    if (paginated) {
        db.get(`${cteSql} SELECT COUNT(*) as total FROM all_position ${outerWhere}`, [...baseParams, ...filterParams], (err, countRow) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar posição de estoque.", error: err.message });
            db.all(`${cteSql} SELECT * FROM all_position ${outerWhere} ORDER BY material LIMIT ? OFFSET ?`, [...baseParams, ...filterParams, limitNum, offset], (err2, rows) => {
                if (err2) return res.status(500).json({ success: false, message: "Erro ao carregar posição de estoque.", error: err2.message });
                res.json({ data: rows || [], total: countRow?.total || 0 });
            });
        });
    } else {
        db.all(`${cteSql} SELECT * FROM all_position ${outerWhere} ORDER BY material`, [...baseParams, ...filterParams], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar posição de estoque.", error: err.message });
            res.json(rows || []);
        });
    }
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /stock-units - Cria uma nova unidade de estoque
 */
router.post("/", requirePermission('inventory', 'stock-units', 'create'), (req, res) => {
    const { receipt_id, volume_id, old_id, material, supplier, operator, weight, status, date_in, date_out, notes, deduction_type, location_id, packaging_id, packaging_count } = req.body;
    const normalizedVolumeId = normalizeVolumeId(volume_id);

    if (normalizedVolumeId === null) {
        return res.status(400).json({
            success: false,
            message: "volume_id deve ser um numero inteiro valido"
        });
    }

    const normalizedDateOut = (date_out == null || date_out === "") ? null : date_out;
    const initialRemaining = (status === 'OUT_STOCK' && normalizedDateOut) ? 0 : weight;
    db.run(
        `INSERT INTO stock_units (receipt_id, volume_id, old_id, material, supplier, operator, weight, status, date_in, date_out, notes, deduction_type, remaining_weight, location_id, packaging_id, packaging_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [receipt_id, normalizedVolumeId, old_id || null, material, supplier || null, operator || null, weight, status, date_in, normalizedDateOut, notes, deduction_type || null, initialRemaining, location_id || null, packaging_id || null, packaging_count || null],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao criar unidade de estoque",
                    error: err.message
                });
            }
            const lotId = this.lastID;

            // Sync: cria movimento de entrada (pulado para itens em rascunho)
            if (status !== 'DRAFT') {
                db.get(`SELECT id FROM materials WHERE name = ?`, [material], (_, mat) => {
                    const materialId = mat ? mat.id : 0;
                    _insertEntryMovement(lotId, materialId, weight, date_in, receipt_id, operator, location_id);
                    if (status === 'OUT_STOCK' && normalizedDateOut) {
                        _insertExitMovement(lotId, materialId, weight, normalizedDateOut, receipt_id, operator, deduction_type, location_id);
                    }
                });
            }

            // Also set material_id on stock_units
            db.run(`UPDATE stock_units SET material_id = (SELECT id FROM materials WHERE name = ?) WHERE id = ?`, [material, lotId]);

            res.json({ id: lotId });
        }
    );
});

// ── PUT Endpoints ─────────────────────────────────────────────────────────

/**
 * PUT /stock-units/:id/out - Marca unidade como saída (OUT_STOCK)
 * Sets the date_out to today and deduction_type to "uso".
 */
router.put("/:id/out", requirePermission('inventory', 'stock-units', 'edit'), (req, res) => {
    const { id } = req.params;
    const { date, deduction_type } = req.body || {};
    const dateOut = date || new Date().toISOString().slice(0, 10);

    // Estado derivado dos movimentos — só cria o movement de saída
    db.get(`SELECT material_id, weight, receipt_id, operator, location_id FROM stock_units WHERE id = ?`, [id], (err, su) => {
        if (err || !su) {
            return res.status(err ? 500 : 404).json({ success: false, message: "Unidade não encontrada", error: err?.message });
        }
        _insertExitMovement(id, su.material_id || 0, su.weight, dateOut, su.receipt_id, su.operator, deduction_type || 'uso', su.location_id);
        res.json({ success: true });
    });
});

/**
 * PUT /stock-units/:id/in - Reverte unidade para estoque (IN_STOCK)
 * Clears date_out and deduction_type.
 */
router.put("/:id/in", requirePermission('inventory', 'stock-units', 'edit'), (req, res) => {
    const { id } = req.params;

    // Estado derivado dos movimentos — apagar os exits já reverte o estado para IN_STOCK
    _deleteExitMovement(id);
    res.json({ success: true });
});

/**
 * PUT /stock-units/update - Atualiza campos de uma unidade de estoque
 */
router.put("/update", requirePermission('inventory', 'stock-units', 'edit'), (req, res) => {
    const { id, date_out, notes, deduction_type } = req.body;
    const normalizedDateOut = (date_out == null || date_out === "") ? null : date_out;

    // Salva apenas notes (campos de estado são derivados dos movimentos)
    db.run(
        `UPDATE stock_units SET notes = ? WHERE id = ?`,
        [notes, id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao atualizar stock unit",
                    error: err.message
                });
            }

            // Recriar movement de saída completo se date_out informado
            _deleteExitMovement(id);
            if (normalizedDateOut) {
                db.get(`SELECT material_id, weight, receipt_id, operator, location_id FROM stock_units WHERE id = ?`, [id], (_, su) => {
                    if (su) _insertExitMovement(id, su.material_id || 0, su.weight, normalizedDateOut, su.receipt_id, su.operator, deduction_type, su.location_id);
                });
            }

            res.json({ success: true, message: "Stock unit atualizado com sucesso", updated: this.changes });
        }
    );
});

/**
 * PUT /stock-units/:id - Atualiza dados de uma unidade de estoque sem alterar status e datas
 */
router.put("/:id", requirePermission('inventory', 'stock-units', 'edit'), (req, res) => {
    const { id } = req.params;
    const { volume_id, material, weight, operator } = req.body;
    const normalizedVolumeId = normalizeVolumeId(volume_id);

    if (normalizedVolumeId === null) {
        return res.status(400).json({
            success: false,
            message: "volume_id deve ser um numero inteiro valido"
        });
    }

    db.run(
        `UPDATE stock_units
         SET volume_id = ?, material = ?, weight = ?, operator = ?
         WHERE id = ?`,
        [normalizedVolumeId, material, weight, operator || null, id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao atualizar unidade de estoque",
                    error: err.message
                });
            }

            // Sync: update material_id on stock_units + update entry movement
            db.get(`SELECT id FROM materials WHERE name = ?`, [material], (_, mat) => {
                const materialId = mat ? mat.id : 0;
                db.run(`UPDATE stock_units SET material_id = ? WHERE id = ?`, [materialId, id]);
                db.run(
                    `UPDATE stock_movements SET material_id = ?, quantity = ?, operator = ? WHERE lot_id = ? AND type = 'entry'`,
                    [materialId, weight, operator || null, id]
                );
                db.run(
                    `UPDATE stock_movements SET material_id = ?, quantity = ?, operator = ? WHERE lot_id = ? AND type = 'exit'`,
                    [materialId, weight, operator || null, id]
                );
            });

            res.json({ success: true, updated: this.changes });
        }
    );
});

// ── Partial Exit ──────────────────────────────────────────────────────────

/**
 * PUT /stock-units/:id/partial-exit
 * Saída parcial de um lote: consome uma parcela do peso.
 * Body: { quantity, reason?, notes?, location_id? }
 */
router.put("/:id/partial-exit", requirePermission('inventory', 'stock-units', 'edit'), async (req, res) => {
    const { id } = req.params;
    const { quantity, reason, notes, location_id, date } = req.body;

    if (!quantity || quantity <= 0) {
        return res.status(400).json({ success: false, message: "Quantidade deve ser maior que zero" });
    }

    try {
        const unit = await _dbGet(`SELECT su.*, m.allow_partial_exit FROM stock_units su LEFT JOIN materials m ON m.id = su.material_id WHERE su.id = ?`, [id]);
        if (!unit) {
            return res.status(404).json({ success: false, message: "Unidade não encontrada" });
        }
        if (!unit.allow_partial_exit) {
            return res.status(400).json({ success: false, message: "Material não permite saída parcial" });
        }

        // Calcular remaining a partir dos movimentos (fonte de verdade)
        const exitRow = await _dbGet(
            `SELECT COALESCE(SUM(quantity), 0) AS total_exits FROM stock_movements WHERE lot_id = ? AND type = 'exit'`,
            [id]
        );
        const remaining = Math.round((unit.weight - (exitRow?.total_exits || 0)) * 1000) / 1000;

        if (quantity > remaining) {
            return res.status(400).json({ success: false, message: `Quantidade excede o saldo restante (${remaining} kg)` });
        }

        const date = req.body.date || new Date().toISOString().slice(0, 10);
        const deduction = reason || 'consumption';
        const effectiveLocationId = location_id || unit.location_id || null;

        // Estado derivado dos movimentos — apenas inserir o movement de saída
        await _dbRun(
            `INSERT INTO stock_movements (type, material_id, quantity, date, lot_id, location_id, operator, reason, notes)
             VALUES ('exit', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [unit.material_id || 0, quantity, date, id, effectiveLocationId, unit.operator || null, deduction, notes || null]
        );

        const newRemaining = Math.round((remaining - quantity) * 1000) / 1000;
        res.json({ success: true, remaining_weight: newRemaining });
    } catch (err) {
        res.status(500).json({ success: false, message: "Erro ao registrar saída parcial", error: err.message });
    }
});

// ── DELETE Endpoints ──────────────────────────────────────────────────────

/**
 * DELETE /stock-units/:id - Deleta uma unidade de estoque
 */
router.delete("/:id", requirePermission('inventory', 'stock-units', 'delete'), (req, res) => {
    const { id } = req.params;

    db.run(
        `DELETE FROM stock_units
         WHERE id = ?`,
        [id],
        function (err) {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    message: "Erro ao deletar stock unit",
                    error: err.message 
                });
            }

            // Sync: remove all movements for this lot
            _deleteAllMovements(id);

            res.json({ 
                success: true, 
                message: "Stock unit deletado com sucesso",
                deleted: this.changes 
            });
        }
    );
});

module.exports = router;