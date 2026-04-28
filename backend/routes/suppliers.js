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
    }
});

// ── Migrations ────────────────────────────────────────────────────────────

db.run(`ALTER TABLE suppliers ADD COLUMN cnpj TEXT`, () => {});
db.run(`ALTER TABLE suppliers ADD COLUMN address TEXT`, () => {});
db.run(`ALTER TABLE suppliers ADD COLUMN address_number TEXT`, () => {});
db.run(`ALTER TABLE suppliers ADD COLUMN neighborhood TEXT`, () => {});
db.run(`ALTER TABLE suppliers ADD COLUMN cep TEXT`, () => {});
db.run(`ALTER TABLE suppliers ADD COLUMN city TEXT`, () => {});
db.run(`ALTER TABLE suppliers ADD COLUMN uf TEXT`, () => {});
db.run(`ALTER TABLE suppliers ADD COLUMN state_registration TEXT`, () => {});
db.run(`ALTER TABLE suppliers ADD COLUMN phone TEXT`, () => {});

db.run(`
    CREATE TABLE IF NOT EXISTS supplier_prices (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id  INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        price_type   TEXT NOT NULL DEFAULT 'material',
        material_name TEXT,
        service_id   INTEGER REFERENCES services(id) ON DELETE CASCADE,
        unit_price   REAL NOT NULL DEFAULT 0
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela supplier_prices:", err.message);
});

// ── GET Endpoints ─────────────────────────────────────────────────────────

/**
 * GET /suppliers - Lista todos os fornecedores
 */
router.get("/", (req, res) => {
    db.all("SELECT * FROM suppliers ORDER BY name", [], (err, rows) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Erro ao carregar fornecedores",
                error: err.message
            });
        }
        res.json(rows || []);
    });
});

/**
 * GET /suppliers/:id/prices - Lista cotações de um fornecedor (materiais + serviços)
 */
router.get("/:id/prices", (req, res) => {
    db.all(
        `SELECT sp.*, s.name AS service_name, s.service_type
         FROM supplier_prices sp
         LEFT JOIN services s ON sp.service_id = s.id
         WHERE sp.supplier_id = ?
         ORDER BY sp.price_type, COALESCE(sp.material_name, s.name)`,
        [req.params.id],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar cotações.", error: err.message });
            res.json(rows || []);
        }
    );
});

// ── POST Endpoints ────────────────────────────────────────────────────────

/**
 * POST /suppliers - Cria um novo fornecedor
 */
router.post("/", (req, res) => {
    const { name, cnpj, address, address_number, neighborhood, cep, city, uf, state_registration, phone } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Nome do fornecedor é obrigatório"
        });
    }

    db.run(
        `INSERT INTO suppliers (name, cnpj, address, address_number, neighborhood, cep, city, uf, state_registration, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name.trim(), cnpj || null, address || null, address_number || null, neighborhood || null, cep || null, city || null, uf || null, state_registration || null, phone || null],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({
                        success: false,
                        message: "Este fornecedor já existe"
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: "Erro ao criar fornecedor",
                    error: err.message
                });
            }
            res.status(201).json({
                success: true,
                message: "Fornecedor criado com sucesso",
                id: this.lastID
            });
        }
    );
});

/**
 * POST /suppliers/:id/prices - Cria ou atualiza (upsert) uma cotação do fornecedor
 */
