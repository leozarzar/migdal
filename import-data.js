#!/usr/bin/env node
/**
 * Script de importação: CSV → SQLite
 *
 * Tabelas alvo: orders, order_items, receipts, stock_units
 *
 * Uso:
 *   node import-data.js           → importa sem apagar dados existentes
 *   node import-data.js --fresh   → apaga os dados das 4 tabelas antes de importar
 *
 * Ordem de inserção: orders → receipts → stock_units
 * (receipts precisam existir antes do estoque para resolver o receipt_id)
 */

const path    = require("path");
const fs      = require("fs");
const sqlite3 = require("sqlite3");

const DB_PATH = path.resolve(__dirname, "database.db");
const RES     = path.resolve(__dirname, "resources");

const FILES = {
  orders:   path.join(RES, "# Pedidos (Ajuste)-Pedidos.csv"),
  receipts: path.join(RES, "# Fornecimentos (Ajuste)-Fornecimentos.csv"),
  stock:    path.join(RES, "# Estoque (Ajuste)-Estoque-1.csv"),
};

const FRESH = process.argv.includes("--fresh");

// ── Helpers CSV ───────────────────────────────────────────────────────────────

/** Lê um CSV separado por ';' e retorna array de objetos com os headers como chaves */
function parseCSV(filePath) {
  const raw     = fs.readFileSync(filePath, "utf-8");
  const lines   = raw.split("\n").filter(l => l.trim() !== "");
  const headers = lines[0].split(";").map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(";");
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").trim(); });
    return obj;
  });
}

// ── Helpers de valor ──────────────────────────────────────────────────────────

/** DD/MM/YY ou DD/MM/YYYY → YYYY-MM-DD; retorna null para vazio */
function parseDate(str) {
  const s = (str || "").trim();
  if (!s) return null;
  const [d, m, y] = s.split("/");
  if (!d || !m || !y) return null;
  const year = y.length === 2 ? "20" + y : y;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Retorna null para strings vazias ou "-" */
function nullify(str) {
  const s = (str || "").trim();
  return s === "" || s === "-" ? null : s;
}

/** Verifica se o valor (string) equivale a 'VERDADEIRO' */
function isTrue(str) {
  return (str || "").trim().toUpperCase() === "VERDADEIRO";
}

// ── Promise wrappers sobre sqlite3 ───────────────────────────────────────────

/** Promise wrapper para db.run — resolve com this (lastID, changes) */
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this); // this.lastID / this.changes
    });
  });
}

/** Promise wrapper para db.get — resolve com a row encontrada */
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// ── Funções de importação ─────────────────────────────────────────────────────

/**
 * Importa nomes únicos para uma tabela de lookup (suppliers, materials, operators).
 * @param {object} db
 * @param {string} table  - nome da tabela
 * @param {string[]} names - lista de nomes (valores em branco são ignorados)
 */
async function importLookup(db, table, names) {
  const unique = [...new Set(names.map(n => n.trim()).filter(Boolean))];
  if (!unique.length) return;

  await dbRun(db, "BEGIN");
  let inserted = 0;
  for (const name of unique) {
    const exists = await dbGet(db, `SELECT id FROM ${table} WHERE name = ?`, [name]);
    if (!exists) {
      await dbRun(db, `INSERT INTO ${table} (name) VALUES (?)`, [name]);
      inserted++;
    }
  }
  await dbRun(db, "COMMIT");
  const label = table.charAt(0).toUpperCase() + table.slice(1);
  console.log(`[${label.padEnd(12)}] ${inserted} inseridos, ${unique.length - inserted} já existiam.`);
}

// Colunas de material da planilha de pedidos → nomes de material
const MATERIAL_COLS = [
  "Branco",
  "Preto",
  "Colorido",
  "Rosa",
  "Verde Tiffany",
  "Azul Bebê",
];

