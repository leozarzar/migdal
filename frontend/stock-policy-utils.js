/**
 * @file stock-policy-utils.js
 * @description Utilitários compartilhados de cálculo para parâmetros de política
 *   de estoque: agregação de consumo, filtragem de série temporal, previsão de
 *   demanda e cálculo de ES/PR/E.Máx.
 *
 *   Usado por: Dashboard, ConsumptionStats, StockPoliciesDetails, StockMonitor
 *   e HomeScreen (mobile). Carregado antes de todos os screens em index.html e
 *   mobile.html.
 */
const StockPolicyUtils = {

    // ── Helpers matemáticos ───────────────────────────────────────────────────

    /**
     * Formata uma Date como string YYYY-MM-DD.
     * @param {Date} date
     * @returns {string}
     */
    formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    /**
     * Aproximação do z-score (inversa da normal padrão) via Abramowitz & Stegun.
     * Referência: Handbook of Mathematical Functions, eq. 26.2.23.
     * @param {number} serviceLevel - Nível de serviço em % (ex: 95).
     * @returns {number} z-score correspondente.
     */
    zScore(serviceLevel) {
        const p = Math.max(0.501, Math.min(0.999, serviceLevel / 100));
        const t = Math.sqrt(-2 * Math.log(1 - p));
        const c = [2.515517, 0.802853, 0.010328];
        const d = [1.432788, 0.189269, 0.001308];
        return t - (c[0] + c[1] * t + c[2] * t * t) /
                   (1 + d[0] * t + d[1] * t * t + d[2] * t * t * t);
    },

    /**
     * Regressão linear simples (mínimos quadrados ordinários).
     * @param {number[]} xs - Eixo X (variável independente).
     * @param {number[]} ys - Eixo Y (variável dependente).
     * @returns {{a: number, b: number}} Intercepto (a) e coeficiente angular (b).
     */
    linReg(xs, ys) {
        const n   = xs.length;
        const sx  = xs.reduce((s, v) => s + v, 0);
        const sy  = ys.reduce((s, v) => s + v, 0);
        const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
        const sx2 = xs.reduce((s, v) => s + v * v, 0);
        const den = n * sx2 - sx * sx;
        if (den === 0) return { a: sy / n, b: 0 };
        const b = (n * sxy - sx * sy) / den;
        return { a: (sy - b * sx) / n, b };
    },

    /**
     * Desvio padrão RMSE de um array de resíduos.
     * @param {number[]} arr
     * @returns {number}
     */
    stdDev(arr) {
        if (!arr.length) return 0;
        return Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);
    },

    // ── Agregação e filtragem ─────────────────────────────────────────────────

    /**
     * Agrega linhas de consumo em buckets diários/semanais/mensais, preenche
     * lacunas no período e propaga o flag hasStock via carry-forward do saldo.
     *
     * Períodos incompletos (semana/mês corrente) são excluídos do resultado.
     *
     * @param {Array<{day:string, consumption:number}>} rows - Linhas de consumo da API.
     * @param {'daily'|'weekly'|'monthly'} aggregation - Nível de agregação.
     * @param {string} startDate - Data inicial ISO (YYYY-MM-DD).
     * @param {Array<{date:string, balance:number}>} stockRows - Saldo para carry-forward.
     * @returns {Array<{key:string, value:number, hasStock:boolean}>}
     */
    aggregateConsumption(rows, aggregation, startDate, stockRows) {
        const fmt = d => StockPolicyUtils.formatDate(d);
        const buckets = new Map();

        rows.forEach(row => {
            const date = new Date(row.day + 'T00:00:00');
            let key;
            if (aggregation === 'weekly') {
                const dow = date.getDay();
                const mon = new Date(date);
                mon.setDate(date.getDate() + (dow === 0 ? -6 : 1 - dow));
                key = fmt(mon);
            } else if (aggregation === 'monthly') {
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            } else {
                key = row.day;
            }
            if (!buckets.has(key)) buckets.set(key, { key, value: 0, hasStock: false });
            buckets.get(key).value += Number(row.consumption || 0);
        });

        // Cutoff: início do período corrente (incompleto → excluído)
        const todayD = new Date();
        todayD.setHours(0, 0, 0, 0);
        let cutoffKey;
        if (aggregation === 'weekly') {
            const dow = todayD.getDay();
            const mon = new Date(todayD);
            mon.setDate(todayD.getDate() + (dow === 0 ? -6 : 1 - dow));
            cutoffKey = fmt(mon);
        } else if (aggregation === 'monthly') {
            cutoffKey = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, '0')}`;
        } else {
            cutoffKey = fmt(todayD);
        }

        // Preenche lacunas entre startDate e cutoff
        const start = new Date(startDate + 'T00:00:00');
        if (aggregation === 'daily') {
            for (let c = new Date(start); fmt(c) < cutoffKey; c.setDate(c.getDate() + 1)) {
                const k = fmt(c);
                if (!buckets.has(k)) buckets.set(k, { key: k, value: 0, hasStock: false });
            }
        } else if (aggregation === 'weekly') {
            const c = new Date(start);
            const dow = c.getDay();
            c.setDate(c.getDate() + (dow === 0 ? -6 : 1 - dow));
            while (fmt(c) < cutoffKey) {
                const k = fmt(c);
                if (!buckets.has(k)) buckets.set(k, { key: k, value: 0, hasStock: false });
                c.setDate(c.getDate() + 7);
            }
        } else {
            const c = new Date(start.getFullYear(), start.getMonth(), 1);
            while (`${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}` < cutoffKey) {
                const k = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}`;
                if (!buckets.has(k)) buckets.set(k, { key: k, value: 0, hasStock: false });
                c.setMonth(c.getMonth() + 1);
            }
        }

        const all = Array.from(buckets.values())
            .sort((a, b) => a.key.localeCompare(b.key))
            .filter(b => b.key >= startDate && b.key < cutoffKey);

        // hasStock carry-forward: marca cada bucket conforme último saldo positivo
        const sortedStock = (stockRows || []).filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date));
        if (sortedStock.length > 0) {
            all.forEach(bucket => {
                const endKey = (() => {
                    if (aggregation === 'daily') return bucket.key;
                    if (aggregation === 'weekly') {
                        const d = new Date(bucket.key + 'T00:00:00');
                        d.setDate(d.getDate() + 6);
                        return fmt(d);
                    }
                    const [y, mo] = bucket.key.split('-').map(Number);
                    return fmt(new Date(y, mo, 0));
                })();
                let last = 0;
                for (const sr of sortedStock) {
                    if (sr.date <= endKey) last = Number(sr.balance || 0); else break;
                }
                bucket.hasStock = last > 0;
            });
        }
        return all;
    },

    /**
     * Filtra série temporal: remove zeros, rupturas de estoque e outliers via IQR.
     *
     * @param {Array<{value:number, hasStock:boolean}>} data - Série de buckets.
     * @param {boolean} removeZeros    - Remove períodos com consumo zero.
     * @param {boolean} treatOutliers  - Remove outliers via IQR (1,5×).
     * @param {boolean} treatRuptures  - Remove zeros sem estoque (rupturas).
     * @returns {Array<{value:number, hasStock:boolean}>}
     */
    filterBuckets(data, removeZeros, treatOutliers, treatRuptures) {
        let result = data.slice();
        if (removeZeros)   result = result.filter(d => d.value > 0);
        if (treatRuptures) result = result.filter(d => d.value > 0 || d.hasStock);
        if (treatOutliers && result.length >= 4) {
            const sorted = result.map(d => d.value).sort((a, b) => a - b);
            const q1  = sorted[Math.floor(sorted.length / 4)];
            const q3  = sorted[Math.floor(3 * sorted.length / 4)];
            const iqr = q3 - q1;
            result = result.filter(d => d.value >= q1 - 1.5 * iqr && d.value <= q3 + 1.5 * iqr);
        }
        return result;
    },

    // ── Previsão de demanda ───────────────────────────────────────────────────

    /**
     * Aplica o modelo de forecast e retorna previsão do próximo período,
     * desvio padrão dos resíduos e z-score do nível de serviço.
     *
     * Modelos suportados: moving-average, exp-smoothing, linear-regression, média simples.
     *
     * @param {Array<{value:number}>} data - Série filtrada (mínimo 2 pontos).
     * @param {string} method - Modelo de previsão.
     * @param {{period?:number, alpha?:number, regressionPeriod?:number}} params - Parâmetros.
     * @param {number} serviceLevel - Nível de serviço em % (ex: 95).
     * @returns {{nextForecast:number, std:number, z:number}|null}
     */
    computeForecast(data, method, params, serviceLevel) {
        const values = data.map(d => d.value);
        const n = values.length;
        if (n < 2) return null;

        const residuals = [];
        let nextForecast;

        if (method === 'moving-average') {
            // Resíduo = valor real − média dos p períodos anteriores
            const p = Math.max(2, Math.min(params.period || 7, n - 1));
            for (let i = p; i < n; i++)
                residuals.push(values[i] - values.slice(i - p, i).reduce((s, v) => s + v, 0) / p);
            nextForecast = values.slice(n - p).reduce((s, v) => s + v, 0) / p;

        } else if (method === 'exp-smoothing') {
            // S_t = α·Y_t + (1−α)·S_{t−1}; resíduo = Y_t − S_{t−1}
            const alpha = Math.max(0.01, Math.min(0.99, params.alpha || 0.3));
            let s = values[0];
            for (let i = 1; i < n; i++) {
                residuals.push(values[i] - s);
                s = alpha * values[i] + (1 - alpha) * s;
            }
            nextForecast = s;

        } else if (method === 'linear-regression') {
            // Regressão linear em janelas de rp períodos; projeta 1 passo à frente
            const rp = Math.max(3, Math.min(params.regressionPeriod || 30, n));
            for (let i = rp; i < n; i++) {
                const xs = Array.from({ length: rp }, (_, j) => j);
                const { a, b } = StockPolicyUtils.linReg(xs, values.slice(i - rp, i));
                residuals.push(values[i] - Math.max(0, a + b * rp));
            }
            const xs = Array.from({ length: rp }, (_, j) => j);
            const { a, b } = StockPolicyUtils.linReg(xs, values.slice(n - rp));
            nextForecast = Math.max(0, a + b * rp);

        } else {
            // Fallback: média aritmética acumulada
            for (let i = 1; i < n; i++)
                residuals.push(values[i] - values.slice(0, i).reduce((s, v) => s + v, 0) / i);
            nextForecast = values.reduce((s, v) => s + v, 0) / n;
        }

        return {
            nextForecast,
            std: StockPolicyUtils.stdDev(residuals),
            z:   StockPolicyUtils.zScore(serviceLevel),
        };
    },

    // ── Parâmetros de política de estoque ────────────────────────────────────

    /**
     * Calcula ES (Estoque de Segurança), PR (Ponto de Reposição) e E.Máx a
     * partir de um resultado de forecast e dos parâmetros de revisão da política.
     *
     * Fórmulas:
     *   ES  = Z × σ_resíduos × √(exposição / tamanho_período)
     *   PR  = demanda_diária × LT + ES
     *   E.Máx = demanda_diária × (T + LT) + ES  (somente revisão periódica)
     *
     * @param {{nextForecast:number, std:number, z:number}} fc - Resultado de computeForecast.
     * @param {number} lt - Lead time em dias (≥ 1).
     * @param {'daily'|'weekly'|'monthly'} aggregation - Agregação usada no forecast.
     * @param {'continuous'|'periodic'} reviewType - Tipo de revisão da política.
     * @param {number} reviewPeriodDays - Duração do período de revisão em dias (periódico).
     * @returns {{safetyStock:number, reorderPoint:number, maxStock:number|null}}
     */
    computeStockKpis(fc, lt, aggregation, reviewType, reviewPeriodDays) {
        const periodSize   = { daily: 1, weekly: 7, monthly: 30 }[aggregation] || 1;
        const dDaily       = fc.nextForecast / periodSize;
        // Exposição: contínua = LT; periódica = T (período de revisão) + LT
        const exposureDays = reviewType === 'periodic' ? reviewPeriodDays + lt : lt;
        // ES = Z(NS) × σ_resíduos × √(exposição_em_períodos)
        const safetyStock  = fc.z * fc.std * Math.sqrt(exposureDays / periodSize);
        return {
            safetyStock:  Math.max(0, safetyStock),
            // PR = demanda_diária × LT + ES
            reorderPoint: Math.max(0, dDaily * lt + safetyStock),
            // E.Máx: só periódico = demanda_diária × (T + LT) + ES
            maxStock:     reviewType === 'periodic'
                ? Math.max(0, dDaily * (reviewPeriodDays + lt) + safetyStock)
                : null,
        };
    },

    // ── Resolução de parâmetros de forecast de um item de política ────────────

    /**
     * Extrai os parâmetros de previsão de um item de política + dados da política.
     * Retorna null quando não há configuração de forecast suficiente para calcular KPIs.
     *
     * @param {Object} policyItem  - Item da política (material ou grupo).
     * @param {Object} policyData  - Dados completos da política (nível superior).
     * @returns {{model, param, startDate, aggregation, removeZeros, treatOutliers, treatRuptures,
     *            serviceLevel, reviewType, reviewPeriodDays}|null}
     */
    resolvePolicyItemParams(policyItem, policyData) {
        const serviceLevel     = policyData.service_level || 95;
        const reviewType       = policyData.review_type || 'continuous';
        const reviewPeriod     = policyData.review_period || 'weekly';
        const customPeriodDays = policyData.review_period_days || 7;
        const reviewPeriodDays = { daily: 1, weekly: 7, monthly: 30, custom: customPeriodDays }[reviewPeriod] || 7;

        let model, param, startDate, aggregation, removeZeros, treatOutliers, treatRuptures;

        if (policyItem.forecast_model) {
            model         = policyItem.forecast_model;
            param         = policyItem.forecast_param;
            startDate     = policyItem.forecast_start_date;
            aggregation   = policyItem.forecast_aggregation || 'daily';
            removeZeros   = !!policyItem.forecast_remove_zeros;
            treatOutliers = !!policyItem.forecast_treat_outliers;
            treatRuptures = !!policyItem.forecast_treat_ruptures;
        } else if (policyData.forecast_type === 'custom' && policyData.forecast_model) {
            model         = policyData.forecast_model;
            param         = policyData.forecast_param;
            startDate     = null;
            aggregation   = 'daily';
            removeZeros   = treatOutliers = treatRuptures = false;
        } else {
            return null;
        }

        if (!startDate) {
            const d90 = new Date();
            d90.setDate(d90.getDate() - 90);
            startDate = StockPolicyUtils.formatDate(d90);
        }

        return { model, param, startDate, aggregation, removeZeros, treatOutliers, treatRuptures,
                 serviceLevel, reviewType, reviewPeriodDays };
    },

    /**
     * Calcula ES/PR/E.Máx para um item do tipo material a partir de uma política.
     * Busca consumo e estoque da API, aplica forecast e retorna os KPIs.
     *
     * @param {string}   materialName  - Nome do material.
     * @param {Object}   policyItem    - Item da política correspondente.
     * @param {Object}   policyData    - Dados da política (nível superior).
     * @param {Function} fetchLeadTime - async (materialName) => number|null  (com cache externo).
     * @returns {Promise<{safetyStock:number|null, reorderPoint:number|null, maxStock:number|null}>}
     */
    async computeItemKpis(materialName, policyItem, policyData, fetchLeadTime) {
        const p = StockPolicyUtils.resolvePolicyItemParams(policyItem, policyData);
        if (!p) return { safetyStock: null, reorderPoint: null, maxStock: null };

        const leadTimeType = policyData.lead_time_type || 'auto';
        const customLT     = policyData.lead_time_days || 1;

        let lt;
        if (leadTimeType === 'custom') {
            lt = customLT;
        } else if (policyItem.lead_time_days) {
            lt = policyItem.lead_time_days;
        } else {
            lt = Math.max((await fetchLeadTime(materialName)) ?? 1, 1);
        }

        const today     = new Date();
        const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        const endDate   = StockPolicyUtils.formatDate(yesterday);

        try {
            const query = new URLSearchParams({ material: materialName, startDate: p.startDate, endDate });
            const [consumptionRows, stockRows] = await Promise.all([
                apiCall(`${API}/consumption?${query}`),
                apiCall(`${API}/stock-monitor?${query}`),
            ]);
            const aggregated = StockPolicyUtils.aggregateConsumption(consumptionRows || [], p.aggregation, p.startDate, stockRows || []);
            const filtered   = StockPolicyUtils.filterBuckets(aggregated, p.removeZeros, p.treatOutliers, p.treatRuptures);
            if (filtered.length < 2) return { safetyStock: null, reorderPoint: null, maxStock: null };

            const fc = StockPolicyUtils.computeForecast(filtered, p.model, { period: p.param, alpha: p.param, regressionPeriod: p.param }, p.serviceLevel);
            if (!fc) return { safetyStock: null, reorderPoint: null, maxStock: null };

            return StockPolicyUtils.computeStockKpis(fc, lt, p.aggregation, p.reviewType, p.reviewPeriodDays);
        } catch {
            return { safetyStock: null, reorderPoint: null, maxStock: null };
        }
    },

    /**
     * Calcula ES/PR/E.Máx para um item do tipo grupo, agregando os membros.
     * Busca consumo e estoque para cada membro, combina os buckets e aplica forecast.
     *
     * @param {string[]} memberNames   - Nomes dos materiais membros do grupo.
     * @param {Object}   policyItem    - Item de grupo da política.
     * @param {Object}   policyData    - Dados da política (nível superior).
     * @param {Function} fetchLeadTime - async (materialName) => number|null  (com cache externo).
     * @returns {Promise<{safetyStock:number|null, reorderPoint:number|null, maxStock:number|null}>}
     */
    async computeGroupKpis(memberNames, policyItem, policyData, fetchLeadTime) {
        if (!memberNames || !memberNames.length) return { safetyStock: null, reorderPoint: null, maxStock: null };

        const p = StockPolicyUtils.resolvePolicyItemParams(policyItem, policyData);
        if (!p) return { safetyStock: null, reorderPoint: null, maxStock: null };

        const leadTimeType = policyData.lead_time_type || 'auto';
        const customLT     = policyData.lead_time_days || 1;

        let lt;
        if (leadTimeType === 'custom') {
            lt = customLT;
        } else if (policyItem.lead_time_days) {
            lt = policyItem.lead_time_days;
        } else {
            const ltValues = await Promise.all(memberNames.map(n => fetchLeadTime(n)));
            const validLts = ltValues.filter(v => v != null && v > 0);
            lt = validLts.length ? validLts.reduce((s, v) => s + v, 0) / validLts.length : 1;
        }
        lt = Math.max(lt, 1);

        const today     = new Date();
        const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        const endDate   = StockPolicyUtils.formatDate(yesterday);

        try {
            const mkQuery = name => new URLSearchParams({ material: name, startDate: p.startDate, endDate });
            const [allConsumption, allStock] = await Promise.all([
                Promise.all(memberNames.map(n => apiCall(`${API}/consumption?${mkQuery(n)}`).catch(() => []))),
                Promise.all(memberNames.map(n => apiCall(`${API}/stock-monitor?${mkQuery(n)}`).catch(() => []))),
            ]);

            const mergedMap = new Map();
            memberNames.forEach((_, idx) => {
                const buckets = StockPolicyUtils.aggregateConsumption(allConsumption[idx] || [], p.aggregation, p.startDate, allStock[idx] || []);
                buckets.forEach(b => {
                    if (!mergedMap.has(b.key)) mergedMap.set(b.key, { key: b.key, value: 0, hasStock: false });
                    const e = mergedMap.get(b.key);
                    e.value   += b.value;
                    e.hasStock = e.hasStock || !!b.hasStock;
                });
            });

            const merged   = Array.from(mergedMap.values()).sort((a, b) => a.key.localeCompare(b.key));
            const filtered = StockPolicyUtils.filterBuckets(merged, p.removeZeros, p.treatOutliers, p.treatRuptures);
            if (filtered.length < 2) return { safetyStock: null, reorderPoint: null, maxStock: null };

            const fc = StockPolicyUtils.computeForecast(filtered, p.model, { period: p.param, alpha: p.param, regressionPeriod: p.param }, p.serviceLevel);
            if (!fc) return { safetyStock: null, reorderPoint: null, maxStock: null };

            return StockPolicyUtils.computeStockKpis(fc, lt, p.aggregation, p.reviewType, p.reviewPeriodDays);
        } catch {
            return { safetyStock: null, reorderPoint: null, maxStock: null };
        }
    },
};
