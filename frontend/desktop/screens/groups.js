/**
 * ── groups.js ──
 * Tela de listagem de grupos de materiais.
 * Permite visualizar, criar e deletar grupos.
 */
const Groups = {

    // ── Estado ──

    selectedGroup: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela. */
    render() {
        return `
        <div class="groups-container">
            <div class="groups-card">
                <div class="groups-table-container">
                    <table class="groups-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Materiais</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="groupsTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    },

    /** Inicializa a tela e carrega os grupos. */
    async load() {
        this._setHeaderOptions();

        try {
            const groups = await apiCall(API + "/groups") || [];
            this._renderTable(groups);
        } catch (error) {
            this._renderTable([]);
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    /** Injeta o botão de navegação no header da página. */
    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) {
            headerOptions.innerHTML = `
                <button class="btn-new" onclick="Groups.newGroup()">
                    <span class="material-symbols-outlined">add</span>
                    Novo Grupo
                </button>
            `;
        }
    },

    /** Navega para a tela de criação de novo grupo. */
    newGroup() {
        this.selectedGroup = null;
        showScreen('groups-details');
    },

    /** Seleciona um grupo e navega para a tela de detalhes. */
    selectGroup(group) {
        this.selectedGroup = group;
        showScreen('groups-details');
    },

    /** Deleta um grupo após confirmação do usuário. */
    async deleteGroup(event, id) {
        event.stopPropagation();

        if (!confirm("Tem certeza que deseja deletar este grupo?")) return;

        try {
            await apiCall(API + `/groups/${id}`, { method: "DELETE" });
            this.load();
        } catch (error) {
            alert(error.message || "Erro ao deletar grupo");
        }
    },

    // ── Renderização ──

    /** Renderiza a tabela de grupos ou mensagem de estado vazio. */
    _renderTable(groups) {
        const tbody = document.getElementById("groupsTableBody");
        tbody.innerHTML = "";

        if (!groups || groups.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="3" class="empty-state">Nenhum grupo cadastrado.</td>`;
            tbody.appendChild(tr);
            return;
        }

        groups.forEach(group => {
            const tr = this._createTableRow(group);
            tr.onclick = () => this.selectGroup(group);
            tbody.appendChild(tr);
        });
    },

    /** Cria uma linha <tr> para exibição de um grupo. */
    _createTableRow(group) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${group.name}</td>
            <td>${group.material_count ?? 0}</td>
            <td class="groups-col-actions">
                <button onclick="Groups.deleteGroup(event, ${group.id})">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        `;
        return tr;
    },
};
