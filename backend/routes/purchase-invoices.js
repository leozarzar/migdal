/**
 * @module routes/purchase-invoices
 * @description Purchase Invoice (Fatura de Compras) CRUD routes.
 * Manages NCI documents linking receipts and generating printable HTML.
 */

const router = require("express").Router();
const db = require("../db");

// ── Table Setup ──────────────────────────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS purchase_invoices (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        document_type    TEXT NOT NULL DEFAULT 'NCI',
        number           TEXT NOT NULL,
        date_emission    TEXT NOT NULL,
        date_receipt     TEXT,
        supplier_id      INTEGER NOT NULL REFERENCES suppliers(id),
        payment_days     INTEGER NOT NULL DEFAULT 0,
        due_date         TEXT,
        total_amount     REAL NOT NULL DEFAULT 0,
        transporter_name TEXT,
        driver_name      TEXT,
        plate            TEXT,
        created_at       TEXT DEFAULT (datetime('now'))
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela purchase_invoices:", err.message);
});

db.run(`ALTER TABLE purchase_invoices ADD COLUMN freight_amount REAL NOT NULL DEFAULT 0`, () => {});

db.run(`
    CREATE TABLE IF NOT EXISTS purchase_invoice_receipts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
        receipt_id INTEGER NOT NULL REFERENCES receipts(id)
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela purchase_invoice_receipts:", err.message);
});

db.run(`
    CREATE TABLE IF NOT EXISTS purchase_invoice_items (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id   INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
        item_number  INTEGER NOT NULL,
        description  TEXT NOT NULL,
        unit_measure TEXT NOT NULL DEFAULT 'KG',
        quantity     REAL NOT NULL DEFAULT 0,
        unit_price   REAL NOT NULL DEFAULT 0,
        total_value  REAL NOT NULL DEFAULT 0
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela purchase_invoice_items:", err.message);
});

db.run(`
    CREATE TABLE IF NOT EXISTS purchase_invoice_installments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
        seq        INTEGER NOT NULL,
        days       INTEGER NOT NULL DEFAULT 0,
        due_date   TEXT,
        amount     REAL NOT NULL DEFAULT 0
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela purchase_invoice_installments:", err.message);
});

// ── Helpers ───────────────────────────────────────────────────────────────

function _esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

function _fmtCurrency(val) {
    return Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── GET ───────────────────────────────────────────────────────────────────

/**
 * GET /purchase-invoices - Lista todas as faturas
 */
router.get("/", (req, res) => {
    db.all(
        `SELECT pi.*, s.name AS supplier_name
         FROM purchase_invoices pi
         JOIN suppliers s ON pi.supplier_id = s.id
         ORDER BY pi.date_emission DESC, pi.id DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao carregar faturas.", error: err.message });
            res.json(rows || []);
        }
    );
});

/**
 * GET /purchase-invoices/:id - Detalhes de uma fatura (com itens e recebimentos vinculados)
 */
router.get("/:id", (req, res) => {
    const id = req.params.id;
    db.get(
        `SELECT pi.*, s.name AS supplier_name, s.business_name AS supplier_business_name,
                s.tax_id AS cnpj, s.address AS address, NULL AS address_number,
                s.district AS neighborhood, s.zip AS cep, s.city AS city, s.state AS uf,
                s.state_registration AS state_registration, s.phone AS phone
         FROM purchase_invoices pi
         JOIN suppliers s ON pi.supplier_id = s.id
         WHERE pi.id = ?`,
        [id],
        (err, invoice) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao buscar fatura.", error: err.message });
            if (!invoice) return res.status(404).json({ success: false, message: "Fatura não encontrada." });

            db.all(`SELECT * FROM purchase_invoice_items WHERE invoice_id = ? ORDER BY item_number`, [id], (err2, items) => {
                if (err2) return res.status(500).json({ success: false, message: "Erro ao buscar itens.", error: err2.message });

                db.all(`SELECT receipt_id FROM purchase_invoice_receipts WHERE invoice_id = ?`, [id], (err3, receipts) => {
                    if (err3) return res.status(500).json({ success: false, message: "Erro ao buscar recebimentos.", error: err3.message });

                    db.all(`SELECT seq, days, due_date, amount FROM purchase_invoice_installments WHERE invoice_id = ? ORDER BY seq`, [id], (err4, installments) => {
                        if (err4) return res.status(500).json({ success: false, message: "Erro ao buscar parcelas.", error: err4.message });
                        res.json({
                            ...invoice,
                            items: items || [],
                            receipt_ids: (receipts || []).map(r => r.receipt_id),
                            installments: installments || [],
                        });
                    });
                });
            });
        }
    );
});

/**
 * GET /purchase-invoices/available-receipts/:supplierId - Lista todos os recebimentos do fornecedor.
 * Nota: recebimentos já vinculados a outras faturas continuam aparecendo (por escolha de UX).
 */
router.get("/available-receipts/:supplierId", (req, res) => {
    db.all(
        `SELECT r.id, r.code, r.nature, r.date,
                COALESCE(SUM(su.weight), 0) AS total_weight
         FROM receipts r
         LEFT JOIN stock_units su ON su.receipt_id = r.id
         WHERE r.supplier_id = ?
         GROUP BY r.id
         ORDER BY r.date DESC, r.id DESC`,
        [req.params.supplierId],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "Erro ao buscar recebimentos.", error: err.message });
            res.json(rows || []);
        }
    );
});

// ── POST ──────────────────────────────────────────────────────────────────

/**
 * POST /purchase-invoices - Cria uma nova fatura de compras
 * Body: { number, date_emission, date_receipt, supplier_id, payment_days, due_date,
 *         transporter_name, driver_name, plate, receipt_ids[], items[] }
 */
