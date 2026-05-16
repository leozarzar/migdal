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
        return;
    }

    // Migração idempotente: adicionar colunas estendidas.
    const EXTRA_COLUMNS = [
        ["business_name",       "TEXT"],
        ["tax_id",              "TEXT"],
        ["address",             "TEXT"],
        ["district",            "TEXT"],
        ["zip",                 "TEXT"],
        ["city",                "TEXT"],
        ["state",               "TEXT"],
        ["phone",               "TEXT"],
        ["state_registration",  "TEXT"],
        ["payment_method",      "TEXT"],
    ];
    db.all(`PRAGMA table_info(suppliers)`, [], (pragmaErr, cols) => {
        if (pragmaErr) return;
        const have = new Set((cols || []).map(c => c.name));
        EXTRA_COLUMNS.forEach(([name, type]) => {
            if (!have.has(name)) {
                db.run(`ALTER TABLE suppliers ADD COLUMN ${name} ${type}`, () => { /* silencia erro de coluna existente em race */ });
            }
        });
    });
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
    db.run(`
        INSERT OR IGNORE INTO supplier_locations (supplier_id, location_id)
        SELECT DISTINCT s.id, r.location_id
        FROM suppliers s
        JOIN receipts r ON r.supplier_id = s.id
        WHERE r.location_id IS NOT NULL
    `);
});

// ── Prazos de pagamento por fornecedor ───────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS supplier_payment_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        days INTEGER NOT NULL,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela supplier_payment_terms:", err.message);
});

// ── Produtos negociados por fornecedor ───────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS supplier_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        material_id INTEGER NOT NULL,
        unit_price REAL NOT NULL DEFAULT 0,
        UNIQUE (supplier_id, material_id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
        FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela supplier_products:", err.message);
});

// ── Helpers ──────────────────────────────────────────────────────────────

function _replacePaymentTerms(supplierId, terms, done) {
    db.run(`DELETE FROM supplier_payment_terms WHERE supplier_id = ?`, [supplierId], (delErr) => {
        if (delErr) return done(delErr);
        if (!Array.isArray(terms) || terms.length === 0) return done(null);

        const stmt = db.prepare(`INSERT INTO supplier_payment_terms (supplier_id, seq, days) VALUES (?, ?, ?)`);
        terms.forEach((t, idx) => {
            const days = Number(t.days);
            if (!Number.isFinite(days) || days < 0) return;
            stmt.run([supplierId, idx + 1, Math.round(days)]);
        });
        stmt.finalize(done);
    });
}

function _replaceProducts(supplierId, products, done) {
    db.run(`DELETE FROM supplier_products WHERE supplier_id = ?`, [supplierId], (delErr) => {
        if (delErr) return done(delErr);
        if (!Array.isArray(products) || products.length === 0) return done(null);

        const stmt = db.prepare(`INSERT OR REPLACE INTO supplier_products (supplier_id, material_id, unit_price) VALUES (?, ?, ?)`);
        products.forEach(p => {
            const matId = Number(p.material_id);
            const price = Number(p.unit_price);
            if (!Number.isInteger(matId) || matId <= 0) return;
            stmt.run([supplierId, matId, Number.isFinite(price) ? price : 0]);
        });
        stmt.finalize(done);
    });
}

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

    const SORT_WHITELIST = { name: 'name', business_name: 'business_name', tax_id: 'tax_id', city: 'city' };
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
        where += ` AND (s.name LIKE ? OR s.business_name LIKE ? OR s.tax_id LIKE ?)`;
        const term = `%${search}%`;
        params.push(term, term, term);
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
 * GET /suppliers/:id - Detalhes completos do fornecedor (incluindo prazos e produtos).
 */
router.get("/:id", (req, res) => {
    const { id } = req.params;
    db.get(`SELECT * FROM suppliers WHERE id = ?`, [id], (err, supplier) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao carregar fornecedor", error: err.message });
        if (!supplier) return res.status(404).json({ success: false, message: "Fornecedor não encontrado" });

        db.all(
            `SELECT seq, days FROM supplier_payment_terms WHERE supplier_id = ? ORDER BY seq`,
            [id],
            (errTerms, terms) => {
                supplier.payment_terms = errTerms ? [] : (terms || []);
                db.all(
                    `SELECT sp.id, sp.material_id, sp.unit_price, m.name AS material_name, m.unit_of_measure
                     FROM supplier_products sp
                     LEFT JOIN materials m ON m.id = sp.material_id
                     WHERE sp.supplier_id = ?
                     ORDER BY m.name`,
                    [id],
                    (errProds, products) => {
                        supplier.products = errProds ? [] : (products || []);
                        res.json(supplier);
                    }
                );
            }
        );
    });
});

/**
 * GET /suppliers/:id/prices - Tabela de preços do fornecedor (compatibilidade com Fatura de Compras).
 * Deriva do supplier_products: { price_type: 'material', material_name, unit_price }.
 */
