/**
 * ── AdminUsers ──
 * Tela de gestão de usuários: lista e atribuição de papéis.
 */

// ── Estado ──────────────────────────────────────────────────────
const AdminUsers = {
    _users: [],
    _roles: [],

// ── Ciclo de Vida ────────────────────────────────────────────────
    render() {
        return `
        <div class="admin-users-container">
            <div class="admin-users-card">
                <div class="admin-users-table-container">
                    <table class="admin-users-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>E-mail</th>
                                <th>Papel</th>
                                <th>Cadastro</th>
                            </tr>
                        </thead>
                        <tbody id="adminUsersTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>`;
    },

    async load() {
        try {
            const [users, roles] = await Promise.all([
                apiCall(API + '/roles/users/list'),
                apiCall(API + '/roles')
            ]);
            this._users = users;
            this._roles = roles;
            this._renderTable();
        } catch (e) { alert(e.message); }
    },

// ── Ações Públicas ───────────────────────────────────────────────

    /**
     * Atualiza o papel de um usuário.
     * @param {HTMLSelectElement} select - O select que mudou
     * @param {number} userId - ID do usuário
     */
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
            await this.load(); // Reverter estado visual
        }
    },

// ── Renderização ─────────────────────────────────────────────────
    _renderTable() {
        const tbody = document.getElementById('adminUsersTableBody');
        if (!tbody) return;

        if (this._users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px">Nenhum usuário cadastrado.</td></tr>';
            return;
        }

        tbody.innerHTML = this._users.map(user => {
            const options = this._roles.map(r =>
                `<option value="${r.id}"${r.id === user.role_id ? ' selected' : ''}>${_esc(r.name)}</option>`
            ).join('');

            const date = user.created_at
                ? new Date(user.created_at).toLocaleDateString('pt-BR')
                : '—';

            return `<tr>
                <td><strong>${_esc(user.name)}</strong></td>
                <td>${_esc(user.email)}</td>
                <td>
                    <select class="admin-users-role-select"
                            onchange="AdminUsers.changeRole(this, ${user.id})"
                            ${hasPermission('admin', 'admin-users', 'edit') ? '' : 'disabled'}>
                        <option value="">— Sem papel —</option>
                        ${options}
                    </select>
                </td>
                <td><span class="admin-users-date">${date}</span></td>
            </tr>`;
        }).join('');
    }
};
