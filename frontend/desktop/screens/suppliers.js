/**
 * ── suppliers.js ──
 * Tela de cadastro de fornecedores.
 * Permite listar, adicionar, editar e deletar fornecedores.
 * Inclui dados legais, endereço, contato e tabela de cotações (materiais e serviços).
 */
const Suppliers = {

    // ── Estado ──────────────────────────────────────────────────────────────

    selectedSupplier: null,
    _dialog: null,
    _editingId: null,
    _prices: [],
    _services: [],

    // ── Ciclo de Vida ────────────────────────────────────────────────────────

    render() {
        this._dialog?.destroy(); this._dialog = null;
        return `
        <div class="suppliers-container">
            <div class="suppliers-card">
                <div class="suppliers-form-wrapper">
                    <input id="supplierName" class="suppliers-input" placeholder="Nome do fornecedor">
                    <button class="suppliers-btn-save" id="supplierSaveBtn" onclick="Suppliers.saveSupplier()">
                        <span class="material-symbols-outlined">playlist_add</span>Adicionar
                    </button>
                    <button class="suppliers-btn-cancel" id="suppliersCancelBtn" style="display:none" onclick="Suppliers.cancelEdit()">Cancelar</button>
                </div>
                <div class="suppliers-table-container">
                    <table class="suppliers-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>CNPJ</th>
                                <th>Cidade/UF</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="suppliersTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    },

    async load() {
        this._resetForm();
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) headerOptions.innerHTML = "";

        try {
            const [suppliers, services] = await Promise.all([
                apiCall(API + "/suppliers"),
                apiCall(API + "/services").catch(() => [])
            ]);
            this._services = services || [];
            this._renderTable(suppliers);
        } catch (e) {
            alert("Erro ao carregar fornecedores");
        }
    },

    // ── Ações Públicas ───────────────────────────────────────────────────────

    async saveSupplier() {
        const name = document.getElementById("supplierName").value.trim();
        if (!name) return alert("Digite o nome do fornecedor");

        try {
            if (this.selectedSupplier) {
                const current = await apiCall(API + `/suppliers`).then(list => list.find(s => s.id === this.selectedSupplier));
                await apiCall(API + `/suppliers/${this.selectedSupplier}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...current, name })
                });
            } else {
                await apiCall(API + "/suppliers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name })
                });
            }
            this.load();
        } catch (e) {
            alert(e.message || "Erro ao salvar fornecedor");
        }
    },

    cancelEdit() {
        this._resetForm();
    },

    /** Abre o dialog completo de edição do fornecedor (dados + cotações). */
    async openDetails(id) {
        try {
            const [suppliers, prices, services] = await Promise.all([
                apiCall(API + `/suppliers`),
                apiCall(API + `/suppliers/${id}/prices`).catch(() => []),
                apiCall(API + "/services").catch(() => [])
            ]);
            const supplier = suppliers.find(s => s.id === id);
            if (!supplier) return alert("Fornecedor não encontrado");
            this._editingId = id;
            this._prices = prices || [];
            this._services = services || [];
            this._openDialog(supplier);
        } catch (e) {
            alert("Erro ao carregar dados do fornecedor");
        }
    },

    async deleteSupplier(event, id) {
        event.stopPropagation();
        if (!confirm("Tem certeza que deseja deletar este fornecedor?")) return;
        try {
            await apiCall(API + `/suppliers/${id}`, { method: "DELETE" });
            this.load();
        } catch (e) {
            alert(e.message || "Erro ao deletar fornecedor");
        }
    },

    // ── Dialog de Detalhes ───────────────────────────────────────────────────

    _openDialog(supplier) {
        this._dialog?.destroy();
        this._dialog = createDialog({
            title: `Fornecedor: ${supplier.name}`,
            wide: true,
            bodyHTML: this._buildDialogBody(supplier),
            actions: [
                { label: "Salvar dados", className: "btn-primary", onClick: () => this._saveDetails() },
                { label: "Fechar", className: "btn-secondary", onClick: () => { this._dialog.close(); } }
            ]
        });
        this._dialog.open();
        this._renderPricesTable();
    },

    _buildDialogBody(s) {
        const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        return `
        <div class="suppliers-dialog-body">
            <div class="suppliers-dialog-section">
                <div class="suppliers-dialog-section-title">Dados Legais</div>
                <div class="suppliers-dialog-fields">
                    <div class="suppliers-dialog-field wide">
                        <label>Nome</label>
                        <input id="sdName" class="suppliers-dialog-input" value="${esc(s.name)}">
                    </div>
                    <div class="suppliers-dialog-field">
                        <label>CNPJ/CPF</label>
                        <input id="sdCnpj" class="suppliers-dialog-input" value="${esc(s.cnpj)}" placeholder="00.000.000/0001-00">
                    </div>
                    <div class="suppliers-dialog-field">
                        <label>Inscrição Estadual</label>
                        <input id="sdStateReg" class="suppliers-dialog-input" value="${esc(s.state_registration)}" placeholder="IE">
                    </div>
                </div>
            </div>
            <div class="suppliers-dialog-section">
                <div class="suppliers-dialog-section-title">Endereço</div>
                <div class="suppliers-dialog-fields">
                    <div class="suppliers-dialog-field wide">
                        <label>Rua</label>
                        <input id="sdAddress" class="suppliers-dialog-input" value="${esc(s.address)}" placeholder="Rua / Avenida">
                    </div>
                    <div class="suppliers-dialog-field small">
                        <label>Número</label>
                        <input id="sdAddressNumber" class="suppliers-dialog-input" value="${esc(s.address_number)}" placeholder="Nº">
                    </div>
                    <div class="suppliers-dialog-field">
                        <label>Bairro</label>
                        <input id="sdNeighborhood" class="suppliers-dialog-input" value="${esc(s.neighborhood)}" placeholder="Bairro">
                    </div>
                    <div class="suppliers-dialog-field small">
                        <label>CEP</label>
                        <input id="sdCep" class="suppliers-dialog-input" value="${esc(s.cep)}" placeholder="00000-000">
                    </div>
                    <div class="suppliers-dialog-field">
                        <label>Cidade</label>
                        <input id="sdCity" class="suppliers-dialog-input" value="${esc(s.city)}" placeholder="Cidade">
                    </div>
                    <div class="suppliers-dialog-field small">
                        <label>UF</label>
                        <input id="sdUf" class="suppliers-dialog-input" value="${esc(s.uf)}" placeholder="UF" maxlength="2">
                    </div>
                </div>
            </div>
            <div class="suppliers-dialog-section">
                <div class="suppliers-dialog-section-title">Contato</div>
                <div class="suppliers-dialog-fields">
                    <div class="suppliers-dialog-field">
                        <label>Telefone</label>
                        <input id="sdPhone" class="suppliers-dialog-input" value="${esc(s.phone)}" placeholder="(00) 00000-0000">
                    </div>
                </div>
            </div>
            <div class="suppliers-dialog-section">
                <div class="suppliers-dialog-section-title">Cotações de Materiais</div>
                <div class="suppliers-price-form">
                    <input id="sdMatName" class="suppliers-dialog-input" placeholder="Nome do material" style="flex:1">
                    <input id="sdMatPrice" class="suppliers-dialog-input" type="number" min="0" step="0.01" placeholder="Valor R$" style="width:110px">
                    <button class="suppliers-btn-add-price" onclick="Suppliers._addMaterialPrice()"><span class="material-symbols-outlined">add</span></button>
                </div>
                <div id="sdMatPricesContainer"></div>
            </div>
            <div class="suppliers-dialog-section">
                <div class="suppliers-dialog-section-title">Cotações de Serviços</div>
                <div class="suppliers-price-form">
                    <select id="sdSvcSelect" class="suppliers-dialog-select" style="flex:1">
                        <option value="">Selecionar serviço...</option>
                        ${(this._services || []).map(sv => `<option value="${sv.id}">${esc(sv.name)}</option>`).join('')}
                    </select>
                    <input id="sdSvcPrice" class="suppliers-dialog-input" type="number" min="0" step="0.01" placeholder="Valor R$" style="width:110px">
                    <button class="suppliers-btn-add-price" onclick="Suppliers._addServicePrice()"><span class="material-symbols-outlined">add</span></button>
                </div>
                <div id="sdSvcPricesContainer"></div>
            </div>
        </div>
        `;
    },

    async _saveDetails() {
        const get = id => document.getElementById(id)?.value.trim() || null;
        const payload = {
            name: get("sdName"),
            cnpj: get("sdCnpj"),
            state_registration: get("sdStateReg"),
            address: get("sdAddress"),
            address_number: get("sdAddressNumber"),
            neighborhood: get("sdNeighborhood"),
            cep: get("sdCep"),
            city: get("sdCity"),
            uf: get("sdUf")?.toUpperCase() || null,
            phone: get("sdPhone")
        };
        if (!payload.name) return alert("Nome é obrigatório");
        try {
            await apiCall(API + `/suppliers/${this._editingId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            this._dialog.close();
            this.load();
        } catch (e) {
            alert(e.message || "Erro ao salvar");
        }
    },

    async _addMaterialPrice() {
        const name = document.getElementById("sdMatName")?.value.trim();
        const price = parseFloat(document.getElementById("sdMatPrice")?.value);
        if (!name) return alert("Informe o nome do material");
        if (isNaN(price) || price < 0) return alert("Informe um valor válido");
        try {
            await apiCall(API + `/suppliers/${this._editingId}/prices`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ price_type: "material", material_name: name, unit_price: price })
            });
            this._prices = await apiCall(API + `/suppliers/${this._editingId}/prices`).catch(() => []);
            this._renderPricesTable();
            document.getElementById("sdMatName").value = "";
            document.getElementById("sdMatPrice").value = "";
        } catch (e) {
            alert(e.message || "Erro ao salvar cotação");
        }
    },

    async _addServicePrice() {
        const serviceId = document.getElementById("sdSvcSelect")?.value;
        const price = parseFloat(document.getElementById("sdSvcPrice")?.value);
        if (!serviceId) return alert("Selecione um serviço");
        if (isNaN(price) || price < 0) return alert("Informe um valor válido");
        try {
            await apiCall(API + `/suppliers/${this._editingId}/prices`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ price_type: "service", service_id: serviceId, unit_price: price })
            });
            this._prices = await apiCall(API + `/suppliers/${this._editingId}/prices`).catch(() => []);
            this._renderPricesTable();
            document.getElementById("sdSvcSelect").value = "";
            document.getElementById("sdSvcPrice").value = "";
        } catch (e) {
            alert(e.message || "Erro ao salvar cotação");
        }
    },

    async _deletePrice(id) {
        if (!confirm("Remover esta cotação?")) return;
        try {
            await apiCall(API + `/suppliers/prices/${id}`, { method: "DELETE" });
            this._prices = await apiCall(API + `/suppliers/${this._editingId}/prices`).catch(() => []);
            this._renderPricesTable();
        } catch (e) {
            alert(e.message || "Erro ao remover cotação");
        }
    },

    _renderPricesTable() {
        const matContainer = document.getElementById("sdMatPricesContainer");
        const svcContainer = document.getElementById("sdSvcPricesContainer");
        if (!matContainer || !svcContainer) return;

        const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const fmtPrice = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

        const matPrices = this._prices.filter(p => p.price_type === "material");
        const svcPrices = this._prices.filter(p => p.price_type === "service");

        matContainer.innerHTML = matPrices.length === 0
            ? `<p class="suppliers-prices-empty">Nenhuma cotação de material cadastrada.</p>`
            : `<table class="suppliers-prices-table"><thead><tr><th>Material</th><th class="right">Valor R$</th><th></th></tr></thead><tbody>
               ${matPrices.map(p => `<tr><td>${esc(p.material_name)}</td><td class="right">${fmtPrice(p.unit_price)}</td>
               <td><button onclick="Suppliers._deletePrice(${p.id})" class="suppliers-price-delete-btn"><span class="material-symbols-outlined">delete</span></button></td></tr>`).join('')}
               </tbody></table>`;

        svcContainer.innerHTML = svcPrices.length === 0
            ? `<p class="suppliers-prices-empty">Nenhuma cotação de serviço cadastrada.</p>`
            : `<table class="suppliers-prices-table"><thead><tr><th>Serviço</th><th class="right">Valor R$</th><th></th></tr></thead><tbody>
               ${svcPrices.map(p => `<tr><td>${esc(p.service_name)}</td><td class="right">${fmtPrice(p.unit_price)}</td>
               <td><button onclick="Suppliers._deletePrice(${p.id})" class="suppliers-price-delete-btn"><span class="material-symbols-outlined">delete</span></button></td></tr>`).join('')}
               </tbody></table>`;
    },

    // ── Renderização ─────────────────────────────────────────────────────────

    _renderTable(suppliers) {
        const tbody = document.getElementById("suppliersTableBody");
        tbody.innerHTML = "";
        if (!suppliers || suppliers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Nenhum fornecedor cadastrado.</td></tr>`;
            return;
        }
        suppliers.forEach(supplier => {
            const tr = this._createTableRow(supplier);
            tr.onclick = () => this.selectSupplier(supplier, tr);
            tbody.appendChild(tr);
        });
    },

    _createTableRow(supplier) {
        const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const tr = document.createElement("tr");
        const cityUf = [supplier.city, supplier.uf].filter(Boolean).join("/");
        tr.innerHTML = `
            <td class="suppliers-col-name">${esc(supplier.name)}</td>
            <td class="suppliers-col-cnpj">${esc(supplier.cnpj) || '<span class="suppliers-empty-field">—</span>'}</td>
            <td class="suppliers-col-city">${esc(cityUf) || '<span class="suppliers-empty-field">—</span>'}</td>
            <td class="suppliers-col-actions">
                <button onclick="Suppliers.openDetails(${supplier.id})" title="Editar detalhes">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button onclick="Suppliers.deleteSupplier(event, ${supplier.id})" title="Excluir">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        `;
        return tr;
    },

    selectSupplier(supplier, tr) {
        clearTableSelection();
        tr.classList.add("selected");
        document.getElementById("supplierName").value = supplier.name;
        this.selectedSupplier = supplier.id;
        document.getElementById("suppliersCancelBtn").style.display = "";
        document.getElementById("supplierSaveBtn").innerHTML = "Salvar";
    },

    // ── Utilitários Privados ─────────────────────────────────────────────────

    _resetForm() {
        const nameEl = document.getElementById("supplierName");
        if (nameEl) nameEl.value = "";
        clearTableSelection();
        this.selectedSupplier = null;
        const cancelBtn = document.getElementById("suppliersCancelBtn");
        if (cancelBtn) cancelBtn.style.display = "none";
        const saveBtn = document.getElementById("supplierSaveBtn");
        if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined">playlist_add</span>Adicionar';
    },
};
