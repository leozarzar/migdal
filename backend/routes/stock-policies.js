/**
 * @module routes/stock-policies
 * @description Stock policy CRUD routes and policy item management.
 * Manages inventory policies (review type, lead time, coverage, forecasting)
 * and their associated material/group items.
 */

const router = require("express").Router();
const db = require("../db");

// ── Table Setup: stock_policies ──────────────────────────────────────────
//
// review_type        : 'continuous' | 'periodic'
// review_period      : 'daily' | 'weekly' | 'monthly' | 'custom'  — NULL se review_type = continuous
// review_period_days : integer                                      — NULL a menos que review_period = custom
//
// lead_time_type     : 'auto' | 'custom'
// lead_time_days     : integer                                      — NULL se lead_time_type = auto
//
// coverage_type      : 'min' | 'custom'
// coverage_days      : integer                                      — NULL se coverage_type = min
//
// forecast_type      : 'auto' | 'custom'
// forecast_model     : 'moving-average' | 'arithmetic'             — NULL se forecast_type = auto
//                    | 'exp-smoothing'  | 'linear-regression'
// forecast_param     : real                                         — NULL se modelo não requer parâmetro
//                      (período para moving-average/linear-regression, alfa para exp-smoothing)

db.run(`
    CREATE TABLE IF NOT EXISTS stock_policies (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        name                TEXT    NOT NULL,
        description         TEXT,
        service_level       REAL    NOT NULL DEFAULT 95,

        review_type         TEXT    NOT NULL DEFAULT 'continuous',
        review_period       TEXT,
        review_period_days  INTEGER,

        lead_time_type      TEXT    NOT NULL DEFAULT 'auto',
        lead_time_days      INTEGER,

        coverage_type       TEXT    NOT NULL DEFAULT 'min',
        coverage_days       INTEGER,

        forecast_type       TEXT    NOT NULL DEFAULT 'auto',
        forecast_model      TEXT,
        forecast_param      REAL
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela stock_policies:", err.message);
});

// ── Table Setup: stock_policy_items ──────────────────────────────────────
//
// Cada item vincula um material a uma política.
// Campos NULL significam "herdar da política pai".
//
// forecast_model / forecast_param : NULL = herdar da política
// lead_time_days                  : NULL = calcular / herdar da política
// coverage_days                   : NULL = usar mínimo / herdar da política

db.run(`
    CREATE TABLE IF NOT EXISTS stock_policy_items (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id           INTEGER NOT NULL REFERENCES stock_policies(id) ON DELETE CASCADE,
        material_id         INTEGER NOT NULL REFERENCES materials(id),
        forecast_model      TEXT,
        forecast_param      REAL,
        lead_time_days      INTEGER,
        coverage_days       INTEGER,
        forecast_start_date TEXT,
        forecast_aggregation TEXT,
        forecast_remove_zeros    INTEGER DEFAULT 0,
        forecast_treat_outliers  INTEGER DEFAULT 0,
        forecast_treat_ruptures  INTEGER DEFAULT 0,
        UNIQUE(policy_id, material_id)
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela stock_policy_items:", err.message);
});

// ── Migrations: stock_policy_items columns ─────────────────────────────

// Migração: adiciona colunas de previsão detalhada se já existir a tabela (execução silenciosa)
[
    "ALTER TABLE stock_policy_items ADD COLUMN forecast_start_date TEXT",
    "ALTER TABLE stock_policy_items ADD COLUMN forecast_aggregation TEXT",
    "ALTER TABLE stock_policy_items ADD COLUMN forecast_remove_zeros INTEGER DEFAULT 0",
    "ALTER TABLE stock_policy_items ADD COLUMN forecast_treat_outliers INTEGER DEFAULT 0",
    "ALTER TABLE stock_policy_items ADD COLUMN forecast_treat_ruptures INTEGER DEFAULT 0"
].forEach(sql => db.run(sql, () => {}));

db.run(`ALTER TABLE stock_policy_items ADD COLUMN group_id INTEGER`, () => {});
db.run(`ALTER TABLE stock_policy_items ADD COLUMN item_type TEXT`, () => {});

// ── Migration: relax material_id NOT NULL constraint ───────────────────
// Recreates the table to allow group-only items (material_id nullable).

