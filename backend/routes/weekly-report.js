/**
 * @module routes/weekly-report
 * @description Weekly stock report generation via Gemini API.
 * Aggregates the past 7 days of operational data, calls Gemini Flash
 * to produce a structured Portuguese narrative, and stores the result
 * as a notification of type 'weekly_report'.
 *
 * Routes:
 *   POST /weekly-report/generate  — generate (or regenerate) this week's report
 *   GET  /weekly-report/latest    — retrieve the most recent report
 */

const router = require("express").Router();
const db     = require("../db");
const https  = require("https");

// ── Helpers: Promise wrappers ─────────────────────────────────────────────

function dbAll(sql, params) {
    return new Promise((resolve, reject) =>
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []))
    );
}

function dbGet(sql, params) {
    return new Promise((resolve, reject) =>
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null))
    );
}

function dbRun(sql, params) {
    return new Promise((resolve, reject) =>
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })
    );
}

// ── Table Setup ───────────────────────────────────────────────────────────

db.run(`
    CREATE TABLE IF NOT EXISTS weekly_reports (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        week_start TEXT    NOT NULL,
        week_end   TEXT    NOT NULL,
        content    TEXT    NOT NULL,
        data_json  TEXT,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
`, (err) => {
    if (err) console.error("Erro ao garantir tabela weekly_reports:", err.message);
});

// ── z-score (replicado de notifications.js) ───────────────────────────────

function _zScore(serviceLevel) {
    const p = Math.max(0.501, Math.min(0.999, serviceLevel / 100));
    const t = Math.sqrt(-2 * Math.log(1 - p));
    const c = [2.515517, 0.802853, 0.010328];
    const d = [1.432788, 0.189269, 0.001308];
    return t - (c[0] + c[1] * t + c[2] * t * t) /
               (1 + d[0] * t + d[1] * t * t + d[2] * t * t * t);
}

function _stdDev(arr) {
    if (!arr.length) return 0;
    return Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);
}

// ── Coleta de dados ───────────────────────────────────────────────────────

/**
 * Agrega todos os dados operacionais dos últimos 7 dias vs 7 dias anteriores.
 * @returns {Object} Payload estruturado para o prompt.
 */
