/**
 * ── AdminCompany ──
 * Tela de gestão dos dados da empresa (informações centralizadas).
 */

const AdminCompany = {
    _company: {},
    _formDirty: false,
    _inputs: {},
    _stateSelect: null,
    _citySelect: null,
    _cancelBtn: null,
    _saveBtn: null,
    _cepTimer: null,
    _citiesCache: {},

    _INPUT_FIELDS: [
        { id: 'companyName',  placeholder: 'Razão social',       icon: 'Company' },
        { id: 'companyIE',    placeholder: 'Inscrição estadual' },
        { id: 'companyEmail', placeholder: 'email@empresa.com',  icon: 'Mail', type: 'email' },
    ],

    render() {
        for (const k of Object.keys(this._inputs)) this._inputs[k]?.destroy();
        this._inputs = {};
        this._stateSelect?.destroy(); this._stateSelect = null;
        this._citySelect?.destroy();  this._citySelect  = null;
        this._cancelBtn = null;
        this._saveBtn   = null;
        return `
        <div class="admin-company-container">
            <div class="rd-content">
                <div class="rd-header ac-header">
                    <div>
                        <h1>Dados da Empresa</h1>
                        <div class="rd-meta">Informações gerais e de contato</div>
                    </div>
                    <div id="acLogoMount"></div>
                </div>

                <div class="rd-separator"></div>

                <div class="rd-section">
                    <h2 class="rd-section-title">Identificação</h2>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Nome <span class="required">*</span></span>
                            <span class="rd-field-desc">Razão social da empresa</span>
                        </div>
                        <div class="rd-form-field"><div id="companyNameMount"></div></div>
                    </div>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">CNPJ / Inscrição Estadual</span>
                        </div>
                        <div class="rd-form-field ac-field-pair">
                            <div id="companyCNPJMount"></div>
                            <div id="companyIEMount"></div>
                        </div>
                    </div>
                </div>

                <div class="rd-section">
                    <h2 class="rd-section-title">Localização</h2>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">CEP / Estado</span>
                        </div>
                        <div class="rd-form-field ac-field-pair">
                            <div id="companyCEPMount"></div>
                            <div id="companyStateMount"></div>
                        </div>
                    </div>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Cidade / Bairro</span>
                        </div>
                        <div class="rd-form-field ac-field-pair">
                            <div id="companyCityMount"></div>
                            <div id="companyNeighborhoodMount"></div>
                        </div>
                    </div>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Endereço</span>
                        </div>
                        <div class="rd-form-field">
                            <div id="companyAddressMount"></div>
                        </div>
                    </div>
                </div>

                <div class="rd-section">
                    <h2 class="rd-section-title">Contato</h2>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Telefone / E-mail</span>
                        </div>
                        <div class="rd-form-field ac-field-pair">
                            <div id="companyPhoneMount"></div>
                            <div id="companyEmailMount"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="rd-action-bar" id="acActionBar"></div>
        </div>`;
    },

    async load() {
        this._mountInputs();
        this._renderActionBar();
        try {
            this._company = await apiCall(API + '/company') || {};
            await this._populateForm();
            this._renderLogoMount();
            this._formDirty = false;
            this._updateButtonStates();
        } catch (e) {
            alert(e.message);
        }
    },

    _mountInputs() {
        // Identificação + Contato
        for (const f of this._INPUT_FIELDS) {
            const mount = document.getElementById(f.id + 'Mount');
            if (!mount) continue;
            const cmp = createInput({
                id: f.id,
                type: f.type || 'text',
                placeholder: f.placeholder,
                icon: f.icon || undefined,
                onChange: () => AdminCompany._markDirty(),
            });
            mount.appendChild(cmp.el);
            this._inputs[f.id] = cmp;
        }

        // CNPJ — máscara XX.XXX.XXX/XXXX-XX
        this._mountMasked('companyCNPJ', '00.000.000/0000-00', (v) => {
            let d = v.replace(/\D/g, '').slice(0, 14);
            if (d.length > 12) return d.slice(0,2)+'.'+d.slice(2,5)+'.'+d.slice(5,8)+'/'+d.slice(8,12)+'-'+d.slice(12);
            if (d.length > 8)  return d.slice(0,2)+'.'+d.slice(2,5)+'.'+d.slice(5,8)+'/'+d.slice(8);
            if (d.length > 5)  return d.slice(0,2)+'.'+d.slice(2,5)+'.'+d.slice(5);
            if (d.length > 2)  return d.slice(0,2)+'.'+d.slice(2);
            return d;
        });

        // Telefone — máscara (XX) XXXXX-XXXX / (XX) XXXX-XXXX
        this._mountMasked('companyPhone', '(00) 00000-0000', (v) => {
            let d = v.replace(/\D/g, '').slice(0, 11);
            if (d.length > 10) return '('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7);
            if (d.length > 6)  return '('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6);
            if (d.length > 2)  return '('+d.slice(0,2)+') '+d.slice(2);
            if (d.length > 0)  return '('+d;
            return d;
        }, 'Phone');

        // CEP — máscara + busca automática
        const cepMount = document.getElementById('companyCEPMount');
        if (cepMount) {
            const cmp = createInput({
                id: 'companyCEP',
                placeholder: '00000-000',                maxLength: 9,
                onInput: (value) => {
                    const digits = value.replace(/\D/g, '').slice(0, 8);
                    const masked = digits.length > 5 ? digits.slice(0, 5) + '-' + digits.slice(5) : digits;
                    const el = document.getElementById('companyCEP');
                    if (el && el.value !== masked) el.value = masked;
                    AdminCompany._markDirty();
                    clearTimeout(AdminCompany._cepTimer);
                    if (digits.length === 8) {
                        AdminCompany._cepTimer = setTimeout(() => AdminCompany._lookupCEP(digits), 1000);
                    }
                },
            });
            cepMount.appendChild(cmp.el);
            this._inputs.companyCEP = cmp;
        }

        // Estado — select com busca, nomes completos
        const UF_OPTIONS = [
            { value: 'AC', label: 'Acre' },            { value: 'AL', label: 'Alagoas' },
            { value: 'AP', label: 'Amapá' },           { value: 'AM', label: 'Amazonas' },
            { value: 'BA', label: 'Bahia' },           { value: 'CE', label: 'Ceará' },
            { value: 'DF', label: 'Distrito Federal' },{ value: 'ES', label: 'Espírito Santo' },
            { value: 'GO', label: 'Goiás' },           { value: 'MA', label: 'Maranhão' },
            { value: 'MT', label: 'Mato Grosso' },     { value: 'MS', label: 'Mato Grosso do Sul' },
            { value: 'MG', label: 'Minas Gerais' },    { value: 'PA', label: 'Pará' },
            { value: 'PB', label: 'Paraíba' },         { value: 'PR', label: 'Paraná' },
            { value: 'PE', label: 'Pernambuco' },      { value: 'PI', label: 'Piauí' },
            { value: 'RJ', label: 'Rio de Janeiro' },  { value: 'RN', label: 'Rio Grande do Norte' },
            { value: 'RS', label: 'Rio Grande do Sul' },{ value: 'RO', label: 'Rondônia' },
            { value: 'RR', label: 'Roraima' },         { value: 'SC', label: 'Santa Catarina' },
            { value: 'SP', label: 'São Paulo' },       { value: 'SE', label: 'Sergipe' },
            { value: 'TO', label: 'Tocantins' },
        ];
        this._stateSelect = createSelect({
            options: UF_OPTIONS,
            placeholder: 'Selecione o estado',
            searchable: true,
            clearable: true,
            onChange: (uf) => {
                AdminCompany._citySelect?.clear();
                AdminCompany._inputs.companyNeighborhood?.setValue('');
                AdminCompany._inputs.companyAddress?.setValue('');
                AdminCompany._loadCities(uf);
                AdminCompany._markDirty();
                AdminCompany._updateLocationFieldStates();
            },
        });
        this._stateSelect.mount(document.getElementById('companyStateMount'));

        // Cidade — select com busca, carregado via IBGE
        this._citySelect = createSelect({
            options: [],
            placeholder: 'Selecione a cidade',
            searchable: true,
            clearable: true,
            disabled: true,
            onChange: () => {
                AdminCompany._inputs.companyNeighborhood?.setValue('');
                AdminCompany._inputs.companyAddress?.setValue('');
                AdminCompany._markDirty();
                AdminCompany._updateLocationFieldStates();
            },
        });
        this._citySelect.mount(document.getElementById('companyCityMount'));

        // Bairro — desabilitado até cidade selecionada
        const neighborhoodMount = document.getElementById('companyNeighborhoodMount');
        if (neighborhoodMount) {
            const cmp = createInput({
                id: 'companyNeighborhood',
                placeholder: 'Bairro',
                disabled: true,
                onInput: () => {
                    AdminCompany._markDirty();
                    AdminCompany._updateLocationFieldStates();
                },
            });
            neighborhoodMount.appendChild(cmp.el);
            this._inputs.companyNeighborhood = cmp;
        }

        // Endereço — desabilitado até bairro preenchido
        const addressMount = document.getElementById('companyAddressMount');
        if (addressMount) {
            const cmp = createInput({
                id: 'companyAddress',
                placeholder: 'Rua, número',
                disabled: true,
                onChange: () => AdminCompany._markDirty(),
            });
            addressMount.appendChild(cmp.el);
            this._inputs.companyAddress = cmp;
        }
    },

    _mountMasked(id, placeholder, maskFn, icon = null) {
        const mount = document.getElementById(id + 'Mount');
        if (!mount) return;
        const cmp = createInput({
            id,
            placeholder,
            icon: icon || undefined,
            onInput: (value) => {
                const masked = maskFn(value);
                const el = document.getElementById(id);
                if (el && el.value !== masked) el.value = masked;
                AdminCompany._markDirty();
            },
        });
        mount.appendChild(cmp.el);
        this._inputs[id] = cmp;
    },

    async _loadCities(uf) {
        if (!uf) {
            this._citySelect?.setOptions([]);
            this._citySelect?.setDisabled(true);
            return;
        }
        if (!this._citiesCache[uf]) {
            try {
                const res  = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
                const data = await res.json();
                this._citiesCache[uf] = data.map(c => ({ value: c.nome, label: c.nome }));
            } catch {
                this._citiesCache[uf] = [];
            }
        }
        this._citySelect?.setOptions(this._citiesCache[uf]);
        this._citySelect?.setDisabled(false);
    },

    _updateLocationFieldStates() {
        const hasState  = !!this._stateSelect?.getValue();
        const hasCity   = !!this._citySelect?.getValue();
        const hasBairro = !!(this._inputs.companyNeighborhood?.getValue().trim());

        this._citySelect?.setDisabled(!hasState);
        this._inputs.companyNeighborhood?.setDisabled(!hasCity);
        this._inputs.companyAddress?.setDisabled(!hasBairro);
    },

    _renderLogoMount() {
        const mount = document.getElementById('acLogoMount');
        if (!mount) return;
        const logo = this._company.logo || null;
        mount.innerHTML = `
            <div class="ac-logo-wrap">
                <button class="ac-logo-btn" title="Alterar logo" onclick="AdminCompany._triggerLogoUpload()">
                    ${logo
                        ? `<img src="${logo}" alt="Logo da empresa" class="ac-logo-img">`
                        : `<span class="material-symbols-outlined ac-logo-placeholder">apartment</span>`}
                    <span class="ac-logo-overlay">
                        <span class="material-symbols-outlined">upload</span>
                    </span>
                </button>
                ${logo ? `<button class="ac-logo-remove" title="Remover logo" onclick="AdminCompany._removeLogo()">
                    <span class="material-symbols-outlined">close</span>
                </button>` : ''}
                <input type="file" id="acLogoFileInput" accept="image/png,image/jpeg,image/webp" style="display:none"
                       onchange="AdminCompany._onLogoSelected(this)">
            </div>`;
    },

    _triggerLogoUpload() {
        document.getElementById('acLogoFileInput')?.click();
    },

    async _onLogoSelected(input) {
        const file = input.files[0];
        if (!file) return;
        input.value = '';
        if (file.size > 3 * 1024 * 1024) {
            showToast('Logo muito grande. Máximo 3 MB.', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const result = await apiCall(`${API}/company/logo`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ logo: e.target.result }),
                });
                this._company.logo = result.logo;
                this._renderLogoMount();
                showToast('Logo atualizado.', 'success');
            } catch (err) {
                showToast(err.message || 'Erro ao salvar logo.', 'error');
            }
        };
        reader.readAsDataURL(file);
    },

    async _removeLogo() {
        try {
            await apiCall(`${API}/company/logo`, { method: 'DELETE' });
            this._company.logo = null;
            this._renderLogoMount();
            showToast('Logo removido.', 'success');
        } catch (err) {
            showToast(err.message || 'Erro ao remover logo.', 'error');
        }
    },

    _renderActionBar() {
        const bar = document.getElementById('acActionBar');
        if (!bar) return;
        bar.innerHTML = '';
        const inner = document.createElement('div');
        inner.className = 'rd-action-bar-inner';

        this._cancelBtn = createButton({
            label: 'Cancelar',
            variant: 'secondary',
            disabled: true,
            onClick: () => AdminCompany._resetForm(),
        });
        inner.appendChild(this._cancelBtn.el);

        this._saveBtn = createButton({
            label: 'Salvar',
            variant: 'primary',
            icon: 'check',
            disabled: true,
            onClick: () => AdminCompany._submitForm(),
        });
        inner.appendChild(this._saveBtn.el);

        bar.appendChild(inner);
    },

    async _populateForm() {
        const c = this._company;
        document.getElementById('companyName').value = c.name  || '';
        document.getElementById('companyCNPJ').value = c.cnpj  || '';
        document.getElementById('companyIE').value   = c.ie    || '';
        document.getElementById('companyCEP').value  = c.cep   || '';

        if (c.state) {
            this._stateSelect?.setValue(c.state);
            await this._loadCities(c.state);
            if (c.city) this._citySelect?.setValue(c.city);
        }

        this._inputs.companyNeighborhood?.setValue(c.neighborhood || '');
        this._inputs.companyAddress?.setValue(c.address || '');
        this._updateLocationFieldStates();

        document.getElementById('companyPhone').value = c.phone || '';
        document.getElementById('companyEmail').value = c.email || '';
    },

    _markDirty() {
        this._formDirty = true;
        this._updateButtonStates();
    },

    _updateButtonStates() {
        this._cancelBtn?.setDisabled(!this._formDirty);
        this._saveBtn?.setDisabled(!this._formDirty);
    },

    async _resetForm() {
        if (!confirm('Descartar alterações?')) return;
        await this._populateForm();
        this._formDirty = false;
        this._updateButtonStates();
    },

    async _lookupCEP(cep) {
        try {
            const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await res.json();
            if (data.erro) return;

            if (data.cep) {
                const el = document.getElementById('companyCEP');
                if (el) el.value = data.cep;
            }
            if (data.uf) {
                this._stateSelect?.setValue(data.uf);
                await this._loadCities(data.uf);
            }
            if (data.localidade) this._citySelect?.setValue(data.localidade);
            if (data.bairro)     this._inputs.companyNeighborhood?.setValue(data.bairro);
            if (data.logradouro) this._inputs.companyAddress?.setValue(data.logradouro);

            this._updateLocationFieldStates();
            this._markDirty();
        } catch (_) {}
    },

    async _submitForm() {
        const data = {
            name:         document.getElementById('companyName').value.trim(),
            cnpj:         document.getElementById('companyCNPJ').value.trim(),
            ie:           document.getElementById('companyIE').value.trim(),
            cep:          document.getElementById('companyCEP').value.trim(),
            state:        this._stateSelect?.getValue()                        || '',
            city:         this._citySelect?.getValue()                         || '',
            neighborhood: this._inputs.companyNeighborhood?.getValue().trim()  || '',
            address:      this._inputs.companyAddress?.getValue().trim()        || '',
            phone:        document.getElementById('companyPhone').value.trim(),
            email:        document.getElementById('companyEmail').value.trim(),
        };

        if (!data.name) {
            alert('Nome da empresa é obrigatório');
            return;
        }

        try {
            const method = this._company.id ? 'PUT' : 'POST';
            const url    = this._company.id ? `${API}/company/${this._company.id}` : `${API}/company`;

            const response = await apiCall(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            this._company = response;
            await this._populateForm();
            this._formDirty = false;
            this._updateButtonStates();
            if (typeof showToast === 'function') showToast('Dados da empresa atualizados.', 'success');
        } catch (e) {
            alert(e.message);
        }
    },
};
