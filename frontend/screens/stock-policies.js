/**
 * ── stock-policies.js ──
 * Tela de listagem de políticas de estoque.
 * Permite visualizar, criar e deletar políticas.
 */
const StockPolicies = {

    // ── Estado ──

    selectedPolicy: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela. */
    render() {
        return `
        <div class="stock-policies-container">
            <div class="stock-policies-card">
                <div class="stock-policies-table-container">
                    <table class="stock-policies-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Revisão</th>
                                <th>Nível de Serviço</th>
                                <th>Itens</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="tableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    },

    /** Inicializa a tela e carrega as políticas. */
    async load() {
        this._setHeaderOptions();

        try {
            const policies = await apiCall(API + "/stock-policies") || [];
            this._renderTable(policies);
        } catch (error) {
            this._renderTable([]);
        }
    },

    // ── Ações Públicas ──

    /** Injeta o botão de navegação no header da página. */
    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) {
            headerOptions.innerHTML = `
                <button class="btn-new" onclick="StockPolicies.newPolicy()">
                    <span class="material-symbols-outlined">add</span>
                    Nova Política
                </button>
            `;
        }
    },

    /** Navega para a tela de criação de nova política. */
    newPolicy() {
        this.selectedPolicy = null;
        showScreen('stock-policies-details');
    },

    /** Seleciona uma política e navega para a tela de detalhes. */
    selectPolicy(policy) {
        this.selectedPolicy = policy;
        showScreen('stock-policies-details');
    },

    /** Deleta uma política após confirmação do usuário. */
    async deletePolicy(event, id) {
        event.stopPropagation();

        if (!confirm("Tem certeza que deseja deletar esta política?")) return;

        try {
            await apiCall(API + `/stock-policies/${id}`, { method: "DELETE" });
            this.load();
        } catch (error) {
            alert("Erro ao deletar política de estoque");
        }
    },

    // ── Renderização ──

    /** Renderiza a tabela de políticas ou mensagem de estado vazio. */
    _renderTable(policies) {
        const tbody = document.getElementById("tableBody");
        tbody.innerHTML = "";

        if (!policies || policies.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="5" class="empty-state">Nenhuma política de estoque cadastrada.</td>`;
            tbody.appendChild(tr);
            return;
        }

        policies.forEach(policy => {
            const tr = this._createTableRow(policy);
            tr.onclick = () => this.selectPolicy(policy);
            tbody.appendChild(tr);
        });
    },

    /** Cria uma linha <tr> para exibição de uma política. */
    _createTableRow(policy) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${policy.name}</td>
            <td>${this._reviewLabel(policy)}</td>
            <td>${policy.service_level}%</td>
            <td>${policy.item_count ?? '—'}</td>
            <td class="stock-policies-col-actions">
                <button onclick="StockPolicies.deletePolicy(event, ${policy.id})">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        `;
        return tr;
    },

    // ── Utilitários Privados ──

    /** Retorna o label formatado do tipo de revisão da política. */
    _reviewLabel(policy) {
        if (policy.review_type === 'continuous') return 'Contínua';
        const periodMap = { daily: 'Diária', weekly: 'Semanal', monthly: 'Mensal', custom: `${policy.review_period_days}d` };
        return `Periódica — ${periodMap[policy.review_period] || policy.review_period}`;
    },
};
