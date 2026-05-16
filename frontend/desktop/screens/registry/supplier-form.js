/**
 * supplier-form.js
 * Tela de formulário para criação/edição de Fornecedores.
 * Estrutura em abas: Detalhes, Pagamento, Produtos.
 */
const SupplierForm = {

    // ── Estado ──────────────────────────────────────────────────────────────

    _savedId: null,
    _isDirty: false,
    _activeTab: 'detalhes',
    _paymentTerms: [],
    _products: [],
    _materialsCache: [],

    // ── Componentes ──────────────────────────────────────────────────────────

    _tabs: null,
    _saveBtn: null,

    _nameInput: null,
    _businessNameInput: null,
    _taxIdInput: null,
    _addressInput: null,
    _districtInput: null,
    _zipInput: null,
    _cityInput: null,
    _stateInput: null,
    _phoneInput: null,
    _stateRegInput: null,
    _paymentMethodInput: null,

    _termsRowEditors: [],
    _productsRowEditors: [],

    // ── Ciclo de Vida ────────────────────────────────────────────────────────

    render() {
        this._savedId = null;
        this._isDirty = false;
        this._activeTab = 'detalhes';
        this._paymentTerms = [];
        this._products = [];
        this._materialsCache = [];

        this._tabs?.destroy();              this._tabs = null;
        this._nameInput?.destroy();         this._nameInput = null;
        this._businessNameInput?.destroy(); this._businessNameInput = null;
        this._taxIdInput?.destroy();        this._taxIdInput = null;
        this._addressInput?.destroy();      this._addressInput = null;
        this._districtInput?.destroy();     this._districtInput = null;
        this._zipInput?.destroy();          this._zipInput = null;
        this._cityInput?.destroy();         this._cityInput = null;
        this._stateInput?.destroy();        this._stateInput = null;
        this._phoneInput?.destroy();        this._phoneInput = null;
        this._stateRegInput?.destroy();     this._stateRegInput = null;
        this._paymentMethodInput?.destroy(); this._paymentMethodInput = null;
        this._destroyTermsEditors();
        this._destroyProductsEditors();
        this._saveBtn = null;

        return `
        <div class="sf-container">

            <div class="sf-sticky-header">
                <div class="rd-content sf-header">
                    <h1 id="sfTitle">Novo Fornecedor</h1>
                </div>
                <div class="rd-content sf-tabs-row">
                    <div id="sfTabsMount"></div>
                </div>
            </div>

            <div class="sf-body">
                <div class="rd-content">

                    <div class="sf-panel" data-tab="detalhes">

                        <div class="rd-section">
                            <h2 class="rd-section-title">Identificação</h2>
                            <div class="rd-form-row">
                                <div class="rd-form-label">
                                    <span class="rd-field-name">Nome <span class="required">*</span></span>
                                    <span class="rd-field-desc">Nome fantasia exibido no sistema</span>
                                </div>
                                <div class="rd-form-field"><div id="sfNameMount"></div></div>
                            </div>
                            <div class="rd-form-row">
                                <div class="rd-form-label">
                                    <span class="rd-field-name">Nome Empresarial</span>
                                    <span class="rd-field-desc">Razão social conforme registro</span>
                                </div>
                                <div class="rd-form-field"><div id="sfBusinessNameMount"></div></div>
                            </div>
                            <div class="rd-form-row">
                                <div class="rd-form-label">
                                    <span class="rd-field-name">CNPJ / CPF</span>
                                    <span class="rd-field-desc">Documento de identificação fiscal</span>
                                </div>
                                <div class="rd-form-field"><div id="sfTaxIdMount"></div></div>
                            </div>
                            <div class="rd-form-row">
                                <div class="rd-form-label">
                                    <span class="rd-field-name">Inscrição Estadual</span>
                                    <span class="rd-field-desc">IE ou ISENTO</span>
                                </div>
                                <div class="rd-form-field"><div id="sfStateRegMount"></div></div>
                            </div>
                        </div>

                        <div class="rd-section">
                            <h2 class="rd-section-title">Endereço</h2>
                            <div class="rd-form-row">
                                <div class="rd-form-label">
                                    <span class="rd-field-name">Endereço</span>
                                    <span class="rd-field-desc">Logradouro e número</span>
                                </div>
                                <div class="rd-form-field"><div id="sfAddressMount"></div></div>
                            </div>
                            <div class="rd-form-row">
                                <div class="rd-form-label">
                                    <span class="rd-field-name">Bairro / CEP</span>
                                </div>
                                <div class="rd-form-field sf-field-pair">
                                    <div id="sfDistrictMount"></div>
                                    <div id="sfZipMount"></div>
                                </div>
                            </div>
                            <div class="rd-form-row">
                                <div class="rd-form-label">
                                    <span class="rd-field-name">Cidade / Estado</span>
                                </div>
                                <div class="rd-form-field sf-field-pair">
                                    <div id="sfCityMount"></div>
                                    <div id="sfStateMount"></div>
                                </div>
                            </div>
                        </div>

                        <div class="rd-section">
                            <h2 class="rd-section-title">Contato</h2>
                            <div class="rd-form-row">
                                <div class="rd-form-label">
                                    <span class="rd-field-name">Telefone</span>
                                    <span class="rd-field-desc">Telefone de contato principal</span>
                                </div>
                                <div class="rd-form-field"><div id="sfPhoneMount"></div></div>
                            </div>
                        </div>

                    </div>

                    <div class="sf-panel" data-tab="pagamento">
                        <div class="rd-section">
                            <h2 class="rd-section-title">Forma de Pagamento</h2>
                            <div class="rd-form-row">
                                <div class="rd-form-label">
                                    <span class="rd-field-name">Forma de Pagamento</span>
                                    <span class="rd-field-desc">Ex: Boleto, PIX, Transferência</span>
                                </div>
                                <div class="rd-form-field"><div id="sfPaymentMethodMount"></div></div>
                            </div>
                        </div>

                        <div class="rd-section">
                            <h2 class="rd-section-title">Prazos</h2>
                            <div id="sfTermsArea"></div>
                        </div>
                    </div>

                    <div class="sf-panel" data-tab="produtos">
                        <div class="rd-section">
                            <h2 class="rd-section-title">Produtos Negociados</h2>
                            <div id="sfProductsArea"></div>
                        </div>
                    </div>

                </div>
            </div>

            <div class="rd-action-bar" id="sfActionBar"></div>
        </div>`;
    },

    async load() {
        const globalHeader = document.getElementById('headerOptionsContent');
        if (globalHeader) globalHeader.innerHTML = '';

        this._mountTabs();
        this._renderActionBar();
        this._mountFormInputs();
        this._renderTermsTable();
        this._renderProductsTable();

        await this._loadMaterials();

        const editingId = Suppliers.selectedSupplier?.id || null;
        if (editingId) await this._loadForEdit(editingId);

        this._setActiveTab('detalhes');
    },

    async canLeave() {
        if (!this._isDirty) return true;
        return confirm('Há alterações não salvas. Deseja sair mesmo assim?');
    },

    // ── Ações Públicas ───────────────────────────────────────────────────────

    async _loadForEdit(id) {
        try {
            const sup = await apiCall(API + `/suppliers/${id}`);
            this._savedId = id;
            const titleEl = document.getElementById('sfTitle');
            if (titleEl) titleEl.textContent = sup.name || 'Fornecedor';

            this._nameInput?.setValue(sup.name || '');
            this._businessNameInput?.setValue(sup.business_name || '');
            this._taxIdInput?.setValue(sup.tax_id || '');
            this._addressInput?.setValue(sup.address || '');
            this._districtInput?.setValue(sup.district || '');
            this._zipInput?.setValue(sup.zip || '');
            this._cityInput?.setValue(sup.city || '');
            this._stateInput?.setValue(sup.state || '');
            this._phoneInput?.setValue(sup.phone || '');
            this._stateRegInput?.setValue(sup.state_registration || '');
            this._paymentMethodInput?.setValue(sup.payment_method || '');

            this._paymentTerms = (sup.payment_terms || []).map(t => ({ days: Number(t.days || 0) }));
            this._products = (sup.products || []).map(p => ({
                material_id: Number(p.material_id),
                material_name: p.material_name || '',
                unit_of_measure: p.unit_of_measure || '',
                unit_price: Number(p.unit_price || 0),
            }));

            this._renderTermsTable();
            this._renderProductsTable();

            this._isDirty = false;
        } catch (e) {
            alert(e.message || 'Erro ao carregar fornecedor');
        }
    },

    async save() {
        const action = this._savedId ? 'edit' : 'create';
        if (!hasPermission('registry', 'suppliers', action)) return;

        const name = this._nameInput?.getValue()?.trim() ?? '';
        if (!name) { alert('Informe o nome do fornecedor'); return; }

        const payload = {
            name,
            business_name: this._businessNameInput?.getValue()?.trim() || null,
            tax_id: this._taxIdInput?.getValue()?.trim() || null,
            address: this._addressInput?.getValue()?.trim() || null,
            district: this._districtInput?.getValue()?.trim() || null,
            zip: this._zipInput?.getValue()?.trim() || null,
            city: this._cityInput?.getValue()?.trim() || null,
            state: this._stateInput?.getValue()?.trim() || null,
            phone: this._phoneInput?.getValue()?.trim() || null,
            state_registration: this._stateRegInput?.getValue()?.trim() || null,
            payment_method: this._paymentMethodInput?.getValue()?.trim() || null,
            payment_terms: this._paymentTerms
                .filter(t => Number.isFinite(Number(t.days)) && Number(t.days) >= 0)
                .map(t => ({ days: Number(t.days) })),
            products: this._products
                .filter(p => p.material_id)
                .map(p => ({ material_id: Number(p.material_id), unit_price: Number(p.unit_price || 0) })),
        };

        this._saveBtn?.setLoading(true);
        try {
            const isEdit = !!this._savedId;
            if (isEdit) {
                await apiCall(API + `/suppliers/${this._savedId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                const locationId = Suppliers._getActiveLocationId();
                if (!window.AppUser?.isAdmin && !locationId) {
                    alert('Selecione uma localização na barra lateral antes de cadastrar.');
                    this._saveBtn?.setLoading(false);
                    return;
                }
                const created = await apiCall(API + '/suppliers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, location_id: locationId }),
                });
                this._savedId = created?.id || null;
                if (this._savedId) Suppliers.selectedSupplier = { id: this._savedId };
                const titleEl = document.getElementById('sfTitle');
                if (titleEl) titleEl.textContent = name;
            }
            this._isDirty = false;
            showToast(this._savedId && action === 'edit' ? 'Fornecedor atualizado com sucesso!' : 'Fornecedor salvo com sucesso!', 'success');
        } catch (e) {
            if (e?.status === 409 && e?.data?.conflict) {
                alert('Um fornecedor com esse nome já existe no catálogo global.');
            } else {
                alert(e.message || 'Erro ao salvar fornecedor');
            }
        } finally {
            this._saveBtn?.setLoading(false);
        }
    },

    // ── Tabs ─────────────────────────────────────────────────────────────────

    _mountTabs() {
        const mount = document.getElementById('sfTabsMount');
        if (!mount) return;
        this._tabs?.destroy();
        this._tabs = createTabs({
            tabs: [
                { key: 'detalhes',  label: 'Detalhes'  },
                { key: 'pagamento', label: 'Pagamento' },
                { key: 'produtos',  label: 'Produtos'  },
            ],
            active: this._activeTab,
            onChange: key => this._setActiveTab(key),
        });
        this._tabs.mount(mount);
    },

    _setActiveTab(key) {
        this._activeTab = key;
        document.querySelectorAll('.sf-panel').forEach(p => {
            p.classList.toggle('sf-panel--active', p.dataset.tab === key);
        });
        if (this._tabs && this._tabs.getActive() !== key) this._tabs.setActive(key);
    },

    // ── Action bar ───────────────────────────────────────────────────────────

    _renderActionBar() {
        const bar = document.getElementById('sfActionBar');
        if (!bar) return;
        bar.innerHTML = '';

        const inner = document.createElement('div');
        inner.className = 'rd-action-bar-inner';
        bar.appendChild(inner);

        const BTN_MIN_W = '6.5rem';

        const exitBtn = createButton({
            label: 'Sair',
            variant: 'cancel',
            onClick: () => showScreen('suppliers'),
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

    // ── Inputs do formulário ────────────────────────────────────────────────

    _mountFormInputs() {
        const markDirty = () => this._markDirty();

        const mk = (placeholder) => createInput({ placeholder, onInput: markDirty });

        this._nameInput          = mk('Nome do fornecedor');
        this._businessNameInput  = mk('Razão social');
        this._taxIdInput         = mk('00.000.000/0000-00');
        this._addressInput       = mk('Rua, número, complemento');
        this._districtInput      = mk('Bairro');
        this._zipInput           = mk('00000-000');
        this._cityInput          = mk('Cidade');
        this._stateInput         = mk('UF');
        this._phoneInput         = mk('(00) 00000-0000');
        this._stateRegInput      = mk('Inscrição estadual');
        this._paymentMethodInput = mk('Ex: Boleto bancário');

        document.getElementById('sfNameMount')?.appendChild(this._nameInput.el);
        document.getElementById('sfBusinessNameMount')?.appendChild(this._businessNameInput.el);
        document.getElementById('sfTaxIdMount')?.appendChild(this._taxIdInput.el);
        document.getElementById('sfAddressMount')?.appendChild(this._addressInput.el);
        document.getElementById('sfDistrictMount')?.appendChild(this._districtInput.el);
        document.getElementById('sfZipMount')?.appendChild(this._zipInput.el);
        document.getElementById('sfCityMount')?.appendChild(this._cityInput.el);
        document.getElementById('sfStateMount')?.appendChild(this._stateInput.el);
        document.getElementById('sfPhoneMount')?.appendChild(this._phoneInput.el);
        document.getElementById('sfStateRegMount')?.appendChild(this._stateRegInput.el);
        document.getElementById('sfPaymentMethodMount')?.appendChild(this._paymentMethodInput.el);
    },

    // ── Aba Pagamento: tabela de prazos ─────────────────────────────────────

    _destroyTermsEditors() {
        this._termsRowEditors.forEach(r => r.daysInput?.destroy());
        this._termsRowEditors = [];
    },

    _renderTermsTable() {
        const area = document.getElementById('sfTermsArea');
        if (!area) return;

        this._destroyTermsEditors();
        area.innerHTML = `
            <div class="pif-editor-table-wrap">
                <table class="pif-editor-table">
                    <thead>
                        <tr>
                            <th class="pif-col-num">#</th>
                            <th class="pif-col-days">Dias</th>
                            <th></th>
                            <th class="pif-col-actions"></th>
                        </tr>
                    </thead>
                    <tbody id="sfTermsTbody"></tbody>
                </table>
                <div class="pif-editor-footer">
                    <div class="pif-editor-footer-left">
                        <div id="sfAddTermMount"></div>
                    </div>
                    <div class="pif-editor-footer-right">
                        <div class="pif-editor-total">${this._paymentTerms.length} ${this._paymentTerms.length === 1 ? 'prazo' : 'prazos'}</div>
                    </div>
                </div>
            </div>`;

        const tbody = document.getElementById('sfTermsTbody');
        this._paymentTerms.forEach((term, idx) => this._appendTermRow(tbody, term, idx));

        if (this._paymentTerms.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="pif-editor-empty">Nenhum prazo cadastrado. Adicione o número de dias para vencimento.</td></tr>`;
        }

        const addBtn = createButton({
            label: 'Adicionar Prazo',
            variant: 'secondary',
            icon: 'add',
            onClick: () => this._addTerm(),
        });
        document.getElementById('sfAddTermMount')?.appendChild(addBtn.el);
    },

    _appendTermRow(tbody, term, idx) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="pif-col-num">${idx + 1}</td>
            <td><div class="sf-cell-days"></div></td>
            <td class="sf-cell-days-label">dias após emissão</td>
            <td class="pif-col-actions"><button type="button" class="pif-icon-btn" title="Remover"><i data-lucide="trash-2"></i></button></td>`;
        tbody.appendChild(tr);

        const daysInput = createInput({
            type: 'number',
            value: String(term.days ?? 0),
            onInput: v => {
                term.days = parseInt(v) || 0;
                this._markDirty();
            },
            onChange: () => this._sortTerms(),
        });
        daysInput.input.min = '0';
        tr.querySelector('.sf-cell-days').appendChild(daysInput.el);

        tr.querySelector('.pif-icon-btn').addEventListener('click', () => this._removeTerm(idx));

        this._termsRowEditors.push({ daysInput });

        if (typeof lucide !== 'undefined') lucide.createIcons({ rootNode: tr });
    },

    _addTerm() {
        const lastDays = this._paymentTerms[this._paymentTerms.length - 1]?.days ?? 0;
        const days = lastDays + 30;
        this._paymentTerms.push({ days });
        this._renderTermsTable();
        this._markDirty();
    },

    _removeTerm(idx) {
        this._paymentTerms.splice(idx, 1);
        this._renderTermsTable();
        this._markDirty();
    },

    _sortTerms() {
        const before = this._paymentTerms.map(t => t.days ?? 0).join(',');
        this._paymentTerms.sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
        const after = this._paymentTerms.map(t => t.days ?? 0).join(',');
        if (before !== after) this._renderTermsTable();
    },

    // ── Aba Produtos: tabela de materiais cotados ───────────────────────────

    async _loadMaterials() {
        try {
            const materials = await apiCall(API + '/materials');
            const list = Array.isArray(materials) ? materials : (materials?.data || []);
            this._materialsCache = list;
        } catch {
            this._materialsCache = [];
        }
    },

    _destroyProductsEditors() {
        this._productsRowEditors.forEach(r => {
            r.materialSelect?.destroy();
            r.priceInput?.destroy();
        });
        this._productsRowEditors = [];
    },

    _renderProductsTable() {
        const area = document.getElementById('sfProductsArea');
        if (!area) return;

        this._destroyProductsEditors();
        area.innerHTML = `
            <div class="pif-editor-table-wrap">
                <table class="pif-editor-table">
                    <thead>
                        <tr>
                            <th class="pif-col-num">#</th>
                            <th>Material</th>
                            <th class="sf-col-um">UM</th>
                            <th class="pif-col-price">Valor Negociado</th>
                            <th class="pif-col-actions"></th>
                        </tr>
                    </thead>
                    <tbody id="sfProductsTbody"></tbody>
                </table>
                <div class="pif-editor-footer">
                    <div class="pif-editor-footer-left">
                        <div id="sfAddProductMount"></div>
                    </div>
                    <div class="pif-editor-footer-right">
                        <div class="pif-editor-total">${this._products.length} ${this._products.length === 1 ? 'produto' : 'produtos'}</div>
                    </div>
                </div>
            </div>`;

        const tbody = document.getElementById('sfProductsTbody');
        this._products.forEach((p, idx) => this._appendProductRow(tbody, p, idx));

        if (this._products.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="pif-editor-empty">Nenhum produto cadastrado. Adicione materiais e seus valores negociados.</td></tr>`;
        }

        const addBtn = createButton({
            label: 'Adicionar Produto',
            variant: 'secondary',
            icon: 'add',
            onClick: () => this._addProduct(),
        });
        document.getElementById('sfAddProductMount')?.appendChild(addBtn.el);
    },

    _appendProductRow(tbody, product, idx) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="pif-col-num">${idx + 1}</td>
            <td><div class="sf-cell-material"></div></td>
            <td class="sf-col-um sf-cell-um">${product.unit_of_measure || '—'}</td>
            <td><div class="sf-cell-price"></div></td>
            <td class="pif-col-actions"><button type="button" class="pif-icon-btn" title="Remover"><i data-lucide="trash-2"></i></button></td>`;
        tbody.appendChild(tr);

        const usedIds = new Set(this._products.filter((_, i) => i !== idx).map(p => Number(p.material_id)).filter(Boolean));
        const items = this._materialsCache
            .filter(m => !usedIds.has(Number(m.id)))
            .map(m => ({ value: String(m.id), label: m.name }));

        const materialSelect = createSelect({
            placeholder: 'Selecionar material...',
            searchable: true,
            sections: [{ key: 'material', items }],
            onChange: val => {
                const mat = this._materialsCache.find(m => String(m.id) === String(val));
                product.material_id = mat ? Number(mat.id) : null;
                product.material_name = mat?.name || '';
                product.unit_of_measure = mat?.unit_of_measure || '';
                const umCell = tr.querySelector('.sf-cell-um');
                if (umCell) umCell.textContent = product.unit_of_measure || '—';
                this._markDirty();
            },
        });
        materialSelect.mount(tr.querySelector('.sf-cell-material'));
        if (product.material_id) materialSelect.setValue(String(product.material_id));

        const priceInput = createInput({
            type: 'number',
            prefix: 'R$',
            value: Number(product.unit_price || 0).toFixed(2),
            onInput: v => {
                product.unit_price = parseFloat(v) || 0;
                this._markDirty();
            },
        });
        priceInput.input.min = '0';
        priceInput.input.step = '0.01';
        tr.querySelector('.sf-cell-price').appendChild(priceInput.el);

        tr.querySelector('.pif-icon-btn').addEventListener('click', () => this._removeProduct(idx));

        this._productsRowEditors.push({ materialSelect, priceInput });

        if (typeof lucide !== 'undefined') lucide.createIcons({ rootNode: tr });
    },

    _addProduct() {
        this._products.push({
            material_id: null,
            material_name: '',
            unit_of_measure: '',
            unit_price: 0,
        });
        this._renderProductsTable();
        this._markDirty();
    },

    _removeProduct(idx) {
        this._products.splice(idx, 1);
        this._renderProductsTable();
        this._markDirty();
    },

    // ── Privado ──────────────────────────────────────────────────────────────

    _markDirty() {
        this._isDirty = true;
    },
};