router.post("/", (req, res) => {
    const { number, date_emission, date_receipt, supplier_id, payment_days, due_date,
            transporter_name, driver_name, plate, freight_amount, receipt_ids, items, installments } = req.body;

    if (!number || !date_emission || !supplier_id) {
        return res.status(400).json({ success: false, message: "Número, data de emissão e fornecedor são obrigatórios." });
    }
    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: "A fatura precisa ter ao menos um item." });
    }

    const freight = Number(freight_amount || 0);
    const total_amount = items.reduce((sum, item) => sum + Number(item.total_value || 0), 0) + freight;

    db.run(
        `INSERT INTO purchase_invoices (number, date_emission, date_receipt, supplier_id, payment_days, due_date, total_amount, transporter_name, driver_name, plate, freight_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [number, date_emission, date_receipt || null, supplier_id, payment_days || 0, due_date || null,
         total_amount, transporter_name || null, driver_name || null, plate || null, freight],
        function (err) {
            if (err) return res.status(500).json({ success: false, message: "Erro ao criar fatura.", error: err.message });
            const invoice_id = this.lastID;

            // Insert receipt links
            const receiptList = Array.isArray(receipt_ids) ? receipt_ids : [];
            let receiptsDone = 0;
            const finalize = () => {
                const list = Array.isArray(installments) ? installments : [];
                if (list.length === 0) {
                    return res.status(201).json({ success: true, message: "Fatura criada com sucesso.", id: invoice_id });
                }
                let done = 0;
                list.forEach((inst, idx) => {
                    db.run(
                        `INSERT INTO purchase_invoice_installments (invoice_id, seq, days, due_date, amount)
                         VALUES (?, ?, ?, ?, ?)`,
                        [invoice_id, idx + 1, Number(inst.days || 0), inst.due_date || null, Number(inst.amount || 0)],
                        (errI) => {
                            if (errI) console.error("Erro ao inserir parcela:", errI.message);
                            done++;
                            if (done === list.length) {
                                res.status(201).json({ success: true, message: "Fatura criada com sucesso.", id: invoice_id });
                            }
                        }
                    );
                });
            };

            const afterReceipts = () => {
                // Insert items
                let itemsDone = 0;
                items.forEach((item, idx) => {
                    db.run(
                        `INSERT INTO purchase_invoice_items (invoice_id, item_number, description, unit_measure, quantity, unit_price, total_value)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [invoice_id, idx + 1, item.description, item.unit_measure || 'KG',
                         Number(item.quantity || 0), Number(item.unit_price || 0), Number(item.total_value || 0)],
                        (err2) => {
                            if (err2) console.error("Erro ao inserir item:", err2.message);
                            itemsDone++;
                            if (itemsDone === items.length) finalize();
                        }
                    );
                });
            };

            if (receiptList.length === 0) return afterReceipts();
            receiptList.forEach(rid => {
                db.run(
                    `INSERT INTO purchase_invoice_receipts (invoice_id, receipt_id) VALUES (?, ?)`,
                    [invoice_id, rid],
                    () => {
                        receiptsDone++;
                        if (receiptsDone === receiptList.length) afterReceipts();
                    }
                );
            });
        }
    );
});

// ── PUT ───────────────────────────────────────────────────────────────────

/**
 * PUT /purchase-invoices/:id - Atualiza uma fatura existente (substitui itens, recebimentos e parcelas)
 */
