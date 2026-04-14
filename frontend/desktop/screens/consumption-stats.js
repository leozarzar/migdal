/**
 * @file consumption-stats.js
 * @description Tela de Estatística de Consumo — análise histórica, previsão por
 *   diferentes modelos (Média Móvel, Ponderação Exponencial, Regressão Linear,
 *   Média Aritmética) e indicadores KPI (box-plot, desvio padrão, CV, etc.).
 *   Suporta materiais individuais e grupos agregados, com vínculo opcional à
 *   política de estoque.
 */
const ConsumptionStats = {

    // ══════════════════════════════════════════════════════════════
    // ══ Estado ══
    // ══════════════════════════════════════════════════════════════

    materials: [],
    selectedMaterial: null,
    selectedType: 'material',
    selectedGroupData: null,
    groups: [],
    aggregation: "daily",
    forecastMethod: "moving-average",
    forecastParams: { period: 7, alpha: 0.3, regressionPeriod: 30 },
    serviceLevel: 95,
    removeZeros: false,
    treatOutliers: false,
    startDate: null,
    endDate: null,
    _chartPoints: [],
    _lastAggregated: [],
    _lastHighlightIdx: -1,
    _materialSelect: null,  // instância do componente SearchSelect
    _policyItems: [],   // [{ item_id, policy_id, policy_name }] para o material selecionado

    // ══════════════════════════════════════════════════════════════
    // ══ Ciclo de Vida ══
    // ══════════════════════════════════════════════════════════════

    /** @returns {string} HTML completo da tela (filtros, gráfico e indicadores) */
    render() {
        const today = new Date();
        const ninetyDaysAgo = new Date(today);
        ninetyDaysAgo.setDate(today.getDate() - 90);

        const defaultEnd = this._formatDate(today);
        const defaultStart = this._formatDate(ninetyDaysAgo);

        return `
        <div class="cstats-container">

            <!-- Main chart card -->
            <div class="cstats-card">
                <div class="cstats-card-head">
                    <div>
                        <h2 class="cstats-card-title">Estatística de Consumo</h2>
                        <p class="cstats-card-subtitle">Análise estatística e previsão de consumo por material</p>
                    </div>
                    <div class="cstats-btn-group">
                        <button id="cstatsLinkBtn" class="cstats-btn cstats-btn--link" type="button" style="display:none" title="Vincular à política de estoque"><span class="material-symbols-outlined">link</span>Vincular</button>
                        <button id="cstatsOptimizeBtn" class="cstats-btn cstats-btn--optimize" type="button"><span class="material-symbols-outlined">tune</span>Otimizar</button>
                    </div>
                </div>

                <!-- Row 1: Material, Dates, Aggregation -->
                <div class="cstats-filters-row">
                    <div class="cstats-filter-group cstats-filter-material">
                        <label class="cstats-label">Material</label>
                        <div id="cstatsMaterialContainer"></div>
                    </div>

                    <div class="cstats-filter-group">
                        <label class="cstats-label">Data Início</label>
                        <input type="date" id="cstatsStartDate" class="cstats-date-input" value="${defaultStart}">
                    </div>

                    <div class="cstats-filter-group">
                        <label class="cstats-label">Data Fim</label>
                        <input type="date" id="cstatsEndDate" class="cstats-date-input" value="${defaultEnd}">
                    </div>

                    <div class="cstats-filter-group">
                        <label class="cstats-label">Agregação</label>
                        <div class="cstats-toggle-group" id="cstatsAggregation">
                            <button class="cstats-toggle-btn cstats-toggle-btn--active" data-value="daily" type="button">Diário</button>
                            <button class="cstats-toggle-btn" data-value="weekly" type="button">Semanal</button>
                            <button class="cstats-toggle-btn" data-value="monthly" type="button">Mensal</button>
                        </div>
                    </div>
                </div>

                <!-- Row 2: Forecast method, params, service level, checkboxes -->
                <div class="cstats-filters-row">
                    <div class="cstats-filter-group cstats-filter-method">
                        <label class="cstats-label">Método de Previsão</label>
                        <select id="cstatsForecastMethod" class="cstats-select-native">
                            <option value="moving-average">Média Móvel</option>
                            <option value="exp-smoothing">Ponderação Exponencial</option>
                            <option value="linear-regression">Regressão Linear</option>
                            <option value="arithmetic">Média Aritmética</option>
                        </select>
                    </div>

                    <div class="cstats-filter-group" id="cstatsParamMovingAvg">
                        <label class="cstats-label">Período da Média</label>
                        <div id="cstatsNinputMovingAvg"></div>
                    </div>

                    <div class="cstats-filter-group" id="cstatsParamExpSmoothing" style="display:none">
                        <label class="cstats-label">Alfa (α)</label>
                        <div id="cstatsNinputExpAlpha"></div>
                    </div>

                    <div class="cstats-filter-group" id="cstatsParamLinearReg" style="display:none">
                        <label class="cstats-label">Período da Regressão</label>
                        <div id="cstatsNinputLinearReg"></div>
                    </div>

                    <div class="cstats-filter-group">
                        <label class="cstats-label">Nível de Serviço</label>
                        <div id="cstatsNinputServiceLevel"></div>
                    </div>

                    <div class="cstats-filter-group cstats-filter-checks">
                        <label class="cstats-label cstats-label--invisible">Opções</label>
                        <div class="cstats-checkboxes">
                            <label class="cstats-checkbox-label">
                                <input type="checkbox" id="cstatsRemoveZeros">
                                <span class="cstats-checkbox-text">Remover zeros</span>
                            </label>
                            <label class="cstats-checkbox-label">
                                <input type="checkbox" id="cstatsTreatOutliers">
                                <span class="cstats-checkbox-text">Tratar outliers</span>
                            </label>
                            <label class="cstats-checkbox-label">
                                <input type="checkbox" id="cstatsRemoveNoActivity">
                                <span class="cstats-checkbox-text">Tratar rupturas</span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Legend -->
                <div class="cstats-legend" id="cstatsLegend">
                    <div class="cstats-legend-item">
                        <span class="cstats-legend-swatch cstats-legend-swatch--solid" style="background:#3b82f6"></span>
                        <span>Consumo Real</span>
                    </div>
                    <div class="cstats-legend-item">
                        <span class="cstats-legend-swatch cstats-legend-swatch--dashed" style="border-color:#f59f00"></span>
                        <span>Previsão</span>
                    </div>
                    <div class="cstats-legend-item">
                        <span class="cstats-legend-swatch cstats-legend-swatch--band"></span>
                        <span>Intervalo de Confiança</span>
                    </div>
                </div>

                <!-- Chart -->
                <div class="cstats-chart-wrap">
                    <canvas id="cstatsChart" height="320"></canvas>
                    <div id="cstatsTooltip" class="cstats-tooltip"></div>
                    <div id="cstatsEmptyState" class="cstats-empty-state">
                        <span class="cstats-empty-icon material-symbols-outlined">show_chart</span>
                        <p class="cstats-empty-title">Nenhum dado disponível</p>
                        <p class="cstats-empty-subtitle" id="cstatsEmptyMsg">Selecione um material para visualizar o consumo.</p>
                    </div>
                </div>
            </div>

            <!-- Indicators card -->
            <div class="cstats-card cstats-indicators-card">
                <div class="cstats-card-head">
                    <div>
                        <h3 class="cstats-indicators-title">Indicadores</h3>
                        <p class="cstats-card-subtitle">Métricas estatísticas calculadas sobre o período analisado</p>
                    </div>
                </div>
                <div class="cstats-kpi-grid" id="cstatsKpiGrid">
                    ${this._kpiItems()}
                </div>
            </div>

        </div>
        `;
    },

    /** @returns {string} HTML dos cards de indicadores KPI */
    _kpiItems() {
        const items = [
            { icon: "trending_up",    label: "Consumo Esperado",       sub: "Próximo período",                 id: "kpiNextPeriod",  color: "#3b82f6" },
            { icon: "show_chart",     label: "Desvio Padrão",          sub: "Do consumo histórico",            id: "kpiStdDev",      color: "#8b5cf6" },
            { icon: "security",       label: "Margem de Segurança",    sub: "Baseada no nível de serviço",     id: "kpiSafety",      color: "#10b981" },
            { icon: "event_available",label: "Ocorrência de Consumo",  sub: "Períodos com consumo > 0",        id: "kpiOccurrence",  color: "#f59f00" },
            { icon: "remove_circle",  label: "Valores Zerados",        sub: "Proporção de zeros",              id: "kpiZeros",       color: "#94a3b8" },
            { icon: "warning",        label: "Outliers",               sub: "Proporção de outliers",           id: "kpiOutliers",    color: "#ef4444" },
            { icon: "expand_less",    label: "Limite Superior",        sub: "Box-plot (Q3 + 1,5\u00d7IQR)",   id: "kpiBoxUpper",    color: "#0c8599" },
            { icon: "expand_more",    label: "Limite Inferior",        sub: "Box-plot (Q1 \u2212 1,5\u00d7IQR)", id: "kpiBoxLower", color: "#0c8599" },
            { icon: "drag_handle",    label: "Mediana",                sub: "Valor central (P50)",             id: "kpiMedian",      color: "#475569" },
            { icon: "north",          label: "Máximo",                 sub: "Maior consumo no período",        id: "kpiMax",         color: "#d6336c" },
            { icon: "south",          label: "Mínimo",                 sub: "Menor consumo no período",        id: "kpiMin",         color: "#2f9e44" },
            { icon: "analytics",      label: "Coef. de Variação (CV)", sub: "\u03c3 / \u03bc \u2014 nível de variabilidade", id: "kpiCV", color: "#ae3ec9" },
        ];

        return items.map(item => {
            const r = parseInt(item.color.slice(1, 3), 16);
            const g = parseInt(item.color.slice(3, 5), 16);
            const b = parseInt(item.color.slice(5, 7), 16);
            const bgColor = `rgba(${r},${g},${b},0.1)`;

            const extraHtml = item.id === "kpiStdDev"
                ? `<span class="cstats-kpi-daily" id="kpiStdDevDaily" style="display:none"></span>`
                : "";

            return `
            <div class="cstats-kpi-item">
                <div class="cstats-kpi-icon-wrap" style="background:${bgColor}">
                    <span class="material-symbols-outlined cstats-kpi-icon" style="color:${item.color}">${item.icon}</span>
                </div>
                <div class="cstats-kpi-body">
                    <span class="cstats-kpi-label">${item.label}</span>
                    <span class="cstats-kpi-value" id="${item.id}">--</span>
                    ${extraHtml}
                    <span class="cstats-kpi-sub">${item.sub}</span>
                </div>
            </div>
            `;
        }).join("");
    },

    /** Inicializa a tela: reseta estado, bindeia eventos, busca materiais e grupos */
    async load() {
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) headerOptions.innerHTML = "";

        const today = new Date();
        const ninetyDaysAgo = new Date(today);
        ninetyDaysAgo.setDate(today.getDate() - 90);

        // Restaura filtros do localStorage (com fallback para os padrões)
        this.startDate      = localStorage.getItem('wcm.cstats.startDate')     || this._formatDate(ninetyDaysAgo);
        this.endDate        = localStorage.getItem('wcm.cstats.endDate')       || this._formatDate(today);
        this.aggregation    = localStorage.getItem('wcm.cstats.aggregation')   || "daily";
        this.forecastMethod = localStorage.getItem('wcm.cstats.method')        || "moving-average";
        this.serviceLevel   = Number(localStorage.getItem('wcm.cstats.serviceLevel')) || 95;
        this.removeZeros      = localStorage.getItem('wcm.cstats.removeZeros')      === 'true';
        this.treatOutliers    = localStorage.getItem('wcm.cstats.treatOutliers')    === 'true';
        this.removeNoActivity = localStorage.getItem('wcm.cstats.removeNoActivity') === 'true';
        const _savedParams  = (() => { try { return JSON.parse(localStorage.getItem('wcm.cstats.forecastParams')); } catch { return null; } })();
        this.forecastParams = (_savedParams && typeof _savedParams === 'object') ? _savedParams : { period: 7, alpha: 0.3, regressionPeriod: 30 };

        const _savedType      = localStorage.getItem('wcm.cstats.type')      || 'material';
        const _savedMaterial  = localStorage.getItem('wcm.cstats.material')  || null;
        const _savedGroupId   = localStorage.getItem('wcm.cstats.groupId')   || null;
        const _savedGroupName = localStorage.getItem('wcm.cstats.groupName') || null;

        this.selectedMaterial  = null;
        this.selectedType      = 'material';
        this.selectedGroupData = null;
        this.groups            = [];
        this._policyItems      = [];

        // Recria o componente de seleção a cada load() para garantir DOM e listeners limpos
        if (this._materialSelect) this._materialSelect.destroy();
        this._materialSelect = createSearchSelect({
            id:                'cstatsMaterial',
            placeholder:       'Selecione um material',
            searchable:        true,
            searchPlaceholder: 'Buscar material...',
            sections: [
                { key: 'material', label: 'Materiais', items: [] },
                { key: 'group',    label: 'Grupos',    items: [] }
            ],
            onChange: async (selection) => {
                if (selection.key === 'group') {
                    this.selectedType     = 'group';
                    this.selectedMaterial = null;
                    try {
                        const gData = await apiCall(API + `/groups/${selection.value}`);
                        this.selectedGroupData = {
                            id:        selection.value,
                            name:      selection.label,
                            materials: gData.materials || []
                        };
                    } catch {
                        this.selectedGroupData = { id: selection.value, name: selection.label, materials: [] };
                    }
                } else {
                    this.selectedMaterial  = selection.label;
                    this.selectedType      = 'material';
                    this.selectedGroupData = null;
                }
                this._saveFilters();
                await this.refresh();
                await this._checkPolicyLink();
            }
        });
        this._materialSelect.mount(document.getElementById('cstatsMaterialContainer'));

        // Monta os componentes NumberInput nos seus contêineres (usa valores já restaurados).
        // Os callbacks onChange são a fonte de verdade para salvar parâmetros — mais
        // robustos do que depender de _bindEvents() encontrar os elementos no DOM.
        [
            {
                containerId: 'cstatsNinputMovingAvg', id: 'cstatsMovingAvgPeriod',
                value: this.forecastParams.period, min: 2, max: 365, step: 1, unit: 'dias',
                onChange: (v) => { this.forecastParams.period = v; this._saveFilters(); this.refresh(); }
            },
            {
                containerId: 'cstatsNinputExpAlpha', id: 'cstatsExpAlpha',
                value: this.forecastParams.alpha, min: 0.01, max: 0.99, step: 0.01, unit: '0–1',
                onChange: (v) => { this.forecastParams.alpha = v; this._saveFilters(); this.refresh(); }
            },
            {
                containerId: 'cstatsNinputLinearReg', id: 'cstatsLinearRegPeriod',
                value: this.forecastParams.regressionPeriod, min: 3, max: 365, step: 1, unit: 'períodos',
                onChange: (v) => { this.forecastParams.regressionPeriod = v; this._saveFilters(); this.refresh(); }
            },
            {
                containerId: 'cstatsNinputServiceLevel', id: 'cstatsServiceLevel',
                value: this.serviceLevel, min: 50, max: 99.9, step: 0.1, unit: '%',
                onChange: (v) => { this.serviceLevel = v; this._saveFilters(); this.refresh(); }
            },
        ].forEach(cfg => createNumberInput(cfg).mount(cfg.containerId));

        this._bindEvents();

        // Sincroniza inputs de DOM com os valores restaurados
        const startInput = document.getElementById('cstatsStartDate');
        const endInput   = document.getElementById('cstatsEndDate');
        if (startInput) startInput.value = this.startDate;
        if (endInput)   endInput.value   = this.endDate;

        const aggregationGroup = document.getElementById('cstatsAggregation');
        if (aggregationGroup) {
            aggregationGroup.querySelectorAll('.cstats-toggle-btn').forEach(btn => {
                btn.classList.toggle('cstats-toggle-btn--active', btn.getAttribute('data-value') === this.aggregation);
            });
        }

        const methodSelect = document.getElementById('cstatsForecastMethod');
        if (methodSelect) {
            methodSelect.value = this.forecastMethod;
            this._updateMethodParams();
        }

        const removeZerosChk = document.getElementById('cstatsRemoveZeros');
        if (removeZerosChk) removeZerosChk.checked = this.removeZeros;

        const treatOutliersChk = document.getElementById('cstatsTreatOutliers');
        if (treatOutliersChk) treatOutliersChk.checked = this.treatOutliers;

        const removeNoActivityChk = document.getElementById('cstatsRemoveNoActivity');
        if (removeNoActivityChk) removeNoActivityChk.checked = this.removeNoActivity;

        this._drawChart([]);

        try {
            const [materials, groupsData] = await Promise.all([
                apiCall(API + "/materials"),
                apiCall(API + "/groups").catch(() => [])
            ]);
            this.materials = (materials || []).map(item => item.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
            this.groups = (groupsData || []).sort((a, b) => a.name.localeCompare(b.name));
            this._materialSelect.setItems('material', this.materials.map(m => ({ value: m, label: m })));
            this._materialSelect.setItems('group', this.groups.map(g => ({
                value: g.id,
                label: g.name,
                badge: '<span class="sselect-badge sselect-badge--green">grupo</span>'
            })));

            // Restaura seleção de material/grupo e exibe os dados
            if (_savedType === 'group' && _savedGroupId) {
                const group = this.groups.find(g => String(g.id) === _savedGroupId);
                if (group) {
                    this._materialSelect.select('group', _savedGroupId);
                    this.selectedType = 'group';
                    try {
                        const gData = await apiCall(API + `/groups/${_savedGroupId}`);
                        this.selectedGroupData = { id: _savedGroupId, name: _savedGroupName || group.name, materials: gData.materials || [] };
                    } catch {
                        this.selectedGroupData = { id: _savedGroupId, name: _savedGroupName || group.name, materials: [] };
                    }
                    await this.refresh();
                    await this._checkPolicyLink();
                }
            } else if (_savedType === 'material' && _savedMaterial && this.materials.includes(_savedMaterial)) {
                this._materialSelect.select('material', _savedMaterial);
                this.selectedMaterial = _savedMaterial;
                await this.refresh();
                await this._checkPolicyLink();
            }
        } catch (error) {
            alert("Erro ao carregar materiais para Estatística de Consumo");
        }
    },

    async onTabFocus() { return this.load(); },

    // ══════════════════════════════════════════════════════════════
    // ══ Eventos ══
    // ══════════════════════════════════════════════════════════════

    /** Bindeia todos os event-handlers de filtros, botões e canvas */
    _bindEvents() {
        const startInput       = document.getElementById("cstatsStartDate");
        const endInput         = document.getElementById("cstatsEndDate");
        const aggregationGroup = document.getElementById("cstatsAggregation");
        const methodSelect     = document.getElementById("cstatsForecastMethod");
        const removeZerosChk   = document.getElementById("cstatsRemoveZeros");
        const treatOutliersChk = document.getElementById("cstatsTreatOutliers");
        const canvas           = document.getElementById("cstatsChart");

        const optimizeBtn = document.getElementById("cstatsOptimizeBtn");
        const linkBtn     = document.getElementById("cstatsLinkBtn");

        if (optimizeBtn) {
            optimizeBtn.onclick = async () => { await this._optimizeForecast(); };
        }

        if (linkBtn) {
            linkBtn.onclick = async () => { await this._linkForecastToPolicy(); };
        }

        if (startInput) {
            startInput.onchange = async () => {
                this.startDate = startInput.value;
                this._saveFilters();
                await this.refresh();
            };
        }

        if (endInput) {
            endInput.onchange = async () => {
                this.endDate = endInput.value;
                this._saveFilters();
                await this.refresh();
            };
        }

        if (aggregationGroup) {
            aggregationGroup.querySelectorAll(".cstats-toggle-btn").forEach(btn => {
                btn.onclick = async () => {
                    aggregationGroup.querySelectorAll(".cstats-toggle-btn").forEach(b => b.classList.remove("cstats-toggle-btn--active"));
                    btn.classList.add("cstats-toggle-btn--active");
                    this.aggregation = btn.getAttribute("data-value");
                    this._saveFilters();
                    await this.refresh();
                };
            });
        }

        if (methodSelect) {
            methodSelect.onchange = async () => {
                this.forecastMethod = methodSelect.value;
                this._updateMethodParams();
                this._saveFilters();
                await this.refresh();
            };
        }

        // Checkboxes: usar addEventListener para garantir que o handler persiste
        // (onchange = ... pode ser sobrescrito por outros c\u00f3digos)
        if (removeZerosChk) {
            removeZerosChk.addEventListener('change', async () => {
                this.removeZeros = removeZerosChk.checked;
                this._saveFilters();
                await this.refresh();
            });
        }

        if (treatOutliersChk) {
            treatOutliersChk.addEventListener('change', async () => {
                this.treatOutliers = treatOutliersChk.checked;
                this._saveFilters();
                await this.refresh();
            });
        }

        const removeNoActivityChk = document.getElementById("cstatsRemoveNoActivity");
        if (removeNoActivityChk) {
            removeNoActivityChk.addEventListener('change', async () => {
                this.removeNoActivity = removeNoActivityChk.checked;
                this._saveFilters();
                await this.refresh();
            });
        }

        if (canvas) {
            canvas.onmousemove = (e) => this._onChartHover(e);
            canvas.onmouseleave = () => this._onChartLeave();
        }
    },

    /** Persiste os filtros atuais no localStorage para restauração na próxima visita. */
    _saveFilters() {
        try {
            localStorage.setItem('wcm.cstats.startDate',      this.startDate      || '');
            localStorage.setItem('wcm.cstats.endDate',        this.endDate        || '');
            localStorage.setItem('wcm.cstats.aggregation',    this.aggregation);
            localStorage.setItem('wcm.cstats.method',         this.forecastMethod);
            localStorage.setItem('wcm.cstats.forecastParams', JSON.stringify(this.forecastParams));
            localStorage.setItem('wcm.cstats.serviceLevel',   String(this.serviceLevel));
            localStorage.setItem('wcm.cstats.removeZeros',      String(this.removeZeros));
            localStorage.setItem('wcm.cstats.treatOutliers',    String(this.treatOutliers));
            localStorage.setItem('wcm.cstats.removeNoActivity', String(this.removeNoActivity));
            if (this.selectedType === 'group' && this.selectedGroupData) {
                localStorage.setItem('wcm.cstats.type',      'group');
                localStorage.setItem('wcm.cstats.material',  '');
                localStorage.setItem('wcm.cstats.groupId',   String(this.selectedGroupData.id));
                localStorage.setItem('wcm.cstats.groupName', this.selectedGroupData.name || '');
            } else {
                localStorage.setItem('wcm.cstats.type',      'material');
                localStorage.setItem('wcm.cstats.material',  this.selectedMaterial || '');
                localStorage.setItem('wcm.cstats.groupId',   '');
                localStorage.setItem('wcm.cstats.groupName', '');
            }
        } catch (e) { /* localStorage indisponível */ }
    },

    // ══════════════════════════════════════════════════════════════
    // ══ Otimização ══
    // ══════════════════════════════════════════════════════════════

    /**
     * Busca força-bruta o melhor método/parâmetro de previsão (menor RMSE).
     * Gera candidatos para cada modelo e seleciona o de menor desvio padrão residual.
     */
    async _optimizeForecast() {
        const optimizeBtn = document.getElementById("cstatsOptimizeBtn");
        const hasSelection = this.selectedType === 'group' ? !!this.selectedGroupData : !!this.selectedMaterial;
        if (!hasSelection || !this.startDate || !this.endDate) {
            alert("Selecione um material ou grupo e um intervalo de datas antes de otimizar.");
            return;
        }

        if (optimizeBtn) { optimizeBtn.disabled = true; optimizeBtn.textContent = "Otimizando..."; }

        try {
            const aggregated = await this._fetchCurrentData();
            if (!aggregated) return;
            const filtered   = this._applyFilters(aggregated);

            if (filtered.length < 3) {
                alert("Dados insuficientes para otimização (mínimo 3 períodos).");
                return;
            }

            const n = filtered.length;
            const maxWindow = Math.min(Math.floor(n / 2), 60);

            // Build candidate list
            // Cada candidato é um par {method, params}; o laço avalia todos via
            // _computeForecast e mantém o de menor σ residual (RMSE).
            const candidates = [];

            // Moving average: period 2..maxWindow
            // Varia a janela de 2 até metade da série (limitado a 60).
            for (let p = 2; p <= maxWindow; p++) {
                candidates.push({ method: "moving-average", params: { period: p, alpha: 0.3, regressionPeriod: 30 } });
            }

            // Exponential smoothing: alpha 0.01..0.99 step 0.01
            for (let a = 1; a <= 99; a++) {
                candidates.push({ method: "exp-smoothing", params: { period: 7, alpha: a / 100, regressionPeriod: 30 } });
            }

            // Linear regression: regressionPeriod 3..maxWindow
            for (let rp = 3; rp <= maxWindow; rp++) {
                candidates.push({ method: "linear-regression", params: { period: 7, alpha: 0.3, regressionPeriod: rp } });
            }

            // Arithmetic mean: no tunable param
            candidates.push({ method: "arithmetic", params: { period: 7, alpha: 0.3, regressionPeriod: 30 } });

            // Find best (min RMSE)
            // Percorre todos os candidatos; retém o que produzir menor σ residual.
            let best = null;
            let bestStd = Infinity;

            for (const c of candidates) {
                const fc = this._computeForecast(filtered, c.method, c.params, this.serviceLevel);
                if (fc && fc.std < bestStd) {
                    bestStd = fc.std;
                    best = c;
                }
            }

            if (!best) return;

            // Apply best to state
            this.forecastMethod  = best.method;
            this.forecastParams  = { ...best.params };

            // Sync DOM controls
            const methodSelect    = document.getElementById("cstatsForecastMethod");
            const movingAvgPeriod = document.getElementById("cstatsMovingAvgPeriod");
            const expAlphaInput   = document.getElementById("cstatsExpAlpha");
            const linearRegInput  = document.getElementById("cstatsLinearRegPeriod");

            if (methodSelect)    methodSelect.value    = best.method;
            if (movingAvgPeriod) movingAvgPeriod.value = best.params.period;
            if (expAlphaInput)   expAlphaInput.value   = best.params.alpha;
            if (linearRegInput)  linearRegInput.value  = best.params.regressionPeriod;

            this._updateMethodParams();
            this._saveFilters();
            await this.refresh();
        } catch (e) {
            alert("Erro ao otimizar previsão.");
        } finally {
            if (optimizeBtn) { optimizeBtn.disabled = false; optimizeBtn.textContent = "Otimizar"; }
        }
    },

    /** Alterna visibilidade dos campos de parâmetros conforme o método selecionado */
    _updateMethodParams() {
        const method = this.forecastMethod;
        const paramMovingAvg    = document.getElementById("cstatsParamMovingAvg");
        const paramExpSmoothing = document.getElementById("cstatsParamExpSmoothing");
        const paramLinearReg    = document.getElementById("cstatsParamLinearReg");

        if (paramMovingAvg)    paramMovingAvg.style.display    = method === "moving-average"    ? "" : "none";
        if (paramExpSmoothing) paramExpSmoothing.style.display = method === "exp-smoothing"     ? "" : "none";
        if (paramLinearReg)    paramLinearReg.style.display    = method === "linear-regression" ? "" : "none";
    },

    // ══════════════════════════════════════════════════════════════
    // ══ Vínculo com Política ══
    // ══ Nota: a seleção de material/grupo é gerenciada pelo componente
    // ══ SearchSelect instanciado em load(). O callback onChange atualiza
    // ══ this.selectedType / this.selectedMaterial / this.selectedGroupData.
    // ══════════════════════════════════════════════════════════════

    /** Verifica se o material/grupo selecionado possui ítens vinculados a políticas de estoque */
    async _checkPolicyLink() {
        const linkBtn = document.getElementById("cstatsLinkBtn");
        if (!linkBtn) return;

        this._policyItems = [];

        if (this.selectedType === 'group') {
            if (!this.selectedGroupData) {
                linkBtn.style.display = "none";
                return;
            }
            try {
                const result = await apiCall(
                    API + `/stock-policies/check-group/${encodeURIComponent(this.selectedGroupData.id)}`
                );
                this._policyItems = result?.items || [];
                linkBtn.style.display = this._policyItems.length > 0 ? "" : "none";
            } catch {
                linkBtn.style.display = "none";
            }
            return;
        }

        if (!this.selectedMaterial) {
            linkBtn.style.display = "none";
            return;
        }

        try {
            const result = await apiCall(
                API + `/stock-policies/check-material/${encodeURIComponent(this.selectedMaterial)}`
            );
            this._policyItems = result?.items || [];
            linkBtn.style.display = this._policyItems.length > 0 ? "" : "none";
        } catch {
            linkBtn.style.display = "none";
        }
    },

    /** Envia os parâmetros de previsão atuais para os ítens de política vinculados */
    async _linkForecastToPolicy() {
        if (this._policyItems.length === 0) return;

        const forecastParam = {
            "moving-average":    this.forecastParams.period,
            "exp-smoothing":     this.forecastParams.alpha,
            "linear-regression": this.forecastParams.regressionPeriod,
            "arithmetic":        null
        }[this.forecastMethod] ?? null;

        const payload = {
            forecast_model:          this.forecastMethod,
            forecast_param:          forecastParam,
            forecast_start_date:     this.startDate,
            forecast_aggregation:    this.aggregation,
            forecast_remove_zeros:   this.removeZeros,
            forecast_treat_outliers: this.treatOutliers,
            forecast_treat_ruptures: this.removeNoActivity || false
        };

        try {
            await Promise.all(
                this._policyItems.map(item =>
                    apiCall(API + `/stock-policies/items/${item.item_id}/forecast`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    })
                )
            );

            const names = this._policyItems.map(i => i.policy_name).join(", ");
            alert(`Previsão vinculada com sucesso à política: ${names}`);
        } catch (e) {
            alert("Erro ao vincular previsão à política de estoque.");
        }
    },

    // ══════════════════════════════════════════════════════════════
    // ══ Dados e Atualização ══
    // ══════════════════════════════════════════════════════════════

    /** Busca dados de consumo e estoque (material individual ou grupo agregado) */
    async _fetchCurrentData() {
        if (this.selectedType === 'group') {
            if (!this.selectedGroupData || !this.selectedGroupData.materials.length) return null;
            const members = this.selectedGroupData.materials;
            const [allConsumption, allStocks] = await Promise.all([
                Promise.all(members.map(m =>
                    apiCall(`${API}/consumption?${new URLSearchParams({ material: m.name, startDate: this.startDate, endDate: this.endDate })}`).catch(() => [])
                )),
                Promise.all(members.map(m =>
                    apiCall(`${API}/stock-monitor?${new URLSearchParams({ material: m.name, startDate: this.startDate, endDate: this.endDate })}`).catch(() => [])
                ))
            ]);
            const mergedMap = new Map();
            members.forEach((_, idx) => {
                const buckets = this._aggregateData(allConsumption[idx] || [], this.aggregation, allStocks[idx] || []);
                buckets.forEach(b => {
                    if (!mergedMap.has(b.key)) mergedMap.set(b.key, { key: b.key, label: b.label, value: 0, hasStock: false });
                    const e = mergedMap.get(b.key);
                    e.value   += b.value;
                    e.hasStock = e.hasStock || !!b.hasStock;
                });
            });
            return Array.from(mergedMap.values()).sort((a, b) => a.key.localeCompare(b.key));
        } else {
            if (!this.selectedMaterial) return null;
            const query = new URLSearchParams({ material: this.selectedMaterial, startDate: this.startDate, endDate: this.endDate });
            const [rows, stockRows] = await Promise.all([
                apiCall(`${API}/consumption?${query.toString()}`),
                apiCall(`${API}/stock-monitor?${query.toString()}`)
            ]);
            return this._aggregateData(rows || [], this.aggregation, stockRows || []);
        }
    },

    /** Recarrega dados, aplica filtros, calcula previsão e redesenha gráfico + KPIs */
    async refresh() {
        const hasSelection = this.selectedType === 'group' ? !!this.selectedGroupData : !!this.selectedMaterial;
        if (!hasSelection || !this.startDate || !this.endDate) {
            this._drawChart([]);
            this._updateKpis([], [], null);
            return;
        }

        try {
            const rawAggregated = await this._fetchCurrentData();
            if (!rawAggregated) {
                this._drawChart([]);
                this._updateKpis([], [], null);
                return;
            }
            const filtered = this._applyFilters(rawAggregated);
            const forecast = filtered.length >= 2
                ? this._computeForecast(filtered, this.forecastMethod, this.forecastParams, this.serviceLevel)
                : null;
            this._drawChart(filtered, forecast);
            this._updateKpis(rawAggregated, filtered, forecast);
        } catch (error) {
            alert("Erro ao carregar dados de consumo");
        }
    },

    /**
     * Agrega consumo por período (diário/semanal/mensal), preenche lacunas e marca
     * buckets com estoque positivo via carry-forward do saldo mais recente.
     * @param {Object[]} rows       - registros de consumo brutos
     * @param {string}   aggregation - 'daily' | 'weekly' | 'monthly'
     * @param {Object[]} stockRows   - registros de saldo de estoque
     * @returns {Object[]} buckets ordenados por chave de período
     */
    _aggregateData(rows, aggregation, stockRows = []) {
        const buckets = new Map();
        const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

        // Keys of incomplete (in-progress) periods that should be excluded
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Incomplete period cutoff keys
        const todayKey = this._formatDate(today);

        const currentMondayDate = new Date(today);
        const dow = today.getDay();
        currentMondayDate.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
        const currentWeekKey = this._formatDate(currentMondayDate);

        const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

        rows.forEach(row => {
            const date = new Date(row.day + "T00:00:00");
            let key, label;

            if (aggregation === "daily") {
                key   = row.day;
                const dd = String(date.getDate()).padStart(2, "0");
                const mm = String(date.getMonth() + 1).padStart(2, "0");
                label = `${dd}/${mm}`;
            } else if (aggregation === "weekly") {
                const monday = new Date(date);
                const d = date.getDay();
                const diff = d === 0 ? -6 : 1 - d;
                monday.setDate(date.getDate() + diff);
                key = this._formatDate(monday);
                const dd = String(monday.getDate()).padStart(2, "0");
                const mm = String(monday.getMonth() + 1).padStart(2, "0");
                label = `${dd}/${mm}`;
            } else {
                const y  = date.getFullYear();
                const mo = date.getMonth();
                key   = `${y}-${String(mo + 1).padStart(2, "0")}`;
                label = `${monthNames[mo]}/${String(y).slice(2)}`;
            }

            if (!buckets.has(key)) {
                buckets.set(key, { key, label, value: 0, hasStock: false });
            }
            buckets.get(key).value += Number(row.consumption || 0);
        });

        // Mark buckets that had stock during the period.
        // IMPORTANT: this must run AFTER fill-gaps so newly created buckets are also evaluated.
        const sortedStock = (stockRows || [])
            .filter(r => r.date)
            .sort((a, b) => a.date.localeCompare(b.date));

        // Fill gaps: generate every expected period key in [startDate, endDate].
        // If endDate >= today, stop before the current incomplete period.
        const rangeStart = new Date((this.startDate || todayKey) + "T00:00:00");
        const rangeEndKey = this.endDate && this.endDate < todayKey ? this.endDate : null;

        if (aggregation === "daily") {
            const cursor = new Date(rangeStart);
            while (true) {
                const key = this._formatDate(cursor);
                // Stop at endDate (inclusive) when in the past; stop before today otherwise
                if (rangeEndKey ? key > rangeEndKey : key >= todayKey) break;
                if (!buckets.has(key)) {
                    const dd = String(cursor.getDate()).padStart(2, "0");
                    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
                    buckets.set(key, { key, label: `${dd}/${mm}`, value: 0, hasStock: false });
                }
                cursor.setDate(cursor.getDate() + 1);
            }
        } else if (aggregation === "weekly") {
            // Start from the Monday of rangeStart's week
            const cursor = new Date(rangeStart);
            const dow = cursor.getDay();
            cursor.setDate(cursor.getDate() + (dow === 0 ? -6 : 1 - dow));
            while (true) {
                const key = this._formatDate(cursor);
                if (rangeEndKey ? key > rangeEndKey : key >= currentWeekKey) break;
                if (!buckets.has(key)) {
                    const dd = String(cursor.getDate()).padStart(2, "0");
                    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
                    buckets.set(key, { key, label: `${dd}/${mm}`, value: 0, hasStock: false });
                }
                cursor.setDate(cursor.getDate() + 7);
            }
        } else {
            // Monthly
            const rangeEndMonthKey = rangeEndKey
                ? `${new Date(rangeEndKey + "T00:00:00").getFullYear()}-${String(new Date(rangeEndKey + "T00:00:00").getMonth() + 1).padStart(2, "0")}`
                : null;
            const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
            while (true) {
                const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
                if (rangeEndMonthKey ? key > rangeEndMonthKey : key >= currentMonthKey) break;
                if (!buckets.has(key)) {
                    buckets.set(key, { key, label: `${monthNames[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`, value: 0, hasStock: false });
                }
                cursor.setMonth(cursor.getMonth() + 1);
            }
        }

        const all = Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));

        // Apply carry-forward hasStock after all buckets (including gap-filled) exist.
        // Strategy: for each bucket find the last known stock balance at or before its end date.
        if (sortedStock.length > 0) {
            const bucketEndKey = (key) => {
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
                const endKey = bucketEndKey(bucket.key);
                let lastBalance = 0;
                for (const sr of sortedStock) {
                    if (sr.date <= endKey) lastBalance = Number(sr.balance || 0);
                    else break;
                }
                bucket.hasStock = lastBalance > 0;
            });
        }

        // Drop the current (incomplete) period and anything before startDate
        const startKey = this._formatDate(rangeStart);
        return all.filter(bucket => {
            if (bucket.key < startKey) return false;
            if (aggregation === "daily")   return bucket.key <  todayKey;
            if (aggregation === "weekly")  return bucket.key <  currentWeekKey;
            return bucket.key < currentMonthKey;
        });
    },

    // ══════════════════════════════════════════════════════════════
    // ══ Gráfico ══
    // ══════════════════════════════════════════════════════════════

    /**
     * Desenha o gráfico no canvas: grade, linhas de consumo real,
     * linha tracejada de previsão e banda de confiança.
     * @param {Object[]} aggregated - dados agregados filtrados
     * @param {Object}   [forecast] - resultado de _computeForecast
     */
    _drawChart(aggregated, forecast) {
        this._lastAggregated = aggregated || [];
        this._lastForecast   = forecast   || null;
        this._chartPoints    = [];

        const canvas = document.getElementById("cstatsChart");
        if (!canvas) return;

        const height = 320;
        const { ctx, width } = CanvasChartUtils.setupCanvas(canvas, height);
        const padding     = { top: 20, right: 20, bottom: 44, left: 56 };
        const chartWidth  = width  - padding.left - padding.right;
        const chartHeight = height - padding.top  - padding.bottom;

        const data = this._lastAggregated;

        // Escala Y — inclui a banda superior do forecast no máximo
        let maxVal = 0;
        data.forEach(d => { if (d.value > maxVal) maxVal = d.value; });
        if (forecast) {
            for (let i = forecast.startIdx; i < data.length; i++) {
                if (forecast.forecasts[i] !== null) {
                    const upper = forecast.forecasts[i] + forecast.z * forecast.std;
                    if (upper > maxVal) maxVal = upper;
                }
            }
        }
        const yMax = maxVal > 0 ? maxVal * 1.15 : 10;

        const valToY = v => padding.top + chartHeight - (Math.max(0, v) / yMax) * chartHeight;
        const n = data.length;
        const xOfIdx = i => padding.left + (n === 1 ? chartWidth / 2 : (i / (n - 1)) * chartWidth);

        const emptyState = document.getElementById("cstatsEmptyState");
        const emptyMsg   = document.getElementById("cstatsEmptyMsg");

        if (!data.length) {
            canvas.style.display = "none";
            if (emptyMsg) emptyMsg.textContent = this.selectedMaterial
                ? "Nenhum dado de consumo no período selecionado."
                : "Selecione um material para visualizar o consumo.";
            if (emptyState) emptyState.style.display = "flex";
            return;
        }

        canvas.style.display = "";
        if (emptyState) emptyState.style.display = "none";

        CanvasChartUtils.drawYAxis(ctx, padding, chartWidth, chartHeight, yMax, { withGrid: false });

        // Estado vazio — branch removido (tratado acima antes de drawYAxis)

        const pts = data.map((d, i) => ({
            x: xOfIdx(i),
            y: valToY(d.value),
            value: d.value,
            label: d.label,
            forecastValue: (forecast && forecast.forecasts[i] !== null) ? forecast.forecasts[i] : null,
        }));

        // --- Fase 1: Banda de confiança (upper/lower à z·σ do forecast) ---
        if (forecast && n > forecast.startIdx) {
            const validIdxs = [];
            for (let i = forecast.startIdx; i < n; i++) {
                if (forecast.forecasts[i] !== null) validIdxs.push(i);
            }
            if (validIdxs.length >= 2) {
                ctx.save();
                ctx.beginPath();
                validIdxs.forEach((idx, j) => {
                    const x = xOfIdx(idx);
                    const y = valToY(forecast.forecasts[idx] + forecast.z * forecast.std);
                    if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                });
                for (let j = validIdxs.length - 1; j >= 0; j--) {
                    const idx = validIdxs[j];
                    ctx.lineTo(xOfIdx(idx), valToY(Math.max(0, forecast.forecasts[idx] - forecast.z * forecast.std)));
                }
                ctx.closePath();
                ctx.fillStyle = "rgba(59,130,246,0.10)";
                ctx.fill();
                ctx.restore();
            }
        }

        // --- Fase 2: Linha de consumo real (gradiente + traçado sólido + pontos) ---
        CanvasChartUtils.drawLineSeries(ctx, pts, "#3b82f6", padding, chartHeight, this._chartPoints);

        // --- Fase 3: Linha tracejada de previsão ---
        if (forecast && n > forecast.startIdx) {
            const fPts = [];
            for (let i = forecast.startIdx; i < n; i++) {
                if (forecast.forecasts[i] === null) continue;
                fPts.push({ x: xOfIdx(i), y: valToY(forecast.forecasts[i]) });
            }
            if (fPts.length >= 2) {
                ctx.save();
                ctx.beginPath();
                CanvasChartUtils.buildSmoothPath(ctx, fPts);
                ctx.strokeStyle = "#f59f00";
                ctx.lineWidth   = 2;
                ctx.setLineDash([6, 4]);
                ctx.lineJoin    = "round";
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
        }

        // Eixo X — amostragem inteligente de labels
        const minLabelSpacing = 60;
        let lastLabelX = -Infinity;
        ctx.fillStyle    = "#607d9a";
        ctx.font         = "11px Arial";
        ctx.textAlign    = "center";
        ctx.textBaseline = "top";
        data.forEach((d, i) => {
            const cx = pts[i].x;
            if (cx - lastLabelX < minLabelSpacing) return;
            lastLabelX = cx;
            ctx.fillText(d.label, cx, padding.top + chartHeight + 10);
        });
    },

    // ══════════════════════════════════════════════════════════════
    // ══ Tooltip ══
    // ══════════════════════════════════════════════════════════════

    /** Exibe tooltip ao passar o mouse sobre os pontos do gráfico */
    _onChartHover(e) {
        const canvas  = document.getElementById("cstatsChart");
        const tooltip = document.getElementById("cstatsTooltip");
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

        let rows = `
            <div class="cstats-tooltip-row">
                <span class="cstats-tooltip-dot" style="background:#3b82f6"></span>
                <span class="cstats-tooltip-name">Consumo Real</span>
                <span class="cstats-tooltip-val">${this._formatValue(closest.value)}</span>
            </div>`;

        if (closest.forecastValue !== null) {
            rows += `
            <div class="cstats-tooltip-row">
                <span class="cstats-tooltip-dot" style="background:#f59f00"></span>
                <span class="cstats-tooltip-name">Previsão</span>
                <span class="cstats-tooltip-val">${this._formatValue(closest.forecastValue)}</span>
            </div>`;
        }

        tooltip.innerHTML = `<div class="cstats-tooltip-header">${this._escapeHtml(closest.label)}</div>${rows}`;
        tooltip.style.display = "block";

        CanvasChartUtils.positionTooltip(tooltip, e, canvas.parentElement);
    },

    /** Esconde o tooltip ao sair do canvas */
    _onChartLeave() {
        const tooltip = document.getElementById("cstatsTooltip");
        if (tooltip) tooltip.style.display = "none";
    },

    // ══════════════════════════════════════════════════════════════
    // ══ Utilitários ══
    // ══════════════════════════════════════════════════════════════

    // ══════════════════════════════════════════════════════════════
    // ══ Cálculos Estatísticos ══
    // ══════════════════════════════════════════════════════════════

    /**
     * Aplica filtros de remoção de zeros, rupturas e tratamento de outliers (IQR).
     * @param {Object[]} data - dados agregados
     * @returns {Object[]} dados filtrados
     */
    _applyFilters(data) {
        let result = data.slice();

        if (this.removeZeros) {
            result = result.filter(d => d.value > 0);
        }

        if (this.removeNoActivity) {
            result = result.filter(d => d.value > 0 || d.hasStock);
        }

        if (this.treatOutliers && result.length >= 4) {
            const sorted = result.map(d => d.value).sort((a, b) => a - b);
            const q1 = sorted[Math.floor(sorted.length / 4)];
            const q3 = sorted[Math.floor(3 * sorted.length / 4)];
            const iqr = q3 - q1;
            const lower = q1 - 1.5 * iqr;
            const upper = q3 + 1.5 * iqr;
            result = result.filter(d => d.value >= lower && d.value <= upper);
        }

        return result;
    },

    /**
     * Calcula a previsão sobre a série filtrada usando o modelo selecionado.
     * Retorna o array de forecasts alinhado aos dados, a previsão do próximo
     * período, σ dos resíduos e o z-score do nível de serviço.
     * @param {Object[]} data         - dados filtrados
     * @param {string}   method       - modelo de previsão
     * @param {Object}   params       - parâmetros do modelo
     * @param {number}   serviceLevel - nível de serviço (%)
     * @returns {{forecasts: number[], nextForecast: number, std: number, z: number, startIdx: number}|null}
     */
    _computeForecast(data, method, params, serviceLevel) {
        const values = data.map(d => d.value);
        const n = values.length;
        if (n < 2) return null;

        const forecasts = new Array(n).fill(null);
        let startIdx = 1;
        let residuals = [];  // resíduos (real − previsto) para cálculo do desvio padrão

        if (method === "moving-average") {
            const p = Math.max(2, Math.min(params.period, n - 1));
            startIdx = p;
            for (let i = p; i < n; i++) {
                forecasts[i] = values.slice(i - p, i).reduce((s, v) => s + v, 0) / p;
                residuals.push(values[i] - forecasts[i]);
            }
            var nextForecast = values.slice(n - p).reduce((s, v) => s + v, 0) / p;

        } else if (method === "exp-smoothing") {
            const alpha = Math.max(0.01, Math.min(0.99, params.alpha));
            startIdx = 1;
            let s = values[0];
            for (let i = 1; i < n; i++) {
                forecasts[i] = s;
                s = alpha * values[i] + (1 - alpha) * s;
                residuals.push(values[i] - forecasts[i]);
            }
            var nextForecast = s;

        } else if (method === "linear-regression") {
            const rp = Math.max(3, Math.min(params.regressionPeriod, n));
            startIdx = rp;
            for (let i = rp; i < n; i++) {
                const xs = Array.from({ length: rp }, (_, j) => j);
                const ys = values.slice(i - rp, i);
                const { a, b } = this._linearReg(xs, ys);
                forecasts[i] = Math.max(0, a + b * rp); // projeta 1 passo à frente
                residuals.push(values[i] - forecasts[i]);  // resíduo = real − previsto
            }
            const xs = Array.from({ length: rp }, (_, j) => j);
            const ys = values.slice(n - rp);
            const { a, b } = this._linearReg(xs, ys);
            var nextForecast = Math.max(0, a + b * rp);

        } else {
            // arithmetic mean (cumulative)
            startIdx = 1;
            for (let i = 1; i < n; i++) {
                forecasts[i] = values.slice(0, i).reduce((s, v) => s + v, 0) / i;
                residuals.push(values[i] - forecasts[i]);
            }
            var nextForecast = values.reduce((s, v) => s + v, 0) / n;
        }

        // z-score conforme nível de serviço; σ é RMSE dos resíduos
        const z   = this._zScore(serviceLevel);
        const std = this._stdDev(residuals);
        return { forecasts, nextForecast, std, z, startIdx };
    },

    /**
     * Aproximação de Beasley-Springer-Moro para o quantil da distribuição normal.
     * @param {number} serviceLevel - nível de serviço (50–99.9)
     * @returns {number} z-score correspondente
     */
    _zScore(serviceLevel) { return StockPolicyUtils.zScore(serviceLevel); },

    /**
     * Desvio padrão populacional (RMSE quando aplicado a resíduos).
     * @param {number[]} arr
     * @returns {number}
     */
    _stdDev(arr) { return StockPolicyUtils.stdDev(arr); },

    /**
     * Regressão linear simples (mínimos quadrados ordinários).
     * @param {number[]} xs - variável independente
     * @param {number[]} ys - variável dependente
     * @returns {{a: number, b: number}} intercepto e coeficiente angular
     */
    _linearReg(xs, ys) { return StockPolicyUtils.linReg(xs, ys); },

    // ══════════════════════════════════════════════════════════════
    // ══ Indicadores KPI ══
    // ══════════════════════════════════════════════════════════════

    /**
     * Atualiza todos os cards de indicadores KPI com os dados atuais.
     * Calcula box-plot (Q1, Q3, IQR, mediana), CV, outliers e métricas de previsão.
     * @param {Object[]}    rawData      - dados brutos (pré-filtro)
     * @param {Object[]}    filteredData  - dados após filtros
     * @param {Object|null} forecast      - resultado de _computeForecast
     */
    _updateKpis(rawData, filteredData, forecast) {
        const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        if (!filteredData.length) {
            ["kpiNextPeriod","kpiStdDev","kpiSafety","kpiOccurrence","kpiZeros",
             "kpiOutliers","kpiBoxUpper","kpiBoxLower","kpiMedian","kpiMax","kpiMin","kpiCV"]
                .forEach(id => setKpi(id, "--"));
            return;
        }

        const vals = filteredData.map(d => d.value);
        const rawVals = rawData.map(d => d.value);

        // Box-plot sobre dados filtrados: Q1 = percentil 25, Q3 = percentil 75
        const sorted = vals.slice().sort((a, b) => a - b);
        const nv = sorted.length;
        const q1 = sorted[Math.floor(nv / 4)];       // 1º quartil
        const q3 = sorted[Math.floor(3 * nv / 4)];   // 3º quartil
        const iqr = q3 - q1;                          // amplitude interquartil

        const median = nv % 2 === 0
            ? (sorted[nv / 2 - 1] + sorted[nv / 2]) / 2
            : sorted[Math.floor(nv / 2)];

        const mean      = vals.reduce((s, v) => s + v, 0) / nv;
        const stdConsump = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / nv);
        const cv   = mean > 0 ? (stdConsump / mean * 100) : 0;

        // Ocorrência/zeros sobre dados brutos (antes de filtros)
        const rawN  = rawVals.length;
        const zeros = rawVals.filter(v => v === 0).length;

        // Outliers sobre dados brutos via IQR (Q1 − 1,5×IQR .. Q3 + 1,5×IQR)
        const rs = rawVals.slice().sort((a, b) => a - b);
        const rq1 = rs[Math.floor(rs.length / 4)];
        const rq3 = rs[Math.floor(3 * rs.length / 4)];
        const riqr = rq3 - rq1;
        const rawOutliers = rawVals.filter(v => v < rq1 - 1.5 * riqr || v > rq3 + 1.5 * riqr).length;

        setKpi("kpiNextPeriod", forecast ? this._formatValue(forecast.nextForecast) : "--");
        setKpi("kpiStdDev",     forecast ? this._formatValue(forecast.std) : "--");

        // Daily-adjusted σ: σ_daily = σ_period / √T (only for weekly/monthly)
        const dailyEl = document.getElementById("kpiStdDevDaily");
        if (dailyEl) {
            if (forecast && (this.aggregation === "weekly" || this.aggregation === "monthly")) {
                const T = this.aggregation === "weekly" ? 7 : 30;
                const stdDaily = forecast.std / Math.sqrt(T);
                dailyEl.textContent = `≈ ${this._formatValue(stdDaily)} / dia`;
                dailyEl.style.display = "";
            } else {
                dailyEl.style.display = "none";
            }
        }
        setKpi("kpiSafety",     forecast ? this._formatValue(forecast.z * forecast.std) : "--");
        setKpi("kpiOccurrence", rawN > 0 ? ((rawN - zeros) / rawN * 100).toFixed(1) + "%" : "--");
        setKpi("kpiZeros",      rawN > 0 ? (zeros / rawN * 100).toFixed(1) + "%" : "--");
        setKpi("kpiOutliers",   rawN > 0 ? (rawOutliers / rawN * 100).toFixed(1) + "%" : "--");
        setKpi("kpiBoxUpper",   this._formatValue(q3 + 1.5 * iqr));
        setKpi("kpiBoxLower",   this._formatValue(Math.max(0, q1 - 1.5 * iqr)));
        setKpi("kpiMedian",     this._formatValue(median));
        setKpi("kpiMax",        this._formatValue(Math.max(...vals)));
        setKpi("kpiMin",        this._formatValue(Math.min(...vals)));
        setKpi("kpiCV",         cv.toFixed(1) + "%");
    },

    /**
     * Formata valor numérico com sufixo K/M para exibição compacta.
     * @param {number} v
     * @returns {string}
     */
    _formatValue: v  => StockPolicyUtils.formatValue(v),
    _formatDate:  d  => StockPolicyUtils.formatDate(d),
    _escapeHtml:  v  => StockPolicyUtils.escapeHtml(v),
};