async function collectWeekData() {
    const now        = new Date();
    const weekEnd    = now.toISOString().slice(0, 10);
    const weekStart  = new Date(Date.now() - 7  * 86400000).toISOString().slice(0, 10);
    const prevStart  = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const start90    = new Date(Date.now() - 90  * 86400000).toISOString().slice(0, 10);

    // ── Pedidos ───────────────────────────────────────────────────────────
    const [ordersThisWeek, ordersPrevWeek, overdueOrders] = await Promise.all([
        dbAll(`SELECT id, code, supplier, status, due_date, expected_date FROM orders
               WHERE date BETWEEN ? AND ?`, [weekStart, weekEnd]),
        dbAll(`SELECT id, status FROM orders
               WHERE date BETWEEN ? AND ?`, [prevStart, weekStart]),
        dbAll(`SELECT id, code, supplier, expected_date FROM orders
               WHERE expected_date < ? AND status = 'OPEN'`, [weekEnd]),
    ]);

    const ordersData = {
        thisWeek: {
            total:    ordersThisWeek.length,
            open:     ordersThisWeek.filter(o => o.status === 'OPEN').length,
            closed:   ordersThisWeek.filter(o => o.status === 'CLOSED').length,
        },
        prevWeek: {
            total:    ordersPrevWeek.length,
        },
        overdue: overdueOrders.map(o => ({
            code:         o.code || '#' + o.id,
            supplier:     o.supplier || '—',
            expectedDate: o.expected_date,
        })),
    };

    // ── Recebimentos ──────────────────────────────────────────────────────
    const [receiptsThisWeek, receiptsPrevWeek] = await Promise.all([
        dbAll(`SELECT r.id, r.supplier, r.nature,
                      COALESCE(SUM(sm.quantity), 0) as total_weight,
                      COUNT(sm.id) as unit_count
               FROM receipts r
               LEFT JOIN stock_movements sm ON sm.receipt_id = r.id AND sm.type = 'entry'
               WHERE r.date BETWEEN ? AND ?
               GROUP BY r.id`, [weekStart, weekEnd]),
        dbAll(`SELECT COUNT(*) as total FROM receipts
               WHERE date BETWEEN ? AND ?`, [prevStart, weekStart]),
    ]);

    const receiptsData = {
        thisWeek: {
            count:       receiptsThisWeek.length,
            totalWeight: receiptsThisWeek.reduce((s, r) => s + (r.total_weight || 0), 0),
            unitCount:   receiptsThisWeek.reduce((s, r) => s + (r.unit_count   || 0), 0),
        },
        prevWeek: {
            count: receiptsPrevWeek[0]?.total || 0,
        },
    };

    // ── Consumo ───────────────────────────────────────────────────────────
    const [consumptionThisWeek, consumptionPrevWeek] = await Promise.all([
        dbAll(`SELECT m.name as material, SUM(sm.quantity) as total
               FROM stock_movements sm
               JOIN materials m ON m.id = sm.material_id
               WHERE sm.type = 'exit' AND sm.reason = 'consumption' AND sm.date BETWEEN ? AND ?
               GROUP BY sm.material_id ORDER BY total DESC`, [weekStart, weekEnd]),
        dbAll(`SELECT SUM(sm.quantity) as total FROM stock_movements sm
               WHERE sm.type = 'exit' AND sm.reason = 'consumption' AND sm.date BETWEEN ? AND ?`,
               [prevStart, weekStart]),
    ]);

    const consumptionData = {
        thisWeek: {
            totalWeight: consumptionThisWeek.reduce((s, r) => s + r.total, 0),
            byMaterial:  consumptionThisWeek.slice(0, 5).map(r => ({
                material: r.material,
                weight:   Math.round(r.total * 10) / 10,
            })),
        },
        prevWeek: {
            totalWeight: consumptionPrevWeek[0]?.total || 0,
        },
    };

    // ── Estoque atual ─────────────────────────────────────────────────────
    const stockBalances = await dbAll(
        `SELECT m.name as material,
                COALESCE(SUM(CASE WHEN sm.type = 'entry' THEN sm.quantity ELSE -sm.quantity END), 0) as balance
         FROM stock_movements sm
         JOIN materials m ON m.id = sm.material_id
         GROUP BY sm.material_id`, []
    );
    const balanceMap = new Map(stockBalances.filter(b => b.balance > 0).map(b => [b.material, b.balance]));

    // ── Safety stock e materiais em alerta ────────────────────────────────
    const policyItems = await dbAll(
        `SELECT spi.material_id, COALESCE(spi.lead_time_days, sp.lead_time_days, 15) as lead_time,
                sp.service_level, m.name as material_name
         FROM stock_policy_items spi
         JOIN stock_policies sp ON sp.id = spi.policy_id
         JOIN materials m ON m.id = spi.material_id
         WHERE spi.material_id IS NOT NULL`, []
    );

    const belowSafetyStock = [];
    for (const item of policyItems) {
        const mat   = item.material_name;
        const rows  = await dbAll(
            `SELECT DATE(sm.date) as day, SUM(sm.quantity) as total FROM stock_movements sm
             JOIN materials m ON m.id = sm.material_id
             WHERE m.name = ? AND sm.type = 'exit' AND sm.date BETWEEN ? AND ? GROUP BY DATE(sm.date)`,
            [mat, start90, weekEnd]
        );
        if (rows.length < 7) continue;
        const vals     = rows.map(r => r.total);
        const avg      = vals.reduce((s, v) => s + v, 0) / vals.length;
        const sd       = _stdDev(vals.map(v => v - avg));
        const es       = _zScore(item.service_level || 95) * sd * Math.sqrt(item.lead_time);
        const balance  = balanceMap.get(mat) || 0;
        if (es > 0 && balance < es) {
            belowSafetyStock.push({
                material:     mat,
                balance:      Math.round(balance * 10) / 10,
                safetyStock:  Math.round(es * 10) / 10,
                coveragePct:  Math.round((balance / es) * 100),
            });
        }
    }

    // ── Itens envelhecidos ────────────────────────────────────────────────
    const agingCutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const agedItems = await dbAll(
        `SELECT m.name as material, MIN(sm.date) as oldest_in
         FROM stock_movements sm
         JOIN materials m ON m.id = sm.material_id
         WHERE sm.type = 'entry' AND sm.date IS NOT NULL AND sm.date != '' AND sm.date < ?
           AND sm.lot_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM stock_movements sm2
               WHERE sm2.lot_id = sm.lot_id AND sm2.type = 'exit'
           )
         GROUP BY sm.material_id`, [agingCutoff]
    );
    const stockAging = agedItems.map(item => ({
        material: item.material,
        daysIn:   Math.floor((Date.now() - new Date(item.oldest_in + 'T00:00:00').getTime()) / 86400000),
    }));

    // ── Políticas ativas ──────────────────────────────────────────────────
    const policies = await dbAll(`SELECT name, service_level, lead_time_type, lead_time_days FROM stock_policies`, []);

    // ── KPIs da semana ────────────────────────────────────────────────────
    const [kpiUnits, kpiLeadTime, kpiOutflows] = await Promise.all([
        dbAll(`SELECT e.quantity AS weight, e.date AS date_in, MAX(x.date) AS date_out
               FROM stock_movements e
               LEFT JOIN stock_movements x ON x.lot_id = e.lot_id AND x.type = 'exit' AND e.lot_id IS NOT NULL
               WHERE e.type = 'entry'
                 AND e.date <= ? AND (x.date IS NULL OR x.date >= ?)
               GROUP BY e.id`,
              [weekEnd, weekStart]),
        dbAll(`SELECT r.date AS receipt_date, o.date AS order_date
               FROM receipts r
               JOIN orders o ON o.id = CAST(r.order_id AS INTEGER)
               WHERE r.nature = 'C' AND r.order_id IS NOT NULL AND r.order_id != ''
                 AND r.date BETWEEN ? AND ?`, [weekStart, weekEnd]),
        dbAll(`SELECT sm.reason, SUM(sm.quantity) as total FROM stock_movements sm
               WHERE sm.type = 'exit' AND sm.date BETWEEN ? AND ? AND sm.reason IN ('consumption', 'adjustment')
               GROUP BY sm.reason`, [weekStart, weekEnd]),
    ]);

    // Estoque médio ponderado no tempo (7 dias)
    let weightDaySum = 0;
    for (const u of kpiUnits) {
        const din       = u.date_in  > weekStart ? u.date_in  : weekStart;
        const rawDo     = u.date_out && u.date_out < weekEnd  ? u.date_out  : weekEnd;
        if (din >= rawDo) continue;
        const overlapDays = Math.round((new Date(rawDo + 'T00:00:00') - new Date(din + 'T00:00:00')) / 86400000);
        if (overlapDays > 0) weightDaySum += (u.weight || 0) * overlapDays;
    }
    const avgStockKg      = Math.round(weightDaySum / 7 * 10) / 10;
    const weekConsumption = consumptionData.thisWeek.totalWeight;
    const turnover        = avgStockKg > 0 ? Math.round(weekConsumption / avgStockKg * 100) / 100 : null;
    const coverageDays    = weekConsumption > 0 ? Math.round(avgStockKg * 7 / weekConsumption * 10) / 10 : null;

    // Lead time médio (dias pedido → recebimento)
    const avgLeadTimeDays = kpiLeadTime.length > 0
        ? Math.round(kpiLeadTime.reduce((s, r) => {
              const lt = Math.round((new Date(r.receipt_date + 'T00:00:00') - new Date(r.order_date + 'T00:00:00')) / 86400000);
              return s + Math.max(0, lt);
          }, 0) / kpiLeadTime.length)
        : null;

    // Acuracidade (1 − saídas por ajuste / total saídas)
    const outflowMap  = Object.fromEntries(kpiOutflows.map(r => [r.reason, r.total || 0]));
    const totalOut    = (outflowMap['consumption'] || 0) + (outflowMap['adjustment'] || 0);
    const accuracyPct = totalOut > 0
        ? Math.round((1 - (outflowMap['adjustment'] || 0) / totalOut) * 1000) / 10
        : null;

    const kpis = { avgStockKg, turnover, coverageDays, avgLeadTimeDays, accuracyPct };

    return {
        period: { weekStart, weekEnd },
        orders: ordersData,
        receipts: receiptsData,
        consumption: consumptionData,
        stock: {
            belowSafetyStock,
            aging: stockAging,
            totalMaterialsTracked: stockBalances.length,
        },
        policies: policies.map(p => ({ name: p.name, serviceLevel: p.service_level })),
        kpis,
    };
}

