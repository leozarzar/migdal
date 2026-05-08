/**
 * @file mobile/screens/home.js
 * @description Tela inicial do mobile — saudação, KPIs primários, hero do
 *   material crítico, chips de filtro rápido, grid de materiais (balanço),
 *   gráfico de consumo semanal e bottom sheet de filtros (política + local).
 *
 * Estende MobApp com o sub-objeto HomeScreen.
 * Carregado após mobile/app.js.
 */

const HOME_LS_POLICY   = 'wcm.mobile.home.policyId';
const HOME_LS_LOCATION = 'wcm.mobile.home.locationId';

Object.assign(MobApp, {

    HomeScreen: {

        // ── Estado ───────────────────────────────────────────────────────────

        weekStart: null,
        materials: [],
        selectedMaterials: [],
        materialColors: {},
        _chartSegments: [],
        policies: [],
        locations: [],
        _selectedPolicyId: null,
        _selectedLocationId: null,
        _policyFull: null,
        _balanceRows: [],
        _activeKpi: 'levels',
        _heroIndex: 0,
        _groupedMaterialNames: null,
        _leadTimeCache: {},
        _materialColorMap: {},
        _heroRanked: [],
        _greetingApplied: false,
        _uniqueStockTotal: 0,
        _uniqueMaterialCount: 0,
        _leadTime30d: null,

        // ── Ciclo de vida ────────────────────────────────────────────────────

        async load() {
            this.weekStart  = this._startOfWeek(new Date());
            this._leadTimeCache = {};

            this._applyGreeting();

            // Restaura preferências persistidas
            const savedPolicy   = localStorage.getItem(HOME_LS_POLICY) || null;
            const savedLocation = localStorage.getItem(HOME_LS_LOCATION) || null;
            if (savedPolicy)   this._selectedPolicyId   = savedPolicy;
            if (savedLocation) this._selectedLocationId = savedLocation;

            try {
                const [materials, policies, locations] = await Promise.all([
                    apiCall(API + '/materials'),
                    apiCall(API + '/stock-policies'),
                    apiCall(API + '/locations').catch(() => []),
                ]);

                this.materials = (materials || [])
                    .map(m => m.name).filter(Boolean)
                    .sort((a, b) => a.localeCompare(b));

                this._materialColorMap = Object.fromEntries(
                    (materials || []).filter(m => m.name && m.color).map(m => [m.name, m.color])
                );

                this.policies  = policies || [];
                this.locations = filterUserLocations(locations || []);
                this._assignMaterialColors();
                this._renderPoliciesSelect();
                this._renderLocationsSelect();
                this._bindChartEvents();

                await this.onPolicyChange(this._selectedPolicyId || null);
            } catch {
                MobApp._toast('Erro ao carregar dados do dashboard', 'error');
            }
        },

        _applyGreeting() {
            if (this._greetingApplied) return;
            const eyebrow = document.getElementById('mobHomeGreetEyebrow');
            const nameEl  = document.getElementById('mobHomeGreetName');
            if (!eyebrow || !nameEl) return;

            const h = new Date().getHours();
            let greet = 'olá';
            if (h < 5)        greet = 'boa madrugada';
            else if (h < 12)  greet = 'bom dia';
            else if (h < 18)  greet = 'boa tarde';
            else              greet = 'boa noite';
            eyebrow.textContent = greet;

            const name = (localStorage.getItem('wcm.auth.name') || '').trim();
            const first = name ? name.split(/\s+/)[0] : 'visitante';
            nameEl.textContent = first;

            this._greetingApplied = true;
        },

        // ── Navegação semanal ────────────────────────────────────────────────

        prevWeek() {
            this.weekStart.setDate(this.weekStart.getDate() - 7);
            this.refresh();
        },

        nextWeek() {
            this.weekStart.setDate(this.weekStart.getDate() + 7);
            this.refresh();
        },

        // ── Notificações (placeholder) ───────────────────────────────────────

        openNotifications() {
            MobApp._toast('Sem novas notificações');
        },

        // ── Bottom sheet de filtros ──────────────────────────────────────────

        openFilters() {
            const bd = document.getElementById('mobHomeFiltersBackdrop');
            if (bd) bd.style.display = 'flex';
        },

        closeFilters() {
            const bd = document.getElementById('mobHomeFiltersBackdrop');
            if (bd) bd.style.display = 'none';
        },

        _onFiltersBackdropClick(e) {
            const bd = document.getElementById('mobHomeFiltersBackdrop');
            if (e.target === bd) this.closeFilters();
        },

        resetFilters() {
            this._selectedLocationId = null;
            localStorage.removeItem(HOME_LS_LOCATION);
            const locSel = document.getElementById('mobHomeLocationSelect');
            if (locSel) locSel.value = '';
            this.onPolicyChange(null);
            this.closeFilters();
        },

        async onLocationChange() {
            const sel = document.getElementById('mobHomeLocationSelect');
            const id = sel ? (sel.value || null) : null;
            this._selectedLocationId = id;
            if (id) localStorage.setItem(HOME_LS_LOCATION, id);
            else    localStorage.removeItem(HOME_LS_LOCATION);
            await this._computeBalanceData();
        },

        // ── Chips de KPI ─────────────────────────────────────────────────────

        setKpi(kpi) {
            this._activeKpi = kpi || 'levels';
            document.querySelectorAll('.mob-home-chip').forEach(c => {
                c.classList.toggle('mob-home-chip--active', c.dataset.kpi === this._activeKpi);
            });
            this._renderHero();
        },

        _severity(row) {
            if (row.currentStock == null || row.reorderPoint == null) return 'unknown';
            if (row.currentStock <= (row.safetyStock ?? 0)) return 'critical';
            if (row.currentStock <= row.reorderPoint)       return 'warning';
            return 'ok';
        },

        // ── Selects do bottom sheet ──────────────────────────────────────────

        _renderPoliciesSelect() {
            const select = document.getElementById('mobHomePolicySelect');
            if (!select) return;

            const current = this._selectedPolicyId || '';
            select.innerHTML = '<option value="">Selecione...</option>';
            this.policies.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                if (String(p.id) === String(current)) opt.selected = true;
                select.appendChild(opt);
            });

            if (!current && this.policies.length === 1) {
                select.value = this.policies[0].id;
                this._selectedPolicyId = String(this.policies[0].id);
                localStorage.setItem(HOME_LS_POLICY, this._selectedPolicyId);
            }
        },

        _renderLocationsSelect() {
            const select = document.getElementById('mobHomeLocationSelect');
            if (!select) return;
            const current = this._selectedLocationId || '';
            select.innerHTML = '<option value="">Todas</option>';
            (this.locations || []).forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id;
                opt.textContent = l.name;
                if (String(l.id) === String(current)) opt.selected = true;
                select.appendChild(opt);
            });
        },

        async onPolicyChange(forceId) {
            const select = document.getElementById('mobHomePolicySelect');
            const policyId = forceId !== undefined
                ? (forceId ? String(forceId) : '')
                : (select ? select.value : '');

            if (forceId !== undefined && select) select.value = policyId;

            this._selectedPolicyId = policyId || null;
            if (policyId) localStorage.setItem(HOME_LS_POLICY, policyId);
            else          localStorage.removeItem(HOME_LS_POLICY);

            if (!policyId) {
                this._policyFull            = null;
                this._balanceRows           = [];
                this._groupedMaterialNames  = null;
                this.selectedMaterials      = [];
                this._uniqueStockTotal      = 0;
                this._uniqueMaterialCount   = 0;
                this._leadTime30d           = null;
                this._drawStackedChart(this._getWeekDays(), {}, []);
                this._updateWeekLabel();
                this._renderHero();
                this._renderKpis();
                return;
            }

            try {
                const policyFull = await apiCall(`${API}/stock-policies/${policyId}`);
                this._policyFull = policyFull;

                const allItems = policyFull.items || [];
                const matItems = allItems.filter(i => (i.item_type || 'material') !== 'group');
                const grpItems = allItems.filter(i => i.item_type === 'group');

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
                    this._computeBalanceData(),
                ]);
            } catch {
                MobApp._toast('Erro ao carregar política de estoque', 'error');
            }
        },

        // ── Gráfico de Consumo ───────────────────────────────────────────────

        async refresh() {
            this._updateWeekLabel();

            const selectedMaterials = this.selectedMaterials;
            const weekDays  = this._getWeekDays();
            const startDate = this._formatDate(weekDays[0]);
            const endDate   = this._formatDate(weekDays[6]);

            if (!selectedMaterials.length) {
                this._drawStackedChart(weekDays, {}, []);
                return;
            }

            try {
                const requests = selectedMaterials.map(material => {
                    const q = new URLSearchParams({ startDate, endDate, material });
                    return apiCall(`${API}/consumption?${q.toString()}`);
                });

                const responses = await Promise.all(requests);
                const seriesByMaterial = this._aggregateByMaterialAndDay(weekDays, selectedMaterials, responses);

                this._drawStackedChart(weekDays, seriesByMaterial, selectedMaterials);
            } catch {
                MobApp._toast('Erro ao carregar dados de consumo', 'error');
            }
        },

        _aggregateByMaterialAndDay(weekDays, selectedMaterials, responses) {
            const series = {};
            selectedMaterials.forEach(material => {
                series[material] = new Map(weekDays.map(day => [this._formatDate(day), 0]));
            });

            responses.forEach((rows, index) => {
                const material    = selectedMaterials[index];
                const materialMap = series[material];
                if (!materialMap) return;
                (rows || []).forEach(row => {
                    const dayKey = row.day;
                    const value  = Number(row.consumption || 0);
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

        _drawStackedChart(weekDays, seriesByMaterial, selectedMaterials) {
            this._chartSegments = [];
            const canvas = document.getElementById('mobHomeChart');
            if (!canvas) return;

            const cs = getComputedStyle(document.documentElement);
            const inkMuted = cs.getPropertyValue('--wcm-muted').trim()  || '#6b7280';

            const height = 180;
            const { ctx, width } = CanvasChartUtils.setupCanvas(canvas, height, 200);
            const padding = { top: 16, right: 8, bottom: 36, left: 38 };
            const chartW  = width  - padding.left - padding.right;
            const chartH  = height - padding.top  - padding.bottom;

            const totalsByDay = weekDays.map((_, di) =>
                selectedMaterials.reduce((s, m) => s + ((seriesByMaterial[m] && seriesByMaterial[m][di]) || 0), 0)
            );

            const maxValue = Math.max(...totalsByDay, 0);
            const yMax     = maxValue > 0 ? maxValue * 1.1 : 10;

            const emptyState = document.getElementById('mobHomeEmptyState');

            if (maxValue === 0) {
                canvas.style.display = 'none';
                if (emptyState) emptyState.style.display = 'flex';
                return;
            }

            canvas.style.display = '';
            if (emptyState) emptyState.style.display = 'none';

            // Y-axis (rótulos) — desenhado inline para respeitar tema
            const gridCount = 4;
            ctx.fillStyle    = inkMuted;
            ctx.font         = `500 10px "Geist Mono", ui-monospace, monospace`;
            ctx.textAlign    = 'right';
            ctx.textBaseline = 'middle';
            for (let i = 0; i <= gridCount; i++) {
                const value = yMax - (yMax / gridCount) * i;
                const y     = padding.top + (chartH / gridCount) * i;
                ctx.fillText(CanvasChartUtils.formatY(value), padding.left - 6, y);
            }

            const slotCount = weekDays.length || 1;
            const slotW     = chartW / slotCount;
            const barW      = Math.min(40, slotW * 0.58);
            const radius    = Math.min(6, barW / 2);

            weekDays.forEach((day, index) => {
                const x = padding.left + slotW * index + (slotW - barW) / 2;
                let currentY = padding.top + chartH;
                const stackTop = currentY - (totalsByDay[index] / yMax) * chartH;

                selectedMaterials.forEach(material => {
                    const value = (seriesByMaterial[material] && seriesByMaterial[material][index]) || 0;
                    if (value <= 0) return;
                    const barHeight = (value / yMax) * chartH;
                    const y         = currentY - barHeight;
                    const color     = this.materialColors[material] || '#1f6fb2';

                    const isTopSegment = Math.abs(y - stackTop) < 0.5;
                    this._roundedTopBar(ctx, x, y, barW, barHeight, isTopSegment ? radius : 0, color);

                    this._chartSegments.push({ x, y, width: barW, height: barHeight, material, value, dayIndex: index, day });
                    currentY = y;
                });

                ctx.fillStyle    = inkMuted;
                ctx.font         = `500 10px "Geist Mono", ui-monospace, monospace`;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'top';
                const dayLabel = `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`;
                ctx.fillText(dayLabel, x + barW / 2, padding.top + chartH + 8);
            });
        },

        _roundedTopBar(ctx, x, y, w, h, r, fill) {
            const rr = Math.min(r, h);
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.moveTo(x, y + h);
            ctx.lineTo(x, y + rr);
            ctx.quadraticCurveTo(x, y, x + rr, y);
            ctx.lineTo(x + w - rr, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
            ctx.lineTo(x + w, y + h);
            ctx.closePath();
            ctx.fill();
        },

        _bindChartEvents() {
            const canvas = document.getElementById('mobHomeChart');
            if (!canvas || canvas._mobBound) return;
            canvas._mobBound = true;

            canvas.addEventListener('mousemove', e => this._onChartHover(e));
            canvas.addEventListener('mouseleave', () => this._onChartLeave());

            let _touchStartX = 0, _touchStartY = 0;
            canvas.addEventListener('touchstart', e => {
                _touchStartX = e.touches[0].clientX;
                _touchStartY = e.touches[0].clientY;
            }, { passive: true });
            canvas.addEventListener('touchmove', e => {
                const dx = Math.abs(e.touches[0].clientX - _touchStartX);
                const dy = Math.abs(e.touches[0].clientY - _touchStartY);
                if (dy > dx) return;
                e.preventDefault();
                const touch = e.touches[0];
                const rect  = canvas.getBoundingClientRect();
                this._showTooltipAt(touch.clientX - rect.left, touch.clientX, touch.clientY);
            }, { passive: false });
            canvas.addEventListener('touchend', () => this._onChartLeave());

            document.addEventListener('touchstart', e => {
                if (!canvas.contains(e.target)) this._onChartLeave();
            }, { passive: true });
        },

        _onChartHover(e) {
            this._showTooltipAt(e.offsetX, e.clientX, e.clientY);
        },

        _showTooltipAt(offsetX, clientX, clientY) {
            const tooltip = document.getElementById('mobHomeTooltip');
            if (!tooltip) return;

            const hovered = this._chartSegments.filter(seg => offsetX >= seg.x && offsetX <= seg.x + seg.width);
            if (!hovered.length) { tooltip.style.display = 'none'; return; }

            const day      = hovered[0].day;
            const dayLabel = `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`;

            const lines = hovered.map(seg => {
                const color     = this.materialColors[seg.material] || '#64748b';
                const formatted = this._formatTooltipValue(seg.value);
                return `<div class="mob-home-tooltip-row">
                    <span class="mob-home-tooltip-dot" style="background:${color}"></span>
                    <span class="mob-home-tooltip-name">${_esc(seg.material)}</span>
                    <span class="mob-home-tooltip-val">${formatted}</span>
                </div>`;
            }).join('');

            const total    = hovered.reduce((s, seg) => s + seg.value, 0);
            const totalRow = hovered.length > 1
                ? `<div class="mob-home-tooltip-total">
                    <span class="mob-home-tooltip-total-label">Total</span>
                    <span class="mob-home-tooltip-val">${this._formatTooltipValue(total)}</span>
                   </div>`
                : '';

            tooltip.innerHTML = `<div class="mob-home-tooltip-header">${_esc(dayLabel)}</div>${lines}${totalRow}`;
            tooltip.style.display = 'block';

            const tw = tooltip.offsetWidth;
            const th = tooltip.offsetHeight;
            const m  = 12;
            let tx = clientX + m;
            let ty = clientY + m;
            if (tx + tw > window.innerWidth  - 4) tx = clientX - tw - m;
            if (ty + th > window.innerHeight - 4) ty = clientY - th - m;
            tooltip.style.left = tx + 'px';
            tooltip.style.top  = ty + 'px';
        },

        _onChartLeave() {
            const tooltip = document.getElementById('mobHomeTooltip');
            if (tooltip) tooltip.style.display = 'none';
        },

        // ── KPIs / Hero / Grid render ────────────────────────────────────────

        _renderKpis() {
            const totalStock = this._uniqueStockTotal || 0;
            const matCount   = this._uniqueMaterialCount || 0;
            const leadTime   = this._leadTime30d;

            this._animateNumber(document.querySelector('#mobHomeKpiStock .mob-home-kpi-value'), totalStock, { unit: 'kg' });

            const stockSub = document.getElementById('mobHomeKpiStockSub');
            if (stockSub) stockSub.textContent = `${matCount} ${matCount === 1 ? 'material monitorado' : 'materiais monitorados'}`;

            const ltValue = document.querySelector('#mobHomeKpiLeadTime .mob-home-kpi-value');
            if (ltValue) {
                if (leadTime == null) {
                    ltValue.innerHTML = '—';
                    ltValue.dataset.target = '0';
                } else {
                    this._animateNumber(ltValue, Math.round(leadTime), { unit: leadTime === 1 ? 'dia' : 'dias' });
                }
            }

            const ltSub = document.getElementById('mobHomeKpiLeadTimeSub');
            if (ltSub) ltSub.textContent = leadTime == null ? 'sem recebimentos no período' : 'últimos 30 dias';
        },

        _animateNumber(el, target, opts) {
            if (!el) return;
            opts = opts || {};
            const duration = 600;
            const start    = parseFloat(el.dataset.target || '0') || 0;
            el.dataset.target = String(target);

            const t0 = performance.now();
            const fmt = v => {
                const rounded = Math.round(v);
                const text = rounded.toLocaleString('pt-BR');
                return opts.unit ? `${text}<span class="mob-home-kpi-unit"> ${opts.unit}</span>` : text;
            };
            const step = (now) => {
                const k = Math.min(1, (now - t0) / duration);
                const eased = 1 - Math.pow(1 - k, 3);
                const v = start + (target - start) * eased;
                el.innerHTML = fmt(v);
                if (k < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        },

        _renderHero() {
            const carousel = document.getElementById('mobHomeHeroCarousel');
            const dotsWrap = document.getElementById('mobHomeHeroDots');
            if (!carousel) return;

            const rows = this._balanceRows || [];
            const ranked = rows
                .filter(r => r.currentStock != null && r.reorderPoint != null)
                .map(r => ({ row: r, sev: this._severity(r), ratio: r.reorderPoint > 0 ? (r.currentStock / r.reorderPoint) : 1 }))
                .sort((a, b) => {
                    const order = { critical: 0, warning: 1, ok: 2, unknown: 3 };
                    if (order[a.sev] !== order[b.sev]) return order[a.sev] - order[b.sev];
                    return a.ratio - b.ratio;
                });

            this._heroRanked = ranked;

            // Estado vazio (sem política ou sem itens válidos)
            if (!this._policyFull || !ranked.length) {
                carousel.innerHTML = `
                    <i class="mob-home-hero-spacer"></i>
                    <section class="mob-home-hero mob-home-hero--idle">
                        <div class="mob-home-hero-bg" aria-hidden="true"></div>
                        <div class="mob-home-hero-content">
                            <div class="mob-home-hero-eyebrow">${this._policyFull ? 'Tudo certo' : 'Selecione uma política'}</div>
                            <div class="mob-home-hero-title">${this._policyFull ? 'Sem materiais monitorados' : 'Pulso do estoque'}</div>
                            <div class="mob-home-hero-meta">${this._policyFull ? 'Nenhum item válido na política.' : 'Abra os filtros para começar.'}</div>
                        </div>
                    </section>
                    <i class="mob-home-hero-spacer"></i>`;
                if (dotsWrap) dotsWrap.innerHTML = '';
                return;
            }

            const cards = ranked.map(({ row, sev }) => this._renderHeroCardLevels(row, sev)).join('');
            carousel.innerHTML = `<i class="mob-home-hero-spacer"></i>${cards}<i class="mob-home-hero-spacer"></i>`;

            if (dotsWrap) {
                dotsWrap.innerHTML = ranked.map((_, i) =>
                    `<span class="mob-home-hero-dot${i === 0 ? ' mob-home-hero-dot--active' : ''}" data-index="${i}"></span>`
                ).join('');
            }

            this._bindHeroScroll();
        },

        _renderHeroCardLevels(row, sev) {
            const fmt = v => Math.round(Number(v)).toLocaleString('pt-BR');
            const target = row.reorderPoint != null ? row.reorderPoint : row.maxStock;
            const pct = target > 0 ? Math.min(100, Math.max(0, (row.currentStock / target) * 100)) : 0;

            const eyebrow = sev === 'critical' ? 'Atenção crítica'
                          : sev === 'warning'  ? 'Em alerta'
                          : 'Saudável';

            const parts = [`${fmt(row.currentStock)} kg`];
            if (target != null) parts.push(`${pct.toFixed(0)}% do ponto`);
            if (row.need > 0) parts.push(`falta ${fmt(row.need)}`);

            const heroCls = `mob-home-hero${sev === 'critical' ? ' mob-home-hero--critical' : ''}`;
            const progressLabel = target != null
                ? `${fmt(row.currentStock)} / ${fmt(target)} kg`
                : `${fmt(row.currentStock)} kg`;

            return `
                <section class="${heroCls}" data-material="${_esc(row.label)}">
                    <div class="mob-home-hero-bg" aria-hidden="true"></div>
                    <div class="mob-home-hero-content">
                        <div class="mob-home-hero-eyebrow">${eyebrow}</div>
                        <div class="mob-home-hero-title">${_esc(row.label)}</div>
                        <div class="mob-home-hero-meta">${parts.join(' · ')}</div>
                        <div class="mob-home-hero-progress">
                            <div class="mob-home-hero-progress-track">
                                <div class="mob-home-hero-progress-fill" style="width:${pct}%"></div>
                            </div>
                            <div class="mob-home-hero-progress-label">${progressLabel}</div>
                        </div>
                    </div>
                </section>`;
        },

        _bindHeroScroll() {
            const carousel = document.getElementById('mobHomeHeroCarousel');
            const dotsWrap = document.getElementById('mobHomeHeroDots');
            if (!carousel || carousel._scrollBound) return;
            carousel._scrollBound = true;

            let raf = null;
            carousel.addEventListener('scroll', () => {
                if (raf) return;
                raf = requestAnimationFrame(() => {
                    raf = null;
                    if (!dotsWrap) return;
                    const cards = carousel.querySelectorAll('.mob-home-hero');
                    if (!cards.length) return;
                    const cRect = carousel.getBoundingClientRect();
                    const cCenter = cRect.left + cRect.width / 2;
                    let bestIdx = 0;
                    let bestDist = Infinity;
                    cards.forEach((c, i) => {
                        const r = c.getBoundingClientRect();
                        const d = Math.abs((r.left + r.width / 2) - cCenter);
                        if (d < bestDist) { bestDist = d; bestIdx = i; }
                    });
                    if (bestIdx !== this._heroIndex) {
                        this._heroIndex = bestIdx;
                        dotsWrap.querySelectorAll('.mob-home-hero-dot').forEach((dot, i) => {
                            dot.classList.toggle('mob-home-hero-dot--active', i === bestIdx);
                        });
                    }
                });
            }, { passive: true });
        },

        // ── Cálculo do balanço ───────────────────────────────────────────────

        async _computeBalanceData() {
            if (!this._policyFull) {
                this._balanceRows = [];
                this._uniqueStockTotal = 0;
                this._uniqueMaterialCount = 0;
                this._leadTime30d = null;
                this._renderHero();
                this._renderKpis();
                return;
            }
            const items = this._policyFull.items || [];
            if (!items.length) {
                this._balanceRows = [];
                this._uniqueStockTotal = 0;
                this._uniqueMaterialCount = 0;
                this._leadTime30d = null;
                this._renderHero();
                this._renderKpis();
                return;
            }

            const matItems = items.filter(i => (i.item_type || 'material') !== 'group');
            const grpItems = items.filter(i => i.item_type === 'group');

            const groupDataList = await Promise.all(
                grpItems.map(i => apiCall(`${API}/groups/${i.group_id}`).catch(() => null))
            );
            const groupMemberNames = groupDataList.map(g => (g?.materials || []).map(m => m.name).filter(Boolean));
            this._groupedMaterialNames = new Set(groupMemberNames.flat());

            const directNames = matItems.map(i => i.material).filter(Boolean);
            const allNames    = [...new Set([...directNames, ...groupMemberNames.flat()])];

            const [stocksMap, openOrdersMap, snapshot] = await Promise.all([
                this._fetchCurrentStocks(allNames),
                this._fetchOpenOrders(allNames),
                apiCall(`${API}/kpis/snapshot?policy_id=${encodeURIComponent(this._selectedPolicyId)}`).catch(() => null),
            ]);

            this._leadTime30d = snapshot?.kpis?.lead_time?.current ?? null;

            // Total único de saldo (evita dupla contagem quando material é item direto E membro de grupo)
            this._uniqueMaterialCount = allNames.length;
            this._uniqueStockTotal = allNames.reduce((s, n) => s + (Number(stocksMap[n]) || 0), 0);

            const [matKpis, grpKpis] = await Promise.all([
                Promise.all(matItems.map(item => this._computeItemKpis(item.material, item, this._policyFull))),
                Promise.all(grpItems.map((item, i) => this._computeGroupItemKpis(groupMemberNames[i], item, this._policyFull))),
            ]);

            let mi = 0, gi = 0;
            this._balanceRows = items.map(item => {
                if ((item.item_type || 'material') === 'group') {
                    const kpi          = grpKpis[gi];
                    const members      = groupMemberNames[gi++];
                    const currentStock = members.length ? members.reduce((s, n) => s + (stocksMap[n] ?? 0), 0) : null;
                    const onOrder      = members.reduce((s, n) => s + (openOrdersMap[n] ?? 0), 0);
                    const target       = kpi.maxStock !== null ? kpi.maxStock : kpi.reorderPoint;
                    const need         = target !== null && currentStock !== null ? Math.max(0, target - currentStock - onOrder) : null;
                    return { label: item.group_name || `Grupo ${item.group_id}`, isGroup: true, currentStock, safetyStock: kpi.safetyStock, reorderPoint: kpi.reorderPoint, maxStock: kpi.maxStock, onOrder, need };
                } else {
                    const kpi          = matKpis[mi++];
                    const currentStock = stocksMap[item.material] ?? null;
                    const onOrder      = openOrdersMap[item.material] ?? 0;
                    const target       = kpi.maxStock !== null ? kpi.maxStock : kpi.reorderPoint;
                    const need         = target !== null && currentStock !== null ? Math.max(0, target - currentStock - onOrder) : null;
                    return { label: item.material, isGroup: false, currentStock, safetyStock: kpi.safetyStock, reorderPoint: kpi.reorderPoint, maxStock: kpi.maxStock, onOrder, need };
                }
            });

            this._renderHero();
            this._renderKpis();
        },

        // ── Cálculos de KPI ──────────────────────────────────────────────────

        async _computeItemKpis(materialName, policyItem, policyData) {
            return StockPolicyUtils.computeItemKpis(materialName, policyItem, policyData, n => this._fetchLeadTime(n));
        },

        async _computeGroupItemKpis(memberNames, policyItem, policyData) {
            return StockPolicyUtils.computeGroupKpis(memberNames, policyItem, policyData, n => this._fetchLeadTime(n));
        },

        async _fetchCurrentStocks(materialNames) {
            const result    = {};
            const today     = this._formatDate(new Date());
            const twoYrsAgo = this._formatDate(new Date(new Date().getFullYear() - 2, 0, 1));
            const locId     = this._selectedLocationId || '';
            await Promise.all(materialNames.map(async material => {
                try {
                    const params = { material, startDate: twoYrsAgo, endDate: today };
                    if (locId) params.location = locId;
                    const q    = new URLSearchParams(params);
                    const rows = await apiCall(`${API}/stock-monitor?${q.toString()}`);
                    result[material] = (rows && rows.length) ? Number(rows[rows.length - 1].balance || 0) : 0;
                } catch {
                    result[material] = null;
                }
            }));
            return result;
        },

        async _fetchOpenOrders(materialNames) {
            const result = {};
            materialNames.forEach(m => { result[m] = 0; });
            try {
                const orders     = await apiCall(`${API}/orders`);
                if (!orders || !orders.length) return result;
                const openOrders = orders.filter(o => (o.status || '').toLowerCase().trim() === 'open');
                if (!openOrders.length) return result;

                const [allItems, allReceived] = await Promise.all([
                    Promise.all(openOrders.map(o => apiCall(`${API}/orders/items/${o.id}`))),
                    Promise.all(openOrders.map(o => apiCall(`${API}/orders/${o.id}/stock-units`))),
                ]);

                openOrders.forEach((_, i) => {
                    const items    = allItems[i]    || [];
                    const received = allReceived[i] || [];
                    const recvByMat = {};
                    received.forEach(su => { recvByMat[su.material] = (recvByMat[su.material] || 0) + Number(su.weight || 0); });
                    items.forEach(item => {
                        if (!Object.prototype.hasOwnProperty.call(result, item.material)) return;
                        const pending = Math.max(0, Number(item.quantity || 0) - (recvByMat[item.material] || 0));
                        result[item.material] += pending;
                    });
                });
            } catch { /* return zeros */ }
            return result;
        },

        async _fetchLeadTime(materialName) {
            if (Object.prototype.hasOwnProperty.call(this._leadTimeCache, materialName)) {
                return this._leadTimeCache[materialName];
            }
            try {
                const res = await apiCall(`${API}/stock-policies/lead-time/${encodeURIComponent(materialName)}`);
                const lt  = res?.lead_time ?? null;
                this._leadTimeCache[materialName] = lt;
                return lt;
            } catch {
                this._leadTimeCache[materialName] = null;
                return null;
            }
        },

        // ── Utilitários ──────────────────────────────────────────────────────

        _assignMaterialColors() {
            const palette = ['#3b5bdb','#2f9e44','#f59f00','#d6336c','#0c8599','#ae3ec9','#e8590c','#1c7ed6','#5c940d','#c2255c'];
            this.materialColors = {};
            let idx = 0;
            this.materials.forEach(material => {
                this.materialColors[material] = (this._materialColorMap && this._materialColorMap[material])
                    ? this._materialColorMap[material]
                    : palette[idx++ % palette.length];
            });
        },

        _startOfWeek(date) {
            const base = new Date(date); base.setHours(0, 0, 0, 0);
            base.setDate(base.getDate() - base.getDay());
            return base;
        },

        _formatDate: d => StockPolicyUtils.formatDate(d),

        _formatDatePtBr(date) {
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        },

        _getWeekDays() {
            const days = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(this.weekStart);
                d.setDate(this.weekStart.getDate() + i);
                days.push(d);
            }
            return days;
        },

        _updateWeekLabel() {
            const days = this._getWeekDays();
            const el   = document.getElementById('mobHomeWeekRange');
            if (el) el.textContent = `${this._formatDatePtBr(days[0])} – ${this._formatDatePtBr(days[6])}`;
        },

        _formatTooltipValue(v) {
            if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
            if (v >= 1_000)     return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
            return Math.round(v).toLocaleString('pt-BR');
        },
    },
});
