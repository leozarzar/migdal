/**
 * purchase-invoices.js
 * Tela de Faturas de Compras (Nota de Compra Interna - NCI).
 * Permite criar faturas a partir de recebimentos de fornecedores,
 * gerenciar itens com preços e imprimir o documento NCI.
 */
const PurchaseInvoices = {

    // ── Estado ──────────────────────────────────────────────────────────────

    _dialog: null,
    _supplierSelect: null,
    _filterSupplierSelect: null,
    _dataTable: null,
    _newBtn: null,
    _step: 1,
    _selectedSupplier: null,
    _availableReceipts: [],
    _selectedReceiptIds: [],
    _items: [],
    _supplierId: null,
    _allInvoices: [],
    _suppliersCache: [],

    // ── Ciclo de Vida ────────────────────────────────────────────────────────

    render() {
        this._dialog?.destroy();               this._dialog = null;
        this._supplierSelect?.destroy();       this._supplierSelect = null;
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
        this._step = 1;
        this._selectedSupplier = null;
        this._supplierId = null;
        this._availableReceipts = [];
        this._selectedReceiptIds = [];
        this._items = [];
        this._openStepDialog();
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
        window.open(API + `/purchase-invoices/print/${id}?token=${encodeURIComponent(token)}`, '_blank');
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
        this._newBtn = createButton({
            label: 'Nova Fatura',
            variant: 'primary',
            icon: 'add',
            onClick: () => this.openNew(),
        });
        document.getElementById('piNewBtnContainer').appendChild(this._newBtn.el);
    },

    // ── Fluxo de Criação em Passos ───────────────────────────────────────────

    _openStepDialog() {
        this._dialog?.destroy();
        this._dialog = createDialog({
            title: 'Nova Fatura de Compras',
            wide: true,
            bodyHTML: `<div id="piStepBody" class="pi-step-body"></div>`,
            actions: [
                { label: 'Próximo', variant: 'primary', id: 'piNextBtn', onClick: () => this._nextStep() },
                { label: 'Cancelar', variant: 'secondary', onClick: () => this._dialog.close() }
            ]
        });
        this._dialog.open();
        this._renderStep();
    },

    async _nextStep() {
        if (this._step === 1) {
            const supId = this._supplierSelect?.getValue();
            if (!supId) { alert('Selecione um fornecedor'); return; }
            this._supplierId = Number(supId);
            const supplier = this._suppliersCache.find(s => s.id === this._supplierId);
            this._selectedSupplier = supplier?.name || '';
            this._step = 2;
            await this._renderStep();
        } else if (this._step === 2) {
            const checkboxes = document.querySelectorAll('.pi-receipt-cb:checked');
            this._selectedReceiptIds = Array.from(checkboxes).map(cb => Number(cb.value));
            if (this._selectedReceiptIds.length === 0) { alert('Selecione ao menos um recebimento'); return; }
            await this._buildItemsFromReceipts();
            this._step = 3;
            this._renderStep();
        } else if (this._step === 3) {
            this._step = 4;
            this._renderStep();
        } else if (this._step === 4) {
            await this._saveInvoice();
        }
    },

    async _renderStep() {
        const body = document.getElementById('piStepBody');
        if (!body) return;
        const nextBtn = document.getElementById('piNextBtn');

        if (this._step === 1) {
            if (nextBtn) nextBtn.textContent = 'Próximo';
            body.innerHTML = `
            <div class="pi-step-section">
                <p class="pi-step-label">Passo 1 de 4 — Selecione o fornecedor</p>
                <div id="piSupplierContainer" class="pi-supplier-container"></div>
            </div>`;
            this._supplierSelect?.destroy();
            this._supplierSelect = createSelect({
                placeholder: 'Buscar fornecedor...',
                searchable: true,
                sections: [{ key: 'supplier', items: [] }]
            });
            this._supplierSelect.mount(document.getElementById('piSupplierContainer'));
            try {
                const suppliers = await apiCall(API + '/suppliers');
                this._suppliersCache = suppliers || [];
                this._supplierSelect.setItems('supplier', suppliers.map(s => ({ value: String(s.id), label: s.name })));
            } catch {}

        } else if (this._step === 2) {
            if (nextBtn) nextBtn.textContent = 'Próximo';
            body.innerHTML = `<p class="pi-step-label">Passo 2 de 4 — Selecione os recebimentos</p><div id="piReceiptsListWrapper"></div>`;
            try {
                this._availableReceipts = await apiCall(API + `/purchase-invoices/available-receipts/${this._supplierId}`);
                const wrapper = document.getElementById('piReceiptsListWrapper');
                if (!this._availableReceipts.length) {
                    wrapper.innerHTML = `<p class="pi-empty">Nenhum recebimento disponível para este fornecedor.</p>`;
                    return;
                }
                wrapper.innerHTML = `<table class="pi-receipts-table">
                    <thead><tr><th></th><th>ID</th><th>Data</th><th>Nat.</th></tr></thead>
                    <tbody>${this._availableReceipts.map(r => `
                    <tr>
                        <td><input type="checkbox" class="pi-receipt-cb" value="${r.id}"></td>
                        <td>#${r.id}</td>
                        <td>${r.date || ''}</td>
                        <td>${r.nature || ''}</td>
                    </tr>`).join('')}</tbody>
                </table>`;
            } catch {
                body.innerHTML += `<p class="pi-empty">Erro ao carregar recebimentos.</p>`;
            }

        } else if (this._step === 3) {
            if (nextBtn) nextBtn.textContent = 'Próximo';
            body.innerHTML = `<p class="pi-step-label">Passo 3 de 4 — Revise e ajuste os itens</p>${this._buildItemsTable()}`;
            this._priceInputs?.forEach(p => p.destroy());
            this._priceInputs = [];
            document.querySelectorAll('.pi-price-cell').forEach(cell => {
                const i = parseInt(cell.dataset.idx, 10);
                const cmp = createInput({
                    type: 'number',
                    className: 'pi-price-input',
                    value: this._items[i].unit_price.toFixed(2),
                    onInput: v => {
                        this._items[i].unit_price = parseFloat(v) || 0;
                        this._items[i].total_value = this._items[i].unit_price * this._items[i].quantity;
                        this._updateItemsTotal();
                    },
                });
                cmp.input.min = '0';
                cmp.input.step = '0.01';
                cell.appendChild(cmp.el);
                this._priceInputs.push(cmp);
            });

        } else if (this._step === 4) {
            if (nextBtn) nextBtn.textContent = 'Salvar Fatura';
            const today = new Date().toISOString().slice(0, 10);
            body.innerHTML = `
            <p class="pi-step-label">Passo 4 de 4 — Dados da fatura</p>
            <div class="pi-meta-form">
                <div class="pi-meta-field">
                    <label>Tipo de documento</label>
                    <div id="piDocTypeMount"></div>
                </div>
                <div class="pi-meta-field">
                    <label>Número</label>
                    <div id="piNumberMount"></div>
                </div>
                <div class="pi-meta-field">
                    <label>Data de Emissão</label>
                    <input id="piDateEmission" type="date" class="pi-meta-input" value="${today}">
                </div>
                <div class="pi-meta-field">
                    <label>Data de Recebimento</label>
                    <input id="piDateReceipt" type="date" class="pi-meta-input" value="${today}">
                </div>
                <div class="pi-meta-field">
                    <label>Dias para vencimento</label>
                    <div id="piPaymentDaysMount"></div>
                </div>
                <div class="pi-meta-field">
                    <label>Vencimento</label>
                    <div id="piDueDateMount"></div>
                </div>
                <div class="pi-meta-field">
                    <label>Transportador</label>
                    <div id="piTransporterMount"></div>
                </div>
                <div class="pi-meta-field">
                    <label>Motorista</label>
                    <div id="piDriverMount"></div>
                </div>
                <div class="pi-meta-field">
                    <label>Placa</label>
                    <div id="piPlateMount"></div>
                </div>
            </div>`;

            this._mountStep4Inputs();
        }
    },

    _mountStep4Inputs() {
        const mk = (mountId, opts) => {
            const m = document.getElementById(mountId);
            if (!m) return null;
            const cmp = createInput(opts);
            m.appendChild(cmp.el);
            return cmp;
        };
        mk('piDocTypeMount',     { value: 'NCI', readonly: true });
        mk('piNumberMount',      { id: 'piNumber',      placeholder: 'Ex: 001234' });
        const days = mk('piPaymentDaysMount', { id: 'piPaymentDays', type: 'number', placeholder: '30', onInput: () => PurchaseInvoices._calcDueDate() });
        if (days) days.input.min = '0';
        mk('piDueDateMount',     { id: 'piDueDate',     readonly: true, placeholder: 'Calculado automaticamente' });
        mk('piTransporterMount', { id: 'piTransporter', placeholder: 'Nome' });
        mk('piDriverMount',      { id: 'piDriver',      placeholder: 'Nome' });
        mk('piPlateMount',       { id: 'piPlate',       placeholder: 'AAA-0000' });
    },

    _calcDueDate() {
        const emission = document.getElementById('piDateEmission')?.value;
        const days = parseInt(document.getElementById('piPaymentDays')?.value);
        const dueDateEl = document.getElementById('piDueDate');
        if (!dueDateEl) return;
        if (!emission || isNaN(days)) { dueDateEl.value = ''; return; }
        const d = new Date(emission);
        d.setDate(d.getDate() + days);
        dueDateEl.value = d.toISOString().slice(0, 10);
    },

    async _buildItemsFromReceipts() {
        const receiptsData = await Promise.all(
            this._selectedReceiptIds.map(id => apiCall(API + `/receipts/items/${id}`).catch(() => []))
        );

        let prices = [];
        try { prices = await apiCall(API + `/suppliers/${this._supplierId}/prices`); } catch {}

        const materialMap = {};
        const serviceItems = [];

        for (const items of receiptsData) {
            for (const item of items) {
                if (item.service_id) {
                    serviceItems.push(item);
                } else if (item.material) {
                    if (!materialMap[item.material]) {
                        materialMap[item.material] = { description: item.material, unit_measure: item.unit_measure || 'KG', quantity: 0, unit_price: 0, total_value: 0 };
                    }
                    materialMap[item.material].quantity += (item.weight || 0);
                }
            }
        }

        this._items = [];
        let itemNum = 1;

        for (const [, v] of Object.entries(materialMap)) {
            const priceEntry = prices.find(p => p.price_type === 'material' && p.material_name === v.description);
            const unitPrice = priceEntry ? priceEntry.unit_price : 0;
            this._items.push({ item_number: itemNum++, description: v.description, unit_measure: v.unit_measure, quantity: v.quantity, unit_price: unitPrice, total_value: unitPrice * v.quantity, _priceId: priceEntry?.id || null });
        }

        for (const item of serviceItems) {
            const priceEntry = prices.find(p => p.price_type === 'service' && p.service_id === item.service_id);
            const unitPrice = priceEntry ? priceEntry.unit_price : 0;
            this._items.push({ item_number: itemNum++, description: item.service_name || `Serviço #${item.service_id}`, unit_measure: 'SV', quantity: item.weight || 1, unit_price: unitPrice, total_value: unitPrice * (item.weight || 1), _priceId: priceEntry?.id || null, _serviceId: item.service_id });
        }
    },

    _buildItemsTable() {
        const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const fmtQty = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        const rows = this._items.map((item, i) => `
        <tr>
            <td>${item.item_number}</td>
            <td>${esc(item.description)}</td>
            <td>${esc(item.unit_measure)}</td>
            <td class="right">${fmtQty(item.quantity)}</td>
            <td><div class="pi-price-cell" data-idx="${i}"></div></td>
            <td class="right pi-total-cell" data-idx="${i}">${fmtQty(item.total_value)}</td>
        </tr>`).join('');

        return `<div class="pi-items-wrapper">
        <table class="pi-items-table">
            <thead><tr><th>#</th><th>Descrição</th><th>UM</th><th class="right">Qtd</th><th>Valor Unit.</th><th class="right">Total</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="pi-total-row">Total: <strong id="piItemsTotal">0,00</strong></div>
        </div>`;
    },

    _updateItemsTotal() {
        const total = this._items.reduce((s, item) => s + (item.total_value || 0), 0);
        const el = document.getElementById('piItemsTotal');
        if (el) el.textContent = total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        document.querySelectorAll('.pi-total-cell').forEach(cell => {
            const idx = Number(cell.dataset.idx);
            if (!isNaN(idx) && this._items[idx]) {
                cell.textContent = this._items[idx].total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            }
        });
    },

    async _saveInvoice() {
        const number = document.getElementById('piNumber')?.value.trim();
        const date_emission = document.getElementById('piDateEmission')?.value;
        const date_receipt = document.getElementById('piDateReceipt')?.value;
        const payment_days = parseInt(document.getElementById('piPaymentDays')?.value) || 0;
        const due_date = document.getElementById('piDueDate')?.value || null;
        const transporter_name = document.getElementById('piTransporter')?.value.trim() || null;
        const driver_name = document.getElementById('piDriver')?.value.trim() || null;
        const plate = document.getElementById('piPlate')?.value.trim() || null;

        if (!number) { alert('Informe o número do documento'); return; }
        if (!date_emission) { alert('Informe a data de emissão'); return; }

        const total_amount = this._items.reduce((s, i) => s + i.total_value, 0);

        const payload = {
            document_type: 'NCI',
            number,
            date_emission,
            date_receipt,
            supplier_id: this._supplierId,
            payment_days,
            due_date,
            total_amount,
            transporter_name,
            driver_name,
            plate,
            receipt_ids: this._selectedReceiptIds,
            items: this._items.map(({ item_number, description, unit_measure, quantity, unit_price, total_value }) =>
                ({ item_number, description, unit_measure, quantity, unit_price, total_value }))
        };

        try {
            const saved = await apiCall(API + '/purchase-invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            this._dialog.close();
            this.load();

            if (saved?.id && confirm('Fatura salva! Deseja imprimir agora?')) {
                this.printInvoice(saved.id);
            }
        } catch (e) {
            alert(e.message || 'Erro ao salvar fatura');
        }
    },
};
