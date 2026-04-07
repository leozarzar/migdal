/**
 * ── orders.js ──
 * Tela de listagem de pedidos de compra.
 * Exibe pedidos com filtro por fornecedor, quantidades e lead time.
 */
const Orders = {

    // ── Estado ──

    selectedOrder: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela e reseta a seleção. */
    render() {
        this.selectedOrder = null;
        return `
        <div class="orders-container">
            <div class="orders-card">
                <div class="orders-filters">
                    <select id="filterSupplier" onchange="Orders.load()">
                        <option value="">Fornecedor</option>
                    </select>
                </div>
                <div class="orders-table-container">
                    <table class="orders-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Data</th>
                                <th>Fornecedor</th>
                                <th class="header-qty">Quantidade</th>
                                <th>Prazo</th>
                                <th>Previsão</th>
                                <th class="header-qtyr">Qtd. R.</th>
                                <th class="header-wait"><span class="material-symbols-outlined">schedule</span></th>
                                <th>Dif %</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="tableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    },

    /** Inicializa a tela: configura header, carrega e renderiza pedidos. */
    async load() {
        this._setHeaderOptions();
        try {
            const orders = await apiCall(API + "/orders");
            populateSelect(orders, "filterSupplier", "supplier", "Fornecedor");
            await this._renderTable(orders);
        } catch (error) {
            alert("Erro ao carregar pedidos");
        }
    },

    // ── Ações Públicas ──

    /** Navega para a tela de criação de novo pedido. */
    newOrder() {
        showScreen('order-details');
    },

    /** Seleciona um pedido e navega para a tela de detalhes. */
    selectOrder(order, tr) {
        this.selectedOrder = order;
        showScreen('order-details');
    },

    /** Deleta um pedido após confirmação do usuário. */
    async deleteOrder(event, id) {
        event.stopPropagation();
        
        if (!confirm("Tem certeza que deseja deletar?")) return;

        try {
            await apiCall(API + `/orders/${id}`, { method: "DELETE" });
            this.load();
        } catch (error) {
            alert("Erro ao deletar pedido");
        }
    },

    // ── Renderização ──

    /** Renderiza a tabela de pedidos aplicando o filtro de fornecedor. */
    async _renderTable(orders) {
        const supplier = document.getElementById("filterSupplier").value;
        const tbody = document.getElementById("tableBody");
        tbody.innerHTML = "";

        const filtered = orders
            .filter(order => !supplier || order.supplier === supplier);

        const receipts = await apiCall(API + "/receipts");

        for (const order of filtered) {
            try {
                const tr = await this._createTableRow(order, receipts);
                tr.onclick = () => this.selectOrder(order, tr);
                tbody.appendChild(tr);
            } catch (error) {
                console.error(`Erro ao processar pedido ${order.id}:`, error);
            }
        }

        if (tbody.children.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="11" class="empty-state">Nenhum pedido encontrado.</td>`;
            tbody.appendChild(tr);
        }
    },

    /** Cria uma linha <tr> com dados calculados do pedido. */
    async _createTableRow(order, receipts) {
        const tr = document.createElement("tr");
        
        const orderItems = await apiCall(API + `/orders/items/${order.id}`);
        const orderBags = await apiCall(API + `/orders/${order.id}/stock-units`);

        const totalQty = sumProperty(orderItems, "quantity");
        const receivedQty = sumProperty(orderBags, "weight");
        const differencePercent = totalQty > 0 ? Math.round(((receivedQty / totalQty) - 1) * 100) : 0;

        // Cálculo do lead time ponderado por quantidade recebida
        const startDate = order.date ? new Date(order.date) : null;
        let leadTime = '';
        if (startDate) {
            const linkedReceipts = receipts.filter(r => String(r.order_id) === String(order.id));
            if (linkedReceipts.length > 0) {
                // Agrupa peso por recebimento para cálculo da média ponderada
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
                // Sem recebimentos: dias desde a data do pedido até hoje
                leadTime = Math.round((new Date() - startDate) / (1000 * 60 * 60 * 24));
            }
        }

        // Formata datas de YYYY-MM-DD para DD/MM/YY
        tr.innerHTML = `
            <td class="orders-col-code">#${order.id}</td>
            <td class="orders-col-date">${order.date ? order.date.split('-').reverse().join('/').replace(/^(\d{2}\/\d{2}\/)\d{2}(\d{2})$/, '$1$2') : ''}</td>
            <td class="orders-col-supplier">${order.supplier}</td>
            <td class="orders-col-qty">${totalQty}</td>
            <td class="orders-col-due">${order.due_date ? order.due_date.split('-').reverse().join('/').replace(/^(\d{2}\/\d{2}\/)\d{2}(\d{2})$/, '$1$2') : ''}</td>
            <td class="orders-col-expected">${order.expected_date ? order.expected_date.split('-').reverse().join('/').replace(/^(\d{2}\/\d{2}\/)\d{2}(\d{2})$/, '$1$2') : ''}</td>
            <td class="orders-col-qtyr">${receivedQty > 0 ? receivedQty : ''}</td>
            <td class="orders-col-lt">${leadTime !== '' ? leadTime + 'd' : ''}</td>
            <td class="orders-col-dif">${(() => {
                if (!receivedQty || receivedQty === 0 || !totalQty) return '';
                const sign = differencePercent >= 0 ? '+' : '';
                const color = differencePercent >= 0 ? '#2e7d32' : '#c62828';
                return `<span style="color:${color};font-weight:600">${sign}${differencePercent}%</span>`;
            })()}</td>
            <td class="orders-col-status">${order.status}</td>
            <td class="orders-col-actions">
                <button onclick="Orders.deleteOrder(event,${order.id})">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        `;

        return tr;
    },

    /** Injeta botões de ação no header da página. */
    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        headerOptions.innerHTML = `
            <button class="btn-new" onclick="Orders.newOrder()">
                <span class="material-symbols-outlined">add</span>
                Novo Pedido
            </button>
        `;
    },
};
