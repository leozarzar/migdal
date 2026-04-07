/**
 * @file mobile/screens/home.js
 * @description Tela inicial do mobile — atalhos de navegação, gráfico de consumo
 *   semanal e balanço de estoque baseado na política selecionada.
 *
 * Estende MobApp com o sub-objeto HomeScreen.
 * Carregado após mobile/app.js.
 */

Object.assign(MobApp, {

    HomeScreen: {

        // ── Estado ───────────────────────────────────────────────────────────

        weekStart: null,
        materials: [],
        selectedMaterials: [],
        materialColors: {},
        _chartSegments: [],
        policies: [],
        _selectedPolicyId: null,
        _policyFull: null,
        _balanceRows: [],
        _leadTimeCache: {},
        _materialColorMap: {},

        // ── Ciclo de vida ────────────────────────────────────────────────────

        async load() {
            this.weekStart  = this._startOfWeek(new Date());
            this._leadTimeCache = {};

            try {
                const [materials, policies] = await Promise.all([
                    apiCall(API + '/materials'),
                    apiCall(API + '/stock-policies'),
                ]);

                this.materials = (materials || [])
                    .map(m => m.name).filter(Boolean)
                    .sort((a, b) => a.localeCompare(b));

                this._materialColorMap = Object.fromEntries(
                    (materials || []).filter(m => m.name && m.color).map(m => [m.name, m.color])
                );

                this.policies = policies || [];
                this._assignMaterialColors();
                this._renderPoliciesSelect();
                this._bindChartEvents();

                // Restaura política previamente selecionada (se ainda existir)
                const savedId = this._selectedPolicyId;
                await this.onPolicyChange(savedId || null);
            } catch {
                MobApp._toast('Erro ao carregar dados do dashboard', 'error');
            }
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

        // ── Seleção de Política ──────────────────────────────────────────────

        _renderPoliciesSelect() {
            const select = document.getElementById('mobHomePolicySelect');
            if (!select) return;

            const current = this._selectedPolicyId || '';
            select.innerHTML = '<option value="">Política de Estoque</option>';
            this.policies.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                if (String(p.id) === String(current)) opt.selected = true;
                select.appendChild(opt);
            });
        },

        async onPolicyChange(forceId) {
            const select = document.getElementById('mobHomePolicySelect');
            const policyId = forceId !== undefined
                ? (forceId ? String(forceId) : '')
                : (select ? select.value : '');

            // Sync the select element when forceId is passed
            if (forceId !== undefined && select) select.value = policyId;

            this._selectedPolicyId = policyId || null;

            if (!policyId) {
                this._policyFull        = null;
                this._balanceRows       = [];
                this.selectedMaterials  = [];
                this._drawStackedChart(this._getWeekDays(), {}, []);
                this._updateWeekLabel();
                this._renderBalanceTable();
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

            const height = 180;
            const { ctx, width } = CanvasChartUtils.setupCanvas(canvas, height, 200);
            const padding = { top: 20, right: 12, bottom: 40, left: 42 };
            const chartW  = width  - padding.left - padding.right;
            const chartH  = height - padding.top  - padding.bottom;

            const totalsByDay = weekDays.map((_, di) =>
                selectedMaterials.reduce((s, m) => s + ((seriesByMaterial[m] && seriesByMaterial[m][di]) || 0), 0)
            );

            const maxValue = Math.max(...totalsByDay, 0);
            const yMax     = maxValue > 0 ? maxValue * 1.1 : 10;

            CanvasChartUtils.drawYAxis(ctx, padding, chartW, chartH, yMax, { withGrid: false, fontSize: 11, labelOffset: 6 });

            const slotCount = weekDays.length || 1;
            const slotW     = chartW / slotCount;
            const barW      = Math.min(44, slotW * 0.62);

            weekDays.forEach((day, index) => {
                const x = padding.left + slotW * index + (slotW - barW) / 2;
                let currentY = padding.top + chartH;

                selectedMaterials.forEach(material => {
                    const value = (seriesByMaterial[material] && seriesByMaterial[material][index]) || 0;
                    if (value <= 0) return;
                    const barHeight = (value / yMax) * chartH;
                    const y         = currentY - barHeight;
                    const color     = this.materialColors[material] || '#1f6fb2';
                    ctx.fillStyle   = color;
                    ctx.fillRect(x, y, barW, barHeight);
                    this._chartSegments.push({ x, y, width: barW, height: barHeight, material, value, dayIndex: index, day });
                    currentY = y;
                });

                ctx.fillStyle    = '#334155';
                ctx.font         = '10px Arial';
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'top';
                const dayLabel = `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`;
                ctx.fillText(dayLabel, x + barW / 2, padding.top + chartH + 8);
            });

            if (maxValue === 0) {
                CanvasChartUtils.drawEmptyState(ctx, 'Sem consumo no período', width, height, 13);
            }
        },

        _bindChartEvents() {
            const canvas = document.getElementById('mobHomeChart');
            if (!canvas) return;

            canvas.addEventListener('mousemove', e => this._onChartHover(e));
            canvas.addEventListener('mouseleave', () => this._onChartLeave());

            // Touch support — only intercept horizontal swipes (tooltip), let vertical pass through for scrolling
            let _touchStartX = 0, _touchStartY = 0;
            canvas.addEventListener('touchstart', e => {
                _touchStartX = e.touches[0].clientX;
                _touchStartY = e.touches[0].clientY;
            }, { passive: true });
            canvas.addEventListener('touchmove', e => {
                const dx = Math.abs(e.touches[0].clientX - _touchStartX);
                const dy = Math.abs(e.touches[0].clientY - _touchStartY);
                if (dy > dx) return; // vertical — let the page scroll
                e.preventDefault();
                const touch = e.touches[0];
                const rect  = canvas.getBoundingClientRect();
                this._showTooltipAt(touch.clientX - rect.left, touch.clientX, touch.clientY);
            }, { passive: false });
            canvas.addEventListener('touchend', () => this._onChartLeave());

            // Dismiss tooltip when touching anywhere outside the canvas
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

        // ── Balanço de Estoque ───────────────────────────────────────────────

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

            const groupDataList = await Promise.all(
                grpItems.map(i => apiCall(`${API}/groups/${i.group_id}`).catch(() => null))
            );
            const groupMemberNames = groupDataList.map(g => (g?.materials || []).map(m => m.name).filter(Boolean));

            const directNames = matItems.map(i => i.material).filter(Boolean);
            const allNames    = [...new Set([...directNames, ...groupMemberNames.flat()])];

            const [stocksMap, openOrdersMap] = await Promise.all([
                this._fetchCurrentStocks(allNames),
                this._fetchOpenOrders(allNames),
            ]);

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

            this._renderBalanceTable();
        },

        _renderBalanceLoading() {
            const el = document.getElementById('mobHomeBalanceBody');
            if (el) el.innerHTML = '<p class="mob-items-empty">Calculando balanço…</p>';
        },

        _renderBalanceTable() {
            const container = document.getElementById('mobHomeBalanceBody');
            if (!container) return;

            if (!this._policyFull) {
                container.innerHTML = '<p class="mob-items-empty">Selecione uma política para visualizar.</p>';
                return;
            }
            if (!this._balanceRows.length) {
                container.innerHTML = '<p class="mob-items-empty">Esta política não possui itens cadastrados.</p>';
                return;
            }

            const fmt = v => (v !== null && v !== undefined) ? Math.round(Number(v)).toLocaleString('pt-BR') : '—';
            const reviewType = this._policyFull.review_type || 'continuous';
            const colReplenish = reviewType === 'periodic' ? 'Ponto Crítico' : 'Ponto de Reposição';

            container.innerHTML = this._balanceRows.map(row => {
                let statusClass = '';
                if (row.currentStock !== null && row.reorderPoint !== null) {
                    if (row.currentStock <= (row.safetyStock ?? 0))  statusClass = 'mob-balance-row--critical';
                    else if (row.currentStock <= row.reorderPoint)   statusClass = 'mob-balance-row--warning';
                    else                                             statusClass = 'mob-balance-row--ok';
                }

                const badge = row.isGroup ? '<span class="mob-balance-badge">grupo</span>' : '';

                const stats = [
                    { label: 'Seg.', value: fmt(row.safetyStock) },
                    { label: colReplenish.split(' ')[0], value: fmt(row.reorderPoint) },
                    row.maxStock !== null ? { label: 'Máx.', value: fmt(row.maxStock) } : null,
                    row.onOrder > 0 ? { label: 'Pedido', value: fmt(row.onOrder) } : null,
                ].filter(Boolean);

                return `
                <div class="mob-balance-row ${statusClass}">
                    <div class="mob-balance-row-top">
                        <div class="mob-balance-name">${_esc(row.label)}${badge}</div>
                        <div class="mob-balance-stock">${fmt(row.currentStock)}</div>
                    </div>
                    <div class="mob-balance-stats">
                        ${stats.map(s => `
                        <span class="mob-balance-stat">
                            <span class="mob-balance-stat-label">${s.label}</span>
                            ${s.value}
                        </span>`).join('')}
                        ${(row.need !== null && row.need > 0) ? `
                        <span class="mob-balance-stat mob-balance-stat--need">
                            <span class="mob-balance-stat-label">Necessidade</span>
                            ${fmt(row.need)}
                        </span>` : ''}
                    </div>
                </div>`;
            }).join('');
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
            await Promise.all(materialNames.map(async material => {
                try {
                    const q    = new URLSearchParams({ material, startDate: twoYrsAgo, endDate: today });
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

        // ── Estatística ──────────────────────────────────────────────────────

        _balanceAggregate(rows, aggregation, startDate, stockRows) {
            const buckets = new Map();
            rows.forEach(row => {
                const date = new Date(row.day + 'T00:00:00');
                let key;
                if (aggregation === 'weekly') {
                    const d = date.getDay();
                    const monday = new Date(date);
                    monday.setDate(date.getDate() + (d === 0 ? -6 : 1 - d));
                    key = this._formatDate(monday);
                } else if (aggregation === 'monthly') {
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                } else {
                    key = row.day;
                }
                if (!buckets.has(key)) buckets.set(key, { key, value: 0, hasStock: false });
                buckets.get(key).value += Number(row.consumption || 0);
            });

            const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
            let cutoffKey;
            if (aggregation === 'weekly') {
                const dow = todayD.getDay();
                const mon = new Date(todayD); mon.setDate(todayD.getDate() + (dow === 0 ? -6 : 1 - dow));
                cutoffKey = this._formatDate(mon);
            } else if (aggregation === 'monthly') {
                cutoffKey = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, '0')}`;
            } else {
                cutoffKey = this._formatDate(todayD);
            }

            const start = new Date(startDate + 'T00:00:00');
            if (aggregation === 'daily') {
                for (let c = new Date(start); this._formatDate(c) < cutoffKey; c.setDate(c.getDate() + 1)) {
                    const k = this._formatDate(c);
                    if (!buckets.has(k)) buckets.set(k, { key: k, value: 0, hasStock: false });
                }
            } else if (aggregation === 'weekly') {
                const c = new Date(start); const dow = c.getDay();
                c.setDate(c.getDate() + (dow === 0 ? -6 : 1 - dow));
                while (this._formatDate(c) < cutoffKey) {
                    const k = this._formatDate(c);
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

            const sortedStock = (stockRows || []).filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date));
            if (sortedStock.length > 0) {
                all.forEach(bucket => {
                    const endKey = (() => {
                        if (aggregation === 'daily') return bucket.key;
                        if (aggregation === 'weekly') {
                            const d = new Date(bucket.key + 'T00:00:00'); d.setDate(d.getDate() + 6);
                            return this._formatDate(d);
                        }
                        const [y, mo] = bucket.key.split('-').map(Number);
                        return this._formatDate(new Date(y, mo, 0));
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

        _balanceFilter(data, removeZeros, treatOutliers, treatRuptures) {
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

        _balanceForecast(data, method, params, serviceLevel) {
            const values = data.map(d => d.value);
            const n = values.length;
            if (n < 2) return null;
            const residuals = [];
            let nextForecast;

            if (method === 'moving-average') {
                const p = Math.max(2, Math.min(params.period || 7, n - 1));
                for (let i = p; i < n; i++) residuals.push(values[i] - values.slice(i - p, i).reduce((s, v) => s + v, 0) / p);
                nextForecast = values.slice(n - p).reduce((s, v) => s + v, 0) / p;
            } else if (method === 'exp-smoothing') {
                const alpha = Math.max(0.01, Math.min(0.99, params.alpha || 0.3));
                let s = values[0];
                for (let i = 1; i < n; i++) { residuals.push(values[i] - s); s = alpha * values[i] + (1 - alpha) * s; }
                nextForecast = s;
            } else if (method === 'linear-regression') {
                const rp = Math.max(3, Math.min(params.regressionPeriod || 30, n));
                for (let i = rp; i < n; i++) {
                    const xs = Array.from({ length: rp }, (_, j) => j);
                    const ys = values.slice(i - rp, i);
                    const { a, b } = this._balanceLinReg(xs, ys);
                    residuals.push(values[i] - Math.max(0, a + b * rp));
                }
                const xs = Array.from({ length: rp }, (_, j) => j);
                const { a, b } = this._balanceLinReg(xs, values.slice(n - rp));
                nextForecast = Math.max(0, a + b * rp);
            } else {
                for (let i = 1; i < n; i++) residuals.push(values[i] - values.slice(0, i).reduce((s, v) => s + v, 0) / i);
                nextForecast = values.reduce((s, v) => s + v, 0) / n;
            }

            const std = residuals.length ? Math.sqrt(residuals.reduce((s, v) => s + v * v, 0) / residuals.length) : 0;
            return { nextForecast, std, z: this._balanceZScore(serviceLevel) };
        },

        _balanceLinReg(xs, ys) {
            const n = xs.length, sx = xs.reduce((s, v) => s + v, 0), sy = ys.reduce((s, v) => s + v, 0);
            const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0), sx2 = xs.reduce((s, v) => s + v * v, 0);
            const den = n * sx2 - sx * sx;
            if (den === 0) return { a: sy / n, b: 0 };
            const b = (n * sxy - sx * sy) / den;
            return { a: (sy - b * sx) / n, b };
        },

        _balanceZScore(serviceLevel) {
            const p = Math.max(0.501, Math.min(0.999, serviceLevel / 100));
            const t = Math.sqrt(-2 * Math.log(1 - p));
            const c = [2.515517, 0.802853, 0.010328];
            const d = [1.432788, 0.189269, 0.001308];
            return t - (c[0] + c[1] * t + c[2] * t * t) / (1 + d[0] * t + d[1] * t * t + d[2] * t * t * t);
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
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
