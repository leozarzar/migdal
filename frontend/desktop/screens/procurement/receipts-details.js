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
    _locationSelect: null,

    /** Instâncias dos componentes do dialog de item */
    _itemDialog: null,
    _dlgMaterialSelect: null,
    _dlgOperatorSelect: null,

    /** Cache de materiais com tracking_mode para lookup */
    _materialsCache: [],

    /** Packagings do material selecionado no dialog */
    _dlgPackagings: [],

    // ── Ciclo de Vida ──

    /** Retorna o template HTML e carrega itens existentes (se editando) */
    async render() {
        this.items = [];
        this._originalItems = [];
        this._supplierSelect?.destroy(); this._supplierSelect = null;
        this._materialSelect?.destroy();  this._materialSelect = null;
        this._operatorSelect?.destroy();  this._operatorSelect = null;
        this._orderSelect?.destroy();     this._orderSelect = null;
        this._locationSelect?.destroy();  this._locationSelect = null;
        this._itemDialog?.destroy();      this._itemDialog = null;
        this._dlgMaterialSelect?.destroy(); this._dlgMaterialSelect = null;
        this._dlgOperatorSelect?.destroy(); this._dlgOperatorSelect = null;

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
                        <div class="form-group">
                            <label for="receiptLocation">Localização</label>
                            <div id="receiptLocationContainer"></div>
                        </div>
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
                        <!-- Botão para abrir dialog de adicionar item -->
                        <div class="item-form-wrapper" id="receiptsDetailsAddWrapper">
                            <button class="btn-add" onclick="ReceiptsDetails.openAddItemDialog()"><span class="material-symbols-outlined">playlist_add</span>Adicionar Item</button>
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
        this._supplierSelect = createSelect({
            placeholder: 'Selecione um fornecedor',
            searchable: true,
            sections: [{ key: 'supplier', items: [] }],
            onChange: () => { ReceiptsDetails.onSupplierChange(); ReceiptsDetails._markDirty(); }
        });
        this._supplierSelect.mount(document.getElementById('receiptSupplierContainer'));

        this._orderSelect = createSelect({
            placeholder: 'Pedido',
            searchable: false,
            sections: [{ key: 'order', items: [] }],
            onChange: () => { ReceiptsDetails._updateHeaderFields(); ReceiptsDetails._markDirty(); }
        });
        this._orderSelect.mount(document.getElementById('receiptOrderContainer'));

        this._materialSelect = null;
        this._operatorSelect = null;

        this._locationSelect = createSelect({
            placeholder: 'Selecione uma localização',
            searchable: true,
            sections: [{ key: 'location', items: [] }],
            onChange: () => ReceiptsDetails._markDirty()
        });
        this._locationSelect.mount(document.getElementById('receiptLocationContainer'));

        await this._refreshSelects();

        // Enriquecer itens carregados com tracking_mode do material
        for (const item of this.items) {
            item.tracking_mode = this._getMaterialTrackingMode(item.material);
        }

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
            if (Receipts.selectedReceipt.supplier) this._supplierSelect.setValue(Receipts.selectedReceipt.supplier);
            await this.onSupplierChange();
            if (Receipts.selectedReceipt.order_id) this._orderSelect.setValue(Receipts.selectedReceipt.order_id);
            if (Receipts.selectedReceipt.location_id) this._locationSelect?.setValue(Receipts.selectedReceipt.location_id);
        } else {
            const saveBtn = document.getElementById("saveBtn");
            if (saveBtn) {
                saveBtn.textContent = "Salvar";
                saveBtn.onclick = () => this.save();
            }
        }

        this._refreshItemsView();
        this._setNextItemCode();

        // Modo somente leitura: desabilita campos e oculta botão de adicionar item
        if (this._isReadOnly()) {
            document.querySelectorAll('#content input, #content select, #content textarea')
                .forEach(el => el.disabled = true);
            this._supplierSelect?.setDisabled(true);
            this._orderSelect?.setDisabled(true);
            this._locationSelect?.setDisabled(true);
            const addWrapper = document.getElementById('receiptsDetailsAddWrapper');
            if (addWrapper) addWrapper.style.display = 'none';
        } else {
            // Marca o form como sujo em qualquer alteração de campo (campos nativos restantes)
            document.querySelectorAll('#content input, #content select, #content textarea')
                .forEach(el => el.addEventListener('change', () => this._markDirty()));
        }
    },

    async _refreshSelects() {
        if (!this._supplierSelect) return;
        try {
            const [materials, suppliers, operators] = await Promise.all([
                apiCall(API + "/materials"),
                apiCall(API + "/suppliers"),
                apiCall(API + "/operators")
            ]);
            this._materialsCache = materials || [];
            this._supplierSelect.setItems('supplier', (suppliers || []).map(s => ({ value: s.name, label: s.name })));

            if (this._locationSelect) {
                const locations = await apiCall(API + '/locations');
                const filtered = filterUserLocations(locations || []);
                this._locationSelect.setItems('location', filtered.map(l => ({ value: l.id, label: l.name })));
                // Auto-selecionar quando há apenas uma localização disponível
                if (filtered.length === 1 && !this._locationSelect.getValue()) {
                    this._locationSelect.setValue(filtered[0].id);
                }
            }
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

    /** Abre o dialog de adicionar item ao recebimento */
    openAddItemDialog(editIndex) {
        this._editingItemIndex = editIndex ?? null;
        this._dlgPackagings = [];
        this._itemDialog?.destroy();
        this._dlgMaterialSelect?.destroy(); this._dlgMaterialSelect = null;
        this._dlgOperatorSelect?.destroy(); this._dlgOperatorSelect = null;

        const nature = document.getElementById("receiptNature").value;
        const showOperator = nature === "P";
        const isEdit = this._editingItemIndex !== null;
        const editItem = isEdit ? this.items[this._editingItemIndex] : null;
        const isLotEdit = editItem?.tracking_mode === 'lots';

        this._itemDialog = createDialog({
            title: isEdit ? 'Editar Item' : 'Adicionar Item',
            wide: true,
            overflowVisible: true,
            bodyHTML: `
                <div class="receipts-details-dialog-form">
                    <label id="rdItemCodeLabel" style="display:none">Código
                        <div id="rdItemCodeMount"></div>
                    </label>
                    <div class="receipts-details-dialog-field">Material <span class="required">*</span>
                        <div class="select-with-btn">
                            <div id="rdItemMaterialContainer"></div>
                            <button class="btn-open-tab" onclick="openNewTab('materials')" title="Abrir cadastro de materiais em nova aba">
                                <span class="material-symbols-outlined">open_in_new</span>
                            </button>
                        </div>
                    </div>
                    ${showOperator ? `
                    <div class="receipts-details-dialog-field">Operador <span class="required">*</span>
                        <div class="select-with-btn">
                            <div id="rdItemOperatorContainer"></div>
                            <button class="btn-open-tab" onclick="openNewTab('operators')" title="Abrir cadastro de operadores em nova aba">
                                <span class="material-symbols-outlined">open_in_new</span>
                            </button>
                        </div>
                    </div>` : ''}
                    <div id="rdItemPkgGroup" style="display:none">
                        <label>Modo de entrada
                            <select id="rdItemMode" class="dialog-input" onchange="ReceiptsDetails._onDlgModeChange()">
                                <option value="qty">Por quantidade</option>
                                <option value="pkg">Por embalagem</option>
                            </select>
                        </label>
                    </div>
                    <label id="rdItemQtyLabel">Quantidade <span class="required">*</span>
                        <div id="rdItemQtyMount"></div>
                    </label>
                    <div id="rdItemPkgFields" style="display:none">
                        <label>Embalagem
                            <select id="rdItemPkgSelect" class="dialog-input" onchange="ReceiptsDetails._onDlgPkgSelectChange()"></select>
                        </label>
                        <label>Qtd. Embalagens <span class="required">*</span>
                            <div id="rdItemPkgCountMount"></div>
                            <span id="rdItemPkgHint" class="receipts-details-pkg-hint"></span>
                        </label>
                    </div>
                </div>
            `,
            actions: [
                { label: isEdit ? 'Salvar' : 'Adicionar', variant: 'primary', icon: isEdit ? 'check' : 'playlist_add', onClick: () => this._confirmItemDialog() },
                { label: 'Cancelar', variant: 'secondary', onClick: () => this._itemDialog.close() },
            ],
        });
        this._itemDialog.open();

        // Mount custom inputs inside dialog
        const codeInput = createInput({
            id: 'rdItemCode',
            type: 'number',
            placeholder: 'Código',
            onInput: (_v, e) => ReceiptsDetails.validateItemCode(e.target),
        });
        document.getElementById('rdItemCodeMount').appendChild(codeInput.el);

        const qtyInput = createInput({
            id: 'rdItemQty',
            type: 'number',
            placeholder: '0,00',
        });
        qtyInput.input.step = 'any';
        qtyInput.input.min = '0.01';
        document.getElementById('rdItemQtyMount').appendChild(qtyInput.el);

        const pkgCountInput = createInput({
            id: 'rdItemPkgCount',
            type: 'number',
            placeholder: '0',
            onInput: () => ReceiptsDetails._onDlgPkgCountChange(),
        });
        pkgCountInput.input.step = '1';
        pkgCountInput.input.min = '1';
        document.getElementById('rdItemPkgCountMount').appendChild(pkgCountInput.el);

        // Mount material SearchSelect inside dialog
        this._dlgMaterialSelect = createSelect({
            placeholder: 'Selecione um material',
            searchable: true,
            sections: [{ key: 'material', items: [] }],
            onChange: () => this._onDlgMaterialChange(),
        });
        this._dlgMaterialSelect.mount(document.getElementById('rdItemMaterialContainer'));
        this._dlgMaterialSelect.setItems('material', this._materialsCache.map(m => ({ value: m.name, label: m.name })));

        // Mount operator SearchSelect if production
        if (showOperator) {
            this._dlgOperatorSelect = createSelect({
                placeholder: 'Selecione um operador',
                searchable: true,
                sections: [{ key: 'operator', items: [] }],
            });
            this._dlgOperatorSelect.mount(document.getElementById('rdItemOperatorContainer'));
            apiCall(API + "/operators").then(ops => {
                this._dlgOperatorSelect?.setItems('operator', (ops || []).map(o => ({ value: o.name, label: o.name })));
                if (editItem?.operator) this._dlgOperatorSelect.setValue(editItem.operator);
            }).catch(() => {});
        }

        // Pre-fill for edit mode
        if (editItem) {
            this._dlgMaterialSelect.setValue(editItem.material);
            document.getElementById('rdItemQty').value = editItem.quantity;
            if (isLotEdit) {
                const codeLabel = document.getElementById('rdItemCodeLabel');
                if (codeLabel) codeLabel.style.display = '';
                document.getElementById('rdItemCode').value = editItem.code;
            }
            // Trigger material change to load packagings
            this._onDlgMaterialChange();
        }
    },

    /** Confirma o dialog de item — adiciona ou edita o item */
    _confirmItemDialog() {
        const material = this._dlgMaterialSelect?.getValue() || '';
        const nature = document.getElementById("receiptNature").value;
        const itemOperator = this._dlgOperatorSelect?.getValue() || '';
        const isLot = this._getMaterialTrackingMode(material) === 'lots';
        const code = document.getElementById("rdItemCode")?.value?.trim() || '';

        if (isLot && !code) {
            alert("Preencha o código do item");
            return;
        }
        if (!material) {
            alert("Selecione um material");
            return;
        }

        // Determine quantity based on mode
        const mode = document.getElementById('rdItemMode')?.value || 'qty';
        let quantity;
        if (mode === 'pkg') {
            const sel = document.getElementById('rdItemPkgSelect');
            const pkgQty = parseFloat(sel?.selectedOptions[0]?.dataset.qty) || 0;
            const count = parseInt(document.getElementById('rdItemPkgCount')?.value);
            if (!count || count <= 0) { alert('Informe a quantidade de embalagens'); return; }
            if (pkgQty > 0) {
                quantity = Math.round(count * pkgQty * 1000) / 1000;
            } else {
                // Embalagem sem peso unitário — qty informado manualmente
                quantity = parseFloat(document.getElementById('rdItemQty')?.value);
            }
        } else {
            quantity = parseFloat(document.getElementById('rdItemQty')?.value);
        }

        if (!quantity || quantity <= 0) {
            alert("Informe uma quantidade válida");
            return;
        }

        if (nature === "P" && !itemOperator) {
            alert("Selecione o operador do item");
            return;
        }

        const normalizedCode = isLot
            ? (() => {
                if (!/^\d+$/.test(code)) { alert("O código do item deve conter apenas números"); return null; }
                return Number.parseInt(code, 10);
            })()
            : this._getNextItemCode();

        if (normalizedCode === null) return;

        // Capture packaging info if in pkg mode
        let packagingId = null;
        let packagingCount = null;
        if (mode === 'pkg') {
            const sel = document.getElementById('rdItemPkgSelect');
            packagingId = sel?.value ? parseInt(sel.value) : null;
            packagingCount = parseInt(document.getElementById('rdItemPkgCount')?.value) || null;
        }

        if (this._editingItemIndex !== null) {
            const origItem = this.items[this._editingItemIndex];
            this.items[this._editingItemIndex] = {
                _stockUnitId:    origItem._stockUnitId,
                _originalStatus: origItem._originalStatus,
                code:            isLot ? normalizedCode : origItem.code,
                material,
                quantity:        Number(quantity),
                operator:        nature === "P" ? itemOperator : "",
                tracking_mode:   isLot ? 'lots' : 'simple',
                packaging_id:    packagingId,
                packaging_count: packagingCount
            };
            this._editingItemIndex = null;
        } else {
            this.items.push({
                code:     normalizedCode,
                material,
                quantity: Number(quantity),
                operator: nature === "P" ? itemOperator : "",
                tracking_mode: isLot ? 'lots' : 'simple',
                packaging_id:    packagingId,
                packaging_count: packagingCount
            });
        }

        this._markDirty();
        this._itemDialog.close();
        this._refreshItemsView();
    },

    /** Reage à mudança de material no dialog — carrega packagings e mostra/esconde código */
    async _onDlgMaterialChange() {
        const selected = this._dlgMaterialSelect?.getValue();
        if (!selected) return;

        const mode = this._getMaterialTrackingMode(selected);
        const codeLabel = document.getElementById('rdItemCodeLabel');
        if (codeLabel) {
            codeLabel.style.display = mode === 'lots' ? '' : 'none';
            if (mode === 'lots') {
                const nextCode = this._getNextItemCode();
                document.getElementById('rdItemCode').value = nextCode;
            }
        }

        // Fetch packagings for the selected material
        const mat = this._materialsCache.find(m => m.name === selected);
        this._dlgPackagings = [];
        if (mat) {
            try {
                const full = await apiCall(API + `/materials/${mat.id}`);
                this._dlgPackagings = full.packagings || [];
            } catch { /* silencioso */ }
        }

        const pkgGroup = document.getElementById('rdItemPkgGroup');
        const pkgFields = document.getElementById('rdItemPkgFields');
        const unit = mat?.unit_of_measure || 'kg';
        if (this._dlgPackagings.length > 0) {
            if (pkgGroup) pkgGroup.style.display = '';
            // Populate packaging select
            const pkgSel = document.getElementById('rdItemPkgSelect');
            if (pkgSel) {
                pkgSel.innerHTML = this._dlgPackagings.map(p =>
                    p.quantity
                        ? `<option value="${p.id}" data-qty="${p.quantity}">${_esc(p.name)} (${p.quantity} ${unit})</option>`
                        : `<option value="${p.id}" data-qty="0">${_esc(p.name)}</option>`
                ).join('');
            }
            this._onDlgPkgSelectChange();
        } else {
            if (pkgGroup) pkgGroup.style.display = 'none';
            if (pkgFields) pkgFields.style.display = 'none';
            // Reset to qty mode
            const modeEl = document.getElementById('rdItemMode');
            if (modeEl) modeEl.value = 'qty';
            const qtyLabel = document.getElementById('rdItemQtyLabel');
            if (qtyLabel) qtyLabel.style.display = '';
        }
    },

    /** Alterna modo quantidade / embalagem no dialog */
    _onDlgModeChange() {
        const mode = document.getElementById('rdItemMode')?.value;
        const qtyLabel = document.getElementById('rdItemQtyLabel');
        const pkgFields = document.getElementById('rdItemPkgFields');
        if (mode === 'pkg') {
            if (pkgFields) pkgFields.style.display = '';
            // Se embalagem sem peso unitário, mostra qty também
            const sel = document.getElementById('rdItemPkgSelect');
            const hasPkgQty = parseFloat(sel?.selectedOptions[0]?.dataset.qty) > 0;
            if (qtyLabel) qtyLabel.style.display = hasPkgQty ? 'none' : '';
        } else {
            if (qtyLabel) qtyLabel.style.display = '';
            if (pkgFields) pkgFields.style.display = 'none';
        }
    },

    /** Atualiza hint e visibilidade do campo qty quando embalagem selecionada muda no dialog */
    _onDlgPkgSelectChange() {
        const sel = document.getElementById('rdItemPkgSelect');
        if (!sel) return;
        const opt = sel.selectedOptions[0];
        const qty = parseFloat(opt?.dataset.qty) || 0;
        const hint = document.getElementById('rdItemPkgHint');
        if (hint) hint.textContent = qty ? `${qty} por embalagem` : '';

        // Se estiver em modo embalagem, ajusta visibilidade do campo quantidade
        const mode = document.getElementById('rdItemMode')?.value;
        if (mode === 'pkg') {
            const qtyLabel = document.getElementById('rdItemQtyLabel');
            if (qtyLabel) qtyLabel.style.display = qty > 0 ? 'none' : '';
        }
    },

    /** Calcula quantidade total a partir da contagem de embalagens no dialog (só se houver peso por embalagem) */
    _onDlgPkgCountChange() {
        const sel = document.getElementById('rdItemPkgSelect');
        const pkgQty = parseFloat(sel?.selectedOptions[0]?.dataset.qty) || 0;
        if (!pkgQty) return; // sem peso por embalagem — usuário informa qty manualmente
        const count = parseInt(document.getElementById('rdItemPkgCount')?.value) || 0;
        const qtyEl = document.getElementById('rdItemQty');
        if (qtyEl) qtyEl.value = Math.round(count * pkgQty * 1000) / 1000;
    },

    /** Remove um item pelo índice */
    deleteItem(index) {
        if (this._editingItemIndex === index) {
            this._editingItemIndex = null;
        } else if (this._editingItemIndex !== null && this._editingItemIndex > index) {
            this._editingItemIndex -= 1;
        }
        this.items.splice(index, 1);
        this._setNextItemCode();
        this._refreshItemsView();
    },

    /** Ativa o modo de edição: abre o dialog com os dados do item preenchidos */
    startEditItem(index) {
        this.openAddItemDialog(index);
    },

    /** Cancela o modo de edição */
    cancelEditItem() {
        this._editingItemIndex = null;
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
            let cols = 4; // code + material + qty + actions
            if (showOperatorColumn) cols++;
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="${cols}" class="empty-state">Nenhum item adicionado. Clique em Adicionar Item.</td>`;
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
            const groupIsLot = entries[0].item.tracking_mode === 'lots';

            // Linha de cabeçalho do grupo
            const groupTr = document.createElement('tr');
            groupTr.className = 'receipts-details-group-row';
            groupTr.innerHTML = `
                <td class="col-code">${groupIsLot ? `<span class="group-badge">${entries.length} ${itemLabel}</span>` : ''}</td>
                <td class="col-material group-material-name">${!groupIsLot ? `<span class="group-badge">${entries.length} ${itemLabel}</span> ` : ''}${material}</td>
                ${operatorPlaceholder}
                <td class="col-qty group-qty-total">${totalQty}</td>
                <td class="col-actions"></td>
            `;
            tbody.appendChild(groupTr);

            // Linhas de cada item do grupo
            for (const { item, index } of entries) {
                const isEditing = this._editingItemIndex === index;
                const readOnly = this._isReadOnly();
                const isLot = item.tracking_mode === 'lots';
                const operatorCell = showOperatorColumn
                    ? `<td class="col-operator">${item.operator || "-"}</td>`
                    : "";
                const tr = createTableRow(`
                    <td class="col-code">${isLot ? item.code : '—'}</td>
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

            const supplierName = this._supplierSelect?.getValue() ?? "-";
            document.getElementById("receiptSupplierName").textContent = supplierName;

            const orderId = this._orderSelect?.getValue();
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

        if (nature === "P") {
            supplierCard.style.display = "none";
            operatorCard.style.display = "block";
        } else if (nature === "C" || nature === "S") {
            supplierCard.style.display = "block";
            operatorCard.style.display = "none";
        } else {
            supplierCard.style.display = "none";
            operatorCard.style.display = "none";
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
        const selectedSupplier = this._supplierSelect?.getValue() || '';

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
                    { label: 'Cancelar',           variant: 'secondary', onClick: () => { dlg.close(); done(false); } },
                    { label: 'Confirmar e Salvar', variant: 'primary',   onClick: () => { dlg.close(); done(true);  } },
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
                order_id: null,
                location_id: this._locationSelect?.getValue() || null,
            };
        } else {
            // Compra ou Retorno de Serviço
            const orderVal = this._orderSelect?.getValue();
            return {
                ...baseData,
                supplier: this._supplierSelect?.getValue() || null,
                order_id: orderVal ? parseInt(orderVal) : null,
                location_id: this._locationSelect?.getValue() || null,
            };
        }
    },

    /** Salva bags (unidades de estoque) baseado nos itens do recebimento */
    async _saveBagsFromItems(receiptId, supplier, date, nature, items) {
        const itemList = items ?? this.items;
        for (const item of itemList) {
            // Operador só é relevante para natureza Produção
            const operator = nature === "P" ? (item.operator || null) : null;
            const locationVal = this._locationSelect?.getValue() || null;

            if (item.tracking_mode === 'simple') {
                // Simples: cria apenas movimentação de entrada (sem stock_unit)
                const mat = this._materialsCache.find(m => m.name === item.material);
                if (!mat) { console.error('Material não encontrado no cache:', item.material); continue; }
                try {
                    await apiCall(API + "/stock-movements/entry", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            material_id:     mat.id,
                            quantity:        Number(item.quantity),
                            date:            date,
                            receipt_id:      receiptId,
                            operator:        operator,
                            reason:          'purchase',
                            location_id:     locationVal ? Number(locationVal) : null,
                            packaging_id:    item.packaging_id || null,
                            packaging_count: item.packaging_count || null,
                        })
                    });
                } catch (error) {
                    console.error("Erro ao salvar movimentação de entrada:", error);
                }
            } else {
                // Lotes: cria stock_unit + movimentação (como antes)
                const bagData = {
                    receipt_id: receiptId,
                    volume_id: Number.parseInt(item.code, 10),
                    material: item.material,
                    weight: parseInt(item.quantity),
                    supplier: supplier,
                    operator: operator,
                    status: "IN_STOCK",
                    date_in: date,
                    notes: "",
                    location_id: locationVal ? Number(locationVal) : undefined,
                    packaging_id: item.packaging_id || null,
                    packaging_count: item.packaging_count || null
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

    /** Define o próximo código de item no campo de entrada (usado no dialog) */
    _setNextItemCode() {
        // No-op: código é definido ao abrir o dialog
    },

    /**
     * Retorna o tracking_mode de um material pelo nome.
     * @param {string} name - Nome do material
     * @returns {string} 'lots' ou 'simple'
     */
    _getMaterialTrackingMode(name) {
        const mat = this._materialsCache.find(m => m.name === name);
        return mat?.tracking_mode || 'simple';
    },

};
