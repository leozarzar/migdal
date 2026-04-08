/**
 * @file dashboard.js
 * @description Tela principal do sistema WCM — exibe gráfico de consumo semanal
 *              empilhado por material e painel de balanço de estoque baseado na
 *              política selecionada. Integra cálculos estatísticos (média móvel,
 *              suavização exponencial, regressão linear) para determinar estoque
 *              de segurança, ponto de reposição e estoque máximo.
 */

const Dashboard = {

    // ═══════════════════════════════════════════════════════════════════════════
    // Estado
    // ═══════════════════════════════════════════════════════════════════════════

    weekStart: null,
    materials: [],
    selectedMaterials: [],
    materialColors: {},
    _chartSegments: [],
    _outsideClickHandler: null,

    policies: [],
    _selectedPolicyId: null,
    _policyFull: null,
    _balanceRows: [],
    _leadTimeCache: {},
    _materialColorMap: {},

    // ═══════════════════════════════════════════════════════════════════════════
    // Ciclo de Vida
    // ═══════════════════════════════════════════════════════════════════════════

    /** @returns {string} HTML do layout principal (topbar, gráfico, balanço). */
    render() {
        return `
        <div class="consumption-container">

            <div class="consumption-topbar">
                <div class="consumption-topbar-field">
                    <label class="consumption-label" for="consumptionPolicySelect">Política de Estoque</label>
                    <select class="consumption-policy-select" id="consumptionPolicySelect">
                        <option value="">Selecione uma política...</option>
                    </select>
                </div>
            </div>

            <div class="consumption-card">
                <div class="consumption-card-head">
                    <div class="consumption-card-title-wrap">
                        <h2 class="consumption-card-title">Consumo</h2>
                        <p class="consumption-card-subtitle">Acompanhamento semanal por material</p>
                    </div>

                    <div class="consumption-week-nav">
                        <button class="consumption-nav-btn" id="weekPrevBtn" type="button" title="Semana anterior">
                            <span class="material-symbols-outlined">chevron_left</span>
                        </button>
                        <div class="consumption-week-range" id="weekRange">-</div>
                        <button class="consumption-nav-btn" id="weekNextBtn" type="button" title="Próxima semana">
                            <span class="material-symbols-outlined">chevron_right</span>
                        </button>
                    </div>

                    <button id="consumptionRefreshBtn" class="consumption-btn" type="button" style="display:none">Atualizar</button>
                </div>

                <div class="consumption-legend" id="consumptionLegend"></div>

                <div class="consumption-chart-wrap">
                    <canvas id="consumptionChart" height="200"></canvas>
                    <div id="consumptionEmptyState" class="consumption-empty-state">
                        <span class="consumption-empty-icon material-symbols-outlined">bar_chart</span>
                        <p class="consumption-empty-title">Sem consumo registrado</p>
                        <p class="consumption-empty-subtitle">Não há consumo registrado para os filtros selecionados nesta semana.</p>
                    </div>
                </div>
                <div id="consumptionTooltip" class="consumption-tooltip"></div>
            </div>

            <div class="consumption-balance-card">
                <div class="consumption-balance-head">
                    <div>
                        <h2 class="consumption-balance-title">Balanço de Estoque</h2>
                        <p class="consumption-balance-subtitle">Níveis por material vs. parâmetros da política selecionada</p>
                    </div>
                    <button id="consumptionBalanceRefreshBtn" class="consumption-btn" type="button" style="display:none">Atualizar</button>
                </div>
                <div id="consumptionBalanceBody">
                    <p class="consumption-balance-empty">Selecione uma política de estoque para visualizar o balanço.</p>
                </div>
            </div>

        </div>
        `;
    },

    /** Inicializa o dashboard: carrega materiais e políticas, bindeia eventos. */
    async load() {
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) headerOptions.innerHTML = "";

        const _savedWeek = localStorage.getItem('wcm.dashboard.weekStart');
        this.weekStart = _savedWeek ? new Date(_savedWeek + 'T00:00:00') : this._startOfWeek(new Date());
        this._selectedPolicyId = localStorage.getItem('wcm.dashboard.policyId') || null;
        this._policyFull = null;
        this._balanceRows = [];
        this._leadTimeCache = {};

        this._bindEvents();

        try {
            const [materials, policies] = await Promise.all([
                apiCall(API + "/materials"),
                apiCall(API + "/stock-policies")
            ]);
            this.materials = (materials || []).map(item => item.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
            this._materialColorMap = Object.fromEntries(
                (materials || []).filter(m => m.name && m.color).map(m => [m.name, m.color])
            );
            this.policies = policies || [];
            this.selectedMaterials = [];
            this._assignMaterialColors();
            this._renderPoliciesSelect();
            await this._onPolicyChange();
        } catch (error) {
            alert("Erro ao carregar dados de consumo");
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Eventos
    // ═══════════════════════════════════════════════════════════════════════════

    /** Bindeia cliques de navegação, seleção de política, dropdown e hover do canvas. */
    _bindEvents() {
        const prevBtn = document.getElementById("weekPrevBtn");
        const nextBtn = document.getElementById("weekNextBtn");
        const refreshBtn = document.getElementById("consumptionRefreshBtn");
        const policySelect = document.getElementById("consumptionPolicySelect");
        const balanceRefreshBtn = document.getElementById("consumptionBalanceRefreshBtn");

        if (prevBtn) {
            prevBtn.onclick = async () => {
                this.weekStart.setDate(this.weekStart.getDate() - 7);
                localStorage.setItem('wcm.dashboard.weekStart', this._formatDate(this.weekStart));
                await this.refresh();
            };
        }

        if (nextBtn) {
            nextBtn.onclick = async () => {
                this.weekStart.setDate(this.weekStart.getDate() + 7);
                localStorage.setItem('wcm.dashboard.weekStart', this._formatDate(this.weekStart));
                await this.refresh();
            };
        }

        if (policySelect) {
            policySelect.onchange = () => this._onPolicyChange();
        }

        if (balanceRefreshBtn) {
            balanceRefreshBtn.onclick = async () => this._computeBalanceData();
        }

        if (refreshBtn) {
            refreshBtn.onclick = async () => {
                await this.refresh();
            };
        }

        const canvas = document.getElementById("consumptionChart");
        if (canvas) {
            canvas.onmousemove = (e) => this._onChartHover(e);
            canvas.onmouseleave = () => this._onChartLeave();
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Seleção de Materiais
    // ═══════════════════════════════════════════════════════════════════════════

    /** Atribui cor a cada material (usa cor cadastrada ou paleta padrão). */
    _assignMaterialColors() {
        const palette = [
            "#3b5bdb",
            "#2f9e44",
            "#f59f00",
            "#d6336c",
            "#0c8599",
            "#ae3ec9",
            "#e8590c",
            "#1c7ed6",
            "#5c940d",
            "#c2255c"
        ];

        this.materialColors = {};
        let paletteIndex = 0;
        this.materials.forEach(material => {
            if (this._materialColorMap && this._materialColorMap[material]) {
                this.materialColors[material] = this._materialColorMap[material];
            } else {
                this.materialColors[material] = palette[paletteIndex % palette.length];
                paletteIndex++;
            }
        });
    },

    /** Renderiza checkboxes de materiais no dropdown. */
    _renderMaterialsDropdown() {
        const dropdown = document.getElementById("consumptionMaterialDropdown");
        if (!dropdown) return;

        if (!this.materials.length) {
            dropdown.innerHTML = '<div class="consumption-dropdown-empty">Nenhum material disponível</div>';
            return;
        }

        dropdown.innerHTML = this.materials.map(material => {
            const materialText = this._escapeHtml(material);
            const materialAttr = encodeURIComponent(material);
            const checked = this.selectedMaterials.includes(material) ? "checked" : "";
            return `
                <label class="consumption-option">
                    <input type="checkbox" value="${materialAttr}" ${checked}>
                    <span>${materialText}</span>
                </label>
            `;
        }).join("");

        dropdown.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.onchange = async (event) => {
                const material = decodeURIComponent(event.target.value || "");
                if (event.target.checked) {
                    if (!this.selectedMaterials.includes(material)) {
                        this.selectedMaterials.push(material);
                    }
                } else {
                    this.selectedMaterials = this.selectedMaterials.filter(item => item !== material);
                }

                this._renderSelectedTags();
                await this.refresh();
            };
        });
    },

    /** Renderiza as tags dos materiais selecionados na topbar. */
    _renderSelectedTags() {
        const tagsContainer = document.getElementById("consumptionSelectedTags");
        if (!tagsContainer) return;

        if (!this.selectedMaterials.length) {
            tagsContainer.innerHTML = '<span class="consumption-placeholder">Selecione materiais</span>';
            return;
        }

        tagsContainer.innerHTML = this.selectedMaterials.map(material => {
            const materialText = this._escapeHtml(material);
            const materialAttr = encodeURIComponent(material);
            const color = this.materialColors[material] || "#64748b";
            return `
                <span class="consumption-tag">
                    <span class="consumption-tag-dot" style="background:${color}"></span>
                    ${materialText}
                    <button class="consumption-tag-remove" type="button" data-material="${materialAttr}" aria-label="Remover ${materialText}">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </span>
            `;
        }).join("");

        tagsContainer.querySelectorAll(".consumption-tag-remove").forEach(button => {
            button.onclick = async (event) => {
                event.stopPropagation();
                const material = decodeURIComponent(button.getAttribute("data-material") || "");
                this.selectedMaterials = this.selectedMaterials.filter(item => item !== material);
                this._renderSelectedTags();
                this._renderMaterialsDropdown();
                await this.refresh();
            };
        });
    },

    /** @returns {string[]} Cópia do array de materiais selecionados. */
    _getSelectedMaterials() {
        return [...this.selectedMaterials];
    },

    /** Renderiza a legenda de cores abaixo do título do gráfico. */
    _renderLegend(materials) {
        const legend = document.getElementById("consumptionLegend");
        if (!legend) return;

        if (!materials.length) {
            legend.innerHTML = "";
            return;
        }

        legend.innerHTML = materials.map(material => {
            const materialText = this._escapeHtml(material);
            const color = this.materialColors[material] || "#64748b";
            return `
                <span class="consumption-legend-item">
                    <span class="consumption-legend-dot" style="background:${color}"></span>
                    ${materialText}
                </span>
            `;
        }).join("");
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Utilitários
    // ═══════════════════════════════════════════════════════════════════════════

    /** Escapa caracteres HTML para prevenção de XSS. */
    _escapeHtml: v => StockPolicyUtils.escapeHtml(v),

    /** Retorna domingo (início) da semana da data informada. */
    _startOfWeek(date) {
        const base = new Date(date);
        base.setHours(0, 0, 0, 0);
        const day = base.getDay();
        base.setDate(base.getDate() - day);
        return base;
    },

    /** Formata data como `YYYY-MM-DD`. */
    _formatDate: d => StockPolicyUtils.formatDate(d),

    /** Formata data no padrão brasileiro `DD/MM/AAAA`. */
    _formatDatePtBr(date) {
        return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    },

    /** @returns {Date[]} Array com os 7 dias da semana corrente. */
    _getWeekDays() {
        const days = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(this.weekStart);
            date.setDate(this.weekStart.getDate() + i);
            days.push(date);
        }
        return days;
    },

    /** Atualiza o label de intervalo de datas no cabeçalho do gráfico. */
    _updateWeekLabel() {
        const weekDays = this._getWeekDays();
        const start = weekDays[0];
        const end = weekDays[6];
        const rangeLabel = document.getElementById("weekRange");
        if (rangeLabel) {
            rangeLabel.textContent = `${this._formatDatePtBr(start)} → ${this._formatDatePtBr(end)}`;
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Gráfico de Consumo
    // ═══════════════════════════════════════════════════════════════════════════

    /** Busca consumo da semana para cada material selecionado e redesenha o gráfico. */
    async refresh() {
        this._updateWeekLabel();

        const selectedMaterials = this._getSelectedMaterials();
        const weekDays = this._getWeekDays();
        const startDate = this._formatDate(weekDays[0]);
        const endDate = this._formatDate(weekDays[6]);

        if (!selectedMaterials.length) {
            this._renderLegend([]);
            this._drawStackedChart(weekDays, {}, []);
            return;
        }

        try {
            const requests = selectedMaterials.map(material => {
                const query = new URLSearchParams({
                    startDate,
                    endDate,
                    material
                });
                return apiCall(`${API}/consumption?${query.toString()}`);
            });

            const responses = await Promise.all(requests);
            const seriesByMaterial = this._aggregateByMaterialAndDay(weekDays, selectedMaterials, responses);
            const totalByDay = this._sumDays(weekDays, selectedMaterials, seriesByMaterial);
            const totalConsumption = totalByDay.reduce((sum, value) => sum + value, 0);

            this._renderLegend(selectedMaterials);
            this._drawStackedChart(weekDays, seriesByMaterial, selectedMaterials);
        } catch (error) {
            alert("Erro ao carregar dados de consumo");
        }
    },

    /**
     * Agrupa consumo por material e dia da semana.
     * @param {Date[]} weekDays - Dias da semana.
     * @param {string[]} selectedMaterials - Materiais selecionados.
     * @param {Array[]} responses - Respostas da API (uma por material).
     * @returns {Object} Map material → array[7] de consumo diário.
     */
    _aggregateByMaterialAndDay(weekDays, selectedMaterials, responses) {
        const series = {};

        selectedMaterials.forEach(material => {
            series[material] = new Map(weekDays.map(day => [this._formatDate(day), 0]));
        });

        responses.forEach((rows, index) => {
            const material = selectedMaterials[index];
            const materialMap = series[material];
            if (!materialMap) return;

            (rows || []).forEach(row => {
                const dayKey = row.day;
                const value = Number(row.consumption || 0);
                if (!materialMap.has(dayKey)) return;
                materialMap.set(dayKey, materialMap.get(dayKey) + value);
            });
        });

        const normalized = {};
        selectedMaterials.forEach(material => {
            normalized[material] = weekDays.map(day => series[material].get(this._formatDate(day)) || 0);
        });

        return normalized;
    },

    /** Soma o consumo de todos os materiais por dia (para o eixo Y do gráfico). */
    _sumDays(weekDays, selectedMaterials, seriesByMaterial) {
        return weekDays.map((_, dayIndex) => {
            return selectedMaterials.reduce((sum, material) => {
                const value = (seriesByMaterial[material] && seriesByMaterial[material][dayIndex]) || 0;
                return sum + value;
            }, 0);
        });
    },

    /** Atualiza o texto de resumo (período, qtd materiais, consumo total). */
    _setSummary(startDate, endDate, materialCount, totalConsumption) {
        const summary = document.getElementById("consumptionSummary");
        if (!summary) return;

        const formattedTotal = Number(totalConsumption || 0).toFixed(2);
        const materialsText = materialCount === 1 ? "1 material" : `${materialCount} materiais`;

        summary.textContent = `Período: ${startDate} a ${endDate} | Selecionados: ${materialsText} | Consumo total: ${formattedTotal}`;
    },

    /**
     * Desenha o gráfico empilhado (stacked bar chart) no canvas.
     * Cada barra representa um dia; os segmentos coloridos empilham o consumo
     * de cada material de baixo para cima.
     */
    _drawStackedChart(weekDays, seriesByMaterial, selectedMaterials) {
        this._chartSegments = [];
        const canvas = document.getElementById("consumptionChart");
        if (!canvas) return;

        const height = 200;
        const { ctx, width } = CanvasChartUtils.setupCanvas(canvas, height);
        const padding     = { top: 20, right: 20, bottom: 44, left: 46 };
        const chartWidth  = width  - padding.left - padding.right;
        const chartHeight = height - padding.top  - padding.bottom;

        const totalsByDay = weekDays.map((_, dayIndex) =>
            selectedMaterials.reduce((sum, material) =>
                sum + ((seriesByMaterial[material] && seriesByMaterial[material][dayIndex]) || 0), 0)
        );

        // yMax = maior total diário + 10% de margem superior
        const maxValue = Math.max(...totalsByDay, 0);
        const yMax = maxValue > 0 ? maxValue * 1.1 : 10;

        const emptyState = document.getElementById("consumptionEmptyState");

        if (maxValue === 0) {
            canvas.style.display = "none";
            if (emptyState) emptyState.style.display = "flex";
            return;
        }

        canvas.style.display = "";
        if (emptyState) emptyState.style.display = "none";

        CanvasChartUtils.drawYAxis(ctx, padding, chartWidth, chartHeight, yMax, { withGrid: false });

        // Largura de cada slot e barra (máx. 54px, 62% do slot)
        const slotCount = weekDays.length || 1;
        const slotWidthSafe = chartWidth / slotCount;
        const barWidthSafe = Math.min(54, slotWidthSafe * 0.62);

        weekDays.forEach((day, index) => {
            const total = totalsByDay[index] || 0;
            const x = padding.left + slotWidthSafe * index + (slotWidthSafe - barWidthSafe) / 2;
            let currentY = padding.top + chartHeight;

            // Empilha segmentos de baixo para cima, um por material
            selectedMaterials.forEach(material => {
                const value = (seriesByMaterial[material] && seriesByMaterial[material][index]) || 0;
                if (value <= 0) return;

                const barHeight = (value / yMax) * chartHeight;
                const y = currentY - barHeight;
                const color = this.materialColors[material] || "#1f6fb2";

                // Armazena geometria do segmento para detecção de hover no tooltip
                ctx.fillStyle = color;
                ctx.fillRect(x, y, barWidthSafe, barHeight);
                this._chartSegments.push({ x, y, width: barWidthSafe, height: barHeight, material, value, dayIndex: index, day });
                currentY = y;
            });

            ctx.fillStyle    = "#334155";
            ctx.font         = "11px Arial";
            ctx.textAlign    = "center";
            ctx.textBaseline = "top";
            const dayLabel = `${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}`;
            ctx.fillText(dayLabel, x + barWidthSafe / 2, padding.top + chartHeight + 10);
        });

    },

    /** Exibe tooltip ao passar o mouse sobre uma barra do gráfico. */
    _onChartHover(e) {
        const canvas = document.getElementById("consumptionChart");
        const tooltip = document.getElementById("consumptionTooltip");
        if (!canvas || !tooltip) return;

        const mx = e.offsetX;
        const my = e.offsetY;

        const hoveredDaySegments = this._chartSegments.filter(seg =>
            mx >= seg.x && mx <= seg.x + seg.width
        );

        if (!hoveredDaySegments.length) {
            tooltip.style.display = "none";
            return;
        }

        const day = hoveredDaySegments[0].day;
        const dayLabel = `${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}`;

        const lines = hoveredDaySegments.map(seg => {
            const color = this.materialColors[seg.material] || "#64748b";
            const formatted = this._formatTooltipValue(seg.value);
            return `<div class="consumption-tooltip-row">
                <span class="consumption-tooltip-dot" style="background:${color}"></span>
                <span class="consumption-tooltip-name">${this._escapeHtml(seg.material)}</span>
                <span class="consumption-tooltip-val">${formatted}</span>
            </div>`;
        }).join("");

        const total = hoveredDaySegments.reduce((sum, seg) => sum + seg.value, 0);
        const totalRow = hoveredDaySegments.length > 1
            ? `<div class="consumption-tooltip-total">
                <span class="consumption-tooltip-total-label">Total</span>
                <span class="consumption-tooltip-val">${this._formatTooltipValue(total)}</span>
               </div>`
            : "";

        tooltip.innerHTML = `<div class="consumption-tooltip-header">${dayLabel}</div>${lines}${totalRow}`;
        tooltip.style.display = "block";

        // Force reflow to get accurate dimensions after content change
        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;
        const margin = 14;
        let tx = e.clientX + margin;
        let ty = e.clientY + margin;
        if (tx + tw > window.innerWidth - 4) tx = e.clientX - tw - margin;
        if (ty + th > window.innerHeight - 4) ty = e.clientY - th - margin;
        tooltip.style.left = tx + "px";
        tooltip.style.top  = ty + "px";
    },

    /** Esconde o tooltip ao sair do canvas. */
    _onChartLeave() {
        const tooltip = document.getElementById("consumptionTooltip");
        if (tooltip) tooltip.style.display = "none";
    },

    /** Formata valor para tooltip (K/M para grandes números, locale pt-BR). */
    _formatTooltipValue(v) {
        if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
        if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
        return Math.round(v).toLocaleString("pt-BR");
    },

    // ─── Policy selector ────────────────────────────────────────────────────────

    _renderPoliciesSelect() {
        const select = document.getElementById("consumptionPolicySelect");
        if (!select) return;
        if (!this._selectedPolicyId && this.policies.length > 0) {
            this._selectedPolicyId = String(this.policies[0].id);
        }
        const current = this._selectedPolicyId || "";
        select.innerHTML = `<option value="">Selecione uma política...</option>`;
        this.policies.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name;
            if (String(p.id) === String(current)) opt.selected = true;
            select.appendChild(opt);
        });
    },

    /** Trata mudança de política: carrega itens, resolve grupos, atualiza materiais. */
    async _onPolicyChange() {
        const select = document.getElementById("consumptionPolicySelect");
        if (!select) return;
        const policyId = select.value;
        this._selectedPolicyId = policyId || null;
        localStorage.setItem('wcm.dashboard.policyId', this._selectedPolicyId || '');

        if (!policyId) {
            this._policyFull = null;
            this._balanceRows = [];
            this.selectedMaterials = [];
            this._renderBalanceTable();
            await this.refresh();
            return;
        }

        try {
            const policyFull = await apiCall(`${API}/stock-policies/${policyId}`);
            this._policyFull = policyFull;

            const allItems    = policyFull.items || [];
            const matItems    = allItems.filter(i => (i.item_type || 'material') !== 'group');
            const grpItems    = allItems.filter(i => i.item_type === 'group');

            // Fetch member materials for every group item in parallel
            const groupDataList = await Promise.all(
                grpItems.map(i => apiCall(`${API}/groups/${i.group_id}`).catch(() => null))
            );

            const directNames  = matItems.map(i => i.material).filter(Boolean);
            const groupedNames = groupDataList.flatMap(g => (g?.materials || []).map(m => m.name).filter(Boolean));
            const allNames     = [...new Set([...directNames, ...groupedNames])];

            this.selectedMaterials = allNames.filter(m => this.materials.includes(m));
            this._assignMaterialColors();
            await Promise.all([
                this.refresh(),
                this._computeBalanceData()
            ]);
        } catch {
            alert("Erro ao carregar política de estoque");
        }
    },

    // ─── Balance card ────────────────────────────────────────────────────────────

    async _computeBalanceData() {
        if (!this._policyFull) {
            this._balanceRows = [];
            this._renderBalanceTable();
            return;
        }
        const items = this._policyFull.items || [];
        if (!items.length) {
            this._balanceRows = [];
            this._renderBalanceTable();
            return;
        }

        this._renderBalanceLoading();

        const matItems = items.filter(i => (i.item_type || 'material') !== 'group');
        const grpItems = items.filter(i => i.item_type === 'group');

        // Fetch group members for each group item
        const groupDataList = await Promise.all(
            grpItems.map(i => apiCall(`${API}/groups/${i.group_id}`).catch(() => null))
        );
        const groupMemberNames = groupDataList.map(g => (g?.materials || []).map(m => m.name).filter(Boolean));

        // All material names needed for stocks / open orders
        const directNames = matItems.map(i => i.material).filter(Boolean);
        const allNames    = [...new Set([...directNames, ...groupMemberNames.flat()])];

        const [stocksMap, openOrdersMap] = await Promise.all([
            this._fetchCurrentStocks(allNames),
            this._fetchOpenOrders(allNames)
        ]);

        // Compute KPIs for material and group items in parallel
        const [matKpis, grpKpis] = await Promise.all([
            Promise.all(matItems.map(item => this._computeItemKpis(item.material, item, this._policyFull))),
            Promise.all(grpItems.map((item, i) => this._computeGroupItemKpis(groupMemberNames[i], item, this._policyFull)))
        ]);

        // Build rows preserving original item order
        let mi = 0, gi = 0;
        this._balanceRows = items.map(item => {
            if ((item.item_type || 'material') === 'group') {
                const kpi         = grpKpis[gi];
                const members     = groupMemberNames[gi];
                gi++;
                const currentStock = members.length
                    ? members.reduce((s, n) => s + (stocksMap[n] ?? 0), 0)
                    : null;
                const onOrder  = members.reduce((s, n) => s + (openOrdersMap[n] ?? 0), 0);
                const target   = kpi.maxStock !== null ? kpi.maxStock : kpi.reorderPoint;
                // Necessidade = max(0, alvo − estoque_atual − pedido_aberto)
                const need     = target !== null && currentStock !== null
                    ? Math.max(0, target - currentStock - onOrder)
                    : null;
                return {
                    label:        item.group_name || `Grupo ${item.group_id}`,
                    isGroup:      true,
                    currentStock,
                    safetyStock:  kpi.safetyStock,
                    reorderPoint: kpi.reorderPoint,
                    maxStock:     kpi.maxStock,
                    onOrder,
                    need
                };
            } else {
                const kpi          = matKpis[mi++];
                const currentStock = stocksMap[item.material] ?? null;
                const onOrder      = openOrdersMap[item.material] ?? 0;
                const target       = kpi.maxStock !== null ? kpi.maxStock : kpi.reorderPoint;
                // Necessidade = max(0, alvo − estoque_atual − pedido_aberto)
                const need         = target !== null && currentStock !== null
                    ? Math.max(0, target - currentStock - onOrder)
                    : null;
                return {
                    label:        item.material,
                    isGroup:      false,
                    currentStock,
                    safetyStock:  kpi.safetyStock,
                    reorderPoint: kpi.reorderPoint,
                    maxStock:     kpi.maxStock,
                    onOrder,
                    need
                };
            }
        });

        this._renderBalanceTable();
    },

    /**
     * Calcula KPIs de balanço para um item do tipo grupo.
     * Agrega consumo de todos os membros antes de aplicar forecast.
     */
    async _computeGroupItemKpis(memberNames, policyItem, policyData) {
        return StockPolicyUtils.computeGroupKpis(memberNames, policyItem, policyData, n => this._fetchLeadTime(n));
    },

    /**
     * Calcula KPIs de balanço para um item do tipo material.
     * Aplica forecast + parâmetros de nível de serviço para derivar segurança/reposição.
     */
    async _computeItemKpis(materialName, policyItem, policyData) {
        return StockPolicyUtils.computeItemKpis(materialName, policyItem, policyData, n => this._fetchLeadTime(n));
    },

    /** Busca saldo atual de estoque para cada material (registro mais recente). */
    async _fetchCurrentStocks(materialNames) {
        const result = {};
        const today      = this._formatDate(new Date());
        const twoYrsAgo  = this._formatDate(new Date(new Date().getFullYear() - 2, 0, 1));
        await Promise.all(materialNames.map(async material => {
            try {
                const query = new URLSearchParams({ material, startDate: twoYrsAgo, endDate: today });
                const rows = await apiCall(`${API}/stock-monitor?${query.toString()}`);
                result[material] = (rows && rows.length) ? Number(rows[rows.length - 1].balance || 0) : 0;
            } catch {
                result[material] = null;
            }
        }));
        return result;
    },

    /** Calcula quantidade pendente em pedidos abertos por material. */
    async _fetchOpenOrders(materialNames) {
        const result = {};
        materialNames.forEach(m => { result[m] = 0; });
        const openStatuses = ["open"];
        try {
            const orders = await apiCall(`${API}/orders`);
            if (!orders || !orders.length) return result;
            const openOrders = orders.filter(o => {
                const s = (o.status || "").toLowerCase().trim();
                return openStatuses.includes(s);
            });
            if (!openOrders.length) return result;

            // For each open order fetch ordered items AND already-received stock units in parallel
            const [allItems, allReceived] = await Promise.all([
                Promise.all(openOrders.map(o => apiCall(`${API}/orders/items/${o.id}`))),
                Promise.all(openOrders.map(o => apiCall(`${API}/orders/${o.id}/stock-units`)))
            ]);

            openOrders.forEach((order, i) => {
                const items    = allItems[i]    || [];
                const received = allReceived[i] || [];

                // Sum received weight per material for this order
                const receivedByMaterial = {};
                received.forEach(su => {
                    const m = su.material;
                    receivedByMaterial[m] = (receivedByMaterial[m] || 0) + Number(su.weight || 0);
                });

                items.forEach(item => {
                    if (!Object.prototype.hasOwnProperty.call(result, item.material)) return;
                    const ordered  = Number(item.quantity || 0);
                    const alreadyIn = receivedByMaterial[item.material] || 0;
                    const pending  = Math.max(0, ordered - alreadyIn);
                    result[item.material] += pending;
                });
            });
        } catch { /* return zeros */ }
        return result;
    },

    /** Busca lead time médio (em dias) para um material, com cache. */
    async _fetchLeadTime(materialName) {
        if (Object.prototype.hasOwnProperty.call(this._leadTimeCache, materialName)) {
            return this._leadTimeCache[materialName];
        }
        try {
            const res = await apiCall(`${API}/stock-policies/lead-time/${encodeURIComponent(materialName)}`);
            const lt = res?.lead_time ?? null;
            this._leadTimeCache[materialName] = lt;
            return lt;
        } catch {
            this._leadTimeCache[materialName] = null;
            return null;
        }
    },

    /** Exibe spinner de carregamento na área de balanço. */
    _renderBalanceLoading() {
        const container = document.getElementById("consumptionBalanceBody");
        if (!container) return;
        container.innerHTML = `<div class="consumption-balance-loading">
            <span class="material-symbols-outlined consumption-balance-loading-icon">autorenew</span>
            Calculando balanço de estoque…
        </div>`;
    },

    /** Renderiza a tabela de balanço com KPIs e status por cor (crítico/alerta/ok). */
    _renderBalanceTable() {
        const container = document.getElementById("consumptionBalanceBody");
        if (!container) return;

        if (!this._policyFull) {
            container.innerHTML = `<p class="consumption-balance-empty">Selecione uma política de estoque para visualizar o balanço.</p>`;
            return;
        }
        if (!this._balanceRows.length) {
            container.innerHTML = `<p class="consumption-balance-empty">Esta política não possui itens cadastrados.</p>`;
            return;
        }

        const reviewType   = this._policyFull.review_type || "continuous";
        const colReplenish = reviewType === "periodic" ? "Ponto Crítico" : "Ponto de Reposição";
        const fmt = v => (v !== null && v !== undefined) ? Math.round(Number(v)).toLocaleString("pt-BR") : "—";

        const tbody = this._balanceRows.map(row => {
            let statusClass = "";
            if (row.currentStock !== null && row.reorderPoint !== null) {
                if (row.currentStock <= (row.safetyStock ?? 0)) {
                    statusClass = "consumption-balance-row--critical";
                } else if (row.currentStock <= row.reorderPoint) {
                    statusClass = "consumption-balance-row--warning";
                } else {
                    statusClass = "consumption-balance-row--ok";
                }
            }
            const needClass = (row.need !== null && row.need > 0) ? "consumption-balance-need--positive" : "";
            const labelCell = row.isGroup
                ? `${this._escapeHtml(row.label)} <span class="consumption-balance-group-badge">grupo</span>`
                : this._escapeHtml(row.label);
            return `
                <tr class="${statusClass}">
                    <td class="consumption-balance-material">${labelCell}</td>
                    <td>${fmt(row.currentStock)}</td>
                    <td>${fmt(row.safetyStock)}</td>
                    <td>${fmt(row.reorderPoint)}</td>
                    <td>${row.maxStock !== null ? fmt(row.maxStock) : "—"}</td>
                    <td>${row.onOrder > 0 ? fmt(row.onOrder) : "—"}</td>
                    <td class="${needClass}">${(row.need !== null && row.need > 0) ? fmt(row.need) : "—"}</td>
                </tr>`;
        }).join("");

        const totalStock = this._balanceRows.reduce((s, r) => s + (r.currentStock ?? 0), 0);
        const totalNeed  = this._balanceRows.reduce((s, r) => s + (r.need ?? 0), 0);

        container.innerHTML = `
            <div class="consumption-balance-table-wrap">
                <table class="consumption-balance-table">
                    <thead>
                        <tr>
                            <th>Material</th>
                            <th>Nível Atual</th>
                            <th>Estoque de Segurança</th>
                            <th>${colReplenish}</th>
                            <th>Estoque Máximo</th>
                            <th>Pedido</th>
                            <th>Necessidade</th>
                        </tr>
                    </thead>
                    <tbody>${tbody}</tbody>
                    <tfoot>
                        <tr class="consumption-balance-totals">
                            <td><strong>Total</strong></td>
                            <td><strong>${fmt(totalStock)}</strong></td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td><strong>${totalNeed > 0 ? fmt(totalNeed) : "—"}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;
    },
};

