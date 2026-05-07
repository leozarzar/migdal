/**
 * ── receipts.js ──
 * Tela de listagem de recebimentos.
 * Exibe recebimentos com filtro por fornecedor e vínculo a pedidos.
 */
const Receipts = {

    // ── Estado ──

    selectedReceipt: null,
    _supplierSelect: null,
    _dataTable: null,
    _allReceipts: [],

    // ── Ciclo de Vida ──

    render() {
        this.selectedReceipt = null;
        this._supplierSelect?.destroy(); this._supplierSelect = null;
        this._dataTable?.destroy(); this._dataTable = null;
        this._allReceipts = [];
        return `
        <div class="receipts-container">
            <div class="receipts-card">
                <div class="receipts-filters">
                    <div class="receipts-filters-icon-wrap">
                        <span class="material-symbols-outlined receipts-filters-icon">filter_list</span>
                    </div>
                    <div id="receiptsSupplierContainer" class="receipts-filter-select-wrap"></div>
                </div>
                <div id="receiptsTableContainer"></div>
            </div>
        </div>
        `;
    },

    async load() {
        this._setHeaderOptions();

        if (!this._supplierSelect) {
            this._supplierSelect = createSelect({
                placeholder: 'Fornecedor',
                searchable: true,
                clearable: true,
                sections: [{ key: 'supplier', items: [] }],
                onChange: () => this._applyFilter(),
            });
            this._supplierSelect.mount(document.getElementById('receiptsSupplierContainer'));
        }

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    {
                        key: 'code', header: 'ID', width: '90px',
                        render: r => `<span class="code-badge">#${r.nature}${r.id}</span>`,
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
                        render: r => r.total_qty != null ? String(r.total_qty) : '',
                    },
                    {
                        key: 'order_id', header: 'Pedido',
                        render: r => r.order_id
                            ? `<span class="code-badge receipts-order-link" onclick="Receipts.openOrder(event,${r.order_id})">#${r.order_id}</span>`
                            : '',
                    },
                ],
                getRowKey: r => r.id,
                actions: [
                    {
                        label: 'Excluir',
                        icon: 'delete',
                        variant: 'destructive',
                        hidden: () => !hasPermission('procurement', 'receipts', 'delete'),
                        onClick: r => this.deleteReceipt(r.id),
                    },
                ],
                onRowClick: r => this.selectReceipt(r),
                emptyMessage: 'Nenhum recebimento encontrado.',
                emptyIcon: 'inventory_2',
            });
            this._dataTable.mount(document.getElementById('receiptsTableContainer'));
        }

        this._dataTable.setLoading(true);

        try {
            const receipts = await apiCall(API + "/receipts");

            const receiptsWithQty = await Promise.all(receipts.map(async r => {
                try {
                    const items = await apiCall(API + `/receipts/items/${r.id}`);
                    return { ...r, total_qty: sumProperty(items, "weight") };
                } catch {
                    return { ...r, total_qty: 0 };
                }
            }));

            this._allReceipts = receiptsWithQty;

            const suppliers = [...new Set(receipts.map(r => r.supplier).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b));
            this._supplierSelect.setItems('supplier', suppliers.map(s => ({ value: s, label: s })));

            const saved = localStorage.getItem('wcm.receipts.supplier');
            if (saved && this._supplierSelect.getValue() == null) {
                this._supplierSelect.setValue(saved);
            }

            this._applyFilter();
        } catch (error) {
            alert("Erro ao carregar recebimentos");
            this._dataTable.setLoading(false);
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    newReceipt() {
        showScreen('receipt-details');
    },

    selectReceipt(receipt) {
        this.selectedReceipt = receipt;
        showScreen('receipt-details');
    },

    async deleteReceipt(id) {
        if (!confirm("Tem certeza que deseja deletar?")) return;
        try {
            await apiCall(API + `/receipts/${id}`, { method: "DELETE" });
            this.load();
        } catch (error) {
            alert("Erro ao deletar recebimento");
        }
    },

    async openOrder(event, orderId) {
        event.stopPropagation();
        try {
            const orders = await apiCall(`${API}/orders`);
            const order = (orders || []).find(o => String(o.id) === String(orderId));
            if (!order) throw new Error('não encontrado');
            Orders.selectedOrder = order;
            showScreen('order-details');
        } catch {
            alert('Erro ao carregar pedido');
        }
    },

    // ── Privado ──

    _applyFilter() {
        const supplier = this._supplierSelect?.getValue();
        const filtered = supplier
            ? this._allReceipts.filter(r => r.supplier === supplier)
            : this._allReceipts;
        this._dataTable?.setData(filtered);
        if (supplier != null) {
            localStorage.setItem('wcm.receipts.supplier', String(supplier));
        } else {
            localStorage.removeItem('wcm.receipts.supplier');
        }
    },

    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        headerOptions.innerHTML = hasPermission('procurement', 'receipts', 'create') ? `
            <button class="btn-new" onclick="Receipts.newReceipt()">
                <span class="material-symbols-outlined">add</span>
                Novo Recebimento
            </button>
        ` : '';
    },
};
