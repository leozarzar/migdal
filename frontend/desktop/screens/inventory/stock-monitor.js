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
                    <div id="stockMonitorEmptyState" class="stock-monitor-empty-state">
                        <span class=\"stock-monitor-empty-icon material-symbols-outlined\">inventory_2</span>
                        <p class="stock-monitor-empty-title">Nenhum material selecionado</p>
                        <p class="stock-monitor-empty-subtitle">Escolha ao menos um material e um período para visualizar a evolução do saldo.</p>
                    </div>
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

        this.startDate = localStorage.getItem('wcm.stockMonitor.startDate') || this._formatDate(thirtyDaysAgo);
        this.endDate   = localStorage.getItem('wcm.stockMonitor.endDate')   || this._formatDate(today);
        this.selectedMaterials = [];
        this._policyLevels = {};

        if (this._materialSelect) {
            this._materialSelect.destroy();
        }

        this._materialSelect = createSearchSelect({
            id: "stockMonitorMaterial",
            placeholder: "Selecione um material",
            searchable: true,
            multiple: false,
            sections: [
                { key: "material", label: "Materiais", items: [] }
            ],
            onChange: async ({ value }) => {
                this.selectedMaterials = value != null ? [value] : [];
                localStorage.setItem('wcm.stockMonitor.material', value || '');
                await this.refresh();
            }
        });
        this._materialSelect.mount(document.getElementById("stockMonitorMaterialSelect"));

        this._bindEvents();

        try {
            const _loc = AppState.getLocationFilter();
            const _matQ = new URLSearchParams({ hasMovements: '1' });
            if (_loc) _matQ.set('location_id', _loc);
            const materials = await apiCall(`${API}/materials?${_matQ}`);
            this.materials = (materials || []).map(item => item.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
            this._assignMaterialColors();
            this._materialSelect.setItems("material", this.materials.map(material => ({
                value: material,
                label: material,
                dotColor: this.materialColors[material] || "#64748b"
            })));

            // Restore saved material selection
            const savedMaterial = localStorage.getItem('wcm.stockMonitor.material') || '';
            if (savedMaterial && this.materials.includes(savedMaterial)) {
                this.selectedMaterials = [savedMaterial];
                this._materialSelect.select('material', savedMaterial);
            }

            // Sync date inputs with (possibly restored) values
            const startInput = document.getElementById('stockMonitorStartDate');
            const endInput   = document.getElementById('stockMonitorEndDate');
            if (startInput) startInput.value = this.startDate;
            if (endInput)   endInput.value   = this.endDate;

            await this.refresh();
        } catch (error) {
            alert("Erro ao carregar materiais para o Monitor de Estoque");
        }
    },
    async onTabFocus() { return this.load(); },
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
                localStorage.setItem('wcm.stockMonitor.startDate', this.startDate);
                await this.refresh();
            };
        }

        if (endInput) {
            endInput.onchange = async () => {
                this.endDate = endInput.value;
                localStorage.setItem('wcm.stockMonitor.endDate', this.endDate);
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
                    <span class="stock-monitor-legend-line"></span>
                    Estoque de Segurança
                </span>
                <span class="stock-monitor-legend-item">
                    <span class="stock-monitor-legend-line"></span>
                    Ponto de Repo./Crítico
                </span>
                <span class="stock-monitor-legend-item">
                    <span class="stock-monitor-legend-line"></span>
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
                const loc = AppState.getLocationFilter();
                if (loc) query.set('location_id', loc);
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

        const canvas = document.getElementById("stockMonitorChart");
        if (!canvas) return;

        const height      = 300;
        const { ctx, width } = CanvasChartUtils.setupCanvas(canvas, height);
        const padding     = { top: 20, right: 20, bottom: 44, left: 56 };
        const chartWidth  = width  - padding.left - padding.right;
        const chartHeight = height - padding.top  - padding.bottom;

        let maxBalance = 0;
        selectedMaterials.forEach(material =>
            (seriesByMaterial[material] || []).forEach(pt => {
                if (pt.balance > maxBalance) maxBalance = pt.balance;
            })
        );
        const yMax = maxBalance > 0 ? maxBalance * 1.15 : 10;

        const emptyState = document.getElementById("stockMonitorEmptyState");
        const isEmpty = !selectedMaterials.length || selectedMaterials.every(m => !(seriesByMaterial[m] || []).length);

        if (isEmpty) {
            canvas.style.display = "none";
            if (emptyState) emptyState.style.display = "flex";
            return;
        }

        canvas.style.display = "";
        if (emptyState) emptyState.style.display = "none";

        CanvasChartUtils.drawYAxis(ctx, padding, chartWidth, chartHeight, yMax, { withGrid: false });

        const tsStart = startDate ? new Date(startDate).getTime() : 0;
        const tsEnd   = endDate   ? new Date(endDate).getTime()   : tsStart + 1;
        const tsRange = tsEnd - tsStart || 1;

        const dateToX = dateStr => padding.left + ((new Date(dateStr + "T00:00:00").getTime() - tsStart) / tsRange) * chartWidth;
        const balToY  = bal     => padding.top + chartHeight - (bal / yMax) * chartHeight;

        // --- Séries: gradiente + linha suave + pontos ---
        selectedMaterials.forEach(material => {
            const data = seriesByMaterial[material] || [];
            if (!data.length) return;
            const color = this.materialColors[material] || "#3b82f6";
            const pts = data.map(pt => ({
                x: dateToX(pt.date),
                y: balToY(pt.balance),
                balance: pt.balance,
                date: pt.date,
                material,
            }));
            CanvasChartUtils.drawLineSeries(ctx, pts, color, padding, chartHeight, this._chartPoints);
        });

        // ── Linhas de referência das políticas ───────────────────────────────
        const levelDefs = [
            { key: "safety_stock",  alpha: 0.45, dash: [6, 4] },
            { key: "reorder_point", alpha: 0.65, dash: [6, 4] },
            { key: "max_stock",     alpha: 0.85, dash: [6, 4] },
        ];
        const levelLbl = { safety_stock: "ES", max_stock: "E.Máx" };
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
                    ctx.strokeStyle = CanvasChartUtils.hexToRgba(color, alpha);
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(padding.left, y);
                    ctx.lineTo(padding.left + chartWidth, y);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    const lbl = key === "reorder_point"
                        ? (levelSet.review_type === "periodic" ? "PC" : "PR")
                        : levelLbl[key];
                    let labelY = y - 3;
                    while (usedLabelY.some(uy => Math.abs(uy - labelY) < 11)) labelY -= 11;
                    usedLabelY.push(labelY);

                    ctx.font         = "10px Arial";
                    ctx.fillStyle    = CanvasChartUtils.hexToRgba(color, alpha + 0.1);
                    ctx.textAlign    = "right";
                    ctx.textBaseline = "bottom";
                    ctx.fillText(`${lbl} ${this._formatValue(value)}`, padding.left + chartWidth - 4, labelY);
                    ctx.restore();
                });
            });
        });

        // ── Eixo X: amostragem inteligente ───────────────────────────────────
        const allDates = [];
        selectedMaterials.forEach(material =>
            (seriesByMaterial[material] || []).forEach(pt => {
                if (!allDates.includes(pt.date)) allDates.push(pt.date);
            })
        );
        allDates.sort();

        const minLabelSpacing = 60;
        let lastLabelX = -Infinity;
        ctx.fillStyle    = "#607d9a";
        ctx.font         = "11px Arial";
        ctx.textAlign    = "center";
        ctx.textBaseline = "top";
        allDates.forEach(dateStr => {
            const x = dateToX(dateStr);
            if (x - lastLabelX < minLabelSpacing) return;
            lastLabelX = x;
            const [y, mo, d] = dateStr.split("-");
            ctx.fillText(`${d}/${mo}`, x, padding.top + chartHeight + 10);
        });
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

        CanvasChartUtils.positionTooltip(tooltip, e, canvas.parentElement);
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
