/**
 * ── AdminUsers ──
 * Tela de gestão de usuários: lista e atribuição de papéis.
 */

const AdminUsers = {
    _users: [],
    _allUsers: [],
    _roles: [],
    _locations: [],
    _userLocations: {},
    _table: null,
    _searchInput: null,
    _searchQuery: '',

// ── Ciclo de Vida ────────────────────────────────────────────────

    render() {
        this._table?.destroy();
        this._table = null;
        this._searchInput?.destroy();
        this._searchInput = null;
        this._searchQuery = '';
        return `
        <div class="admin-users-container">
            <div class="admin-users-filters">
                <div class="admin-users-filters-icon-wrap">
                    <span class="material-symbols-outlined admin-users-filters-icon">filter_list</span>
                </div>
                <div id="adminUsersSearchMount"></div>
            </div>
            <div id="adminUsersTableMount"></div>
        </div>`;
    },

    async load() {
        this._ensureSearchInput();
        this._ensureTable();
        this._table.setLoading(true);

        try {
            const [users, roles, locations] = await Promise.all([
                apiCall(API + '/roles/users/list'),
                apiCall(API + '/roles'),
                apiCall(API + '/locations')
            ]);
            this._allUsers  = users;
            this._users     = users;
            this._roles     = roles;
            this._locations = locations || [];

            const locResults = await Promise.all(
                this._allUsers.map(u =>
                    apiCall(API + '/locations/users/' + u.id + '/locations')
                        .then(locs => ({ userId: u.id, locs: (locs || []).map(l => l.id) }))
                        .catch(() => ({ userId: u.id, locs: [] }))
                )
            );
            this._userLocations = {};
            for (const r of locResults) this._userLocations[r.userId] = r.locs;

            this._applyFilter();
        } catch (e) {
            this._table.setLoading(false);
            alert(e.message);
        }
    },

    async onTabFocus() { return this.load(); },

// ── Ações Públicas ───────────────────────────────────────────────

    async changeRole(select, userId) {
        const roleId = select.value ? parseInt(select.value) : null;
        try {
            await apiCall(API + '/roles/users/' + userId + '/role', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role_id: roleId })
            });
            if (typeof showToast === 'function') showToast('Papel atualizado.', 'success');
        } catch (e) {
            alert(e.message);
            await this.load();
        }
    },

    async toggleUserLocation(checkbox, userId, locationId) {
        const current = this._userLocations[userId] || [];
        const updated = checkbox.checked
            ? [...current, locationId]
            : current.filter(id => id !== locationId);
        try {
            await apiCall(API + '/locations/users/' + userId + '/locations', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location_ids: updated })
            });
            this._userLocations[userId] = updated;
            if (typeof showToast === 'function') showToast('Localizações atualizadas.', 'success');
        } catch (e) {
            checkbox.checked = !checkbox.checked;
            alert(e.message);
        }
    },

// ── Privado ──────────────────────────────────────────────────────

    _onSearch(val) {
        this._searchQuery = val;
        this._applyFilter();
    },

    _applyFilter() {
        const q = this._searchQuery.toLowerCase();
        const filtered = q
            ? this._allUsers.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
            : this._allUsers;
        this._users = filtered;
        this._table?.setData(filtered);
    },

    _ensureSearchInput() {
        if (this._searchInput) return;
        const mount = document.getElementById('adminUsersSearchMount');
        if (!mount) return;
        this._searchInput = createInput({
            id: 'adminUsersSearch',
            placeholder: 'Buscar',
            icon: 'Search',
            onInput: v => AdminUsers._onSearch(v),
        });
        mount.appendChild(this._searchInput.el);
    },

    _ensureTable() {
        if (this._table) return;

        this._table = createDataTable({
            getRowKey: user => user.id,
            emptyMessage: 'Nenhum usuário cadastrado.',
            emptyIcon: 'person_off',
            columns: [
                {
                    key: 'name',
                    header: 'Nome',
                    sortable: true,
                    render: user => `<strong>${_esc(user.name)}</strong>`,
                },
                {
                    key: 'email',
                    header: 'E-mail',
                    sortable: true,
                    render: user => _esc(user.email),
                },
                {
                    key: 'role_id',
                    header: 'Papel',
                    width: '200px',
                    render: user => {
                        const canEdit = hasPermission('admin', 'admin-users', 'edit');
                        const options = AdminUsers._roles.map(r =>
                            `<option value="${r.id}"${r.id === user.role_id ? ' selected' : ''}>${_esc(r.name)}</option>`
                        ).join('');
                        return `<select class="admin-users-role-select"
                                    onchange="AdminUsers.changeRole(this, ${user.id})"
                                    ${canEdit ? '' : 'disabled'}>
                                    <option value="">— Sem papel —</option>
                                    ${options}
                                </select>`;
                    },
                },
                {
                    key: 'created_at',
                    header: 'Cadastro',
                    width: '120px',
                    sortable: true,
                    sortValue: user => user.created_at || '',
                    render: user => {
                        const date = user.created_at
                            ? new Date(user.created_at).toLocaleDateString('pt-BR')
                            : '—';
                        return `<span class="admin-users-date">${date}</span>`;
                    },
                },
            ],
        });

        this._table.mount(document.getElementById('adminUsersTableMount'));
    },
};
