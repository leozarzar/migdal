/**
 * ── AdminRolesDetails ──
 * Tela de edição de um papel (role) e suas permissões.
 * Exibe árvore de checkboxes: Módulo → Tela → Ações.
 */

const PERM_ACTION_LABELS = {
    view:   'Visualizar',
    create: 'Criar',
    edit:   'Editar',
    delete: 'Excluir'
};

const ALL_ACTIONS = ['view', 'create', 'edit', 'delete'];

// ── Estado ──────────────────────────────────────────────────────
const AdminRolesDetails = {
    _role: null,
    _permissions: {},   // { "moduleId::screenId": Set<action> }
    _isDirty: false,

// ── Ciclo de Vida ────────────────────────────────────────────────
    render() {
        return `
        <div class="admin-roles-details-container">
            <div class="admin-roles-details-card">
                <div class="admin-roles-details-form">
                    <div class="admin-roles-details-field admin-roles-details-field--name">
                        <label for="adminRolesDetailsName">Nome *</label>
                        <input type="text" id="adminRolesDetailsName" placeholder="Ex: Almoxarife" oninput="AdminRolesDetails._markDirty()">
                    </div>
                    <div class="admin-roles-details-field admin-roles-details-field--desc">
                        <label for="adminRolesDetailsDesc">Descrição</label>
                        <textarea id="adminRolesDetailsDesc" placeholder="Descreva as responsabilidades deste papel..." rows="3" oninput="AdminRolesDetails._markDirty()"></textarea>
                    </div>
                </div>

                <div class="admin-perm-tree">
                    <div class="admin-perm-tree-header">Permissões</div>
                    <div id="adminPermTreeBody"></div>
                </div>

                <div class="admin-roles-details-actions">
                    ${hasPermission('admin', 'admin-roles', AdminRoles.selectedRoleId ? 'edit' : 'create') ? `<button class="btn-save" onclick="AdminRolesDetails.save()">Salvar</button>` : ''}
                    <button class="btn-cancel" onclick="showScreen('admin-roles')">Cancelar</button>
                </div>
            </div>
        </div>`;
    },

    async load() {
        const roleId = AdminRoles.selectedRoleId;

        // Modo criação: role ainda não existe
        if (!roleId) {
            this._role = null;
            this._permissions = {};
            this._isDirty = false;
            this._renderPermTree();
            setTimeout(() => document.getElementById('adminRolesDetailsName')?.focus(), 50);
            return;
        }

        try {
            this._role = await apiCall(API + '/roles/' + roleId);
        } catch (e) { alert(e.message); showScreen('admin-roles'); return; }

        document.getElementById('adminRolesDetailsName').value  = this._role.name || '';
        document.getElementById('adminRolesDetailsDesc').value = this._role.description || '';

        // Converter permissões em mapa
        this._permissions = {};
        for (const perm of (this._role.permissions || [])) {
            const key = perm.module + '::' + perm.screen;
            this._permissions[key] = new Set(perm.actions || []);
        }

        this._renderPermTree();
        this._isDirty = false;
    },

    async canLeave() {
        if (!this._isDirty) return true;
        return confirm('Existem alterações não salvas. Deseja sair?');
    },

// ── Ações Públicas ───────────────────────────────────────────────

    async save() {
        const name = document.getElementById('adminRolesDetailsName').value.trim();
        if (!name) { alert('Nome é obrigatório.'); return; }
        const description = document.getElementById('adminRolesDetailsDesc').value.trim();

        const permissions = [];
        for (const [key, actions] of Object.entries(this._permissions)) {
            if (actions.size === 0) continue;
            const [mod, screen] = key.split('::');
            permissions.push({ module: mod, screen, actions: [...actions] });
        }

        try {
            let roleId;

            if (!this._role) {
                // Modo criação: POST + permissões
                const result = await apiCall(API + '/roles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description })
                });
                roleId = result.id;
            } else {
                // Modo edição: PUT nome/descrição
                roleId = this._role.id;
                await apiCall(API + '/roles/' + roleId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description })
                });
            }

            // Salvar permissões (criação ou edição)
            await apiCall(API + '/roles/' + roleId + '/permissions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ permissions })
            });

            this._isDirty = false;
            showScreen('admin-roles');
        } catch (e) { alert(e.message); }
    },

    /**
     * Alterna todas as permissões de um módulo.
     */
    toggleModule(moduleId) {
        const mod = MODULE_REGISTRY[moduleId];
        if (!mod) return;

        const screens = Object.entries(mod.screens).filter(([, s]) => !s.hidden);
        const allChecked = screens.every(([screenId, s]) => {
            const key = moduleId + '::' + screenId;
            const screenActions = s.actions || ALL_ACTIONS;
            return this._permissions[key] && this._permissions[key].size === screenActions.length;
        });

        for (const [screenId, s] of screens) {
            const key = moduleId + '::' + screenId;
            const screenActions = s.actions || ALL_ACTIONS;
            if (allChecked) {
                delete this._permissions[key];
            } else {
                this._permissions[key] = new Set(screenActions);
            }
        }

        this._renderPermTree();
        this._markDirty();
    },

    /**
     * Alterna todas as ações de uma tela.
     */
    toggleScreen(moduleId, screenId) {
        const key = moduleId + '::' + screenId;
        const mod = MODULE_REGISTRY[moduleId];
        const screenDef = mod && mod.screens[screenId];
        const screenActions = (screenDef && screenDef.actions) || ALL_ACTIONS;
        const current = this._permissions[key];
        const allChecked = current && current.size === screenActions.length;

        if (allChecked) {
            delete this._permissions[key];
        } else {
            this._permissions[key] = new Set(screenActions);
        }

        this._renderPermTree();
        this._markDirty();
    },

    /**
     * Alterna uma ação individual.
     */
    toggleAction(moduleId, screenId, action) {
        const key = moduleId + '::' + screenId;
        if (!this._permissions[key]) this._permissions[key] = new Set();

        if (this._permissions[key].has(action)) {
            this._permissions[key].delete(action);
            if (this._permissions[key].size === 0) delete this._permissions[key];
        } else {
            this._permissions[key].add(action);
        }

        this._renderPermTree();
        this._markDirty();
    },

