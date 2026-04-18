/**
 * ── AdminUsers ──
 * Tela de gestão de usuários: lista e atribuição de papéis.
 */

// ── Estado ──────────────────────────────────────────────────────
const AdminUsers = {
    _users: [],
    _roles: [],
    _locations: [],
    _userLocations: {},  // { userId: [locationId, ...] }

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
                                <th>Localizações</th>
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
            const [users, roles, locations] = await Promise.all([
                apiCall(API + '/roles/users/list'),
                apiCall(API + '/roles'),
                apiCall(API + '/locations')
            ]);
            this._users = users;
            this._roles = roles;
            this._locations = locations || [];

            // Carregar localizações de cada usuário em paralelo
            const locPromises = this._users.map(u =>
                apiCall(API + '/locations/users/' + u.id + '/locations')
                    .then(locs => ({ userId: u.id, locs: (locs || []).map(l => l.id) }))
                    .catch(() => ({ userId: u.id, locs: [] }))
            );
            const locResults = await Promise.all(locPromises);
            this._userLocations = {};
            for (const r of locResults) {
                this._userLocations[r.userId] = r.locs;
            }

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
            await this.load();
        }
    },

    /**
     * Alterna uma localização para um usuário (toggle checkbox).
     * @param {HTMLInputElement} checkbox - O checkbox que mudou
     * @param {number} userId - ID do usuário
     * @param {number} locationId - ID da localização
     */
    async toggleUserLocation(checkbox, userId, locationId) {
        const current = this._userLocations[userId] || [];
        let updated;
        if (checkbox.checked) {
            updated = [...current, locationId];
        } else {
            updated = current.filter(id => id !== locationId);
        }
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

// ── Renderização ─────────────────────────────────────────────────
    _renderTable() {
        const tbody = document.getElementById('adminUsersTableBody');
        if (!tbody) return;

        if (this._users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">Nenhum usuário cadastrado.</td></tr>';
            return;
        }

        const canEdit = hasPermission('admin', 'admin-users', 'edit');

        tbody.innerHTML = this._users.map(user => {
            const options = this._roles.map(r =>
                `<option value="${r.id}"${r.id === user.role_id ? ' selected' : ''}>${_esc(r.name)}</option>`
            ).join('');

            const userLocs = this._userLocations[user.id] || [];
            const locCheckboxes = this._locations.length > 0
                ? this._locations.map(loc => {
                    const checked = userLocs.includes(loc.id) ? 'checked' : '';
                    return `<label class="admin-users-loc-label">
                        <input type="checkbox" ${checked} ${canEdit ? `onchange="AdminUsers.toggleUserLocation(this, ${user.id}, ${loc.id})"` : 'disabled'}>
                        <span>${_esc(loc.name)}</span>
                    </label>`;
                }).join('')
                : '<span class="admin-users-no-locs">Sem localizações</span>';

            const date = user.created_at
                ? new Date(user.created_at).toLocaleDateString('pt-BR')
                : '—';

            return `<tr>
                <td><strong>${_esc(user.name)}</strong></td>
                <td>${_esc(user.email)}</td>
                <td>
                    <select class="admin-users-role-select"
                            onchange="AdminUsers.changeRole(this, ${user.id})"
                            ${canEdit ? '' : 'disabled'}>
                        <option value="">— Sem papel —</option>
                        ${options}
                    </select>
                </td>
                <td class="admin-users-loc-cell">${locCheckboxes}</td>
                <td><span class="admin-users-date">${date}</span></td>
            </tr>`;
        }).join('');
    }
};
