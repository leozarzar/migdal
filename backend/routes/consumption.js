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
    const location_id = req.query.location_id;

    if (!startDate || !endDate || !material) {
        return res.status(400).json({
            success: false,
            message: "Parâmetros obrigatórios: startDate, endDate e material"
        });
    }

    const user = req.user || {};
    const userLocs = (!user.isAdmin && user.locationIds && user.locationIds.length > 0) ? user.locationIds : null;
    let locFilter = '';
    const params = [material, startDate, endDate];
    if (location_id) {
        if (userLocs && !userLocs.includes(Number(location_id))) {
            return res.json([]);
        }
        locFilter = ` AND sm.location_id = ?`;
        params.push(location_id);
    } else if (userLocs) {
        const ph = userLocs.map(() => '?').join(',');
        locFilter = ` AND sm.location_id IN (${ph})`;
        params.push(...userLocs);
    }

    db.all(
        `SELECT
            DATE(sm.date) AS day,
            SUM(sm.quantity) AS consumption
         FROM stock_movements sm
         JOIN materials m ON m.id = sm.material_id
         WHERE m.name = ?
           AND sm.type = 'exit'
           AND sm.status NOT IN ('DRAFT', 'ABANDONED')
           AND sm.date BETWEEN ? AND ?${locFilter}
         GROUP BY DATE(sm.date)
         ORDER BY day`,
        params,
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