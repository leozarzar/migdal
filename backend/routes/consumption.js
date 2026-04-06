/**
 * @module routes/consumption
 * @description Consumption statistics routes.
 * Provides daily consumption aggregation for a given material and date range.
 */

const router = require("express").Router();
const db = require("../db");

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /consumption
 * Returns daily consumption totals for a material within a date range.
 * Query params: startDate (or dataInicio), endDate (or dataFim), material.
 */
router.get("/", (req, res) => {
    const startDate = req.query.startDate || req.query.dataInicio;
    const endDate = req.query.endDate || req.query.dataFim;
    const material = req.query.material;

    if (!startDate || !endDate || !material) {
        return res.status(400).json({
            success: false,
            message: "Parâmetros obrigatórios: startDate, endDate e material"
        });
    }

    db.all(
        `SELECT
            DATE(date_out) AS day,
            SUM(weight) AS consumption
         FROM stock_units
         WHERE material = ?
           AND date_out BETWEEN ? AND ?
         GROUP BY DATE(date_out)
         ORDER BY day`,
        [material, startDate, endDate],
        (err, rows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao carregar consumo",
                    error: err.message
                });
            }

            res.json(rows || []);
        }
    );
});

module.exports = router;