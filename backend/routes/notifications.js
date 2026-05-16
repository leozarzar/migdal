/**
 * @module routes/notifications
 * @description Notification generation and management routes.
 * Generates alerts for: overdue orders, orders due soon,
 * aged stock items, and materials below safety stock.
 */

const router = require("express").Router();
const db     = require("../db");

// ── Helpers: Promise wrappers ─────────────────────────────────────────────

function dbAll(sql, params) {
    return new Promise((resolve, reject) =>
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []))
    );
}

function dbGet(sql, params) {
    return new Promise((resolve, reject) =>
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null))
    );
}

function dbRun(sql, params) {
    return new Promise((resolve, reject) =>
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })
    );
}

// ── Helpers: cálculo estatístico ─────────────────────────────────────────

/**
 * Aproximação do z-score (Abramowitz & Stegun 26.2.23).
 * Replicado de stock-policy-utils.js para cálculo server-side.
 * @param {number} serviceLevel - Nível de serviço em % (ex: 95).
 */
function _zScore(serviceLevel) {
    const p = Math.max(0.501, Math.min(0.999, serviceLevel / 100));
    const t = Math.sqrt(-2 * Math.log(1 - p));
    const c = [2.515517, 0.802853, 0.010328];
    const d = [1.432788, 0.189269, 0.001308];
    return t - (c[0] + c[1] * t + c[2] * t * t) /
               (1 + d[0] * t + d[1] * t * t + d[2] * t * t * t);
}

/**
 * Desvio padrão RMSE de um array de resíduos.
 * @param {number[]} arr
 */
function _stdDev(arr) {
    if (!arr.length) return 0;
    return Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);
}

/** Formata YYYY-MM-DD → DD/MM/YYYY para exibição. */
function _fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

// ── Table Setup ───────────────────────────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        type         TEXT    NOT NULL,
        title        TEXT    NOT NULL,
        message      TEXT    NOT NULL,
        entity_type  TEXT,
        entity_id    INTEGER,
        severity     TEXT    NOT NULL DEFAULT 'info',
        created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        dismissed_at TEXT
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela notifications:", err.message);
});

// ── POST /notifications/generate ─────────────────────────────────────────

/**
 * POST /notifications/generate
 * Removes all active (non-dismissed) notifications and recalculates them.
 * Checks: overdue orders, orders due soon, aged stock, safety stock breaches.
 */
