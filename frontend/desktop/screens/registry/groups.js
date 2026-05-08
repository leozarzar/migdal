/**
 * ── groups.js ──
 * Tela de listagem de grupos de materiais.
 * Permite visualizar, criar e deletar grupos.
 */
const Groups = {

    // ── Estado ──

    selectedGroup: null,
    _dataTable: null,
    _newBtn: null,
    _allGroups: [],
    _searchQuery: '',

    // ── Ciclo de Vida ──

    render() {
        this._dataTable?.destroy(); this._dataTable = null;
        this._newBtn?.destroy();    this._newBtn = null;
        this._searchInput?.destroy(); this._searchInput = null;
        this._allGroups = [];
        this._searchQuery = '';
        return `
        <div class="groups-container">
            <div class="groups-filters">
                <div class="groups-filters-icon-wrap">
                    <span class="material-symbols-outlined groups-filters-icon">filter_list</span>
                </div>
                <div id="groupsSearchMount"></div>
                <div id="groupsNewBtnContainer" class="groups-filters-actions"></div>
            </div>
            <div id="groupsTableContainer"></div>
        </div>
        `;
    },

    async load() {
        this._mountNewButton();
        if (!this._searchInput) {
            const mount = document.getElementById('groupsSearchMount');
            if (mount) {
                this._searchInput = createInput({
                    id: 'groupsSearch',
                    placeholder: 'Buscar',
                    icon: 'Search',
                    onInput: v => Groups._onSearch(v),
                });
                mount.appendChild(this._searchInput.el);
            }
        }

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    { key: 'name', header: 'Nome', sortable: true, render: r => r.name },
                    { key: 'material_count', header: 'Materiais', width: '100px', render: r => r.material_count ?? 0 },
                ],
                getRowKey: r => r.id,
                onRowClick: r => this.selectGroup(r),
                actions: [
                    {
                        label: 'Excluir', icon: 'delete', variant: 'destructive',
                        hidden: () => !hasPermission('registry', 'groups', 'delete'),
                        onClick: r => this.deleteGroup(r.id),
                    },
                ],
                emptyMessage: 'Nenhum grupo cadastrado.',
                emptyIcon: 'folder',
            });
            this._dataTable.mount(document.getElementById('groupsTableContainer'));
        }

        this._dataTable.setLoading(true);

        try {
            this._allGroups = await apiCall(API + '/groups') || [];
            this._applyFilter();
        } catch {
            this._dataTable.setLoading(false);
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    newGroup() {
        this.selectedGroup = null;
        showScreen('groups-details');
    },

    selectGroup(group) {
        this.selectedGroup = group;
        showScreen('groups-details');
    },

    async deleteGroup(id) {
        if (!confirm('Tem certeza que deseja deletar este grupo?')) return;

        try {
            await apiCall(API + `/groups/${id}`, { method: 'DELETE' });
            this.load();
        } catch (error) {
            alert(error.message || 'Erro ao deletar grupo');
        }
    },

    // ── Privado ──

    _onSearch(val) {
        this._searchQuery = val;
        this._applyFilter();
    },

    _applyFilter() {
        const q = this._searchQuery.toLowerCase();
        const filtered = q ? this._allGroups.filter(r => r.name.toLowerCase().includes(q)) : this._allGroups;
        this._dataTable?.setData(filtered);
    },

    _mountNewButton() {
        document.getElementById('headerOptionsContent').innerHTML = '';
        if (!hasPermission('registry', 'groups', 'create')) return;
        this._newBtn = createButton({
            label: 'Novo Grupo',
            variant: 'primary',
            icon: 'add',
            onClick: () => this.newGroup(),
        });
        document.getElementById('groupsNewBtnContainer').appendChild(this._newBtn.el);
    },
};
