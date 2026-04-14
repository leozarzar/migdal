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
    _isDirty: false,     // indica se há alterações não salvas

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

    /** Marca o formulário como modificado */
    _markDirty() { this._isDirty = true; },

    /** Permite ao router verificar se pode navegar para outra tela */
    async canLeave() {
        if (!this._isDirty) return true;
        return confirm('Você tem alterações não salvas. Deseja sair sem salvar?');
    },

    /** Inicializa a tela, carrega selects e preenche formulário se editando */
    async load() {
        this._isDirty = false;
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

        await this._refreshSelects();

        const policy = StockPolicies.selectedPolicy;
        if (policy) {
            document.getElementById("spdPageTitle").textContent = policy.name || "Política de Estoque";
            await this._fillForm(policy);
        } else {
            document.getElementById("spdPageTitle").textContent = "Nova Política de Estoque";
        }

        // Marca o form como sujo em qualquer alteração de campo (após preencher)
        document.querySelectorAll('#content input, #content select, #content textarea')
            .forEach(el => el.addEventListener('change', () => this._markDirty()));
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

    async _refreshSelects() {
        if (!this._itemSelect) return;
        try {
            const [materials, groups] = await Promise.all([
                apiCall(API + '/materials').catch(() => []),
                apiCall(API + '/groups').catch(() => [])
            ]);
            this._itemSelect.setItems('material', (materials || []).map(m => ({ value: m.id, label: m.name })));
            this._itemSelect.setItems('group', (groups || []).map(g => ({ value: g.id, label: g.name })));
        } catch (e) { /* falha silenciosa em background */ }
    },

    async onTabFocus() { await this._refreshSelects(); },

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
            const lt = result?.lead_time ?? null;
            this._leadTimeCache[materialName] = lt;
            return lt;
        } catch {
            this._leadTimeCache[materialName] = null;
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

        const policyData = this._readPolicyDataFromDom();
        const policyItem = {
            forecast_model:          m.forecast_model   || null,
            forecast_param:          m.forecast_param   ?? null,
            forecast_start_date:     m.forecast_start_date || null,
            forecast_aggregation:    m.forecast_aggregation || null,
            forecast_remove_zeros:   m.forecast_remove_zeros   || false,
            forecast_treat_outliers: m.forecast_treat_outliers || false,
            forecast_treat_ruptures: m.forecast_treat_ruptures || false,
            lead_time_days:          m.lead_time ?? null,
        };

        m.kpi_loading = true;
        m.kpi_loaded  = false;
        this._renderMaterialsTable();

        const kpi = await StockPolicyUtils.computeItemKpis(m.name, policyItem, policyData, n => this._fetchLeadTime(n));
        m.safety_stock  = kpi.safetyStock;
        m.reorder_point = kpi.reorderPoint;
        m.max_stock     = kpi.maxStock;
        m.kpi_loading   = false;
        m.kpi_loaded    = true;
        this._renderMaterialsTable();
    },

    /** Calcula KPIs para um grupo agregando consumo de seus materiais membros */
    async _computeGroupKpis(m) {
        if (!m.groupMaterials || m.groupMaterials.length === 0) {
            m.safety_stock  = null;
            m.reorder_point = null;
            m.max_stock     = null;
            m.kpi_loading   = false;
            m.kpi_loaded    = true;
            this._renderMaterialsTable();
            return;
        }

        const policyData = this._readPolicyDataFromDom();

        m.kpi_loading = true;
        m.kpi_loaded  = false;
        this._renderMaterialsTable();

        // Resolve and cache lead time average for table display
        if (policyData.lead_time_type === "auto" && m.lead_time == null) {
            const lts   = await Promise.all(m.groupMaterials.map(gm => this._fetchLeadTime(gm.name)));
            const valid = lts.filter(v => v != null);
            m.lead_time = valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
        }

        const policyItem = {
            forecast_model:          m.forecast_model   || null,
            forecast_param:          m.forecast_param   ?? null,
            forecast_start_date:     m.forecast_start_date || null,
            forecast_aggregation:    m.forecast_aggregation || null,
            forecast_remove_zeros:   m.forecast_remove_zeros   || false,
            forecast_treat_outliers: m.forecast_treat_outliers || false,
            forecast_treat_ruptures: m.forecast_treat_ruptures || false,
            lead_time_days:          m.lead_time ?? null,
        };

        const memberNames = m.groupMaterials.map(gm => gm.name);
        const kpi = await StockPolicyUtils.computeGroupKpis(memberNames, policyItem, policyData, n => this._fetchLeadTime(n));
        m.safety_stock  = kpi.safetyStock;
        m.reorder_point = kpi.reorderPoint;
        m.max_stock     = kpi.maxStock;
        m.kpi_loading   = false;
        m.kpi_loaded    = true;
        this._renderMaterialsTable();
    },

    /** Lê os parâmetros da política de estoque a partir dos elementos do formulário */
    _readPolicyDataFromDom() {
        const forecastType     = document.getElementById("spdForecastType")?.value || "auto";
        const reviewPeriod     = document.getElementById("spdPeriodicType")?.value || "weekly";
        const customPeriodDays = Number(document.getElementById("spdCustomPeriodicDays")?.value) || 7;

        let forecast_model = null;
        let forecast_param = null;
        if (forecastType === "custom") {
            forecast_model = document.getElementById("spdForecastModel")?.value || "moving-average";
            const paramElId = { "moving-average": "spdMovingAvgPeriod", "exp-smoothing": "spdExpAlpha", "linear-regression": "spdLinearRegPeriod" }[forecast_model];
            forecast_param = paramElId ? Number(document.getElementById(paramElId)?.value) : null;
        }

        return {
            service_level:      Number(document.getElementById("spdServiceLevel")?.value) || 95,
            review_type:        document.getElementById("spdReviewType")?.value || "continuous",
            review_period:      reviewPeriod,
            review_period_days: customPeriodDays,
            lead_time_type:     document.getElementById("spdLeadTimeType")?.value || "auto",
            lead_time_days:     Number(document.getElementById("spdLeadTimeDays")?.value) || 1,
            forecast_type:      forecastType,
            forecast_model,
            forecast_param,
        };
    },

    // ══════════════════════════════════════════════════════════════════════
    // ── Utilitários ──
    // ══════════════════════════════════════════════════════════════════════

    /** Define o botão de ação no header (Salvar) */
    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        headerOptions.innerHTML = `
            <button class="btn-primary" onclick="StockPoliciesDetails.save()">Salvar</button>
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
            this._isDirty = false;
            showScreen("stock-policies");
        } catch (error) {
            alert(error.message || "Erro ao salvar política.");
        }
    }
};
