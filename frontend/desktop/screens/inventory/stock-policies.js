/**
 * ── stock-policies.js ──
 * Tela de listagem de políticas de estoque.
 * Permite visualizar, criar e deletar políticas.
 */
const StockPolicies = {

    // ── Estado ──

    selectedPolicy: null,
    _dataTable: null,
    _newBtn: null,
    _allPolicies: [],
    _searchQuery: '',

    // ── Ciclo de Vida ──

    render() {
        this._dataTable?.destroy(); this._dataTable = null;
        this._newBtn?.destroy();    this._newBtn = null;
        this._allPolicies = [];
        this._searchQuery = '';
        return `
        <div class="stock-policies-container">
            <div class="stock-policies-filters">
                <div class="stock-policies-filters-icon-wrap">
                    <span class="material-symbols-outlined stock-policies-filters-icon">filter_list</span>
                </div>
                <input type="text" id="stockPoliciesSearch" class="stock-policies-search-input" placeholder="Buscar" oninput="StockPolicies._onSearch(this.value)">
                <div id="stockPoliciesNewBtnContainer" class="stock-policies-filters-actions"></div>
            </div>
            <div id="stockPoliciesTableContainer"></div>
        </div>
        `;
    },

    async load() {
        this._mountNewButton();

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    { key: 'name', header: 'Nome', sortable: true, render: r => r.name },
                    { key: 'review_type', header: 'Revisão', render: r => this._reviewLabel(r) },
                    { key: 'service_level', header: 'Nível de Serviço', width: '130px', render: r => `${r.service_level}%` },
                    { key: 'item_count', header: 'Itens', width: '80px', render: r => r.item_count ?? '—' },
                ],
                getRowKey: r => r.id,
                onRowClick: r => this.selectPolicy(r),
                actions: [
                    {
                        label: 'Excluir', icon: 'delete', variant: 'destructive',
                        hidden: () => !hasPermission('inventory', 'stock-policies', 'delete'),
                        onClick: r => this.deletePolicy(r.id),
                    },
                ],
                emptyMessage: 'Nenhuma política de estoque cadastrada.',
                emptyIcon: 'inventory_2',
            });
            this._dataTable.mount(document.getElementById('stockPoliciesTableContainer'));
        }

        this._dataTable.setLoading(true);

        try {
            this._allPolicies = await apiCall(API + '/stock-policies') || [];
            this._applyFilter();
        } catch {
            this._dataTable.setLoading(false);
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    newPolicy() {
        this.selectedPolicy = null;
        showScreen('stock-policies-details');
    },

    selectPolicy(policy) {
        this.selectedPolicy = policy;
        showScreen('stock-policies-details');
    },

    async deletePolicy(id) {
        if (!confirm('Tem certeza que deseja deletar esta política?')) return;

        try {
            await apiCall(API + `/stock-policies/${id}`, { method: 'DELETE' });
            this.load();
        } catch {
            alert('Erro ao deletar política de estoque');
        }
    },

    // ── Privado ──

    _onSearch(val) {
        this._searchQuery = val;
        this._applyFilter();
    },

    _applyFilter() {
        const q = this._searchQuery.toLowerCase();
        const filtered = q ? this._allPolicies.filter(r => r.name.toLowerCase().includes(q)) : this._allPolicies;
        this._dataTable?.setData(filtered);
    },

    _mountNewButton() {
        document.getElementById('headerOptionsContent').innerHTML = '';
        if (!hasPermission('inventory', 'stock-policies', 'create')) return;
        this._newBtn = createButton({
            label: 'Nova Política',
            variant: 'primary',
            icon: 'add',
            onClick: () => this.newPolicy(),
        });
        document.getElementById('stockPoliciesNewBtnContainer').appendChild(this._newBtn.el);
    },

    _reviewLabel(policy) {
        if (policy.review_type === 'continuous') return 'Contínua';
        const periodMap = { daily: 'Diária', weekly: 'Semanal', monthly: 'Mensal', custom: `${policy.review_period_days}d` };
        return `Periódica — ${periodMap[policy.review_period] || policy.review_period}`;
    },
};
