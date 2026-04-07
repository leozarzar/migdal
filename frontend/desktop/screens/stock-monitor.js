/**
 * @file Monitor de Estoque — Evolução do saldo por material com linhas suaves,
 *       níveis de política sobrepostos e tooltip interativo.
 */
const StockMonitor = {
    // ══════════════════════════════════════════════
    // ══ Estado ══
    // ══════════════════════════════════════════════
    materials: [],
    selectedMaterials: [],
    materialColors: {},
    startDate: null,
    endDate: null,
    _chartPoints: [],
    _materialSelect: null,
    _policyLevels: {}, // { materialName: [{ policy_name, review_type, safety_stock, reorder_point, max_stock }] }

    // ══════════════════════════════════════════════
    // ══ Ciclo de Vida ══
    // ══════════════════════════════════════════════

    /** Retorna o template HTML do monitor de estoque. */
    render() {
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);

        const defaultEnd = this._formatDate(today);
        const defaultStart = this._formatDate(thirtyDaysAgo);

        return `
        <div class="stock-monitor-container">
            <div class="stock-monitor-card">
                <div class="stock-monitor-card-head">
                    <div>
                        <h2 class="stock-monitor-card-title">Monitor de Estoque</h2>
                        <p class="stock-monitor-card-subtitle">Evolução do saldo por material</p>
                    </div>
                </div>

                <div class="stock-monitor-filters">
                    <div class="stock-monitor-material-filter">
                        <label class="stock-monitor-label">Materiais</label>
                        <div id="stockMonitorMaterialSelect"></div>
                    </div>

                    <div class="stock-monitor-date-filter">
                        <label class="stock-monitor-label">Data Início</label>
                        <input type="date" id="stockMonitorStartDate" class="stock-monitor-date-input" value="${defaultStart}">
                    </div>

                    <div class="stock-monitor-date-filter">
                        <label class="stock-monitor-label">Data Fim</label>
                        <input type="date" id="stockMonitorEndDate" class="stock-monitor-date-input" value="${defaultEnd}">
                    </div>
                </div>

                <div class="stock-monitor-legend" id="stockMonitorLegend"></div>

                <div class="stock-monitor-chart-wrap">
                    <canvas id="stockMonitorChart" height="300"></canvas>
                    <div id="stockMonitorTooltip" class="stock-monitor-tooltip"></div>
                </div>
            </div>
        </div>
        `;
    },

    /** Inicializa o módulo: carrega materiais e renderiza o gráfico inicial. */
    async load() {
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) headerOptions.innerHTML = "";

        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);

        this.startDate = this._formatDate(thirtyDaysAgo);
        this.endDate = this._formatDate(today);
        this.selectedMaterials = [];
        this._policyLevels = {};

        if (this._materialSelect) {
            this._materialSelect.destroy();
        }

        this._materialSelect = createSearchSelect({
            id: "stockMonitorMaterial",
            placeholder: "Selecione materiais",
            searchable: true,
            multiple: true,
            sections: [
                { key: "material", label: "Materiais", items: [] }
            ],
            onChange: async ({ values }) => {
                this.selectedMaterials = (values || []).map(v => v.value);
                await this.refresh();
            }
        });
        this._materialSelect.mount(document.getElementById("stockMonitorMaterialSelect"));

        this._bindEvents();

        try {
            const materials = await apiCall(API + "/materials");
            this.materials = (materials || []).map(item => item.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
            this._assignMaterialColors();
            this._materialSelect.setItems("material", this.materials.map(material => ({
                value: material,
                label: material,
                dotColor: this.materialColors[material] || "#64748b"
            })));
            await this.refresh();
        } catch (error) {
            alert("Erro ao carregar materiais para o Monitor de Estoque");
        }
    },

    // ══════════════════════════════════════════════
    // ══ Eventos ══
    // ══════════════════════════════════════════════

    /** Vincula listeners de filtros, dropdown, datas e hover do canvas. */
    _bindEvents() {
        const startInput = document.getElementById("stockMonitorStartDate");
        const endInput = document.getElementById("stockMonitorEndDate");

        if (startInput) {
            startInput.onchange = async () => {
                this.startDate = startInput.value;
                await this.refresh();
            };
        }

        if (endInput) {
            endInput.onchange = async () => {
                this.endDate = endInput.value;
                await this.refresh();
            };
        }

        const canvas = document.getElementById("stockMonitorChart");
        if (canvas) {
            canvas.onmousemove = (e) => this._onChartHover(e);
            canvas.onmouseleave = () => this._onChartLeave();
        }
    },

    // ══════════════════════════════════════════════
    // ══ Seleção de Materiais ══
    // ══════════════════════════════════════════════

    /** Atribui cores da paleta fixa a cada material. */
    _assignMaterialColors() {
        const palette = [
            "#60a5fa",
            "#3b82f6",
            "#2f9e44",
            "#f59f00",
            "#d6336c",
            "#0c8599",
            "#ae3ec9",
            "#e8590c",
            "#1c7ed6",
            "#5c940d"
        ];
        this.materialColors = {};
        this.materials.forEach((material, index) => {
            this.materialColors[material] = palette[index % palette.length];
        });
    },

    /** Renderiza a legenda de cores dos materiais e tipos de linha das políticas. */
    _renderLegend(materials) {
        const legend = document.getElementById("stockMonitorLegend");
        if (!legend) return;

        if (!materials.length) {
            legend.innerHTML = "";
            return;
        }

        legend.innerHTML = materials.map(material => {
            const materialText = this._escapeHtml(material);
            const color = this.materialColors[material] || "#64748b";
            return `
                <span class="stock-monitor-legend-item">
                    <span class="stock-monitor-legend-dot" style="background:${color}"></span>
                    ${materialText}
                </span>
            `;
        }).join("");

        // Show level line type legend if any material has policy levels
        const hasLevels = materials.some(m => this._policyLevels[m]?.length);
        if (hasLevels) {
            legend.innerHTML += `
                <span class="stock-monitor-legend-sep"></span>
                <span class="stock-monitor-legend-item">
                    <span class="stock-monitor-legend-line stock-monitor-legend-line--dotted"></span>
                    Estoque de Segurança
                </span>
                <span class="stock-monitor-legend-item">
                    <span class="stock-monitor-legend-line stock-monitor-legend-line--dashed"></span>
                    Ponto de Repo./Crítico
                </span>
                <span class="stock-monitor-legend-item">
                    <span class="stock-monitor-legend-line stock-monitor-legend-line--longdash"></span>
                    Estoque Máximo
                </span>
            `;
        }
    },

    // ══════════════════════════════════════════════
    // ══ Dados e Atualização ══
    // ══════════════════════════════════════════════

    /** Busca séries de saldo e níveis de política, então redesenha o gráfico. */
    async refresh() {
        const { startDate, endDate, selectedMaterials } = this;

        if (!selectedMaterials.length || !startDate || !endDate) {
            this._renderLegend([]);
            this._drawChart({}, [], startDate, endDate);
            return;
        }

        try {
            const requests = selectedMaterials.map(material => {
                const query = new URLSearchParams({ material, startDate, endDate });
                return apiCall(`${API}/stock-monitor?${query.toString()}`);
            });

            const responses = await Promise.all(requests);

            const seriesByMaterial = {};
            selectedMaterials.forEach((material, i) => {
                const sparse = (responses[i] || []).map(row => ({
                    date: row.date,
                    balance: Number(row.balance || 0)
                }));
                seriesByMaterial[material] = this._fillDailySeries(sparse, startDate, endDate);
            });

            await this._computeAllPolicyLevels();
            this._renderLegend(selectedMaterials);
            this._drawChart(seriesByMaterial, selectedMaterials, startDate, endDate);
        } catch (error) {
            alert("Erro ao carregar dados do Monitor de Estoque");
        }
    },

    /**
     * Preenche todos os dias entre startDate e endDate, propagando o último
     * saldo conhecido para os dias sem evento (carry-forward).
     * @param {Array<{date:string, balance:number}>} sparse - Pontos esparsos da API.
     * @param {string} startDate - Data inicial ISO (YYYY-MM-DD).
     * @param {string} endDate - Data final ISO (YYYY-MM-DD).
     * @returns {Array<{date:string, balance:number}>}
     */
    _fillDailySeries(sparse, startDate, endDate) {
        const balanceByDate = new Map(sparse.map(pt => [pt.date, pt.balance]));
        const result = [];
        const cur = new Date(startDate + "T00:00:00");
        const end = new Date(endDate + "T00:00:00");
        let lastBalance = 0;
        while (cur <= end) {
            const key = this._formatDate(cur);
            if (balanceByDate.has(key)) {
                lastBalance = balanceByDate.get(key);
            }
            result.push({ date: key, balance: lastBalance });
            cur.setDate(cur.getDate() + 1);
        }
        return result;
    },

    /** Calcula os níveis de política (ES, PR/PC, E.Máx) para todos os materiais selecionados. */
    async _computeAllPolicyLevels() {
        this._policyLevels = {};
        await Promise.all(this.selectedMaterials.map(m => this._computeMaterialPolicyLevels(m)));
    },

    /**
     * Carrega os itens de política de um material e calcula ES/PR/E.Máx via forecast.
     * @param {string} materialName - Nome do material.
     */
    async _computeMaterialPolicyLevels(materialName) {
        try {
            const policyItems = await apiCall(
                `${API}/stock-policies/material-levels/${encodeURIComponent(materialName)}`
            );
            if (!policyItems || !policyItems.length) return;

            const levels = [];
            for (const item of policyItems) {
                const kpi = await this._calcKpiForPolicyItem(materialName, item);
                if (kpi) {
                    levels.push({
                        policy_name:   item.policy_name,
                        review_type:   item.review_type,
                        safety_stock:  kpi.safety_stock,
                        reorder_point: kpi.reorder_point,
                        max_stock:     kpi.max_stock
                    });
                }
            }
            if (levels.length) this._policyLevels[materialName] = levels;
        } catch { /* sem níveis */ }
    },

    // ══════════════════════════════════════════════
    // ══ Cálculos de Política ══
    // ══════════════════════════════════════════════

    /**
     * Calcula ES, Ponto de Reposição e Estoque Máximo para um item de política.
     * Obtém consumo histórico, agrega, filtra, projeta demanda via forecast e
     * aplica fórmulas de estoque de segurança.
     * @param {string} materialName - Nome do material.
     * @param {Object} item - Item de política com parâmetros de forecast e lead time.
     * @returns {Promise<{safety_stock:number, reorder_point:number, max_stock:number|null}|null>}
     */
    async _calcKpiForPolicyItem(materialName, item) {
        const serviceLevel     = item.service_level || 95;
        const reviewType       = item.review_type || "continuous";
        const reviewPeriod     = item.review_period || "weekly";
        const reviewPeriodDays = { daily: 1, weekly: 7, monthly: 30, custom: item.review_period_days || 7 }[reviewPeriod] || 7;
        const leadTimeType     = item.lead_time_type || "auto";
        const lt               = leadTimeType === "custom"
            ? (item.policy_lead_time_days || 1)
            : Math.max(item.lead_time_days || 1, 1);

        let model, param, startDate, aggregation, removeZeros, treatOutliers, treatRuptures;
        if (item.forecast_model) {
            model         = item.forecast_model;
            param         = item.forecast_param;
            startDate     = item.forecast_start_date;
            aggregation   = item.forecast_aggregation || "daily";
            removeZeros   = !!item.forecast_remove_zeros;
            treatOutliers = !!item.forecast_treat_outliers;
            treatRuptures = !!item.forecast_treat_ruptures;
        } else if (item.forecast_type === "custom" && item.policy_forecast_model) {
            model         = item.policy_forecast_model;
            param         = item.policy_forecast_param;
            startDate     = null;
            aggregation   = "daily";
            removeZeros   = false;
            treatOutliers = false;
            treatRuptures = false;
        } else {
            return null;
        }

        const today     = new Date();
        const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        const endDate   = this._formatDate(yesterday);
        if (!startDate) {
            const d90 = new Date(today);
            d90.setDate(d90.getDate() - 90);
            startDate = this._formatDate(d90);
        }

        try {
            const query = new URLSearchParams({ material: materialName, startDate, endDate });
            const [rows, stockRows] = await Promise.all([
                apiCall(`${API}/consumption?${query}`),
                apiCall(`${API}/stock-monitor?${query}`)
            ]);

            const aggregated = this._monitorAggregate(rows || [], aggregation, startDate, stockRows || []);
            const filtered   = this._monitorFilter(aggregated, removeZeros, treatOutliers, treatRuptures);
            if (filtered.length < 2) return null;

            const params = { period: param, alpha: param, regressionPeriod: param };
            const fc = this._monitorForecast(filtered, model, params, serviceLevel);
            if (!fc) return null;

            // --- Fórmulas de estoque de segurança ---
            // Converte previsão do período de agregação para demanda diária
            const periodSize   = { daily: 1, weekly: 7, monthly: 30 }[aggregation] || 1;
            const dDaily       = fc.nextForecast / periodSize;
            // Período de exposição: contínuo = lead time; periódico = período de revisão + lead time
            const exposureDays = reviewType === "periodic" ? reviewPeriodDays + lt : lt;
            // ES = Z(nível_serviço) × σ_resíduos × √(exposição / tamanho_período)
            const ss           = fc.z * fc.std * Math.sqrt(exposureDays / periodSize);

            return {
                // ES: estoque de segurança puro
                safety_stock:  Math.max(0, ss),
                // PR = demanda_diária × lead_time + ES
                reorder_point: Math.max(0, dDaily * lt + ss),
                // E.Máx (só periódico) = demanda_diária × (período_revisão + LT) + ES
                max_stock:     reviewType === "periodic"
                    ? Math.max(0, dDaily * (reviewPeriodDays + lt) + ss)
                    : null
            };
        } catch { return null; }
    },

    /**
     * Agrupa registros de consumo em buckets (diário/semanal/mensal),
     * preenche lacunas no período e propaga flag hasStock via carry-forward do saldo.
     * @param {Array} rows - Linhas de consumo {day, consumption}.
     * @param {string} aggregation - Tipo de agregação: daily | weekly | monthly.
     * @param {string} startDate - Data inicial ISO (YYYY-MM-DD).
     * @param {Array} stockRows - Linhas de saldo {date, balance} para carry-forward.
     * @returns {Array<{key:string, value:number, hasStock:boolean}>}
     */
    _monitorAggregate(rows, aggregation, startDate, stockRows) {
        // --- Preenche buckets com consumo acumulado por período ---
        const buckets = new Map();
        rows.forEach(row => {
            const date = new Date(row.day + "T00:00:00");
            let key;
            if (aggregation === "weekly") {
                const d = date.getDay();
                const mon = new Date(date);
                mon.setDate(date.getDate() + (d === 0 ? -6 : 1 - d));
                key = this._formatDate(mon);
            } else if (aggregation === "monthly") {
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            } else {
                key = row.day;
            }
            if (!buckets.has(key)) buckets.set(key, { key, value: 0, hasStock: false });
            buckets.get(key).value += Number(row.consumption || 0);
        });

        // --- Preenche lacunas: garante que todo período entre startDate e hoje tenha bucket ---
        const todayD = new Date();
        todayD.setHours(0, 0, 0, 0);
        let cutoffKey;
        if (aggregation === "weekly") {
            const dow = todayD.getDay();
            const mon = new Date(todayD);
            mon.setDate(todayD.getDate() + (dow === 0 ? -6 : 1 - dow));
            cutoffKey = this._formatDate(mon);
        } else if (aggregation === "monthly") {
            cutoffKey = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, "0")}`;
        } else {
            cutoffKey = this._formatDate(todayD);
        }

        const start = new Date(startDate + "T00:00:00");
        const end   = new Date(cutoffKey  + "T00:00:00");
        if (aggregation === "daily") {
            for (let c = new Date(start); c < end; c.setDate(c.getDate() + 1)) {
                const k = this._formatDate(c);
                if (!buckets.has(k)) buckets.set(k, { key: k, value: 0, hasStock: false });
            }
        } else if (aggregation === "weekly") {
            const c = new Date(start);
            const dow = c.getDay();
            c.setDate(c.getDate() + (dow === 0 ? -6 : 1 - dow));
            while (this._formatDate(c) < cutoffKey) {
                const k = this._formatDate(c);
                if (!buckets.has(k)) buckets.set(k, { key: k, value: 0, hasStock: false });
                c.setDate(c.getDate() + 7);
            }
        } else {
            const c = new Date(start.getFullYear(), start.getMonth(), 1);
            while (`${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}` < cutoffKey) {
                const k = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}`;
                if (!buckets.has(k)) buckets.set(k, { key: k, value: 0, hasStock: false });
                c.setMonth(c.getMonth() + 1);
            }
        }

        const all = Array.from(buckets.values())
            .sort((a, b) => a.key.localeCompare(b.key))
            .filter(b => b.key >= startDate && b.key < cutoffKey);

        // --- hasStock carry-forward: marca cada bucket conforme último saldo positivo até o fim do bucket ---
        const sortedStock = (stockRows || []).filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date));
        if (sortedStock.length > 0) {
            const bucketEnd = (key) => {
                if (aggregation === "daily") return key;
                if (aggregation === "weekly") {
                    const d = new Date(key + "T00:00:00");
                    d.setDate(d.getDate() + 6);
                    return this._formatDate(d);
                }
                const [y, mo] = key.split("-").map(Number);
                return this._formatDate(new Date(y, mo, 0));
            };
            all.forEach(bucket => {
                const endKey = bucketEnd(bucket.key);
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
     * Aplica filtros opcionais: remove zeros, trata rupturas e remove outliers via IQR.
     * @param {Array} data - Buckets agregados.
     * @param {boolean} removeZeros - Remove períodos com consumo zero.
     * @param {boolean} treatOutliers - Remove outliers pelo método IQR (1.5×).
     * @param {boolean} treatRuptures - Remove zeros que ocorreram sem estoque.
     * @returns {Array} Dados filtrados.
     */
    _monitorFilter(data, removeZeros, treatOutliers, treatRuptures) {
        let r = data.slice();
        if (removeZeros)   r = r.filter(d => d.value > 0);
        if (treatRuptures) r = r.filter(d => d.value > 0 || d.hasStock);
        if (treatOutliers && r.length >= 4) {
            const s  = r.map(d => d.value).sort((a, b) => a - b);
            const q1 = s[Math.floor(s.length / 4)];
            const q3 = s[Math.floor(3 * s.length / 4)];
            const iqr = q3 - q1;
            r = r.filter(d => d.value >= q1 - 1.5 * iqr && d.value <= q3 + 1.5 * iqr);
        }
        return r;
    },

    /**
     * Projeta a próxima demanda e calcula desvio-padrão dos resíduos.
     * Métodos suportados: moving-average, exp-smoothing, linear-regression, simple-average.
     * O valor Z do nível de serviço é obtido via aproximação de Abramowitz & Stegun.
     * @param {Array} data - Buckets filtrados {value}.
     * @param {string} method - Modelo de forecast.
     * @param {Object} params - Parâmetros (period, alpha, regressionPeriod).
     * @param {number} serviceLevel - Nível de serviço (ex: 95).
     * @returns {{nextForecast:number, std:number, z:number}|null}
     */
    _monitorForecast(data, method, params, serviceLevel) {
        const values = data.map(d => d.value);
        const n = values.length;
        if (n < 2) return null;
        const residuals = [];
        let nextForecast;

        // --- Cálculo de resíduos por método de forecast ---
        if (method === "moving-average") {
            // Resíduo = valor real − média dos p períodos anteriores
            const p = Math.max(2, Math.min(params.period || 7, n - 1));
            for (let i = p; i < n; i++) {
                residuals.push(values[i] - values.slice(i - p, i).reduce((s, v) => s + v, 0) / p);
            }
            nextForecast = values.slice(n - p).reduce((s, v) => s + v, 0) / p;
        } else if (method === "exp-smoothing") {
            // Resíduo = valor real − suavização exponencial acumulada (fator α)
            const alpha = Math.max(0.01, Math.min(0.99, params.alpha || 0.3));
            let s = values[0];
            for (let i = 1; i < n; i++) { residuals.push(values[i] - s); s = alpha * values[i] + (1 - alpha) * s; }
            nextForecast = s;
        } else if (method === "linear-regression") {
            // Resíduo = valor real − projeção linear dos rp períodos anteriores
            const rp = Math.max(3, Math.min(params.regressionPeriod || 30, n));
            for (let i = rp; i < n; i++) {
                const xs = Array.from({ length: rp }, (_, j) => j);
                const ys = values.slice(i - rp, i);
                const { a, b } = this._monitorLinReg(xs, ys);
                residuals.push(values[i] - Math.max(0, a + b * rp));
            }
            const xs = Array.from({ length: rp }, (_, j) => j);
            const { a, b } = this._monitorLinReg(xs, values.slice(n - rp));
            nextForecast = Math.max(0, a + b * rp);
        } else {
            // Média simples: resíduo = valor real − média acumulada até o ponto
            for (let i = 1; i < n; i++) {
                residuals.push(values[i] - values.slice(0, i).reduce((s, v) => s + v, 0) / i);
            }
            nextForecast = values.reduce((s, v) => s + v, 0) / n;
        }

        // --- Aproximação de Abramowitz & Stegun para Z (quantil da normal padrão) ---
        // Converte nível de serviço (ex: 0.95) em quantil Z usando polinômio racional.
        // Referência: Handbook of Mathematical Functions, fórmula 26.2.23.
        const p = Math.max(0.501, Math.min(0.999, serviceLevel / 100));
        const t = Math.sqrt(-2 * Math.log(1 - p));
        const c = [2.515517, 0.802853, 0.010328], d = [1.432788, 0.189269, 0.001308];
        const z = t - (c[0] + c[1]*t + c[2]*t*t) / (1 + d[0]*t + d[1]*t*t + d[2]*t*t*t);
        // Desvio-padrão dos resíduos (RMSE): mede a dispersão do erro de previsão
        const std = residuals.length ? Math.sqrt(residuals.reduce((s, v) => s + v*v, 0) / residuals.length) : 0;
        return { nextForecast, std, z };
    },

    /**
     * Regressão linear simples (mínimos quadrados).
     * @param {number[]} xs - Valores do eixo X.
     * @param {number[]} ys - Valores do eixo Y.
     * @returns {{a:number, b:number}} Intercepto e coeficiente angular.
     */
    _monitorLinReg(xs, ys) {
        const n = xs.length;
        const sx = xs.reduce((s, v) => s + v, 0), sy = ys.reduce((s, v) => s + v, 0);
        const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
        const sx2 = xs.reduce((s, v) => s + v * v, 0);
        const den = n * sx2 - sx * sx;
        if (den === 0) return { a: sy / n, b: 0 };
        const b = (n * sxy - sx * sy) / den;
        return { a: (sy - b * sx) / n, b };
    },

    // ══════════════════════════════════════════════
    // ══ Gráfico ══
    // ══════════════════════════════════════════════

    /**
     * Desenha o gráfico de linhas suaves no canvas com gradientes, pontos,
     * linhas de referência de política e rótulos de eixo.
     * @param {Object} seriesByMaterial - Séries {material: [{date, balance}]}.
     * @param {string[]} selectedMaterials - Materiais selecionados.
     * @param {string} startDate - Data inicial ISO.
     * @param {string} endDate - Data final ISO.
     */
    _drawChart(seriesByMaterial, selectedMaterials, startDate, endDate) {
        this._chartPoints = [];
        // --- Setup do canvas: dimensão física × DPR para tela retina ---
        const canvas = document.getElementById("stockMonitorChart");
        if (!canvas) return;

        const wrapper = canvas.parentElement;
        const height = 300;
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(canvas.offsetWidth || (wrapper ? wrapper.clientWidth : 640), 300);

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.height = height + "px";

        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const padding = { top: 20, right: 20, bottom: 44, left: 56 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // Calcula balanço máximo global para escala do eixo Y (margem de 15%)
        let maxBalance = 0;
        selectedMaterials.forEach(material => {
            (seriesByMaterial[material] || []).forEach(pt => {
                if (pt.balance > maxBalance) maxBalance = pt.balance;
            });
        });

        const yMax = maxBalance > 0 ? maxBalance * 1.15 : 10;

        // Date range in ms
        const tsStart = startDate ? new Date(startDate).getTime() : 0;
        const tsEnd = endDate ? new Date(endDate).getTime() : tsStart + 1;
        const tsRange = tsEnd - tsStart || 1;

        // --- Eixo Y: grade pontilhada e rótulos formatados (K/M) ---
        const formatY = v => {
            if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + "M";
            if (v >= 1_000) return (v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1) + "K";
            return Math.round(v).toString();
        };

        const gridCount = 4;
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        for (let i = 0; i <= gridCount; i++) {
            const y = padding.top + (chartHeight / gridCount) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        ctx.fillStyle = "#607d9a";
        ctx.font = "12px Arial";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        for (let i = 0; i <= gridCount; i++) {
            const value = yMax - (yMax / gridCount) * i;
            const y = padding.top + (chartHeight / gridCount) * i;
            ctx.fillText(formatY(value), padding.left - 8, y);
        }

        // Mensagem de vazio quando nenhum material selecionado ou sem dados
        if (!selectedMaterials.length || selectedMaterials.every(m => !(seriesByMaterial[m] || []).length)) {
            ctx.fillStyle = "#94a3b8";
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("Selecione materiais e um período para visualizar o saldo.", width / 2, height / 2);
            return;
        }

        // Converte string de data → posição X em pixels
        const dateToX = (dateStr) => {
            const ts = new Date(dateStr + "T00:00:00").getTime();
            return padding.left + ((ts - tsStart) / tsRange) * chartWidth;
        };

        // Converte saldo → posição Y em pixels (invertido: maior saldo = menor Y)
        const balToY = (bal) => {
            return padding.top + chartHeight - (bal / yMax) * chartHeight;
        };

        // --- Renderização de séries: gradiente, linha suave e pontos ---
        selectedMaterials.forEach(material => {
            const data = (seriesByMaterial[material] || []);
            if (!data.length) return;

            const color = this.materialColors[material] || "#3b82f6";

            const pts = data.map(pt => ({
                x: dateToX(pt.date),
                y: balToY(pt.balance),
                balance: pt.balance,
                date: pt.date,
                material
            }));

            // Preenchimento com gradiente vertical (cor do material → transparente)
            const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
            grad.addColorStop(0, this._hexToRgba(color, 0.22));
            grad.addColorStop(1, this._hexToRgba(color, 0.02));

            ctx.save();
            ctx.beginPath();
            this._buildSmoothPath(ctx, pts);
            ctx.lineTo(pts[pts.length - 1].x, padding.top + chartHeight);
            ctx.lineTo(pts[0].x, padding.top + chartHeight);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.restore();

            // Linha suave (monotone cubic) sobre os pontos
            ctx.save();
            ctx.beginPath();
            this._buildSmoothPath(ctx, pts);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.lineJoin = "round";
            ctx.stroke();
            ctx.restore();

            // Pontos (dots) com borda colorida e centro branco
            pts.forEach(pt => {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = "#ffffff";
                ctx.fill();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.5;
                ctx.stroke();

                this._chartPoints.push(pt);
            });
        });

        // ── Policy level reference lines ────────────────────────────────────
        const levelDefs = [
            { key: "safety_stock",  alpha: 0.55, dash: [3, 5]  },
            { key: "reorder_point", alpha: 0.75, dash: [9, 5]  },
            { key: "max_stock",     alpha: 0.90, dash: [16, 5] },
        ];
        const levelLabels = {
            safety_stock:  "ES",
            reorder_point: { continuous: "PR", periodic: "PC" },
            max_stock:     "E.Máx"
        };

        // Track used Y positions to offset overlapping labels
        const usedLabelY = [];

        selectedMaterials.forEach(material => {
            const levelSets = this._policyLevels[material];
            if (!levelSets || !levelSets.length) return;
            const color = this.materialColors[material] || "#3b82f6";

            levelSets.forEach(levelSet => {
                levelDefs.forEach(({ key, alpha, dash }) => {
                    const value = levelSet[key];
                    if (value === null || value === undefined) return;

                    const y = balToY(value);
                    if (y < padding.top || y > padding.top + chartHeight) return;

                    ctx.save();
                    ctx.setLineDash(dash);
                    ctx.strokeStyle = this._hexToRgba(color, alpha);
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(padding.left, y);
                    ctx.lineTo(padding.left + chartWidth, y);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Rótulo: desloca verticalmente para evitar sobreposição
                    const lbl = key === "reorder_point"
                        ? (levelSet.review_type === "periodic" ? "PC" : "PR")
                        : levelLabels[key];
                    let labelY = y - 3;
                    while (usedLabelY.some(uy => Math.abs(uy - labelY) < 11)) labelY -= 11;
                    usedLabelY.push(labelY);

                    ctx.font = "10px Arial";
                    ctx.fillStyle = this._hexToRgba(color, alpha + 0.1);
                    ctx.textAlign = "right";
                    ctx.textBaseline = "bottom";
                    ctx.fillText(`${lbl} ${this._formatValue(value)}`, padding.left + chartWidth - 4, labelY);
                    ctx.restore();
                });
            });
        });

        // --- Eixo X: amostragem inteligente de datas para evitar sobreposição ---
        const allDates = [];
        selectedMaterials.forEach(material => {
            (seriesByMaterial[material] || []).forEach(pt => {
                if (!allDates.includes(pt.date)) allDates.push(pt.date);
            });
        });
        allDates.sort();

        const minLabelSpacing = 60;
        let lastLabelX = -Infinity;
        ctx.fillStyle = "#607d9a";
        ctx.font = "11px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        allDates.forEach(dateStr => {
            const x = dateToX(dateStr);
            if (x - lastLabelX < minLabelSpacing) return;
            lastLabelX = x;
            const parts = dateStr.split("-");
            const label = `${parts[2]}/${parts[1]}`;
            ctx.fillText(label, x, padding.top + chartHeight + 10);
        });
    },

    /**
     * Constrói caminho suave no canvas usando interpolação cúbica monotone (Fritsch-Carlson).
     * Garante que a curva passe por todos os pontos sem overshoot.
     * @param {CanvasRenderingContext2D} ctx - Contexto 2D do canvas.
     * @param {Array<{x:number, y:number}>} pts - Pontos ordenados por X.
     */
    _buildSmoothPath(ctx, pts) {
        if (!pts.length) return;
        if (pts.length === 1) {
            ctx.moveTo(pts[0].x, pts[0].y);
            return;
        }
        if (pts.length === 2) {
            ctx.moveTo(pts[0].x, pts[0].y);
            ctx.lineTo(pts[1].x, pts[1].y);
            return;
        }

        const n = pts.length;

        // --- Fritsch-Carlson monotone cubic interpolation ---
        // 1. Calcula inclinações (Δy/Δx) entre pontos consecutivos
        const slopes = [];
        for (let i = 0; i < n - 1; i++) {
            const dx = pts[i + 1].x - pts[i].x;
            slopes.push(dx === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx);
        }

        // 2. Tangentes iniciais: média das inclinações vizinhas
        const m = new Array(n);
        m[0] = slopes[0];
        m[n - 1] = slopes[n - 2];
        for (let i = 1; i < n - 1; i++) {
            m[i] = (slopes[i - 1] + slopes[i]) / 2;
        }

        // 3. Restrição de monotonicidade Fritsch-Carlson: limita α²+β² ≤ 9
        //    para evitar overshoot e manter a curva monotone entre pontos
        for (let i = 0; i < n - 1; i++) {
            if (slopes[i] === 0) {
                m[i] = 0;
                m[i + 1] = 0;
            } else {
                const alpha = m[i] / slopes[i];
                const beta = m[i + 1] / slopes[i];
                const s = alpha * alpha + beta * beta;
                if (s > 9) {
                    const t = 3 / Math.sqrt(s);
                    m[i] = alpha * t * slopes[i];
                    m[i + 1] = beta * t * slopes[i];
                }
            }
        }

        // 4. Desenha curvas Bézier cúbicas — pontos de controle derivados das tangentes
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < n - 1; i++) {
            const dx = pts[i + 1].x - pts[i].x;
            const cp1x = pts[i].x + dx / 3;
            const cp1y = pts[i].y + m[i] * dx / 3;
            const cp2x = pts[i + 1].x - dx / 3;
            const cp2y = pts[i + 1].y - m[i + 1] * dx / 3;
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, pts[i + 1].x, pts[i + 1].y);
        }
    },

    /**
     * Converte cor hexadecimal para string rgba.
     * @param {string} hex - Cor em formato #RRGGBB.
     * @param {number} alpha - Opacidade (0–1).
     * @returns {string} Cor no formato rgba(...).
     */
    _hexToRgba(hex, alpha) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return `rgba(100,116,139,${alpha})`;
        return `rgba(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)},${alpha})`;
    },

    // ══════════════════════════════════════════════
    // ══ Tooltip ══
    // ══════════════════════════════════════════════

    /**
     * Exibe tooltip interativo ao passar o mouse sobre o gráfico.
     * Snap ao ponto mais próximo no eixo X dentro de SNAP_RADIUS pixels.
     * @param {MouseEvent} e - Evento de mousemove no canvas.
     */
    _onChartHover(e) {
        const canvas = document.getElementById("stockMonitorChart");
        const tooltip = document.getElementById("stockMonitorTooltip");
        if (!canvas || !tooltip) return;

        const mx = e.offsetX;

        const SNAP_RADIUS = 30;
        let closest = null;
        let closestDist = Infinity;

        this._chartPoints.forEach(pt => {
            const dist = Math.abs(pt.x - mx);
            if (dist < SNAP_RADIUS && dist < closestDist) {
                closestDist = dist;
                closest = pt;
            }
        });

        if (!closest) {
            tooltip.style.display = "none";
            return;
        }

        // Gather all series for that date
        const datePoints = this._chartPoints.filter(pt => pt.date === closest.date);

        const parts = closest.date.split("-");
        const dateLabel = `${parts[2]}/${parts[1]}/${parts[0]}`;

        const lines = datePoints.map(pt => {
            const color = this.materialColors[pt.material] || "#64748b";
            return `<div class="stock-monitor-tooltip-row">
                <span class="stock-monitor-tooltip-dot" style="background:${color}"></span>
                <span class="stock-monitor-tooltip-name">${this._escapeHtml(pt.material)}</span>
                <span class="stock-monitor-tooltip-val">${this._formatValue(pt.balance)}</span>
            </div>`;
        }).join("");

        tooltip.innerHTML = `<div class="stock-monitor-tooltip-header">${dateLabel}</div>${lines}`;
        tooltip.style.display = "block";

        const wrap = canvas.parentElement;
        const wrapRect = wrap.getBoundingClientRect();
        let tx = e.clientX - wrapRect.left + 14;
        let ty = e.clientY - wrapRect.top + 14;

        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;
        if (tx + tw > wrapRect.width - 4) tx = e.clientX - wrapRect.left - tw - 14;
        if (ty + th > wrapRect.height - 4) ty = e.clientY - wrapRect.top - th - 14;

        tooltip.style.left = tx + "px";
        tooltip.style.top = ty + "px";
    },

    /** Esconde o tooltip ao sair do canvas. */
    _onChartLeave() {
        const tooltip = document.getElementById("stockMonitorTooltip");
        if (tooltip) tooltip.style.display = "none";
    },

    // ══════════════════════════════════════════════
    // ══ Utilitários ══
    // ══════════════════════════════════════════════

    /**
     * Formata valor numérico com sufixo K/M para exibição compacta.
     * @param {number} v - Valor a formatar.
     * @returns {string}
     */
    _formatValue(v) {
        if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
        if (v >= 1_000) return (v / 1_000).toFixed(2) + "K";
        return Number(v).toFixed(2);
    },

    /**
     * Formata objeto Date para string ISO (YYYY-MM-DD).
     * @param {Date} date
     * @returns {string}
     */
    _formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    },

    /**
     * Escapa caracteres HTML para prevenir XSS em conteúdo dinâmico.
     * @param {*} value
     * @returns {string}
     */
    _escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
};
