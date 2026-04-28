/**
 * ── services.js ──
 * Tela de cadastro de serviços.
 * Permite listar, adicionar, editar e deletar serviços.
 * Tipos: 'quantity' (por quantidade) | 'fixed' (por serviço)
 */
const Services = {

    // ── Estado ──────────────────────────────────────────────────────────────

    _selectedId: null,

    // ── Ciclo de Vida ────────────────────────────────────────────────────────

    render() {
        return `
        <div class="services-container">
            <div class="services-card">
                <div class="services-form-wrapper">
                    <div class="services-field-group">
                        <label class="services-field-label" for="serviceName">Nome</label>
                        <input id="serviceName" class="services-input" placeholder="Nome do serviço">
                    </div>
                    <div class="services-field-group">
                        <label class="services-field-label" for="serviceType">Tipo</label>
                        <select id="serviceType" class="services-select">
                            <option value="quantity">Por quantidade</option>
                            <option value="fixed">Por serviço (valor fixo)</option>
                        </select>
                    </div>
                    <div class="services-field-group">
                        <label class="services-field-label" for="servicePrice">Valor (R$)</label>
                        <input id="servicePrice" class="services-input services-input-price" type="number" min="0" step="0.01" placeholder="0,00">
                    </div>
                    <button class="services-btn-save" id="servicesSaveBtn" onclick="Services.save()">
                        <span class="material-symbols-outlined">playlist_add</span>Adicionar
                    </button>
                    <button class="services-btn-cancel" id="servicesCancelBtn" style="display:none" onclick="Services.cancelEdit()">Cancelar</button>
                </div>
                <div class="services-table-container">
                    <table class="services-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Tipo</th>
                                <th class="right">Valor</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="servicesTableBody"></tbody>
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
            const services = await apiCall(API + "/services");
            this._renderTable(services);
        } catch (e) {
            alert("Erro ao carregar serviços");
        }
    },

    // ── Ações Públicas ───────────────────────────────────────────────────────

    async save() {
        const name = document.getElementById("serviceName").value.trim();
        const service_type = document.getElementById("serviceType").value;
        const unit_price = parseFloat(document.getElementById("servicePrice").value);

        if (!name) return alert("Digite o nome do serviço");
        if (isNaN(unit_price) || unit_price < 0) return alert("Informe um valor válido");

        try {
            if (this._selectedId) {
                await apiCall(API + `/services/${this._selectedId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, service_type, unit_price })
                });
            } else {
                await apiCall(API + "/services", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, service_type, unit_price })
                });
            }
            this.load();
        } catch (e) {
            alert(e.message || "Erro ao salvar serviço");
        }
    },

    select(service, tr) {
        clearTableSelection();
        tr.classList.add("selected");
        document.getElementById("serviceName").value = service.name;
        document.getElementById("serviceType").value = service.service_type;
        document.getElementById("servicePrice").value = service.unit_price;
        this._selectedId = service.id;
        document.getElementById("servicesCancelBtn").style.display = "";
        document.getElementById("servicesSaveBtn").innerHTML = "Salvar";
    },

    cancelEdit() {
        this._resetForm();
    },

    async deleteService(event, id) {
        event.stopPropagation();
        if (!confirm("Confirma exclusão do serviço?")) return;
        try {
            await apiCall(API + `/services/${id}`, { method: "DELETE" });
            this.load();
        } catch (e) {
            alert(e.message || "Erro ao deletar serviço");
        }
    },

    // ── Renderização ─────────────────────────────────────────────────────────

    _renderTable(services) {
        const tbody = document.getElementById("servicesTableBody");
        tbody.innerHTML = "";
        if (!services || services.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Nenhum serviço cadastrado.</td></tr>`;
            return;
        }
        services.forEach(s => {
            const tr = this._createRow(s);
            tr.onclick = () => this.select(s, tr);
            tbody.appendChild(tr);
        });
    },

    _createRow(s) {
        const tr = document.createElement("tr");
        const typeLabel = s.service_type === "fixed" ? "Por serviço" : "Por quantidade";
        const price = Number(s.unit_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
        tr.innerHTML = `
            <td>${s.name}</td>
            <td>${typeLabel}</td>
            <td class="right">R$ ${price}</td>
            <td class="services-col-actions">
                <button onclick="Services.deleteService(event, ${s.id})">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        `;
        return tr;
    },

    // ── Utilitários Privados ─────────────────────────────────────────────────

    _resetForm() {
        document.getElementById("serviceName") && (document.getElementById("serviceName").value = "");
        document.getElementById("serviceType") && (document.getElementById("serviceType").value = "quantity");
        document.getElementById("servicePrice") && (document.getElementById("servicePrice").value = "");
        clearTableSelection();
        this._selectedId = null;
        const cancelBtn = document.getElementById("servicesCancelBtn");
        if (cancelBtn) cancelBtn.style.display = "none";
        const saveBtn = document.getElementById("servicesSaveBtn");
        if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined">playlist_add</span>Adicionar';
    },
};