// Migration: remove NOT NULL constraint from material_id to allow group-only items.
// Only runs if the current table still has the old NOT NULL schema.
db.get(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='stock_policy_items'`,
    (err, row) => {
        if (err || !row) return;
        // Only migrate when material_id is still declared NOT NULL
        if (!row.sql.includes('material_id INTEGER NOT NULL')) return;

        db.serialize(() => {
            db.run(`
                CREATE TABLE stock_policy_items_new (
                    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
                    policy_id                INTEGER NOT NULL REFERENCES stock_policies(id) ON DELETE CASCADE,
                    material_id              INTEGER REFERENCES materials(id),
                    group_id                 INTEGER,
                    item_type                TEXT,
                    forecast_model           TEXT,
                    forecast_param           REAL,
                    lead_time_days           INTEGER,
                    coverage_days            INTEGER,
                    forecast_start_date      TEXT,
                    forecast_aggregation     TEXT,
                    forecast_remove_zeros    INTEGER DEFAULT 0,
                    forecast_treat_outliers  INTEGER DEFAULT 0,
                    forecast_treat_ruptures  INTEGER DEFAULT 0,
                    UNIQUE(policy_id, material_id, group_id)
                )
            `, (err2) => {
                if (err2) return;
                db.run(`
                    INSERT OR IGNORE INTO stock_policy_items_new
                        (id, policy_id, material_id, group_id, item_type,
                         forecast_model, forecast_param, lead_time_days, coverage_days,
                         forecast_start_date, forecast_aggregation,
                         forecast_remove_zeros, forecast_treat_outliers, forecast_treat_ruptures)
                    SELECT id, policy_id, material_id, group_id, item_type,
                           forecast_model, forecast_param, lead_time_days, coverage_days,
                           forecast_start_date, forecast_aggregation,
                           forecast_remove_zeros, forecast_treat_outliers, forecast_treat_ruptures
                    FROM stock_policy_items
                `, (err3) => {
                    if (err3) return;
                    db.run(`DROP TABLE stock_policy_items`, (err4) => {
                        if (err4) return;
                        db.run(`ALTER TABLE stock_policy_items_new RENAME TO stock_policy_items`, (err5) => {
                            if (!err5) console.log('[migration] stock_policy_items.material_id is now nullable');
                        });
                    });
                });
            });
        });
    }
);

// ── GET Endpoints: Policy Queries ───────────────────────────────────────

/**
 * GET /stock-policies/material-levels/:materialName
 * Retorna todos os itens de política que contêm o material,
 * com os dados completos da política para cálculo de KPIs no frontend.
 */
router.get("/material-levels/:materialName", (req, res) => {
    const materialName = decodeURIComponent(req.params.materialName);

    db.all(
        `SELECT
            spi.id                  AS item_id,
            sp.id                   AS policy_id,
            sp.name                 AS policy_name,
            sp.service_level,
            sp.review_type,
            sp.review_period,
            sp.review_period_days,
            sp.lead_time_type,
            sp.lead_time_days       AS policy_lead_time_days,
            sp.coverage_type,
            sp.coverage_days        AS policy_coverage_days,
            sp.forecast_type,
            sp.forecast_model       AS policy_forecast_model,
            sp.forecast_param       AS policy_forecast_param,
            spi.forecast_model,
            spi.forecast_param,
            spi.lead_time_days,
            spi.forecast_start_date,
            spi.forecast_aggregation,
            spi.forecast_remove_zeros,
            spi.forecast_treat_outliers,
            spi.forecast_treat_ruptures
         FROM stock_policy_items spi
         JOIN stock_policies sp ON sp.id = spi.policy_id
         JOIN materials m ON m.id = spi.material_id
         WHERE m.name = ?
         ORDER BY sp.name`,
        [materialName],
        (err, rows) => {
            if (err) return res.status(500).json({ message: "Erro ao buscar níveis de política", error: err.message });
            res.json(rows || []);
        }
    );
});/**
 * GET /stock-policies/lead-time/:materialName
 * Calcula o lead time médio ponderado para um material,
 * cruzando stock_units → receipts → orders.
 */
router.get("/lead-time/:materialName", (req, res) => {
    const { materialName } = req.params;

    // Busca todos os stock_units do material que tenham um recebimento vinculado a um pedido
    db.all(
        `SELECT
            su.receipt_id,
            su.weight,
            r.date  AS receipt_date,
            o.date  AS order_date
         FROM stock_units su
         JOIN receipts r ON r.id = su.receipt_id
         JOIN orders   o ON o.id = r.order_id
         WHERE su.material = ?
           AND r.order_id IS NOT NULL
           AND r.date IS NOT NULL
           AND o.date IS NOT NULL`,
        [materialName],
        (err, rows) => {
            if (err) return res.status(500).json({ message: "Erro ao calcular lead time", error: err.message });

            if (!rows || rows.length === 0) {
                return res.json({ lead_time: null });
            }

            // Weighted average: sum(days * weight) / sum(weight)
            let weightedSum = 0;
            let totalWeight = 0;

            rows.forEach(row => {
                const days = (new Date(row.receipt_date) - new Date(row.order_date)) / (1000 * 60 * 60 * 24);
                if (days >= 0) {
                    weightedSum += days * (row.weight || 0);
                    totalWeight += (row.weight || 0);
                }
            });

            const lead_time = totalWeight > 0
                ? Math.round((weightedSum / totalWeight) * 10) / 10
                : null;

            res.json({ lead_time });
        }
    );
});



/**
 * GET /stock-policies
 * Lista todas as políticas de estoque.
 */
router.get("/", (req, res) => {
    db.all(
        `SELECT sp.*, COUNT(spi.id) AS item_count
         FROM stock_policies sp
         LEFT JOIN stock_policy_items spi ON spi.policy_id = sp.id
         GROUP BY sp.id
         ORDER BY sp.name`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ message: "Erro ao carregar políticas", error: err.message });
            res.json(rows || []);
        }
    );
});

/**
 * GET /stock-policies/check-material/:materialName
 * Verifica se um material está em alguma política com forecast_type = 'auto'.
 * Retorna { linked: bool, items: [{ item_id, policy_id, policy_name }] }
 */
router.get("/check-material/:materialName", (req, res) => {
    const { materialName } = req.params;

    db.all(
        `SELECT spi.id AS item_id, sp.id AS policy_id, sp.name AS policy_name
         FROM stock_policy_items spi
         JOIN materials m ON m.id = spi.material_id
         JOIN stock_policies sp ON sp.id = spi.policy_id
         WHERE m.name = ?
           AND sp.forecast_type = 'auto'`,
        [materialName],
        (err, rows) => {
            if (err) return res.status(500).json({ message: "Erro ao verificar material", error: err.message });
            res.json({ linked: (rows || []).length > 0, items: rows || [] });
        }
    );
});

/**
 * GET /stock-policies/check-group/:groupId
 * Verifica se um grupo está em alguma política.
 * Retorna { linked: bool, items: [{ item_id, policy_id, policy_name }] }
 */
router.get("/check-group/:groupId", (req, res) => {
    const { groupId } = req.params;

    db.all(
        `SELECT spi.id AS item_id, sp.id AS policy_id, sp.name AS policy_name
         FROM stock_policy_items spi
         JOIN stock_policies sp ON sp.id = spi.policy_id
         WHERE spi.group_id = ? AND spi.item_type = 'group'`,
        [groupId],
        (err, rows) => {
            if (err) return res.status(500).json({ message: "Erro ao verificar grupo", error: err.message });
            res.json({ linked: (rows || []).length > 0, items: rows || [] });
        }
    );
});

/**
 * GET /stock-policies/:id
 * Retorna uma política com seus itens.
 */
router.get("/:id", (req, res) => {
    const { id } = req.params;

    db.get(`SELECT * FROM stock_policies WHERE id = ?`, [id], (err, policy) => {
        if (err) return res.status(500).json({ message: "Erro ao carregar política", error: err.message });
        if (!policy) return res.status(404).json({ message: "Política não encontrada" });

        db.all(
            `SELECT
                spi.id,
                spi.policy_id,
                spi.material_id,
                spi.group_id,
                COALESCE(spi.item_type, 'material') AS item_type,
                m.name AS material,
                g.name AS group_name,
                spi.forecast_model,
                spi.forecast_param,
                spi.lead_time_days,
                spi.coverage_days,
                spi.forecast_start_date,
                spi.forecast_aggregation,
                spi.forecast_remove_zeros,
                spi.forecast_treat_outliers,
                spi.forecast_treat_ruptures
             FROM stock_policy_items spi
             LEFT JOIN materials m ON m.id = spi.material_id
             LEFT JOIN groups g ON g.id = spi.group_id
             WHERE spi.policy_id = ?
             ORDER BY COALESCE(m.name, g.name)`,
            [id],
            (err2, items) => {
                if (err2) return res.status(500).json({ message: "Erro ao carregar itens da política", error: err2.message });
                res.json({ ...policy, items: items || [] });
            }
        );
    });
});

// ── POST Endpoints: Policy CRUD ───────────────────────────────────────────────

/**
 * POST /stock-policies
 * Cria uma nova política de estoque com seus itens.
 */
router.post("/", (req, res) => {
    const {
        name, description, service_level,
        review_type, review_period, review_period_days,
        lead_time_type, lead_time_days,
        coverage_type, coverage_days,
        forecast_type, forecast_model, forecast_param,
        items = []
    } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ message: "Nome da política é obrigatório" });
    }

    db.run(
        `INSERT INTO stock_policies (
            name, description, service_level,
            review_type, review_period, review_period_days,
            lead_time_type, lead_time_days,
            coverage_type, coverage_days,
            forecast_type, forecast_model, forecast_param
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            name.trim(), description || null, service_level ?? 95,
            review_type || "continuous", review_period || null, review_period_days || null,
            lead_time_type || "auto", lead_time_days || null,
            coverage_type || "min", coverage_days || null,
            forecast_type || "auto", forecast_model || null, forecast_param ?? null
        ],
        function (err) {
            if (err) return res.status(500).json({ message: "Erro ao criar política", error: err.message });

            const policyId = this.lastID;
            if (items.length === 0) return res.status(201).json({ id: policyId });

            _insertItems(policyId, items, (err2) => {
                if (err2) return res.status(500).json({ message: "Política criada, mas erro ao salvar itens", error: err2.message });
                res.status(201).json({ id: policyId });
            });
        }
    );
});