// ── Chamada Gemini API ────────────────────────────────────────────────────

/**
 * Chama a API Gemini Flash com o payload de dados e retorna o texto do relatório.
 * @param {Object} data
 * @returns {Promise<string>}
 */
function callGemini(data) {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return reject(new Error('GEMINI_API_KEY não configurada'));
        }

        const prompt = `Você é um analista sênior de operações de estoque industrial.
Com base nos dados abaixo, gere um relatório semanal em português brasileiro com EXATAMENTE estas seções e formatação:

**RESUMO EXECUTIVO**
(2-3 frases sintetizando o desempenho da semana)

**PONTOS DE ATENÇÃO**
• (item 1)
• (item 2)
• (item 3 — máximo 4 itens)

**DESTAQUES POSITIVOS**
• (item 1)
• (item 2 — máximo 3 itens)

**RECOMENDAÇÕES**
• (ação 1)
• (ação 2)
• (ação 3 — máximo 3 ações concretas e específicas)

**ANÁLISE DE KPIs**
Indicadores da semana: Giro ${data.kpis?.turnover != null ? data.kpis.turnover + 'x' : 'N/D'} | Cobertura ${data.kpis?.coverageDays != null ? data.kpis.coverageDays + ' dias' : 'N/D'} | Lead Time ${data.kpis?.avgLeadTimeDays != null ? data.kpis.avgLeadTimeDays + ' dias' : 'sem dados'} | Acuracidade ${data.kpis?.accuracyPct != null ? data.kpis.accuracyPct + '%' : 'sem ajustes'} | Estoque médio ${data.kpis?.avgStockKg ?? 0} kg
(2-3 frases avaliando esses KPIs no contexto de uma operação industrial: o giro está adequado? a cobertura é suficiente? a acuracidade está dentro do esperado?)

Regras obrigatórias:
- Use APENAS os números fornecidos nos dados. Nunca invente valores.
- Seja objetivo e direto. Nada de frases genéricas.
- Se não houver dados suficientes para uma seção, indique "Sem dados suficientes no período."
- Formato: texto simples com marcadores •, sem markdown extra.

Dados da semana (${data.period.weekStart} a ${data.period.weekEnd}):
${JSON.stringify(data, null, 2)}`;

        const body = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
        });

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path:     `/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
            method:   'POST',
            headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        };

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                try {
                    const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    if (json.error) return reject(new Error(json.error.message));
                    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (!text) return reject(new Error('Resposta vazia do Gemini'));
                    resolve(text.trim());
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/**
 * Gera um relatório fallback (sem IA) quando a API não está disponível.
 * @param {Object} data
 * @returns {string}
 */
function fallbackReport(data) {
    const { period, orders, receipts, consumption, stock, kpis } = data;
    const lines = [
        `**RESUMO EXECUTIVO**`,
        `Semana de ${period.weekStart} a ${period.weekEnd}. ${orders.thisWeek.total} pedidos registrados, ${receipts.thisWeek.count} recebimentos e ${consumption.thisWeek.totalWeight.toFixed(1)} kg consumidos.`,
        ``,
        `**PONTOS DE ATENÇÃO**`,
        ...(orders.overdue.length   ? [`• ${orders.overdue.length} pedido(s) em atraso.`]              : []),
        ...(stock.belowSafetyStock.length ? [`• ${stock.belowSafetyStock.length} material(is) abaixo do estoque de segurança.`] : []),
        ...(stock.aging.length      ? [`• ${stock.aging.length} material(is) com estoque envelhecido (> 60 dias).`] : []),
        stock.belowSafetyStock.length === 0 && orders.overdue.length === 0 ? `• Nenhum alerta crítico identificado.` : '',
        ``,
        `**DESTAQUES POSITIVOS**`,
        receipts.thisWeek.count > 0 ? `• ${receipts.thisWeek.count} recebimento(s) na semana, totalizando ${receipts.thisWeek.totalWeight.toFixed(1)} kg.` : '',
        orders.thisWeek.closed > 0  ? `• ${orders.thisWeek.closed} pedido(s) concluído(s) no período.` : '',
        ``,
        `**RECOMENDAÇÕES**`,
        ...(stock.belowSafetyStock.slice(0, 2).map(m => `• Reabastecer ${m.material} (saldo: ${m.balance} kg, ES: ${m.safetyStock} kg).`)),
        ...(orders.overdue.slice(0, 1).map(o  => `• Acompanhar pedido ${o.code} atrasado (fornecedor: ${o.supplier}).`)),
        stock.belowSafetyStock.length === 0 && orders.overdue.length === 0 ? `• Manter monitoramento regular dos níveis de estoque.` : '',
        ``,
        `**ANÁLISE DE KPIs**`,
        kpis?.turnover      != null ? `• Giro de estoque: ${kpis.turnover}x`          : '',
        kpis?.coverageDays  != null ? `• Cobertura: ${kpis.coverageDays} dias`         : '',
        kpis?.avgLeadTimeDays != null ? `• Lead Time médio: ${kpis.avgLeadTimeDays} dias` : '',
        kpis?.accuracyPct   != null ? `• Acuracidade: ${kpis.accuracyPct}%`           : '',
        (!kpis || (kpis.turnover == null && kpis.coverageDays == null)) ? `• Sem dados suficientes para análise de KPIs.` : '',
    ];
    return lines.filter(l => l !== '').join('\n');
}

// ── POST /weekly-report/generate ─────────────────────────────────────────

/**
 * POST /weekly-report/generate
 * Collects data, calls Gemini, stores report and creates a notification.
 */
router.post("/generate", async (req, res) => {
    try {
        const data = await collectWeekData();

        let content;
        let usedAI = true;
        try {
            content = await callGemini(data);
        } catch (aiErr) {
            console.warn('[weekly-report] Gemini indisponível, usando fallback:', aiErr.message);
            content = fallbackReport(data);
            usedAI  = false;
        }

        // Salvar relatório
        await dbRun(
            `INSERT INTO weekly_reports (week_start, week_end, content, data_json)
             VALUES (?, ?, ?, ?)`,
            [data.period.weekStart, data.period.weekEnd, content, JSON.stringify(data)]
        );

        // Criar notificação especial para o painel
        await dbRun(
            `DELETE FROM notifications WHERE type = 'weekly_report' AND dismissed_at IS NULL`,
            []
        );
        await dbRun(
            `INSERT INTO notifications (type, title, message, entity_type, entity_id, severity)
             VALUES ('weekly_report', ?, ?, 'report', NULL, 'info')`,
            [
                `Relatório Semanal — ${data.period.weekStart}`,
                content,
            ]
        );

        res.json({ success: true, usedAI, weekStart: data.period.weekStart });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Erro ao gerar relatório semanal",
            error: err.message,
        });
    }
});

// ── GET /weekly-report/latest ─────────────────────────────────────────────

/**
 * GET /weekly-report/latest
 * Returns the most recent weekly report.
 */
router.get("/latest", (req, res) => {
    db.get(
        `SELECT * FROM weekly_reports ORDER BY created_at DESC LIMIT 1`,
        [],
        (err, row) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json(row || null);
        }
    );
});

module.exports = router;
