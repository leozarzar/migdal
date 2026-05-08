/**
 * ── AdminCompany ──
 * Tela de gestão dos dados da empresa (informações centralizadas).
 */

const AdminCompany = {
    _company: {},
    _formDirty: false,
    _inputs: {},

    _INPUT_FIELDS: [
        { id: 'companyName',         placeholder: 'Ex: ICASA INDÚSTRIA DE PLÁSTICOS EIRELI' },
        { id: 'companyCNPJ',         placeholder: 'XX.XXX.XXX/XXXX-XX' },
        { id: 'companyIE',           placeholder: 'IE' },
        { id: 'companyAddress',      placeholder: 'Ex: AV. CÍCERO BATISTA DE OLIVEIRA, 2.980' },
        { id: 'companyNeighborhood', placeholder: 'Ex: ALPES SUÍÇOS' },
        { id: 'companyCity',         placeholder: 'Ex: GRAVATÁ' },
        { id: 'companyCEP',          placeholder: '55.645-000' },
        { id: 'companyPhone',        placeholder: '(81) 3533-0512', type: 'tel' },
        { id: 'companyEmail',        placeholder: 'contato@empresa.com', type: 'email' },
    ],

    render() {
        for (const k of Object.keys(this._inputs)) this._inputs[k]?.destroy();
        this._inputs = {};
        return `
        <div class="admin-company-container">
            <div class="admin-company-card">
                <h2 class="admin-company-title">Dados da Empresa</h2>
                <p class="admin-company-subtitle">Informações gerais e de contato</p>

                <form id="adminCompanyForm" class="admin-company-form">
                    <div class="admin-company-section">
                        <h3 class="admin-company-section-title">Identificação</h3>

                        <div class="admin-company-field-row">
                            <div class="admin-company-field admin-company-field--full">
                                <label class="admin-company-label">Nome da Empresa</label>
                                <div id="companyNameMount"></div>
                            </div>
                        </div>

                        <div class="admin-company-field-row">
                            <div class="admin-company-field admin-company-field--half">
                                <label class="admin-company-label">CNPJ</label>
                                <div id="companyCNPJMount"></div>
                            </div>
                            <div class="admin-company-field admin-company-field--half">
                                <label class="admin-company-label">Inscrição Estadual</label>
                                <div id="companyIEMount"></div>
                            </div>
                        </div>
                    </div>

                    <div class="admin-company-section">
                        <h3 class="admin-company-section-title">Localização</h3>

                        <div class="admin-company-field-row">
                            <div class="admin-company-field admin-company-field--full">
                                <label class="admin-company-label">Endereço</label>
                                <div id="companyAddressMount"></div>
                            </div>
                        </div>

                        <div class="admin-company-field-row">
                            <div class="admin-company-field admin-company-field--half">
                                <label class="admin-company-label">Bairro</label>
                                <div id="companyNeighborhoodMount"></div>
                            </div>
                            <div class="admin-company-field admin-company-field--quarter">
                                <label class="admin-company-label">Cidade</label>
                                <div id="companyCityMount"></div>
                            </div>
                            <div class="admin-company-field admin-company-field--quarter">
                                <label class="admin-company-label">UF</label>
                                <select id="companyState" class="admin-company-select"
                                        onchange="AdminCompany._markDirty()">
                                    <option value="">— Selecione —</option>
                                    <option value="AC">AC</option>
                                    <option value="AL">AL</option>
                                    <option value="AP">AP</option>
                                    <option value="AM">AM</option>
                                    <option value="BA">BA</option>
                                    <option value="CE">CE</option>
                                    <option value="DF">DF</option>
                                    <option value="ES">ES</option>
                                    <option value="GO">GO</option>
                                    <option value="MA">MA</option>
                                    <option value="MT">MT</option>
                                    <option value="MS">MS</option>
                                    <option value="MG">MG</option>
                                    <option value="PA">PA</option>
                                    <option value="PB">PB</option>
                                    <option value="PR">PR</option>
                                    <option value="PE">PE</option>
                                    <option value="PI">PI</option>
                                    <option value="RJ">RJ</option>
                                    <option value="RN">RN</option>
                                    <option value="RS">RS</option>
                                    <option value="RO">RO</option>
                                    <option value="RR">RR</option>
                                    <option value="SC">SC</option>
                                    <option value="SP">SP</option>
                                    <option value="SE">SE</option>
                                    <option value="TO">TO</option>
                                </select>
                            </div>
                        </div>

                        <div class="admin-company-field-row">
                            <div class="admin-company-field admin-company-field--half">
                                <label class="admin-company-label">CEP</label>
                                <div id="companyCEPMount"></div>
                            </div>
                        </div>
                    </div>

                    <div class="admin-company-section">
                        <h3 class="admin-company-section-title">Contato</h3>

                        <div class="admin-company-field-row">
                            <div class="admin-company-field admin-company-field--half">
                                <label class="admin-company-label">Telefone</label>
                                <div id="companyPhoneMount"></div>
                            </div>
                            <div class="admin-company-field admin-company-field--half">
                                <label class="admin-company-label">E-mail Corporativo</label>
                                <div id="companyEmailMount"></div>
                            </div>
                        </div>
                    </div>

                    <div class="admin-company-actions">
                        <button type="button" class="admin-company-btn admin-company-btn--secondary"
                                onclick="AdminCompany._resetForm()" id="adminCompanyResetBtn" disabled>
                            Cancelar
                        </button>
                        <button type="button" class="admin-company-btn admin-company-btn--primary"
                                onclick="AdminCompany._submitForm()" id="adminCompanySaveBtn" disabled>
                            Salvar Dados
                        </button>
                    </div>
                </form>
            </div>
        </div>`;
    },

    async load() {
        this._mountInputs();
        try {
            this._company = await apiCall(API + '/company') || {};
            this._populateForm();
            this._formDirty = false;
            this._updateButtonStates();
        } catch (e) {
            alert(e.message);
        }
    },

    _mountInputs() {
        for (const f of this._INPUT_FIELDS) {
            const mount = document.getElementById(f.id + 'Mount');
            if (!mount) continue;
            const cmp = createInput({
                id: f.id,
                type: f.type || 'text',
                placeholder: f.placeholder,
                onChange: () => AdminCompany._markDirty(),
            });
            mount.appendChild(cmp.el);
            this._inputs[f.id] = cmp;
        }
    },

    _populateForm() {
        document.getElementById('companyName').value = this._company.name || '';
        document.getElementById('companyCNPJ').value = this._company.cnpj || '';
        document.getElementById('companyIE').value = this._company.ie || '';
        document.getElementById('companyAddress').value = this._company.address || '';
        document.getElementById('companyNeighborhood').value = this._company.neighborhood || '';
        document.getElementById('companyCity').value = this._company.city || '';
        document.getElementById('companyState').value = this._company.state || '';
        document.getElementById('companyCEP').value = this._company.cep || '';
        document.getElementById('companyPhone').value = this._company.phone || '';
        document.getElementById('companyEmail').value = this._company.email || '';
    },

    _markDirty() {
        this._formDirty = true;
        this._updateButtonStates();
    },

    _updateButtonStates() {
        document.getElementById('adminCompanySaveBtn').disabled = !this._formDirty;
        document.getElementById('adminCompanyResetBtn').disabled = !this._formDirty;
    },

    _resetForm() {
        if (!confirm('Descartar alterações?')) return;
        this._populateForm();
        this._formDirty = false;
        this._updateButtonStates();
    },

    async _submitForm() {
        const data = {
            name: document.getElementById('companyName').value.trim(),
            cnpj: document.getElementById('companyCNPJ').value.trim(),
            ie: document.getElementById('companyIE').value.trim(),
            address: document.getElementById('companyAddress').value.trim(),
            neighborhood: document.getElementById('companyNeighborhood').value.trim(),
            city: document.getElementById('companyCity').value.trim(),
            state: document.getElementById('companyState').value.trim(),
            cep: document.getElementById('companyCEP').value.trim(),
            phone: document.getElementById('companyPhone').value.trim(),
            email: document.getElementById('companyEmail').value.trim()
        };

        if (!data.name) {
            alert('Nome da empresa é obrigatório');
            return;
        }

        try {
            const method = this._company.id ? 'PUT' : 'POST';
            const url = this._company.id ? API + '/company/' + this._company.id : API + '/company';

            const response = await apiCall(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            this._company = response;
            this._populateForm();
            this._formDirty = false;
            this._updateButtonStates();
            if (typeof showToast === 'function') showToast('Dados da empresa atualizados.', 'success');
        } catch (e) {
            alert(e.message);
        }
    }
};
