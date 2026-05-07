/**
 * ── locations.js ──
 * Tela de cadastro de localizações (armazéns/posições).
 * Permite listar, adicionar, editar e deletar localizações.
 */
const Locations = {

    // ── Estado ──

    selectedLocation: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela. */
    render() {
        return `
        <div class="locations-container">
            <div class="locations-card">
                <div class="locations-form-wrapper">
                    <input id="locationName" class="locations-input" placeholder="Nome da localização">
                    <input id="locationDescription" class="locations-input locations-input--wide" placeholder="Descrição (opcional)">
                    <button class="locations-btn-save" id="locationSaveBtn" onclick="Locations.saveLocation()"><span class="material-symbols-outlined">playlist_add</span>Adicionar</button>
                    <button class="locations-btn-cancel" id="locationsCancelBtn" style="display:none" onclick="Locations.cancelEdit()">Cancelar</button>
                </div>
                <div class="locations-table-container">
                    <table class="locations-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Descrição</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="locationsTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    },

    /** Inicializa a tela: reseta formulário e carrega localizações. */
    async load() {
        this._resetForm();
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) headerOptions.innerHTML = "";

        const formWrapper = document.querySelector('.locations-form-wrapper');
        if (formWrapper) formWrapper.style.display = hasPermission('registry', 'locations', 'create') ? '' : 'none';

        try {
            const locations = await apiCall(API + "/locations");
            this._renderTable(locations);
        } catch (error) {
            alert("Erro ao carregar localizações");
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    /** Salva uma nova localização ou atualiza a selecionada. */
    async saveLocation() {
        const action = this.selectedLocation ? 'edit' : 'create';
        if (!hasPermission('registry', 'locations', action)) return;

        const name = document.getElementById("locationName").value.trim();
        const description = document.getElementById("locationDescription").value.trim();

        if (!name) {
            alert("Digite o nome da localização");
            return;
        }

        try {
            if (this.selectedLocation) {
                await apiCall(API + `/locations/${this.selectedLocation}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, description })
                });
                alert("Localização atualizada com sucesso");
            } else {
                await apiCall(API + "/locations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, description })
                });
                alert("Localização criada com sucesso");
            }
            this.load();
        } catch (error) {
            alert(error.message || "Erro ao salvar localização");
        }
    },

    /** Seleciona uma localização e preenche o formulário para edição. */
    selectLocation(location, tr) {
        clearTableSelection();
        tr.classList.add("selected");
        document.getElementById("locationName").value = location.name;
        document.getElementById("locationDescription").value = location.description || '';
        this.selectedLocation = location.id;
        const cancelBtn = document.getElementById("locationsCancelBtn");
        if (cancelBtn) cancelBtn.style.display = "";
        const saveBtn = document.getElementById("locationSaveBtn");
        if (saveBtn) saveBtn.innerHTML = 'Salvar';
    },

    /** Cancela a edição e reseta o formulário. */
    cancelEdit() {
        this._resetForm();
    },

    /** Deleta uma localização após confirmação do usuário. */
    async deleteLocation(event, id) {
        event.stopPropagation();

        if (!confirm("Tem certeza que deseja deletar esta localização?")) return;

        try {
            await apiCall(API + `/locations/${id}`, { method: "DELETE" });
            this.load();
        } catch (error) {
            alert(error.message || "Erro ao deletar localização");
        }
    },

    // ── Renderização ──

    /** Renderiza a tabela de localizações ou mensagem de estado vazio. */
    _renderTable(locations) {
        const tbody = document.getElementById("locationsTableBody");
        tbody.innerHTML = "";

        if (!locations || locations.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="3" class="empty-state">Nenhuma localização cadastrada.</td>`;
            tbody.appendChild(tr);
            return;
        }

        const canEdit = hasPermission('registry', 'locations', 'edit');
        locations.forEach(location => {
            const tr = this._createTableRow(location);
            if (canEdit) {
                tr.onclick = () => this.selectLocation(location, tr);
            } else {
                tr.style.cursor = 'default';
            }
            tbody.appendChild(tr);
        });
    },

    /** Cria uma linha <tr> para exibição de uma localização. */
    _createTableRow(location) {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td class="locations-col-name">${_esc(location.name)}</td>
            <td class="locations-col-desc">${_esc(location.description || '—')}</td>
            <td class="locations-col-actions">
                ${hasPermission('registry', 'locations', 'delete') ? `<button onclick="Locations.deleteLocation(event, ${location.id})">
                    <span class="material-symbols-outlined">delete</span>
                </button>` : ''}
            </td>
        `;

        return tr;
    },

    // ── Utilitários Privados ──

    /** Reseta o formulário para o estado inicial (novo registro). */
    _resetForm() {
        clearFormInputs(["locationName", "locationDescription"]);
        clearTableSelection();
        this.selectedLocation = null;
        const cancelBtn = document.getElementById("locationsCancelBtn");
        if (cancelBtn) cancelBtn.style.display = "none";
        const saveBtn = document.getElementById("locationSaveBtn");
        if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined">playlist_add</span>Adicionar';
    },
};
