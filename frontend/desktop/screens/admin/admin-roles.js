/**
 * ── AdminRoles ──
 * Tela de listagem de papéis (roles) do sistema.
 * Permite visualizar, criar e excluir papéis.
 */
const AdminRoles = {

    // ── Estado ──

    _roles: [],
    selectedRoleId: null,
    _dataTable: null,
    _newBtn: null,
    _searchInput: null,
    _searchQuery: '',

    // ── Ciclo de Vida ──

    render() {
        this._dataTable?.destroy();    this._dataTable = null;
        this._newBtn?.destroy();       this._newBtn = null;
        this._searchInput?.destroy();  this._searchInput = null;
        this._searchQuery = '';
        return `
        <div class="admin-roles-container">
            <div class="admin-roles-filters">
                <div class="admin-roles-filters-icon-wrap">
                    <span class="material-symbols-outlined admin-roles-filters-icon">filter_list</span>
                </div>
                <div id="adminRolesSearchContainer" class="admin-roles-search-container"></div>
                <div id="adminRolesNewBtnContainer" class="admin-roles-filters-actions"></div>
            </div>
            <div id="adminRolesTableContainer"></div>
        </div>`;
    },

    async load() {
        this._mountNewButton();
        this._mountSearchInput();

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    { key: 'name', header: 'Nome', sortable: true, render: r => `<strong>${_esc(r.name)}</strong>` },
                    { key: 'description', header: 'Descrição', render: r => _esc(r.description || '—') },
                    {
                        key: 'is_admin', header: 'Tipo', width: '130px',
                        render: r => r.is_admin
                            ? '<span class="admin-roles-badge admin-roles-badge--admin">Administrador</span>'
                            : '<span class="admin-roles-badge admin-roles-badge--custom">Personalizado</span>',
                    },
                    { key: 'user_count', header: 'Usuários', width: '80px', render: r => r.user_count || 0 },
                ],
                getRowKey: r => r.id,
                actions: [
                    {
                        label: 'Editar', icon: 'edit',
                        hidden: r => r.is_admin || !hasPermission('admin', 'admin-roles', 'edit'),
                        onClick: r => this.editRole(r.id),
                    },
                    {
                        label: 'Excluir', icon: 'delete', variant: 'destructive',
                        hidden: r => r.is_admin || !hasPermission('admin', 'admin-roles', 'delete'),
                        onClick: r => this.deleteRole(r.id),
                    },
                ],
                emptyMessage: 'Nenhum papel cadastrado.',
                emptyIcon: 'manage_accounts',
            });
            this._dataTable.mount(document.getElementById('adminRolesTableContainer'));
        }

        this._dataTable.setLoading(true);

        try {
            this._roles = await apiCall(API + '/roles');
            this._applyFilter();
        } catch (e) {
            alert(e.message);
            this._dataTable.setLoading(false);
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    createRole() {
        this.selectedRoleId = null;
        showScreen('admin-roles-details');
    },

    editRole(id) {
        this.selectedRoleId = id;
        showScreen('admin-roles-details');
    },

    async deleteRole(id) {
        if (!confirm('Confirma exclusão deste papel?')) return;
        try {
            await apiCall(API + '/roles/' + id, { method: 'DELETE' });
            await this.load();
        } catch (e) { alert(e.message); }
    },

    // ── Privado ──

    _onSearch(val) {
        this._searchQuery = val;
        this._applyFilter();
    },

    _applyFilter() {
        const q = this._searchQuery.toLowerCase();
        const filtered = q
            ? this._roles.filter(r => r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
            : this._roles;
        this._dataTable?.setData(filtered);
    },

    _mountSearchInput() {
        const container = document.getElementById('adminRolesSearchContainer');
        if (!container) return;
        this._searchInput = createInput({
            placeholder: 'Buscar',
            icon: 'Search',
            onInput: v => AdminRoles._onSearch(v),
        });
        container.appendChild(this._searchInput.el);
    },

    _mountNewButton() {
        document.getElementById('headerOptionsContent').innerHTML = '';
        if (!hasPermission('admin', 'admin-roles', 'create')) return;
        this._newBtn = createButton({
            label: 'Novo Papel',
            variant: 'primary',
            icon: 'add',
            onClick: () => this.createRole(),
        });
        document.getElementById('adminRolesNewBtnContainer').appendChild(this._newBtn.el);
    },
};
