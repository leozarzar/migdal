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

    /** Indica se há alterações não salvas */
    _isDirty: false,

    /** Verifica se a tela está em modo somente leitura (sem permissão de edição) */
    _isReadOnly() {
        if (!Receipts.selectedReceipt) return false;
        return !hasPermission('procurement', 'receipts', 'edit');
    },

    /** Índice do item sendo editado inline (null = nenhum em edição) */
    _editingItemIndex: null,

    /** Instâncias dos SearchSelects da tela */
    _supplierSelect: null,
    _materialSelect: null,
    _operatorSelect: null,
    _orderSelect: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML e carrega itens existentes (se editando) */
    async render() {
        this.items = [];
        this._originalItems = [];
        this._supplierSelect?.destroy(); this._supplierSelect = null;
        this._materialSelect?.destroy();  this._materialSelect = null;
        this._operatorSelect?.destroy();  this._operatorSelect = null;
        this._orderSelect?.destroy();     this._orderSelect = null;

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
                            <div class="select-with-btn">
                                <div id="receiptSupplierContainer"></div>
                                <button class="btn-open-tab" onclick="openNewTab('suppliers')" title="Abrir cadastro de fornecedores em nova aba">
                                    <span class="material-symbols-outlined">open_in_new</span>
                                </button>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="receiptDate">Data Recebimento <span class="required">*</span></label>
                            <input type="date" id="receiptDate" class="form-control" onchange="ReceiptsDetails._updateRequiredIndicators()">
                        </div>
                        <div class="form-group">
                            <label for="receiptOrder">Pedido</label>
                            <div class="select-with-btn">
                                <div id="receiptOrderContainer"></div>
                                <button class="btn-open-tab" onclick="openNewTab('orders')" title="Abrir cadastro de pedidos em nova aba">
                                    <span class="material-symbols-outlined">open_in_new</span>
                                </button>
                            </div>
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
                                <div class="select-with-btn">
                                    <div id="itemMaterialContainer"></div>
                                    <button class="btn-open-tab" onclick="openNewTab('materials')" title="Abrir cadastro de materiais em nova aba">
                                        <span class="material-symbols-outlined">open_in_new</span>
                                    </button>
                                </div>
                                <div class="select-with-btn" id="itemOperatorWrapper" style="display:none">
                                    <div id="itemOperatorContainer"></div>
                                    <button class="btn-open-tab" onclick="openNewTab('operators')" title="Abrir cadastro de operadores em nova aba">
                                        <span class="material-symbols-outlined">open_in_new</span>
                                    </button>
                                </div>
                                <input id="itemQuantity" placeholder="Quantidade" class="form-control">
                            </div>
                            <div class="item-form-btns">
                                <button id="receiptsDetailsAddBtn" class="btn-add" onclick="ReceiptsDetails.addItem()"><span class="material-symbols-outlined">playlist_add</span>Adicionar</button>
                                <button id="receiptsDetailsCancelEditBtn" class="btn-cancel-edit" onclick="ReceiptsDetails.cancelEditItem()" style="display:none">Cancelar</button>
                            </div>
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

    /** Marca o formulário como modificado */
    _markDirty() { this._isDirty = true; },

    /** Permite ao router verificar se pode navegar para outra tela */
    async canLeave() {
        if (!this._isDirty) return true;
        return confirm('Você tem alterações não salvas. Deseja sair sem salvar?');
    },

    /** Inicializa a tela: cria SearchSelects, popula dados e preenche campos do recebimento selecionado */
    async load() {
        this._isDirty = false;
        this._setHeaderOptions();

        // Criar e montar SearchSelects
        this._supplierSelect = createSearchSelect({
            id: 'receiptSupplier',
            placeholder: 'Selecione um fornecedor',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [{ key: 'supplier', items: [] }],
            onChange: () => { ReceiptsDetails.onSupplierChange(); ReceiptsDetails._markDirty(); }
        });
        this._supplierSelect.mount(document.getElementById('receiptSupplierContainer'));

        this._orderSelect = createSearchSelect({
            id: 'receiptOrder',
            placeholder: 'Pedido',
            searchable: false,
            sections: [{ key: 'order', items: [] }],
            onChange: () => { ReceiptsDetails._updateHeaderFields(); ReceiptsDetails._markDirty(); }
        });
        this._orderSelect.mount(document.getElementById('receiptOrderContainer'));

        this._materialSelect = createSearchSelect({
            id: 'itemMaterial',
            placeholder: 'Selecione um material',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [{ key: 'material', items: [] }],
            onChange: () => ReceiptsDetails._markDirty()
        });
        this._materialSelect.mount(document.getElementById('itemMaterialContainer'));

        this._operatorSelect = createSearchSelect({
            id: 'itemOperator',
            placeholder: 'Selecione um operador',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [{ key: 'operator', items: [] }],
            onChange: () => ReceiptsDetails._markDirty()
        });
        this._operatorSelect.mount(document.getElementById('itemOperatorContainer'));

        await this._refreshSelects();

        if (Receipts.selectedReceipt) {
            const saveBtn = document.getElementById("saveBtn");
            if (saveBtn) {
                saveBtn.textContent = "Editar";
                saveBtn.onclick = () => this.editReceipt();
            }
            document.getElementById("receiptCode").value = "#" + Receipts.selectedReceipt.nature + Receipts.selectedReceipt.id;

            // Define a natureza e atualiza visibilidade dos cards conforme tipo
            const nature = Receipts.selectedReceipt.nature;
            document.getElementById("receiptNature").value = nature;
            this.updateFormVisibility(nature);

            const dateId = nature === "P" ? "receiptDateProduction" : "receiptDate";
            document.getElementById(dateId).value = Receipts.selectedReceipt.date;
            if (Receipts.selectedReceipt.supplier) this._supplierSelect.select('supplier', Receipts.selectedReceipt.supplier);
            await this.onSupplierChange();
            if (Receipts.selectedReceipt.order_id) this._orderSelect.select('order', Receipts.selectedReceipt.order_id);
        } else {
            const saveBtn = document.getElementById("saveBtn");
            if (saveBtn) {
                saveBtn.textContent = "Salvar";
                saveBtn.onclick = () => this.save();
            }
        }

        this._refreshItemsView();
        this._setNextItemCode();

        // Modo somente leitura: desabilita campos e oculta formulário de itens
        if (this._isReadOnly()) {
            document.querySelectorAll('#content input, #content select, #content textarea')
                .forEach(el => el.disabled = true);
            document.querySelectorAll('#content .sselect-wrap')
                .forEach(el => el.classList.add('sselect-disabled'));
            const formWrapper = document.querySelector('.item-form-wrapper');
            if (formWrapper) formWrapper.style.display = 'none';
        } else {
            // Marca o form como sujo em qualquer alteração de campo (campos nativos restantes)
            document.querySelectorAll('#content input, #content select, #content textarea')
                .forEach(el => el.addEventListener('change', () => this._markDirty()));
        }
    },

    async _refreshSelects() {
        if (!this._materialSelect || !this._supplierSelect || !this._operatorSelect) return;
        try {
            const [materials, suppliers, operators] = await Promise.all([
                apiCall(API + "/materials"),
                apiCall(API + "/suppliers"),
                apiCall(API + "/operators")
            ]);
            this._materialSelect.setItems('material', (materials || []).map(m => ({ value: m.name, label: m.name })));
            this._supplierSelect.setItems('supplier', (suppliers || []).map(s => ({ value: s.name, label: s.name })));
            this._operatorSelect.setItems('operator', (operators || []).map(o => ({ value: o.name, label: o.name })));
        } catch (e) { /* falha silenciosa em background */ }
    },

    async onTabFocus() { await this._refreshSelects(); },

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
            this._isDirty = false;
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

        // ── Diff: calcula itens removidos, modificados e novos ──
        const deletedItems = this._originalItems.filter(orig =>
            !this.items.some(cur => cur._stockUnitId === orig._stockUnitId)
        );
        const newItems = this.items.filter(cur => !cur._stockUnitId);
        const modifiedItems = this.items.filter(cur => {
            if (!cur._stockUnitId) return false;
            const orig = this._originalItems.find(o => o._stockUnitId === cur._stockUnitId);
            if (!orig) return false;
            return cur.code !== orig.code || cur.material !== orig.material ||
                   cur.quantity !== orig.quantity || cur.operator !== orig.operator;
        });

        // ── Confirmação unificada: itens com baixa que serão deletados ou modificados ──
        const loweredDeleted  = deletedItems.filter(i  => i._originalStatus === 'OUT_STOCK');
        const loweredModified = modifiedItems.filter(i => i._originalStatus === 'OUT_STOCK');
        if (loweredDeleted.length > 0 || loweredModified.length > 0) {
            const confirmed = await this._confirmBaixaDialog(loweredDeleted, loweredModified);
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

            // Atualiza itens modificados preservando status e datas
            for (const item of modifiedItems) {
                await apiCall(API + `/stock-units/${item._stockUnitId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        volume_id: Number.parseInt(item.code, 10),
                        material:  item.material,
                        weight:    parseInt(item.quantity),
                        operator:  nature === "P" ? (item.operator || null) : null,
                    })
                });
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
            this._isDirty = false;
            showScreen('receipts');
        } catch (error) {
            alert("Erro ao atualizar recebimento");
        }
    },

    /** Adiciona um item ao recebimento */
    addItem() {
        const code = document.getElementById("itemCode").value.trim();
        const material = this._materialSelect?.getValue()?.value || '';
        const quantity = document.getElementById("itemQuantity").value;
        const nature = document.getElementById("receiptNature").value;
        const itemOperator = this._operatorSelect?.getValue()?.value || '';

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

        if (this._editingItemIndex !== null) {
            const origItem = this.items[this._editingItemIndex];
            this.items[this._editingItemIndex] = {
                _stockUnitId:    origItem._stockUnitId,
                _originalStatus: origItem._originalStatus,
                code:            normalizedCode,
                material,
                quantity:        Number(quantity),
                operator:        nature === "P" ? itemOperator : ""
            };
            this._editingItemIndex = null;
            this._restoreAddItemBtn();
        } else {
            this.items.push({
                code:     normalizedCode,
                material,
                quantity: Number(quantity),
                operator: nature === "P" ? itemOperator : ""
            });
        }

        this._operatorSelect?.clear();
        clearFormInputs(["itemQuantity"]);
        this._setNextItemCode();
        this._refreshItemsView();
    },

    /** Remove um item pelo índice */
    deleteItem(index) {
        if (this._editingItemIndex === index) {
            this._editingItemIndex = null;
            this._restoreAddItemBtn();
        } else if (this._editingItemIndex !== null && this._editingItemIndex > index) {
            this._editingItemIndex -= 1;
        }
        this.items.splice(index, 1);
        this._setNextItemCode();
        this._refreshItemsView();
    },

    /** Ativa o modo de edição inline para o item no índice indicado */
    startEditItem(index) {
        this._editingItemIndex = index;
        const item = this.items[index];
        document.getElementById("itemCode").value = item.code;
        this._materialSelect?.select('material', item.material);
        document.getElementById("itemQuantity").value = item.quantity;
        if (item.operator) this._operatorSelect?.select('operator', item.operator);
        const addBtn = document.getElementById("receiptsDetailsAddBtn");
        if (addBtn) addBtn.innerHTML = '<span class="material-symbols-outlined">stylus</span>Editar Item';
        const cancelBtn = document.getElementById("receiptsDetailsCancelEditBtn");
        if (cancelBtn) cancelBtn.style.display = '';
        this._renderItems();
    },

    /** Cancela o modo de edição e restaura o formulário de item */
    cancelEditItem() {
        this._editingItemIndex = null;
        this._restoreAddItemBtn();
        this._operatorSelect?.clear();
        clearFormInputs(["itemQuantity"]);
        this._setNextItemCode();
        this._renderItems();
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

        // Agrupar por material mantendo a ordem de inserção
        const groups = new Map();
        this.items.forEach((item, index) => {
            if (!groups.has(item.material)) groups.set(item.material, []);
            groups.get(item.material).push({ item, index });
        });

        for (const [material, entries] of groups) {
            const totalQty = entries.reduce((sum, e) => sum + e.item.quantity, 0);
            const operatorPlaceholder = showOperatorColumn ? '<td class="col-operator"></td>' : '';
            const itemLabel = entries.length === 1 ? 'item' : 'itens';

            // Linha de cabeçalho do grupo
            const groupTr = document.createElement('tr');
            groupTr.className = 'receipts-details-group-row';
            groupTr.innerHTML = `
                <td class="col-code"><span class="group-badge">${entries.length} ${itemLabel}</span></td>
                <td class="col-material group-material-name">${material}</td>
                ${operatorPlaceholder}
                <td class="col-qty group-qty-total">${totalQty}</td>
                <td class="col-actions"></td>
            `;
            tbody.appendChild(groupTr);

            // Linhas de cada item do grupo
            for (const { item, index } of entries) {
                const isEditing = this._editingItemIndex === index;
                const readOnly = this._isReadOnly();
                const operatorCell = showOperatorColumn
                    ? `<td class="col-operator">${item.operator || "-"}</td>`
                    : "";
                const tr = createTableRow(`
                    <td class="col-code">${item.code}</td>
                    <td class="col-material"></td>
                    ${operatorCell}
                    <td class="col-qty">${item.quantity}</td>
                    <td class="col-actions">
                        ${readOnly ? '' : `<button class="btn-action btn-delete" onclick="event.stopPropagation(); ReceiptsDetails.deleteItem(${index})" title="Remover item">
                            <span class="material-symbols-outlined">delete</span>
                        </button>`}
                    </td>
                `);
                if (!readOnly) {
                    tr.style.cursor = 'pointer';
                    tr.onclick = () => ReceiptsDetails.startEditItem(index);
                }
                if (isEditing) tr.classList.add('receipts-details-item-editing');
                tbody.appendChild(tr);
            }
        }
    },

    /** Atualiza total e tabela de itens sem recarregar os dados do formulário */
    _refreshItemsView() {
        const totalQty = this.items.reduce((sum, item) => sum + item.quantity, 0);
        document.getElementById("receiptQty").textContent = totalQty;
        this._renderItems();
        this._updateHeaderFields();
        this._updateRequiredIndicators();
    },

    /** Define o botão de ação (Salvar / Editar) no header */
    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        const isSaveMode = !Receipts.selectedReceipt;
        const action = isSaveMode ? 'create' : 'edit';
        const buttonText = isSaveMode ? "Salvar" : "Editar";
        const buttonAction = isSaveMode ? "ReceiptsDetails.save()" : "ReceiptsDetails.editReceipt()";

        headerOptions.innerHTML = hasPermission('procurement', 'receipts', action) ? `
            <button id="saveBtn" class="btn-primary" onclick="${buttonAction}">${buttonText}</button>
        ` : '';
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

            const supplierSel = this._supplierSelect?.getValue();
            const supplierName = supplierSel?.label ?? "-";
            document.getElementById("receiptSupplierName").textContent = supplierName;

            const orderId = this._orderSelect?.getValue()?.value;
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
        const nativeFields = ["receiptNature", dateFieldId];
        nativeFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (!field) return;
            const label = document.querySelector(`label[for="${fieldId}"]`);
            if (!label) return;
            const span = label.querySelector('.required');
            if (!span) return;
            span.style.visibility = field.value ? 'hidden' : 'visible';
        });
        // Indicador de obrigatório para o SearchSelect de fornecedor (Compra/Retorno)
        if (nature === "C" || nature === "S") {
            const supplierLabel = document.querySelector('label[for="receiptSupplier"]');
            const span = supplierLabel?.querySelector('.required');
            if (span) span.style.visibility = this._supplierSelect?.getValue() ? 'hidden' : 'visible';
        }
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
        const itemOperatorWrapper = document.getElementById("itemOperatorWrapper");

        if (nature === "P") {
            // Produção — mostrar detalhes de fornecimento e operador no item
            supplierCard.style.display = "none";
            operatorCard.style.display = "block";
            if (itemOperatorWrapper) {
                itemOperatorWrapper.style.display = "";
            }
        } else if (nature === "C" || nature === "S") {
            // Compra ou Retorno — mostrar fornecedor/pedido, esconder operador do item
            supplierCard.style.display = "block";
            operatorCard.style.display = "none";
            if (itemOperatorWrapper) {
                itemOperatorWrapper.style.display = "none";
                this._operatorSelect?.clear();
            }
        } else {
            // Nenhuma natureza selecionada
            supplierCard.style.display = "none";
            operatorCard.style.display = "none";
            if (itemOperatorWrapper) {
                itemOperatorWrapper.style.display = "none";
                this._operatorSelect?.clear();
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
        const selectedSupplier = this._supplierSelect?.getValue()?.value || '';

        if (!selectedSupplier) {
            this._orderSelect?.setItems('order', []);
            this._orderSelect?.clear();
            this._updateHeaderFields();
            return;
        }

        try {
            const orders = await apiCall(API + "/orders");
            const filteredOrders = orders.filter(order =>
                order.supplier === selectedSupplier && order.status === "OPEN"
            );
            this._orderSelect?.setItems('order', filteredOrders.map(o => ({ value: o.id, label: '#' + o.id })));
            this._orderSelect?.clear();
        } catch (error) {
            console.error("Erro ao filtrar pedidos:", error);
            this._orderSelect?.setItems('order', []);
        }
        this._updateHeaderFields();
    },

    /** @deprecated Use onSupplierChange() — mantido para compatibilidade */
    async _populateOrderSelect() {},

    // ── Utilitários Privados ──

    /** Restaura o botão de adicionar item e oculta o botão de cancelar edição */
    _restoreAddItemBtn() {
        const addBtn = document.getElementById("receiptsDetailsAddBtn");
        if (addBtn) addBtn.innerHTML = '<span class="material-symbols-outlined">playlist_add</span>Adicionar';
        const cancelBtn = document.getElementById("receiptsDetailsCancelEditBtn");
        if (cancelBtn) cancelBtn.style.display = 'none';
    },

    /**
     * Exibe diálogo de confirmação unificado para itens com baixa que serão deletados ou modificados.
     * @param {Array} loweredDeleted - Itens deletados com status OUT_STOCK
     * @param {Array} loweredModified - Itens modificados com status OUT_STOCK
     * @returns {Promise<boolean>}
     */
    _confirmBaixaDialog(loweredDeleted, loweredModified) {
        return new Promise((resolve) => {
            let resolved = false;
            const done = (value) => {
                if (!resolved) { resolved = true; resolve(value); }
            };
            const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            let bodyHTML = '';
            if (loweredDeleted.length > 0) {
                bodyHTML += `<div class="baixa-confirm-section">
                    <p class="baixa-confirm-label">Itens deletados com baixa:</p>
                    <ul class="baixa-confirm-list">
                        ${loweredDeleted.map(i => `<li>Código ${esc(i.code)} — ${esc(i.material)}</li>`).join('')}
                    </ul>
                </div>`;
            }
            if (loweredModified.length > 0) {
                bodyHTML += `<div class="baixa-confirm-section">
                    <p class="baixa-confirm-label">Itens editados com baixa:</p>
                    <ul class="baixa-confirm-list">
                        ${loweredModified.map(i => `<li>Código ${esc(i.code)} — ${esc(i.material)}</li>`).join('')}
                    </ul>
                </div>`;
            }
            const dlg = createDialog({
                title: 'Atenção: itens com baixa serão afetados',
                subtitle: 'Os itens abaixo já tiveram baixa no estoque. Revise antes de confirmar.',
                bodyHTML,
                closeOnBackdrop: false,
                actions: [
                    { label: 'Cancelar',           className: 'btn-secondary', onClick: () => { dlg.close(); done(false); } },
                    { label: 'Confirmar e Salvar', className: 'btn-primary',   onClick: () => { dlg.close(); done(true);  } },
                ],
                onClose: () => done(false),
            });
            dlg.open();
        });
    },

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
            const orderVal = this._orderSelect?.getValue()?.value;
            return {
                ...baseData,
                supplier: this._supplierSelect?.getValue()?.value || null,
                order_id: orderVal ? parseInt(orderVal) : null,
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
