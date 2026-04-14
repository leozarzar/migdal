/**
 * orders-details.js
 * Tela de detalhes de Pedido — criação, edição e gerenciamento de itens do pedido.
 */
const OrdersDetails = {

    // ── Estado ──

    /** Lista de itens do pedido atual */
    items: [],

    /** Instância do SearchSelect para seleção de material/grupo */
    _itemSelect: null,

    /** Instância do SearchSelect para seleção de fornecedor */
    _supplierSelect: null,

    /** Indica se há alterações não salvas */
    _isDirty: false,

    /** Índice do item sendo editado inline (null = nenhum em edição) */
    _editingItemIndex: null,

    /**
     * Materiais recebidos vinculados ao pedido mas não presentes em `items`.
     * Exibidos como linhas fantasma clicáveis.
     * @type {Array<{material: string, receivedQuantity: number}>}
     */
    _ghostItems: [],

    /** Materiais por grupo_id, carregados na render() e usados para calcular ghosts ao deletar */
    _groupDetails: {},

    // ── Ciclo de Vida ──

    /** Retorna o template HTML e carrega itens/quantidades recebidas (se editando) */
    async render() {
        this.items = [];
        this.receivedQuantities = {};
        this._editingItemIndex = null;
        this._ghostItems = [];
        this._groupDetails = {};
        this._itemSelect?.destroy(); this._itemSelect = null;
        this._supplierSelect?.destroy(); this._supplierSelect = null;

        if (Orders.selectedOrder) {
            try {
                // Carrega os itens do pedido selecionado
                const orderItems = await apiCall(API + `/orders/items/${Orders.selectedOrder.id}`);
                this.items = orderItems.map(i => {
                    if (i.group_id != null || i.group_quantity != null) {
                        return { type: 'group', group_id: i.group_id, group_name: i.group_name, group_quantity: i.group_quantity };
                    }
                    return { type: 'material', material: i.material, quantity: i.quantity, receivedQuantity: 0 };
                });

                // Carrega os bags vinculados ao pedido para calcular quantidades recebidas
                const bags = await apiCall(API + `/orders/${Orders.selectedOrder.id}/stock-units`);
                if (bags && bags.length > 0) {
                    // Agrupa peso total por material a partir dos bags
                    const materialQuantities = {};
                    bags.forEach(bag => {
                        const material = bag.material;
                        materialQuantities[material] = (materialQuantities[material] || 0) + bag.weight;
                    });

                    // Atribui a quantidade recebida a cada item do tipo material
                    this.items = this.items.map(item => {
                        if (item.type === 'group') return item;
                        return { ...item, receivedQuantity: materialQuantities[item.material] || 0 };
                    });
                    this.receivedQuantities = materialQuantities;

                    // Busca os materiais de cada grupo via API para calcular recebido por grupo
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
                    // Soma as quantidades recebidas dos materiais pertencentes a cada grupo
                    this.items = this.items.map(item => {
                        if (item.type !== 'group') return item;
                        const materialNames = groupDetails[item.group_id] || [];
                        const received = materialNames.reduce((sum, name) => sum + (materialQuantities[name] || 0), 0);
                        return { ...item, receivedQuantity: received };
                    });

                    // Calcula ghost rows: recebidos mas não listados nos itens do pedido
                    // Exclui materiais já presentes como item direto OU pertencentes a um grupo incluído
                    const orderedMaterials = new Set(this.items.filter(i => i.type === 'material').map(i => i.material));
                    const groupMaterials = new Set(
                        Object.values(groupDetails).flat()
                    );
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
            <div class="order-header">
                <h1>Pedido <span id="orderTitleCode">-</span></h1>
                <div class="order-meta">
                    <span>Fornecedor: <span id="orderSupplierName">-</span>  |  </span>
                    <span>Status: <span id="orderStatusLabel">-</span>  |  </span>
                    <span>Qtd: <span id="orderQty">0</span>  |  </span>
                    <span>Recebido: <span id="orderReceivedQty">0</span>  |  </span>
                    <span>Dif %: <span id="orderDiff">-</span></span>
                </div>
            </div>

            <div class="orders-details-cards-row">
                <div class="details-card">
                    <div class="card-header">
                        <h2>Informações Básicas</h2>
                    </div>
                    <div class="card-content">
                        <div class="form-group">
                            <label for="orderSupplier">Fornecedor <span class="required" id="reqSupplier">*</span></label>
                            <div class="select-with-btn">
                                <div id="orderSupplierContainer"></div>
                                <button class="btn-open-tab" onclick="openNewTab('suppliers')" title="Abrir cadastro de fornecedores em nova aba">
                                    <span class="material-symbols-outlined">open_in_new</span>
                                </button>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="orderStatus">Status</label>
                            <select id="orderStatus" class="form-control" onchange="OrdersDetails._updateHeaderFields()" disabled>
                                <option value="OPEN">Aberto</option>
                                <option value="CLOSED">Fechado</option>
                                <option value="CANCELLED">Cancelado</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="details-card">
                    <div class="card-header">
                        <h2>Datas</h2>
                    </div>
                    <div class="card-content">
                        <div class="form-group">
                            <label for="orderDate">Data do Pedido <span class="required" id="reqDate">*</span></label>
                            <input type="date" id="orderDate" class="form-control" onchange="OrdersDetails._updateRequiredIndicators()">
                        </div>
                        <div class="form-group">
                            <label for="orderExpected">Previsão</label>
                            <input type="date" id="orderExpected" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="orderDue">Prazo Limite</label>
                            <input type="date" id="orderDue" class="form-control">
                        </div>
                    </div>
                </div>
            </div>

            <div class="orders-details-items">
                <div class="details-card">
                    <div class="card-header">
                        <h2>Itens do Pedido</h2>
                    </div>
                    <div class="card-content">
                        <div class="item-form-section">
                            <div class="item-form-wrapper">
                                <div class="orders-details-item-form">
                                    <div class="select-with-btn">
                                        <div id="itemSelectContainer"></div>
                                        <button class="btn-open-tab" onclick="openNewTab('materials')" title="Abrir cadastro de materiais em nova aba">
                                            <span class="material-symbols-outlined">open_in_new</span>
                                        </button>
                                    </div>
                                    <input id="itemQuantity" placeholder="Quantidade" class="form-control">
                                </div>
                                <div class="item-form-btns">
                                    <button id="ordersDetailsAddBtn" class="btn-add" onclick="OrdersDetails.addItem()"><span class="material-symbols-outlined">playlist_add</span>Adicionar</button>
                                    <button id="ordersDetailsCancelEditBtn" class="btn-cancel-edit" onclick="OrdersDetails.cancelEditItem()" style="display:none">Cancelar</button>
                                </div>
                            </div>
                        </div>

                        <div class="orders-details-table-container">
                            <table class="orders-details-table">
                                <thead>
                                    <tr>
                                        <th class="col-material">Material</th>
                                        <th class="col-qty">Quantidade</th>
                                        <th class="col-received">Recebido</th>
                                        <th class="col-actions"></th>
                                    </tr>
                                </thead>
                                <tbody id="ordersItemsBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    },

    /** Marca o formulário como modificado */
    _markDirty() { this._isDirty = true; },

    /** Permite ao router verificar se pode navegar para outra tela */
    async canLeave() {
        if (!this._isDirty) return true;
        return confirm('Você tem alterações não salvas. Deseja sair sem salvar?');
    },

    /** Inicializa a tela: popula selects, preenche campos do pedido selecionado */
    async load() {
        this._isDirty = false;
        this._itemSelect = createSearchSelect({
            id: 'orderItem',
            placeholder: 'Selecione material ou grupo',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [
                { key: 'material', label: 'Materiais', items: [] },
                { key: 'group',    label: 'Grupos',    items: [] }
            ],
            onChange: ({ key, value, label }) => {
                // Se material já existe na lista, entrar automaticamente em modo de edição
                if (key === 'material') {
                    const idx = this.items.findIndex(i => i.type === 'material' && i.material === label);
                    if (idx !== -1) { this.startEditItem(idx); return; }
                } else if (key === 'group') {
                    const idx = this.items.findIndex(i => i.type === 'group' && i.group_id === Number(value));
                    if (idx !== -1) { this.startEditItem(idx); return; }
                }
                // Ghost selecionado via select: apenas carrega o select, sem edição
            }
        });
        this._itemSelect.mount(document.getElementById('itemSelectContainer'));

        this._supplierSelect = createSearchSelect({
            id: 'orderSupplier',
            placeholder: 'Selecione um fornecedor',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [{ key: 'supplier', items: [] }],
            onChange: () => { OrdersDetails._updateHeaderFields(); OrdersDetails._markDirty(); }
        });
        this._supplierSelect.mount(document.getElementById('orderSupplierContainer'));

        await this._refreshSelects();

        this._setHeaderOptions();
        this._updateRequiredIndicators();

        if (Orders.selectedOrder) {
            document.getElementById("orderTitleCode").textContent = `#${Orders.selectedOrder.id}`;
            if (Orders.selectedOrder.supplier) this._supplierSelect.select('supplier', Orders.selectedOrder.supplier);
            document.getElementById("orderDate").value = Orders.selectedOrder.date;
            document.getElementById("orderExpected").value = Orders.selectedOrder.expected_date;
            document.getElementById("orderDue").value = Orders.selectedOrder.due_date;
            document.getElementById("orderStatus").value = Orders.selectedOrder.status;
            document.getElementById("orderStatus").disabled = false;
        } else {
            const nextId = await this._getNextOrderCode();
            document.getElementById("orderTitleCode").textContent = `#${nextId}`;
            document.getElementById("orderStatus").value = 'OPEN';
            document.getElementById("orderStatus").disabled = true;
        }

        this._updateHeaderFields();

        // Calcula total de quantidade pedida (materiais + grupos)
        const totalQty = this.items.reduce((sum, item) => {
            if (item.type === 'group') return sum + (item.group_quantity || 0);
            return sum + (item.quantity || 0);
        }, 0);
        document.getElementById("orderQty").textContent = totalQty;

        // Calcula total de quantidade recebida via bags
        const totalReceivedQty = this.items.reduce((sum, item) => {
            return sum + (item.receivedQuantity || 0);
        }, 0);
        document.getElementById("orderReceivedQty").textContent = isNaN(totalReceivedQty) ? '-' : totalReceivedQty;

        // Calcula e exibe o percentual de diferença entre recebido e pedido
        let diffHtml = '-';
        if (totalReceivedQty > 0 && totalQty > 0) {
            const diffPct = Math.round(((totalReceivedQty / totalQty) - 1) * 100);
            const sign = diffPct >= 0 ? '+' : '';
            const color = diffPct >= 0 ? '#2e7d32' : '#c62828';
            diffHtml = `<span style="color:${color};font-weight:600">${sign}${diffPct}%</span>`;
        }
        document.getElementById("orderDiff").innerHTML = diffHtml;

        this._renderItems();

        // Marca o form como sujo em qualquer alteração de campo
        document.querySelectorAll('#content input, #content select, #content textarea')
            .forEach(el => el.addEventListener('change', () => this._markDirty()));
    },

    async _refreshSelects() {
        if (!this._itemSelect || !this._supplierSelect) return;
        try {
            const [materials, suppliers, groups] = await Promise.all([
                apiCall(API + "/materials"),
                apiCall(API + "/suppliers"),
                apiCall(API + "/groups").catch(() => [])
            ]);
            this._itemSelect.setItems('material', (materials || []).map(m => ({ value: m.name, label: m.name })));
            this._itemSelect.setItems('group',    (groups   || []).map(g => ({ value: g.id,   label: g.name })));
            this._supplierSelect.setItems('supplier', (suppliers || []).map(s => ({ value: s.name, label: s.name })));
        } catch (e) { /* falha silenciosa em background */ }
    },

    async onTabFocus() { await this._refreshSelects(); },

    // ── Ações Públicas ──

    /** Salva um novo pedido */
    async save() {
        const orderData = this._getOrderData();

        if (!isAllFieldsFilled(orderData)) {
            alert("Erro: Campo sem preenchimento.");
            return;
        }

        if (this.items.length === 0) {
            alert("Erro: Nenhum item lançado.");
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
            alert("Pedido salvo com sucesso");
            showScreen('orders');
        } catch (error) {
            alert("Erro ao salvar pedido");
        }
    },

    /** Atualiza um pedido existente */
    async editOrder() {
        const orderData = this._getOrderData();

        if (!isAllFieldsFilled(orderData)) {
            alert("Erro: Campo sem preenchimento.");
            return;
        }

        if (this.items.length === 0) {
            alert("Erro: Nenhum item lançado.");
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
            alert("Pedido atualizado com sucesso");
            showScreen('orders');
        } catch (error) {
            alert("Erro ao atualizar pedido");
        }
    },

    /** Adiciona ou atualiza um item (material ou grupo) no pedido */
    addItem() {
        const selected = this._itemSelect && this._itemSelect.getValue();
        const quantity = document.getElementById("itemQuantity").value;

        if (!selected || !quantity) {
            alert("Preencha todos os campos do item");
            return;
        }

        if (this._editingItemIndex !== null) {
            // Modo edição: atualiza item existente no índice
            const orig = this.items[this._editingItemIndex];
            if (orig.type === 'group') {
                this.items[this._editingItemIndex] = { ...orig, group_quantity: Number(quantity) };
            } else {
                this.items[this._editingItemIndex] = { ...orig, quantity: Number(quantity) };
            }
            this._editingItemIndex = null;
            this._restoreAddBtn();
        } else {
            if (selected.key === 'group') {
                this.items.push({
                    type: 'group',
                    group_id: Number(selected.value),
                    group_name: selected.label,
                    group_quantity: Number(quantity)
                });
            } else {
                // Verificar se ghost: preservar receivedQuantity
                const ghost = this._ghostItems.find(g => g.material === selected.label);
                const newItem = {
                    type: 'material',
                    material: selected.label,
                    quantity: Number(quantity),
                    receivedQuantity: ghost ? ghost.receivedQuantity : 0
                };
                this.items.push(newItem);
                // Remover da lista de ghosts
                this._ghostItems = this._ghostItems.filter(g => g.material !== selected.label);
            }
        }

        document.getElementById("itemQuantity").value = '';
        if (this._itemSelect) this._itemSelect.clear();
        this._refreshItemsView();
        this._markDirty();
    },

    /** Remove um item pelo índice */
    deleteItem(index) {
        if (this._editingItemIndex === index) {
            this._editingItemIndex = null;
            this._restoreAddBtn();
        } else if (this._editingItemIndex !== null && this._editingItemIndex > index) {
            this._editingItemIndex -= 1;
        }

        const removed = this.items[index];
        this.items.splice(index, 1);

        // Recomputa ghosts após remoção
        if (removed.type === 'material') {
            // Material removido com recebimento: promove a ghost se não coberto por grupo restante
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
            // Grupo removido: verifica quais materiais do grupo devem virar ghosts
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
        this._markDirty();
    },

    /** Ativa modo de edição inline para o item no índice indicado */
    startEditItem(index) {
        this._editingItemIndex = index;
        const item = this.items[index];
        if (item.type === 'group') {
            this._itemSelect?.select('group', item.group_id);
            document.getElementById('itemQuantity').value = item.group_quantity;
        } else {
            this._itemSelect?.select('material', item.material);
            document.getElementById('itemQuantity').value = item.quantity;
        }
        const addBtn = document.getElementById('ordersDetailsAddBtn');
        if (addBtn) addBtn.innerHTML = '<span class="material-symbols-outlined">stylus</span>Editar Item';
        const cancelBtn = document.getElementById('ordersDetailsCancelEditBtn');
        if (cancelBtn) cancelBtn.style.display = '';
        this._renderItems();
    },

    /** Ativa modo de adição a partir de um ghost row */
    startEditGhost(material) {
        this._itemSelect?.select('material', material);
        document.getElementById('itemQuantity').value = '';
        document.getElementById('itemQuantity').focus();
    },

    /** Cancela o modo de edição e restaura o formulário */
    cancelEditItem() {
        this._editingItemIndex = null;
        this._restoreAddBtn();
        this._itemSelect?.clear();
        document.getElementById('itemQuantity').value = '';
        this._renderItems();
    },

    /** Restaura o botão de adicionar e oculta o botão cancelar */
    _restoreAddBtn() {
        const addBtn = document.getElementById('ordersDetailsAddBtn');
        if (addBtn) addBtn.innerHTML = '<span class="material-symbols-outlined">playlist_add</span>Adicionar';
        const cancelBtn = document.getElementById('ordersDetailsCancelEditBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    },

    /** Volta para a tela de pedidos */
    cancel() {
        showScreen('orders');
    },

    // ── Renderização ──

    /** Renderiza a tabela de itens do pedido */
    _renderItems() {
        const tbody = document.getElementById("ordersItemsBody");
        tbody.innerHTML = "";

        if (this.items.length === 0 && this._ghostItems.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="4" class="empty-state">Nenhum item adicionado. Preencha o formulário acima e clique em Adicionar.</td>`;
            tbody.appendChild(tr);
            return;
        }

        this.items.forEach((item, index) => {
            const isEditing = this._editingItemIndex === index;
            let tr;
            if (item.type === 'group') {
                tr = createTableRow(`
                    <td><span class="item-group-badge">Grupo</span> ${item.group_name}</td>
                    <td class="col-qty">${item.group_quantity}</td>
                    <td class="col-received">${item.receivedQuantity || ''}</td>
                    <td class="orders-details-col-actions">
                        <button class="btn-action btn-delete" onclick="event.stopPropagation(); OrdersDetails.deleteItem(${index})" title="Remover item">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </td>
                `);
            } else {
                tr = createTableRow(`
                    <td>${item.material}</td>
                    <td class="col-qty">${item.quantity}</td>
                    <td class="col-received">${item.receivedQuantity || ''}</td>
                    <td class="orders-details-col-actions">
                        <button class="btn-action btn-delete" onclick="event.stopPropagation(); OrdersDetails.deleteItem(${index})" title="Remover item">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </td>
                `);
            }
            tr.style.cursor = 'pointer';
            tr.onclick = () => OrdersDetails.startEditItem(index);
            if (isEditing) tr.classList.add('orders-details-item-editing');
            tbody.appendChild(tr);
        });

        // Ghost rows: recebidos mas não pedidos
        for (const ghost of this._ghostItems) {
            const tr = createTableRow(`
                <td class="orders-details-ghost-name">${ghost.material}</td>
                <td class="col-qty">—</td>
                <td class="col-received">${ghost.receivedQuantity}</td>
                <td class="orders-details-col-actions"></td>
            `);
            tr.classList.add('orders-details-ghost-row');
            tr.title = 'Material recebido mas não adicionado ao pedido. Clique para adicionar.';
            tr.onclick = () => OrdersDetails.startEditGhost(ghost.material);
            tbody.appendChild(tr);
        }
    },

    /** Atualiza resumo do header e tabela de itens sem recarregar o formulário */
    _refreshItemsView() {
        // Calcula total de quantidade pedida (materiais + grupos)
        const totalQty = this.items.reduce((sum, item) => {
            if (item.type === 'group') return sum + (item.group_quantity || 0);
            return sum + (item.quantity || 0);
        }, 0);
        document.getElementById("orderQty").textContent = totalQty;

        // Calcula total de quantidade recebida via bags
        const totalReceivedQty = this.items.reduce((sum, item) => {
            return sum + (item.receivedQuantity || 0);
        }, 0);
        document.getElementById("orderReceivedQty").textContent = isNaN(totalReceivedQty) ? '-' : totalReceivedQty;

        // Calcula e exibe o percentual de diferença entre recebido e pedido
        let diffHtml = '-';
        if (totalReceivedQty > 0 && totalQty > 0) {
            const diffPct = Math.round(((totalReceivedQty / totalQty) - 1) * 100);
            const sign = diffPct >= 0 ? '+' : '';
            const color = diffPct >= 0 ? '#2e7d32' : '#c62828';
            diffHtml = `<span style="color:${color};font-weight:600">${sign}${diffPct}%</span>`;
        }
        document.getElementById("orderDiff").innerHTML = diffHtml;

        this._renderItems();
    },

    /** Define o botão de ação (Salvar / Editar) no header */
    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        const isEditing = !!Orders.selectedOrder;
        headerOptions.innerHTML = `
            <button class="btn-primary" onclick="OrdersDetails.${isEditing ? 'editOrder' : 'save'}()">${isEditing ? 'Editar' : 'Salvar'}</button>
        `;
    },

    /** Atualiza os textos de fornecedor e status exibidos no header */
    _updateHeaderFields() {
        const statusEl = document.getElementById("orderStatus");
        const supplierName = this._supplierSelect?.getValue()?.label;
        const statusText = statusEl?.options[statusEl.selectedIndex]?.text;

        const supplierNameEl = document.getElementById("orderSupplierName");
        const statusLabelEl = document.getElementById("orderStatusLabel");

        if (supplierNameEl) supplierNameEl.textContent = supplierName || '-';
        if (statusLabelEl) statusLabelEl.textContent = statusText || '-';

        this._updateRequiredIndicators();
    },

    /** Oculta/exibe indicadores de campo obrigatório conforme preenchimento */
    _updateRequiredIndicators() {
        const dateEl = document.getElementById("orderDate");
        const reqSupplier = document.getElementById("reqSupplier");
        const reqDate = document.getElementById("reqDate");

        if (reqSupplier) reqSupplier.style.display = this._supplierSelect?.getValue() ? 'none' : '';
        if (reqDate) reqDate.style.display = (dateEl?.value) ? 'none' : '';
    },

    // ── Utilitários Privados ──

    /** Obtém os dados do formulário de pedido */
    _getOrderData() {
        const titleCode = document.getElementById("orderTitleCode").textContent;
        return {
            id: titleCode.replace('#', '').trim(),
            supplier: this._supplierSelect?.getValue()?.value || '',
            date: document.getElementById("orderDate").value,
            expected_date: document.getElementById("orderExpected").value,
            due_date: document.getElementById("orderDue").value,
            status: document.getElementById("orderStatus").value
        };
    },

    /** Salva todos os itens do pedido via API */
    async _saveOrderItems(orderId) {
        for (const item of this.items) {
            let itemData;
            if (item.type === 'group') {
                itemData = { order_id: orderId, group_id: item.group_id, group_quantity: item.group_quantity };
            } else {
                itemData = { order_id: orderId, material: item.material, quantity: item.quantity };
            }

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

    /** Obtém o próximo ID de pedido disponível */
    async _getNextOrderCode() {
        try {
            const orders = await apiCall(API + "/orders");
            if (!orders || orders.length === 0) {
                return 1;
            }

            // Encontra o maior ID entre os pedidos
            const maxId = Math.max(...orders.map(order => order.id));

            return maxId + 1;
        } catch (error) {
            console.error("Erro ao obter próximo código:", error);
            return 1;
        }
    },

    /** Define o código do pedido no campo com formato #XX baseado no ID */
    async _setOrderCode() {
        const nextId = await this._getNextOrderCode();
        document.getElementById("orderCode").value = `#${nextId}`;
    },
};