router.get("/:id/prices", (req, res) => {
    db.all(
        `SELECT 'material' AS price_type, m.name AS material_name, sp.unit_price
         FROM supplier_products sp
         INNER JOIN materials m ON m.id = sp.material_id
         WHERE sp.supplier_id = ?`,
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
 * Aceita campos estendidos + payment_terms[] + products[].
 */
router.post("/", (req, res) => {
    const {
        name, business_name, tax_id, address, district, zip, city, state,
        phone, state_registration, payment_method,
        payment_terms, products, location_id,
    } = req.body;
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

        db.run(
            `INSERT INTO suppliers
                (name, business_name, tax_id, address, district, zip, city, state, phone, state_registration, payment_method)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                trimmedName,
                business_name || null, tax_id || null,
                address || null, district || null, zip || null,
                city || null, state || null,
                phone || null, state_registration || null, payment_method || null,
            ],
            function (insertErr) {
                if (insertErr) {
                    return res.status(500).json({ success: false, message: "Erro ao criar fornecedor", error: insertErr.message });
                }
                const newId = this.lastID;

                const afterLink = () => {
                    _replacePaymentTerms(newId, payment_terms, () => {
                        _replaceProducts(newId, products, () => {
                            res.status(201).json({ success: true, message: "Fornecedor criado com sucesso", id: newId });
                        });
                    });
                };

                if (location_id) {
                    db.run(
                        `INSERT OR IGNORE INTO supplier_locations (supplier_id, location_id) VALUES (?, ?)`,
                        [newId, location_id],
                        afterLink
                    );
                } else {
                    afterLink();
                }
            }
        );
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
 * PUT /suppliers/:id/products - Substitui apenas a lista de produtos negociados.
 */
router.put("/:id/products", (req, res) => {
    const { id } = req.params;
    const { products } = req.body;

    db.get(`SELECT id FROM suppliers WHERE id = ?`, [id], (err, supplier) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao verificar fornecedor", error: err.message });
        if (!supplier) return res.status(404).json({ success: false, message: "Fornecedor não encontrado" });

        _replaceProducts(id, products, (errProducts) => {
            if (errProducts) return res.status(500).json({ success: false, message: "Erro ao atualizar produtos", error: errProducts.message });
            res.json({ success: true, message: "Produtos atualizados com sucesso" });
        });
    });
});

/**
 * PUT /suppliers/:id/payment-terms - Substitui apenas os prazos de pagamento.
 */
router.put("/:id/payment-terms", (req, res) => {
    const { id } = req.params;
    const { payment_terms } = req.body;

    db.get(`SELECT id FROM suppliers WHERE id = ?`, [id], (err, supplier) => {
        if (err) return res.status(500).json({ success: false, message: "Erro ao verificar fornecedor", error: err.message });
        if (!supplier) return res.status(404).json({ success: false, message: "Fornecedor não encontrado" });

        _replacePaymentTerms(id, payment_terms, (errTerms) => {
            if (errTerms) return res.status(500).json({ success: false, message: "Erro ao atualizar prazos", error: errTerms.message });
            res.json({ success: true, message: "Prazos atualizados com sucesso" });
        });
    });
});

/**
 * PUT /suppliers/:id - Atualiza um fornecedor (dados, prazos e produtos).
 */
router.put("/:id", (req, res) => {
    const { id } = req.params;
    const {
        name, business_name, tax_id, address, district, zip, city, state,
        phone, state_registration, payment_method,
        payment_terms, products,
    } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: "Nome do fornecedor é obrigatório" });
    }

    db.run(
        `UPDATE suppliers SET
            name = ?,
            business_name = ?,
            tax_id = ?,
            address = ?,
            district = ?,
            zip = ?,
            city = ?,
            state = ?,
            phone = ?,
            state_registration = ?,
            payment_method = ?
         WHERE id = ?`,
        [
            name.trim(),
            business_name || null, tax_id || null,
            address || null, district || null, zip || null,
            city || null, state || null,
            phone || null, state_registration || null, payment_method || null,
            id,
        ],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ success: false, message: "Este fornecedor já existe" });
                }
                return res.status(500).json({ success: false, message: "Erro ao atualizar fornecedor", error: err.message });
            }

            _replacePaymentTerms(id, payment_terms, () => {
                _replaceProducts(id, products, () => {
                    res.json({ success: true, message: "Fornecedor atualizado com sucesso", updated: this.changes });
                });
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
        db.run(`DELETE FROM supplier_payment_terms WHERE supplier_id = ?`, [id], () => {
            db.run(`DELETE FROM supplier_products WHERE supplier_id = ?`, [id], () => {
                db.run(
                    `DELETE FROM suppliers WHERE id = ?`,
                    [id],
                    function (err) {
                        if (err) {
                            return res.status(500).json({ success: false, message: "Erro ao deletar fornecedor", error: err.message });
                        }
                        res.json({ success: true, message: "Fornecedor deletado com sucesso", deleted: this.changes });
                    }
                );
            });
        });
    });
});

module.exports = router;
