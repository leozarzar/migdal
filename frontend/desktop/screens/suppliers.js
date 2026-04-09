/**
 * ── suppliers.js ──
 * Tela de cadastro de fornecedores.
 * Permite listar, adicionar, editar e deletar fornecedores.
 */
const Suppliers = {

    // ── Estado ──

    selectedSupplier: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela. */
    render() {
        return `
        <div class="suppliers-container">
            <div class="suppliers-card">
                <div class="suppliers-form-wrapper">
                    <input id="supplierName" class="suppliers-input" placeholder="Nome do fornecedor">
                    <button class="suppliers-btn-save" id="supplierSaveBtn" onclick="Suppliers.saveSupplier()"><span class="material-symbols-outlined">playlist_add</span>Adicionar</button>
                    <button class="suppliers-btn-cancel" id="suppliersCancelBtn" style="display:none" onclick="Suppliers.cancelEdit()">Cancelar</button>
                </div>
                <div class="suppliers-table-container">
                    <table class="suppliers-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
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

    /** Inicializa a tela: reseta formulário e carrega fornecedores. */
    async load() {
        this._resetForm();
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) headerOptions.innerHTML = "";
        
        try {
            const suppliers = await apiCall(API + "/suppliers");
            this._renderTable(suppliers);
        } catch (error) {
            alert("Erro ao carregar fornecedores");
        }
    },

    // ── Ações Públicas ──

    /** Salva um novo fornecedor ou atualiza o selecionado. */
    async saveSupplier() {
        const name = document.getElementById("supplierName").value.trim();

        if (!name) {
            alert("Digite o nome do fornecedor");
            return;
        }

        try {
            if (this.selectedSupplier) {
                // Editar
                await apiCall(API + `/suppliers/${this.selectedSupplier}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name })
                });
                alert("Fornecedor atualizado com sucesso");
            } else {
                // Criar
                await apiCall(API + "/suppliers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name })
                });
                alert("Fornecedor criado com sucesso");
            }
            this.load();
        } catch (error) {
            alert(error.message || "Erro ao salvar fornecedor");
        }
    },

    /** Limpa a seleção e foca no campo de nome para novo cadastro. */
    newSupplier() {
        clearFormInputs(["supplierName"]);
        clearTableSelection();
        this.selectedSupplier = null;
        document.getElementById("supplierName").focus();
    },

    /** Seleciona um fornecedor e preenche o formulário para edição. */
    selectSupplier(supplier, tr) {
        clearTableSelection();
        tr.classList.add("selected");
        document.getElementById("supplierName").value = supplier.name;
        this.selectedSupplier = supplier.id;
        const cancelBtn = document.getElementById("suppliersCancelBtn");
        if (cancelBtn) cancelBtn.style.display = "";
        const saveBtn = document.getElementById("supplierSaveBtn");
        if (saveBtn) saveBtn.innerHTML = 'Salvar';
    },

    /** Cancela a edição e reseta o formulário. */
    cancelEdit() {
        this._resetForm();
    },

    /** Deleta um fornecedor após confirmação do usuário. */
    async deleteSupplier(event, id) {
        event.stopPropagation();
        
        if (!confirm("Tem certeza que deseja deletar?")) return;

        try {
            await apiCall(API + `/suppliers/${id}`, { method: "DELETE" });
            this.load();
        } catch (error) {
            alert("Erro ao deletar fornecedor");
        }
    },

    // ── Renderização ──

    /** Renderiza a tabela de fornecedores ou mensagem de estado vazio. */
    _renderTable(suppliers) {
        const tbody = document.getElementById("suppliersTableBody");
        tbody.innerHTML = "";

        if (!suppliers || suppliers.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="2" class="empty-state">Nenhum fornecedor cadastrado.</td>`;
            tbody.appendChild(tr);
            return;
        }

        suppliers.forEach(supplier => {
            const tr = this._createTableRow(supplier);
            tr.onclick = () => this.selectSupplier(supplier, tr);
            tbody.appendChild(tr);
        });
    },

    /** Cria uma linha <tr> para exibição de um fornecedor. */
    _createTableRow(supplier) {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td class="suppliers-col-name">${supplier.name}</td>
            <td class="suppliers-col-actions">
                <button onclick="Suppliers.deleteSupplier(event, ${supplier.id})">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        `;

        return tr;
    },

    // ── Utilitários Privados ──

    /** Reseta o formulário para o estado inicial (novo registro). */
    _resetForm() {
        clearFormInputs(["supplierName"]);
        clearTableSelection();
        this.selectedSupplier = null;
        const cancelBtn = document.getElementById("suppliersCancelBtn");
        if (cancelBtn) cancelBtn.style.display = "none";
        const saveBtn = document.getElementById("supplierSaveBtn");
        if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined">playlist_add</span>Adicionar';
    },
};