router.post("/:id/prices", (req, res) => {
    const { price_type, material_name, service_id, unit_price } = req.body;
    const supplier_id = req.params.id;

    if (!["material", "service"].includes(price_type)) {
        return res.status(400).json({ success: false, message: "price_type inválido. Use 'material' ou 'service'." });
    }
    if (unit_price == null || isNaN(Number(unit_price))) {
        return res.status(400).json({ success: false, message: "Valor é obrigatório." });
    }

    // Upsert: atualiza se já existe, senão insere
    if (price_type === "material") {
        if (!material_name || !material_name.trim()) return res.status(400).json({ success: false, message: "Nome do material é obrigatório." });
        db.run(
            `INSERT INTO supplier_prices (supplier_id, price_type, material_name, unit_price)
             VALUES (?, 'material', ?, ?)
             ON CONFLICT DO NOTHING`,
            [supplier_id, material_name.trim(), Number(unit_price)],
            function (err) {
                if (err) return res.status(500).json({ success: false, message: "Erro ao salvar cotação.", error: err.message });
                if (this.changes === 0) {
                    db.run(
                        `UPDATE supplier_prices SET unit_price = ? WHERE supplier_id = ? AND price_type = 'material' AND material_name = ?`,
                        [Number(unit_price), supplier_id, material_name.trim()],
                        function (err2) {
                            if (err2) return res.status(500).json({ success: false, message: "Erro ao atualizar cotação.", error: err2.message });
                            res.json({ success: true, message: "Cotação atualizada.", id: null });
                        }
                    );
                } else {
                    res.status(201).json({ success: true, message: "Cotação criada.", id: this.lastID });
                }
            }
        );
    } else {
        if (!service_id) return res.status(400).json({ success: false, message: "ID do serviço é obrigatório." });
        db.run(
            `INSERT INTO supplier_prices (supplier_id, price_type, service_id, unit_price)
             VALUES (?, 'service', ?, ?)
             ON CONFLICT DO NOTHING`,
            [supplier_id, service_id, Number(unit_price)],
            function (err) {
                if (err) return res.status(500).json({ success: false, message: "Erro ao salvar cotação.", error: err.message });
                if (this.changes === 0) {
                    db.run(
                        `UPDATE supplier_prices SET unit_price = ? WHERE supplier_id = ? AND price_type = 'service' AND service_id = ?`,
                        [Number(unit_price), supplier_id, service_id],
                        function (err2) {
                            if (err2) return res.status(500).json({ success: false, message: "Erro ao atualizar cotação.", error: err2.message });
                            res.json({ success: true, message: "Cotação atualizada.", id: null });
                        }
                    );
                } else {
                    res.status(201).json({ success: true, message: "Cotação criada.", id: this.lastID });
                }
            }
        );
    }
});

// ── PUT Endpoints ─────────────────────────────────────────────────────────

/**
 * PUT /suppliers/:id - Atualiza um fornecedor
 */
router.put("/:id", (req, res) => {
    const { id } = req.params;
    const { name, cnpj, address, address_number, neighborhood, cep, city, uf, state_registration, phone } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Nome do fornecedor é obrigatório"
        });
    }

    db.run(
        `UPDATE suppliers SET name = ?, cnpj = ?, address = ?, address_number = ?, neighborhood = ?, cep = ?, city = ?, uf = ?, state_registration = ?, phone = ? WHERE id = ?`,
        [name.trim(), cnpj || null, address || null, address_number || null, neighborhood || null, cep || null, city || null, uf || null, state_registration || null, phone || null, id],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({
                        success: false,
                        message: "Este fornecedor já existe"
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: "Erro ao atualizar fornecedor",
                    error: err.message
                });
            }
            res.json({
                success: true,
                message: "Fornecedor atualizado com sucesso",
                updated: this.changes
            });
        }
    );
});

// ── DELETE Endpoints ──────────────────────────────────────────────────────

/**
 * DELETE /suppliers/:id - Deleta um fornecedor
 */
router.delete("/:id", (req, res) => {
    const { id } = req.params;

    db.run(
        `DELETE FROM suppliers WHERE id = ?`,
        [id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Erro ao deletar fornecedor",
                    error: err.message
                });
            }
            res.json({
                success: true,
                message: "Fornecedor deletado com sucesso",
                deleted: this.changes
            });
        }
    );
});

/**
 * DELETE /suppliers/prices/:priceId - Deleta uma cotação
 */
router.delete("/prices/:priceId", (req, res) => {
    db.run(`DELETE FROM supplier_prices WHERE id = ?`, [req.params.priceId], function (err) {
        if (err) return res.status(500).json({ success: false, message: "Erro ao deletar cotação.", error: err.message });
        res.json({ success: true, message: "Cotação removida.", deleted: this.changes });
    });
});

module.exports = router;
