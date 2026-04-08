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
    const { material, startDate, endDate } = req.query;

    if (!startDate || !endDate || !material) {
        return res.status(400).json({
            success: false,
            message: "Parâmetros obrigatórios: material, startDate e endDate"
        });
    }

    const sql = `
        WITH event_dates AS (
            SELECT DISTINCT date_in AS date
            FROM stock_units
            WHERE date_in IS NOT NULL AND date_in BETWEEN ? AND ? AND material = ?
            UNION
            SELECT DISTINCT date_out AS date
            FROM stock_units
            WHERE date_out IS NOT NULL AND date_out BETWEEN ? AND ? AND material = ?
            UNION SELECT ?
            UNION SELECT ?
        )
        SELECT
            d.date,
            (
                SELECT COALESCE(SUM(weight), 0)
                FROM stock_units
                WHERE material = ?
                  AND date_in <= d.date
                  AND (date_out IS NULL OR date_out = '' OR date_out > d.date)
            ) AS balance
        FROM event_dates d
        WHERE d.date IS NOT NULL AND d.date BETWEEN ? AND ?
        ORDER BY d.date
    `;

    const params = [
        startDate, endDate, material,
        startDate, endDate, material,
        startDate, endDate,
        material,
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
