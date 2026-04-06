/**
 * Detalhes de Política de Estoque — Criação e edição de políticas com materiais,
 * grupos, configurações de previsão e cálculo de KPIs em tempo real
 * (estoque de segurança, ponto de reposição, estoque máximo).
 */
const StockPoliciesDetails = {

    // ══════════════════════════════════════════════════════════════════════
    // ── Estado ──
    // ══════════════════════════════════════════════════════════════════════

    materials: [],       // [{ id, name, lead_time, forecast_model, forecast_param, ... }]
    _leadTimeCache: {},  // { materialName: days|null }
    _itemSelect: null,

    // ══════════════════════════════════════════════════════════════════════
    // ── Ciclo de Vida ──
    // ══════════════════════════════════════════════════════════════════════

    /** Retorna o HTML da tela de detalhes da política */
    render() {
        return `
        <div class="spd-container">

            <div class="spd-page-header">
                <h1 class="spd-page-title" id="spdPageTitle">Nova Política de Estoque</h1>
            </div>

            <!-- Row 1: Informações Básicas + Reposição + Previsão -->
            <div class="spd-top-row">

                <!-- Card: Informações Básicas -->
                <div class="details-card spd-card-basic">
                    <div class="card-header">
                        <h2>Informações Básicas</h2>
                    </div>
                    <div class="card-content">
                        <div class="form-group">
                            <label for="spdName">Nome da Política <span class="required">*</span></label>
                            <input type="text" id="spdName" class="form-control" placeholder="Nome da política de estoque">
                        </div>
                        <div class="form-group">
                            <label for="spdDescription">Descrição</label>
                            <textarea id="spdDescription" class="form-control spd-textarea" placeholder="Descrição da política" rows="4"></textarea>
                        </div>
                    </div>
                </div>

                <!-- Card: Reposição -->
                <div class="details-card spd-card-replenishment">
                    <div class="card-header">
                        <h2>Reposição</h2>
                    </div>
                    <div class="card-content">

                        <!-- Tipo de Revisão -->
                        <div class="form-group">
                            <label for="spdReviewType">Tipo de Revisão</label>
                            <select id="spdReviewType" class="form-control" onchange="StockPoliciesDetails._onReviewTypeChange()">
                                <option value="continuous">Contínua</option>
                                <option value="periodic">Periódica</option>
                            </select>
                        </div>

                        <!-- Periodicidade (visível quando Periódica) -->
                        <div id="spdPeriodicOptions" style="display:none">
                            <div class="form-group">
                                <label for="spdPeriodicType">Periodicidade</label>
                                <select id="spdPeriodicType" class="form-control" onchange="StockPoliciesDetails._onPeriodicTypeChange()">
                                    <option value="daily">Diária</option>
                                    <option value="weekly">Semanal</option>
                                    <option value="monthly">Mensal</option>
                                    <option value="custom">Personalizado</option>
                                </select>
                            </div>
                            <div id="spdCustomPeriodicDaysGroup" class="form-group" style="display:none">
                                <label for="spdCustomPeriodicDays">Período Personalizado</label>
                                <div class="spd-input-unit-wrap">
                                    <input type="number" id="spdCustomPeriodicDays" class="form-control spd-input-number" min="1" placeholder="0">
                                    <span class="spd-input-unit">dias</span>
                                </div>
                            </div>
                        </div>

                        <!-- Nível de Serviço -->
                        <div class="form-group">
                            <label for="spdServiceLevel">Nível de Serviço</label>
                            <div class="spd-input-unit-wrap">
                                <input type="number" id="spdServiceLevel" class="form-control spd-input-number" min="0" max="100" value="95">
                                <span class="spd-input-unit">%</span>
                            </div>
                        </div>

                        <!-- Lead Time -->
                        <div class="form-group">
                            <label for="spdLeadTimeType">Lead Time</label>
                            <select id="spdLeadTimeType" class="form-control" onchange="StockPoliciesDetails._onLeadTimeTypeChange()">
                                <option value="auto">Automático</option>
                                <option value="custom">Personalizado</option>
                            </select>
                        </div>
                        <div id="spdLeadTimeDaysGroup" class="form-group" style="display:none">
                            <label for="spdLeadTimeDays">Valor do Lead Time</label>
                            <div class="spd-input-unit-wrap">
                                <input type="number" id="spdLeadTimeDays" class="form-control spd-input-number" min="1" placeholder="0">
                                <span class="spd-input-unit">dias</span>
                            </div>
                        </div>

                        <!-- Cobertura -->
                        <div class="form-group">
                            <label for="spdCoverageType">Cobertura</label>
                            <select id="spdCoverageType" class="form-control" onchange="StockPoliciesDetails._onCoverageTypeChange()">
                                <option value="min">Mínima</option>
                                <option value="custom">Personalizado</option>
                            </select>
                        </div>
                        <div id="spdCoverageDaysGroup" class="form-group" style="display:none">
                            <label for="spdCoverageDays">Cobertura Alvo</label>
                            <div class="spd-input-unit-wrap">
                                <input type="number" id="spdCoverageDays" class="form-control spd-input-number" min="1" placeholder="0">
                                <span class="spd-input-unit">dias</span>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- Card: Previsão -->
                <div class="details-card spd-card-forecast">
                    <div class="card-header">
                        <h2>Previsão</h2>
                    </div>
                    <div class="card-content">
                        <div class="spd-forecast-row">
                        <div class="form-group">
                            <label for="spdForecastType">Tipo</label>
                            <select id="spdForecastType" class="form-control" onchange="StockPoliciesDetails._onForecastTypeChange()">
                                <option value="auto">Automático</option>
                                <option value="custom">Personalizado</option>
                            </select>
                        </div>

                        <!-- Opções de Previsão Personalizada -->
                        <div id="spdForecastCustomOptions" style="display:none" class="spd-forecast-params">
                            <div class="form-group">
                                <label for="spdForecastModel">Modelo</label>
                                <select id="spdForecastModel" class="form-control" onchange="StockPoliciesDetails._onForecastModelChange()">
                                    <option value="moving-average">Média Móvel</option>
                                    <option value="arithmetic">Média Aritmética</option>
                                    <option value="exp-smoothing">Ponderação Exponencial</option>
                                    <option value="linear-regression">Regressão Linear</option>
                                </select>
                            </div>

                            <!-- Parâmetro: Média Móvel -->
                            <div id="spdParamMovingAvg" class="form-group">
                                <label for="spdMovingAvgPeriod">Período da Média</label>
                                <div class="spd-input-unit-wrap">
                                    <input type="number" id="spdMovingAvgPeriod" class="form-control spd-input-number" value="7" min="2" max="365">
                                    <span class="spd-input-unit">dias</span>
                                </div>
                            </div>

                            <!-- Parâmetro: Ponderação Exponencial -->
                            <div id="spdParamExpSmoothing" class="form-group" style="display:none">
                                <label for="spdExpAlpha">Alfa (α)</label>
                                <div class="spd-input-unit-wrap">
                                    <input type="number" id="spdExpAlpha" class="form-control spd-input-number" value="0.30" min="0.01" max="0.99" step="0.01">
                                    <span class="spd-input-unit">0–1</span>
                                </div>
                            </div>

                            <!-- Parâmetro: Regressão Linear -->
                            <div id="spdParamLinearReg" class="form-group" style="display:none">
                                <label for="spdLinearRegPeriod">Período da Regressão</label>
                                <div class="spd-input-unit-wrap">
                                    <input type="number" id="spdLinearRegPeriod" class="form-control spd-input-number" value="30" min="3" max="365">
                                    <span class="spd-input-unit">períodos</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </div>

            <!-- Card: Materiais -->
            <div class="details-card">
                <div class="card-header">
                    <h2>Materiais</h2>
                </div>
                <div class="card-content">
                    <div class="spd-material-add-row">
                        <div id="spdItemSelectContainer"></div>
                        <button class="spd-btn-add" onclick="StockPoliciesDetails.addItem()"><span class="material-symbols-outlined">playlist_add</span>Adicionar</button>
                    </div>
                    <div class="spd-materials-table-container">
                        <table class="spd-materials-table">
                            <thead id="spdMaterialsHead"></thead>
                            <tbody id="spdMaterialsBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>
        `;
    },

    /** Inicializa a tela, carrega selects e preenche formulário se editando */
    async load() {
        this.materials = [];
        this._leadTimeCache = {};
        this._setHeaderOptions();
        this._renderMaterialsTable();

        if (this._itemSelect) this._itemSelect.destroy();
        this._itemSelect = createSearchSelect({
            id: 'spdItem',
            placeholder: 'Selecione material ou grupo',
            searchable: true,
            sections: [
                { key: 'material', label: 'Materiais', items: [] },
                { key: 'group',    label: 'Grupos',    items: [] }
            ]
        });
        this._itemSelect.mount(document.getElementById('spdItemSelectContainer'));

        const [materials, groups] = await Promise.all([
            apiCall(API + '/materials').catch(() => []),
            apiCall(API + '/groups').catch(() => [])
        ]);
        this._itemSelect.setItems('material', (materials || []).map(m => ({ value: m.id, label: m.name })));
        this._itemSelect.setItems('group', (groups || []).map(g => ({ value: g.id, label: g.name })));

        const policy = StockPolicies.selectedPolicy;
        if (policy) {
            document.getElementById("spdPageTitle").textContent = policy.name || "Política de Estoque";
            await this._fillForm(policy);
        } else {
            document.getElementById("spdPageTitle").textContent = "Nova Política de Estoque";
        }
    },

    /** Preenche o formulário com os dados de uma política existente */
    async _fillForm(policy) {
        document.getElementById("spdName").value          = policy.name        || "";
        document.getElementById("spdDescription").value   = policy.description || "";
        document.getElementById("spdServiceLevel").value  = policy.service_level ?? 95;

        // Revisão
        document.getElementById("spdReviewType").value = policy.review_type || "continuous";
        this._onReviewTypeChange();
        if (policy.review_period) {
            document.getElementById("spdPeriodicType").value = policy.review_period;
            this._onPeriodicTypeChange();
        }
        if (policy.review_period_days) {
            document.getElementById("spdCustomPeriodicDays").value = policy.review_period_days;
        }

        // Lead Time
        document.getElementById("spdLeadTimeType").value = policy.lead_time_type || "auto";
        this._onLeadTimeTypeChange();
        if (policy.lead_time_days) document.getElementById("spdLeadTimeDays").value = policy.lead_time_days;

        // Cobertura
        document.getElementById("spdCoverageType").value = policy.coverage_type || "min";
        this._onCoverageTypeChange();
        if (policy.coverage_days) document.getElementById("spdCoverageDays").value = policy.coverage_days;

        // Previsão
        document.getElementById("spdForecastType").value = policy.forecast_type || "auto";
        this._onForecastTypeChange();
        if (policy.forecast_model) {
            document.getElementById("spdForecastModel").value = policy.forecast_model;
            this._onForecastModelChange();
        }
        if (policy.forecast_param != null) {
            const modelParam = {
                "moving-average":    "spdMovingAvgPeriod",
                "exp-smoothing":     "spdExpAlpha",
                "linear-regression": "spdLinearRegPeriod"
            }[policy.forecast_model];
            if (modelParam) document.getElementById(modelParam).value = policy.forecast_param;
        }

        // Itens
        try {
            const full = await apiCall(API + `/stock-policies/${policy.id}`);
            if (full && full.items) {
                this.materials = await Promise.all(full.items.map(async i => {
                    if ((i.item_type || 'material') === 'group') {
                        let groupMaterials = [];
                        try {
                            const gData = await apiCall(API + `/groups/${i.group_id}`);
                            groupMaterials = gData.materials || [];
                        } catch (e) {}
                        return {
                            type: 'group',
                            id:                      String(i.group_id),
                            name:                    i.group_name || '',
                            groupMaterials,
                            forecast_model:          i.forecast_model || null,
                            forecast_param:          i.forecast_param ?? null,
                            forecast_start_date:     i.forecast_start_date || null,
                            forecast_aggregation:    i.forecast_aggregation || "daily",
                            forecast_remove_zeros:   !!i.forecast_remove_zeros,
                            forecast_treat_outliers: !!i.forecast_treat_outliers,
                            forecast_treat_ruptures: !!i.forecast_treat_ruptures,
                            lead_time:               i.lead_time_days || null,
                            kpi_loading:             false,
                            kpi_loaded:              false,
                            safety_stock:            null,
                            reorder_point:           null,
                            max_stock:               null
                        };
                    }
                    return {
                        id:                      String(i.material_id),
                        name:                    i.material,
                        forecast_model:          i.forecast_model || null,
                        forecast_param:          i.forecast_param ?? null,
                        forecast_start_date:     i.forecast_start_date || null,
                        forecast_aggregation:    i.forecast_aggregation || "daily",
                        forecast_remove_zeros:   !!i.forecast_remove_zeros,
                        forecast_treat_outliers: !!i.forecast_treat_outliers,
                        forecast_treat_ruptures: !!i.forecast_treat_ruptures,
                        lead_time:               null,
                        kpi_loading:             false,
                        kpi_loaded:              false,
                        safety_stock:            null,
                        reorder_point:           null,
                        max_stock:               null
                    };
                }));
                await this._loadAllLeadTimes();
                this._renderMaterialsTable();
                await this._computeAllMaterialKpis();
            }
        } catch (e) { /* mantém lista vazia */ }
    },

    // ══════════════════════════════════════════════════════════════════════
    // ── Dados de Apoio ──
    // ══════════════════════════════════════════════════════════════════════



    // ══════════════════════════════════════════════════════════════════════
    // ── Controles de Formulário ──
    // ══════════════════════════════════════════════════════════════════════

    /** Alterna visibilidade das opções de revisão periódica */
    _onReviewTypeChange() {
        const val = document.getElementById("spdReviewType").value;
        document.getElementById("spdPeriodicOptions").style.display = val === "periodic" ? "" : "none";
        this._renderMaterialsTable();
    },

    /** Alterna campo de dias personalizado para periodicidade */
    _onPeriodicTypeChange() {
        const val = document.getElementById("spdPeriodicType").value;
        document.getElementById("spdCustomPeriodicDaysGroup").style.display = val === "custom" ? "" : "none";
    },

    /** Alterna campo de lead time personalizado */
    _onLeadTimeTypeChange() {
        const val = document.getElementById("spdLeadTimeType").value;
        document.getElementById("spdLeadTimeDaysGroup").style.display = val === "custom" ? "" : "none";
        this._renderMaterialsTable();
    },

    /** Alterna campo de cobertura personalizada */
    _onCoverageTypeChange() {
        const val = document.getElementById("spdCoverageType").value;
        document.getElementById("spdCoverageDaysGroup").style.display = val === "custom" ? "" : "none";
    },

    /** Alterna opções de previsão personalizada */
    _onForecastTypeChange() {
        const val = document.getElementById("spdForecastType").value;
        document.getElementById("spdForecastCustomOptions").style.display = val === "custom" ? "" : "none";
        this._renderMaterialsTable();
    },

    /** Alterna campos de parâmetros conforme o modelo de previsão */
    _onForecastModelChange() {
        const model = document.getElementById("spdForecastModel").value;
        document.getElementById("spdParamMovingAvg").style.display    = model === "moving-average"    ? "" : "none";
        document.getElementById("spdParamExpSmoothing").style.display = model === "exp-smoothing"     ? "" : "none";
        document.getElementById("spdParamLinearReg").style.display    = model === "linear-regression" ? "" : "none";
    },

    // ══════════════════════════════════════════════════════════════════════
    // ── Ações Públicas ──
    // ══════════════════════════════════════════════════════════════════════

    /** Adiciona um material ou grupo à lista da política e calcula KPIs */
    async addItem() {
        const selected = this._itemSelect && this._itemSelect.getValue();
        if (!selected) return;

        const id   = String(selected.value);
        const name = selected.label;

        if (selected.key === 'group') {
            if (this.materials.find(m => m.type === 'group' && m.id === id)) return;

            let groupMaterials = [];
            try {
                const data = await apiCall(API + `/groups/${id}`);
                groupMaterials = data.materials || [];
            } catch (e) {}

            const entry = {
                type: 'group',
                id, name,
                groupMaterials,
                lead_time:               null,
                forecast_model:          null,
                forecast_param:          null,
                forecast_start_date:     null,
                forecast_aggregation:    "daily",
                forecast_remove_zeros:   false,
                forecast_treat_outliers: false,
                forecast_treat_ruptures: false,
                kpi_loading:             false,
                kpi_loaded:              false,
                safety_stock:            null,
                reorder_point:           null,
                max_stock:               null
            };
            this.materials.push(entry);
            this._renderMaterialsTable();
            this._itemSelect.clear();
            await this._computeMaterialKpis(entry);
        } else {
            if (this.materials.find(m => (!m.type || m.type === 'material') && m.id === id)) return;

            const entry = {
                id, name,
                lead_time:               null,
                forecast_model:          null,
                forecast_param:          null,
                forecast_start_date:     null,
                forecast_aggregation:    "daily",
                forecast_remove_zeros:   false,
                forecast_treat_outliers: false,
                forecast_treat_ruptures: false,
                kpi_loading:             false,
                kpi_loaded:              false,
                safety_stock:            null,
                reorder_point:           null,
                max_stock:               null
            };
            this.materials.push(entry);
            this._renderMaterialsTable();
            this._itemSelect.clear();

            const lt = await this._fetchLeadTime(name);
            entry.lead_time = lt;
            this._leadTimeCache[name] = lt;
            await this._computeMaterialKpis(entry);
        }
    },

    /** Busca o lead time médio ponderado de um material via API */
    async _fetchLeadTime(materialName) {
        if (materialName in this._leadTimeCache) return this._leadTimeCache[materialName];
        try {
            const result = await apiCall(API + `/stock-policies/lead-time/${encodeURIComponent(materialName)}`);
            return result?.lead_time ?? null;
        } catch {
            return null;
        }
    },

    /** Carrega lead times de todos os materiais em paralelo */
    async _loadAllLeadTimes() {
        await Promise.all(
            this.materials
                .filter(m => !m.type || m.type === 'material')
                .map(async m => {
                    m.lead_time = await this._fetchLeadTime(m.name);
                    this._leadTimeCache[m.name] = m.lead_time;
                })
        );
    },

    /** Remove um material ou grupo da lista pelo identificador */
    removeMaterial(key) {
        this.materials = this.materials.filter(m => {
            const k = m.type === 'group' ? `g_${m.id}` : m.id;
            return k !== key;
        });
        this._renderMaterialsTable();
    },

    // ══════════════════════════════════════════════════════════════════════
    // ── Renderização ──
    // ══════════════════════════════════════════════════════════════════════

    /** Retorna as colunas visíveis conforme a configuração atual */
    _getColumns() {
        const reviewType   = document.getElementById("spdReviewType")?.value   || "continuous";
        const leadTimeType = document.getElementById("spdLeadTimeType")?.value || "auto";
        const forecastType = document.getElementById("spdForecastType")?.value || "auto";

        const cols = [{ key: "material", label: "Material" }];
        if (leadTimeType === "auto") cols.push({ key: "lead_time",   label: "Lead Time" });
        if (forecastType === "auto") cols.push({ key: "forecast", label: "Previsão", cls: "spd-col-forecast" });
        cols.push({ key: "safety_stock",  label: "Estoque de Segurança" });
        cols.push({ key: "reorder_point", label: reviewType === "continuous" ? "Ponto de Reposição" : "Ponto Crítico" });
        if (reviewType === "periodic")  cols.push({ key: "max_stock", label: "Estoque Máximo" });
        cols.push({ key: "actions", label: "" });
        return cols;
    },

    /** Renderiza a tabela de materiais/grupos com colunas dinâmicas */
    _renderMaterialsTable() {
        const cols  = this._getColumns();
        const thead = document.getElementById("spdMaterialsHead");
        const tbody = document.getElementById("spdMaterialsBody");
        if (!thead || !tbody) return;

        thead.innerHTML = `<tr>${cols.map(c => `<th${c.cls ? ` class="${c.cls}"` : ""}>${c.label}</th>`).join("")}</tr>`;

        tbody.innerHTML = "";
        if (this.materials.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="${cols.length}" class="empty-state">Nenhum material adicionado.</td>`;
            tbody.appendChild(tr);
            return;
        }

        this.materials.forEach(m => {
            const tr = document.createElement("tr");
            tr.innerHTML = cols.map(c => {
                if (c.key === "material") {
                    if (m.type === 'group') return `<td><span class="spd-group-badge">grupo</span>${m.name}</td>`;
                    return `<td>${m.name}</td>`;
                }
                if (c.key === "lead_time") {
                    const val = m.lead_time != null ? `${m.lead_time}d` : "<span style='color:#9e9e9e;font-size:12px'>calculando…</span>";
                    return `<td>${val}</td>`;
                }
                if (c.key === "forecast") {
                    if (m.forecast_model) {
                        const mLabel = { "moving-average": "Média Móvel", "arithmetic": "Média Aritmética", "exp-smoothing": "Ponderação Exponencial", "linear-regression": "Regressão Linear" };
                        const pSuffix = ({
                            "moving-average":    m.forecast_param != null ? ` — ${m.forecast_param}p` : "",
                            "exp-smoothing":     m.forecast_param != null ? ` — α=${Number(m.forecast_param).toFixed(2)}` : "",
                            "linear-regression": m.forecast_param != null ? ` — ${m.forecast_param}p` : "",
                            "arithmetic":        ""
                        })[m.forecast_model] ?? "";
                        const aggLabel = ({ daily: "diária", weekly: "semanal", monthly: "mensal" })[m.forecast_aggregation || "daily"] || m.forecast_aggregation || "diária";
                        return `<td class="spd-col-forecast" title="Agregação: ${aggLabel}"><span class="spd-forecast-model-name">${mLabel[m.forecast_model] || m.forecast_model}</span>${pSuffix ? `<span class="spd-forecast-param-tag">${pSuffix}</span>` : ""}</td>`;
                    }
                    return `<td class="spd-col-forecast"><span class="spd-forecast-hint" title="Vincule a previsão na tela de Estatística de Consumo">Sem previsão</span></td>`;
                }
                if (c.key === "safety_stock") {
                    if (m.kpi_loading) return `<td><span class="spd-kpi-loading">calc…</span></td>`;
                    return `<td>${m.safety_stock !== null ? m.safety_stock.toFixed(1) : "—"}</td>`;
                }
                if (c.key === "reorder_point") {
                    if (m.kpi_loading) return `<td><span class="spd-kpi-loading">calc…</span></td>`;
                    return `<td>${m.reorder_point !== null ? m.reorder_point.toFixed(1) : "—"}</td>`;
                }
                if (c.key === "max_stock") {
                    if (m.kpi_loading) return `<td><span class="spd-kpi-loading">calc…</span></td>`;
                    return `<td>${m.max_stock !== null ? m.max_stock.toFixed(1) : "—"}</td>`;
                }
                if (c.key === "actions") {
                    const _rk = m.type === 'group' ? `g_${m.id}` : m.id;
                    return `<td class="spd-col-actions"><button onclick="StockPoliciesDetails.removeMaterial('${_rk}')"><span class="material-symbols-outlined">delete</span></button></td>`;
                }
                return `<td>—</td>`;
            }).join("");
            tbody.appendChild(tr);
        });
    },

    // ══════════════════════════════════════════════════════════════════════
    // ── Cálculos de KPI ──
    // ══════════════════════════════════════════════════════════════════════

    /** Dispara o cálculo de KPIs para todos os materiais/grupos */
    _computeAllMaterialKpis() {
        return Promise.all(this.materials.map(m => this._computeMaterialKpis(m)));
    },

    /**
     * Calcula KPIs (ES, PR/PC, E.Máx) para um material individual.
     * Fórmulas: ES = Z × σ × √(exposição/período), PR = d×LT + ES
     */
    async _computeMaterialKpis(m) {
        if (m.type === 'group') return this._computeGroupKpis(m);
        const serviceLevel     = Number(document.getElementById("spdServiceLevel")?.value)       || 95;
        const reviewType       = document.getElementById("spdReviewType")?.value                 || "continuous";
        const reviewPeriod     = document.getElementById("spdPeriodicType")?.value               || "weekly";
        const leadTimeType     = document.getElementById("spdLeadTimeType")?.value               || "auto";
        const coverageType     = document.getElementById("spdCoverageType")?.value               || "min";
        const customLT         = Number(document.getElementById("spdLeadTimeDays")?.value)       || 1;
        const customCovDays    = Number(document.getElementById("spdCoverageDays")?.value)       || 7;
        const customPeriodDays = Number(document.getElementById("spdCustomPeriodicDays")?.value) || 7;
        const forecastType     = document.getElementById("spdForecastType")?.value               || "auto";

        // Lead time in days
        const lt = leadTimeType === "custom" ? customLT : Math.max(m.lead_time ?? 1, 1);

        // Review period & target coverage in days
        const reviewPeriodDays = { daily: 1, weekly: 7, monthly: 30, custom: customPeriodDays }[reviewPeriod] || 7;
        const coverageDays     = coverageType === "custom" ? customCovDays : reviewPeriodDays;

        // Resolve forecast settings (per-material take priority over policy-level)
        let model, param, startDate, aggregation, removeZeros, treatOutliers, treatRuptures;
        if (m.forecast_model) {
            model         = m.forecast_model;
            param         = m.forecast_param;
            startDate     = m.forecast_start_date;
            aggregation   = m.forecast_aggregation || "daily";
            removeZeros   = !!m.forecast_remove_zeros;
            treatOutliers = !!m.forecast_treat_outliers;
            treatRuptures = !!m.forecast_treat_ruptures;
        } else if (forecastType === "custom") {
            model = document.getElementById("spdForecastModel")?.value || "moving-average";
            const paramElId = { "moving-average": "spdMovingAvgPeriod", "exp-smoothing": "spdExpAlpha", "linear-regression": "spdLinearRegPeriod" }[model];
            param         = paramElId ? Number(document.getElementById(paramElId)?.value) : null;
            startDate     = null;
            aggregation   = "daily";
            removeZeros   = false;
            treatOutliers = false;
            treatRuptures = false;
        } else {
            m.safety_stock  = null;
            m.reorder_point = null;
            m.max_stock     = null;
            m.kpi_loading   = false;
            m.kpi_loaded    = true;
            this._renderMaterialsTable();
            return;
        }

        // Date range: use forecast_start_date or last 90 days
        const today = new Date();
        const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        const endDate = this._formatDateLocal(yesterday);
        if (!startDate) {
            const d90 = new Date(today);
            d90.setDate(d90.getDate() - 90);
            startDate = this._formatDateLocal(d90);
        }

        m.kpi_loading = true;
        m.kpi_loaded  = false;
        this._renderMaterialsTable();

        try {
            const query = new URLSearchParams({ material: m.name, startDate, endDate });
            const [rows, stockRows] = await Promise.all([
                apiCall(`${API}/consumption?${query}`),
                apiCall(`${API}/stock-monitor?${query}`)
            ]);
            const aggregated = this._aggregateForPolicy(rows || [], aggregation, startDate, endDate, stockRows || []);
            const filtered   = this._applyFiltersForPolicy(aggregated, removeZeros, treatOutliers, treatRuptures);

            if (filtered.length < 2) {
                m.safety_stock  = null;
                m.reorder_point = null;
                m.max_stock     = null;
            } else {
                const params = { period: param, alpha: param, regressionPeriod: param };
                const fc = this._computeForecastLocal(filtered, model, params, serviceLevel);
                if (fc) {
                    const periodSize = { daily: 1, weekly: 7, monthly: 30 }[aggregation] || 1;
                    const dDaily     = fc.nextForecast / periodSize;

                    // Exposure window: contínua = LT; periódica = T + LT
                    const exposureDays = reviewType === "periodic"
                        ? reviewPeriodDays + lt
                        : lt;
                    const safetyStock = fc.z * fc.std * Math.sqrt(exposureDays / periodSize);

                    m.safety_stock  = Math.max(0, safetyStock);
                    m.reorder_point = Math.max(0, dDaily * lt + safetyStock);
                    m.max_stock     = reviewType === "periodic"
                        ? Math.max(0, dDaily * (reviewPeriodDays + lt) + safetyStock)
                        : null;
                } else {
                    m.safety_stock  = null;
                    m.reorder_point = null;
                    m.max_stock     = null;
                }
            }
        } catch {
            m.safety_stock  = null;
            m.reorder_point = null;
            m.max_stock     = null;
        }

        m.kpi_loading = false;
        m.kpi_loaded  = true;
        this._renderMaterialsTable();
    },

    /** Calcula KPIs para um grupo agregando consumo de seus materiais membros */
    async _computeGroupKpis(m) {
        const serviceLevel     = Number(document.getElementById("spdServiceLevel")?.value)       || 95;
        const reviewType       = document.getElementById("spdReviewType")?.value                 || "continuous";
        const reviewPeriod     = document.getElementById("spdPeriodicType")?.value               || "weekly";
        const leadTimeType     = document.getElementById("spdLeadTimeType")?.value               || "auto";
        const customLT         = Number(document.getElementById("spdLeadTimeDays")?.value)       || 1;
        const customCovDays    = Number(document.getElementById("spdCoverageDays")?.value)       || 7;
        const customPeriodDays = Number(document.getElementById("spdCustomPeriodicDays")?.value) || 7;
        const forecastType     = document.getElementById("spdForecastType")?.value               || "auto";

        const reviewPeriodDays = { daily: 1, weekly: 7, monthly: 30, custom: customPeriodDays }[reviewPeriod] || 7;

        let model, param, startDate, aggregation, removeZeros, treatOutliers, treatRuptures;
        if (m.forecast_model) {
            model         = m.forecast_model;
            param         = m.forecast_param;
            startDate     = m.forecast_start_date;
            aggregation   = m.forecast_aggregation || "daily";
            removeZeros   = !!m.forecast_remove_zeros;
            treatOutliers = !!m.forecast_treat_outliers;
            treatRuptures = !!m.forecast_treat_ruptures;
        } else if (forecastType === "custom") {
            model = document.getElementById("spdForecastModel")?.value || "moving-average";
            const paramElId = { "moving-average": "spdMovingAvgPeriod", "exp-smoothing": "spdExpAlpha", "linear-regression": "spdLinearRegPeriod" }[model];
            param         = paramElId ? Number(document.getElementById(paramElId)?.value) : null;
            startDate     = null;
            aggregation   = "daily";
            removeZeros   = false;
            treatOutliers = false;
            treatRuptures = false;
        } else {
            m.safety_stock  = null;
            m.reorder_point = null;
            m.max_stock     = null;
            m.kpi_loading   = false;
            m.kpi_loaded    = true;
            this._renderMaterialsTable();
            return;
        }

        if (!m.groupMaterials || m.groupMaterials.length === 0) {
            m.safety_stock  = null;
            m.reorder_point = null;
            m.max_stock     = null;
            m.kpi_loading   = false;
            m.kpi_loaded    = true;
            this._renderMaterialsTable();
            return;
        }

        const today     = new Date();
        const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        const endDate   = this._formatDateLocal(yesterday);
        if (!startDate) {
            const d90 = new Date(today);
            d90.setDate(d90.getDate() - 90);
            startDate = this._formatDateLocal(d90);
        }

        m.kpi_loading = true;
        m.kpi_loaded  = false;
        this._renderMaterialsTable();

        try {
            // Lead time: fetch for all group materials and average if not cached
            if (leadTimeType === "auto" && m.lead_time == null) {
                const ltValues = await Promise.all(
                    m.groupMaterials.map(gm => this._fetchLeadTime(gm.name))
                );
                const validLts = ltValues.filter(v => v != null);
                m.lead_time = validLts.length > 0
                    ? validLts.reduce((s, v) => s + v, 0) / validLts.length
                    : null;
            }
            const effectiveLT = leadTimeType === "custom" ? customLT : Math.max(m.lead_time ?? 1, 1);

            // Fetch consumption + stock for all group materials in parallel
            const [allConsumption, allStock] = await Promise.all([
                Promise.all(m.groupMaterials.map(gm =>
                    apiCall(`${API}/consumption?${new URLSearchParams({ material: gm.name, startDate, endDate })}`).catch(() => [])
                )),
                Promise.all(m.groupMaterials.map(gm =>
                    apiCall(`${API}/stock-monitor?${new URLSearchParams({ material: gm.name, startDate, endDate })}`).catch(() => [])
                ))
            ]);

            // Aggregate each material independently, then merge by summing per bucket key
            const mergedMap = new Map();
            m.groupMaterials.forEach((_, idx) => {
                const buckets = this._aggregateForPolicy(
                    allConsumption[idx] || [], aggregation, startDate, endDate, allStock[idx] || []
                );
                buckets.forEach(b => {
                    if (!mergedMap.has(b.key)) mergedMap.set(b.key, { key: b.key, value: 0, hasStock: false });
                    const e = mergedMap.get(b.key);
                    e.value   += b.value;
                    e.hasStock = e.hasStock || !!b.hasStock;
                });
            });
            const merged   = Array.from(mergedMap.values()).sort((a, b) => a.key.localeCompare(b.key));
            const filtered = this._applyFiltersForPolicy(merged, removeZeros, treatOutliers, treatRuptures);

            if (filtered.length < 2) {
                m.safety_stock  = null;
                m.reorder_point = null;
                m.max_stock     = null;
            } else {
                const params = { period: param, alpha: param, regressionPeriod: param };
                const fc     = this._computeForecastLocal(filtered, model, params, serviceLevel);
                if (fc) {
                    const periodSize   = { daily: 1, weekly: 7, monthly: 30 }[aggregation] || 1;
                    const dDaily       = fc.nextForecast / periodSize;
                    const exposureDays = reviewType === "periodic"
                        ? reviewPeriodDays + effectiveLT
                        : effectiveLT;
                    const safetyStock  = fc.z * fc.std * Math.sqrt(exposureDays / periodSize);

                    m.safety_stock  = Math.max(0, safetyStock);
                    m.reorder_point = Math.max(0, dDaily * effectiveLT + safetyStock);
                    m.max_stock     = reviewType === "periodic"
                        ? Math.max(0, dDaily * (reviewPeriodDays + effectiveLT) + safetyStock)
                        : null;
                } else {
                    m.safety_stock  = null;
                    m.reorder_point = null;
                    m.max_stock     = null;
                }
            }
        } catch (e) {
            m.safety_stock  = null;
            m.reorder_point = null;
            m.max_stock     = null;
        }

        m.kpi_loading = false;
        m.kpi_loaded  = true;
        this._renderMaterialsTable();
    },

    // ══════════════════════════════════════════════════════════════════════
    // ── Cálculos Estatísticos ──
    // ══════════════════════════════════════════════════════════════════════

    /** Agrega consumo diário em buckets (diário/semanal/mensal) e preenche lacunas */
    _aggregateForPolicy(rows, aggregation, startDate, endDate, stockRows = []) {
        const buckets = new Map();
        rows.forEach(row => {
            const date = new Date(row.day + "T00:00:00");
            let key;
            if (aggregation === "weekly") {
                const d = date.getDay();
                const monday = new Date(date);
                monday.setDate(date.getDate() + (d === 0 ? -6 : 1 - d));
                key = this._formatDateLocal(monday);
            } else if (aggregation === "monthly") {
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            } else {
                key = row.day;
            }
            if (!buckets.has(key)) buckets.set(key, { key, value: 0 });
            buckets.get(key).value += Number(row.consumption || 0);
        });

        // Fill gaps between startDate and endDate
        const start = new Date(startDate + "T00:00:00");
        const end   = new Date(endDate   + "T00:00:00");
        if (aggregation === "daily") {
            for (let c = new Date(start); c <= end; c.setDate(c.getDate() + 1)) {
                const k = this._formatDateLocal(c);
                if (!buckets.has(k)) buckets.set(k, { key: k, value: 0 });
            }
        } else if (aggregation === "weekly") {
            const c = new Date(start);
            const dow = c.getDay();
            c.setDate(c.getDate() + (dow === 0 ? -6 : 1 - dow));
            while (c <= end) {
                const k = this._formatDateLocal(c);
                if (!buckets.has(k)) buckets.set(k, { key: k, value: 0 });
                c.setDate(c.getDate() + 7);
            }
        } else {
            const c = new Date(start.getFullYear(), start.getMonth(), 1);
            const endMon = new Date(end.getFullYear(), end.getMonth(), 1);
            while (c <= endMon) {
                const k = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}`;
                if (!buckets.has(k)) buckets.set(k, { key: k, value: 0 });
                c.setMonth(c.getMonth() + 1);
            }
        }

        // Exclude current incomplete period and buckets before startDate
        // (mirrors _aggregateData in consumption-stats.js)
        const todayD = new Date();
        todayD.setHours(0, 0, 0, 0);
        let cutoffKey;
        if (aggregation === "weekly") {
            const dow = todayD.getDay();
            const mon = new Date(todayD);
            mon.setDate(todayD.getDate() + (dow === 0 ? -6 : 1 - dow));
            cutoffKey = this._formatDateLocal(mon);
        } else if (aggregation === "monthly") {
            cutoffKey = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, "0")}`;
        } else {
            cutoffKey = this._formatDateLocal(todayD);
        }

        const all = Array.from(buckets.values())
            .sort((a, b) => a.key.localeCompare(b.key))
            .filter(b => b.key >= startDate && b.key < cutoffKey);

        // Mark hasStock using carry-forward balance (mirrors _aggregateData)
        const sortedStock = stockRows.filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date));
        if (sortedStock.length > 0) {
            const bucketEndKey = (key) => {
                if (aggregation === "daily") return key;
                if (aggregation === "weekly") {
                    const d = new Date(key + "T00:00:00");
                    d.setDate(d.getDate() + 6);
                    return this._formatDateLocal(d);
                }
                const [y, mo] = key.split("-").map(Number);
                return this._formatDateLocal(new Date(y, mo, 0));
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

        return all;
    },

    /** Filtra dados: remove zeros, outliers (IQR) e rupturas de estoque */
    _applyFiltersForPolicy(data, removeZeros, treatOutliers, treatRuptures) {
        let result = data.slice();
        if (removeZeros) result = result.filter(d => d.value > 0);
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

    /** Calcula previsão e desvio para um método estatístico (MA, ES, LR, média) */
    _computeForecastLocal(data, method, params, serviceLevel) {
        const values = data.map(d => d.value);
        const n = values.length;
        if (n < 2) return null;

        const residuals = [];
        let nextForecast;

        if (method === "moving-average") {
            const p = Math.max(2, Math.min(params.period || 7, n - 1));
            for (let i = p; i < n; i++) {
                const fcast = values.slice(i - p, i).reduce((s, v) => s + v, 0) / p;
                residuals.push(values[i] - fcast);
            }
            nextForecast = values.slice(n - p).reduce((s, v) => s + v, 0) / p;

        } else if (method === "exp-smoothing") {
            const alpha = Math.max(0.01, Math.min(0.99, params.alpha || 0.3));
            let s = values[0];
            for (let i = 1; i < n; i++) {
                residuals.push(values[i] - s);
                s = alpha * values[i] + (1 - alpha) * s;
            }
            nextForecast = s;

        } else if (method === "linear-regression") {
            const rp = Math.max(3, Math.min(params.regressionPeriod || 30, n));
            for (let i = rp; i < n; i++) {
                const xs = Array.from({ length: rp }, (_, j) => j);
                const ys = values.slice(i - rp, i);
                const { a, b } = this._linearRegLocal(xs, ys);
                residuals.push(values[i] - Math.max(0, a + b * rp));
            }
            const xs = Array.from({ length: rp }, (_, j) => j);
            const ys = values.slice(n - rp);
            const { a, b } = this._linearRegLocal(xs, ys);
            nextForecast = Math.max(0, a + b * rp);

        } else {
            // arithmetic mean
            for (let i = 1; i < n; i++) {
                const mean = values.slice(0, i).reduce((s, v) => s + v, 0) / i;
                residuals.push(values[i] - mean);
            }
            nextForecast = values.reduce((s, v) => s + v, 0) / n;
        }

        return {
            nextForecast,
            std: this._stdDevLocal(residuals),
            z:   this._zScoreLocal(serviceLevel)
        };
    },

    _zScoreLocal(serviceLevel) {
        const p = Math.max(0.501, Math.min(0.999, serviceLevel / 100));
        const t = Math.sqrt(-2 * Math.log(1 - p));
        const c = [2.515517, 0.802853, 0.010328];
        const d = [1.432788, 0.189269, 0.001308];
        return t - (c[0] + c[1] * t + c[2] * t * t) /
                   (1 + d[0] * t + d[1] * t * t + d[2] * t * t * t);
    },

    _stdDevLocal(arr) {
        if (!arr.length) return 0;
        return Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);
    },

    _linearRegLocal(xs, ys) {
        const n     = xs.length;
        const sumX  = xs.reduce((s, v) => s + v, 0);
        const sumY  = ys.reduce((s, v) => s + v, 0);
        const sumXY = xs.reduce((s, v, i) => s + v * ys[i], 0);
        const sumX2 = xs.reduce((s, v) => s + v * v, 0);
        const denom = n * sumX2 - sumX * sumX;
        if (denom === 0) return { a: sumY / n, b: 0 };
        const b = (n * sumXY - sumX * sumY) / denom;
        return { a: (sumY - b * sumX) / n, b };
    },

    /** Formata data como YYYY-MM-DD */
    _formatDateLocal(date) {
        const y  = date.getFullYear();
        const mo = String(date.getMonth() + 1).padStart(2, "0");
        const d  = String(date.getDate()).padStart(2, "0");
        return `${y}-${mo}-${d}`;
    },

    // ══════════════════════════════════════════════════════════════════════
    // ── Utilitários ──
    // ══════════════════════════════════════════════════════════════════════

    /** Define os botões de ação no header (Salvar/Cancelar) */
    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        headerOptions.innerHTML = `
            <button class="btn-primary" onclick="StockPoliciesDetails.save()">Salvar</button>
            <button class="btn-secondary" onclick="showScreen('stock-policies')">Cancelar</button>
        `;
    },

    /** Salva ou atualiza a política de estoque com seus itens */
    async save() {
        const name = document.getElementById("spdName").value.trim();
        if (!name) {
            alert("Nome da política é obrigatório.");
            return;
        }

        const reviewType   = document.getElementById("spdReviewType").value;
        const periodicType = document.getElementById("spdPeriodicType")?.value || null;
        const forecastType = document.getElementById("spdForecastType").value;
        const forecastModel = forecastType === "custom" ? document.getElementById("spdForecastModel").value : null;

        const paramEl = {
            "moving-average":    document.getElementById("spdMovingAvgPeriod"),
            "exp-smoothing":     document.getElementById("spdExpAlpha"),
            "linear-regression": document.getElementById("spdLinearRegPeriod")
        }[forecastModel];
        const forecastParam = paramEl ? parseFloat(paramEl.value) : null;

        const payload = {
            name,
            description:        document.getElementById("spdDescription").value.trim() || null,
            service_level:      parseFloat(document.getElementById("spdServiceLevel").value) || 95,
            review_type:        reviewType,
            review_period:      reviewType === "periodic" ? periodicType : null,
            review_period_days: reviewType === "periodic" && periodicType === "custom"
                                    ? parseInt(document.getElementById("spdCustomPeriodicDays").value) || null
                                    : null,
            lead_time_type:     document.getElementById("spdLeadTimeType").value,
            lead_time_days:     document.getElementById("spdLeadTimeType").value === "custom"
                                    ? parseInt(document.getElementById("spdLeadTimeDays").value) || null
                                    : null,
            coverage_type:      document.getElementById("spdCoverageType").value,
            coverage_days:      document.getElementById("spdCoverageType").value === "custom"
                                    ? parseInt(document.getElementById("spdCoverageDays").value) || null
                                    : null,
            forecast_type:      forecastType,
            forecast_model:     forecastModel,
            forecast_param:     forecastParam,
            items: this.materials.map(m => {
                if (m.type === 'group') {
                    return {
                        item_type:      'group',
                        group_id:       parseInt(m.id),
                        forecast_model: m.forecast_model || null,
                        forecast_param: m.forecast_param ?? null,
                        lead_time_days: m.lead_time != null ? Math.round(m.lead_time) : null,
                        coverage_days:  null
                    };
                }
                return {
                    item_type:      'material',
                    material_id:    parseInt(m.id),
                    forecast_model: m.forecast_model || null,
                    forecast_param: m.forecast_param ?? null,
                    lead_time_days: m.lead_time != null ? Math.round(m.lead_time) : null,
                    coverage_days:  null
                };
            })
        };

        try {
            const policy = StockPolicies.selectedPolicy;
            if (policy) {
                await apiCall(API + `/stock-policies/${policy.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                alert("Política atualizada com sucesso.");
            } else {
                await apiCall(API + "/stock-policies", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                alert("Política criada com sucesso.");
            }
            showScreen("stock-policies");
        } catch (error) {
            alert(error.message || "Erro ao salvar política.");
        }
    }
};