// ── PUT Endpoints: Policy CRUD ──────────────────────────────────────────

/**
 * PUT /stock-policies/:id
 * Atualiza uma política e substitui seus itens.
 */
router.put("/:id", (req, res) => {
    const { id } = req.params;
    const {
        name, description, service_level,
        review_type, review_period, review_period_days,
        lead_time_type, lead_time_days,
        coverage_type, coverage_days,
        forecast_type, forecast_model, forecast_param,
        items = []
    } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ message: "Nome da política é obrigatório" });
    }

    db.run(
        `UPDATE stock_policies SET
            name = ?, description = ?, service_level = ?,
            review_type = ?, review_period = ?, review_period_days = ?,
            lead_time_type = ?, lead_time_days = ?,
            coverage_type = ?, coverage_days = ?,
            forecast_type = ?, forecast_model = ?, forecast_param = ?
         WHERE id = ?`,
        [
            name.trim(), description || null, service_level ?? 95,
            review_type || "continuous", review_period || null, review_period_days || null,
            lead_time_type || "auto", lead_time_days || null,
            coverage_type || "min", coverage_days || null,
            forecast_type || "auto", forecast_model || null, forecast_param ?? null,
            id
        ],
        function (err) {
            if (err) return res.status(500).json({ message: "Erro ao atualizar política", error: err.message });
            if (this.changes === 0) return res.status(404).json({ message: "Política não encontrada" });

            db.run(`DELETE FROM stock_policy_items WHERE policy_id = ?`, [id], (err2) => {
                if (err2) return res.status(500).json({ message: "Erro ao substituir itens", error: err2.message });
                if (items.length === 0) return res.json({ id: Number(id) });

                _insertItems(id, items, (err3) => {
                    if (err3) return res.status(500).json({ message: "Política atualizada, mas erro ao salvar itens", error: err3.message });
                    res.json({ id: Number(id) });
                });
            });
        }
    );
});