router.post("/generate", async (req, res) => {
    try {
        const today    = new Date().toISOString().slice(0, 10);
        const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const start90  = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

        // 0. Apagar dispensadas com prazo expirado (> 1 dia)
        //    Se a condição ainda estiver ativa, será reinserida abaixo.
        await dbRun(
            `DELETE FROM notifications
             WHERE dismissed_at IS NOT NULL
               AND dismissed_at <= datetime('now', '-1 day')`,
            []
        );

        // 1. Calcular o conjunto de condições atualmente ativas
        const current = []; // { type, title, message, entity_type, entity_id, severity }

        // ── Pedidos atrasados (somente abertos) ───────────────────────────
        const overdue = await dbAll(
            `SELECT o.id, o.code, COALESCE(s.name, o.supplier) AS supplier, o.expected_date
               FROM orders o LEFT JOIN suppliers s ON s.id = o.supplier_id
              WHERE o.expected_date IS NOT NULL AND o.expected_date != ''
                AND o.expected_date < ?
                AND o.status = 'OPEN'`,
            [today]
        );
        for (const o of overdue) {
            current.push({
                type: 'order_overdue', entity_type: 'order', entity_id: o.id, severity: 'critical',
                title:   `Pedido ${o.code || '#' + o.id} atrasado`,
                message: `Prazo esperado era ${_fmtDate(o.expected_date)}${o.supplier ? ' · ' + o.supplier : ''}`,
            });
        }

        // ── Pedidos que vencem amanhã (somente abertos) ───────────────────
        const dueSoon = await dbAll(
            `SELECT o.id, o.code, COALESCE(s.name, o.supplier) AS supplier, o.due_date
               FROM orders o LEFT JOIN suppliers s ON s.id = o.supplier_id
              WHERE o.due_date IS NOT NULL AND o.due_date != ''
                AND o.due_date = ?
                AND o.status = 'OPEN'`,
            [tomorrow]
        );
        for (const o of dueSoon) {
            current.push({
                type: 'order_due_soon', entity_type: 'order', entity_id: o.id, severity: 'warning',
                title:   `Pedido ${o.code || '#' + o.id} vence amanhã`,
                message: `Vencimento em ${_fmtDate(o.due_date)}${o.supplier ? ' · ' + o.supplier : ''}`,
            });
        }

        // ── Itens envelhecidos no estoque (> 60 dias) ─────────────────────
        const agingCutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
        const agingItems = await dbAll(
            `SELECT m.name as material, m.id as material_id, MIN(sm.date) as oldest_in
             FROM stock_movements sm
             JOIN materials m ON m.id = sm.material_id
             WHERE sm.type = 'entry'
               AND sm.lot_id IS NOT NULL
               AND sm.date IS NOT NULL AND sm.date != '' AND sm.date < ?
               AND NOT EXISTS (
                   SELECT 1 FROM stock_movements sm2
                   WHERE sm2.lot_id = sm.lot_id AND sm2.type = 'exit'
               )
             GROUP BY sm.material_id`,
            [agingCutoff]
        );
        for (const item of agingItems) {
            const daysIn = Math.floor(
                (Date.now() - new Date(item.oldest_in + 'T00:00:00').getTime()) / 86400000
            );
            current.push({
                type: 'stock_aging', entity_type: 'material', entity_id: item.material_id, severity: 'warning',
                title:   `Estoque envelhecido: ${item.material}`,
                message: `Item mais antigo há ${daysIn} dias em estoque`,
            });
        }

        // ── Saldo abaixo do estoque de segurança ──────────────────────────
        const policyItems = await dbAll(
            `SELECT spi.material_id, spi.lead_time_days as item_lt,
                    sp.service_level, sp.lead_time_days as policy_lt, sp.lead_time_type,
                    m.name as material_name
             FROM stock_policy_items spi
             JOIN stock_policies sp ON sp.id = spi.policy_id
             JOIN materials m ON m.id = spi.material_id
             WHERE spi.material_id IS NOT NULL`,
            []
        );
        const balances = await dbAll(
            `SELECT m.name as material,
                    COALESCE(SUM(CASE WHEN sm.type = 'entry' THEN sm.quantity ELSE -sm.quantity END), 0) as balance
             FROM stock_movements sm
             JOIN materials m ON m.id = sm.material_id
             GROUP BY sm.material_id`,
            []
        );
        const balanceMap = new Map(balances.map(b => [b.material, b.balance]));

        for (const item of policyItems) {
            const mat          = item.material_name;
            const serviceLevel = item.service_level || 95;
            let   leadTime     = item.item_lt || item.policy_lt || 15;

            if (!item.item_lt && item.lead_time_type === 'auto') {
                const ltRow = await dbGet(
                    `SELECT AVG(julianday(r.date) - julianday(o.date)) as avg_lt
                     FROM receipts r
                     JOIN orders o ON o.id = r.order_id
                     JOIN order_items oi ON oi.order_id = o.id
                     WHERE oi.material = ? AND r.date >= ?`,
                    [mat, start90]
                );
                if (ltRow?.avg_lt) leadTime = Math.max(1, Math.round(ltRow.avg_lt));
            }

            const consumptionRows = await dbAll(
                `SELECT DATE(sm.date) as day, SUM(sm.quantity) as total
                 FROM stock_movements sm
                 JOIN materials m ON m.id = sm.material_id
                 WHERE m.name = ? AND sm.type = 'exit' AND sm.date BETWEEN ? AND ?
                 GROUP BY DATE(sm.date)`,
                [mat, start90, today]
            );
            if (consumptionRows.length < 7) continue;

            const vals = consumptionRows.map(r => r.total);
            const avg  = vals.reduce((s, v) => s + v, 0) / vals.length;
            const sd   = _stdDev(vals.map(v => v - avg));
            const es   = _zScore(serviceLevel) * sd * Math.sqrt(leadTime);
            if (es <= 0) continue;

            const balance = balanceMap.get(mat) || 0;
            if (balance < es) {
                current.push({
                    type: 'stock_safety', entity_type: 'material', entity_id: item.material_id,
                    severity: 'critical',
                    title:   `Estoque de segurança: ${mat}`,
                    message: `Saldo ${balance.toFixed(1)} kg abaixo do ES ${es.toFixed(1)} kg (SL ${serviceLevel}%, LT ${leadTime}d)`,
                });
            }
        }

        // 2. Buscar notificações de alerta ativas no banco
        const existing = await dbAll(
            `SELECT id, type, entity_type, entity_id FROM notifications
             WHERE dismissed_at IS NULL AND type != 'weekly_report'`,
            []
        );

        const makeKey  = n => `${n.type}|${n.entity_type || ''}|${n.entity_id ?? ''}`;
        const currentMap  = new Map(current.map(n  => [makeKey(n), n]));
        const existingMap = new Map(existing.map(n => [makeKey(n), n]));

        // 3. Remover notificações cuja condição foi resolvida
        let removed = 0;
        for (const [key, row] of existingMap) {
            if (!currentMap.has(key)) {
                await dbRun(`DELETE FROM notifications WHERE id = ?`, [row.id]);
                removed++;
            }
        }

        // 4. Inserir apenas notificações novas, respeitando silêncio pós-dispensa
        const recentlyDismissed = await dbAll(
            `SELECT type, entity_type, entity_id FROM notifications
             WHERE dismissed_at IS NOT NULL
               AND dismissed_at > datetime('now', '-1 day')`,
            []
        );
        const silenced = new Set(recentlyDismissed.map(makeKey));

        let inserted = 0;
        for (const [key, n] of currentMap) {
            if (existingMap.has(key)) continue; // já existe — não toca
            if (silenced.has(key))   continue;  // dispensada recentemente — aguardar
            await dbRun(
                `INSERT INTO notifications (type, title, message, entity_type, entity_id, severity)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [n.type, n.title, n.message, n.entity_type, n.entity_id, n.severity]
            );
            inserted++;
        }

        res.json({ success: true, inserted, removed });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Erro ao gerar notificações",
            error: err.message
        });
    }
});

// ── GET /notifications ────────────────────────────────────────────────────

/**
 * GET /notifications
 * Returns all active (non-dismissed) notifications ordered by severity then date.
 */
router.get("/", (req, res) => {
    db.all(
        `SELECT * FROM notifications
         WHERE dismissed_at IS NULL
         ORDER BY created_at DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({
                success: false,
                message: "Erro ao carregar notificações",
                error: err.message
            });
            res.json(rows || []);
        }
    );
});

// ── GET /notifications/count ──────────────────────────────────────────────

/**
 * GET /notifications/count
 * Returns a summary count of active notifications grouped by severity.
 */
router.get("/count", (req, res) => {
    db.get(
        `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
            SUM(CASE WHEN severity = 'warning'  THEN 1 ELSE 0 END) as warning
         FROM notifications WHERE dismissed_at IS NULL`,
        [],
        (err, row) => {
            if (err) return res.status(500).json({
                success: false,
                message: "Erro ao contar notificações",
                error: err.message
            });
            res.json({
                total:    row.total    || 0,
                critical: row.critical || 0,
                warning:  row.warning  || 0
            });
        }
    );
});

// ── PATCH /notifications/:id/dismiss ─────────────────────────────────────

/**
 * PATCH /notifications/:id/dismiss
 * Marks a notification as dismissed without deleting it (preserves history).
 */
router.patch("/:id/dismiss", (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id || isNaN(id)) {
        return res.status(400).json({ success: false, message: "ID inválido" });
    }

    db.run(
        `UPDATE notifications SET dismissed_at = datetime('now') WHERE id = ? AND dismissed_at IS NULL`,
        [id],
        function (err) {
            if (err) return res.status(500).json({
                success: false,
                message: "Erro ao dispensar notificação",
                error: err.message
            });
            if (this.changes === 0) return res.status(404).json({
                success: false,
                message: "Notificação não encontrada ou já dispensada"
            });
            res.json({ success: true });
        }
    );
});

module.exports = router;
