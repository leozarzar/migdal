/**
 * receipts-details.js
 * Tela de detalhes de Recebimento — criação, edição e gerenciamento de itens (bags) do recebimento.
 */
const ReceiptsDetails = {

    // ── Estado ──

    /** Lista de itens do recebimento atual */
    items: [],

    /** Snapshot dos itens originais carregados do banco (para diff na edição de COMPLETED) */
    _originalItems: [],

    /** Indica se há alterações não salvas no cabeçalho (só usado para recebimentos COMPLETED) */
    _isDirty: false,

    /** ID do recebimento DRAFT criado no servidor ao abrir a tela (null = editando existente) */
    _draftReceiptId: null,

    /** Verifica se a tela está em modo somente leitura (sem permissão de edição) */
    _isReadOnly() {
        if (!Receipts.selectedReceipt) return false;
        return !hasPermission('procurement', 'receipts', 'edit');
    },

    /** Retorna true se o recebimento atual é um rascunho (novo ou DRAFT da lista) */
    _isDraft() {
        return !!this._draftReceiptId || Receipts.selectedReceipt?.status === 'DRAFT';
    },

    /** Retorna o ID do recebimento atual (draft novo ou existente) */
    _currentReceiptId() {
        return this._draftReceiptId ?? Receipts.selectedReceipt?.id ?? null;
    },

    /** Índice do item sendo editado inline (null = nenhum em edição) */
    _editingItemIndex: null,

    /** Instâncias dos componentes de form */
    _supplierSelect: null,
    _materialSelect: null,
    _operatorSelect: null,
    _orderSelect: null,
    _locationSelect: null,
    _natureToggle: null,
    _datePicker: null,

    /** Instâncias dos componentes do dialog de item */
    _itemsDialog: null,
    _itemsDataTable: null,
    _dlgMaterialSelect: null,
    _dlgOperatorSelect: null,

    /** Cache de materiais com tracking_mode para lookup */
    _materialsCache: [],

    /** Packagings do material selecionado no dialog */
    _dlgPackagings: [],

    /** Quando true, canLeave() retorna true sem mostrar diálogo (usado por _exitScreen) */
    _bypassLeaveCheck: false,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML e carrega itens existentes (se editando) */
    async render() {
        this.items = [];
        this._originalItems = [];
        this._draftReceiptId = null;
        this._supplierSelect?.destroy();        this._supplierSelect = null;
        this._materialSelect?.destroy();        this._materialSelect = null;
        this._operatorSelect?.destroy();        this._operatorSelect = null;
        this._orderSelect?.destroy();           this._orderSelect = null;
        this._locationSelect?.destroy();        this._locationSelect = null;
        this._natureToggle?.destroy();          this._natureToggle = null;
        this._datePicker?.destroy();            this._datePicker = null;
        this._itemsDialog?.destroy();           this._itemsDialog = null;
        this._itemsDataTable?.destroy();        this._itemsDataTable = null;
        this._dlgMaterialSelect?.destroy();     this._dlgMaterialSelect = null;
        this._dlgOperatorSelect?.destroy();     this._dlgOperatorSelect = null;

        if (Receipts.selectedReceipt) {
            try {
                const receiptItems = await apiCall(API + `/receipts/items/${Receipts.selectedReceipt.id}`);
                this.items = receiptItems.map(i => {
                    if (i.item_type === 'movement') {
                        return {
                            _movementId: i.id,
                            _originalStatus: null,
                            code: "",
                            material: i.material,
                            quantity: i.quantity,
                            operator: i.operator || "",
                            tracking_mode: 'simple',
                        };
                    }
                    return {
                        _stockUnitId: i.id,
                        _originalStatus: i.status,
                        code: i.volume_id == null ? "" : Number(i.volume_id),
                        material: i.material,
                        quantity: i.weight,
                        operator: i.operator || "",
                    };
                });
                this._originalItems = this.items.filter(i => i._stockUnitId && i._originalStatus !== 'DRAFT');
            } catch (error) {
                console.error("Erro ao carregar itens do recebimento:", error);
            }
        }

        return `
        <div class="receipts-details-container">
            <div class="rd-content">
                <div class="rd-header">
                    <h1>Recebimento <span id="receiptTitleCode"></span><span id="receiptStatusBadge" style="margin-left:8px"></span></h1>
                    <div class="rd-meta">
                        <span id="receiptMetaSupplier" style="display:none">Fornecedor: <span id="receiptSupplierName"></span>  |  </span>
                        <span id="receiptMetaOrder" style="display:none">Pedido: <span id="receiptOrderNumber"></span>  |  </span>
                        <span id="receiptMetaProduction" style="display:none">Produção  |  </span>
                        <span>Quantidade: <span class="summary-value" id="receiptQty">0</span></span>
                    </div>
                </div>

                <div class="rd-separator"></div>

                <input type="hidden" id="receiptCode">
                <input type="hidden" id="receiptNature">
                <input type="hidden" id="receiptDate">

                <div class="rd-section">
                    <h2 class="rd-section-title">Informações Básicas</h2>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Natureza <span class="required" id="reqNature">*</span></span>
                            <span class="rd-field-desc">Tipo de entrada no estoque</span>
                        </div>
                        <div class="rd-form-field">
                            <div id="receiptNatureContainer"></div>
                        </div>
                    </div>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Localização</span>
                            <span class="rd-field-desc">Destino no estoque</span>
                        </div>
                        <div class="rd-form-field">
                            <div id="receiptLocationContainer"></div>
                        </div>
                    </div>
                </div>

                <div class="rd-section" id="sectionDetails">
                    <h2 class="rd-section-title">Detalhes do Recebimento</h2>
                    <div class="rd-form-row" id="rowSupplier">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Fornecedor <span class="required" id="reqSupplier">*</span></span>
                            <span class="rd-field-desc">Empresa fornecedora do material</span>
                        </div>
                        <div class="rd-form-field">
                            <div class="select-with-btn">
                                <div id="receiptSupplierContainer"></div>
                                <button class="btn-open-tab" onclick="openNewTab('suppliers')" title="Abrir cadastro de fornecedores em nova aba">
                                    <span class="material-symbols-outlined">open_in_new</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="rd-form-row" id="rowDate">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Data Recebimento <span class="required" id="reqDate">*</span></span>
                            <span class="rd-field-desc">Data em que o material chegou</span>
                        </div>
                        <div class="rd-form-field">
                            <div id="receiptDateContainer"></div>
                        </div>
                    </div>
                    <div class="rd-form-row" id="rowOrder">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Pedido</span>
                            <span class="rd-field-desc">Pedido de compra vinculado</span>
                        </div>
                        <div class="rd-form-field">
                            <div class="select-with-btn">
                                <div id="receiptOrderContainer"></div>
                                <button class="btn-open-tab" onclick="openNewTab('orders')" title="Abrir cadastro de pedidos em nova aba">
                                    <span class="material-symbols-outlined">open_in_new</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="rd-section">
                    <h2 class="rd-section-title">Itens do Recebimento</h2>
                    <div id="rdItemsWidget"></div>
                </div>
            </div>

            <div class="rd-action-bar" id="rdActionBar"></div>
        </div>
        `;
    },

    /** Marca o formulário como modificado */
    _markDirty() { this._isDirty = true; },

    /** Permite ao router verificar se pode navegar para outra tela */
    async canLeave() {
        if (this._bypassLeaveCheck) { this._bypassLeaveCheck = false; return true; }
        if (this._isDraft()) {
            return new Promise(resolve => {
                let resolved = false;
                const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };
                const dlg = createDialog({
                    title: 'Recebimento em rascunho',
                    bodyHTML: '<p>O que deseja fazer com este recebimento?</p>',
                    closeOnBackdrop: false,
                    actions: [
                        { label: 'Abandonar', variant: 'cancel', onClick: async () => {
                            const id = this._currentReceiptId();
                            if (id) await apiCall(API + `/receipts/${id}/abandon`, { method: 'PATCH' }).catch(() => {});
                            done(true); dlg.close();
                        }},
                        { label: 'Manter Rascunho', variant: 'secondary', onClick: async () => { await this.saveHeaderOnly(); done(true); dlg.close(); } },
                    ],
                    onClose: () => done(false),
                });
                dlg.open();
            });
        }
        if (!this._isDirty) return true;
        return new Promise(resolve => {
            let resolved = false;
            const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };
            const dlg = createDialog({
                title: 'Alterações não salvas',
                bodyHTML: '<p>Você tem alterações não salvas. O que deseja fazer?</p>',
                closeOnBackdrop: false,
                actions: [
                    { label: 'Sair sem salvar', variant: 'cancel', onClick: () => { done(true); dlg.close(); } },
                    { label: 'Continuar editando', variant: 'secondary', onClick: () => { done(false); dlg.close(); } },
                ],
                onClose: () => done(false),
            });
            dlg.open();
        });
    },

    /** Inicializa a tela: cria SearchSelects, popula dados e preenche campos do recebimento selecionado */
    async load() {
        this._isDirty = false;
        this._renderActionBar();

        // Toggle de natureza
        this._natureToggle = createToggleGroup({
            options: [
                { value: 'C', label: 'Compra' },
                { value: 'S', label: 'Retorno de Serviço' },
                { value: 'P', label: 'Produção' },
            ],
            onChange: (value) => {
                document.getElementById('receiptNature').value = value || '';
                ReceiptsDetails.updateReceiptCode();
                ReceiptsDetails._updateHeaderFields();
                ReceiptsDetails._markDirty();
            },
        });
        this._natureToggle.mount(document.getElementById('receiptNatureContainer'));

        // DatePickers
        this._datePicker = createDatePicker({
            placeholder: 'Selecione a data',
            onChange: (date) => {
                document.getElementById('receiptDate').value = date ? date.toISOString().slice(0, 10) : '';
                ReceiptsDetails._updateRequiredIndicators();
                ReceiptsDetails._markDirty();
            },
        });
        this._datePicker.mount(document.getElementById('receiptDateContainer'));

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
            if (!item.tracking_mode) item.tracking_mode = this._getMaterialTrackingMode(item.material);
        }

        if (Receipts.selectedReceipt) {
            const nature = Receipts.selectedReceipt.nature;
            const code = nature
                ? `#${nature}${Receipts.selectedReceipt.id}`
                : `#---${Receipts.selectedReceipt.id}`;
            document.getElementById("receiptCode").value = code;

            if (nature) {
                document.getElementById("receiptNature").value = nature;
                this._natureToggle?.setValue(nature);
                this.updateFormVisibility(nature);
                const date = Receipts.selectedReceipt.date || null;
                document.getElementById("receiptDate").value = date || '';
                if (date) this._datePicker?.setValue(new Date(date + 'T00:00:00'));
            }
            if (Receipts.selectedReceipt.supplier) this._supplierSelect.setValue(Receipts.selectedReceipt.supplier);
            await this.onSupplierChange();
            if (Receipts.selectedReceipt.order_id) this._orderSelect.setValue(Receipts.selectedReceipt.order_id);
            if (Receipts.selectedReceipt.location_id) this._locationSelect?.setValue(Receipts.selectedReceipt.location_id);
        } else {
            // Novo recebimento: criar DRAFT no servidor já com valores padrão
            try {
                const today = new Date().toISOString().slice(0, 10);
                const sidebarLoc = AppState.getLocationFilter();
                const draft = await apiCall(API + "/receipts/draft", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nature: 'C', date: today, location_id: sidebarLoc || null }),
                });
                this._draftReceiptId = draft.id;
                document.getElementById("receiptCode").value = `#---${draft.id}`;

                document.getElementById('receiptNature').value = 'C';
                this._natureToggle?.setValue('C');
                this.updateReceiptCode();

                document.getElementById('receiptDate').value = today;
                this._datePicker?.setValue(new Date(today + 'T00:00:00'));

                if (sidebarLoc) {
                    this._locationSelect?.setValue(sidebarLoc);
                    this._locationSelect?.setDisabled(true);
                }
            } catch (e) {
                console.error("Erro ao criar rascunho:", e);
            }
        }

        this._refreshItemsView();

        // Badge de status no título
        const statusBadge = document.getElementById('receiptStatusBadge');
        if (statusBadge) {
            if (this._isDraft()) {
                statusBadge.innerHTML = '<span class="receipt-badge receipt-badge-draft">Rascunho</span>';
            } else if (Receipts.selectedReceipt?.status === 'ABANDONED') {
                statusBadge.innerHTML = '<span class="receipt-badge receipt-badge-abandoned">Abandonado</span>';
            } else {
                statusBadge.innerHTML = '';
            }
        }

        // Modo somente leitura: desabilita campos e oculta botão de adicionar item
        if (this._isReadOnly()) {
            document.querySelectorAll('#content input, #content select, #content textarea')
                .forEach(el => el.disabled = true);
            this._supplierSelect?.setDisabled(true);
            this._orderSelect?.setDisabled(true);
            this._locationSelect?.setDisabled(true);
            this._datePicker?.setDisabled(true);
            if (this._natureToggle?.el) {
                this._natureToggle.el.style.pointerEvents = 'none';
                this._natureToggle.el.style.opacity = '0.6';
            }
            const addWrapper = document.getElementById('receiptsDetailsAddWrapper');
            if (addWrapper) addWrapper.style.display = 'none';
        } else {
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

    /** Confirma o recebimento em rascunho: salva cabeçalho e transiciona todos os itens DRAFT */
    async confirmReceipt(stay = false) {
        const receiptData = this._getReceiptData();
        const nature = receiptData.nature;
        if (!nature || !receiptData.date) { alert("Erro: Natureza e Data são obrigatórios."); return; }
        if ((nature === "C" || nature === "S") && !receiptData.supplier) { alert("Erro: Fornecedor é obrigatório para Compra/Retorno."); return; }
        if (this.items.length === 0) { alert("Erro: Nenhum item lançado."); return; }

        const id = this._currentReceiptId();
        try {
            await apiCall(API + `/receipts/${id}/confirm`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(receiptData)
            });
            this._isDirty = false;
            this._draftReceiptId = null;
            if (Receipts.selectedReceipt) Receipts.selectedReceipt = { ...Receipts.selectedReceipt, status: 'COMPLETED' };
            showToast("Recebimento confirmado com sucesso", "success");
            if (stay) {
                Receipts.selectedReceipt = { ...receiptData, id, status: 'COMPLETED' };
                showScreen('receipts-details');
            } else {
                showScreen('receipts');
            }
        } catch (e) {
            alert("Erro ao confirmar recebimento");
        }
    },

    /** Salva apenas o cabeçalho do recebimento sem confirmar — mantém como DRAFT */
    async saveHeaderOnly() {
        const receiptData = this._getReceiptData();
        const id = this._currentReceiptId();
        if (!id) return;
        try {
            await apiCall(API + `/receipts/${id}/header`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(receiptData)
            });
            this._isDirty = false;
        } catch (e) {
            alert("Erro ao guardar cabeçalho");
        }
    },

    /** Atualiza um recebimento existente (mesma validação que save) */
    async editReceipt(stay = false) {
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

            showToast("Recebimento atualizado com sucesso", "success");
            this._isDirty = false;
            if (stay) {
                showScreen('receipts-details');
            } else {
                showScreen('receipts');
            }
        } catch (error) {
            alert("Erro ao atualizar recebimento");
        }
    },

    /** Abre o dialog unificado: formulário de item + data table de itens */
    openItemsDialog() {
        this._editingItemIndex = null;
        this._dlgPackagings = [];
        this._dlgMaterialSelect?.destroy(); this._dlgMaterialSelect = null;
        this._dlgOperatorSelect?.destroy(); this._dlgOperatorSelect = null;

        const nature = document.getElementById('receiptNature').value;
        const showOperator = nature === 'P';
        const readOnly = this._isReadOnly();

        this._itemsDialog = createDialog({
            title: 'Itens do Recebimento',
            wide: true,
            bodyHTML: `
                <div class="rd-items-dlg-body">
                    ${!readOnly ? `
                    <div class="rd-items-dlg-form">
                        <div class="rd-items-dlg-fields">
                            <div id="rdItemCodeWrap" style="display:none">
                                <span class="rd-dlg-field-label">Código</span>
                                <div id="rdItemCodeMount"></div>
                            </div>
                            <div>
                                <span class="rd-dlg-field-label">Material <span class="required">*</span></span>
                                <div class="select-with-btn">
                                    <div id="rdItemMaterialContainer"></div>
                                    <button class="btn-open-tab" onclick="openNewTab('materials')" title="Abrir cadastro de materiais em nova aba">
                                        <span class="material-symbols-outlined">open_in_new</span>
                                    </button>
                                </div>
                            </div>
                            ${showOperator ? `
                            <div>
                                <span class="rd-dlg-field-label">Operador <span class="required">*</span></span>
                                <div class="select-with-btn">
                                    <div id="rdItemOperatorContainer"></div>
                                    <button class="btn-open-tab" onclick="openNewTab('operators')" title="Abrir cadastro de operadores em nova aba">
                                        <span class="material-symbols-outlined">open_in_new</span>
                                    </button>
                                </div>
                            </div>` : ''}
                            <div id="rdItemPkgGroup" style="display:none">
                                <span class="rd-dlg-field-label">Modo de entrada</span>
                                <select id="rdItemMode" class="dialog-input" onchange="ReceiptsDetails._onDlgModeChange()">
                                    <option value="qty">Por quantidade</option>
                                    <option value="pkg">Por embalagem</option>
                                </select>
                            </div>
                            <div id="rdItemQtyWrap">
                                <span class="rd-dlg-field-label">Quantidade <span class="required">*</span></span>
                                <div id="rdItemQtyMount"></div>
                            </div>
                            <div id="rdItemPkgFields" style="display:none">
                                <span class="rd-dlg-field-label">Embalagem</span>
                                <select id="rdItemPkgSelect" class="dialog-input" onchange="ReceiptsDetails._onDlgPkgSelectChange()"></select>
                                <span class="rd-dlg-field-label" style="margin-top:8px">Qtd. Embalagens <span class="required">*</span></span>
                                <div id="rdItemPkgCountMount"></div>
                                <span id="rdItemPkgHint" class="receipts-details-pkg-hint"></span>
                            </div>
                        </div>
                        <div class="rd-items-dlg-actions" id="rdDlgFormActions"></div>
                    </div>
                    <hr class="rd-items-dlg-divider">
                    ` : ''}
                    <div id="rdItemsTableMount"></div>
                </div>`,
            actions: [
                { label: 'Fechar', variant: 'secondary', onClick: () => this._itemsDialog?.close() },
            ],
            onClose: () => {
                this._dlgMaterialSelect?.destroy(); this._dlgMaterialSelect = null;
                this._dlgOperatorSelect?.destroy(); this._dlgOperatorSelect = null;
                this._itemsDataTable?.destroy(); this._itemsDataTable = null;
                const dlg = this._itemsDialog; this._itemsDialog = null;
                dlg?.destroy();
                this._renderItemsWidget();
            },
        });
        this._itemsDialog.open();

        // Fix dialog height and delegate scrolling to the table
        const backdrops = document.querySelectorAll('.dialog-backdrop');
        backdrops[backdrops.length - 1]?.querySelector('.dialog-panel')?.classList.add('dialog-panel--items-dlg');

        // Montar data table
        const columns = [
            {
                key: 'code',
                header: 'Código',
                width: '110px',
                render: r => {
                    if (r._isGroup) return `<span class="rd-items-group-badge">${r._count} ${r._count === 1 ? 'item' : 'itens'}</span>`;
                    if (r._isTotal) return '';
                    return r.tracking_mode === 'lots' ? String(r.code).padStart(3, '0') : '—';
                },
            },
            {
                key: 'material',
                header: 'Material',
                render: r => {
                    if (r._isGroup) return `<span class="rd-items-group-name">${_esc(r.material)}</span>`;
                    if (r._isTotal) return `<span class="rd-items-total-label">Total</span>`;
                    return '';
                },
            },
            ...(showOperator ? [{
                key: 'operator',
                header: 'Operador',
                render: r => (r._isGroup || r._isTotal) ? '' : _esc(r.operator || '-'),
            }] : []),
            {
                key: 'quantity',
                header: 'Quantidade',
                width: '120px',
                render: r => {
                    if (r._isGroup) return `<span class="rd-items-group-qty">${r._groupTotal}</span>`;
                    if (r._isTotal) return `<span class="rd-items-total-qty">${r._grandTotal}</span>`;
                    return String(r.quantity);
                },
            },
        ];
        this._itemsDataTable = createDataTable({
            columns,
            getRowKey: r => r._isGroup ? `group-${r.material}` : r._isTotal ? 'total' : r._idx,
            emptyMessage: 'Nenhum item adicionado.',
            emptyIcon: 'inventory_2',
            ...(!readOnly ? {
                onRowClick: r => { if (r._isGroup || r._isTotal) return; ReceiptsDetails.startEditItem(r._idx); },
                actions: [{
                    label: 'Remover',
                    icon: 'delete',
                    variant: 'destructive',
                    hidden: r => !!(r._isGroup || r._isTotal),
                    onClick: r => ReceiptsDetails.deleteItem(r._idx),
                }],
            } : {}),
        });
        this._itemsDataTable.mount(document.getElementById('rdItemsTableMount'));
        this._refreshDlgTable();

        if (!readOnly) {
            const codeInput = createInput({ id: 'rdItemCode', type: 'number', placeholder: 'Código', onInput: (_v, e) => ReceiptsDetails.validateItemCode(e.target) });
            document.getElementById('rdItemCodeMount').appendChild(codeInput.el);

            const qtyInput = createInput({ id: 'rdItemQty', type: 'number', placeholder: '0,00' });
            qtyInput.input.step = 'any'; qtyInput.input.min = '0.01';
            qtyInput.input.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); ReceiptsDetails._confirmItemDialog(); }
            });
            document.getElementById('rdItemQtyMount').appendChild(qtyInput.el);

            const pkgCountInput = createInput({ id: 'rdItemPkgCount', type: 'number', placeholder: '0', onInput: () => ReceiptsDetails._onDlgPkgCountChange() });
            pkgCountInput.input.step = '1'; pkgCountInput.input.min = '1';
            document.getElementById('rdItemPkgCountMount').appendChild(pkgCountInput.el);

            this._dlgMaterialSelect = createSelect({
                placeholder: 'Selecione um material', searchable: true,
                sections: [{ key: 'material', items: [] }],
                onChange: () => this._onDlgMaterialChange(),
            });
            this._dlgMaterialSelect.mount(document.getElementById('rdItemMaterialContainer'));
            this._dlgMaterialSelect.setItems('material', this._materialsCache.map(m => ({ value: m.name, label: m.name })));

            if (showOperator) {
                this._dlgOperatorSelect = createSelect({ placeholder: 'Selecione um operador', searchable: true, sections: [{ key: 'operator', items: [] }] });
                this._dlgOperatorSelect.mount(document.getElementById('rdItemOperatorContainer'));
                apiCall(API + '/operators').then(ops => {
                    this._dlgOperatorSelect?.setItems('operator', (ops || []).map(o => ({ value: o.name, label: o.name })));
                }).catch(() => {});
            }

            this._renderDlgFormActions();
        }
    },

    /** Renderiza os botões de ação do formulário inline no dialog de itens */
    _renderDlgFormActions() {
        const container = document.getElementById('rdDlgFormActions');
        if (!container) return;
        container.innerHTML = '';
        const isEdit = this._editingItemIndex !== null;
        const addBtn = createButton({
            label: isEdit ? 'Salvar' : 'Adicionar',
            variant: 'primary',
            icon: isEdit ? 'check' : 'add',
            onClick: () => ReceiptsDetails._confirmItemDialog(),
        });
        container.appendChild(addBtn.el);
        if (isEdit) {
            const cancelBtn = createButton({
                label: 'Cancelar',
                variant: 'secondary',
                onClick: () => ReceiptsDetails.cancelEditItem(),
            });
            container.appendChild(cancelBtn.el);
        }
    },

    /** Limpa o formulário inline do dialog de itens */
    _clearDlgForm() {
        this._dlgOperatorSelect?.clear?.();
        const qtyEl = document.getElementById('rdItemQty');
        if (qtyEl) qtyEl.value = '';
        const pkgGroup = document.getElementById('rdItemPkgGroup');
        if (pkgGroup) pkgGroup.style.display = 'none';
        const pkgFields = document.getElementById('rdItemPkgFields');
        if (pkgFields) pkgFields.style.display = 'none';
        const qtyWrap = document.getElementById('rdItemQtyWrap');
        if (qtyWrap) qtyWrap.style.display = '';

        const isLot = this._getMaterialTrackingMode(this._dlgMaterialSelect?.getValue()) === 'lots';
        const codeWrap = document.getElementById('rdItemCodeWrap');
        const codeEl = document.getElementById('rdItemCode');
        if (codeWrap) codeWrap.style.display = isLot ? '' : 'none';
        if (codeEl) codeEl.value = isLot ? this._getNextItemCode() : '';
    },

    /** Confirma o dialog de item — adiciona ou edita o item, persistindo imediatamente em modo DRAFT */
    async _confirmItemDialog() {
        const material = this._dlgMaterialSelect?.getValue() || '';
        const nature = document.getElementById("receiptNature").value;
        const itemOperator = this._dlgOperatorSelect?.getValue() || '';
        const isLot = this._getMaterialTrackingMode(material) === 'lots';
        const code = document.getElementById("rdItemCode")?.value?.trim() || '';

        if (isLot && !code) { alert("Preencha o código do item"); return; }
        if (!material) { alert("Selecione um material"); return; }

        const mode = document.getElementById('rdItemMode')?.value || 'qty';
        let quantity;
        if (mode === 'pkg') {
            const sel = document.getElementById('rdItemPkgSelect');
            const pkgQty = parseFloat(sel?.selectedOptions[0]?.dataset.qty) || 0;
            const count = parseInt(document.getElementById('rdItemPkgCount')?.value);
            if (!count || count <= 0) { alert('Informe a quantidade de embalagens'); return; }
            quantity = pkgQty > 0 ? Math.round(count * pkgQty * 1000) / 1000 : parseFloat(document.getElementById('rdItemQty')?.value);
        } else {
            quantity = parseFloat(document.getElementById('rdItemQty')?.value);
        }
        if (!quantity || quantity <= 0) { alert("Informe uma quantidade válida"); return; }
        if (nature === "P" && !itemOperator) { alert("Selecione o operador do item"); return; }

        const normalizedCode = isLot
            ? (() => { if (!/^\d+$/.test(code)) { alert("O código do item deve conter apenas números"); return null; } return Number.parseInt(code, 10); })()
            : this._getNextItemCode();
        if (normalizedCode === null) return;

        let packagingId = null, packagingCount = null;
        if (mode === 'pkg') {
            const sel = document.getElementById('rdItemPkgSelect');
            packagingId = sel?.value ? parseInt(sel.value) : null;
            packagingCount = parseInt(document.getElementById('rdItemPkgCount')?.value) || null;
        }

        const isDraft = this._isDraft();
        const receiptId = this._currentReceiptId();

        if (isDraft && receiptId) {
            // Modo DRAFT: persistir imediatamente no servidor
            try {
                if (this._editingItemIndex !== null) {
                    const origItem = this.items[this._editingItemIndex];
                    if (origItem._stockUnitId) {
                        // Lote DRAFT: atualiza via PUT
                        await apiCall(API + `/stock-units/${origItem._stockUnitId}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ volume_id: normalizedCode, material, weight: Number(quantity), operator: nature === "P" ? itemOperator : null })
                        });
                        this.items[this._editingItemIndex] = { ...origItem, code: normalizedCode, material, quantity: Number(quantity), operator: nature === "P" ? itemOperator : "", tracking_mode: 'lots', packaging_id: packagingId, packaging_count: packagingCount };
                    } else if (origItem._movementId) {
                        // Simple DRAFT: deleta e recria
                        await apiCall(API + `/stock-movements/${origItem._movementId}`, { method: "DELETE" });
                        const mat = this._materialsCache.find(m => m.name === material);
                        const resp = await apiCall(API + "/stock-movements/entry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ material_id: mat.id, quantity: Number(quantity), date: new Date().toISOString().slice(0, 10), receipt_id: receiptId, operator: nature === "P" ? itemOperator : null, status: 'DRAFT', location_id: this._locationSelect?.getValue() || null, packaging_id: packagingId, packaging_count: packagingCount }) });
                        this.items[this._editingItemIndex] = { _movementId: resp.id, _originalStatus: null, code: "", material, quantity: Number(quantity), operator: nature === "P" ? itemOperator : "", tracking_mode: 'simple', packaging_id: packagingId, packaging_count: packagingCount };
                    }
                    this._editingItemIndex = null;
                } else if (isLot) {
                    const resp = await apiCall(API + "/stock-units", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receipt_id: receiptId, volume_id: normalizedCode, material, weight: Number(quantity), status: "DRAFT", date_in: new Date().toISOString().slice(0, 10), supplier: this._supplierSelect?.getValue() || null, operator: nature === "P" ? itemOperator : null, location_id: this._locationSelect?.getValue() || null, packaging_id: packagingId, packaging_count: packagingCount }) });
                    this.items.push({ _stockUnitId: resp.id, _originalStatus: 'DRAFT', code: normalizedCode, material, quantity: Number(quantity), operator: nature === "P" ? itemOperator : "", tracking_mode: 'lots', packaging_id: packagingId, packaging_count: packagingCount });
                } else {
                    const mat = this._materialsCache.find(m => m.name === material);
                    const resp = await apiCall(API + "/stock-movements/entry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ material_id: mat.id, quantity: Number(quantity), date: new Date().toISOString().slice(0, 10), receipt_id: receiptId, operator: nature === "P" ? itemOperator : null, status: 'DRAFT', location_id: this._locationSelect?.getValue() || null, packaging_id: packagingId, packaging_count: packagingCount }) });
                    this.items.push({ _movementId: resp.id, _originalStatus: null, code: "", material, quantity: Number(quantity), operator: nature === "P" ? itemOperator : "", tracking_mode: 'simple', packaging_id: packagingId, packaging_count: packagingCount });
                }
            } catch (e) {
                alert("Erro ao salvar item"); return;
            }
        } else {
            // Modo local (edição de recebimento COMPLETED)
            if (this._editingItemIndex !== null) {
                const origItem = this.items[this._editingItemIndex];
                this.items[this._editingItemIndex] = { _stockUnitId: origItem._stockUnitId, _originalStatus: origItem._originalStatus, code: isLot ? normalizedCode : origItem.code, material, quantity: Number(quantity), operator: nature === "P" ? itemOperator : "", tracking_mode: isLot ? 'lots' : 'simple', packaging_id: packagingId, packaging_count: packagingCount };
                this._editingItemIndex = null;
            } else {
                this.items.push({ code: normalizedCode, material, quantity: Number(quantity), operator: nature === "P" ? itemOperator : "", tracking_mode: isLot ? 'lots' : 'simple', packaging_id: packagingId, packaging_count: packagingCount });
            }
            this._markDirty();
        }

        this._editingItemIndex = null;
        this._clearDlgForm();
        this._renderDlgFormActions();
        this._refreshItemsView();
        setTimeout(() => document.getElementById('rdItemQty')?.focus(), 0);
    },

    /** Reage à mudança de material no dialog — carrega packagings e mostra/esconde código */
    async _onDlgMaterialChange() {
        const selected = this._dlgMaterialSelect?.getValue();
        if (!selected) return;

        const mode = this._getMaterialTrackingMode(selected);
        const codeWrap = document.getElementById('rdItemCodeWrap');
        if (codeWrap) {
            codeWrap.style.display = mode === 'lots' ? '' : 'none';
            if (mode === 'lots' && this._editingItemIndex === null) {
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
            const qtyWrap = document.getElementById('rdItemQtyWrap');
            if (qtyWrap) qtyWrap.style.display = '';
        }
    },

    /** Alterna modo quantidade / embalagem no dialog */
    _onDlgModeChange() {
        const mode = document.getElementById('rdItemMode')?.value;
        const qtyWrap = document.getElementById('rdItemQtyWrap');
        const pkgFields = document.getElementById('rdItemPkgFields');
        if (mode === 'pkg') {
            if (pkgFields) pkgFields.style.display = '';
            // Se embalagem sem peso unitário, mostra qty também
            const sel = document.getElementById('rdItemPkgSelect');
            const hasPkgQty = parseFloat(sel?.selectedOptions[0]?.dataset.qty) > 0;
            if (qtyWrap) qtyWrap.style.display = hasPkgQty ? 'none' : '';
        } else {
            if (qtyWrap) qtyWrap.style.display = '';
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
            const qtyWrap = document.getElementById('rdItemQtyWrap');
            if (qtyWrap) qtyWrap.style.display = qty > 0 ? 'none' : '';
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
        const item = this.items[index];
        if (this._isDraft()) {
            if (item._stockUnitId) {
                apiCall(API + `/stock-units/${item._stockUnitId}`, { method: 'DELETE' }).catch(() => {});
            } else if (item._movementId) {
                apiCall(API + `/stock-movements/${item._movementId}`, { method: 'DELETE' }).catch(() => {});
            }
        }
        if (this._editingItemIndex === index) {
            this._editingItemIndex = null;
        } else if (this._editingItemIndex !== null && this._editingItemIndex > index) {
            this._editingItemIndex -= 1;
        }
        this.items.splice(index, 1);
        this._refreshItemsView();
    },

    /** Ativa o modo de edição: preenche o formulário inline no dialog aberto */
    startEditItem(index) {
        if (!this._itemsDialog) return;
        this._editingItemIndex = index;
        const item = this.items[index];
        this._dlgMaterialSelect?.setValue(item.material);
        if (this._dlgOperatorSelect) this._dlgOperatorSelect.setValue(item.operator || '');
        const codeEl = document.getElementById('rdItemCode');
        if (codeEl) codeEl.value = item.code || '';
        const qtyEl = document.getElementById('rdItemQty');
        if (qtyEl) qtyEl.value = item.quantity || '';
        const codeWrap = document.getElementById('rdItemCodeWrap');
        if (codeWrap) codeWrap.style.display = item.tracking_mode === 'lots' ? '' : 'none';
        this._renderDlgFormActions();
        this._refreshDlgTable();
    },
    cancelEditItem() {
        this._editingItemIndex = null;
        this._clearDlgForm();
        this._renderDlgFormActions();
        this._refreshDlgTable();
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

    /** Lida com o clique no botão Sair: mostra diálogo adequado antes de navegar */
    async _exitScreen() {
        if (this._isDraft()) {
            const canGo = await new Promise(resolve => {
                let resolved = false;
                const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };
                const dlg = createDialog({
                    title: 'Recebimento em rascunho',
                    bodyHTML: '<p>O que deseja fazer com este recebimento?</p>',
                    closeOnBackdrop: false,
                    actions: [
                        { label: 'Abandonar', variant: 'cancel', onClick: async () => {
                            const id = this._currentReceiptId();
                            if (id) await apiCall(API + `/receipts/${id}/abandon`, { method: 'PATCH' }).catch(() => {});
                            done(true); dlg.close();
                        }},
                        { label: 'Manter Rascunho', variant: 'secondary', onClick: async () => {
                            await this.saveHeaderOnly(); done(true); dlg.close();
                        }},
                    ],
                    onClose: () => done(false),
                });
                dlg.open();
            });
            if (canGo) {
                this._draftReceiptId = null;
                this._isDirty = false;
                this._bypassLeaveCheck = true;
                showScreen('receipts');
            }
            return;
        }
        if (this._isDirty) {
            const canGo = await new Promise(resolve => {
                let resolved = false;
                const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };
                const dlg = createDialog({
                    title: 'Alterações não salvas',
                    bodyHTML: '<p>Você tem alterações não salvas. O que deseja fazer?</p>',
                    closeOnBackdrop: false,
                    actions: [
                        { label: 'Sair sem salvar', variant: 'cancel', onClick: () => { done(true); dlg.close(); } },
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
        showScreen('receipts');
    },

    // ── Renderização ──

    /** Renderiza o widget de itens: botão tracejado (vazio) ou resumo (com itens) */
    _renderItemsWidget() {
        const container = document.getElementById('rdItemsWidget');
        if (!container) return;
        const readOnly = this._isReadOnly();

        if (this.items.length === 0) {
            if (readOnly) {
                container.innerHTML = `<p class="rd-items-empty">Nenhum item adicionado.</p>`;
            } else {
                container.innerHTML = `
                    <button class="rd-items-dashed-btn" onclick="ReceiptsDetails.openItemsDialog()">
                        <span class="material-symbols-outlined">add</span>
                        Adicionar Itens
                    </button>`;
            }
        } else {
            const totalQty = this.items.reduce((sum, i) => sum + i.quantity, 0);
            const materials = [...new Set(this.items.map(i => i.material))];
            const matText = materials.length <= 2
                ? materials.map(m => _esc(m)).join(', ')
                : materials.slice(0, 2).map(m => _esc(m)).join(', ') + ` +${materials.length - 2} mais`;
            const count = this.items.length;
            container.innerHTML = `
                <div class="rd-items-summary${!readOnly ? ' rd-items-summary--clickable' : ''}" ${!readOnly ? 'onclick="ReceiptsDetails.openItemsDialog()"' : ''}>
                    <div class="rd-items-summary-left">
                        <i data-lucide="package-2" class="rd-items-summary-icon rd-items-summary-icon--left"></i>
                        <div class="rd-items-summary-info">
                            <span class="rd-items-summary-count">${count} ${count === 1 ? 'item' : 'itens'} · Total: ${totalQty}</span>
                            <span class="rd-items-summary-materials">${matText}</span>
                        </div>
                    </div>
                    ${!readOnly ? `<i data-lucide="pencil-line" class="rd-items-summary-icon"></i>` : ''}
                </div>`;
            if (!readOnly && typeof lucide !== 'undefined') lucide.createIcons({ nameAttr: 'data-lucide', rootNode: container });
        }
    },


    /** Atualiza o data table do dialog com os itens agrupados por material + linha de total */
    _refreshDlgTable() {
        if (!this._itemsDataTable) return;

        const groups = new Map();
        this.items.forEach((item, idx) => {
            if (!groups.has(item.material)) groups.set(item.material, []);
            groups.get(item.material).push({ ...item, _idx: idx });
        });

        const rows = [];
        for (const [material, entries] of groups) {
            const groupTotal = entries.reduce((s, e) => s + e.quantity, 0);
            rows.push({ _isGroup: true, material, _groupTotal: groupTotal, _count: entries.length });
            rows.push(...entries);
        }

        if (this.items.length > 0) {
            const grandTotal = this.items.reduce((s, i) => s + i.quantity, 0);
            rows.push({ _isTotal: true, _grandTotal: grandTotal });
        }

        this._itemsDataTable.setData(rows);
    },

    /** Atualiza total e widget de itens sem recarregar os dados do formulário */
    _refreshItemsView() {
        const totalQty = this.items.reduce((sum, item) => sum + item.quantity, 0);
        const qtyEl = document.getElementById("receiptQty");
        if (qtyEl) qtyEl.textContent = totalQty;
        this._renderItemsWidget();
        this._refreshDlgTable();
        this._updateHeaderFields();
        this._updateRequiredIndicators();
    },

    /** Renderiza os botões de ação na barra inferior e limpa o header */
    _renderActionBar() {
        const bar = document.getElementById('rdActionBar');
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
            onClick: () => ReceiptsDetails._exitScreen(),
        });
        exitBtn.el.style.minWidth = BTN_MIN_W;
        inner.appendChild(exitBtn.el);

        const isDraft = this._isDraft();
        const isNew = !Receipts.selectedReceipt;

        if (isDraft || isNew) {
            if (hasPermission('procurement', 'receipts', 'create')) {
                const confirmBtn = createButton({
                    label: 'Confirmar',
                    variant: 'primary',
                    icon: 'check',
                    onClick: () => ReceiptsDetails.confirmReceipt(),
                });
                confirmBtn.el.style.minWidth = BTN_MIN_W;
                inner.appendChild(confirmBtn.el);
            }
        } else {
            if (hasPermission('procurement', 'receipts', 'edit')) {
                const editBtn = createButton({
                    label: 'Salvar',
                    variant: 'primary',
                    icon: 'check',
                    onClick: () => ReceiptsDetails.editReceipt(),
                });
                editBtn.el.style.minWidth = BTN_MIN_W;
                inner.appendChild(editBtn.el);
            }
        }
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
        const nature = document.getElementById('receiptNature')?.value;

        const reqNature = document.getElementById('reqNature');
        if (reqNature) reqNature.style.visibility = nature ? 'hidden' : 'visible';

        const dateVal = document.getElementById('receiptDate')?.value;
        const reqDate = document.getElementById('reqDate');
        if (reqDate) reqDate.style.visibility = dateVal ? 'hidden' : 'visible';

        if (nature === 'C' || nature === 'S') {
            const reqSupplier = document.getElementById('reqSupplier');
            if (reqSupplier) reqSupplier.style.visibility = this._supplierSelect?.getValue() ? 'hidden' : 'visible';
        }
    },

    /** Limpa os botões de ação da barra de header e da barra inferior */
    _clearHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) headerOptions.innerHTML = "";
        const bar = document.getElementById('rdActionBar');
        if (bar) bar.innerHTML = '';
    },



    /** Controla a visibilidade das linhas do formulário conforme a natureza selecionada */
    updateFormVisibility(nature) {
        const rowSupplier = document.getElementById('rowSupplier');
        const rowDate     = document.getElementById('rowDate');
        const rowOrder    = document.getElementById('rowOrder');

        if (nature === 'P') {
            if (rowSupplier) rowSupplier.style.display = 'none';
            if (rowDate)     rowDate.style.display = '';
            if (rowOrder)    rowOrder.style.display = 'none';
        } else if (nature === 'C' || nature === 'S') {
            if (rowSupplier) rowSupplier.style.display = '';
            if (rowDate)     rowDate.style.display = '';
            if (rowOrder)    rowOrder.style.display = '';
        } else {
            if (rowSupplier) rowSupplier.style.display = 'none';
            if (rowDate)     rowDate.style.display = 'none';
            if (rowOrder)    rowOrder.style.display = 'none';
        }

        this._refreshDlgTable();
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

        this.updateFormVisibility(nature);

        if (!nature) {
            const id = this._currentReceiptId();
            document.getElementById("receiptCode").value = id ? `#---${id}` : "";
            this._updateHeaderFields();
            return;
        }

        // Para rascunhos, o ID já é conhecido — só atualiza o display
        const id = this._currentReceiptId();
        if (id) {
            document.getElementById("receiptCode").value = `#${nature}${id}`;
            this._updateHeaderFields();
            return;
        }

        // Se está editando um recebimento existente COMPLETED, mantém o código original
        if (Receipts.selectedReceipt) {
            document.getElementById("receiptCode").value = `#${nature}${Receipts.selectedReceipt.id}`;
            this._updateHeaderFields();
        }
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
        const baseData = {
            id: parseInt(document.getElementById("receiptCode").value.slice(2)),
            nature: nature,
            date: document.getElementById("receiptDate").value
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

    /** Obtém o próximo código de item com base nos itens já adicionados */
    _getNextItemCode() {
        if (this.items.length === 0) return 1;
        const maxCode = Math.max(...this.items.map(item => parseInt(item.code, 10) || 0));
        return maxCode + 1;
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
