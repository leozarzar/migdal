/**
 * @module routes/kpis
 * @description KPIs mensais de desempenho de estoque.
 *
 * GET /kpis?kpi=<id>&start=YYYY-MM&end=YYYY-MM[&policy_id=N]
 * Retorna: [{ period: 'YYYY-MM', value: number | null }]
 *
 * KPIs disponíveis:
 *   turnover   — Giro de Estoque (consumo / estoque médio)
 *   stockout   — Rupturas (% de material-dias com saldo = 0)
 *   coverage   — Cobertura (estoque médio / consumo médio diário, em dias)
 *   accuracy   — Acuracidade (1 − peso_ajuste / peso_total_saídas, %)
 *   avg_stock  — Estoque Médio (kg, média ponderada no tempo)
 *   lead_time  — Lead Time de Reposição (dias, média por mês de recebimento)
 */

const router = require('express').Router();
const db     = require('../db');

// ── Helpers de data ───────────────────────────────────────────────────────────

/** Retorna primeiro dia, último dia e total de dias de um mês YYYY-MM. */
function monthBounds(yyyyMm) {
    const [y, m] = yyyyMm.split('-').map(Number);
    const first   = `${yyyyMm}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const last    = `${yyyyMm}-${String(lastDay).padStart(2, '0')}`;
    return { first, last, days: lastDay };
}

/** Gera array de meses entre start e end (inclusive), formato YYYY-MM. */
function monthRange(start, end) {
    const months   = [];
    let [y, m]     = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
        months.push(`${y}-${String(m).padStart(2, '0')}`);
        if (++m > 12) { m = 1; y++; }
    }
    return months;
}

/**
 * Retorna os dias efetivos do mês:
 * - Mês passado (last < today): dias completos do mês.
 * - Mês atual incompleto: dias já decorridos (de first até today, exclusive).
 * - Mês futuro (first >= today): 0.
 */
function effectiveMonthDays(first, last, days, today) {
    if (last < today)    return days;
    if (first >= today)  return 0;
    return Math.round((new Date(today) - new Date(first)) / 86400000);
}

/**
 * Média ponderada no tempo de estoque (kg) para um mês.
 * Para o mês atual, usa apenas os dias já decorridos como denominador.
 */
function avgStockForMonth(units, first, last, days, today) {
    const effDays = effectiveMonthDays(first, last, days, today);
    if (effDays === 0) return 0;

    // Usa teto exclusivo (lastPlusOne) para alinhar com saldo diário:
    // uma unidade contribui para o dia D se date_in <= D e date_out > D.
    const nextDay = new Date(last + 'T00:00:00');
    nextDay.setDate(nextDay.getDate() + 1);
    const lastPlusOne = nextDay.toISOString().slice(0, 10);

    let total = 0;
    for (const u of units) {
        const di    = u.date_in;
        const raw   = u.date_out || today;
        const doStr = raw > today ? today : raw;

        const overlapStart = di     > first       ? di     : first;
        const overlapEnd   = doStr  < lastPlusOne ? doStr  : lastPlusOne;
        if (overlapStart >= overlapEnd) continue;

        const olDays = Math.round(
            (new Date(overlapEnd) - new Date(overlapStart)) / 86400000
        );

        if (olDays > 0) total += (u.weight || 0) * olDays / effDays;
    }
    return total;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Retorna nomes de materiais vinculados a uma política de estoque. */
function fetchPolicyMaterials(policyId) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT m.name
               FROM stock_policy_items spi
               JOIN materials m ON m.id = spi.material_id
              WHERE spi.policy_id = ?`,
            [policyId],
            (err, rows) => {
                if (err) reject(err);
                else resolve((rows || []).map(r => r.name));
            }
        );
    });
}

/**
 * Busca unidades de estoque ativas durante o período.
 * Inclui unidades cuja date_in ≤ periodEnd E (date_out IS NULL OR date_out ≥ periodStart).
 */
