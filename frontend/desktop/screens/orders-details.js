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

    // ── Ciclo de Vida ──

    /** Retorna o template HTML e carrega itens/quantidades recebidas (se editando) */
    async render() {
        this.items = [];
        this.receivedQuantities = {};

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
                    // Soma as quantidades recebidas dos materiais pertencentes a cada grupo
                    this.items = this.items.map(item => {
                        if (item.type !== 'group') return item;
                        const materialNames = groupDetails[item.group_id] || [];
                        const received = materialNames.reduce((sum, name) => sum + (materialQuantities[name] || 0), 0);
                        return { ...item, receivedQuantity: received };
                    });
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
                            <select id="orderSupplier" class="form-control" onchange="OrdersDetails._updateHeaderFields()">
                                <option value="">Selecione um fornecedor</option>
                            </select>
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
                                    <div id="itemSelectContainer"></div>
                                    <input id="itemQuantity" placeholder="Quantidade" class="form-control">
                                </div>
                                <button class="btn-add" onclick="OrdersDetails.addItem()"><span class="material-symbols-outlined">playlist_add</span>Adicionar</button>
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

    /** Inicializa a tela: popula selects, preenche campos do pedido selecionado */
    async load() {
        if (this._itemSelect) this._itemSelect.destroy();
        this._itemSelect = createSearchSelect({
            id: 'orderItem',
            placeholder: 'Selecione material ou grupo',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [
                { key: 'material', label: 'Materiais', items: [] },
                { key: 'group',    label: 'Grupos',    items: [] }
            ]
        });
        this._itemSelect.mount(document.getElementById('itemSelectContainer'));

        try {
            const [materials, suppliers, groups] = await Promise.all([
                apiCall(API + "/materials"),
                apiCall(API + "/suppliers"),
                apiCall(API + "/groups").catch(() => [])
            ]);

            this._itemSelect.setItems('material', (materials || []).map(m => ({ value: m.name, label: m.name })));
            this._itemSelect.setItems('group',    (groups   || []).map(g => ({ value: g.id,   label: g.name })));

            populateSelect(suppliers, "orderSupplier", "name", "Selecione um fornecedor");
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
        }

        this._setHeaderOptions();
        this._updateRequiredIndicators();

        if (Orders.selectedOrder) {
            document.getElementById("orderTitleCode").textContent = `#${Orders.selectedOrder.id}`;
            document.getElementById("orderSupplier").value = Orders.selectedOrder.supplier;
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
    },

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
            alert("Pedido atualizado com sucesso");
            showScreen('orders');
        } catch (error) {
            alert("Erro ao atualizar pedido");
        }
    },

    /** Adiciona um item (material ou grupo) ao pedido */
    addItem() {
        const selected = this._itemSelect && this._itemSelect.getValue();
        const quantity = document.getElementById("itemQuantity").value;

        if (!selected || !quantity) {
            alert("Preencha todos os campos do item");
            return;
        }

        if (selected.key === 'group') {
            this.items.push({
                type: 'group',
                group_id: Number(selected.value),
                group_name: selected.label,
                group_quantity: Number(quantity)
            });
        } else {
            this.items.push({
                type: 'material',
                material: selected.label,
                quantity: Number(quantity)
            });
        }

        document.getElementById("itemQuantity").value = '';
        if (this._itemSelect) this._itemSelect.clear();
        this._refreshItemsView();
    },

    /** Remove um item pelo índice */
    deleteItem(index) {
        this.items.splice(index, 1);
        this._refreshItemsView();
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

        if (this.items.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="4" class="empty-state">Nenhum item adicionado. Preencha o formulário acima e clique em Adicionar.</td>`;
            tbody.appendChild(tr);
            return;
        }

        this.items.forEach((item, index) => {
            let tr;
            if (item.type === 'group') {
                tr = createTableRow(`
                    <td><span class="item-group-badge">Grupo</span> ${item.group_name}</td>
                    <td class="col-qty">${item.group_quantity}</td>
                    <td class="col-received">${item.receivedQuantity || ''}</td>
                    <td class="orders-details-col-actions">
                        <button onclick="OrdersDetails.deleteItem(${index})">
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
                        <button onclick="OrdersDetails.deleteItem(${index})">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </td>
                `);
            }
            tbody.appendChild(tr);
        });
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

    /** Define os botões de ação (Salvar/Editar + Cancelar) no header */
    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        const isEditing = !!Orders.selectedOrder;
        headerOptions.innerHTML = `
            <button class="btn-primary" onclick="OrdersDetails.${isEditing ? 'editOrder' : 'save'}()">${isEditing ? 'Editar' : 'Salvar'}</button>
            <button class="btn-secondary" onclick="OrdersDetails.cancel()">Cancelar</button>
        `;
    },

    /** Atualiza os textos de fornecedor e status exibidos no header */
    _updateHeaderFields() {
        const supplierEl = document.getElementById("orderSupplier");
        const statusEl = document.getElementById("orderStatus");

        const supplierName = supplierEl?.options[supplierEl.selectedIndex]?.text;
        const statusText = statusEl?.options[statusEl.selectedIndex]?.text;

        const supplierNameEl = document.getElementById("orderSupplierName");
        const statusLabelEl = document.getElementById("orderStatusLabel");

        if (supplierNameEl) supplierNameEl.textContent = (supplierName && supplierName !== 'Selecione um fornecedor') ? supplierName : '-';
        if (statusLabelEl) statusLabelEl.textContent = statusText || '-';

        this._updateRequiredIndicators();
    },

    /** Oculta/exibe indicadores de campo obrigatório conforme preenchimento */
    _updateRequiredIndicators() {
        const supplierEl = document.getElementById("orderSupplier");
        const dateEl = document.getElementById("orderDate");

        const reqSupplier = document.getElementById("reqSupplier");
        const reqDate = document.getElementById("reqDate");

        if (reqSupplier) reqSupplier.style.display = (supplierEl?.value) ? 'none' : '';
        if (reqDate) reqDate.style.display = (dateEl?.value) ? 'none' : '';
    },

    // ── Utilitários Privados ──

    /** Obtém os dados do formulário de pedido */
    _getOrderData() {
        const titleCode = document.getElementById("orderTitleCode").textContent;
        return {
            id: titleCode.replace('#', '').trim(),
            supplier: document.getElementById("orderSupplier").value,
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