/** Importa pedidos (orders + order_items) a partir das linhas do CSV */
async function importOrders(db, rows, coloridoGroupId) {
  let inserted = 0;
  let skipped  = 0;

  await dbRun(db, "BEGIN");

  for (const row of rows) {
    const id = parseInt(row["id"], 10);
    if (!id) { skipped++; continue; }

    const exists = await dbGet(db, "SELECT id FROM orders WHERE id = ?", [id]);
    if (exists) { skipped++; continue; }

    const status = isTrue(row["Recebido"]) ? "Recebido" : "Aguardando";

    await dbRun(db,
      `INSERT INTO orders (id, date, supplier, due_date, expected_date, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        parseDate(row["date"]),
        nullify(row["supplier"]),
        parseDate(row["due_date"]),
        parseDate(row["expected_date"]),
        status,
      ]
    );

    inserted++;

    for (const mat of MATERIAL_COLS) {
      const qty = parseFloat(row[mat]);
      if (qty > 0) {
        if (mat === "Colorido" && coloridoGroupId) {
          await dbRun(db,
            `INSERT INTO order_items (order_id, group_id, group_quantity) VALUES (?, ?, ?)`,
            [id, coloridoGroupId, qty]
          );
        } else {
          await dbRun(db,
            `INSERT INTO order_items (order_id, material, quantity) VALUES (?, ?, ?)`,
            [id, mat, qty]
          );
        }
      }
    }
  }

  await dbRun(db, "COMMIT");
  console.log(`[Pedidos]       ${inserted} inseridos, ${skipped} ignorados.`);
}

/** Importa recebimentos (receipts) a partir das linhas do CSV */
async function importReceipts(db, rows) {
  let inserted  = 0;
  let skipped   = 0;

  await dbRun(db, "BEGIN");

  for (const row of rows) {
    const id = parseInt(row["id"], 10);
    if (!id) { skipped++; continue; }

    const exists = await dbGet(db, "SELECT id FROM receipts WHERE id = ?", [id]);
    if (exists) { skipped++; continue; }

    const orderRaw = nullify(row["order_id"]);
    const orderId  = orderRaw ? (parseInt(orderRaw, 10) || null) : null;

    await dbRun(db,
      `INSERT INTO receipts (id, code, nature, date, supplier, order_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        nullify(row["Code"]),
        nullify(row["nature"]),
        parseDate(row["date"]),
        nullify(row["Supplier"]),
        orderId,
      ]
    );

    inserted++;
  }

  await dbRun(db, "COMMIT");
  console.log(`[Fornecimentos] ${inserted} inseridos, ${skipped} ignorados.`);
}

