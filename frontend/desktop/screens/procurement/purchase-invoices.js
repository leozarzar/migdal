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
    _step: 1,
    _selectedSupplier: null,
    _availableReceipts: [],
    _selectedReceiptIds: [],
    _items: [],
    _supplierId: null,

    // ── Ciclo de Vida ────────────────────────────────────────────────────────

    render() {
        this._dialog?.destroy(); this._dialog = null;
        this._supplierSelect?.destroy(); this._supplierSelect = null;
        return `
        <div class="pi-container">
            <div class="pi-card">
                <div class="pi-toolbar">
                    <button class="pi-btn-new" onclick="PurchaseInvoices.openNew()">
                        <span class="material-symbols-outlined">add</span>Nova Fatura
                    </button>
                </div>
                <div class="pi-table-container">
                    <table class="pi-table">
                        <thead>
                            <tr>
                                <th>Tipo</th>
                                <th>Número</th>
                                <th>Data Emissão</th>
                                <th>Fornecedor</th>
                                <th class="right">Total R$</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="piTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    },

    async load() {
        try {
            const invoices = await apiCall(API + "/purchase-invoices");
            this._renderTable(invoices);
        } catch (e) {
            alert("Erro ao carregar faturas");
        }
    },

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

    async deleteInvoice(event, id) {
        event.stopPropagation();
        if (!confirm("Excluir esta fatura?")) return;
        try {
            await apiCall(API + `/purchase-invoices/${id}`, { method: "DELETE" });
            this.load();
        } catch (e) {
            alert(e.message || "Erro ao excluir fatura");
        }
    },

    printInvoice(event, id) {
        event.stopPropagation();
        const token = localStorage.getItem('wcm.auth.token');
        window.open(API + `/purchase-invoices/print/${id}?token=${encodeURIComponent(token)}`, "_blank");
    },

    // ── Fluxo de Criação em Passos ───────────────────────────────────────────

    _openStepDialog() {
        this._dialog?.destroy();
        this._dialog = createDialog({
            title: "Nova Fatura de Compras",
            wide: true,
            bodyHTML: `<div id="piStepBody" class="pi-step-body"></div>`,
            actions: [
                { label: "Próximo", className: "btn-primary", id: "piNextBtn", onClick: () => this._nextStep() },
                { label: "Cancelar", className: "btn-secondary", onClick: () => this._dialog.close() }
            ]
        });
        this._dialog.open();
        this._renderStep();
    },

    async _nextStep() {
        if (this._step === 1) {
            const supVal = this._supplierSelect?.getValue();
            if (!supVal) { alert("Selecione um fornecedor"); return; }
            this._selectedSupplier = supVal.label;
            this._supplierId = Number(supVal.value);
            this._step = 2;
            await this._renderStep();
        } else if (this._step === 2) {
            const checkboxes = document.querySelectorAll('.pi-receipt-cb:checked');
            this._selectedReceiptIds = Array.from(checkboxes).map(cb => Number(cb.value));
            if (this._selectedReceiptIds.length === 0) { alert("Selecione ao menos um recebimento"); return; }
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
        const body = document.getElementById("piStepBody");
        if (!body) return;
        const nextBtn = document.getElementById("piNextBtn");

        if (this._step === 1) {
            if (nextBtn) nextBtn.textContent = "Próximo";
            body.innerHTML = `
            <div class="pi-step-section">
                <p class="pi-step-label">Passo 1 de 4 — Selecione o fornecedor</p>
                <div id="piSupplierContainer" class="pi-supplier-container"></div>
            </div>`;
            this._supplierSelect?.destroy();
            this._supplierSelect = createSearchSelect({
                id: 'piSupplier',
                placeholder: 'Buscar fornecedor...',
                searchable: true,
                searchPlaceholder: 'Buscar...',
                sections: [{ key: 'supplier', items: [] }]
            });
            this._supplierSelect.mount(document.getElementById('piSupplierContainer'));
            try {
                const suppliers = await apiCall(API + "/suppliers");
                this._supplierSelect.setItems('supplier', suppliers.map(s => ({ value: String(s.id), label: s.name })));
            } catch (e) {}

        } else if (this._step === 2) {
            if (nextBtn) nextBtn.textContent = "Próximo";
            body.innerHTML = `<p class="pi-step-label">Passo 2 de 4 — Selecione os recebimentos</p><div id="piReceiptsListWrapper"></div>`;
            try {
                this._availableReceipts = await apiCall(API + `/purchase-invoices/available-receipts/${this._supplierId}`);
                const wrapper = document.getElementById("piReceiptsListWrapper");
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
            } catch (e) {
                body.innerHTML += `<p class="pi-empty">Erro ao carregar recebimentos.</p>`;
            }

        } else if (this._step === 3) {
            if (nextBtn) nextBtn.textContent = "Próximo";
            body.innerHTML = `<p class="pi-step-label">Passo 3 de 4 — Revise e ajuste os itens</p>${this._buildItemsTable()}`;
            // Bind price inputs
            document.querySelectorAll('.pi-price-input').forEach((inp, i) => {
                inp.addEventListener('input', () => {
                    this._items[i].unit_price = parseFloat(inp.value) || 0;
                    this._items[i].total_value = this._items[i].unit_price * this._items[i].quantity;
                    this._updateItemsTotal();
                });
            });

        } else if (this._step === 4) {
            if (nextBtn) nextBtn.textContent = "Salvar Fatura";
            const today = new Date().toISOString().slice(0, 10);
            body.innerHTML = `
            <p class="pi-step-label">Passo 4 de 4 — Dados da fatura</p>
            <div class="pi-meta-form">
                <div class="pi-meta-field">
                    <label>Tipo de documento</label>
                    <input class="pi-meta-input" value="NCI" readonly>
                </div>
                <div class="pi-meta-field">
                    <label>Número</label>
                    <input id="piNumber" class="pi-meta-input" placeholder="Ex: 001234">
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
                    <input id="piPaymentDays" type="number" min="0" class="pi-meta-input" placeholder="30" oninput="PurchaseInvoices._calcDueDate()">
                </div>
                <div class="pi-meta-field">
                    <label>Vencimento</label>
                    <input id="piDueDate" class="pi-meta-input" readonly placeholder="Calculado automaticamente">
                </div>
                <div class="pi-meta-field">
                    <label>Transportador</label>
                    <input id="piTransporter" class="pi-meta-input" placeholder="Nome">
                </div>
                <div class="pi-meta-field">
                    <label>Motorista</label>
                    <input id="piDriver" class="pi-meta-input" placeholder="Nome">
                </div>
                <div class="pi-meta-field">
                    <label>Placa</label>
                    <input id="piPlate" class="pi-meta-input" placeholder="AAA-0000">
                </div>
            </div>`;
        }
    },

    _calcDueDate() {
        const emission = document.getElementById("piDateEmission")?.value;
        const days = parseInt(document.getElementById("piPaymentDays")?.value);
        const dueDateEl = document.getElementById("piDueDate");
        if (!dueDateEl) return;
        if (!emission || isNaN(days)) { dueDateEl.value = ""; return; }
        const d = new Date(emission);
        d.setDate(d.getDate() + days);
        dueDateEl.value = d.toISOString().slice(0, 10);
    },

    async _buildItemsFromReceipts() {
        const receiptsData = await Promise.all(
            this._selectedReceiptIds.map(id => apiCall(API + `/receipts/items/${id}`).catch(() => []))
        );

        // Busca preços do fornecedor para pré-preencher
        let prices = [];
        try { prices = await apiCall(API + `/suppliers/${this._supplierId}/prices`); } catch (e) {}

        // Agrega por material (soma quantidades) e separa serviços fixos individualmente
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
        const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const fmtQty = v => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
        const rows = this._items.map((item, i) => `
        <tr>
            <td>${item.item_number}</td>
            <td>${esc(item.description)}</td>
            <td>${esc(item.unit_measure)}</td>
            <td class="right">${fmtQty(item.quantity)}</td>
            <td><input type="number" class="pi-price-input" value="${item.unit_price.toFixed(2)}" min="0" step="0.01"></td>
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
        const el = document.getElementById("piItemsTotal");
        if (el) el.textContent = total.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
        // Also update individual total cells
        document.querySelectorAll('.pi-total-cell').forEach((cell) => {
            const idx = Number(cell.dataset.idx);
            if (!isNaN(idx) && this._items[idx]) {
                cell.textContent = this._items[idx].total_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
            }
        });
    },

    async _saveInvoice() {
        const number = document.getElementById("piNumber")?.value.trim();
        const date_emission = document.getElementById("piDateEmission")?.value;
        const date_receipt = document.getElementById("piDateReceipt")?.value;
        const payment_days = parseInt(document.getElementById("piPaymentDays")?.value) || 0;
        const due_date = document.getElementById("piDueDate")?.value || null;
        const transporter_name = document.getElementById("piTransporter")?.value.trim() || null;
        const driver_name = document.getElementById("piDriver")?.value.trim() || null;
        const plate = document.getElementById("piPlate")?.value.trim() || null;

        if (!number) { alert("Informe o número do documento"); return; }
        if (!date_emission) { alert("Informe a data de emissão"); return; }

        const total_amount = this._items.reduce((s, i) => s + i.total_value, 0);

        const payload = {
            document_type: "NCI",
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

        // Verifica se algum preço foi alterado vs. o cadastro do fornecedor
        const changedPrices = this._items.filter(item => {
            if (!item._priceId) return false;
            // Simplificação: se o usuário editou o campo, unit_price já foi atualizado em _items
            return true;
        });

        try {
            const saved = await apiCall(API + "/purchase-invoices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            this._dialog.close();
            this.load();

            if (saved?.id && confirm("Fatura salva! Deseja imprimir agora?")) {
                window.open(API + `/purchase-invoices/print/${saved.id}`, "_blank");
            }
        } catch (e) {
            alert(e.message || "Erro ao salvar fatura");
        }
    },

    // ── Renderização ─────────────────────────────────────────────────────────

    _renderTable(invoices) {
        const tbody = document.getElementById("piTableBody");
        if (!tbody) return;
        const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const fmtDate = v => v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
        const fmtMoney = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

        if (!invoices || invoices.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Nenhuma fatura cadastrada.</td></tr>`;
            return;
        }
        tbody.innerHTML = invoices.map(inv => `
        <tr>
            <td>${esc(inv.document_type)}</td>
            <td>${esc(inv.number)}</td>
            <td>${fmtDate(inv.date_emission)}</td>
            <td>${esc(inv.supplier_name)}</td>
            <td class="right">${fmtMoney(inv.total_amount)}</td>
            <td class="pi-col-actions">
                <button onclick="PurchaseInvoices.printInvoice(event, ${inv.id})" title="Imprimir NCI">
                    <span class="material-symbols-outlined">print</span>
                </button>
                <button onclick="PurchaseInvoices.deleteInvoice(event, ${inv.id})" title="Excluir">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        </tr>`).join('');
    }
};