// ── Renderização ─────────────────────────────────────────────────
    _markDirty() {
        this._isDirty = true;
    },

    _renderPermTree() {
        const body = document.getElementById('adminPermTreeBody');
        if (!body) return;

        const sorted = Object.entries(MODULE_REGISTRY)
            .filter(([id]) => id !== 'admin')   // Módulo admin não é configurável — admin tem acesso total
            .sort(([, a], [, b]) => a.order - b.order);

        let html = '';
        for (const [moduleId, mod] of sorted) {
            const screens = Object.entries(mod.screens).filter(([, s]) => !s.hidden);

            // Estado do checkbox do módulo
            const allModuleChecked = screens.every(([screenId, s]) => {
                const key = moduleId + '::' + screenId;
                const screenActions = s.actions || ALL_ACTIONS;
                return this._permissions[key] && this._permissions[key].size === screenActions.length;
            });
            const someModuleChecked = screens.some(([screenId]) => {
                const key = moduleId + '::' + screenId;
                return this._permissions[key] && this._permissions[key].size > 0;
            });

            const moduleChecked = allModuleChecked ? 'checked' : '';
            const moduleIndeterminate = !allModuleChecked && someModuleChecked ? 'data-indeterminate="true"' : '';

            html += `<div class="admin-perm-module">`;
            html += `<div class="admin-perm-module-header" onclick="AdminRolesDetails.toggleModule('${moduleId}')">
                        <input type="checkbox" ${moduleChecked} ${moduleIndeterminate} onclick="event.stopPropagation(); AdminRolesDetails.toggleModule('${moduleId}')">
                        <span class="material-symbols-outlined">${mod.icon}</span>
                        <span class="admin-perm-module-name">${mod.name}</span>
                     </div>`;
            html += `<div class="admin-perm-screens">`;

            for (const [screenId, screen] of screens) {
                const key = moduleId + '::' + screenId;
                const screenActions = screen.actions || ALL_ACTIONS;
                const perms = this._permissions[key] || new Set();
                const allScreenChecked = perms.size === screenActions.length;
                const someScreenChecked = perms.size > 0;

                const screenChecked = allScreenChecked ? 'checked' : '';
                const screenIndeterminate = !allScreenChecked && someScreenChecked ? 'data-indeterminate="true"' : '';

                html += `<div class="admin-perm-screen">
                    <div class="admin-perm-screen-header">
                        <input type="checkbox" ${screenChecked} ${screenIndeterminate}
                               onclick="event.stopPropagation(); AdminRolesDetails.toggleScreen('${moduleId}', '${screenId}')">
                        <span class="admin-perm-screen-name">${screen.title}</span>
                    </div>
                    <div class="admin-perm-actions">`;

                for (const action of screenActions) {
                    const label = PERM_ACTION_LABELS[action] || action;
                    const checked = perms.has(action) ? 'checked' : '';
                    html += `<label class="admin-perm-action-label">
                        <input type="checkbox" ${checked}
                               onclick="event.stopPropagation(); AdminRolesDetails.toggleAction('${moduleId}', '${screenId}', '${action}')">
                        ${label}
                    </label>`;
                }

                html += `</div></div>`;
            }

            html += `</div></div>`;
        }

        body.innerHTML = html;

        // Aplicar indeterminate state via JS (não existe atributo HTML nativo)
        body.querySelectorAll('[data-indeterminate="true"]').forEach(cb => {
            cb.indeterminate = true;
        });
    }
};