function fetchUnits(periodStart, periodEnd, materialFilter) {
    return new Promise((resolve, reject) => {
        let sql = `
            SELECT su.id, su.material, su.weight,
                   su.date_in, su.date_out, su.deduction_type
              FROM stock_units su
             WHERE su.date_in <= ?
               AND (su.date_out IS NULL OR su.date_out >= ?)
        `;
        const params = [periodEnd, periodStart];

        if (materialFilter && materialFilter.length) {
            sql += ` AND su.material IN (${materialFilter.map(() => '?').join(',')})`;
            params.push(...materialFilter);
        }

        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

/** Busca recebimentos de compra com pedido vinculado no período para lead time. */
function fetchLeadTimeData(periodStart, periodEnd) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT r.date AS receipt_date, o.date AS order_date
               FROM receipts r
               JOIN orders o ON o.id = CAST(r.order_id AS INTEGER)
              WHERE r.nature = 'C'
                AND r.order_id IS NOT NULL
                AND r.order_id != ''
                AND r.date >= ?
                AND r.date <= ?`,
            [periodStart, periodEnd],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
}

// ── Cálculo de KPIs ───────────────────────────────────────────────────────────

function computeTurnover(units, months, today, includeAdjust) {
    return months.map(mo => {
        const { first, last, days } = monthBounds(mo);

        const consumption = units
            .filter(u => {
                if (!u.date_out || u.date_out < first || u.date_out > last) return false;
                const t = (u.deduction_type || '').toLowerCase();
                return t === 'uso' || (includeAdjust && t === 'ajuste');
            })
            .reduce((s, u) => s + (u.weight || 0), 0);

        const avg     = avgStockForMonth(units, first, last, days, today);
        const effDays = effectiveMonthDays(first, last, days, today);
        // Para meses incompletos, projeta o consumo para a taxa mensal equivalente.
        // Para meses fechados effDays === days, então o fator é 1 (sem alteração).
        const projectedConsumption = effDays > 0 ? consumption * days / effDays : consumption;
        return { period: mo, value: avg > 0 ? projectedConsumption / avg : null };
    });
}

function computeStockout(units, months, today, materialFilter) {
    const byMaterial = {};
    for (const u of units) {
        if (!u.material) continue;
        if (!byMaterial[u.material]) byMaterial[u.material] = [];
        byMaterial[u.material].push(u);
    }

    return months.map(mo => {
        const { first, last, days } = monthBounds(mo);
        const firstDate = new Date(first + 'T00:00:00');

        const effDays = effectiveMonthDays(first, last, days, today);

        const calcRate = (matUnits) => {
            if (effDays === 0) return 0;
            let zeroDays = 0;
            for (let d = 0; d < effDays; d++) {
                const dayDate = new Date(firstDate);
                dayDate.setDate(dayDate.getDate() + d);
                const dayStr = dayDate.toISOString().slice(0, 10);

                const balance = matUnits
                    .filter(u => u.date_in <= dayStr && (!u.date_out || u.date_out > dayStr))
                    .reduce((s, u) => s + (u.weight || 0), 0);

                if (balance <= 0) zeroDays++;
            }
            return zeroDays / effDays;
        };

        // Lista de materiais a considerar:
        // - Com política: todos os materiais da política (ausentes = 100% ruptura)
        // - Sem política: materiais com pelo menos uma unidade ativa no mês
        const matList = materialFilter && materialFilter.length
            ? materialFilter
            : Object.keys(byMaterial).filter(mat =>
                byMaterial[mat].some(u => u.date_in <= last && (!u.date_out || u.date_out >= first))
              );

        if (!matList.length) return { period: mo, value: null };

        const rates = matList.map(mat => calcRate(byMaterial[mat] || []));
        const avg   = rates.reduce((s, r) => s + r, 0) / rates.length;
        return { period: mo, value: avg * 100 };
    });
}

function computeCoverage(units, months, today, includeAdjust) {
    return months.map(mo => {
        const { first, last, days } = monthBounds(mo);

        const consumption = units
            .filter(u => {
                if (!u.date_out || u.date_out < first || u.date_out > last) return false;
                const t = (u.deduction_type || '').toLowerCase();
                return t === 'uso' || (includeAdjust && t === 'ajuste');
            })
            .reduce((s, u) => s + (u.weight || 0), 0);

        if (consumption === 0) return { period: mo, value: null };

        const avg           = avgStockForMonth(units, first, last, days, today);
        const effDays       = effectiveMonthDays(first, last, days, today);
        const dailyConsumpt = effDays > 0 ? consumption / effDays : 0;
        return { period: mo, value: dailyConsumpt > 0 ? avg / dailyConsumpt : null };
    });
}

function computeAccuracy(units, months) {
    return months.map(mo => {
        const { first, last } = monthBounds(mo);

        const exits = units.filter(u => u.date_out && u.date_out >= first && u.date_out <= last);
        const totalWeight  = exits.reduce((s, u) => s + (u.weight || 0), 0);
        if (totalWeight === 0) return { period: mo, value: null };

        const adjustWeight = exits
            .filter(u => u.deduction_type?.toLowerCase() === 'ajuste')
            .reduce((s, u) => s + (u.weight || 0), 0);

        return { period: mo, value: (1 - adjustWeight / totalWeight) * 100 };
    });
}

function computeAvgStock(units, months, today) {
    return months.map(mo => {
        const { first, last, days } = monthBounds(mo);
        const value = avgStockForMonth(units, first, last, days, today);
        return { period: mo, value: value > 0 ? value : null };
    });
}

function computeLeadTime(leadTimeData, months) {
    return months.map(mo => {
        const rows  = leadTimeData.filter(r => r.receipt_date && r.receipt_date.startsWith(mo));
        const valid = rows.filter(r => r.receipt_date && r.order_date && r.receipt_date >= r.order_date);
        if (!valid.length) return { period: mo, value: null };

        const totalDays = valid.reduce((s, r) => {
            return s + (new Date(r.receipt_date) - new Date(r.order_date)) / 86400000;
        }, 0);

        return { period: mo, value: totalDays / valid.length };
    });
}

// ── Rota principal ───────────────────────────────────────────────────────────

const VALID_KPIS = new Set(['turnover', 'stockout', 'coverage', 'accuracy', 'avg_stock', 'lead_time']);

router.get('/', async (req, res) => {
    const { kpi, start, end, policy_id, include_adjust } = req.query;
    const includeAdjust = include_adjust === '1';

    if (!kpi || !start || !end) {
        return res.status(400).json({ success: false, message: 'kpi, start e end são obrigatórios' });
    }
    if (!VALID_KPIS.has(kpi)) {
        return res.status(400).json({ success: false, message: `KPI desconhecido: ${kpi}` });
    }
    if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end)) {
        return res.status(400).json({ success: false, message: 'start e end devem estar no formato YYYY-MM' });
    }

    const months = monthRange(start, end);
    if (!months.length) {
        return res.status(400).json({ success: false, message: 'Período inválido' });
    }

    const periodStart = months[0] + '-01';
    const { last: periodEnd } = monthBounds(months[months.length - 1]);
    const today = new Date().toISOString().slice(0, 10);

    try {
        let materialFilter = null;
        if (policy_id) {
            const policyMaterials = await fetchPolicyMaterials(policy_id);
            if (!policyMaterials.length) {
                return res.json(months.map(mo => ({ period: mo, value: null })));
            }
            materialFilter = policyMaterials;
        }

        let result;

        if (kpi === 'lead_time') {
            const data = await fetchLeadTimeData(periodStart, periodEnd);
            result = computeLeadTime(data, months);
        } else {
            const units = await fetchUnits(periodStart, periodEnd, materialFilter);

            if      (kpi === 'turnover')  result = computeTurnover(units, months, today, includeAdjust);
            else if (kpi === 'stockout')  result = computeStockout(units, months, today, materialFilter);
            else if (kpi === 'coverage')  result = computeCoverage(units, months, today, includeAdjust);
            else if (kpi === 'accuracy')  result = computeAccuracy(units, months);
            else if (kpi === 'avg_stock') result = computeAvgStock(units, months, today);
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao calcular KPIs', error: err.message });
    }
});

module.exports = router;
