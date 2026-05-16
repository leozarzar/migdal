/**
 * purchase-invoices.js
 * Tela de listagem de Faturas de Compras (Nota de Compra Interna - NCI).
 * A criação de faturas é feita na tela PurchaseInvoiceForm.
 */
const PurchaseInvoices = {

    // ── Estado ──────────────────────────────────────────────────────────────

    _filterSupplierSelect: null,
    _dataTable: null,
    _newBtn: null,
    _allInvoices: [],
    selectedInvoice: null,

    // ── Ciclo de Vida ────────────────────────────────────────────────────────

    render() {
        this._filterSupplierSelect?.destroy(); this._filterSupplierSelect = null;
        this._dataTable?.destroy();            this._dataTable = null;
        this._newBtn?.destroy();               this._newBtn = null;
        this._allInvoices = [];
        return `
        <div class="pi-container">
            <div class="pi-filters">
                <div class="pi-filters-icon-wrap">
                    <span class="material-symbols-outlined pi-filters-icon">filter_list</span>
                </div>
                <div id="piFilterSupplierContainer" class="pi-filter-select-wrap"></div>
                <div id="piLayoutContainer" class="pi-filter-select-wrap"></div>
                <div id="piNewBtnContainer" class="pi-filters-actions"></div>
            </div>
            <div id="piTableContainer"></div>
        </div>
        `;
    },

    async load() {
        this._mountNewButton();

        if (!this._filterSupplierSelect) {
            this._filterSupplierSelect = createSelect({
                placeholder: 'Fornecedor',
                searchable: true,
                clearable: true,
                sections: [{ key: 'supplier', items: [] }],
                onChange: () => this._applyFilter(),
            });
            this._filterSupplierSelect.mount(document.getElementById('piFilterSupplierContainer'));
        }

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    {
                        key: 'document_type', header: 'Tipo', width: '80px',
                        render: r => r.document_type || '',
                    },
                    {
                        key: 'number', header: 'Número',
                        render: r => r.number || '',
                    },
                    {
                        key: 'date_emission', header: 'Data Emissão', sortable: true,
                        sortValue: r => r.date_emission || '',
                        render: r => r.date_emission
                            ? new Date(r.date_emission + 'T00:00:00').toLocaleDateString('pt-BR')
                            : '',
                    },
                    {
                        key: 'supplier_name', header: 'Fornecedor', sortable: true,
                        render: r => r.supplier_name || '',
                    },
                    {
                        key: 'total_amount', header: 'Total R$', sortable: true,
                        sortValue: r => r.total_amount || 0,
                        render: r => Number(r.total_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                    },
                ],
                getRowKey: r => r.id,
                actions: [
                    {
                        label: 'Imprimir',
                        icon: 'print',
                        onClick: r => this.printInvoice(r.id),
                    },
                    {
                        label: 'Excluir',
                        icon: 'delete',
                        variant: 'destructive',
                        hidden: () => !hasPermission('procurement', 'purchase-invoices', 'delete'),
                        onClick: r => this.deleteInvoice(r.id),
                    },
                ],
                onRowClick: r => this.openEdit(r),
                emptyMessage: 'Nenhuma fatura cadastrada.',
                emptyIcon: 'receipt_long',
            });
            this._dataTable.mount(document.getElementById('piTableContainer'));
        }

        this._dataTable.setLoading(true);

        try {
            const invoices = await apiCall(API + '/purchase-invoices');
            this._allInvoices = invoices || [];

            const suppliers = [...new Set(this._allInvoices.map(r => r.supplier_name).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b));
            this._filterSupplierSelect.setItems('supplier', suppliers.map(s => ({ value: s, label: s })));

            const saved = localStorage.getItem('wcm.purchase-invoices.supplier');
            if (saved && this._filterSupplierSelect.getValue() == null) this._filterSupplierSelect.setValue(saved);

            this._applyFilter();
        } catch {
            alert('Erro ao carregar faturas');
            this._dataTable.setLoading(false);
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ───────────────────────────────────────────────────────

    openNew() {
        this.selectedInvoice = null;
        showScreen('purchase-invoice-form');
    },

    openEdit(invoice) {
        this.selectedInvoice = invoice;
        showScreen('purchase-invoice-form');
    },

    async deleteInvoice(id) {
        if (!confirm('Excluir esta fatura?')) return;
        try {
            await apiCall(API + `/purchase-invoices/${id}`, { method: 'DELETE' });
            this.load();
        } catch (e) {
            alert(e.message || 'Erro ao excluir fatura');
        }
    },

    printInvoice(id) {
        const token = localStorage.getItem('wcm.auth.token');
        const layout = localStorage.getItem('wcm.purchase-invoices.layout') || 'padrao';
        const uppercase = localStorage.getItem('wcm.purchase-invoices.uppercase') === '1' ? 1 : 0;
        window.open(API + `/purchase-invoices/print/${id}?token=${encodeURIComponent(token)}&layout=${layout}&uppercase=${uppercase}`, '_blank');
    },

    // ── Privado ──────────────────────────────────────────────────────────────

    _applyFilter() {
        const val = this._filterSupplierSelect?.getValue();
        const filtered = val ? this._allInvoices.filter(r => r.supplier_name === val) : this._allInvoices;
        this._dataTable?.setData(filtered);
        if (val != null) localStorage.setItem('wcm.purchase-invoices.supplier', String(val));
        else localStorage.removeItem('wcm.purchase-invoices.supplier');
    },

    _mountNewButton() {
        document.getElementById('headerOptionsContent').innerHTML = '';

        const savedLayout = localStorage.getItem('wcm.purchase-invoices.layout') || 'padrao';
        const layoutSelect = createSelect({
            placeholder: 'Layout',
            sections: [{ key: 'layout', items: [
                { value: 'padrao',       label: 'Padrão'       },
                { value: 'limpa',        label: 'Limpa'        },
                { value: 'profissional', label: 'Profissional' },
            ]}],
            onChange: val => {
                if (val) localStorage.setItem('wcm.purchase-invoices.layout', val);
            },
        });
        layoutSelect.mount(document.getElementById('piLayoutContainer'));
        layoutSelect.setValue(savedLayout);

        this._newBtn = createButton({
            label: 'Nova Fatura',
            variant: 'primary',
            icon: 'add',
            onClick: () => this.openNew(),
        });
        document.getElementById('piNewBtnContainer').appendChild(this._newBtn.el);
    },
};

