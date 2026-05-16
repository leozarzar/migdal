/**
 * orders-details.js
 * Tela de detalhes de Pedido — criação, edição e gerenciamento de itens do pedido.
 */
const OrdersDetails = {

    // ── Estado ──

    items: [],
    receivedQuantities: {},
    _ghostItems: [],
    _groupDetails: {},
    _groupsCache: [],
    _materialsCache: [],
    _isDirty: false,
    _bypassLeaveCheck: false,
    _editingItemIndex: null,
    _lastItemSelection: null,

    // ── Instâncias de componentes ──

    _supplierSelect: null,
    _statusToggle: null,
    _datePicker: null,
    _dueDatePicker: null,
    _expectedDatePicker: null,
    _itemsDialog: null,
    _itemsDataTable: null,
    _dlgItemSelect: null,

    _isReadOnly() {
        if (!Orders.selectedOrder) return false;
        return !hasPermission('procurement', 'orders', 'edit');
    },

    _isFormLocked() {
        const status = this._statusToggle?.getValue();
        return status === 'CLOSED' || status === 'CANCELLED' || this._isReadOnly();
    },

    // ── Ciclo de Vida ──

    async render() {
        this.items = [];
        this.receivedQuantities = {};
        this._ghostItems = [];
        this._groupDetails = {};
        this._editingItemIndex = null;
        this._lastItemSelection = null;
        this._supplierSelect?.destroy();        this._supplierSelect = null;
        this._statusToggle?.destroy();          this._statusToggle = null;
        this._datePicker?.destroy();            this._datePicker = null;
        this._dueDatePicker?.destroy();         this._dueDatePicker = null;
        this._expectedDatePicker?.destroy();    this._expectedDatePicker = null;
        this._itemsDialog?.destroy();           this._itemsDialog = null;
        this._itemsDataTable?.destroy();        this._itemsDataTable = null;
        this._dlgItemSelect?.destroy();         this._dlgItemSelect = null;

        if (Orders.selectedOrder) {
            try {
                const orderItems = await apiCall(API + `/orders/items/${Orders.selectedOrder.id}`);
                this.items = orderItems.map(i => {
                    if (i.group_id != null || i.group_quantity != null) {
                        return { type: 'group', group_id: i.group_id, group_name: i.group_name, group_quantity: i.group_quantity, receivedQuantity: 0 };
                    }
                    return { type: 'material', material: i.material, quantity: i.quantity, receivedQuantity: 0 };
                });

                const bags = await apiCall(API + `/orders/${Orders.selectedOrder.id}/stock-units`);
                if (bags && bags.length > 0) {
                    const materialQuantities = {};
                    bags.forEach(bag => {
                        materialQuantities[bag.material] = (materialQuantities[bag.material] || 0) + bag.weight;
                    });
                    this.receivedQuantities = materialQuantities;

                    this.items = this.items.map(item => {
                        if (item.type === 'group') return item;
                        return { ...item, receivedQuantity: materialQuantities[item.material] || 0 };
                    });

                    const groupDetails = {};
                    for (const item of this.items) {
                        if (item.type !== 'group' || groupDetails[item.group_id] !== undefined) continue;
                        try {
                            const g = await apiCall(API + `/groups/${item.group_id}`);
                            groupDetails[item.group_id] = (g.materials || []).map(m => m.name);
                        } catch (e) {
                            groupDetails[item.group_id] = [];
                        }
                    }
                    this._groupDetails = groupDetails;

                    this.items = this.items.map(item => {
                        if (item.type !== 'group') return item;
                        const materialNames = groupDetails[item.group_id] || [];
                        const received = materialNames.reduce((sum, name) => sum + (materialQuantities[name] || 0), 0);
                        return { ...item, receivedQuantity: received };
                    });

                    const orderedMaterials = new Set(this.items.filter(i => i.type === 'material').map(i => i.material));
                    const groupMaterials = new Set(Object.values(groupDetails).flat());
                    this._ghostItems = Object.entries(materialQuantities)
                        .filter(([mat]) => !orderedMaterials.has(mat) && !groupMaterials.has(mat))
                        .map(([mat, qty]) => ({ material: mat, receivedQuantity: qty }));
                }
            } catch (error) {
                console.error("Erro ao carregar itens do pedido:", error);
            }
        }

        return `
        <div class="orders-details-container">
            <div class="rd-content">
                <div class="rd-header">
                    <div class="rd-header-row">
                        <h1>Pedido <span id="orderTitleCode"></span><span id="orderDraftBadge" style="margin-left:8px"></span></h1>
                        <button id="ordCopyBtn" class="rd-copy-btn" type="button" title="Copiar resumo" style="display:none" onclick="OrdersDetails.copySummary()">
                            <span class="material-symbols-outlined">content_copy</span>
                            <span>Copiar</span>
                        </button>
                    </div>
                    <div class="rd-meta">
                        <span>Fornecedor: <span id="orderSupplierName">-</span>  |  </span>
                        <span>Status: <span id="orderStatusLabel">-</span>  |  </span>
                        <span>Qtd: <span id="orderQty">0</span>  |  </span>
                        <span>Recebido: <span id="orderReceivedQty">0</span>  |  </span>
                        <span>Dif%: <span id="orderDiff">-</span></span>
                    </div>
                </div>

                <div class="rd-separator"></div>

                <input type="hidden" id="orderCode">
                <input type="hidden" id="orderDate">
                <input type="hidden" id="orderDue">
                <input type="hidden" id="orderExpected">

                <div class="rd-section">
                    <h2 class="rd-section-title">Informações Básicas</h2>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Fornecedor <span class="required" id="reqSupplier">*</span></span>
                            <span class="rd-field-desc">Empresa fornecedora dos materiais</span>
                        </div>
                        <div class="rd-form-field">
                            <div class="select-with-btn">
                                <div id="orderSupplierContainer"></div>
                                <button class="btn-open-tab" onclick="openNewTab('suppliers')" title="Abrir cadastro de fornecedores em nova aba">
                                    <span class="material-symbols-outlined">open_in_new</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Status</span>
                            <span class="rd-field-desc">Situação atual do pedido</span>
                        </div>
                        <div class="rd-form-field">
                            <div id="orderStatusContainer"></div>
                        </div>
                    </div>
                </div>

                <div class="rd-section">
                    <h2 class="rd-section-title">Datas</h2>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Data do Pedido <span class="required" id="reqDate">*</span></span>
                            <span class="rd-field-desc">Data em que o pedido foi emitido</span>
                        </div>
                        <div class="rd-form-field">
                            <div id="orderDateContainer"></div>
                        </div>
                    </div>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Prazo Limite</span>
                            <span class="rd-field-desc">Data máxima para recebimento</span>
                        </div>
                        <div class="rd-form-field">
                            <div id="orderDueContainer"></div>
                        </div>
                    </div>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Previsão</span>
                            <span class="rd-field-desc">Data prevista de entrega</span>
                        </div>
                        <div class="rd-form-field">
                            <div id="orderExpectedContainer"></div>
                        </div>
                    </div>
                </div>

                <div class="rd-section">
                    <h2 class="rd-section-title">Itens do Pedido</h2>
                    <div id="ordItemsWidget"></div>
                </div>
            </div>

            <div class="rd-action-bar" id="ordActionBar"></div>
        </div>`;
    },

    _markDirty() { this._isDirty = true; },

    async canLeave() {
        if (this._bypassLeaveCheck) { this._bypassLeaveCheck = false; return true; }
        const isNew = !Orders.selectedOrder;
        if (!isNew && !this._isDirty) return true;
        return new Promise(resolve => {
            let resolved = false;
            const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };
            const dlg = createDialog({
                title: isNew ? 'Rascunho não salvo' : 'Alterações não salvas',
                bodyHTML: isNew
                    ? '<p>O pedido ainda não foi criado. Se sair agora, o rascunho será perdido.</p>'
                    : '<p>Você tem alterações não salvas. O que deseja fazer?</p>',
                closeOnBackdrop: false,
                actions: [
                    { label: isNew ? 'Descartar rascunho' : 'Sair sem salvar', variant: 'cancel', onClick: () => { done(true); dlg.close(); } },
                    { label: 'Continuar editando', variant: 'secondary', onClick: () => { done(false); dlg.close(); } },
                ],
                onClose: () => done(false),
            });
            dlg.open();
        });
    },

    async load() {
        this._isDirty = false;
        this._renderActionBar();

        // Order date picker (sem restrições próprias, mas controla os dependentes)
        this._datePicker = createDatePicker({
            placeholder: 'Selecione a data',
            onChange: (date) => {
                document.getElementById('orderDate').value = date ? date.toISOString().slice(0, 10) : '';
                OrdersDetails._remountDueDatePicker();
                OrdersDetails._remountExpectedDatePicker();
                OrdersDetails._updateRequiredIndicators();
                OrdersDetails._markDirty();
            },
        });
        this._datePicker.mount(document.getElementById('orderDateContainer'));

        this._supplierSelect = createSelect({
            placeholder: 'Selecione um fornecedor',
            searchable: true,
            sections: [{ key: 'supplier', items: [] }],
            onChange: () => { OrdersDetails._updateHeaderFields(); OrdersDetails._markDirty(); }
        });
        this._supplierSelect.mount(document.getElementById('orderSupplierContainer'));

        this._statusToggle = createToggleGroup({
            options: [
                { value: 'OPEN',      label: 'Aberto' },
                { value: 'CLOSED',    label: 'Fechado' },
                { value: 'CANCELLED', label: 'Cancelado' },
            ],
            onChange: () => {
                OrdersDetails._updateHeaderFields();
                OrdersDetails._onStatusChange();
                OrdersDetails._markDirty();
            },
        });
        this._statusToggle.mount(document.getElementById('orderStatusContainer'));

        await this._refreshSelects();

        const copyBtn = document.getElementById('ordCopyBtn');
        if (copyBtn) copyBtn.style.display = Orders.selectedOrder ? '' : 'none';

        if (Orders.selectedOrder) {
            document.getElementById("orderCode").value = Orders.selectedOrder.id;
            document.getElementById("orderTitleCode").textContent = `#${Orders.selectedOrder.id}`;
            if (Orders.selectedOrder.supplier) this._supplierSelect.setValue(Orders.selectedOrder.supplier);
            this._statusToggle.setValue(Orders.selectedOrder.status || 'OPEN');

            const date = Orders.selectedOrder.date;
            if (date) {
                document.getElementById('orderDate').value = date;
                this._datePicker.setValue(new Date(date + 'T00:00:00'));
            }

            // Pré-carrega os valores nos hidden inputs antes de recriar os pickers
            const dueDate = Orders.selectedOrder.due_date;
            if (dueDate) document.getElementById('orderDue').value = dueDate;

            const expectedDate = Orders.selectedOrder.expected_date;
            if (expectedDate) document.getElementById('orderExpected').value = expectedDate;
        } else {
            const nextId = await this._getNextOrderCode();
            document.getElementById("orderCode").value = nextId;
            document.getElementById("orderDraftBadge").innerHTML = '<span class="receipt-badge receipt-badge-draft">Rascunho</span>';
            this._statusToggle.setValue('OPEN');
            // Status imutável para pedidos novos
            this._statusToggle.el.style.pointerEvents = 'none';
            this._statusToggle.el.style.opacity = '0.6';

            // Data do pedido começa com a data de hoje
            const today = new Date().toISOString().slice(0, 10);
            document.getElementById('orderDate').value = today;
            this._datePicker.setValue(new Date(today + 'T00:00:00'));
        }

        // Cria/recria pickers de prazo e previsão com as restrições corretas
        this._remountDueDatePicker();
        this._remountExpectedDatePicker();

        // Aplica estado de bloqueio (leitura ou status CLOSED)
        this._applyLockedState();

        this._updateHeaderFields();
        this._refreshItemsView();
    },

    async _refreshSelects() {
        if (!this._supplierSelect) return;
        try {
            const [suppliers, groups] = await Promise.all([
                apiCall(API + "/suppliers"),
                apiCall(API + "/groups").catch(() => [])
            ]);
            this._supplierSelect.setItems('supplier', (suppliers || []).map(s => ({ value: s.name, label: s.name })));
            this._groupsCache = groups || [];
        } catch (e) { /* falha silenciosa */ }
    },

    async onTabFocus() { await this._refreshSelects(); },

    // ── Pickers dependentes ──

    /** Recria o picker de Prazo Limite com minDate = dia seguinte ao Data do Pedido */
    _remountDueDatePicker() {
        const orderDateStr = document.getElementById('orderDate')?.value;
        const locked = this._isFormLocked();

        let minDate = null;
        if (orderDateStr) {
            minDate = new Date(orderDateStr + 'T00:00:00');
            minDate.setDate(minDate.getDate() + 1);
        }

        // Preserva valor atual se ainda válido, senão limpa
        const currentDueStr = document.getElementById('orderDue')?.value;
        let restoreDate = null;
        if (!orderDateStr) {
            document.getElementById('orderDue').value = '';
        } else if (currentDueStr) {
            const currentDue = new Date(currentDueStr + 'T00:00:00');
            if (currentDue >= minDate) {
                restoreDate = currentDue;
            } else {
                document.getElementById('orderDue').value = '';
            }
        }

        this._dueDatePicker?.destroy(); this._dueDatePicker = null;

        this._dueDatePicker = createDatePicker({
            placeholder: 'Selecione a data',
            disabled: !orderDateStr || locked,
            minDate,
            onChange: (date) => {
                document.getElementById('orderDue').value = date ? date.toISOString().slice(0, 10) : '';
                OrdersDetails._remountExpectedDatePicker();
                OrdersDetails._markDirty();
            },
        });
        this._dueDatePicker.mount(document.getElementById('orderDueContainer'));
        if (restoreDate) this._dueDatePicker.setValue(restoreDate);
    },

    /** Recria o picker de Previsão com minDate = Data do Pedido e maxDate = Prazo Limite */
    _remountExpectedDatePicker() {
        const orderDateStr = document.getElementById('orderDate')?.value;
        const dueDateStr = document.getElementById('orderDue')?.value;
        const locked = this._isFormLocked();

        const minDate = orderDateStr ? new Date(orderDateStr + 'T00:00:00') : null;
        const maxDate = dueDateStr ? new Date(dueDateStr + 'T00:00:00') : null;

        const currentExpStr = document.getElementById('orderExpected')?.value;
        let restoreDate = null;
        if (!orderDateStr || !dueDateStr) {
            document.getElementById('orderExpected').value = '';
        } else if (currentExpStr) {
            const expDate = new Date(currentExpStr + 'T00:00:00');
            const valid = (!minDate || expDate >= minDate) && (!maxDate || expDate <= maxDate);
            if (valid) restoreDate = expDate;
            else document.getElementById('orderExpected').value = '';
        }

        this._expectedDatePicker?.destroy(); this._expectedDatePicker = null;

        this._expectedDatePicker = createDatePicker({
            placeholder: 'Selecione a data',
            disabled: !orderDateStr || !dueDateStr || locked,
            minDate,
            maxDate,
            onChange: (date) => {
                document.getElementById('orderExpected').value = date ? date.toISOString().slice(0, 10) : '';
                OrdersDetails._markDirty();
            },
        });
        this._expectedDatePicker.mount(document.getElementById('orderExpectedContainer'));
        if (restoreDate) this._expectedDatePicker.setValue(restoreDate);
    },

    /** Aplica o estado de bloqueio global (status CLOSED ou somente leitura) */
    _applyLockedState() {
        const locked = this._isFormLocked();
        const readOnly = this._isReadOnly();

        this._supplierSelect?.setDisabled(locked);
        this._datePicker?.setDisabled(locked);

        if (readOnly && this._statusToggle?.el) {
            this._statusToggle.el.style.pointerEvents = 'none';
            this._statusToggle.el.style.opacity = '0.6';
        }
    },

    /** Reage à mudança de status: bloqueia/desbloqueia campos conforme necessário */
    _onStatusChange() {
        this._applyLockedState();
        this._remountDueDatePicker();
        this._remountExpectedDatePicker();
        this._renderItemsWidget();
    },

    // ── Ações Públicas ──

    async save() {
        const orderData = this._getOrderData();
        if (!orderData.supplier || !orderData.date) {
            alert("Erro: Fornecedor e Data do Pedido são obrigatórios.");
            return;
        }
        if (this.items.length === 0) {
            alert("Erro: Adicione pelo menos um item ao pedido.");
            return;
        }
        try {
            const response = await apiCall(API + "/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(orderData)
            });
            await this._saveOrderItems(response.id);
            this._isDirty = false;
            showToast("Pedido salvo com sucesso", "success");
            showScreen('orders');
        } catch (error) {
            alert("Erro ao salvar pedido");
        }
    },

    async editOrder() {
        const orderData = this._getOrderData();
        if (!orderData.supplier || !orderData.date) {
            alert("Erro: Fornecedor e Data do Pedido são obrigatórios.");
            return;
        }
        if (this.items.length === 0) {
            alert("Erro: O pedido deve ter pelo menos um item.");
            return;
        }
        try {
            await apiCall(API + "/orders/update", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(orderData)
            });
            await apiCall(API + "/orders/items", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: orderData.id })
            });
            await this._saveOrderItems(orderData.id);
            this._isDirty = false;
            showToast("Pedido atualizado com sucesso", "success");
            showScreen('orders');
        } catch (error) {
            alert("Erro ao atualizar pedido");
        }
    },

    cancel() {
        showScreen('orders');
    },

    /** Copia para a área de transferência um resumo do pedido formatado para WhatsApp */
    async copySummary() {
        try {
            if (!this._materialsCache || this._materialsCache.length === 0) {
                try { this._materialsCache = await apiCall(API + '/materials') || []; }
                catch { this._materialsCache = []; }
            }
            const text = this._buildWhatsappSummary();
            await navigator.clipboard.writeText(text);
            showToast('Resumo copiado para a área de transferência.', 'success');
        } catch (e) {
            showToast('Não foi possível copiar o resumo.', 'danger');
        }
    },

    _buildWhatsappSummary() {
        const o = Orders.selectedOrder || {};
        const supplier = this._supplierSelect?.getValue() || o.supplier || '';
        const statusLabels = { 'OPEN': 'Aberto', 'CLOSED': 'Fechado', 'CANCELLED': 'Cancelado' };
        const status = statusLabels[this._statusToggle?.getValue() || o.status] || '';

        const fmtDate = v => v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-BR') : '';
        const dateStr     = fmtDate(o.date || document.getElementById('orderDate')?.value);
        const dueStr      = fmtDate(o.due_date || document.getElementById('orderDue')?.value);
        const expectedStr = fmtDate(o.expected_date || document.getElementById('orderExpected')?.value);

        const matCache = this._materialsCache || [];
        const uomOf = name => matCache.find(m => m.name === name)?.unit_of_measure || '';

        const lines = [];
        lines.push(`*Pedido #${o.id || ''}*`);
        if (dateStr)     lines.push(`Data: ${dateStr}`);
        if (dueStr)      lines.push(`Prazo: ${dueStr}`);
        if (expectedStr) lines.push(`Previsão: ${expectedStr}`);
        if (supplier)    lines.push(`Fornecedor: ${supplier}`);
        if (status)      lines.push(`Status: ${status}`);

        lines.push('');
        lines.push('*Itens:*');
        if (!this.items.length) {
            lines.push('(sem itens)');
        } else {
            const uoms = new Set();
            let total = 0;
            for (const it of this.items) {
                if (it.type === 'group') {
                    const name = it.group_name || `Grupo #${it.group_id}`;
                    const qty = Number(it.group_quantity || 0);
                    total += qty;
                    lines.push(`• ${name} — ${_fmtQtyPlain(qty)}`);
                } else {
                    const name = it.material || '-';
                    const uom = uomOf(name);
                    if (uom) uoms.add(uom);
                    const qty = Number(it.quantity || 0);
                    total += qty;
                    lines.push(`• ${name} — ${_fmtQtyPlain(qty)}${uom ? ' ' + uom : ''}`);
                }
            }
            const totalUom = uoms.size === 1 ? ' ' + [...uoms][0] : '';
            lines.push('');
            lines.push(`Total: ${_fmtQtyPlain(total)}${totalUom}`);
        }
        return lines.join('\n');
    },

    async _exitScreen() {
        const isNew = !Orders.selectedOrder;
        if (isNew || this._isDirty) {
            const canGo = await new Promise(resolve => {
                let resolved = false;
                const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };
                const dlg = createDialog({
                    title: isNew ? 'Rascunho não salvo' : 'Alterações não salvas',
                    bodyHTML: isNew
                        ? '<p>O pedido ainda não foi criado. Se sair agora, o rascunho será perdido.</p>'
                        : '<p>Você tem alterações não salvas. O que deseja fazer?</p>',
                    closeOnBackdrop: false,
                    actions: [
                        { label: isNew ? 'Descartar rascunho' : 'Sair sem salvar', variant: 'cancel', onClick: () => { done(true); dlg.close(); } },
                        { label: 'Continuar editando', variant: 'secondary', onClick: () => { done(false); dlg.close(); } },
                    ],
                    onClose: () => done(false),
                });
                dlg.open();
            });
            if (!canGo) return;
        }
        this._isDirty = false;
        this._bypassLeaveCheck = true;
        showScreen('orders');
    },

    // ── Dialog de Itens ──

    openItemsDialog() {
        this._editingItemIndex = null;
        this._lastItemSelection = null;
        this._dlgItemSelect?.destroy(); this._dlgItemSelect = null;

        const readOnly = this._isReadOnly();

        this._itemsDialog = createDialog({
            title: 'Itens do Pedido',
            wide: true,
            bodyHTML: `
                <div class="rd-items-dlg-body">
                    ${!readOnly ? `
                    <div class="rd-items-dlg-form">
                        <div class="rd-items-dlg-fields">
                            <div>
                                <span class="rd-dlg-field-label">Material ou Grupo <span class="required">*</span></span>
                                <div class="select-with-btn">
                                    <div id="ordDlgItemContainer"></div>
                                    <button class="btn-open-tab" onclick="openNewTab('materials')" title="Abrir cadastro de materiais em nova aba">
                                        <span class="material-symbols-outlined">open_in_new</span>
                                    </button>
                                </div>
                            </div>
                            <div>
                                <span class="rd-dlg-field-label">Quantidade <span class="required">*</span></span>
                                <div id="ordDlgQtyMount"></div>
                            </div>
                        </div>
                        <div class="rd-items-dlg-actions" id="ordDlgFormActions"></div>
                    </div>
                    <hr class="rd-items-dlg-divider">
                    ` : ''}
                    <div id="ordItemsTableMount"></div>
                </div>`,
            actions: [
                { label: 'Fechar', variant: 'secondary', onClick: () => this._itemsDialog?.close() },
            ],
            onClose: () => {
                this._dlgItemSelect?.destroy(); this._dlgItemSelect = null;
                this._itemsDataTable?.destroy(); this._itemsDataTable = null;
                const dlg = this._itemsDialog; this._itemsDialog = null;
                dlg?.destroy();
                this._renderItemsWidget();
            },
        });
        this._itemsDialog.open();

        const backdrops = document.querySelectorAll('.dialog-backdrop');
        backdrops[backdrops.length - 1]?.querySelector('.dialog-panel')?.classList.add('dialog-panel--items-dlg');

        const columns = [
            {
                key: 'material',
                header: 'Material',
                render: r => {
                    if (r._isTotal) return `<span class="rd-items-total-label">Total</span>`;
                    if (r._isGhost) return `<span class="ord-ghost-name">${_esc(r.material)}</span>`;
                    if (r.type === 'group') return `<span class="ord-group-badge">Grupo</span> ${_esc(r.group_name)}`;
                    return _esc(r.material);
                },
            },
            {
                key: 'quantity',
                header: 'Quantidade',
                width: '120px',
                render: r => {
                    if (r._isTotal) return `<span class="rd-items-total-qty">${r._grandTotal}</span>`;
                    if (r._isGhost) return '—';
                    if (r.type === 'group') return String(r.group_quantity);
                    return String(r.quantity);
                },
            },
            {
                key: 'received',
                header: 'Recebido',
                width: '120px',
                render: r => {
                    if (r._isTotal) return '';
                    if (r._isGhost) return String(r.receivedQuantity);
                    return r.receivedQuantity ? String(r.receivedQuantity) : '—';
                },
            },
        ];

        this._itemsDataTable = createDataTable({
            columns,
            getRowKey: r => r._isTotal ? 'total' : r._isGhost ? `ghost-${r.material}` : `item-${r._idx}`,
            emptyMessage: 'Nenhum item adicionado.',
            emptyIcon: 'inventory_2',
            ...(!readOnly ? {
                onRowClick: r => {
                    if (r._isTotal) return;
                    if (r._isGhost) { OrdersDetails._startEditGhostInDialog(r.material); return; }
                    OrdersDetails.startEditItem(r._idx);
                },
                actions: [{
                    label: 'Remover',
                    icon: 'delete',
                    variant: 'destructive',
                    hidden: r => !!(r._isTotal || r._isGhost),
                    onClick: r => OrdersDetails.deleteItem(r._idx),
                }],
            } : {}),
        });
        this._itemsDataTable.mount(document.getElementById('ordItemsTableMount'));
        this._refreshDlgTable();

        if (!readOnly) {
            const qtyInput = createInput({ id: 'ordDlgQty', type: 'number', placeholder: '0' });
            qtyInput.input.min = '0.01';
            qtyInput.input.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); OrdersDetails.addItem(); }
            });
            document.getElementById('ordDlgQtyMount').appendChild(qtyInput.el);

            this._dlgItemSelect = createSelect({
                placeholder: 'Selecione material ou grupo',
                searchable: true,
                sections: [
                    { key: 'material', label: 'Materiais', items: [] },
                    { key: 'group',    label: 'Grupos',    items: [] },
                ],
                onChange: (value) => {
                    if (value == null) { OrdersDetails._lastItemSelection = null; return; }
                    const isGroup = typeof value === 'number';
                    if (isGroup) {
                        const group = OrdersDetails._groupsCache.find(g => g.id === value);
                        OrdersDetails._lastItemSelection = { type: 'group', id: value, name: group?.name || '' };
                        const idx = OrdersDetails.items.findIndex(i => i.type === 'group' && i.group_id === value);
                        if (idx !== -1) { OrdersDetails.startEditItem(idx); return; }
                    } else {
                        OrdersDetails._lastItemSelection = { type: 'material', name: String(value) };
                        const idx = OrdersDetails.items.findIndex(i => i.type === 'material' && i.material === value);
                        if (idx !== -1) { OrdersDetails.startEditItem(idx); return; }
                    }
                }
            });
            this._dlgItemSelect.mount(document.getElementById('ordDlgItemContainer'));

            apiCall(API + "/materials").then(materials => {
                OrdersDetails._dlgItemSelect?.setItems('material', (materials || []).map(m => ({ value: m.name, label: m.name })));
            }).catch(() => {});
            this._dlgItemSelect.setItems('group', this._groupsCache.map(g => ({ value: g.id, label: g.name })));

            this._renderDlgFormActions();
        }
    },

    _renderDlgFormActions() {
        const container = document.getElementById('ordDlgFormActions');
        if (!container) return;
        container.innerHTML = '';
        const isEdit = this._editingItemIndex !== null;
        const addBtn = createButton({
            label: isEdit ? 'Salvar' : 'Adicionar',
            variant: 'primary',
            icon: isEdit ? 'check' : 'add',
            onClick: () => OrdersDetails.addItem(),
        });
        container.appendChild(addBtn.el);
        if (isEdit) {
            const cancelBtn = createButton({
                label: 'Cancelar',
                variant: 'secondary',
                onClick: () => OrdersDetails.cancelEditItem(),
            });
            container.appendChild(cancelBtn.el);
        }
    },

    _clearDlgForm() {
        this._dlgItemSelect?.clear();
        this._lastItemSelection = null;
        const qtyEl = document.getElementById('ordDlgQty');
        if (qtyEl) qtyEl.value = '';
    },

    addItem() {
        const selected = this._lastItemSelection;
        const qtyEl = document.getElementById('ordDlgQty');
        const quantity = qtyEl?.value;

        if (!selected || !quantity) {
            alert("Preencha todos os campos do item");
            return;
        }

        if (this._editingItemIndex !== null) {
            const orig = this.items[this._editingItemIndex];
            if (orig.type === 'group') {
                this.items[this._editingItemIndex] = { ...orig, group_quantity: Number(quantity) };
            } else {
                this.items[this._editingItemIndex] = { ...orig, quantity: Number(quantity) };
            }
            this._editingItemIndex = null;
        } else {
            if (selected.type === 'group') {
                this.items.push({
                    type: 'group',
                    group_id: Number(selected.id),
                    group_name: selected.name,
                    group_quantity: Number(quantity),
                    receivedQuantity: 0,
                });
            } else {
                const ghost = this._ghostItems.find(g => g.material === selected.name);
                this.items.push({
                    type: 'material',
                    material: selected.name,
                    quantity: Number(quantity),
                    receivedQuantity: ghost ? ghost.receivedQuantity : 0,
                });
                this._ghostItems = this._ghostItems.filter(g => g.material !== selected.name);
            }
        }

        this._clearDlgForm();
        this._renderDlgFormActions();
        this._refreshItemsView();
        this._refreshDlgTable();
        this._markDirty();
        setTimeout(() => document.getElementById('ordDlgQty')?.focus(), 0);
    },

    deleteItem(index) {
        if (this._editingItemIndex === index) {
            this._editingItemIndex = null;
            this._clearDlgForm();
            this._renderDlgFormActions();
        } else if (this._editingItemIndex !== null && this._editingItemIndex > index) {
            this._editingItemIndex -= 1;
        }

        const removed = this.items[index];
        this.items.splice(index, 1);

        if (removed.type === 'material') {
            if ((removed.receivedQuantity || 0) > 0) {
                const groupMaterialsNow = new Set(
                    this.items.filter(i => i.type === 'group')
                        .flatMap(i => this._groupDetails[i.group_id] || [])
                );
                if (!groupMaterialsNow.has(removed.material)) {
                    this._ghostItems.push({ material: removed.material, receivedQuantity: removed.receivedQuantity });
                }
            }
        } else if (removed.type === 'group') {
            const materialsOfGroup = this._groupDetails[removed.group_id] || [];
            const orderedMaterialsNow = new Set(this.items.filter(i => i.type === 'material').map(i => i.material));
            const groupMaterialsNow = new Set(
                this.items.filter(i => i.type === 'group')
                    .flatMap(i => this._groupDetails[i.group_id] || [])
            );
            for (const mat of materialsOfGroup) {
                const received = this.receivedQuantities[mat] || 0;
                if (received > 0 && !orderedMaterialsNow.has(mat) && !groupMaterialsNow.has(mat)) {
                    this._ghostItems.push({ material: mat, receivedQuantity: received });
                }
            }
        }

        this._refreshItemsView();
        this._refreshDlgTable();
        this._markDirty();
    },

    startEditItem(index) {
        if (!this._itemsDialog) return;
        this._editingItemIndex = index;
        const item = this.items[index];
        if (item.type === 'group') {
            this._dlgItemSelect?.setValue(item.group_id);
            this._lastItemSelection = { type: 'group', id: item.group_id, name: item.group_name || '' };
            const qtyEl = document.getElementById('ordDlgQty');
            if (qtyEl) qtyEl.value = item.group_quantity;
        } else {
            this._dlgItemSelect?.setValue(item.material);
            this._lastItemSelection = { type: 'material', name: String(item.material) };
            const qtyEl = document.getElementById('ordDlgQty');
            if (qtyEl) qtyEl.value = item.quantity;
        }
        this._renderDlgFormActions();
        this._refreshDlgTable();
    },

    cancelEditItem() {
        this._editingItemIndex = null;
        this._clearDlgForm();
        this._renderDlgFormActions();
        this._refreshDlgTable();
    },

    _startEditGhostInDialog(material) {
        this._dlgItemSelect?.setValue(material);
        this._lastItemSelection = { type: 'material', name: String(material) };
        const qtyEl = document.getElementById('ordDlgQty');
        if (qtyEl) { qtyEl.value = ''; qtyEl.focus(); }
        this._editingItemIndex = null;
        this._renderDlgFormActions();
    },

    // ── Renderização ──

    _renderItemsWidget() {
        const container = document.getElementById('ordItemsWidget');
        if (!container) return;
        const readOnly = this._isFormLocked();

        if (this.items.length === 0 && this._ghostItems.length === 0) {
            if (readOnly) {
                container.innerHTML = `<p class="rd-items-empty">Nenhum item adicionado.</p>`;
            } else {
                container.innerHTML = `
                    <button class="rd-items-dashed-btn" onclick="OrdersDetails.openItemsDialog()">
                        <span class="material-symbols-outlined">add</span>
                        Adicionar Itens
                    </button>`;
            }
            return;
        }

        const totalQty = this.items.reduce((sum, item) => {
            if (item.type === 'group') return sum + (item.group_quantity || 0);
            return sum + (item.quantity || 0);
        }, 0);
        const count = this.items.length;
        const names = this.items.map(i => i.type === 'group' ? i.group_name : i.material);
        const matText = names.length <= 2
            ? names.map(n => _esc(n)).join(', ')
            : names.slice(0, 2).map(n => _esc(n)).join(', ') + ` +${names.length - 2} mais`;

        container.innerHTML = `
            <div class="rd-items-summary${!readOnly ? ' rd-items-summary--clickable' : ''}" ${!readOnly ? 'onclick="OrdersDetails.openItemsDialog()"' : ''}>
                <div class="rd-items-summary-left">
                    <i data-lucide="package-2" class="rd-items-summary-icon rd-items-summary-icon--left"></i>
                    <div class="rd-items-summary-info">
                        <span class="rd-items-summary-count">${count} ${count === 1 ? 'item' : 'itens'} · Total: ${totalQty}</span>
                        <span class="rd-items-summary-materials">${matText}</span>
                    </div>
                </div>
                ${!readOnly ? `<i data-lucide="pencil-line" class="rd-items-summary-icon"></i>` : ''}
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons({ nameAttr: 'data-lucide', rootNode: container });
    },

    _refreshDlgTable() {
        if (!this._itemsDataTable) return;
        const rows = [];
        this.items.forEach((item, idx) => {
            rows.push({ ...item, _idx: idx });
        });
        for (const ghost of this._ghostItems) {
            rows.push({ ...ghost, _isGhost: true });
        }
        if (this.items.length > 0) {
            const grandTotal = this.items.reduce((sum, item) => {
                if (item.type === 'group') return sum + (item.group_quantity || 0);
                return sum + (item.quantity || 0);
            }, 0);
            rows.push({ _isTotal: true, _grandTotal: grandTotal });
        }
        this._itemsDataTable.setData(rows);
    },

    _refreshItemsView() {
        const totalQty = this.items.reduce((sum, item) => {
            if (item.type === 'group') return sum + (item.group_quantity || 0);
            return sum + (item.quantity || 0);
        }, 0);
        const totalReceivedQty = this.items.reduce((sum, item) => sum + (item.receivedQuantity || 0), 0);

        const qtyEl = document.getElementById('orderQty');
        if (qtyEl) qtyEl.textContent = totalQty;

        const recvEl = document.getElementById('orderReceivedQty');
        if (recvEl) recvEl.textContent = isNaN(totalReceivedQty) ? '-' : totalReceivedQty;

        let diffHtml = '-';
        if (totalReceivedQty > 0 && totalQty > 0) {
            const diffPct = Math.round(((totalReceivedQty / totalQty) - 1) * 100);
            const sign = diffPct >= 0 ? '+' : '';
            const color = diffPct >= 0 ? '#2e7d32' : '#c62828';
            diffHtml = `<span style="color:${color};font-weight:600">${sign}${diffPct}%</span>`;
        }
        const diffEl = document.getElementById('orderDiff');
        if (diffEl) diffEl.innerHTML = diffHtml;

        this._renderItemsWidget();
    },

    _renderActionBar() {
        const bar = document.getElementById('ordActionBar');
        if (!bar) return;

        const headerOptions = document.getElementById('headerOptionsContent');
        if (headerOptions) headerOptions.innerHTML = '';

        bar.innerHTML = '';
        const inner = document.createElement('div');
        inner.className = 'rd-action-bar-inner';
        bar.appendChild(inner);

        const BTN_MIN_W = '6.5rem';

        const exitBtn = createButton({
            label: 'Sair',
            variant: 'cancel',
            onClick: () => OrdersDetails._exitScreen(),
        });
        exitBtn.el.style.minWidth = BTN_MIN_W;
        inner.appendChild(exitBtn.el);

        const isEditing = !!Orders.selectedOrder;
        if (isEditing) {
            if (hasPermission('procurement', 'orders', 'edit')) {
                const saveBtn = createButton({
                    label: 'Salvar',
                    variant: 'primary',
                    icon: 'check',
                    onClick: () => OrdersDetails.editOrder(),
                });
                saveBtn.el.style.minWidth = BTN_MIN_W;
                inner.appendChild(saveBtn.el);
            }
        } else {
            if (hasPermission('procurement', 'orders', 'create')) {
                const createBtn = createButton({
                    label: 'Criar Pedido',
                    variant: 'primary',
                    icon: 'check',
                    onClick: () => OrdersDetails.save(),
                });
                createBtn.el.style.minWidth = BTN_MIN_W;
                inner.appendChild(createBtn.el);
            }
        }
    },

    _updateHeaderFields() {
        const supplierName = this._supplierSelect?.getValue() || '-';
        const statusLabels = { 'OPEN': 'Aberto', 'CLOSED': 'Fechado', 'CANCELLED': 'Cancelado' };
        const statusText = statusLabels[this._statusToggle?.getValue()] || '-';

        const supplierEl = document.getElementById('orderSupplierName');
        const statusEl = document.getElementById('orderStatusLabel');
        if (supplierEl) supplierEl.textContent = supplierName;
        if (statusEl) statusEl.textContent = statusText;

        this._updateRequiredIndicators();
    },

    _updateRequiredIndicators() {
        const reqSupplier = document.getElementById('reqSupplier');
        const reqDate = document.getElementById('reqDate');
        if (reqSupplier) reqSupplier.style.visibility = this._supplierSelect?.getValue() ? 'hidden' : 'visible';
        if (reqDate) reqDate.style.visibility = document.getElementById('orderDate')?.value ? 'hidden' : 'visible';
    },

    // ── Utilitários Privados ──

    _getOrderData() {
        return {
            id: document.getElementById("orderCode").value,
            supplier: this._supplierSelect?.getValue() || '',
            date: document.getElementById("orderDate").value,
            due_date: document.getElementById("orderDue").value,
            expected_date: document.getElementById("orderExpected").value,
            status: this._statusToggle?.getValue() || 'OPEN',
        };
    },

    async _saveOrderItems(orderId) {
        for (const item of this.items) {
            const itemData = item.type === 'group'
                ? { order_id: orderId, group_id: item.group_id, group_quantity: item.group_quantity }
                : { order_id: orderId, material: item.material, quantity: item.quantity };
            try {
                await apiCall(API + "/orders/items", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(itemData)
                });
            } catch (error) {
                console.error("Erro ao salvar item:", error);
            }
        }
    },

    async _getNextOrderCode() {
        try {
            const orders = await apiCall(API + "/orders");
            if (!orders || orders.length === 0) return 1;
            return Math.max(...orders.map(o => o.id)) + 1;
        } catch (error) {
            return 1;
        }
    },
};
