/**
 * ── orders.js ──
 * Tela de listagem de pedidos de compra.
 * Exibe pedidos com filtro por fornecedor, quantidades e lead time.
 */
const Orders = {

    // ── Estado ──

    selectedOrder: null,
    _supplierSelect: null,
    _statusFilter: null,
    _dataTable: null,
    _newBtn: null,

    // ── Ciclo de Vida ──

    render() {
        this.selectedOrder = null;
        this._supplierSelect?.destroy(); this._supplierSelect = null;
        this._statusFilter?.destroy();   this._statusFilter = null;
        this._dataTable?.destroy(); this._dataTable = null;
        this._newBtn?.destroy(); this._newBtn = null;
        return `
        <div class="orders-container">
            <div class="orders-filters">
                <div class="orders-filters-icon-wrap">
                    <span class="material-symbols-outlined orders-filters-icon">filter_list</span>
                </div>
                <div id="ordersStatusFilterContainer"></div>
                <div id="ordersSupplierContainer" class="orders-filter-select-wrap"></div>
                <div id="ordersNewBtnContainer" class="orders-filters-actions"></div>
            </div>
            <div id="ordersTableContainer"></div>
        </div>
        `;
    },

    async load() {
        this._mountNewButton();

        this._statusFilter = createToggleGroup({
            options: [
                { value: 'open', label: 'Abertos' },
                { value: 'all',  label: 'Todos'   },
            ],
            value: 'open',
            onChange: () => this._fetchPage(1),
        });
        this._statusFilter.mount(document.getElementById('ordersStatusFilterContainer'));

        if (!this._supplierSelect) {
            this._supplierSelect = createSelect({
                placeholder: 'Fornecedor',
                searchable: true,
                clearable: true,
                sections: [{ key: 'supplier', items: [] }],
                onChange: () => this._fetchPage(1),
            });
            this._supplierSelect.mount(document.getElementById('ordersSupplierContainer'));
        }

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    {
                        key: 'id', header: 'ID', width: '80px',
                        render: r => `<span class="code-badge">#${r.id}</span>`,
                    },
                    {
                        key: 'date', header: 'Data', sortable: true,
                        sortValue: r => r.date || '',
                        render: r => r.date
                            ? r.date.split('-').reverse().join('/').replace(/^(\d{2}\/\d{2}\/)\d{2}(\d{2})$/, '$1$2')
                            : '',
                    },
                    {
                        key: 'supplier', header: 'Fornecedor', sortable: true,
                        render: r => r.supplier || '',
                    },
                    {
                        key: 'total_qty', header: 'Quantidade', sortable: true,
                        sortValue: r => r.total_qty || 0,
                        render: r => {
                            const total = r.total_qty != null ? r.total_qty : '—';
                            if (r.received_qty > 0) {
                                return `${r.received_qty} <span class="stock-units-remaining-label">/ ${total}</span>`;
                            }
                            return String(total);
                        },
                    },
                    {
                        key: 'due_date', header: 'Prazo',
                        render: r => r.due_date
                            ? r.due_date.split('-').reverse().join('/').replace(/^(\d{2}\/\d{2}\/)\d{2}(\d{2})$/, '$1$2')
                            : '',
                    },
                    {
                        key: 'expected_date', header: 'Previsão',
                        render: r => r.expected_date
                            ? r.expected_date.split('-').reverse().join('/').replace(/^(\d{2}\/\d{2}\/)\d{2}(\d{2})$/, '$1$2')
                            : '',
                    },
                    {
                        key: 'lead_time', header: 'Lead time',
                        render: r => r.lead_time !== '' && r.lead_time != null ? `${r.lead_time}d` : '',
                    },
                    {
                        key: 'diff_pct', header: 'Dif %',
                        render: r => {
                            if (!r.received_qty || !r.total_qty) return '';
                            const diffPct = Math.round(((r.received_qty / r.total_qty) - 1) * 100);
                            const sign = diffPct >= 0 ? '+' : '';
                            const color = diffPct >= 0 ? '#2e7d32' : '#c62828';
                            return `<span style="color:${color};font-weight:600">${sign}${diffPct}%</span>`;
                        },
                    },
                    {
                        key: 'status', header: 'Status',
                        render: r => this._statusBadge(r),
                    },
                ],
                getRowKey: r => r.id,
                pageSize: 13,
                onPageChange: (page, pageSize, sortKey, sortDir) => this._fetchPage(page, sortKey, sortDir),
                actions: [
                    {
                        label: 'Excluir',
                        icon: 'delete',
                        variant: 'destructive',
                        hidden: () => !hasPermission('procurement', 'orders', 'delete'),
                        onClick: r => this.deleteOrder(r.id),
                    },
                ],
                onRowClick: r => this.selectOrder(r),
                emptyMessage: 'Nenhum pedido encontrado.',
                emptyIcon: 'shopping_cart',
            });
            this._dataTable.mount(document.getElementById('ordersTableContainer'));
        }

        // Carregar opções de fornecedor e primeira página em paralelo
        this._dataTable.setLoading(true);
        try {
            const suppliers = await apiCall(API + '/orders/suppliers');
            this._supplierSelect.setItems('supplier', (suppliers || []).map(s => ({ value: s, label: s })));
            const saved = localStorage.getItem('wcm.orders.supplier');
            if (saved && this._supplierSelect.getValue() == null) {
                this._supplierSelect.setValue(saved);
            }
        } catch { /* dropdown fica vazio */ }

        await this._fetchPage(1);
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    newOrder() {
        showScreen('order-details');
    },

    selectOrder(order) {
        this.selectedOrder = order;
        showScreen('order-details');
    },

    async deleteOrder(id) {
        if (!confirm('Tem certeza que deseja deletar?')) return;
        try {
            await apiCall(API + `/orders/${id}`, { method: 'DELETE' });
            this.load();
        } catch (error) {
            alert('Erro ao deletar pedido');
        }
    },

    // ── Privado ──

    async _fetchPage(page = 1, sortKey = '', sortDir = null) {
        const params = new URLSearchParams({ page, limit: 13 });
        const statusFilter = this._statusFilter?.getValue() || 'open';
        if (statusFilter !== 'all') params.set('status_filter', statusFilter);
        const supplier = this._supplierSelect?.getValue();
        if (supplier) {
            params.set('supplier', supplier);
            localStorage.setItem('wcm.orders.supplier', String(supplier));
        } else {
            localStorage.removeItem('wcm.orders.supplier');
        }
        if (sortKey) { params.set('sort_by', sortKey); params.set('sort_dir', sortDir || 'asc'); }

        this._dataTable.setLoading(true);
        try {
            const { data, total } = await apiCall(API + '/orders?' + params);
            this._dataTable.setData(data || [], total || 0, page);
        } catch {
            alert('Erro ao carregar pedidos');
            this._dataTable.setLoading(false);
        }
    },

    _mountNewButton() {
        document.getElementById('headerOptionsContent').innerHTML = '';
        if (!hasPermission('procurement', 'orders', 'create')) return;
        this._newBtn = createButton({
            label: 'Novo Pedido',
            variant: 'primary',
            icon: 'add',
            onClick: () => this.newOrder(),
        });
        document.getElementById('ordersNewBtnContainer').appendChild(this._newBtn.el);
    },

    _statusBadge(order) {
        if (order.status === 'CLOSED') {
            return `<span class="orders-badge orders-badge--closed">Fechado</span>`;
        }
        if (order.status !== 'OPEN') {
            return `<span class="orders-badge">${order.status}</span>`;
        }
        if (!order.due_date) {
            return `<span class="orders-badge orders-badge--open">Aberto</span>`;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(order.due_date + 'T00:00:00');
        const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return `<span class="orders-badge orders-badge--overdue">Atrasado</span>`;
        if (diffDays <= 2) return `<span class="orders-badge orders-badge--due-soon">Vencendo</span>`;
        return `<span class="orders-badge orders-badge--open">Aberto</span>`;
    },
};