/** Importa unidades de estoque (stock_units) a partir das linhas do CSV */
async function importStock(db, rows) {
  let inserted  = 0;
  let skipped   = 0;

  await dbRun(db, "BEGIN");

  for (const row of rows) {
    const id = parseInt(row["ID"], 10);
    if (!id) { skipped++; continue; }

    const exists = await dbGet(db, "SELECT id FROM stock_units WHERE id = ?", [id]);
    if (exists) { skipped++; continue; }

    const receiptId = parseInt(row["receipt_id"], 10) || null;
    const volumeId  = parseInt(row["volume_id"], 10) || null;
    const dateOut   = parseDate(row["date_out"]);

    await dbRun(db,
      `INSERT INTO stock_units
         (id, receipt_id, volume_id, old_id, material, supplier, operator, weight, status, date_in, date_out, deduction_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        receiptId,
        volumeId,
        nullify(row["old_id"]),
        nullify(row["material"]),
        nullify(row["supplier"]),
        nullify(row["operator"]),
        parseFloat(row["weight"]) || null,
        dateOut ? "OUT_STOCK" : "IN_STOCK",
        parseDate(row["date_in"]),
        dateOut,
        nullify(row["deduction_type"]),
      ]
    );
    inserted++;
  }

  await dbRun(db, "COMMIT");
  console.log(`[Estoque]       ${inserted} inseridos, ${skipped} ignorados.`);
}

/** Cria o grupo 'Colorido' e associa materiais Verde, Azul, Vermelho */
async function setupColoridoGroup(db) {
  let existing = await dbGet(db, "SELECT id FROM groups WHERE name = 'Colorido'");
  let groupId;
  if (existing) {
    groupId = existing.id;
    console.log(`[Grupo Colorido] Já existe (id=${groupId}).`);
  } else {
    const r = await dbRun(db, "INSERT INTO groups (name) VALUES ('Colorido')");
    groupId = r.lastID;
    console.log(`[Grupo Colorido] Criado com id=${groupId}.`);
  }

  let updated = 0;
  for (const name of ["Verde", "Azul", "Vermelho"]) {
    const r = await dbRun(db, "UPDATE materials SET group_id = ? WHERE name = ?", [groupId, name]);
    updated += r.changes;
  }
  console.log(`[Grupo Colorido] ${updated} material(is) associado(s): Verde, Azul, Vermelho.`);

  return groupId;
}

/** Ponto de entrada: valida arquivos, importa na ordem correta */
async function main() {
  // Verifica que os arquivos existem
  for (const [name, p] of Object.entries(FILES)) {
    if (!fs.existsSync(p)) {
      console.error(`Arquivo não encontrado: ${p}`);
      process.exit(1);
    }
  }

  const db = new sqlite3.Database(DB_PATH);
  db.configure("busyTimeout", 10000);
  // Serialized: apenas uma operação por vez no banco
  db.serialize();

  try {
    if (FRESH) {
      console.log("Modo --fresh: apagando dados existentes...");
      await dbRun(db, "DELETE FROM stock_units");
      await dbRun(db, "DELETE FROM order_items");
      await dbRun(db, "DELETE FROM receipts");
      await dbRun(db, "DELETE FROM orders");
      await dbRun(db, "DELETE FROM suppliers");
      await dbRun(db, "DELETE FROM materials");
      await dbRun(db, "DELETE FROM operators");
      // Reseta contadores de autoincrement para não contaminar próximas inserções manuais
      for (const t of ["stock_units", "order_items", "receipts", "orders", "suppliers", "materials", "operators"]) {
        await dbRun(db, "DELETE FROM sqlite_sequence WHERE name = ?", [t]).catch(() => {});
      }
      console.log("Dados apagados.\n");
    }

    const ordersData   = parseCSV(FILES.orders);
    const receiptsData = parseCSV(FILES.receipts);
    const stockData    = parseCSV(FILES.stock);

    console.log(
      `Arquivos lidos: ${ordersData.length} pedidos | ` +
      `${receiptsData.length} fornecimentos | ` +
      `${stockData.length} itens de estoque\n`
    );

    // Suppliers: pedidos + fornecimentos + estoque
    const supplierNames = [
      ...ordersData.map(r => r["supplier"]),
      ...receiptsData.map(r => r["Supplier"]),
      ...stockData.map(r => r["supplier"]),
    ];
    await importLookup(db, "suppliers", supplierNames.filter(Boolean));

    // Materials: colunas fixas dos pedidos + coluna material do estoque
    const materialNames = [
      ...MATERIAL_COLS,
      ...stockData.map(r => r["material"]),
    ];
    await importLookup(db, "materials", materialNames.filter(Boolean));

    // Operators: coluna operator do estoque
    const operatorNames = stockData.map(r => r["operator"]);
    await importLookup(db, "operators", operatorNames.filter(Boolean));

    const coloridoGroupId = await setupColoridoGroup(db);

    await importOrders(db, ordersData, coloridoGroupId);
    await importReceipts(db, receiptsData);
    await importStock(db, stockData);

    console.log("\n✓ Importação concluída com sucesso.");
  } catch (err) {
    console.error("\n✗ Erro durante importação:", err.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
