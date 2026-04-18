/**
 * @module routes/stock-monitor
 * @description Stock balance monitoring route.
 * Computes a daily stock balance timeline for a given material and date range.
 */

const router = require("express").Router();
const db = require("../db");

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /stock-monitor
 * Returns the stock balance over time for a material.
 * Uses a CTE to collect all distinct event dates (entries and exits),
 * then computes the running balance at each date via a correlated subquery.
 * Query params: material, startDate, endDate.
 */
router.get("/", (req, res) => {
    const { material, startDate, endDate, location_id } = req.query;

    if (!startDate || !endDate || !material) {
        return res.status(400).json({
            success: false,
            message: "Parâmetros obrigatórios: material, startDate e endDate"
        });
    }

    const user = req.user || {};
    const userLocs = (!user.isAdmin && user.locationIds && user.locationIds.length > 0) ? user.locationIds : null;
    let locFilter = '';
    let locParams = [];
    if (location_id) {
        if (userLocs && !userLocs.includes(Number(location_id))) {
            return res.json([]);
        }
        locFilter = ` AND sm.location_id = ?`;
        locParams = [location_id];
    } else if (userLocs) {
        const ph = userLocs.map(() => '?').join(',');
        locFilter = ` AND sm.location_id IN (${ph})`;
        locParams = [...userLocs];
    }

    const sql = `
        WITH event_dates AS (
            SELECT DISTINCT sm.date AS date
            FROM stock_movements sm
            JOIN materials m ON m.id = sm.material_id
            WHERE sm.date IS NOT NULL AND sm.date BETWEEN ? AND ? AND m.name = ?${locFilter}
            UNION SELECT ?
            UNION SELECT ?
        )
        SELECT
            d.date,
            (
                SELECT COALESCE(
                    SUM(CASE WHEN sm2.type = 'entry' THEN sm2.quantity ELSE -sm2.quantity END),
                    0
                )
                FROM stock_movements sm2
                JOIN materials m2 ON m2.id = sm2.material_id
                WHERE m2.name = ?
                  AND sm2.date <= d.date${locFilter.replace(/\bsm\b/g, 'sm2')}
            ) AS balance
        FROM event_dates d
        WHERE d.date IS NOT NULL AND d.date BETWEEN ? AND ?
        ORDER BY d.date
    `;

    const params = [
        startDate, endDate, material, ...locParams,
        startDate, endDate,
        material, ...locParams,
        startDate, endDate
    ];

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Erro ao calcular saldo de estoque",
                error: err.message
            });
        }

        res.json(rows || []);
    });
});

module.exports = router;
