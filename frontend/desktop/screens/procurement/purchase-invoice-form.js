/**
 * purchase-invoice-form.js
 * Tela de formulário para criação de Faturas de Compras.
 * Estrutura em abas: Detalhes, Itens, Pagamento, Transportador, Impressão.
 */
const PurchaseInvoiceForm = {

    // ── Estado ──────────────────────────────────────────────────────────────

    _savedId: null,
    _isDirty: false,
    _supplierId: null,
    _suppliersCache: [],
    _availableReceipts: [],
    _selectedReceiptIds: [],
    _items: [],
    _installments: [],
    _activeTab: 'detalhes',
    _supplierProducts: [],     // {material_id, material_name, unit_price, unit_of_measure}
    _supplierPaymentTerms: [], // {days}
    _supplierLoadedId: null,   // id do fornecedor cujos dados já estão cacheados

    // ── Componentes ──────────────────────────────────────────────────────────

    _tabs: null,
    _supplierSelect: null,
    _receiptsSelect: null,
    _detailItemsWidget: null,
    _detailPaymentWidget: null,
    _layoutSelect: null,
    _uppercaseToggle: null,
    _printBtn: null,
    _saveBtn: null,
    _numberInput: null,
    _docTypeInput: null,
    _dateEmissionInput: null,
    _dateReceiptInput: null,
    _transporterInput: null,
    _driverInput: null,
    _plateInput: null,
    _freightInput: null,
    _itemsRowEditors: [],
    _installmentsRowEditors: [],

    // ── Ciclo de Vida ────────────────────────────────────────────────────────

    render() {
        this._savedId = null;
        this._isDirty = false;
        this._supplierId = null;
        this._suppliersCache = [];
        this._availableReceipts = [];
        this._selectedReceiptIds = [];
        this._items = [];
        this._installments = [];
        this._activeTab = 'detalhes';
        this._supplierProducts = [];
        this._supplierPaymentTerms = [];
        this._supplierLoadedId = null;

        this._tabs?.destroy();              this._tabs = null;
        this._supplierSelect?.destroy();    this._supplierSelect = null;
        this._receiptsSelect?.destroy();    this._receiptsSelect = null;
        this._detailItemsWidget?.destroy(); this._detailItemsWidget = null;
        this._detailPaymentWidget?.destroy(); this._detailPaymentWidget = null;
        this._layoutSelect?.destroy();      this._layoutSelect = null;
        this._uppercaseToggle?.destroy();   this._uppercaseToggle = null;
        this._numberInput?.destroy();       this._numberInput = null;
        this._docTypeInput?.destroy();      this._docTypeInput = null;
        this._dateEmissionInput?.destroy(); this._dateEmissionInput = null;
        this._dateReceiptInput?.destroy();  this._dateReceiptInput = null;
        this._transporterInput?.destroy();  this._transporterInput = null;
        this._driverInput?.destroy();       this._driverInput = null;
        this._plateInput?.destroy();        this._plateInput = null;
        this._freightInput?.destroy();      this._freightInput = null;
        this._destroyItemsEditors();
        this._destroyInstallmentsEditors();
        this._printBtn = null;
        this._saveBtn = null;

        return `
        <div class="pif-container">

            <div class="pif-sticky-header">
                <div class="rd-content pif-header">
                    <h1 id="pifTitle">Fatura de Compras</h1>
                    <div class="pif-header-actions">
                        <div id="pifPrintBtnMount"></div>
                    </div>
                </div>
                <div class="rd-content pif-tabs-row">
                    <div id="pifTabsMount"></div>
                </div>
            </div>

            <div class="pif-body">
                <div class="rd-content">

                <div class="pif-panel" data-tab="detalhes">

                    <div class="rd-section">
                        <h2 class="rd-section-title">Dados da Fatura</h2>
                        <div class="rd-form-row">
                            <div class="rd-form-label">
                                <span class="rd-field-name">Documento / Número <span class="required">*</span></span>
                            </div>
                            <div class="rd-form-field pif-field-pair">
                                <div id="pifDocTypeMount"></div>
                                <div id="pifNumberMount"></div>
                            </div>
                        </div>
                        <div class="rd-form-row">
                            <div class="rd-form-label">
                                <span class="rd-field-name">Emissão <span class="required">*</span> / Recebimento</span>
                            </div>
                            <div class="rd-form-field pif-field-pair">
                                <div id="pifDateEmissionMount"></div>
                                <div id="pifDateReceiptMount"></div>
                            </div>
                        </div>
                    </div>

                    <div class="rd-section">
                        <h2 class="rd-section-title">Fornecedor e Recebimentos</h2>
                        <div class="rd-form-row">
                            <div class="rd-form-label">
                                <span class="rd-field-name">Fornecedor <span class="required">*</span></span>
                                <span class="rd-field-desc">Empresa fornecedora dos materiais</span>
                            </div>
                            <div class="rd-form-field"><div id="pifSupplierMount"></div></div>
                        </div>
                        <div class="rd-form-row" id="pifReceiptsRow">
                            <div class="rd-form-label">
                                <span class="rd-field-name">Recebimentos</span>
                                <span class="rd-field-desc">Selecione os recebimentos a faturar</span>
                            </div>
                            <div class="rd-form-field">
                                <div id="pifReceiptsMount"></div>
                                <p id="pifReceiptsHint" class="pif-hint" style="display:none"></p>
                            </div>
                        </div>
                    </div>

                    <div class="rd-section">
                        <h2 class="rd-section-title">Itens</h2>
                        <div id="pifDetailItemsArea"></div>
                    </div>

                    <div class="rd-section">
                        <h2 class="rd-section-title">Pagamento</h2>
                        <div id="pifDetailPaymentArea"></div>
                    </div>

                </div>

                <div class="pif-panel" data-tab="itens">
                    <div class="rd-section">
                        <h2 class="rd-section-title">Itens da Fatura</h2>
                        <div id="pifItemsTableArea"></div>
                    </div>
                </div>

                <div class="pif-panel" data-tab="pagamento">
                    <div class="rd-section">
                        <h2 class="rd-section-title">Parcelas</h2>
                        <div id="pifInstallmentsArea"></div>
                    </div>
                </div>

                <div class="pif-panel" data-tab="transporte">
                    <div class="rd-section">
                        <h2 class="rd-section-title">Transporte <span class="pif-section-optional">(opcional)</span></h2>
                        <div class="rd-form-row">
                            <div class="rd-form-label">
                                <span class="rd-field-name">Transportador</span>
                                <span class="rd-field-desc">Nome da empresa transportadora</span>
                            </div>
                            <div class="rd-form-field"><div id="pifTransporterMount"></div></div>
                        </div>
                        <div class="rd-form-row">
                            <div class="rd-form-label">
                                <span class="rd-field-name">Motorista</span>
                                <span class="rd-field-desc">Nome do motorista responsável</span>
                            </div>
                            <div class="rd-form-field"><div id="pifDriverMount"></div></div>
                        </div>
                        <div class="rd-form-row">
                            <div class="rd-form-label">
                                <span class="rd-field-name">Placa</span>
                                <span class="rd-field-desc">Placa do veículo de transporte</span>
                            </div>
                            <div class="rd-form-field"><div id="pifPlateMount"></div></div>
                        </div>
                        <div class="rd-form-row">
                            <div class="rd-form-label">
                                <span class="rd-field-name">Valor do Frete</span>
                                <span class="rd-field-desc">Soma ao total para cálculo das parcelas</span>
                            </div>
                            <div class="rd-form-field"><div id="pifFreightMount"></div></div>
                        </div>
                    </div>
                </div>

                <div class="pif-panel" data-tab="impressao">
                    <div class="rd-section">
                        <h2 class="rd-section-title">Configurações de Impressão</h2>
                        <div class="rd-form-row">
                            <div class="rd-form-label">
                                <span class="rd-field-name">Layout</span>
                                <span class="rd-field-desc">Estilo visual do documento impresso</span>
                            </div>
                            <div class="rd-form-field"><div id="pifLayoutMount"></div></div>
                        </div>
                        <div class="rd-form-row">
                            <div class="rd-form-label">
                                <span class="rd-field-name">Caixa Alta</span>
                                <span class="rd-field-desc">Texto todo em letras maiúsculas no impresso</span>
                            </div>
                            <div class="rd-form-field"><div id="pifUppercaseMount"></div></div>
                        </div>
                    </div>
                </div>

                </div>
            </div>

            <div class="rd-action-bar" id="pifActionBar"></div>
        </div>`;
    },

    async load() {
        const globalHeader = document.getElementById('headerOptionsContent');
        if (globalHeader) globalHeader.innerHTML = '';

        this._mountTabs();
        this._mountHeaderButtons();
        this._renderActionBar();
        this._mountFormInputs();
        this._mountPrintSettings();
        this._mountReceiptsSelect();
        this._renderDetailItems();
        this._renderDetailPayment();
        this._renderItemsTable();
        this._renderInstallmentsTable();
        await this._loadSuppliers();

        const editingId = PurchaseInvoices.selectedInvoice?.id || null;
        if (editingId) await this._loadForEdit(editingId);

        this._setActiveTab('detalhes');
    },

    async canLeave() {
        if (!this._isDirty) return true;
        return confirm('Há alterações não salvas. Deseja sair mesmo assim?');
    },

    // ── Ações Públicas ───────────────────────────────────────────────────────

    async loadReceiptsForSupplier() {
        const supplierId = this._supplierSelect?.getValue();
        if (!supplierId) {
            this._supplierId = null;
            this._selectedReceiptIds = [];
            this._items = [];
            this._availableReceipts = [];
            this._supplierProducts = [];
            this._supplierPaymentTerms = [];
            this._supplierLoadedId = null;
            this._receiptsSelect?.clear();
            this._receiptsSelect?.setItems([]);
            this._receiptsSelect?.setDisabled(true);
            this._setReceiptsHint('Selecione um fornecedor para listar os recebimentos.');
            this._renderDetailItems();
            this._renderItemsTable();
            return;
        }
        this._supplierId = Number(supplierId);

        this._selectedReceiptIds = [];
        this._items = [];
        this._renderDetailItems();
        this._renderItemsTable();
        this._receiptsSelect?.clear();
        this._receiptsSelect?.setDisabled(true);
        this._setReceiptsHint('Carregando recebimentos...');

        this._loadSupplierCatalog(this._supplierId);

        try {
            const url = `/purchase-invoices/available-receipts/${this._supplierId}` +
                (this._savedId ? `?invoiceId=${this._savedId}` : '');
            this._availableReceipts = await apiCall(API + url);
            this._populateReceiptsSelect();
        } catch {
            this._setReceiptsHint('Erro ao carregar recebimentos.', true);
        }
    },

    async _loadSupplierCatalog(supplierId) {
        if (!supplierId || this._supplierLoadedId === supplierId) return;
        try {
            const sup = await apiCall(API + `/suppliers/${supplierId}`);
            this._supplierProducts = (sup.products || []).map(p => ({
                material_id: Number(p.material_id),
                material_name: p.material_name || '',
                unit_of_measure: p.unit_of_measure || '',
                unit_price: Number(p.unit_price || 0),
            }));
            this._supplierPaymentTerms = (sup.payment_terms || []).map(t => ({ days: Number(t.days || 0) }));
            this._supplierLoadedId = supplierId;
        } catch {
            this._supplierProducts = [];
            this._supplierPaymentTerms = [];
            this._supplierLoadedId = supplierId;
        }
    },

    async _loadForEdit(id) {
        try {
            const inv = await apiCall(API + `/purchase-invoices/${id}`);
            this._savedId = id;
            this._supplierId = inv.supplier_id;
            const titleEl = document.getElementById('pifTitle');
            if (titleEl) titleEl.textContent = `Fatura de Compras Nº ${inv.number || id}`;

            this._numberInput?.setValue(inv.number || '');
            if (inv.date_emission) this._dateEmissionInput?.setValue(new Date(inv.date_emission + 'T00:00:00'));
            if (inv.date_receipt) this._dateReceiptInput?.setValue(new Date(inv.date_receipt + 'T00:00:00'));
            this._transporterInput?.setValue(inv.transporter_name || '');
            this._driverInput?.setValue(inv.driver_name || '');
            this._plateInput?.setValue(inv.plate || '');
            this._freightInput?.setValue(Number(inv.freight_amount || 0).toFixed(2));
            this._suppressSupplierChange = true;
            this._supplierSelect?.setValue(String(inv.supplier_id));
            this._suppressSupplierChange = false;

            this._items = (inv.items || []).map(it => ({
                item_number: it.item_number,
                description: it.description,
                unit_measure: it.unit_measure,
                quantity: Number(it.quantity || 0),
                unit_price: Number(it.unit_price || 0),
                total_value: Number(it.total_value || 0),
            }));
            this._installments = (inv.installments || []).map(i => ({
                days: Number(i.days || 0),
                due_date: i.due_date ? new Date(i.due_date + 'T00:00:00') : null,
                amount: Number(i.amount || 0),
            }));
            this._selectedReceiptIds = (inv.receipt_ids || []).map(Number);

            this._availableReceipts = await apiCall(API + `/purchase-invoices/available-receipts/${this._supplierId}?invoiceId=${this._savedId}`);
            this._populateReceiptsSelect();
            this._receiptsSelect?.setValues?.(this._selectedReceiptIds);
            await this._loadSupplierCatalog(this._supplierId);

            const productByName = new Map(this._supplierProducts.map(p => [p.material_name, p]));
            this._items.forEach(it => {
                if (!it.material_id) {
                    const sup = productByName.get(it.description);
                    if (sup) it.material_id = Number(sup.material_id);
                }
            });

            this._renderItemsTable();
            this._renderInstallmentsTable();
            this._renderDetailItems();
            this._renderDetailPayment();

            this._isDirty = false;
            this._updatePrintBtn();
        } catch (e) {
            alert(e.message || 'Erro ao carregar fatura para edição');
        }
    },

    async onReceiptsChange(values) {
        this._selectedReceiptIds = (values || []).map(Number);
        if (this._selectedReceiptIds.length === 0) {
            this._items = [];
            this._renderDetailItems();
            this._renderItemsTable();
            this._renderDetailPayment();
            this._markDirty();
            return;
        }
        try {
            await this._loadSupplierCatalog(this._supplierId);
            await this._buildItemsFromReceipts();
            this._applySupplierPaymentTerms();
            this._renderDetailItems();
            this._renderItemsTable();
            this._renderInstallmentsTable();
            this._renderDetailPayment();
            this._markDirty();
        } catch {
            showToast('Erro ao montar itens dos recebimentos', 'danger');
        }
    },

    _applySupplierPaymentTerms() {
        if (this._installments.length > 0) return;
        if (!this._supplierPaymentTerms || this._supplierPaymentTerms.length === 0) return;

        const itemsTotal = this._items.reduce((s, i) => s + (i.total_value || 0), 0);
        const freight = parseFloat(this._freightInput?.getValue() || '0') || 0;
        const total = itemsTotal + freight;
        const n = this._supplierPaymentTerms.length;
        const perInst = n > 0 ? total / n : 0;

        this._installments = this._supplierPaymentTerms.map(t => ({
            days: Number(t.days || 0),
            due_date: this._dueDateFromDays(Number(t.days || 0)),
            amount: Number(perInst.toFixed(2)),
        }));
    },

    async save() {
        const number = this._numberInput?.getValue()?.trim() ?? '';
        const date_emission = _dateToISO(this._dateEmissionInput?.getValue());
        const date_receipt = _dateToISO(this._dateReceiptInput?.getValue());
        const transporter_name = this._transporterInput?.getValue()?.trim() || null;
        const driver_name = this._driverInput?.getValue()?.trim() || null;
        const plate = this._plateInput?.getValue()?.trim() || null;
        const freight_amount = parseFloat(this._freightInput?.getValue() || '0') || 0;

        if (!number) { alert('Informe o número do documento'); return; }
        if (!date_emission) { alert('Informe a data de emissão'); return; }
        if (!this._supplierId) { alert('Selecione um fornecedor'); return; }
        if (this._items.length === 0) { alert('A fatura precisa ter ao menos um item'); return; }

        if (this._installments.length > 0) {
            const itemsTotal = this._items.reduce((s, i) => s + (i.total_value || 0), 0);
            const target = itemsTotal + freight_amount;
            const sumInst = this._installments.reduce((s, i) => s + (i.amount || 0), 0);
            if (Math.abs(target - sumInst) > 0.01) {
                alert('A soma das parcelas não bate com o total da fatura. Corrija os valores antes de salvar.');
                return;
            }
        }

        const total_amount = this._items.reduce((s, i) => s + (i.total_value || 0), 0);

        const firstInst = this._installments[0] || null;
        const payment_days = firstInst?.days ?? 0;
        const due_date = firstInst ? _dateToISO(firstInst.due_date) : null;

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
            freight_amount,
            receipt_ids: this._selectedReceiptIds,
            items: this._items.map(({ item_number, description, unit_measure, quantity, unit_price, total_value }) =>
                ({ item_number, description, unit_measure, quantity, unit_price, total_value })),
            installments: this._installments.map((i, idx) => ({
                seq: idx + 1,
                days: Number(i.days || 0),
                due_date: _dateToISO(i.due_date),
                amount: Number(i.amount || 0),
            })),
        };

        this._saveBtn?.setLoading(true);
        try {
            const isEdit = !!this._savedId;
            const url = isEdit ? `/purchase-invoices/${this._savedId}` : '/purchase-invoices';
            const saved = await apiCall(API + url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            this._savedId = saved?.id || this._savedId;
            this._isDirty = false;
            this._updatePrintBtn();
            showToast(isEdit ? 'Fatura atualizada com sucesso!' : 'Fatura salva com sucesso!', 'success');
            await this._syncSupplierFromInvoice();
        } catch (e) {
            alert(e.message || 'Erro ao salvar fatura');
        } finally {
            this._saveBtn?.setLoading(false);
        }
    },

    // ── Sincronização opcional com cadastro do fornecedor ───────────────────

    async _syncSupplierFromInvoice() {
        if (!this._supplierId) return;
        await this._loadSupplierCatalog(this._supplierId);

        const productDiffs = this._collectProductDiffs();
        if (productDiffs.length > 0) {
            const lines = productDiffs.map(d =>
                `• ${d.material_name}: R$ ${_fmtMoney(d.old_price)} → R$ ${_fmtMoney(d.new_price)}`
            ).join('\n');
            const msg = `Os seguintes valores diferem do cadastro do fornecedor:\n\n${lines}\n\nDeseja atualizar o cadastro com os novos valores?`;
            if (confirm(msg)) {
                try {
                    const merged = this._buildUpdatedProductsList(productDiffs);
                    await apiCall(API + `/suppliers/${this._supplierId}/products`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ products: merged }),
                    });
                    this._supplierProducts = merged.map(p => {
                        const existing = this._supplierProducts.find(x => x.material_id === p.material_id);
                        return {
                            material_id: p.material_id,
                            material_name: existing?.material_name || '',
                            unit_of_measure: existing?.unit_of_measure || '',
                            unit_price: p.unit_price,
                        };
                    });
                    showToast('Produtos do fornecedor atualizados.', 'success');
                } catch (e) {
                    showToast(e.message || 'Erro ao atualizar produtos do fornecedor', 'danger');
                }
            }
        }

        if (this._hasPaymentTermsDiff()) {
            const oldList = this._supplierPaymentTerms.map(t => `${t.days}d`).join(', ') || '(nenhum)';
            const newList = this._installments.map(i => `${i.days}d`).join(', ') || '(nenhum)';
            const msg = `Os prazos da fatura diferem do cadastro do fornecedor:\n\nCadastro: ${oldList}\nFatura:   ${newList}\n\nDeseja atualizar o cadastro com os novos prazos?`;
            if (confirm(msg)) {
                try {
                    const payment_terms = this._installments.map(i => ({ days: Number(i.days || 0) }));
                    await apiCall(API + `/suppliers/${this._supplierId}/payment-terms`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ payment_terms }),
                    });
                    this._supplierPaymentTerms = payment_terms;
                    showToast('Prazos do fornecedor atualizados.', 'success');
                } catch (e) {
                    showToast(e.message || 'Erro ao atualizar prazos do fornecedor', 'danger');
                }
            }
        }
    },

    /** Itens cuja cotação difere do cadastro do fornecedor (apenas produtos já cadastrados). */
    _collectProductDiffs() {
        const diffs = [];
        for (const item of this._items) {
            if (!item.material_id) continue;
            const reg = this._supplierProducts.find(p => p.material_id === item.material_id);
            if (!reg) continue;
            const newPrice = Number(item.unit_price || 0);
            const oldPrice = Number(reg.unit_price || 0);
            if (Math.abs(newPrice - oldPrice) > 0.001) {
                diffs.push({
                    material_id: item.material_id,
                    material_name: reg.material_name || item.description,
                    old_price: oldPrice,
                    new_price: newPrice,
                });
            }
        }
        return diffs;
    },

    /** Aplica os diffs na lista de produtos do fornecedor, preservando os demais. */
    _buildUpdatedProductsList(diffs) {
        const diffMap = new Map(diffs.map(d => [d.material_id, d.new_price]));
        return this._supplierProducts.map(p => ({
            material_id: p.material_id,
            unit_price: diffMap.has(p.material_id) ? diffMap.get(p.material_id) : p.unit_price,
        }));
    },

    _hasPaymentTermsDiff() {
        const cur = this._installments.map(i => Number(i.days || 0)).sort((a, b) => a - b);
        const reg = this._supplierPaymentTerms.map(t => Number(t.days || 0)).sort((a, b) => a - b);
        if (cur.length !== reg.length) return true;
        for (let i = 0; i < cur.length; i++) {
            if (cur[i] !== reg[i]) return true;
        }
        return false;
    },

    print() {
        if (!this._savedId || this._isDirty) return;
        const token = localStorage.getItem('wcm.auth.token');
        const layout = this._layoutSelect?.getValue() || localStorage.getItem('wcm.purchase-invoices.layout') || 'padrao';
        const uppercase = this._uppercaseToggle?.getValue() === '1' ? 1 : 0;
        window.open(
            API + `/purchase-invoices/print/${this._savedId}?token=${encodeURIComponent(token)}&layout=${layout}&uppercase=${uppercase}`,
            '_blank'
        );
    },

    // ── Tabs ─────────────────────────────────────────────────────────────────

    _mountTabs() {
        const mount = document.getElementById('pifTabsMount');
        if (!mount) return;
        this._tabs?.destroy();
        this._tabs = createTabs({
            tabs: [
                { key: 'detalhes',     label: 'Detalhes'     },
                { key: 'itens',        label: 'Itens'        },
                { key: 'pagamento',    label: 'Pagamento'    },
                { key: 'transporte',   label: 'Transporte'   },
                { key: 'impressao',    label: 'Impressão'    },
            ],
            active: this._activeTab,
            onChange: key => this._setActiveTab(key),
        });
        this._tabs.mount(mount);
    },

    _setActiveTab(key) {
        this._activeTab = key;
        document.querySelectorAll('.pif-panel').forEach(p => {
            p.classList.toggle('pif-panel--active', p.dataset.tab === key);
        });
        if (this._tabs && this._tabs.getActive() !== key) this._tabs.setActive(key);
    },

    // ── Privado ──────────────────────────────────────────────────────────────

    _markDirty() {
        this._isDirty = true;
        this._updatePrintBtn();
    },

    _updatePrintBtn() {
        if (!this._printBtn) return;
        const canPrint = !!this._savedId && !this._isDirty;
        this._printBtn.setDisabled(!canPrint);
    },

    _mountHeaderButtons() {
        this._printBtn = createButton({
            label: 'Imprimir',
            variant: 'secondary',
            icon: 'print',
            disabled: true,
            onClick: () => this.print(),
        });
        document.getElementById('pifPrintBtnMount')?.appendChild(this._printBtn.el);
    },

    _renderActionBar() {
        const bar = document.getElementById('pifActionBar');
        if (!bar) return;
        bar.innerHTML = '';

        const inner = document.createElement('div');
        inner.className = 'rd-action-bar-inner';
        bar.appendChild(inner);

        const BTN_MIN_W = '6.5rem';

        const exitBtn = createButton({
            label: 'Sair',
            variant: 'cancel',
            onClick: () => showScreen('purchase-invoices'),
        });
        exitBtn.el.style.minWidth = BTN_MIN_W;
        inner.appendChild(exitBtn.el);

        this._saveBtn = createButton({
            label: 'Salvar',
            variant: 'primary',
            icon: 'check',
            onClick: () => this.save(),
        });
        this._saveBtn.el.style.minWidth = BTN_MIN_W;
        inner.appendChild(this._saveBtn.el);
    },

    _mountFormInputs() {
        const today = new Date();

        this._docTypeInput = createInput({ value: 'NCI', readonly: true });
        document.getElementById('pifDocTypeMount')?.appendChild(this._docTypeInput.el);

        this._numberInput = createInput({
            placeholder: 'Ex: 001234',
            onInput: () => this._markDirty(),
        });
        document.getElementById('pifNumberMount')?.appendChild(this._numberInput.el);

        this._dateEmissionInput = createDatePicker({
            value: today,
            clearable: false,
            onChange: () => { this._markDirty(); this._recalcInstallmentDueDates(); },
        });
        this._dateEmissionInput.mount(document.getElementById('pifDateEmissionMount'));

        this._dateReceiptInput = createDatePicker({
            value: today,
            onChange: () => this._markDirty(),
        });
        this._dateReceiptInput.mount(document.getElementById('pifDateReceiptMount'));

        this._transporterInput = createInput({
            placeholder: 'Nome do transportador',
            onInput: () => this._markDirty(),
        });
        document.getElementById('pifTransporterMount')?.appendChild(this._transporterInput.el);

        this._driverInput = createInput({
            placeholder: 'Nome do motorista',
            onInput: () => this._markDirty(),
        });
        document.getElementById('pifDriverMount')?.appendChild(this._driverInput.el);

        this._plateInput = createInput({
            placeholder: 'AAA-0000',
            onInput: () => this._markDirty(),
        });
        document.getElementById('pifPlateMount')?.appendChild(this._plateInput.el);

        this._freightInput = createInput({
            type: 'number',
            prefix: 'R$',
            placeholder: '0,00',
            value: '0',
            onInput: () => { this._markDirty(); this._refreshInstallmentsTotals(); },
        });
        this._freightInput.input.min = '0';
        this._freightInput.input.step = '0.01';
        document.getElementById('pifFreightMount')?.appendChild(this._freightInput.el);
    },

    _mountPrintSettings() {
        const savedLayout = localStorage.getItem('wcm.purchase-invoices.layout') || 'padrao';

        this._layoutSelect = createSelect({
            placeholder: 'Layout de impressão',
            sections: [{ key: 'layout', items: [
                { value: 'padrao',       label: 'Padrão'       },
                { value: 'limpa',        label: 'Limpa'        },
                { value: 'profissional', label: 'Profissional' },
            ]}],
            onChange: val => {
                if (val) localStorage.setItem('wcm.purchase-invoices.layout', val);
            },
        });
        this._layoutSelect.mount(document.getElementById('pifLayoutMount'));
        this._layoutSelect.setValue(savedLayout);

        const savedUppercase = localStorage.getItem('wcm.purchase-invoices.uppercase') === '1' ? '1' : '0';
        this._uppercaseToggle = createToggleGroup({
            options: [
                { value: '0', label: 'Normal'    },
                { value: '1', label: 'Caixa Alta' },
            ],
            value: savedUppercase,
            onChange: val => {
                localStorage.setItem('wcm.purchase-invoices.uppercase', val === '1' ? '1' : '0');
            },
        });
        this._uppercaseToggle.mount(document.getElementById('pifUppercaseMount'));
    },

    async _loadSuppliers() {
        this._supplierSelect?.destroy();
        this._supplierSelect = createSelect({
            placeholder: 'Buscar fornecedor...',
            searchable: true,
            sections: [{ key: 'supplier', items: [] }],
            onChange: val => {
                if (this._suppressSupplierChange) return;
                if (val) {
                    this._markDirty();
                    this.loadReceiptsForSupplier();
                }
            },
        });
        this._supplierSelect.mount(document.getElementById('pifSupplierMount'));

        try {
            const suppliers = await apiCall(API + '/suppliers');
            this._suppliersCache = suppliers || [];
            this._supplierSelect.setItems('supplier', suppliers.map(s => ({ value: String(s.id), label: s.name })));
        } catch {
            showToast('Erro ao carregar fornecedores', 'danger');
        }
    },

    _setReceiptsHint(text, isError = false) {
        const hint = document.getElementById('pifReceiptsHint');
        if (!hint) return;
        if (!text) { hint.style.display = 'none'; hint.textContent = ''; return; }
        hint.style.display = '';
        hint.textContent = text;
        hint.classList.toggle('pif-hint--error', !!isError);
    },

    _mountReceiptsSelect() {
        const mount = document.getElementById('pifReceiptsMount');
        if (!mount) return;
        this._receiptsSelect?.destroy();
        this._receiptsSelect = createMultiSelect({
            placeholder: 'Selecionar recebimentos...',
            onChange: vals => this.onReceiptsChange(vals),
        });
        this._receiptsSelect.mount(mount);
        this._receiptsSelect.setDisabled(true);
        this._setReceiptsHint('Selecione um fornecedor para listar os recebimentos.');
    },

    _populateReceiptsSelect() {
        if (!this._receiptsSelect) return;

        if (!this._availableReceipts.length) {
            this._receiptsSelect.setItems([]);
            this._receiptsSelect.setDisabled(true);
            this._setReceiptsHint('Nenhum recebimento disponível para este fornecedor.');
            return;
        }
        this._setReceiptsHint('');
        this._receiptsSelect.setDisabled(false);

        const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
        const fmtQty = v => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg`;
        const codeOf = r => `#${r.nature || '-'}${r.id}`;

        this._receiptsSelect.setItems(this._availableReceipts.map(r => ({
            value: r.id,
            chipLabel: codeOf(r),
            rowHtml: `
                <span class="pif-receipt-row">
                    <span class="pif-receipt-row-code"><span class="code-badge">${_esc(codeOf(r))}</span></span>
                    <span class="pif-receipt-row-date">${_esc(fmtDate(r.date))}</span>
                    <span class="pif-receipt-row-qty">${_esc(fmtQty(r.total_weight))}</span>
                </span>`,
        })));
    },

    // ── Detalhes: widgets de resumo ──────────────────────────────────────────

    _renderDetailItems() {
        const area = document.getElementById('pifDetailItemsArea');
        if (!area) return;

        if (this._items.length === 0) {
            this._detailItemsWidget?.destroy(); this._detailItemsWidget = null;
            area.innerHTML = `<p class="pif-hint">Selecione um fornecedor e importe os recebimentos para ver os itens.</p>`;
            return;
        }

        if (!this._detailItemsWidget) {
            area.innerHTML = '';
            this._detailItemsWidget = createItemsWidget({
                icon: 'clipboard-list',
                onEdit: () => this._setActiveTab('itens'),
            });
            this._detailItemsWidget.mount(area);
        }

        const totalQty = this._items.reduce((s, i) => s + (i.quantity || 0), 0);
        this._detailItemsWidget.update({
            count: this._items.length,
            totalQty: Number(totalQty.toFixed(2)),
            lines: this._items.map(i => i.description),
        });
    },

    _renderDetailPayment() {
        const area = document.getElementById('pifDetailPaymentArea');
        if (!area) return;

        if (this._installments.length === 0) {
            this._detailPaymentWidget?.destroy(); this._detailPaymentWidget = null;
            area.innerHTML = `<p class="pif-hint">Adicione parcelas na aba Pagamento.</p>`;
            return;
        }

        if (!this._detailPaymentWidget) {
            area.innerHTML = '';
            this._detailPaymentWidget = createItemsWidget({
                icon: 'wallet',
                onEdit: () => this._setActiveTab('pagamento'),
            });
            this._detailPaymentWidget.mount(area);
        }

        const total = this._installments.reduce((s, i) => s + (i.amount || 0), 0);
        const n = this._installments.length;
        const lines = this._installments.map((i, idx) =>
            `${idx + 1}ª · ${i.due_date ? new Date(i.due_date).toLocaleDateString('pt-BR') : '—'}`);
        this._detailPaymentWidget.update({
            count: n,
            countLabel: `${n} ${n === 1 ? 'prazo' : 'prazos'}`,
            totalLabel: `R$ ${_fmtMoney(total)}`,
            lines,
        });
    },

    // ── Aba Itens: tabela editável ───────────────────────────────────────────

    _destroyItemsEditors() {
        this._itemsRowEditors.forEach(r => {
            r.descInput?.destroy();
            r.umInput?.destroy();
            r.qtyInput?.destroy();
            r.priceInput?.destroy();
        });
        this._itemsRowEditors = [];
    },

    _renderItemsTable() {
        const area = document.getElementById('pifItemsTableArea');
        if (!area) return;

        this._destroyItemsEditors();
        area.innerHTML = `
            <div class="pif-editor-table-wrap">
                <table class="pif-editor-table">
                    <thead>
                        <tr>
                            <th class="pif-col-num">#</th>
                            <th>Descrição</th>
                            <th class="pif-col-um">UM</th>
                            <th class="pif-col-qty">Qtd</th>
                            <th class="pif-col-price">Preço Unit.</th>
                            <th class="pif-col-total">Total</th>
                            <th class="pif-col-actions"></th>
                        </tr>
                    </thead>
                    <tbody id="pifItemsTbody"></tbody>
                </table>
                <div class="pif-editor-footer">
                    <div id="pifAddItemMount"></div>
                    <div class="pif-editor-total">Total: <strong id="pifItemsGrandTotal">R$ 0,00</strong></div>
                </div>
            </div>`;

        const tbody = document.getElementById('pifItemsTbody');
        this._items.forEach((item, idx) => this._appendItemRow(tbody, item, idx));

        if (this._items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="pif-editor-empty">Nenhum item. Adicione manualmente ou selecione recebimentos.</td></tr>`;
        }

        const addBtn = createButton({
            label: 'Adicionar Item',
            variant: 'secondary',
            icon: 'add',
            onClick: () => this._addItem(),
        });
        document.getElementById('pifAddItemMount')?.appendChild(addBtn.el);

        this._refreshItemsTotals();
    },

    _appendItemRow(tbody, item, idx) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="pif-col-num">${idx + 1}</td>
            <td><div class="pif-cell-desc"></div></td>
            <td><div class="pif-cell-um"></div></td>
            <td><div class="pif-cell-qty"></div></td>
            <td><div class="pif-cell-price"></div></td>
            <td class="pif-col-total pif-cell-total">R$ ${_fmtMoney(item.total_value)}</td>
            <td class="pif-col-actions"><button type="button" class="pif-icon-btn" title="Remover"><i data-lucide="trash-2"></i></button></td>`;
        tbody.appendChild(tr);

        const descInput = createInput({
            value: item.description || '',
            onInput: v => { item.description = v; this._markDirty(); },
        });
        tr.querySelector('.pif-cell-desc').appendChild(descInput.el);

        const umInput = createInput({
            value: item.unit_measure || 'KG',
            onInput: v => { item.unit_measure = v.toUpperCase(); this._markDirty(); },
        });
        tr.querySelector('.pif-cell-um').appendChild(umInput.el);

        const qtyInput = createInput({
            type: 'number',
            value: String(item.quantity ?? 0),
            onInput: v => {
                item.quantity = parseFloat(v) || 0;
                item.total_value = (item.unit_price || 0) * item.quantity;
                tr.querySelector('.pif-cell-total').textContent = `R$ ${_fmtMoney(item.total_value)}`;
                this._refreshItemsTotals();
                this._refreshInstallmentsTotals();
                this._markDirty();
            },
        });
        qtyInput.input.min = '0';
        qtyInput.input.step = '0.01';
        tr.querySelector('.pif-cell-qty').appendChild(qtyInput.el);

        const priceInput = createInput({
            type: 'number',
            prefix: 'R$',
            value: Number(item.unit_price || 0).toFixed(2),
            onInput: v => {
                item.unit_price = parseFloat(v) || 0;
                item.total_value = item.unit_price * (item.quantity || 0);
                tr.querySelector('.pif-cell-total').textContent = `R$ ${_fmtMoney(item.total_value)}`;
                this._refreshItemsTotals();
                this._refreshInstallmentsTotals();
                this._markDirty();
            },
        });
        priceInput.input.min = '0';
        priceInput.input.step = '0.01';
        tr.querySelector('.pif-cell-price').appendChild(priceInput.el);

        tr.querySelector('.pif-icon-btn').addEventListener('click', () => this._removeItem(idx));

        this._itemsRowEditors.push({ descInput, umInput, qtyInput, priceInput });

        if (typeof lucide !== 'undefined') lucide.createIcons({ rootNode: tr });
    },

    _addItem() {
        const nextNum = (this._items[this._items.length - 1]?.item_number || 0) + 1;
        this._items.push({
            item_number: nextNum,
            description: '',
            unit_measure: 'KG',
            quantity: 0,
            unit_price: 0,
            total_value: 0,
        });
        this._renderItemsTable();
        this._renderDetailItems();
        this._refreshInstallmentsTotals();
        this._markDirty();
    },

    _removeItem(idx) {
        this._items.splice(idx, 1);
        this._items.forEach((it, i) => { it.item_number = i + 1; });
        this._renderItemsTable();
        this._renderDetailItems();
        this._refreshInstallmentsTotals();
        this._markDirty();
    },

    _refreshItemsTotals() {
        const total = this._items.reduce((s, i) => s + (i.total_value || 0), 0);
        const el = document.getElementById('pifItemsGrandTotal');
        if (el) el.textContent = `R$ ${_fmtMoney(total)}`;
    },

    // ── Aba Pagamento: tabela de parcelas ────────────────────────────────────

    _destroyInstallmentsEditors() {
        this._installmentsRowEditors.forEach(r => {
            r.daysInput?.destroy();
            r.dueInput?.destroy();
            r.amountInput?.destroy();
        });
        this._installmentsRowEditors = [];
    },

    _renderInstallmentsTable() {
        const area = document.getElementById('pifInstallmentsArea');
        if (!area) return;

        this._destroyInstallmentsEditors();
        area.innerHTML = `
            <div class="pif-editor-table-wrap">
                <table class="pif-editor-table">
                    <thead>
                        <tr>
                            <th class="pif-col-num">#</th>
                            <th class="pif-col-days">Dias</th>
                            <th class="pif-col-due">Vencimento</th>
                            <th class="pif-col-price">Valor</th>
                            <th class="pif-col-actions"></th>
                        </tr>
                    </thead>
                    <tbody id="pifInstTbody"></tbody>
                </table>
                <div class="pif-editor-footer">
                    <div class="pif-editor-footer-left">
                        <div id="pifAddInstMount"></div>
                        <div id="pifSplitInstMount"></div>
                    </div>
                    <div class="pif-editor-footer-right">
                        <div class="pif-editor-total">Total: <strong id="pifInstGrandTotal">R$ 0,00</strong></div>
                        <span id="pifInstError" class="pif-hint pif-hint--error" style="display:none"></span>
                    </div>
                </div>
            </div>`;

        const tbody = document.getElementById('pifInstTbody');
        this._installments.forEach((inst, idx) => this._appendInstallmentRow(tbody, inst, idx));

        if (this._installments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="pif-editor-empty">Nenhuma parcela. Adicione manualmente ou divida em parcelas iguais.</td></tr>`;
        }

        const addBtn = createButton({
            label: 'Adicionar Parcela',
            variant: 'secondary',
            icon: 'add',
            onClick: () => this._addInstallment(),
        });
        document.getElementById('pifAddInstMount')?.appendChild(addBtn.el);

        const splitBtn = createButton({
            label: 'Dividir em parcelas iguais',
            variant: 'secondary',
            icon: 'call_split',
            onClick: () => this._promptSplitInstallments(),
        });
        document.getElementById('pifSplitInstMount')?.appendChild(splitBtn.el);

        this._refreshInstallmentsTotals();
    },

    _appendInstallmentRow(tbody, inst, idx) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="pif-col-num">${idx + 1}</td>
            <td><div class="pif-cell-days"></div></td>
            <td><div class="pif-cell-due"></div></td>
            <td><div class="pif-cell-amount"></div></td>
            <td class="pif-col-actions"><button type="button" class="pif-icon-btn" title="Remover"><i data-lucide="trash-2"></i></button></td>`;
        tbody.appendChild(tr);

        const daysInput = createInput({
            type: 'number',
            value: String(inst.days ?? 0),
            onInput: v => {
                inst.days = parseInt(v) || 0;
                inst.due_date = this._dueDateFromDays(inst.days);
                dueInput.setValue(inst.due_date || null);
                this._markDirty();
                this._renderDetailPayment();
            },
            onChange: () => this._sortInstallments(),
        });
        daysInput.input.min = '0';
        tr.querySelector('.pif-cell-days').appendChild(daysInput.el);

        const dueInput = createDatePicker({
            value: inst.due_date || null,
            onChange: d => {
                inst.due_date = d || null;
                if (d instanceof Date && !isNaN(d)) {
                    const emission = this._dateEmissionInput?.getValue();
                    if (emission instanceof Date && !isNaN(emission)) {
                        const days = Math.round((d - emission) / 86400000);
                        inst.days = days >= 0 ? days : 0;
                        daysInput.setValue(String(inst.days));
                    }
                }
                this._markDirty();
                this._renderDetailPayment();
                this._sortInstallments();
            },
        });
        dueInput.mount(tr.querySelector('.pif-cell-due'));

        const amountInput = createInput({
            type: 'number',
            prefix: 'R$',
            value: Number(inst.amount || 0).toFixed(2),
            onInput: v => {
                inst.amount = parseFloat(v) || 0;
                this._refreshInstallmentsTotals();
                this._markDirty();
                this._renderDetailPayment();
            },
        });
        amountInput.input.min = '0';
        amountInput.input.step = '0.01';
        tr.querySelector('.pif-cell-amount').appendChild(amountInput.el);

        tr.querySelector('.pif-icon-btn').addEventListener('click', () => this._removeInstallment(idx));

        this._installmentsRowEditors.push({ daysInput, dueInput, amountInput });

        if (typeof lucide !== 'undefined') lucide.createIcons({ rootNode: tr });
    },

    _addInstallment() {
        const lastDays = this._installments[this._installments.length - 1]?.days ?? 0;
        const days = lastDays + 30;
        this._installments.push({
            days,
            due_date: this._dueDateFromDays(days),
            amount: 0,
        });
        this._renderInstallmentsTable();
        this._renderDetailPayment();
        this._markDirty();
    },

    _removeInstallment(idx) {
        this._installments.splice(idx, 1);
        this._renderInstallmentsTable();
        this._renderDetailPayment();
        this._markDirty();
    },

    _promptSplitInstallments() {
        const n = parseInt(prompt('Dividir em quantas parcelas iguais?', '3'));
        if (!n || n < 1) return;
        const itemsTotal = this._items.reduce((s, i) => s + (i.total_value || 0), 0);
        const freight = parseFloat(this._freightInput?.getValue() || '0') || 0;
        const total = itemsTotal + freight;
        const perInst = total / n;
        this._installments = [];
        for (let i = 1; i <= n; i++) {
            const days = i * 30;
            this._installments.push({
                days,
                due_date: this._dueDateFromDays(days),
                amount: Number(perInst.toFixed(2)),
            });
        }
        this._renderInstallmentsTable();
        this._renderDetailPayment();
        this._markDirty();
    },

    _sortInstallments() {
        const before = this._installments.map(i => i.days ?? 0).join(',');
        this._installments.sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
        const after = this._installments.map(i => i.days ?? 0).join(',');
        if (before !== after) {
            this._renderInstallmentsTable();
            this._renderDetailPayment();
        }
    },

    _refreshInstallmentsTotals() {
        const itemsTotal = this._items.reduce((s, i) => s + (i.total_value || 0), 0);
        const freight = parseFloat(this._freightInput?.getValue() || '0') || 0;
        const target = itemsTotal + freight;

        const totalEl = document.getElementById('pifInstGrandTotal');
        if (totalEl) totalEl.textContent = `R$ ${_fmtMoney(target)}`;

        const errorEl = document.getElementById('pifInstError');
        if (!errorEl) return;
        if (this._installments.length === 0) { errorEl.style.display = 'none'; return; }

        const sumInst = this._installments.reduce((s, i) => s + (i.amount || 0), 0);
        const diff = target - sumInst;
        if (Math.abs(diff) > 0.01) {
            const msg = diff > 0
                ? `Soma das parcelas está R$ ${_fmtMoney(diff)} abaixo do total`
                : `Soma das parcelas excede em R$ ${_fmtMoney(-diff)}`;
            errorEl.textContent = msg;
            errorEl.style.display = '';
        } else {
            errorEl.style.display = 'none';
        }
    },

    _dueDateFromDays(days) {
        const emission = this._dateEmissionInput?.getValue();
        if (!emission || isNaN(days)) return null;
        const d = new Date(emission);
        d.setDate(d.getDate() + Number(days));
        return d;
    },

    _recalcInstallmentDueDates() {
        let changed = false;
        this._installments.forEach(inst => {
            const newDue = this._dueDateFromDays(inst.days);
            inst.due_date = newDue;
            changed = true;
        });
        if (changed) {
            this._renderInstallmentsTable();
            this._renderDetailPayment();
        }
    },

    async _buildItemsFromReceipts() {
        const receiptsData = await Promise.all(
            this._selectedReceiptIds.map(id => apiCall(API + `/receipts/items/${id}`).catch(() => []))
        );

        const materialMap = {};
        const serviceItems = [];

        for (const items of receiptsData) {
            for (const item of items) {
                if (item.service_id) {
                    serviceItems.push(item);
                } else if (item.material) {
                    if (!materialMap[item.material]) {
                        materialMap[item.material] = {
                            description: item.material,
                            unit_measure: item.unit_measure || 'KG',
                            quantity: 0,
                            unit_price: 0,
                            total_value: 0,
                        };
                    }
                    materialMap[item.material].quantity += (item.weight || 0);
                }
            }
        }

        this._items = [];
        let itemNum = 1;

        const productByName = new Map(this._supplierProducts.map(p => [p.material_name, p]));
        const productById   = new Map(this._supplierProducts.map(p => [Number(p.material_id), p]));

        for (const v of Object.values(materialMap)) {
            const supProd = (v.material_id && productById.get(Number(v.material_id))) || productByName.get(v.description) || null;
            const unitPrice = supProd ? Number(supProd.unit_price || 0) : 0;
            this._items.push({
                item_number: itemNum++,
                description: v.description,
                unit_measure: v.unit_measure,
                quantity: v.quantity,
                unit_price: unitPrice,
                total_value: unitPrice * v.quantity,
                material_id: v.material_id || supProd?.material_id || null,
            });
        }

        for (const item of serviceItems) {
            this._items.push({
                item_number: itemNum++,
                description: item.service_name || `Serviço #${item.service_id}`,
                unit_measure: 'SV',
                quantity: item.weight || 1,
                unit_price: 0,
                total_value: 0,
                material_id: null,
            });
        }
    },

};

function _dateToISO(d) {
    if (!d) return null;
    if (d instanceof Date && !isNaN(d)) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    }
    return null;
}

function _fmtMoney(v) {
    return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
