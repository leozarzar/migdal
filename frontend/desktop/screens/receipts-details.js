/**
 * receipts-details.js
 * Tela de detalhes de Recebimento — criação, edição e gerenciamento de itens (bags) do recebimento.
 */
const ReceiptsDetails = {

    // ── Estado ──

    /** Lista de itens do recebimento atual */
    items: [],

    /** Snapshot dos itens originais carregados do banco (para diff na edição) */
    _originalItems: [],

    // ── Ciclo de Vida ──

    /** Retorna o template HTML e carrega itens existentes (se editando) */
    async render() {
        this.items = [];
        this._originalItems = [];

        if (Receipts.selectedReceipt) {
            try {
                const receiptItems = await apiCall(API + `/receipts/items/${Receipts.selectedReceipt.id}`);
                this.items = receiptItems.map(i => ({
                    _stockUnitId: i.id,
                    _originalStatus: i.status,
                    code: i.volume_id == null ? "" : Number(i.volume_id),
                    material: i.material,
                    quantity: i.weight,
                    operator: i.operator || ""
                }));
                // Snapshot imutável para calcular o diff ao salvar
                this._originalItems = [...this.items];
            } catch (error) {
                console.error("Erro ao carregar itens do recebimento:", error);
            }
        }

        return `
        <div class="receipts-details-container">
            <!-- Header com Ações -->
            <div class="receipt-header">
                <h1>Recebimento <span id="receiptTitleCode"></span></h1>

                <div class="receipt-meta">
                    <span id="receiptMetaSupplier" style="display:none">Fornecedor: <span id="receiptSupplierName"></span>  |  </span>
                    <span id="receiptMetaOrder" style="display:none">Pedido: <span id="receiptOrderNumber"></span>  |  </span>
                    <span id="receiptMetaProduction" style="display:none">Produção  |  </span>
                    <span>Quantidade: </span><span class="summary-value" id="receiptQty">0</span>
                </div>
            </div>

            <!-- Cards de Informações -->
            <div class="receipts-details-cards-row">

                <!-- Card 1: Informações Básicas -->
                <div class="details-card">
                    <div class="card-header">
                        <h2>Informações Básicas</h2>
                    </div>
                    <div class="card-content">
                        <div class="form-group">
                            <label for="receiptNature">Natureza <span class="required">*</span></label>
                            <select id="receiptNature" onchange="ReceiptsDetails.updateReceiptCode(); ReceiptsDetails._updateHeaderFields()" class="form-control">
                                <option value="">Selecione a natureza</option>
                                <option value="C">Compra</option>
                                <option value="S">Retorno de Serviço</option>
                                <option value="P">Produção</option>
                            </select>
                        </div>
                        <input type="hidden" id="receiptCode">
                    </div>
                </div>

                <!-- Card 2: Informações de Compra/Retorno -->
                <div class="details-card" id="supplierPurchaseCard" style="display:none">
                    <div class="card-header">
                        <h2>Detalhes do Recebimento</h2>
                    </div>
                    <div class="card-content">
                        <div class="form-group">
                            <label for="receiptSupplier">Fornecedor <span class="required">*</span></label>
                            <select id="receiptSupplier" onchange="ReceiptsDetails.onSupplierChange(); ReceiptsDetails._updateHeaderFields()" class="form-control">
                                <option value="">Selecione um fornecedor</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="receiptDate">Data Recebimento <span class="required">*</span></label>
                            <input type="date" id="receiptDate" class="form-control" onchange="ReceiptsDetails._updateRequiredIndicators()">
                        </div>
                        <div class="form-group">
                            <label for="receiptOrder">Pedido</label>
                            <select id="receiptOrder" onchange="ReceiptsDetails._updateHeaderFields()" disabled class="form-control">
                                <option value="">Pedido</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Card 3: Detalhes do Fornecimento -->
                <div class="details-card" id="operatorProductionCard" style="display:none">
                    <div class="card-header">
                        <h2>Detalhes do Fornecimento</h2>
                    </div>
                    <div class="card-content">
                        <div class="form-group">
                            <label for="receiptDateProduction">Data Recebimento <span class="required">*</span></label>
                            <input type="date" id="receiptDateProduction" class="form-control" onchange="ReceiptsDetails._updateRequiredIndicators()">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Seção de Itens -->
            <div class="receipts-details-items">
                <div class="details-card">
                    <div class="card-header">
                        <h2>Itens do Recebimento</h2>
                    </div>
                    <div class="card-content">
                        <!-- Formulário de Adicionar Item -->
                        <div class="item-form-wrapper">
                            <div class="receipts-details-item-form">
                                <input id="itemCode" placeholder="Código" type="number" min="0" class="form-control" oninput="ReceiptsDetails.validateItemCode(this)">
                                <select id="itemMaterial" class="form-control">
                                    <option value="">Selecione um material</option>
                                </select>
                                <select id="itemOperator" class="form-control" style="display:none">
                                    <option value="">Selecione um operador</option>
                                </select>
                                <input id="itemQuantity" placeholder="Quantidade" class="form-control">
                            </div>
                            <button class="btn-add" onclick="ReceiptsDetails.addItem()"><span class="material-symbols-outlined">playlist_add</span>Adicionar</button>
                        </div>

                        <!-- Tabela de Itens -->
                        <div class="receipts-details-table-container">
                            <table class="receipts-details-table">
                                <thead>
                                    <tr>
                                        <th class="col-code">Código</th>
                                        <th class="col-material">Material</th>
                                        <th class="col-operator">Operador</th>
                                        <th class="col-qty">Quantidade</th>
                                        <th class="col-actions"></th>
                                    </tr>
                                </thead>
                                <tbody id="receiptsItemsBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    },

    /** Inicializa a tela: popula selects, preenche campos do recebimento selecionado */
    async load() {
        this._setHeaderOptions();
        await this._populateOrderSelect();

        try {
            const materials = await apiCall(API + "/materials");
            populateSelect(materials, "itemMaterial", "name", "Selecione um material");

            const suppliers = await apiCall(API + "/suppliers");
            populateSelect(suppliers, "receiptSupplier", "name", "Selecione um fornecedor");

            const operators = await apiCall(API + "/operators");
            populateSelect(operators, "itemOperator", "name", "Selecione um operador");
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
        }

        if (Receipts.selectedReceipt) {
            const saveBtn = document.getElementById("saveBtn");
            saveBtn.textContent = "Editar";
            saveBtn.onclick = () => this.editReceipt();
            document.getElementById("receiptCode").value = "#" +Receipts.selectedReceipt.nature + Receipts.selectedReceipt.id;

            // Define a natureza e atualiza visibilidade dos cards conforme tipo
            const nature = Receipts.selectedReceipt.nature;
            document.getElementById("receiptNature").value = nature;
            this.updateFormVisibility(nature);

            const dateId = nature === "P" ? "receiptDateProduction" : "receiptDate";
            document.getElementById(dateId).value = Receipts.selectedReceipt.date;
            document.getElementById("receiptSupplier").value = Receipts.selectedReceipt.supplier || "";
            await this.onSupplierChange();
            document.getElementById("receiptOrder").value = Receipts.selectedReceipt.order_id || "";
        } else {
            const saveBtn = document.getElementById("saveBtn");
            saveBtn.textContent = "Salvar";
            saveBtn.onclick = () => this.save();
        }

        this._refreshItemsView();
        this._setNextItemCode();
    },

    // ── Ações Públicas ──

    /** Salva um novo recebimento (mesma validação que editReceipt) */
    async save() {
        const receiptData = this._getReceiptData();

        // Validação de campos obrigatórios — padrão compartilhado com editReceipt()
        const nature = receiptData.nature;
        if (!nature || !receiptData.date) {
            alert("Erro: Natureza e Data são obrigatórios.");
            return;
        }

        if ((nature === "C" || nature === "S") && !receiptData.supplier) {
            alert("Erro: Fornecedor é obrigatório para Compra/Retorno.");
            return;
        }

        if (this.items.length === 0) {
            alert("Erro: Nenhum item lançado.");
            return;
        }

        try {
            await apiCall(API + "/receipts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(receiptData)
            });

            await this._saveBagsFromItems(
                receiptData.id,
                receiptData.supplier,
                receiptData.date,
                receiptData.nature
            );
            alert("Recebimento salvo com sucesso");
            showScreen('receipts');
        } catch (error) {
            alert("Erro ao salvar recebimento");
        }
    },

    /** Atualiza um recebimento existente (mesma validação que save) */
    async editReceipt() {
        const receiptData = this._getReceiptData();

        // Validação de campos obrigatórios — padrão compartilhado com save()
        const nature = receiptData.nature;
        if (!nature || !receiptData.date) {
            alert("Erro: Natureza e Data são obrigatórios.");
            return;
        }

        if ((nature === "C" || nature === "S") && !receiptData.supplier) {
            alert("Erro: Fornecedor é obrigatório para Compra/Retorno.");
            return;
        }

        if (this.items.length === 0) {
            alert("Erro: Nenhum item lançado.");
            return;
        }

        // ── Diff: calcula itens removidos e itens novos ──
        const deletedItems = this._originalItems.filter(orig =>
            !this.items.some(cur => cur._stockUnitId === orig._stockUnitId)
        );
        const newItems = this.items.filter(cur => !cur._stockUnitId);

        // ── Confirmação para itens já baixados que serão deletados ──
        const loweredItems = deletedItems.filter(i => i._originalStatus === 'OUT_STOCK');
        if (loweredItems.length > 0) {
            const list = loweredItems
                .map(i => `  • Código ${i.code} — ${i.material}`)
                .join('\n');
            const confirmed = confirm(
                `Atenção: os itens abaixo já foram baixados do estoque e serão deletados permanentemente:\n\n${list}\n\nDeseja continuar mesmo assim?`
            );
            if (!confirmed) return;
        }

        try {
            await apiCall(API + "/receipts/update", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(receiptData)
            });

            // Deleta somente os itens que foram removidos da lista
            for (const item of deletedItems) {
                await apiCall(API + `/stock-units/${item._stockUnitId}`, { method: "DELETE" });
            }

            // Insere somente os itens que foram adicionados nesta edição
            await this._saveBagsFromItems(
                receiptData.id,
                receiptData.supplier,
                receiptData.date,
                receiptData.nature,
                newItems
            );

            alert("Recebimento atualizado com sucesso");
            showScreen('receipts');
        } catch (error) {
            alert("Erro ao atualizar recebimento");
        }
    },

    /** Adiciona um item ao recebimento */
    addItem() {
        const code = document.getElementById("itemCode").value.trim();
        const material = document.getElementById("itemMaterial").value;
        const quantity = document.getElementById("itemQuantity").value;
        const nature = document.getElementById("receiptNature").value;
        const itemOperator = document.getElementById("itemOperator").value;

        if (!code || !material || !quantity) {
            alert("Preencha todos os campos do item");
            return;
        }

        if (nature === "P" && !itemOperator) {
            alert("Selecione o operador do item");
            return;
        }

        // Valida se o código contém apenas números
        if (!/^\d+$/.test(code)) {
            alert("O código do item deve conter apenas números");
            return;
        }

        const normalizedCode = Number.parseInt(code, 10);

        this.items.push({
            code: normalizedCode,
            material,
            quantity: Number(quantity),
            operator: nature === "P" ? itemOperator : ""
        });

        clearFormInputs(["itemMaterial", "itemOperator", "itemQuantity"]);
        this._setNextItemCode();
        this._refreshItemsView();
    },

    /** Remove um item pelo índice */
    deleteItem(index) {
        this.items.splice(index, 1);
        this._setNextItemCode();
        this._refreshItemsView();
    },

    /** Valida que o campo de código contém apenas dígitos */
    validateItemCode(input) {
        // Remove qualquer caractere que não seja número
        input.value = input.value.replace(/[^\d]/g, '');
    },

    /** Volta para a tela de recebimentos */
    cancel() {
        showScreen('receipts');
    },

    // ── Renderização ──

    /** Renderiza a tabela de itens do recebimento */
    _renderItems() {
        const tbody = document.getElementById("receiptsItemsBody");
        const nature = document.getElementById("receiptNature")?.value;
        const showOperatorColumn = nature === "P";
        tbody.innerHTML = "";

        if (this.items.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="${showOperatorColumn ? 5 : 4}" class="empty-state">Nenhum item adicionado. Preencha o formulário acima e clique em Adicionar.</td>`;
            tbody.appendChild(tr);
            return;
        }

        this.items.forEach((item, index) => {
            const operatorCell = showOperatorColumn
                ? `<td class="col-operator">${item.operator || "-"}</td>`
                : "";
            const tr = createTableRow(`
                <td class="col-code">${item.code}</td>
                <td class="col-material">${item.material}</td>
                ${operatorCell}
                <td class="col-qty">${item.quantity}</td>
                <td class="col-actions">
                    <button class="btn-action btn-delete" onclick="ReceiptsDetails.deleteItem(${index})" title="Remover item">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </td>
            `);
            tbody.appendChild(tr);
        });
    },

    /** Atualiza total e tabela de itens sem recarregar os dados do formulário */
    _refreshItemsView() {
        const totalQty = this.items.reduce((sum, item) => sum + item.quantity, 0);
        document.getElementById("receiptQty").textContent = totalQty;
        this._renderItems();
        this._updateHeaderFields();
        this._updateRequiredIndicators();
    },

    /** Define os botões de ação (Salvar/Editar + Cancelar) no header */
    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        const isSaveMode = !Receipts.selectedReceipt;
        const buttonText = isSaveMode ? "Salvar" : "Editar";
        const buttonAction = isSaveMode ? "ReceiptsDetails.save()" : "ReceiptsDetails.editReceipt()";

        headerOptions.innerHTML = `
            <button id="saveBtn" class="btn-primary" onclick="${buttonAction}">${buttonText}</button>
            <button class="btn-secondary" onclick="ReceiptsDetails.cancel()">Cancelar</button>
        `;
    },

    /** Atualiza os campos exibidos no header conforme natureza selecionada */
    _updateHeaderFields() {
        const code = document.getElementById("receiptCode").value || "-";
        document.getElementById("receiptTitleCode").textContent = code;

        const nature = document.getElementById("receiptNature").value;

        const metaSupplier = document.getElementById("receiptMetaSupplier");
        const metaOrder = document.getElementById("receiptMetaOrder");
        const metaProduction = document.getElementById("receiptMetaProduction");

        // Exibe/oculta meta-informações conforme a natureza (P = produção, C/S = compra/retorno)
        if (nature === "P") {
            if (metaSupplier) metaSupplier.style.display = "none";
            if (metaOrder) metaOrder.style.display = "none";
            if (metaProduction) metaProduction.style.display = "";
        } else if (nature) {
            if (metaSupplier) metaSupplier.style.display = "";
            if (metaOrder) metaOrder.style.display = "";
            if (metaProduction) metaProduction.style.display = "none";

            const supplier = document.getElementById("receiptSupplier").value;
            const supplierName = supplier
                ? document.querySelector(`#receiptSupplier option[value="${supplier}"]`)?.textContent ?? "-"
                : "-";
            document.getElementById("receiptSupplierName").textContent = supplierName;

            const orderId = document.getElementById("receiptOrder").value;
            document.getElementById("receiptOrderNumber").textContent = orderId ? `#${orderId}` : "-";
        } else {
            if (metaSupplier) metaSupplier.style.display = "none";
            if (metaOrder) metaOrder.style.display = "none";
            if (metaProduction) metaProduction.style.display = "none";
        }

        this._updateRequiredIndicators();
    },

    /** Oculta/exibe indicadores de campo obrigatório conforme preenchimento */
    _updateRequiredIndicators() {
        const nature = document.getElementById("receiptNature")?.value;
        const dateFieldId = nature === "P" ? "receiptDateProduction" : "receiptDate";
        const requiredFields = nature === "P"
            ? ["receiptNature", dateFieldId]
            : ["receiptNature", dateFieldId, "receiptSupplier"];
        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (!field) return;
            const label = document.querySelector(`label[for="${fieldId}"]`);
            if (!label) return;
            const span = label.querySelector('.required');
            if (!span) return;
            span.style.visibility = field.value ? 'hidden' : 'visible';
        });
    },

    /** Limpa os botões de ação da barra de header */
    _clearHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        headerOptions.innerHTML = "";
    },

    /** Exibe/oculta a coluna de operador na tabela de itens */
    _toggleOperatorColumn(showOperator) {
        const operatorHeader = document.querySelector(".receipts-details-table thead .col-operator");
        if (operatorHeader) {
            operatorHeader.style.display = showOperator ? "" : "none";
        }
    },

    /** Controla a visibilidade dos cards conforme a natureza selecionada */
    updateFormVisibility(nature) {
        const supplierCard = document.getElementById("supplierPurchaseCard");
        const operatorCard = document.getElementById("operatorProductionCard");
        const itemOperatorField = document.getElementById("itemOperator");

        if (nature === "P") {
            // Produção — mostrar detalhes de fornecimento e operador no item
            supplierCard.style.display = "none";
            operatorCard.style.display = "block";
            if (itemOperatorField) {
                itemOperatorField.style.display = "";
            }
        } else if (nature === "C" || nature === "S") {
            // Compra ou Retorno — mostrar fornecedor/pedido, esconder operador do item
            supplierCard.style.display = "block";
            operatorCard.style.display = "none";
            if (itemOperatorField) {
                itemOperatorField.style.display = "none";
                itemOperatorField.value = "";
            }
        } else {
            // Nenhuma natureza selecionada
            supplierCard.style.display = "none";
            operatorCard.style.display = "none";
            if (itemOperatorField) {
                itemOperatorField.style.display = "none";
                itemOperatorField.value = "";
            }
        }

        this._toggleOperatorColumn(nature === "P");
        this._renderItems();
    },

    /** Atualiza o código do recebimento e visibilidade ao mudar a natureza */
    updateReceiptCode() {
        const nature = document.getElementById("receiptNature").value;
        const prevNature = this._lastNature;

        // Zera itens se a natureza mudou (evita itens inválidos para o novo tipo)
        if (prevNature !== undefined && nature !== prevNature && this.items.length > 0) {
            this.items = [];
        }
        this._lastNature = nature;

        // Atualiza visibilidade dos campos baseado na natureza
        this.updateFormVisibility(nature);

        if (!nature) {
            document.getElementById("receiptCode").value = "";
            this._updateHeaderFields();
            return;
        }

        // Se está editando um recebimento existente, mantém o código original
        if (Receipts.selectedReceipt) {
            document.getElementById("receiptCode").value = `#${nature}${Receipts.selectedReceipt.id}`;
            this._updateHeaderFields();
            return;
        }

        // Para novos recebimentos, busca o próximo ID disponível
        this._getNextReceiptId().then(nextId => {
            document.getElementById("receiptCode").value = `#${nature}${nextId}`;
            this._updateHeaderFields();
        });
    },

    /** Filtra pedidos ao selecionar fornecedor */
    async onSupplierChange() {
        const selectedSupplier = document.getElementById("receiptSupplier").value;
        const selectElement = document.getElementById("receiptOrder");

        // Se nenhum fornecedor for selecionado, desabilita o select
        if (!selectedSupplier) {
            selectElement.disabled = true;
            selectElement.innerHTML = '<option value="">Pedido</option>';
            selectElement.value = "";
            return;
        }

        try {
            const orders = await apiCall(API + "/orders");

            // Filtra pedidos pelo fornecedor selecionado e pelo status aberto
            const filteredOrders = orders.filter(order =>
                order.supplier === selectedSupplier && order.status === "OPEN"
            );

            selectElement.innerHTML = '<option value="">Selecione um pedido</option>';

            if (filteredOrders.length === 0) {
                selectElement.innerHTML += '<option disabled>Nenhum pedido aberto</option>';
                selectElement.disabled = true;
            } else {
                filteredOrders.forEach(order => {
                    const displayText = `#${order.id}`;
                    selectElement.innerHTML += `<option value="${order.id}">${displayText}</option>`;
                });
                selectElement.disabled = false;
            }

            selectElement.value = "";
        } catch (error) {
            console.error("Erro ao filtrar pedidos:", error);
            selectElement.disabled = true;
        }
    },

    /** Popula o select de pedidos com todos os pedidos disponíveis */
    async _populateOrderSelect() {
        try {
            const orders = await apiCall(API + "/orders");

            const selectElement = document.getElementById("receiptOrder");
            const currentValue = selectElement.value;

            selectElement.innerHTML = '<option value="">Pedido</option>';
            orders.forEach(order => {
                const displayText = `#${order.id}`;
                selectElement.innerHTML += `<option value="${order.id}">${displayText}</option>`;
            });

            selectElement.value = currentValue;
        } catch (error) {
            console.error("Erro ao carregar pedidos:", error);
        }
    },

    // ── Utilitários Privados ──

    /** Obtém os dados do formulário de recebimento */
    _getReceiptData() {
        const nature = document.getElementById("receiptNature").value;
        const dateFieldId = nature === "P" ? "receiptDateProduction" : "receiptDate";
        const baseData = {
            id: parseInt(document.getElementById("receiptCode").value.slice(2)),
            nature: nature,
            date: document.getElementById(dateFieldId).value
        };

        if (nature === "P") {
            // Produção — sem fornecedor nem pedido vinculado
            return {
                ...baseData,
                supplier: null,
                order_id: null
            };
        } else {
            // Compra ou Retorno de Serviço
            return {
                ...baseData,
                supplier: document.getElementById("receiptSupplier").value,
                order_id: document.getElementById("receiptOrder").value ? parseInt(document.getElementById("receiptOrder").value) : null,
            };
        }
    },

    /** Salva bags (unidades de estoque) baseado nos itens do recebimento */
    async _saveBagsFromItems(receiptId, supplier, date, nature, items) {
        const itemList = items ?? this.items;
        for (const item of itemList) {
            // Operador só é relevante para natureza Produção
            const operator = nature === "P" ? (item.operator || null) : null;

            const bagData = {
                receipt_id: receiptId,
                volume_id: Number.parseInt(item.code, 10),
                material: item.material,
                weight: parseInt(item.quantity),
                supplier: supplier,
                operator: operator,
                status: "IN_STOCK",
                date_in: date,
                notes: ""
            };

            try {
                await apiCall(API + "/stock-units", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(bagData)
                });
            } catch (error) {
                console.error("Erro ao salvar bag:", error);
            }
        }
    },

    /** Obtém o próximo ID para um novo recebimento */
    async _getNextReceiptId() {
        try {
            const receipts = await apiCall(API + "/receipts");
            if (!receipts || receipts.length === 0) {
                return 1;
            }

            // Encontra o maior ID da tabela
            const maxId = receipts.reduce((max, receipt) => {
                const id = receipt.id || 0;
                return id > max ? id : max;
            }, 0);

            return maxId + 1;
        } catch (error) {
            console.error("Erro ao obter próximo ID:", error);
            return 1;
        }
    },

    /** Obtém o próximo código de item com base nos itens já adicionados */
    _getNextItemCode() {
        if (this.items.length === 0) {
            return 1;
        }

        // Encontra o maior código numérico entre os itens
        const maxCode = Math.max(...this.items.map(item => {
            return parseInt(item.code, 10);
        }));

        return maxCode + 1;
    },

    /** Define o próximo código de item no campo de entrada */
    _setNextItemCode() {
        const nextCode = this._getNextItemCode();
        document.getElementById("itemCode").value = nextCode;
    },
};
