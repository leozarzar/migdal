/**
 * @file kpi-dashboard.js
 * @description Tela de Acompanhamento de KPIs — evolução mensal dos principais
 *   indicadores de estoque com gráfico de linha, tooltip de variação e cards
 *   de resumo do período. Suporta filtro opcional por política de estoque.
 */
const KpiDashboard = {

    // ── Estado ───────────────────────────────────────────────────────────────

    _kpi:           'turnover',
    _startMonth:    '',
    _endMonth:      '',
    _policyId:      null,
    _includeAdjust: false,
    _data:          [],          // [{ period: 'YYYY-MM', value: number|null }]
    _chartPoints:   [],          // pontos acumulados para hover
    _policies:      [],
    _policySelect:  null,

    // ── Definições de KPI ────────────────────────────────────────────────────

    _KPI_DEFS: {
        turnover:  { label: 'Giro de Estoque',          unit: 'x',    decimals: 2, higherIsBetter: true,  icon: 'autorenew',      description: 'Rotatividade do estoque no período' },
        stockout:  { label: 'Rupturas',                  unit: '%',    decimals: 1, higherIsBetter: false, icon: 'warning',         description: 'Percentual de material-dias sem estoque disponível' },
        coverage:  { label: 'Cobertura de Estoque',      unit: 'dias', decimals: 1, higherIsBetter: true,  icon: 'calendar_month', description: 'Estoque médio dividido pelo consumo médio diário' },
        accuracy:  { label: 'Acuracidade',               unit: '%',    decimals: 1, higherIsBetter: true,  icon: 'fact_check',     description: 'Proporção de saídas por uso em relação ao total de saídas' },
        avg_stock: { label: 'Estoque Médio',             unit: 'kg',   decimals: 0, higherIsBetter: null,  icon: 'inventory',      description: 'Média ponderada no tempo do estoque em kg' },
        lead_time: { label: 'Lead Time de Reposição',    unit: 'dias', decimals: 1, higherIsBetter: false, icon: 'local_shipping', description: 'Tempo médio entre data do pedido e data do recebimento' },
    },

    _MONTHS_PT: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],

    // ── Ciclo de Vida ────────────────────────────────────────────────────────

    render() {
        this._policySelect?.destroy();
        this._policySelect = null;
        this._data         = [];
        this._chartPoints  = [];

        const today      = new Date();
        const endMonth   = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const startDate  = new Date(today.getFullYear() - 1, today.getMonth() + 1, 1);
        const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

        this._startMonth    = localStorage.getItem('wcm.kpiDashboard.start')         || startMonth;
        this._endMonth      = localStorage.getItem('wcm.kpiDashboard.end')           || endMonth;
        this._kpi           = localStorage.getItem('wcm.kpiDashboard.kpi')           || 'turnover';
        this._policyId      = localStorage.getItem('wcm.kpiDashboard.policy')        || null;
        this._includeAdjust = localStorage.getItem('wcm.kpiDashboard.includeAdjust') === '1';

        return `
        <div class="kpid-container">
            <div class="kpid-card">

                <div class="kpid-head">
                    <div>
                        <h2 class="kpid-title">Indicadores de Estoque</h2>
                        <p class="kpid-subtitle" id="kpidSubtitle">Evolução mensal dos KPIs operacionais</p>
                    </div>
                </div>

                <div class="kpid-filters">
                    <div class="kpid-filter-group">
                        <label class="kpid-label">Indicador</label>
                        <select id="kpidKpiSelect" class="kpid-select" onchange="KpiDashboard._onKpiChange(this.value)">
                            <option value="turnover"  ${this._kpi === 'turnover'  ? 'selected' : ''}>Giro de Estoque</option>
                            <option value="stockout"  ${this._kpi === 'stockout'  ? 'selected' : ''}>Rupturas</option>
                            <option value="coverage"  ${this._kpi === 'coverage'  ? 'selected' : ''}>Cobertura de Estoque</option>
                            <option value="accuracy"  ${this._kpi === 'accuracy'  ? 'selected' : ''}>Acuracidade</option>
                            <option value="avg_stock" ${this._kpi === 'avg_stock' ? 'selected' : ''}>Estoque Médio</option>
                            <option value="lead_time" ${this._kpi === 'lead_time' ? 'selected' : ''}>Lead Time de Reposição</option>
                        </select>
                    </div>

                    <div class="kpid-filter-group">
                        <label class="kpid-label">Política</label>
                        <div id="kpidPolicyContainer"></div>
                    </div>

                    <div class="kpid-filter-group">
                        <label class="kpid-label">Data Início</label>
                        <input type="month" id="kpidStart" class="kpid-date-input"
                               value="${this._startMonth}"
                               onchange="KpiDashboard._onPeriodChange()">
                    </div>

                    <div class="kpid-filter-group">
                        <label class="kpid-label">Data Fim</label>
                        <input type="month" id="kpidEnd" class="kpid-date-input"
                               value="${this._endMonth}"
                               onchange="KpiDashboard._onPeriodChange()">
                    </div>

                    <div class="kpid-filter-group kpid-filter-adjust" id="kpidAdjustGroup">
                        <label class="kpid-label kpid-label--invisible">Ajuste</label>
                        <label class="kpid-checkbox-label">
                            <input type="checkbox" id="kpidIncludeAdjust"
                                   ${this._includeAdjust ? 'checked' : ''}
                                   onchange="KpiDashboard._onAdjustChange(this.checked)">
                            Considerar ajustes como consumo
                        </label>
                    </div>
                </div>

                <div class="kpid-chart-wrap">
                    <canvas id="kpidChart" height="280"></canvas>
                    <div id="kpidTooltip" class="kpid-tooltip"></div>
                    <div id="kpidEmptyState" class="kpid-empty-state" style="display:none">
                        <span class="material-symbols-outlined kpid-empty-icon">query_stats</span>
                        <p class="kpid-empty-title">Sem dados para o período</p>
                        <p class="kpid-empty-sub">Ajuste o período ou a política selecionada.</p>
                    </div>
                    <div id="kpidLoading" class="kpid-loading" style="display:none">
                        <span class="kpid-loading-text">Calculando...</span>
                    </div>
                </div>
            </div>

            <div class="kpid-summary-row" id="kpidSummary"></div>
        </div>
        `;
    },

    async load() {
        const headerOptions = document.getElementById('headerOptionsContent');
        if (headerOptions) headerOptions.innerHTML = '';

        // Sincroniza estado com DOM (necessário quando load() é chamado por filtros)
        const kpiEl   = document.getElementById('kpidKpiSelect');
        const startEl = document.getElementById('kpidStart');
        const endEl   = document.getElementById('kpidEnd');
        if (kpiEl)   this._kpi        = kpiEl.value;
        if (startEl) this._startMonth = startEl.value;
        if (endEl)   this._endMonth   = endEl.value;

        // Persiste preferências
        localStorage.setItem('wcm.kpiDashboard.kpi',           this._kpi);
        localStorage.setItem('wcm.kpiDashboard.start',         this._startMonth);
        localStorage.setItem('wcm.kpiDashboard.end',           this._endMonth);
        localStorage.setItem('wcm.kpiDashboard.policy',        this._policyId || '');
        localStorage.setItem('wcm.kpiDashboard.includeAdjust', this._includeAdjust ? '1' : '0');

        // Inicializa o filtro de política uma única vez
        if (!this._policySelect) {
            await this._initPolicySelect();
        }

        // Visibilidade do checkbox de ajuste
        this._updateAdjustVisibility();

        // Lê estado atual do checkbox
        const adjEl = document.getElementById('kpidIncludeAdjust');
        if (adjEl) this._includeAdjust = adjEl.checked;

        // Atualiza seleção visual do KPI select
        if (kpiEl) kpiEl.value = this._kpi;

        this._setLoading(true);
        try {
            const params = new URLSearchParams({
                kpi:   this._kpi,
                start: this._startMonth,
                end:   this._endMonth,
            });
            if (this._policyId)    params.set('policy_id',      this._policyId);
            if (this._includeAdjust) params.set('include_adjust', '1');

            this._data = await apiCall(`${API}/kpis?${params.toString()}`);
            this._drawChart();
            this._renderSummary();
            this._updateSubtitle();
        } catch (e) {
            alert('Erro ao carregar KPIs');
        } finally {
            this._setLoading(false);
        }
    },

    // ── Ações Públicas ───────────────────────────────────────────────────────

    _onKpiChange(value) {
        this._kpi = value;
        this._updateAdjustVisibility();
        this.load();
    },

    _onAdjustChange(checked) {
        this._includeAdjust = checked;
        this.load();
    },

    _updateAdjustVisibility() {
        // Checkbox só faz sentido para KPIs que usam consumo (uso/ajuste)
        const ADJUST_KPIS = new Set(['turnover', 'coverage']);
        const group = document.getElementById('kpidAdjustGroup');
        if (group) group.style.display = ADJUST_KPIS.has(this._kpi) ? '' : 'none';
    },

    _onPeriodChange() {
        const startEl = document.getElementById('kpidStart');
        const endEl   = document.getElementById('kpidEnd');
        if (startEl) this._startMonth = startEl.value;
        if (endEl)   this._endMonth   = endEl.value;
        this.load();
    },

    // ── Renderização ─────────────────────────────────────────────────────────

    _drawChart() {
        this._chartPoints = [];
        const canvas = document.getElementById('kpidChart');
        if (!canvas) return;

        const nonNull = this._data.filter(d => d.value !== null && d.value !== undefined);
        const empty   = document.getElementById('kpidEmptyState');

        if (!nonNull.length) {
            canvas.style.display = 'none';
            if (empty) empty.style.display = 'flex';
            this._renderSummary();
            return;
        }
        canvas.style.display = '';
        if (empty) empty.style.display = 'none';

        const height                = 280;
        const { ctx, width }        = CanvasChartUtils.setupCanvas(canvas, height);
        const padding               = { top: 20, right: 20, bottom: 44, left: 60 };
        const chartWidth            = width  - padding.left - padding.right;
        const chartHeight           = height - padding.top  - padding.bottom;

        const values = nonNull.map(d => d.value);
        const rawMax = Math.max(...values);
        const rawMin = Math.min(...values);

        // Margem vertical: ≥10% e mínimo de 10% do max
        const range  = rawMax - rawMin || rawMax * 0.2 || 1;
        const yMax   = rawMax + range * 0.15;
        const yMin   = Math.max(0, rawMin - range * 0.15);
        const yRange = yMax - yMin || 1;

        // Grade horizontal
        const gridCount = 4;
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth   = 1;
        ctx.setLineDash([4, 4]);
        for (let i = 0; i <= gridCount; i++) {
            const y = padding.top + (chartHeight / gridCount) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Rótulos do eixo Y com formatação específica do KPI
        ctx.fillStyle    = '#607d9a';
        ctx.font         = '12px Arial';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i <= gridCount; i++) {
            const value = yMax - (yRange / gridCount) * i;
            const y     = padding.top + (chartHeight / gridCount) * i;
            ctx.fillText(this._fmtVal(value), padding.left - 8, y);
        }

        const n = this._data.length;
        const stepX = n > 1 ? chartWidth / (n - 1) : chartWidth / 2;

        const toX = i => padding.left + i * stepX;
        const toY = v => padding.top + chartHeight - ((v - yMin) / yRange) * chartHeight;

        // Pontos apenas com valor não-nulo
        const pts = [];
        this._data.forEach((d, i) => {
            if (d.value === null || d.value === undefined) return;
            const prev = this._data.slice(0, i).reverse().find(p => p.value !== null && p.value !== undefined);
            const delta = prev ? ((d.value - prev.value) / Math.abs(prev.value)) * 100 : null;
            const pt = {
                x: toX(i),
                y: toY(d.value),
                value: d.value,
                period: d.period,
                delta,
            };
            pts.push(pt);
            this._chartPoints.push(pt);
        });

        CanvasChartUtils.drawLineSeries(ctx, pts, '#3b82f6', padding, chartHeight, null);

        // Pontos com coloração por variação significativa
        for (const pt of pts) {
            const def = this._KPI_DEFS[this._kpi];
            let dotColor = '#3b82f6';
            if (pt.delta !== null && def.higherIsBetter !== null) {
                const isGood = def.higherIsBetter ? pt.delta > 5 : pt.delta < -5;
                const isBad  = def.higherIsBetter ? pt.delta < -5 : pt.delta > 5;
                if (isGood) dotColor = '#22c55e';
                else if (isBad) dotColor = '#ef4444';
            }
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
            ctx.fillStyle   = dotColor;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 2;
            ctx.fill();
            ctx.stroke();
        }

        // Eixo X — abreviações de meses em PT
        ctx.fillStyle    = '#607d9a';
        ctx.font         = '11px Arial';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';

        // Amostragem inteligente para evitar sobreposição
        const minSpacing  = 42;
        let lastLabelX    = -Infinity;

        this._data.forEach((d, i) => {
            const x = toX(i);
            if (x - lastLabelX < minSpacing) return;
            lastLabelX = x;
            const [y, mo] = d.period.split('-').map(Number);
            const label = `${this._MONTHS_PT[mo - 1]}/${String(y).slice(2)}`;
            ctx.fillText(label, x, padding.top + chartHeight + 10);
        });

        // Listener de hover (rebind sempre que redesenha)
        canvas.onmousemove = e => this._onHover(e);
        canvas.onmouseleave = () => {
            const tt = document.getElementById('kpidTooltip');
            if (tt) tt.style.display = 'none';
        };
    },

    _onHover(e) {
        const canvas  = document.getElementById('kpidChart');
        const tooltip = document.getElementById('kpidTooltip');
        if (!canvas || !tooltip || !this._chartPoints.length) return;

        const mx = e.offsetX;
        const SNAP = 40;

        let closest = null;
        let minDist = Infinity;
        for (const pt of this._chartPoints) {
            const d = Math.abs(pt.x - mx);
            if (d < SNAP && d < minDist) { minDist = d; closest = pt; }
        }

        if (!closest) { tooltip.style.display = 'none'; return; }

        const def        = this._KPI_DEFS[this._kpi];
        const [y, mo]    = closest.period.split('-').map(Number);
        const periodLabel = `${this._MONTHS_PT[mo - 1]}/${y}`;
        const valueLabel  = `${this._fmtVal(closest.value)} ${def.unit}`;

        let deltaHtml = '';
        if (closest.delta !== null) {
            const isGood  = def.higherIsBetter === null ? null
                          : def.higherIsBetter ? closest.delta > 0 : closest.delta < 0;
            const sign    = closest.delta >= 0 ? '▲' : '▼';
            const color   = isGood === null ? '#64748b' : isGood ? '#22c55e' : '#ef4444';
            const absDelta = Math.abs(closest.delta).toFixed(1);
            deltaHtml = `<div class="kpid-tooltip-delta" style="color:${color}">${sign} ${absDelta}% vs mês anterior</div>`;
        } else {
            deltaHtml = `<div class="kpid-tooltip-delta" style="color:#94a3b8">Primeiro período</div>`;
        }

        tooltip.innerHTML = `
            <div class="kpid-tooltip-period">${periodLabel}</div>
            <div class="kpid-tooltip-value">${valueLabel}</div>
            ${deltaHtml}
        `;
        tooltip.style.display = 'block';
        CanvasChartUtils.positionTooltip(tooltip, e, canvas.parentElement);
    },

    _renderSummary() {
        const container = document.getElementById('kpidSummary');
        if (!container) return;

        const def     = this._KPI_DEFS[this._kpi];
        const nonNull = this._data.filter(d => d.value !== null && d.value !== undefined);

        if (!nonNull.length) {
            container.innerHTML = '';
            return;
        }

        const last    = nonNull[nonNull.length - 1];
        const prev    = nonNull.length > 1 ? nonNull[nonNull.length - 2] : null;
        const avg     = nonNull.reduce((s, d) => s + d.value, 0) / nonNull.length;
        const first   = nonNull[0];
        const totalDelta = nonNull.length > 1 && first.value !== 0
            ? ((last.value - first.value) / Math.abs(first.value)) * 100
            : null;

        const [ly, lm] = last.period.split('-').map(Number);
        const lastLabel = `${this._MONTHS_PT[lm - 1]}/${ly}`;

        let deltaVsPrevHtml = '—';
        if (prev) {
            const delta  = ((last.value - prev.value) / Math.abs(prev.value)) * 100;
            const isGood = def.higherIsBetter === null ? null
                         : def.higherIsBetter ? delta > 0 : delta < 0;
            const color  = isGood === null ? '#64748b' : isGood ? '#22c55e' : '#ef4444';
            const sign   = delta >= 0 ? '▲' : '▼';
            deltaVsPrevHtml = `<span style="color:${color}">${sign} ${Math.abs(delta).toFixed(1)}%</span>`;
        }

        let totalDeltaHtml = '—';
        if (totalDelta !== null) {
            const isGood = def.higherIsBetter === null ? null
                         : def.higherIsBetter ? totalDelta > 0 : totalDelta < 0;
            const color  = isGood === null ? '#64748b' : isGood ? '#22c55e' : '#ef4444';
            const sign   = totalDelta >= 0 ? '▲' : '▼';
            totalDeltaHtml = `<span style="color:${color}">${sign} ${Math.abs(totalDelta).toFixed(1)}%</span>`;
        }

        container.innerHTML = `
            <div class="kpid-summary-card">
                <div class="kpid-summary-icon">
                    <span class="material-symbols-outlined">${def.icon}</span>
                </div>
                <div class="kpid-summary-label">Último período</div>
                <div class="kpid-summary-value">${this._fmtVal(last.value)} <span class="kpid-summary-unit">${def.unit}</span></div>
                <div class="kpid-summary-sub">${lastLabel} &nbsp;·&nbsp; ${deltaVsPrevHtml} vs anterior</div>
            </div>
            <div class="kpid-summary-card">
                <div class="kpid-summary-icon">
                    <span class="material-symbols-outlined">show_chart</span>
                </div>
                <div class="kpid-summary-label">Média do período</div>
                <div class="kpid-summary-value">${this._fmtVal(avg)} <span class="kpid-summary-unit">${def.unit}</span></div>
                <div class="kpid-summary-sub">${nonNull.length} ${nonNull.length === 1 ? 'mês' : 'meses'} com dados</div>
            </div>
            <div class="kpid-summary-card">
                <div class="kpid-summary-icon">
                    <span class="material-symbols-outlined">trending_up</span>
                </div>
                <div class="kpid-summary-label">Variação no período</div>
                <div class="kpid-summary-value">${totalDeltaHtml}</div>
                <div class="kpid-summary-sub">Em relação ao primeiro mês com dados</div>
            </div>
        `;
    },

    _updateSubtitle() {
        const el  = document.getElementById('kpidSubtitle');
        const def = this._KPI_DEFS[this._kpi];
        if (el && def) el.textContent = def.description;
    },

    // ── Filtro de Política ───────────────────────────────────────────────────

    async _initPolicySelect() {
        try {
            this._policies = await apiCall(`${API}/stock-policies`) || [];
        } catch {
            this._policies = [];
        }

        this._policySelect = createSearchSelect({
            id: 'kpidPolicy',
            placeholder: 'Todos os materiais',
            searchable: false,
            multiple: false,
            sections: [{
                key: 'policy',
                items: this._policies.map(p => ({ value: String(p.id), label: p.name })),
            }],
            onChange: ({ value }) => {
                this._policyId = value != null ? String(value) : null;
                localStorage.setItem('wcm.kpiDashboard.policy', this._policyId || '');
                KpiDashboard.load();
            },
        });

        const container = document.getElementById('kpidPolicyContainer');
        if (container) {
            this._policySelect.mount(container);
            const saved = localStorage.getItem('wcm.kpiDashboard.policy');
            if (saved) {
                this._policyId = saved;
                this._policySelect.select('policy', saved);
            }
        }
    },

    // ── Utilitários ──────────────────────────────────────────────────────────

    _setLoading(on) {
        const el = document.getElementById('kpidLoading');
        if (el) el.style.display = on ? 'flex' : 'none';
    },

    _fmtVal(v) {
        if (v === null || v === undefined) return '—';
        const def = this._KPI_DEFS[this._kpi];
        if (!def) return String(v);
        return def.decimals === 0
            ? Math.round(v).toLocaleString('pt-BR')
            : v.toLocaleString('pt-BR', { minimumFractionDigits: def.decimals, maximumFractionDigits: def.decimals });
    },
};