// ── DELETE Endpoints: Policy CRUD ───────────────────────────────────────

/**
 * DELETE /stock-policies/:id
 * Remove uma política (itens removidos em cascata pela FK).
 */
router.delete("/:id", (req, res) => {
    db.run(`DELETE FROM stock_policies WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ message: "Erro ao deletar política", error: err.message });
        if (this.changes === 0) return res.status(404).json({ message: "Política não encontrada" });
        res.json({ success: true });
    });
});

// ── Policy Item Routes ───────────────────────────────────────────────────

/**
 * POST /stock-policies/:id/items
 * Adiciona um item a uma política existente.
 */
router.post("/:id/items", (req, res) => {
    const { id } = req.params;
    const { material_id, forecast_model, forecast_param, lead_time_days, coverage_days } = req.body;

    if (!material_id) {
        return res.status(400).json({ message: "material_id é obrigatório" });
    }

    db.run(
        `INSERT INTO stock_policy_items (policy_id, material_id, forecast_model, forecast_param, lead_time_days, coverage_days)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, material_id, forecast_model || null, forecast_param ?? null, lead_time_days || null, coverage_days || null],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) return res.status(400).json({ message: "Material já adicionado a esta política" });
                return res.status(500).json({ message: "Erro ao adicionar item", error: err.message });
            }
            res.status(201).json({ id: this.lastID });
        }
    );
});

