/**
 * @module routes/stock-units
 * @description Stock unit CRUD routes.
 * Manages individual inventory units with status tracking (IN_STOCK / OUT_STOCK).
 */

const router = require("express").Router();
const db = require("../db");

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

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /stock-units - Lista todas as unidades de estoque
 * Joins with receipts to include the nature (type) of each receipt.
 */
router.get("/", (req, res) => {
    db.all(`
        SELECT b.*, COALESCE(r.nature, "") AS nature
        FROM stock_units b
        LEFT JOIN receipts r ON b.receipt_id = r.id
        ORDER BY b.date_in DESC, b.receipt_id DESC, CAST(b.volume_id AS INTEGER) ASC
        `, [], (err, rows) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Erro ao carregar estoque",
                error: err.message
            });
        }

        res.json(rows || []);
    });
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /stock-units - Cria uma nova unidade de estoque
 */
router.post("/", (req, res) => {
    const { receipt_id, volume_id, old_id, material, supplier, operator, weight, status, date_in, date_out, notes, deduction_type } = req.body;
    const normalizedVolumeId = normalizeVolumeId(volume_id);

    if (normalizedVolumeId === null) {
        return res.status(400).json({
            success: false,
            message: "volume_id deve ser um numero inteiro valido"
        });
    }

    const normalizedDateOut = (date_out == null || date_out === "") ? null : date_out;
    db.run(
        `INSERT INTO stock_units (receipt_id, volume_id, old_id, material, supplier, operator, weight, status, date_in, date_out, notes, deduction_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [receipt_id, normalizedVolumeId, old_id || null, material, supplier || null, operator || null, weight, status, date_in, normalizedDateOut, notes, deduction_type || null],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao criar unidade de estoque",
                    error: err.message
                });
            }
            res.json({ id: this.lastID });
        }
    );
});

// ── PUT Endpoints ─────────────────────────────────────────────────────────

/**
 * PUT /stock-units/:id/out - Marca unidade como saída (OUT_STOCK)
 * Sets the date_out to today and deduction_type to "uso".
 */
router.put("/:id/out", (req, res) => {
    const { id } = req.params;
    const date = new Date().toISOString().slice(0, 10);

    db.run(
        `UPDATE stock_units
         SET status = ?, date_out = ?, deduction_type = ?
         WHERE id = ?`,
        ["OUT_STOCK", date, "uso", id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao dar saída na unidade de estoque",
                    error: err.message
                });
            }
            res.json({ updated: this.changes });
        }
    );
});

/**
 * PUT /stock-units/:id/in - Reverte unidade para estoque (IN_STOCK)
 * Clears date_out and deduction_type.
 */
router.put("/:id/in", (req, res) => {
    const { id } = req.params;

    db.run(
        `UPDATE stock_units
         SET status = ?, date_out = ?, deduction_type = ?
         WHERE id = ?`,
        ["IN_STOCK", null, null, id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao reverter unidade de estoque",
                    error: err.message
                });
            }
            res.json({ updated: this.changes });
        }
    );
});

/**
 * PUT /stock-units/update - Atualiza campos de uma unidade de estoque
 */
router.put("/update", (req, res) => {
    const { id, status, date_out, notes, deduction_type } = req.body;
    const normalizedDateOut = (date_out == null || date_out === "") ? null : date_out;

    db.run(
        `UPDATE stock_units
         SET status = ?, date_out = ?, notes = ?, deduction_type = ?
         WHERE id = ?`,
        [status, normalizedDateOut, notes, deduction_type !== undefined ? deduction_type : null, id],
        function (err) {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    message: "Erro ao atualizar stock unit",
                    error: err.message 
                });
            }
            res.json({ 
                success: true, 
                message: "Stock unit atualizado com sucesso",
                updated: this.changes 
            });
        }
    );
});

// ── DELETE Endpoints ──────────────────────────────────────────────────────

/**
 * DELETE /stock-units/:id - Deleta uma unidade de estoque
 */
router.delete("/:id", (req, res) => {
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
            res.json({ 
                success: true, 
                message: "Stock unit deletado com sucesso",
                deleted: this.changes 
            });
        }
    );
});

module.exports = router;