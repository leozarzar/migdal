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
        `SELECT pi.*, s.name AS supplier_name, s.cnpj, s.address, s.address_number, s.neighborhood, s.cep, s.city, s.uf, s.state_registration, s.phone
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
                    res.json({ ...invoice, items: items || [], receipt_ids: (receipts || []).map(r => r.receipt_id) });
                });
            });
        }
    );
});

/**
 * GET /purchase-invoices/available-receipts/:supplierId - Recebimentos disponíveis (não vinculados a outra fatura)
 */
router.get("/available-receipts/:supplierId", (req, res) => {
    db.all(
        `SELECT r.id, r.code, r.date,
                COALESCE(SUM(su.weight), 0) AS total_weight
         FROM receipts r
         LEFT JOIN stock_units su ON su.receipt_id = r.id
         WHERE r.supplier = (SELECT name FROM suppliers WHERE id = ?)
           AND r.id NOT IN (SELECT receipt_id FROM purchase_invoice_receipts)
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
            transporter_name, driver_name, plate, receipt_ids, items } = req.body;

    if (!number || !date_emission || !supplier_id) {
        return res.status(400).json({ success: false, message: "Número, data de emissão e fornecedor são obrigatórios." });
    }
    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: "A fatura precisa ter ao menos um item." });
    }

    const total_amount = items.reduce((sum, item) => sum + Number(item.total_value || 0), 0);

    db.run(
        `INSERT INTO purchase_invoices (number, date_emission, date_receipt, supplier_id, payment_days, due_date, total_amount, transporter_name, driver_name, plate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [number, date_emission, date_receipt || null, supplier_id, payment_days || 0, due_date || null,
         total_amount, transporter_name || null, driver_name || null, plate || null],
        function (err) {
            if (err) return res.status(500).json({ success: false, message: "Erro ao criar fatura.", error: err.message });
            const invoice_id = this.lastID;

            // Insert receipt links
            const receiptList = Array.isArray(receipt_ids) ? receipt_ids : [];
            let receiptsDone = 0;
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
                            if (itemsDone === items.length) {
                                res.status(201).json({ success: true, message: "Fatura criada com sucesso.", id: invoice_id });
                            }
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
    db.get(
        `SELECT pi.*, s.name AS supplier_name, s.cnpj, s.address, s.address_number,
                s.neighborhood, s.cep, s.city, s.uf, s.state_registration, s.phone
         FROM purchase_invoices pi
         JOIN suppliers s ON pi.supplier_id = s.id
         WHERE pi.id = ?`,
        [id],
        (err, invoice) => {
            if (err || !invoice) return res.status(404).send("<h1>Fatura não encontrada</h1>");

            db.all(`SELECT * FROM purchase_invoice_items WHERE invoice_id = ? ORDER BY item_number`, [id], (err2, items) => {
                if (err2) return res.status(500).send("<h1>Erro ao carregar itens</h1>");

                const itemRows = (items || []).map(item => `
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
  .doc-header { display: flex; border: 1px solid #000; margin-bottom: 4px; }
  .doc-header .company { flex: 1; padding: 6px; border-right: 1px solid #000; }
  .doc-header .nci-info { width: 180px; padding: 6px; border-right: 1px solid #000; text-align: center; }
  .doc-header .logo-area { width: 140px; padding: 6px; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: bold; border: 3px solid #e74c3c; color: #e74c3c; }
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
  @media print {
    body { padding: 0; }
    .page { max-width: 100%; }
    button.no-print { display: none; }
  }
</style>
</head>
<body>
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
      <div style="font-weight:bold;font-size:11px">ICASA INDÚSTRIA DE PLÁSTICOS EIRELI</div>
      <div style="margin-top:4px;font-size:9px">AV. CÍCERO BATISTA DE OLIVEIRA, 2.980</div>
      <div style="font-size:9px">ALPES SUÍÇOS – GRAVATÁ – PE</div>
      <div style="font-size:9px">CEP: 55.645-000 – FONE: (81) 3533-0512</div>
    </div>
    <div class="nci-info">
      <div style="font-weight:bold">NCI</div>
      <div>NOTA DE CONTROLE ICASA</div>
      <div style="font-weight:bold;font-size:12px">Nº ${_esc(invoice.number)}</div>
      <div style="margin-top:6px;font-size:9px">0 – ENTRADA</div>
    </div>
    <div class="logo-area">ICASA<br><span style="font-size:9px;font-weight:normal">PLÁSTICOS</span></div>
  </div>

  <!-- Remetente -->
  <div class="section">
    <div class="section-title">REMETENTE/DESTINATÁRIO</div>
    <div class="section-body">
      <div class="fields-row">
        <div class="field wide"><label>NOME EMPRESARIAL</label><span>${_esc(invoice.supplier_name)}</span></div>
        <div class="field"><label>CNPJ/CPF</label><span>${_esc(invoice.cnpj)}</span></div>
        <div class="field"><label>DATA DA EMISSÃO</label><span>${_esc(_fmtDate(invoice.date_emission))}</span></div>
      </div>
      <div class="fields-row">
        <div class="field wide"><label>ENDEREÇO</label><span>${_esc(invoice.address)}${invoice.address_number ? ', ' + _esc(invoice.address_number) : ''}</span></div>
        <div class="field"><label>BAIRRO/DISTRITO</label><span>${_esc(invoice.neighborhood)}</span></div>
        <div class="field"><label>CEP</label><span>${_esc(invoice.cep)}</span></div>
        <div class="field"><label>DATA DE ENTRADA/SAÍDA</label><span>${_esc(_fmtDate(invoice.date_receipt || invoice.date_emission))}</span></div>
      </div>
      <div class="fields-row">
        <div class="field"><label>MUNICÍPIO</label><span>${_esc(invoice.city)}</span></div>
        <div class="field"><label>UF</label><span>${_esc(invoice.uf)}</span></div>
        <div class="field wide"><label>INSCRIÇÃO ESTADUAL</label><span>${_esc(invoice.state_registration)}</span></div>
        <div class="field"><label>FONE/FAX</label><span>${_esc(invoice.phone)}</span></div>
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
          <tr>
            <td class="center">1</td>
            <td class="center">${_esc(_fmtDate(invoice.due_date))}</td>
            <td class="right">${_fmtCurrency(invoice.total_amount)}</td>
            <td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>
          <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Transportador -->
  <div class="section">
    <div class="section-title">TRANSPORTADOR</div>
    <div class="section-body">
      <div class="fields-row">
        <div class="field wide"><label>NOME EMPRESARIAL</label><span>${_esc(invoice.transporter_name)}</span></div>
        <div class="field wide"><label>MOTORISTA</label><span>${_esc(invoice.driver_name)}</span></div>
        <div class="field"><label>PLACA</label><span>${_esc(invoice.plate)}</span></div>
      </div>
    </div>
  </div>

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
            <td class="right">${_fmtCurrency(invoice.total_amount)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Dados Adicionais -->
  <div class="additional">
    <div class="title">DADOS ADICIONAIS</div>
    <div>INFORMAÇÕES COMPLEMENTARES</div>
    <div style="margin-top:4px">PRAZO PARA PAGAMENTO(S): ${_esc(String(invoice.payment_days || 0))} DIAS</div>
  </div>

</div>
<script>window.print();</script>
</body>
</html>`;

                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.send(html);
            });
        }
    );
});

module.exports = router;