/**
 * DELETE /stock-policies/:id/items/:itemId
 * Remove um item de uma política.
 */
router.delete("/:id/items/:itemId", (req, res) => {
    db.run(
        `DELETE FROM stock_policy_items WHERE id = ? AND policy_id = ?`,
        [req.params.itemId, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ message: "Erro ao remover item", error: err.message });
            if (this.changes === 0) return res.status(404).json({ message: "Item não encontrado" });
            res.json({ success: true });
        }
    );
});

/**
 * PUT /stock-policies/items/:itemId/forecast
 * Vincula a configuração de previsão da tela de Estatística de Consumo ao item de política.
 * Saves forecast parameters (model, param, start date, aggregation, flags).
 */
router.put("/items/:itemId/forecast", (req, res) => {
    const { itemId } = req.params;
    const {
        forecast_model,
        forecast_param,
        forecast_start_date,
        forecast_aggregation,
        forecast_remove_zeros,
        forecast_treat_outliers,
        forecast_treat_ruptures
    } = req.body;

    db.run(
        `UPDATE stock_policy_items SET
            forecast_model           = ?,
            forecast_param           = ?,
            forecast_start_date      = ?,
            forecast_aggregation     = ?,
            forecast_remove_zeros    = ?,
            forecast_treat_outliers  = ?,
            forecast_treat_ruptures  = ?
         WHERE id = ?`,
        [
            forecast_model || null,
            forecast_param ?? null,
            forecast_start_date || null,
            forecast_aggregation || null,
            forecast_remove_zeros ? 1 : 0,
            forecast_treat_outliers ? 1 : 0,
            forecast_treat_ruptures ? 1 : 0,
            itemId
        ],
        function (err) {
            if (err) return res.status(500).json({ message: "Erro ao vincular previsão", error: err.message });
            if (this.changes === 0) return res.status(404).json({ message: "Item de política não encontrado" });
            res.json({ success: true });
        }
    );
});

// ── Helper Functions ─────────────────────────────────────────────────────

/**
 * Inserts multiple policy items using a prepared statement.
 * @param {number} policyId - The parent policy ID
 * @param {Array} items - Array of item objects to insert
 * @param {Function} callback - Callback with optional error
 */

function _insertItems(policyId, items, callback) {
    if (!items || items.length === 0) return callback(null);
    const stmt = db.prepare(
        `INSERT OR IGNORE INTO stock_policy_items
            (policy_id, material_id, group_id, item_type, forecast_model, forecast_param, lead_time_days, coverage_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let error = null;

    items.forEach(item => {
        if (error) return;
        const itemType   = item.item_type || 'material';
        const materialId = itemType === 'material' ? (item.material_id || null) : null;
        const groupId    = itemType === 'group'    ? (item.group_id    || null) : null;
        stmt.run(
            [policyId, materialId, groupId, itemType, item.forecast_model || null, item.forecast_param ?? null, item.lead_time_days || null, item.coverage_days || null],
            (err) => { if (err) error = err; }
        );
    });

    stmt.finalize((err) => callback(error || err || null));
}

module.exports = router;
