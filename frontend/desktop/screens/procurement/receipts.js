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
    _newBtn: null,

    // ── Ciclo de Vida ──

    render() {
        this.selectedReceipt = null;
        this._supplierSelect?.destroy(); this._supplierSelect = null;
        this._dataTable?.destroy(); this._dataTable = null;
        this._newBtn?.destroy(); this._newBtn = null;
        return `
        <div class="receipts-container">
            <div class="receipts-filters">
                <div class="receipts-filters-icon-wrap">
                    <span class="material-symbols-outlined receipts-filters-icon">filter_list</span>
                </div>
                <div id="receiptsSupplierContainer" class="receipts-filter-select-wrap"></div>
                <div id="receiptsNewBtnContainer" class="receipts-filters-actions"></div>
            </div>
            <div id="receiptsTableContainer"></div>
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
                onChange: () => this._fetchPage(1),
            });
            this._supplierSelect.mount(document.getElementById('receiptsSupplierContainer'));
        }

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    {
                        key: 'code', header: 'ID', width: '110px',
                        render: r => {
                            const muted = r.status === 'DRAFT' || r.status === 'ABANDONED';
                            return `<span class="code-badge${muted ? ' code-badge--muted' : ''}">#${r.nature || '---'}${r.id}</span>`;
                        },
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
                    {
                        key: 'status', header: 'Status', width: '110px',
                        render: r => {
                            if (r.status === 'DRAFT')     return `<span class="receipt-badge receipt-badge-draft">Rascunho</span>`;
                            if (r.status === 'ABANDONED') return `<span class="receipt-badge receipt-badge-abandoned">Abandonado</span>`;
                            return `<span class="receipt-badge receipt-badge-saved">Salvo</span>`;
                        },
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
            const suppliers = await apiCall(API + "/receipts/suppliers");
            this._supplierSelect.setItems('supplier', (suppliers || []).map(s => ({ value: s, label: s })));
            const saved = localStorage.getItem('wcm.receipts.supplier');
            if (saved && this._supplierSelect.getValue() == null) {
                this._supplierSelect.setValue(saved);
            }
        } catch { /* dropdown fica vazio */ }

        await this._fetchPage(1);
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
            const order = await apiCall(`${API}/orders/${orderId}`);
            Orders.selectedOrder = order;
            showScreen('order-details');
        } catch {
            alert('Erro ao carregar pedido');
        }
    },

    // ── Privado ──

    async _fetchPage(page = 1, sortKey = '', sortDir = null) {
        const params = new URLSearchParams({ page, limit: 13 });
        const supplier = this._supplierSelect?.getValue();
        if (supplier) {
            params.set('supplier', supplier);
            localStorage.setItem('wcm.receipts.supplier', String(supplier));
        } else {
            localStorage.removeItem('wcm.receipts.supplier');
        }
        if (sortKey) { params.set('sort_by', sortKey); params.set('sort_dir', sortDir || 'asc'); }

        this._dataTable.setLoading(true);
        try {
            const { data, total } = await apiCall(API + '/receipts?' + params);
            this._dataTable.setData(data || [], total || 0, page);
        } catch {
            alert('Erro ao carregar recebimentos');
            this._dataTable.setLoading(false);
        }
    },

    _mountNewButton() {
        document.getElementById('headerOptionsContent').innerHTML = '';
        if (!hasPermission('procurement', 'receipts', 'create')) return;
        this._newBtn = createButton({
            label: 'Novo Recebimento',
            variant: 'primary',
            icon: 'add',
            onClick: () => this.newReceipt(),
        });
        document.getElementById('receiptsNewBtnContainer').appendChild(this._newBtn.el);
    },
};
