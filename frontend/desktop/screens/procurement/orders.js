/**
 * ── orders.js ──
 * Tela de listagem de pedidos de compra.
 * Exibe pedidos com filtro por fornecedor, quantidades e lead time.
 */
const Orders = {

    // ── Estado ──

    selectedOrder: null,
    _supplierSelect: null,
    _dataTable: null,
    _newBtn: null,
    _allOrders: [],

    // ── Ciclo de Vida ──

    render() {
        this.selectedOrder = null;
        this._supplierSelect?.destroy(); this._supplierSelect = null;
        this._dataTable?.destroy(); this._dataTable = null;
        this._newBtn?.destroy(); this._newBtn = null;
        this._allOrders = [];
        return `
        <div class="orders-container">
            <div class="orders-filters">
                <div class="orders-filters-icon-wrap">
                    <span class="material-symbols-outlined orders-filters-icon">filter_list</span>
                </div>
                <div id="ordersSupplierContainer" class="orders-filter-select-wrap"></div>
                <div id="ordersNewBtnContainer" class="orders-filters-actions"></div>
            </div>
            <div id="ordersTableContainer"></div>
        </div>
        `;
    },

    async load() {
        this._mountNewButton();

        if (!this._supplierSelect) {
            this._supplierSelect = createSelect({
                placeholder: 'Fornecedor',
                searchable: true,
                clearable: true,
                sections: [{ key: 'supplier', items: [] }],
                onChange: () => this._applyFilter(),
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
                            const sign = r.diff_pct >= 0 ? '+' : '';
                            const color = r.diff_pct >= 0 ? '#2e7d32' : '#c62828';
                            return `<span style="color:${color};font-weight:600">${sign}${r.diff_pct}%</span>`;
                        },
                    },
                    {
                        key: 'status', header: 'Status',
                        render: r => this._statusBadge(r),
                    },
                ],
                getRowKey: r => r.id,
                pageSize: 13,
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

        this._dataTable.setLoading(true);

        try {
            const [orders, receipts] = await Promise.all([
                apiCall(API + '/orders'),
                apiCall(API + '/receipts'),
            ]);

            const enriched = await Promise.all(orders.map(o => this._enrichOrder(o, receipts)));
            this._allOrders = enriched;

            const suppliers = [...new Set(orders.map(o => o.supplier).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b));
            this._supplierSelect.setItems('supplier', suppliers.map(s => ({ value: s, label: s })));

            const saved = localStorage.getItem('wcm.orders.supplier');
            if (saved && this._supplierSelect.getValue() == null) {
                this._supplierSelect.setValue(saved);
            }

            this._applyFilter();
        } catch (error) {
            alert('Erro ao carregar pedidos');
            this._dataTable.setLoading(false);
        }
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

    async _enrichOrder(order, receipts) {
        const [orderItems, orderBags] = await Promise.all([
            apiCall(API + `/orders/items/${order.id}`),
            apiCall(API + `/orders/${order.id}/stock-units`),
        ]);

        const totalQty = orderItems.reduce((sum, item) =>
            sum + parseInt((item.group_id != null ? item.group_quantity : item.quantity) || 0, 10), 0);
        const receivedQty = sumProperty(orderBags, 'weight');
        const diffPct = totalQty > 0 ? Math.round(((receivedQty / totalQty) - 1) * 100) : 0;

        const startDate = order.date ? new Date(order.date) : null;
        let leadTime = '';
        if (startDate) {
            const linkedReceipts = receipts.filter(r => String(r.order_id) === String(order.id));
            if (linkedReceipts.length > 0) {
                const qtyByReceipt = {};
                for (const bag of orderBags) {
                    const rid = String(bag.receipt_id);
                    qtyByReceipt[rid] = (qtyByReceipt[rid] || 0) + (bag.weight || 0);
                }
                let weightedSum = 0;
                let totalQtyReceipts = 0;
                for (const receipt of linkedReceipts) {
                    const qty = qtyByReceipt[String(receipt.id)] || 0;
                    const days = (new Date(receipt.date) - startDate) / (1000 * 60 * 60 * 24);
                    weightedSum += days * qty;
                    totalQtyReceipts += qty;
                }
                leadTime = totalQtyReceipts > 0
                    ? (weightedSum / totalQtyReceipts).toFixed(1).replace('.0', '')
                    : Math.round((new Date(linkedReceipts[0].date) - startDate) / (1000 * 60 * 60 * 24));
            } else {
                leadTime = Math.round((new Date() - startDate) / (1000 * 60 * 60 * 24));
            }
        }

        return { ...order, total_qty: totalQty, received_qty: receivedQty, diff_pct: diffPct, lead_time: leadTime };
    },

    _applyFilter() {
        const supplier = this._supplierSelect?.getValue();
        const filtered = supplier
            ? this._allOrders.filter(o => o.supplier === supplier)
            : this._allOrders;
        this._dataTable?.setData(filtered);
        if (supplier != null) {
            localStorage.setItem('wcm.orders.supplier', String(supplier));
        } else {
            localStorage.removeItem('wcm.orders.supplier');
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