router.put("/:id", (req, res) => {
    const id = Number(req.params.id);
    const { number, date_emission, date_receipt, supplier_id, payment_days, due_date,
            transporter_name, driver_name, plate, freight_amount, receipt_ids, items, installments } = req.body;

    if (!number || !date_emission || !supplier_id) {
        return res.status(400).json({ success: false, message: "Número, data de emissão e fornecedor são obrigatórios." });
    }
    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: "A fatura precisa ter ao menos um item." });
    }

    const freight = Number(freight_amount || 0);
    const total_amount = items.reduce((sum, item) => sum + Number(item.total_value || 0), 0) + freight;

    db.run(
        `UPDATE purchase_invoices
         SET number = ?, date_emission = ?, date_receipt = ?, supplier_id = ?,
             payment_days = ?, due_date = ?, total_amount = ?,
             transporter_name = ?, driver_name = ?, plate = ?, freight_amount = ?
         WHERE id = ?`,
        [number, date_emission, date_receipt || null, supplier_id, payment_days || 0, due_date || null,
         total_amount, transporter_name || null, driver_name || null, plate || null, freight, id],
        function (errU) {
            if (errU) return res.status(500).json({ success: false, message: "Erro ao atualizar fatura.", error: errU.message });
            if (this.changes === 0) return res.status(404).json({ success: false, message: "Fatura não encontrada." });

            db.serialize(() => {
                db.run(`DELETE FROM purchase_invoice_items WHERE invoice_id = ?`, [id]);
                db.run(`DELETE FROM purchase_invoice_receipts WHERE invoice_id = ?`, [id]);
                db.run(`DELETE FROM purchase_invoice_installments WHERE invoice_id = ?`, [id], (errD) => {
                    if (errD) return res.status(500).json({ success: false, message: "Erro ao limpar dados antigos.", error: errD.message });

                    const insertItems = (cb) => {
                        let done = 0;
                        items.forEach((item, idx) => {
                            db.run(
                                `INSERT INTO purchase_invoice_items (invoice_id, item_number, description, unit_measure, quantity, unit_price, total_value)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                [id, idx + 1, item.description, item.unit_measure || 'KG',
                                 Number(item.quantity || 0), Number(item.unit_price || 0), Number(item.total_value || 0)],
                                () => { if (++done === items.length) cb(); }
                            );
                        });
                    };

                    const insertReceipts = (cb) => {
                        const list = Array.isArray(receipt_ids) ? receipt_ids : [];
                        if (list.length === 0) return cb();
                        let done = 0;
                        list.forEach(rid => {
                            db.run(
                                `INSERT INTO purchase_invoice_receipts (invoice_id, receipt_id) VALUES (?, ?)`,
                                [id, rid],
                                () => { if (++done === list.length) cb(); }
                            );
                        });
                    };

                    const insertInstallments = (cb) => {
                        const list = Array.isArray(installments) ? installments : [];
                        if (list.length === 0) return cb();
                        let done = 0;
                        list.forEach((inst, idx) => {
                            db.run(
                                `INSERT INTO purchase_invoice_installments (invoice_id, seq, days, due_date, amount)
                                 VALUES (?, ?, ?, ?, ?)`,
                                [id, idx + 1, Number(inst.days || 0), inst.due_date || null, Number(inst.amount || 0)],
                                () => { if (++done === list.length) cb(); }
                            );
                        });
                    };

                    insertItems(() => insertReceipts(() => insertInstallments(() => {
                        res.json({ success: true, message: "Fatura atualizada.", id });
                    })));
                });
            });
        }
    );
});

// ── DELETE ────────────────────────────────────────────────────────────────

/**
 * DELETE /purchase-invoices/:id - Deleta uma fatura (cascade em itens e recebimentos)
 */
router.delete("/:id", (req, res) => {
    db.run(`DELETE FROM purchase_invoices WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ success: false, message: "Erro ao deletar fatura.", error: err.message });
        res.json({ success: true, message: "Fatura deletada.", deleted: this.changes });
    });
});

// ── PRINT ─────────────────────────────────────────────────────────────────

/**
 * GET /purchase-invoices/print/:id - Retorna HTML completo da fatura para impressão
 */
router.get("/print/:id", (req, res) => {
    const id = req.params.id;
    const layout = req.query.layout || 'padrao';
    const uppercase = req.query.uppercase === '1';
    db.get(
        `SELECT pi.*, s.name AS supplier_name, s.business_name AS supplier_business_name,
                s.tax_id AS cnpj, s.address AS address, NULL AS address_number,
                s.district AS neighborhood, s.zip AS cep, s.city AS city, s.state AS uf,
                s.state_registration AS state_registration, s.phone AS phone
         FROM purchase_invoices pi
         JOIN suppliers s ON pi.supplier_id = s.id
         WHERE pi.id = ?`,
        [id],
        (err, invoice) => {
            if (err || !invoice) return res.status(404).send("<h1>Fatura não encontrada</h1>");

            db.all(`SELECT * FROM purchase_invoice_items WHERE invoice_id = ? ORDER BY item_number`, [id], (err2, items) => {
                if (err2) return res.status(500).send("<h1>Erro ao carregar itens</h1>");

                db.all(`SELECT seq, days, due_date, amount FROM purchase_invoice_installments WHERE invoice_id = ? ORDER BY seq`, [id], (errI, installments) => {
                    if (errI) installments = [];

                    db.get(`SELECT * FROM company LIMIT 1`, [], (err3, company) => {
                        if (err3) company = {};
                        const opts = { uppercase };
                        const insts = installments || [];
                        if (layout === 'limpa') _renderPrintLimpa(res, invoice, items || [], insts, company || {}, opts);
                        else if (layout === 'profissional') _renderPrintProfissional(res, invoice, items || [], insts, company || {}, opts);
                        else _renderPrintPadrao(res, invoice, items || [], insts, company || {}, opts);
                    });
                });
            });
        }
    );
});

function _resolveInstallments(invoice, installments) {
    if (Array.isArray(installments) && installments.length > 0) return installments;
    return [{
        seq: 1,
        days: invoice.payment_days || 0,
        due_date: invoice.due_date || null,
        amount: invoice.total_amount || 0,
    }];
}

function _renderPrintPadrao(res, invoice, items, installments, company, opts = {}) {
                const insts = _resolveInstallments(invoice, installments);
                const itemsTotal = (items || []).reduce((s, i) => s + Number(i.total_value || 0), 0);
                const itemRows = items.map(item => `
                    <tr>
                        <td class="center">${String(item.item_number).padStart(2, '0')}</td>
                        <td>${_esc(item.description)}</td>
                        <td class="center">${_esc(item.unit_measure)}</td>
                        <td class="right">${_fmtCurrency(item.quantity)}</td>
                        <td class="right">${_fmtCurrency(item.unit_price)}</td>
                        <td class="right">${_fmtCurrency(item.total_value)}</td>
                    </tr>`).join('');

                // Blank rows to fill up to 15 lines
                const blankRows = Math.max(0, 15 - (items || []).length);
                const emptyRows = Array.from({ length: blankRows }, (_, i) => `
                    <tr>
                        <td class="center">${String((items || []).length + i + 1).padStart(2, '0')}</td>
                        <td></td><td></td><td></td><td></td>
                        <td class="right">-</td>
                    </tr>`).join('');

                const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${_esc(invoice.document_type)} Nº ${_esc(invoice.number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #000; padding: 10mm; }
  h1 { font-size: 13px; }
  h2 { font-size: 11px; }
  .page { max-width: 210mm; margin: 0 auto; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; border: 1px solid #000; padding: 6px; margin-bottom: 4px; }
  .header-top .receipt-info { font-size: 9px; }
  .doc-header { display: flex; border: 1px solid #000; margin-bottom: 4px; height: 90px; }
  .doc-header .company { flex: 1; padding: 6px; border-right: 1px solid #000; }
  .doc-header .nci-info { width: 180px; padding: 6px; border-right: 1px solid #000; text-align: center; }
  .doc-header .logo-area { flex: 1; padding: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .section { border: 1px solid #000; margin-bottom: 4px; }
  .section-title { background: #f0f0f0; font-weight: bold; padding: 3px 6px; border-bottom: 1px solid #000; font-size: 9px; }
  .section-body { padding: 4px 6px; }
  .fields-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 2px; }
  .field { display: flex; flex-direction: column; }
  .field label { font-size: 8px; color: #555; }
  .field span { font-size: 10px; border-bottom: 1px solid #ccc; min-width: 80px; padding-bottom: 1px; }
  .field.wide span { min-width: 200px; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th { background: #f0f0f0; border: 1px solid #000; padding: 3px 4px; text-align: left; }
  td { border: 1px solid #000; padding: 2px 4px; height: 16px; }
  .center { text-align: center; }
  .right { text-align: right; }
  .total-row td { font-weight: bold; background: #f9f9f9; }
  .fatura-table { width: 100%; border-collapse: collapse; font-size: 9px; }
  .fatura-table th, .fatura-table td { border: 1px solid #000; padding: 3px 4px; }
  .additional { border: 1px solid #000; padding: 6px; margin-bottom: 4px; font-size: 9px; }
  .additional .title { font-weight: bold; border-bottom: 1px solid #ccc; margin-bottom: 4px; padding-bottom: 2px; font-size: 9px; }
  .remetente-layout { display: flex; align-items: stretch; }
  .remetente-fields { flex: 1; padding: 4px 6px; }
  .dates-card { width: 130px; border-left: 1px solid #000; padding: 6px; display: flex; flex-direction: column; gap: 10px; justify-content: center; }
  @media print {
    body { padding: 0; }
    .page { max-width: 100%; }
    button.no-print { display: none; }
  }
  body.uc { text-transform: uppercase; }
</style>
</head>
<body${opts.uppercase ? ' class="uc"' : ''}>
<div class="page">

  <!-- Topo: recebimento -->
  <div class="header-top">
    <div class="receipt-info">
      <div>RECEBI OS PRODUTOS CONSTANTES NA NCI INDICADA</div>
      <div style="display:flex;gap:20px;margin-top:4px;">
        <div><div style="font-size:8px;color:#555">DATA DE RECEBIMENTO</div><div style="font-size:14px;font-weight:bold">${_esc(_fmtDate(invoice.date_receipt || invoice.date_emission))}</div></div>
        <div><div style="font-size:8px;color:#555">IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</div><div style="height:20px;width:200px;border-bottom:1px solid #000;"></div></div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:8px">NCI</div>
      <div style="font-size:13px;font-weight:bold">Nº ${_esc(invoice.number)}</div>
    </div>
  </div>

  <!-- Cabeçalho NCI -->
  <div class="doc-header">
    <div class="company">
      <div style="font-weight:bold;font-size:11px">${_esc(company.name || '')}</div>
      ${(company.cnpj || company.ie) ? `<div style="margin-top:2px;font-size:9px">${company.cnpj ? 'CNPJ: ' + _esc(company.cnpj) : ''}${company.cnpj && company.ie ? ' – ' : ''}${company.ie ? 'IE: ' + _esc(company.ie) : ''}</div>` : ''}
      ${company.address ? `<div style="margin-top:2px;font-size:9px">${_esc(company.address)}${company.neighborhood ? ' – ' + _esc(company.neighborhood) : ''}</div>` : ''}
      ${(company.city || company.state) ? `<div style="font-size:9px">${[company.city, company.state].filter(Boolean).map(_esc).join(' – ')}</div>` : ''}
      ${(company.cep || company.phone) ? `<div style="font-size:9px">${company.cep ? 'CEP: ' + _esc(company.cep) : ''}${company.cep && company.phone ? ' – ' : ''}${company.phone ? 'FONE: ' + _esc(company.phone) : ''}</div>` : ''}
      ${company.email ? `<div style="font-size:9px">${_esc(company.email)}</div>` : ''}
    </div>
    <div class="nci-info" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div style="font-weight:bold">NCI</div>
      <div>NOTA DE CONTROLE INTERNA</div>
      <div style="font-weight:bold;font-size:12px">Nº ${_esc(invoice.number)}</div>
    </div>
    <div class="logo-area">${company.logo
      ? `<img src="${company.logo}" alt="Logo" style="max-width:100%;max-height:100%;object-fit:contain;">`
      : `<span style="font-size:14px;font-weight:bold;text-align:center;word-break:break-word">${_esc(company.name || '')}</span>`
    }</div>
  </div>

  <!-- Remetente -->
  <div class="section">
    <div class="section-title">REMETENTE/DESTINATÁRIO</div>
    <div class="remetente-layout">
      <div class="remetente-fields">
        <div class="fields-row">
          <div class="field wide"><label>NOME</label><span>${_esc(invoice.supplier_name)}</span></div>
          ${invoice.supplier_business_name ? `<div class="field wide"><label>NOME EMPRESARIAL</label><span>${_esc(invoice.supplier_business_name)}</span></div>` : ''}
          ${invoice.cnpj ? `<div class="field"><label>CNPJ/CPF</label><span>${_esc(invoice.cnpj)}</span></div>` : ''}
        </div>
        ${(invoice.address || invoice.neighborhood || invoice.cep) ? `
        <div class="fields-row">
          ${invoice.address ? `<div class="field wide"><label>ENDEREÇO</label><span>${_esc(invoice.address)}${invoice.address_number ? ', ' + _esc(invoice.address_number) : ''}</span></div>` : ''}
          ${invoice.neighborhood ? `<div class="field"><label>BAIRRO/DISTRITO</label><span>${_esc(invoice.neighborhood)}</span></div>` : ''}
          ${invoice.cep ? `<div class="field"><label>CEP</label><span>${_esc(invoice.cep)}</span></div>` : ''}
        </div>` : ''}
        ${(invoice.city || invoice.uf || invoice.state_registration || invoice.phone) ? `
        <div class="fields-row">
          ${invoice.city ? `<div class="field"><label>MUNICÍPIO</label><span>${_esc(invoice.city)}</span></div>` : ''}
          ${invoice.uf ? `<div class="field"><label>UF</label><span>${_esc(invoice.uf)}</span></div>` : ''}
          ${invoice.state_registration ? `<div class="field wide"><label>INSCRIÇÃO ESTADUAL</label><span>${_esc(invoice.state_registration)}</span></div>` : ''}
          ${invoice.phone ? `<div class="field"><label>FONE/FAX</label><span>${_esc(invoice.phone)}</span></div>` : ''}
        </div>` : ''}
      </div>
      <div class="dates-card">
        <div class="field"><label>DATA DA EMISSÃO</label><span>${_esc(_fmtDate(invoice.date_emission))}</span></div>
        <div class="field"><label>DATA DE ENTRADA</label><span>${_esc(_fmtDate(invoice.date_receipt || invoice.date_emission))}</span></div>
      </div>
    </div>
  </div>

  <!-- Fatura -->
  <div class="section">
    <div class="section-title">FATURA</div>
    <div class="section-body">
      <table class="fatura-table">
        <thead><tr><th>PARCELA</th><th>DATA VCTO.</th><th>VALOR</th><th>PARCELA</th><th>DATA VCTO.</th><th>VALOR</th><th>PARCELA</th><th>DATA VCTO.</th><th>VALOR</th></tr></thead>
        <tbody>
          ${(() => {
            const totalRows = Math.max(2, Math.ceil(insts.length / 3));
            const rows = [];
            for (let r = 0; r < totalRows; r++) {
                const cells = [];
                for (let c = 0; c < 3; c++) {
                    const inst = insts[r * 3 + c];
                    if (inst) {
                        cells.push(`<td class="center">${inst.seq || (r * 3 + c + 1)}</td><td class="center">${_esc(_fmtDate(inst.due_date))}</td><td class="right">${_fmtCurrency(inst.amount)}</td>`);
                    } else {
                        cells.push(`<td></td><td></td><td></td>`);
                    }
                }
                rows.push(`<tr>${cells.join('')}</tr>`);
            }
            return rows.join('');
          })()}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Transporte -->
  ${(invoice.transporter_name || invoice.driver_name || invoice.plate || Number(invoice.freight_amount || 0) > 0) ? `
  <div class="section">
    <div class="section-title">TRANSPORTE</div>
    <div class="section-body">
      <div class="fields-row">
        ${invoice.transporter_name ? `<div class="field wide"><label>NOME EMPRESARIAL</label><span>${_esc(invoice.transporter_name)}</span></div>` : ''}
        ${invoice.driver_name ? `<div class="field wide"><label>MOTORISTA</label><span>${_esc(invoice.driver_name)}</span></div>` : ''}
        ${invoice.plate ? `<div class="field"><label>PLACA</label><span>${_esc(invoice.plate)}</span></div>` : ''}
        ${Number(invoice.freight_amount || 0) > 0 ? `<div class="field"><label>VALOR DO FRETE</label><span>R$ ${_fmtCurrency(invoice.freight_amount)}</span></div>` : ''}
      </div>
    </div>
  </div>` : ''}

  <!-- Itens -->
  <div class="section">
    <div class="section-title">DADOS DOS PRODUTOS</div>
    <div class="section-body" style="padding:0">
      <table>
        <thead>
          <tr>
            <th class="center" style="width:36px">ITEM</th>
            <th>DESCRIÇÃO DO PRODUTO</th>
            <th class="center" style="width:40px">UNID.</th>
            <th class="right" style="width:70px">QUANTIDADE</th>
            <th class="right" style="width:70px">PREÇO UNIT.</th>
            <th class="right" style="width:80px">VALOR TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          ${emptyRows}
          <tr class="total-row">
            <td colspan="3" class="center">TOTAL</td>
            <td class="right">${_fmtCurrency((items || []).reduce((s, i) => s + Number(i.quantity || 0), 0))}</td>
            <td></td>
            <td class="right">${_fmtCurrency(itemsTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Dados Adicionais -->
  <div class="additional">
    <div class="title">DADOS ADICIONAIS</div>
    <div>INFORMAÇÕES COMPLEMENTARES</div>
    <div style="margin-top:4px">PRAZO PARA PAGAMENTO(S): ${_esc(insts.map(i => i.days).join('/'))} DIAS</div>
  </div>

</div>
<script>window.print();</script>
</body>
</html>`;

                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.send(html);
}

// ── Layout: Limpa ──────────────────────────────────────────────────────────

function _renderPrintLimpa(res, invoice, items, installments, company, opts = {}) {
    const insts = _resolveInstallments(invoice, installments);
    const itemsTotal = (items || []).reduce((s, i) => s + Number(i.total_value || 0), 0);
    const itemRows = items.map(item => `
        <tr>
            <td class="center">${String(item.item_number).padStart(2, '0')}</td>
            <td>${_esc(item.description)}</td>
            <td class="center">${_esc(item.unit_measure)}</td>
            <td class="right">${_fmtCurrency(item.quantity)}</td>
            <td class="right">${_fmtCurrency(item.unit_price)}</td>
            <td class="right">${_fmtCurrency(item.total_value)}</td>
        </tr>`).join('');

    const totalQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>NCI Nº ${_esc(invoice.number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, Arial, sans-serif; font-size: 10px; color: #111; background: #fff; padding: 12mm; }
  .page { max-width: 210mm; margin: 0 auto; }

  .doc-header { display: flex; align-items: center; gap: 16px; padding-bottom: 10px; border-bottom: 1px solid #d1d5db; margin-bottom: 14px; }
  .header-logo { width: 130px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .header-logo img { max-width: 100%; max-height: 72px; object-fit: contain; }
  .header-logo .logo-name { font-size: 14px; font-weight: 700; text-align: center; word-break: break-word; }
  .header-company { flex: 1; }
  .header-company .co-name { font-size: 13px; font-weight: 700; margin-bottom: 3px; }
  .header-company .co-meta { font-size: 8.5px; color: #6b7280; line-height: 1.65; }
  .header-nci { text-align: right; flex-shrink: 0; }
  .header-nci .nci-eyebrow { font-size: 7.5px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.6px; }
  .header-nci .nci-type { font-size: 11px; font-weight: 700; }
  .header-nci .nci-number { font-size: 22px; font-weight: 700; line-height: 1.1; }

  .section { margin-bottom: 12px; }
  .section-label { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #6b7280; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; margin-bottom: 8px; }

  .supplier-layout { display: flex; gap: 24px; align-items: flex-start; }
  .supplier-info { flex: 1; }
  .supplier-name { font-size: 12px; font-weight: 600; margin-bottom: 3px; }
  .supplier-meta { font-size: 9px; color: #6b7280; line-height: 1.7; }
  .dates-block { display: flex; flex-direction: column; gap: 10px; }
  .date-item .date-label { font-size: 7.5px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; }
  .date-item .date-value { font-size: 11px; font-weight: 600; }

  .transporter-row { display: flex; gap: 24px; }
  .t-item .t-label { font-size: 7.5px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; }
  .t-item .t-value { font-size: 10px; font-weight: 600; }

  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  thead tr { background: #f3f4f6; }
  thead tr th:first-child { border-radius: 4px 0 0 4px; }
  thead tr th:last-child { border-radius: 0 4px 4px 0; }
  th { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; padding: 5px 6px; text-align: left; }
  tbody td { padding: 5px 6px; border-bottom: 1px solid #f0f0f0; }
  tbody tr:last-child td { border-bottom: none; }
  .total-row td { background: #f3f4f6; font-weight: 700; font-size: 10px; padding: 5px 6px; border-top: none !important; border-bottom: none !important; white-space: nowrap; }
  .total-row td:first-child { border-radius: 4px 0 0 4px; }
  .total-row td:last-child { border-radius: 0 4px 4px 0; }
  .center { text-align: center; }
  .right { text-align: right; }

  .payment-row { display: flex; gap: 32px; }
  .pay-item .pay-label { font-size: 7.5px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; }
  .pay-item .pay-value { font-size: 11px; font-weight: 600; }

  .signature-bar { display: flex; gap: 32px; align-items: flex-end; padding-top: 12px; border-top: 1px solid #e5e7eb; margin-top: 16px; }
  .sig-item .sig-label { font-size: 7.5px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 20px; }
  .sig-item .sig-line { border-bottom: 1px solid #111; width: 140px; }
  .sig-item.wide .sig-line { width: 260px; }

  @media print {
    body { padding: 0; }
    .page { max-width: 100%; }
    button.no-print { display: none; }
  }
  body.uc { text-transform: uppercase; }
</style>
</head>
<body${opts.uppercase ? ' class="uc"' : ''}>
<div class="page">

  <!-- Cabeçalho -->
  <div class="doc-header">
    <div class="header-logo">
      ${company.logo
        ? `<img src="${company.logo}" alt="Logo">`
        : `<span class="logo-name">${_esc(company.name || '')}</span>`}
    </div>
    <div class="header-company">
      <div class="co-name">${_esc(company.name || '')}</div>
      <div class="co-meta">
        ${(company.cnpj || company.ie) ? `<div>${company.cnpj ? 'CNPJ: ' + _esc(company.cnpj) : ''}${company.cnpj && company.ie ? '&nbsp;&nbsp;|&nbsp;&nbsp;' : ''}${company.ie ? 'IE: ' + _esc(company.ie) : ''}</div>` : ''}
        ${company.address ? `<div>${_esc(company.address)}${company.neighborhood ? ', ' + _esc(company.neighborhood) : ''}${(company.city || company.state) ? ' – ' + [company.city, company.state].filter(Boolean).map(_esc).join('/') : ''}</div>` : ''}
        ${(company.cep || company.phone) ? `<div>${company.cep ? 'CEP ' + _esc(company.cep) : ''}${company.cep && company.phone ? '&nbsp;&nbsp;|&nbsp;&nbsp;' : ''}${company.phone ? _esc(company.phone) : ''}</div>` : ''}
        ${company.email ? `<div>${_esc(company.email)}</div>` : ''}
      </div>
    </div>
    <div class="header-nci">
      <div class="nci-eyebrow">Nota de Controle Interna</div>
      <div class="nci-type">NCI</div>
      <div class="nci-number">Nº ${_esc(invoice.number)}</div>
    </div>
  </div>

  <!-- Fornecedor -->
  <div class="section">
    <div class="section-label">Fornecedor</div>
    <div class="supplier-layout">
      <div class="supplier-info">
        <div class="supplier-name">${_esc(invoice.supplier_name)}</div>
        <div class="supplier-meta">
          ${invoice.cnpj ? `<div>CNPJ: ${_esc(invoice.cnpj)}</div>` : ''}
          ${invoice.address ? `<div>${_esc(invoice.address)}${invoice.address_number ? ', ' + _esc(invoice.address_number) : ''}${invoice.neighborhood ? ' – ' + _esc(invoice.neighborhood) : ''}</div>` : ''}
          ${(invoice.city || invoice.uf) ? `<div>${[invoice.city, invoice.uf].filter(Boolean).map(_esc).join(' – ')}${invoice.cep ? ' – CEP ' + _esc(invoice.cep) : ''}</div>` : ''}
          ${invoice.state_registration ? `<div>IE: ${_esc(invoice.state_registration)}</div>` : ''}
          ${invoice.phone ? `<div>${_esc(invoice.phone)}</div>` : ''}
        </div>
      </div>
      <div class="dates-block">
        <div class="date-item">
          <div class="date-label">Emissão</div>
          <div class="date-value">${_esc(_fmtDate(invoice.date_emission))}</div>
        </div>
        <div class="date-item">
          <div class="date-label">Entrada</div>
          <div class="date-value">${_esc(_fmtDate(invoice.date_receipt || invoice.date_emission))}</div>
        </div>
      </div>
    </div>
  </div>

  ${(invoice.transporter_name || invoice.driver_name || invoice.plate || Number(invoice.freight_amount || 0) > 0) ? `
  <!-- Transporte -->
  <div class="section">
    <div class="section-label">Transporte</div>
    <div class="transporter-row">
      ${invoice.transporter_name ? `<div class="t-item"><div class="t-label">Empresa</div><div class="t-value">${_esc(invoice.transporter_name)}</div></div>` : ''}
      ${invoice.driver_name ? `<div class="t-item"><div class="t-label">Motorista</div><div class="t-value">${_esc(invoice.driver_name)}</div></div>` : ''}
      ${invoice.plate ? `<div class="t-item"><div class="t-label">Placa</div><div class="t-value">${_esc(invoice.plate)}</div></div>` : ''}
      ${Number(invoice.freight_amount || 0) > 0 ? `<div class="t-item"><div class="t-label">Frete</div><div class="t-value">R$ ${_fmtCurrency(invoice.freight_amount)}</div></div>` : ''}
    </div>
  </div>` : ''}

  <!-- Produtos -->
  <div class="section">
    <div class="section-label">Produtos</div>
    <table>
      <thead>
        <tr>
          <th class="center" style="width:32px">Item</th>
          <th>Descrição</th>
          <th class="center" style="width:38px">Un.</th>
          <th class="right" style="width:72px">Quantidade</th>
          <th class="right" style="width:72px">Preço Unit.</th>
          <th class="right" style="width:82px">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        <tr class="total-row">
          <td colspan="3"></td>
          <td class="right">${_fmtCurrency(totalQty)}</td>
          <td class="right" style="color:#6b7280;font-size:7.5px;font-weight:400;letter-spacing:0.4px">TOTAL</td>
          <td class="right">R$ ${_fmtCurrency(itemsTotal)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Pagamento -->
  <div class="section">
    <div class="section-label">Pagamento (${insts.length} ${insts.length === 1 ? 'parcela' : 'parcelas'})</div>
    <table>
      <thead>
        <tr>
          <th class="center" style="width:60px">Parcela</th>
          <th class="center" style="width:90px">Prazo</th>
          <th class="center" style="width:100px">Vencimento</th>
          <th class="right">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${insts.map(i => `
        <tr>
          <td class="center">${i.seq} / ${insts.length}</td>
          <td class="center">${_esc(String(i.days || 0))} dias</td>
          <td class="center">${_esc(_fmtDate(i.due_date))}</td>
          <td class="right">R$ ${_fmtCurrency(i.amount)}</td>
        </tr>`).join('')}
        <tr class="total-row">
          <td colspan="3" class="right" style="color:#6b7280;font-size:7.5px;font-weight:400;letter-spacing:0.4px">TOTAL</td>
          <td class="right">R$ ${_fmtCurrency(insts.reduce((s, i) => s + Number(i.amount || 0), 0))}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Assinatura -->
  <div class="signature-bar">
    <div class="sig-item">
      <div class="sig-label">Data de recebimento</div>
      <div class="sig-line"></div>
    </div>
    <div class="sig-item wide">
      <div class="sig-label">Identificação e assinatura do recebedor</div>
      <div class="sig-line"></div>
    </div>
  </div>

</div>
<script>window.print();</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
}

// ── Layout: Profissional ───────────────────────────────────────────────────

function _renderPrintProfissional(res, invoice, items, installments, company, opts = {}) {
    const insts = _resolveInstallments(invoice, installments);
    const itemsTotal = (items || []).reduce((s, i) => s + Number(i.total_value || 0), 0);
    const itemRows = items.map(item => `
        <tr>
            <td class="center">${String(item.item_number).padStart(2, '0')}</td>
            <td>${_esc(item.description)}</td>
            <td class="center">${_esc(item.unit_measure)}</td>
            <td class="right">${_fmtCurrency(item.quantity)}</td>
            <td class="right">${_fmtCurrency(item.unit_price)}</td>
            <td class="right">${_fmtCurrency(item.total_value)}</td>
        </tr>`).join('');

    const totalQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>NCI N\u00ba ${_esc(invoice.number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 10px; color: #0f172a; background: #fff; }
  .page { max-width: 210mm; margin: 0 auto; display: flex; flex-direction: column; }

  /* Header */
  .header { padding: 18px 24px 14px; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid #e2e8f0; }
  .header-left { display: flex; align-items: stretch; gap: 16px; }
  .logo-box { width: 120px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .logo-box img { flex: 1; min-height: 0; width: 100%; object-fit: contain; object-position: center; }
  .co-name { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
  .co-meta { font-size: 8px; color: #64748b; line-height: 1.75; }
  .header-right { text-align: right; flex-shrink: 0; }
  .doc-eyebrow { font-size: 7.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 1px; }
  .doc-type { font-size: 10px; font-weight: 700; color: #1e3a5f; }
  .doc-number { font-size: 26px; font-weight: 800; color: #0f172a; line-height: 1.05; margin: 3px 0; }

  /* Content */
  .content { padding: 14px 24px; flex: 1; }

  /* Meta strip */
  .meta-strip { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 16px; overflow: hidden; }
  .meta-item { flex: 1; padding: 8px 12px; border-right: 1px solid #e2e8f0; }
  .meta-item:last-child { border-right: none; }
  .meta-label { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #94a3b8; margin-bottom: 2px; }
  .meta-value { font-size: 10px; font-weight: 600; color: #0f172a; white-space: nowrap; }
  .meta-value.accent { color: #1d4ed8; }

  /* Section */
  .section { margin-bottom: 14px; }
  .section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .section-title { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.9px; color: #1e3a5f; white-space: nowrap; }
  .section-line { flex: 1; height: 1px; background: #e2e8f0; }

  /* Recipient */
  .recipient-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; }
  .recipient-name { font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
  .recipient-meta { font-size: 8.5px; color: #64748b; line-height: 1.7; }

  /* Transporter */
  .transporter-row { display: flex; gap: 10px; }
  .t-chip { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 6px 10px; }
  .chip-label { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 1px; }
  .chip-value { font-size: 10px; font-weight: 600; color: #0f172a; }

  /* Table */
  .table-wrap { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  thead { background: #1e3a5f; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  th { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #cbd5e1; padding: 7px 10px; text-align: left; }
  tbody tr { border-bottom: 1px solid #f1f5f9; }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:nth-child(even) { background: #f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  td { padding: 6px 10px; }
  tfoot tr { background: #f1f5f9; border-top: 1px solid #e2e8f0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  tfoot td { padding: 8px 10px; font-weight: 700; font-size: 10px; white-space: nowrap; }
  .center { text-align: center; }
  .right { text-align: right; }

  /* Payment */
  .payment-grid { display: flex; gap: 10px; }
  .pay-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; flex: 1; }
  .pay-card.highlight { background: #eff6ff; border-color: #bfdbfe; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pay-label { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 3px; }
  .pay-value { font-size: 12px; font-weight: 700; color: #0f172a; white-space: nowrap; }
  .pay-card.highlight .pay-value { color: #1d4ed8; }

  /* Signature */
  .signature-grid { display: flex; gap: 24px; }
  .sig-box { flex: 1; }
  .sig-box.wide { flex: 2; }
  .sig-label { font-size: 7.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 20px; }
  .sig-line { border-bottom: 1px solid #cbd5e1; }

  @media print {
    body { padding: 0; }
    .page { max-width: 100%; }
    button.no-print { display: none; }
  }
  body.uc { text-transform: uppercase; }
</style>
</head>
<body${opts.uppercase ? ' class="uc"' : ''}>
<div class="page">

  <!-- Cabeçalho -->
  <div class="header">
    <div class="header-left">
      <div class="logo-box">
        ${company.logo
          ? `<img src="${company.logo}" alt="Logo">`
          : `<span style="font-size:13px;font-weight:800;color:#1e3a5f;text-align:center;word-break:break-word">${_esc(company.name || '')}</span>`}
      </div>
      <div>
        <div class="co-name">${_esc(company.name || '')}</div>
        <div class="co-meta">
          ${(company.cnpj || company.ie) ? `<div>${company.cnpj ? 'CNPJ: ' + _esc(company.cnpj) : ''}${company.cnpj && company.ie ? '&nbsp;&nbsp;\u2022&nbsp;&nbsp;' : ''}${company.ie ? 'IE: ' + _esc(company.ie) : ''}</div>` : ''}
          ${company.address ? `<div>${_esc(company.address)}${company.neighborhood ? ', ' + _esc(company.neighborhood) : ''}${(company.city || company.state) ? ' \u2013 ' + [company.city, company.state].filter(Boolean).map(_esc).join('/') : ''}</div>` : ''}
          ${(company.cep || company.phone) ? `<div>${company.cep ? 'CEP ' + _esc(company.cep) : ''}${company.cep && company.phone ? '&nbsp;&nbsp;\u2022&nbsp;&nbsp;' : ''}${company.phone ? _esc(company.phone) : ''}</div>` : ''}
          ${company.email ? `<div>${_esc(company.email)}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-eyebrow">Documento Interno</div>
      <div class="doc-type">Nota de Controle Interna</div>
      <div class="doc-number">N\u00ba ${_esc(invoice.number)}</div>
    </div>
  </div>

  <div class="content">

    <!-- Meta strip -->
    <div class="meta-strip">
      <div class="meta-item">
        <div class="meta-label">Documento</div>
        <div class="meta-value">NCI ${_esc(invoice.number)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Emiss\u00e3o</div>
        <div class="meta-value">${_esc(_fmtDate(invoice.date_emission))}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Entrada</div>
        <div class="meta-value">${_esc(_fmtDate(invoice.date_receipt || invoice.date_emission))}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Total</div>
        <div class="meta-value accent">R$ ${_fmtCurrency(invoice.total_amount)}</div>
      </div>
    </div>

    <!-- Fornecedor -->
    <div class="section">
      <div class="section-header">
        <div class="section-title">Fornecedor</div>
        <div class="section-line"></div>
      </div>
      <div class="recipient-card">
        <div class="recipient-name">${_esc(invoice.supplier_name)}</div>
        <div class="recipient-meta">
          ${invoice.cnpj ? `<div>CNPJ: ${_esc(invoice.cnpj)}</div>` : ''}
          ${invoice.address ? `<div>${_esc(invoice.address)}${invoice.address_number ? ', ' + _esc(invoice.address_number) : ''}${invoice.neighborhood ? ' \u2013 ' + _esc(invoice.neighborhood) : ''}</div>` : ''}
          ${(invoice.city || invoice.uf) ? `<div>${[invoice.city, invoice.uf].filter(Boolean).map(_esc).join(' \u2013 ')}${invoice.cep ? ' \u2013 CEP ' + _esc(invoice.cep) : ''}</div>` : ''}
          ${invoice.state_registration ? `<div>IE: ${_esc(invoice.state_registration)}</div>` : ''}
          ${invoice.phone ? `<div>${_esc(invoice.phone)}</div>` : ''}
        </div>
      </div>
    </div>

    ${(invoice.transporter_name || invoice.driver_name || invoice.plate || Number(invoice.freight_amount || 0) > 0) ? `
    <!-- Transporte -->
    <div class="section">
      <div class="section-header">
        <div class="section-title">Transporte</div>
        <div class="section-line"></div>
      </div>
      <div class="transporter-row">
        ${invoice.transporter_name ? `<div class="t-chip"><div class="chip-label">Empresa</div><div class="chip-value">${_esc(invoice.transporter_name)}</div></div>` : ''}
        ${invoice.driver_name ? `<div class="t-chip"><div class="chip-label">Motorista</div><div class="chip-value">${_esc(invoice.driver_name)}</div></div>` : ''}
        ${invoice.plate ? `<div class="t-chip"><div class="chip-label">Placa</div><div class="chip-value">${_esc(invoice.plate)}</div></div>` : ''}
        ${Number(invoice.freight_amount || 0) > 0 ? `<div class="t-chip"><div class="chip-label">Frete</div><div class="chip-value">R$ ${_fmtCurrency(invoice.freight_amount)}</div></div>` : ''}
      </div>
    </div>` : ''}

    <!-- Produtos -->
    <div class="section">
      <div class="section-header">
        <div class="section-title">Produtos</div>
        <div class="section-line"></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="center" style="width:32px">Item</th>
              <th>Descri\u00e7\u00e3o</th>
              <th class="center" style="width:38px">Un.</th>
              <th class="right" style="width:80px">Quantidade</th>
              <th class="right" style="width:80px">Pre\u00e7o Unit.</th>
              <th class="right" style="width:90px">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3"></td>
              <td class="right">${_fmtCurrency(totalQty)}</td>
              <td class="right" style="color:#94a3b8;font-size:7.5px;letter-spacing:0.4px;text-transform:uppercase">Total</td>
              <td class="right">R$ ${_fmtCurrency(itemsTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Pagamento -->
    <div class="section">
      <div class="section-header">
        <div class="section-title">Pagamento &middot; ${insts.length} ${insts.length === 1 ? 'parcela' : 'parcelas'}</div>
        <div class="section-line"></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="center" style="width:70px">Parcela</th>
              <th class="center" style="width:90px">Prazo</th>
              <th class="center" style="width:110px">Vencimento</th>
              <th class="right">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${insts.map(i => `
            <tr>
              <td class="center">${i.seq} / ${insts.length}</td>
              <td class="center">${_esc(String(i.days || 0))} dias</td>
              <td class="center">${_esc(_fmtDate(i.due_date))}</td>
              <td class="right">R$ ${_fmtCurrency(i.amount)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" class="right" style="color:#94a3b8;font-size:7.5px;letter-spacing:0.4px;text-transform:uppercase">Total</td>
              <td class="right">R$ ${_fmtCurrency(insts.reduce((s, i) => s + Number(i.amount || 0), 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Valida\u00e7\u00e3o -->
    <div class="section" style="margin-top:20px">
      <div class="section-header">
        <div class="section-title">Valida\u00e7\u00e3o e Assinatura</div>
        <div class="section-line"></div>
      </div>
      <div class="signature-grid">
        <div class="sig-box">
          <div class="sig-label">Data de recebimento</div>
          <div class="sig-line"></div>
        </div>
        <div class="sig-box wide">
          <div class="sig-label">Identifica\u00e7\u00e3o e assinatura do recebedor</div>
          <div class="sig-line"></div>
        </div>
      </div>
    </div>

  </div>

</div>
<script>window.print();</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
}

module.exports = router;
