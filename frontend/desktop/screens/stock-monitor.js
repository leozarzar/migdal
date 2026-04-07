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
        const policyItem = {
            forecast_model:          item.forecast_model,
            forecast_param:          item.forecast_param,
            forecast_start_date:     item.forecast_start_date,
            forecast_aggregation:    item.forecast_aggregation,
            forecast_remove_zeros:   item.forecast_remove_zeros,
            forecast_treat_outliers: item.forecast_treat_outliers,
            forecast_treat_ruptures: item.forecast_treat_ruptures,
            lead_time_days: item.lead_time_type !== 'custom'
                ? Math.max(item.lead_time_days || 1, 1)
                : null,
        };
        const policyData = {
            service_level:      item.service_level,
            review_type:        item.review_type,
            review_period:      item.review_period,
            review_period_days: item.review_period_days,
            lead_time_type:     item.lead_time_type,
            lead_time_days:     item.policy_lead_time_days,
            forecast_type:      item.forecast_type,
            forecast_model:     item.policy_forecast_model,
            forecast_param:     item.policy_forecast_param,
        };
        const kpi = await StockPolicyUtils.computeItemKpis(materialName, policyItem, policyData, async () => 1);
        if (kpi.safetyStock === null) return null;
        return {
            safety_stock:  kpi.safetyStock,
            reorder_point: kpi.reorderPoint,
            max_stock:     kpi.maxStock,
        };
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
    _buildSmoothPath: (ctx, pts) => StockPolicyUtils.buildSmoothPath(ctx, pts),

    /**
     * Converte cor hexadecimal para string rgba.
     * @param {string} hex - Cor em formato #RRGGBB.
     * @param {number} alpha - Opacidade (0–1).
     * @returns {string} Cor no formato rgba(...).
     */
    _hexToRgba: (hex, alpha) => StockPolicyUtils.hexToRgba(hex, alpha),

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
    _formatValue: v => StockPolicyUtils.formatValue(v),
    _formatDate:  d => StockPolicyUtils.formatDate(d),
    _escapeHtml:  v => StockPolicyUtils.escapeHtml(v),
};
