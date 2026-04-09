/**
 * ── operators.js ──
 * Tela de cadastro de operadores.
 * Permite listar, adicionar, editar e deletar operadores.
 */
const Operators = {

    // ── Estado ──

    selectedOperator: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela. */
    render() {
        return `
        <div class="operators-container">
            <div class="operators-card">
                <div class="operators-form-wrapper">
                    <input id="operatorName" class="operators-input" placeholder="Nome do operador">
                    <button class="operators-btn-save" id="operatorSaveBtn" onclick="Operators.saveOperator()"><span class="material-symbols-outlined">playlist_add</span>Adicionar</button>
                    <button class="operators-btn-cancel" id="operatorsCancelBtn" style="display:none" onclick="Operators.cancelEdit()">Cancelar</button>
                </div>
                <div class="operators-table-container">
                    <table class="operators-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="operatorsTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    },

    /** Inicializa a tela: reseta formulário e carrega operadores. */
    async load() {
        this._resetForm();
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) headerOptions.innerHTML = "";

        try {
            const operators = await apiCall(API + "/operators");
            this._renderTable(operators);
        } catch (error) {
            alert("Erro ao carregar operadores");
        }
    },

    // ── Ações Públicas ──

    /** Salva um novo operador ou atualiza o selecionado. */
    async saveOperator() {
        const name = document.getElementById("operatorName").value.trim();

        if (!name) {
            alert("Digite o nome do operador");
            return;
        }

        try {
            if (this.selectedOperator) {
                await apiCall(API + `/operators/${this.selectedOperator}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name })
                });
                alert("Operador atualizado com sucesso");
            } else {
                await apiCall(API + "/operators", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name })
                });
                alert("Operador criado com sucesso");
            }
            this.load();
        } catch (error) {
            alert(error.message || "Erro ao salvar operador");
        }
    },

    /** Seleciona um operador e preenche o formulário para edição. */
    selectOperator(operator, tr) {
        clearTableSelection();
        tr.classList.add("selected");
        document.getElementById("operatorName").value = operator.name;
        this.selectedOperator = operator.id;
        const cancelBtn = document.getElementById("operatorsCancelBtn");
        if (cancelBtn) cancelBtn.style.display = "";
        const saveBtn = document.getElementById("operatorSaveBtn");
        if (saveBtn) saveBtn.innerHTML = 'Salvar';
    },

    /** Cancela a edição e reseta o formulário. */
    cancelEdit() {
        this._resetForm();
    },

    /** Deleta um operador após confirmação do usuário. */
    async deleteOperator(event, id) {
        event.stopPropagation();

        if (!confirm("Tem certeza que deseja deletar?")) return;

        try {
            await apiCall(API + `/operators/${id}`, { method: "DELETE" });
            this.load();
        } catch (error) {
            alert("Erro ao deletar operador");
        }
    },

    // ── Renderização ──

    /** Renderiza a tabela de operadores ou mensagem de estado vazio. */
    _renderTable(operators) {
        const tbody = document.getElementById("operatorsTableBody");
        tbody.innerHTML = "";

        if (!operators || operators.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="2" class="empty-state">Nenhum operador cadastrado.</td>`;
            tbody.appendChild(tr);
            return;
        }

        operators.forEach(operator => {
            const tr = this._createTableRow(operator);
            tr.onclick = () => this.selectOperator(operator, tr);
            tbody.appendChild(tr);
        });
    },

    /** Cria uma linha <tr> para exibição de um operador. */
    _createTableRow(operator) {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td class="operators-col-name">${operator.name}</td>
            <td class="operators-col-actions">
                <button onclick="Operators.deleteOperator(event, ${operator.id})">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        `;

        return tr;
    },

    // ── Utilitários Privados ──

    /** Reseta o formulário para o estado inicial (novo registro). */
    _resetForm() {
        clearFormInputs(["operatorName"]);
        clearTableSelection();
        this.selectedOperator = null;
        const cancelBtn = document.getElementById("operatorsCancelBtn");
        if (cancelBtn) cancelBtn.style.display = "none";
        const saveBtn = document.getElementById("operatorSaveBtn");
        if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined">playlist_add</span>Adicionar';
    },
};
