/**
 * ── AdminRoles ──
 * Tela de listagem de papéis (roles) do sistema.
 * Permite visualizar, criar e excluir papéis.
 */

// ── Estado ──────────────────────────────────────────────────────
const AdminRoles = {
    _roles: [],
    selectedRoleId: null,

// ── Ciclo de Vida ────────────────────────────────────────────────
    render() {
        return `
        <div class="admin-roles-container">
            <div class="admin-roles-card">
                <div class="admin-roles-table-container">
                    <table class="admin-roles-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Descrição</th>
                                <th>Tipo</th>
                                <th>Usuários</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="adminRolesTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
    },

    async load() {
        const headerOptions = document.getElementById('headerOptionsContent');
        if (headerOptions) {
            headerOptions.innerHTML = hasPermission('admin', 'admin-roles', 'create') ? `
                <button class="btn-new" onclick="AdminRoles.createRole()">
                    <span class="material-symbols-outlined">add</span>
                    Novo Papel
                </button>` : '';
        }

        try {
            this._roles = await apiCall(API + '/roles');
            this._renderTable();
        } catch (e) { alert(e.message); }
    },

// ── Ações Públicas ───────────────────────────────────────────────

    /**
     * Navega direto para a tela de detalhes em modo criação.
     */
    createRole() {
        this.selectedRoleId = null;
        showScreen('admin-roles-details');
    },

    /**
     * Navega para detalhes do papel para edição de permissões.
     */
    editRole(event, id) {
        this.selectedRoleId = id;
        showScreen('admin-roles-details');
    },

    /**
     * Exclui um papel.
     */
    async deleteRole(event, id) {
        if (!confirm('Confirma exclusão deste papel?')) return;
        try {
            await apiCall(API + '/roles/' + id, { method: 'DELETE' });
            await this.load();
        } catch (e) { alert(e.message); }
    },

// ── Renderização ─────────────────────────────────────────────────
    _renderTable() {
        const tbody = document.getElementById('adminRolesTableBody');
        if (!tbody) return;

        if (this._roles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">Nenhum papel cadastrado.</td></tr>';
            return;
        }

        tbody.innerHTML = this._roles.map(role => {
            const badge = role.is_admin
                ? '<span class="admin-roles-badge admin-roles-badge--admin">Administrador</span>'
                : '<span class="admin-roles-badge admin-roles-badge--custom">Personalizado</span>';

            const actions = role.is_admin
                ? '<span style="color:#94a3b8;font-size:12px">—</span>'
                : `<div class="admin-roles-actions">
                        ${hasPermission('admin', 'admin-roles', 'edit') ? `<button onclick="AdminRoles.editRole(event, ${role.id})" title="Editar permissões">
                            <span class="material-symbols-outlined">edit</span>
                        </button>` : ''}
                        ${hasPermission('admin', 'admin-roles', 'delete') ? `<button class="btn-danger" onclick="AdminRoles.deleteRole(event, ${role.id})" title="Excluir">
                            <span class="material-symbols-outlined">delete</span>
                        </button>` : ''}
                   </div>`;

            return `<tr>
                <td><strong>${_esc(role.name)}</strong></td>
                <td>${_esc(role.description || '—')}</td>
                <td>${badge}</td>
                <td>${role.user_count || 0}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');
    }
};
