/**
 * ── materials-details.js ──
 * Tela de detalhes de um material.
 * Permite criar/editar material, configurar rastreio e gerenciar embalagens.
 */
const MaterialsDetails = {

    // ── Estado ──

    _materialId: null,
    _isDirty: false,
    _packagings: [],
    _pendingPackagings: [],
    _removedPackagingIds: [],

    /** Instância do SearchSelect para seleção de grupo */
    _groupSelect: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela. */
    render() {
        this._groupSelect?.destroy(); this._groupSelect = null;
        return `
        <div class="md-container">
            <div class="md-page-header">
                <h1 class="md-page-title" id="mdPageTitle">Novo Material</h1>
            </div>

            <div class="md-top-row">

                <!-- Card: Informações -->
                <div class="md-card md-card-info">
                    <div class="md-card-header">
                        <h2>Informações</h2>
                    </div>
                    <div class="md-card-content">
                        <div class="md-form-group">
                            <label for="mdName">Nome <span class="md-required">*</span></label>
                            <input type="text" id="mdName" class="md-form-control" placeholder="Nome do material">
                        </div>
                        <div class="md-form-group">
                            <label>Grupo</label>
                            <div class="select-with-btn">
                                <div id="mdGroupContainer"></div>
                                <button class="btn-open-tab" onclick="openNewTab('groups')" title="Abrir cadastro de grupos em nova aba">
                                    <span class="material-symbols-outlined">open_in_new</span>
                                </button>
                            </div>
                        </div>
                        <div class="md-form-group">
                            <label for="mdColor">Cor</label>
                            <input type="color" id="mdColor" class="md-color-input" value="#3b5bdb">
                        </div>
                        <div class="md-form-group">
                            <label for="mdUnit">Unidade de Medida</label>
                            <select id="mdUnit" class="md-form-control">
                                <option value="kg">kg</option>
                                <option value="g">g</option>
                                <option value="uni">uni</option>
                                <option value="peça">peça</option>
                                <option value="pacote">pacote</option>
                                <option value="milheiro">milheiro</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Card: Rastreio -->
                <div class="md-card md-card-tracking">
                    <div class="md-card-header">
                        <h2>Rastreio</h2>
                    </div>
                    <div class="md-card-content">
                        <div class="md-form-group">
                            <label for="mdTrackingMode">Tipo</label>
                            <select id="mdTrackingMode" class="md-form-control" onchange="MaterialsDetails._onTrackingModeChange()">
                                <option value="simple">Simples</option>
                                <option value="lots">Lotes</option>
                            </select>
                        </div>
                        <div class="md-form-group" id="mdPartialGroup" style="display:none">
                            <label class="md-checkbox-label">
                                <input type="checkbox" id="mdAllowPartial"> Com saídas parciais
                            </label>
                        </div>
                    </div>
                </div>

            </div>

            <!-- Card: Embalagens -->
            <div class="md-card md-card-packagings">
                <div class="md-card-header">
                    <h2>Embalagens</h2>
                </div>
                <div class="md-card-content">
                    <div class="md-pkg-add-row">
                        <input type="text" id="mdPkgName" class="md-form-control" placeholder="Nome da embalagem">
                        <input type="number" id="mdPkgQty" class="md-form-control md-pkg-qty-input" placeholder="Quantidade" step="any" min="0">
                        <button class="md-btn-add" onclick="MaterialsDetails.addPackaging()">
                            <span class="material-symbols-outlined">add</span>
                            Adicionar
                        </button>
                    </div>
                    <div class="md-pkg-table-container">
                        <table class="md-pkg-table">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Quantidade</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="mdPkgBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>
        `;
    },

    /** Marca o formulário como modificado */
    _markDirty() { this._isDirty = true; },

    /** Permite ao router verificar se pode navegar para outra tela */
    async canLeave() {
        if (!this._isDirty) return true;
        return confirm('Você tem alterações não salvas. Deseja sair sem salvar?');
    },

    /** Inicializa a tela: carrega dados do material selecionado. */
    async load() {
        this._isDirty = false;
        this._materialId = null;
        this._packagings = [];
        this._pendingPackagings = [];
        this._removedPackagingIds = [];

        // Monta SearchSelect de grupo
        this._groupSelect = createSearchSelect({
            id: 'mdGroupSelect',
            placeholder: 'Sem grupo',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [{ key: 'group', items: [] }]
        });
        this._groupSelect.mount(document.getElementById('mdGroupContainer'));

        // Header: botão salvar
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) {
            const action = Materials.selectedMaterial ? 'edit' : 'create';
            headerOptions.innerHTML = hasPermission('registry', 'materials', action) ? `
                <button class="btn-primary" onclick="MaterialsDetails.save()">Salvar</button>
            ` : '';
        }

        // Carrega grupos para o select
        try {
            const groups = await apiCall(API + "/groups").catch(() => []);
            this._groupSelect.setItems('group', (groups || []).map(g => ({ value: g.id, label: g.name })));
        } catch { /* silencioso */ }

        // Se editando, carrega dados do material
        if (Materials.selectedMaterial) {
            this._materialId = Materials.selectedMaterial.id;
            try {
                const mat = await apiCall(API + `/materials/${this._materialId}`);
                document.getElementById("mdPageTitle").textContent = mat.name;
                document.getElementById("mdName").value = mat.name;
                document.getElementById("mdColor").value = mat.color || '#3b5bdb';
                document.getElementById("mdUnit").value = mat.unit_of_measure || 'kg';
                document.getElementById("mdTrackingMode").value = mat.tracking_mode || 'simple';
                document.getElementById("mdAllowPartial").checked = !!mat.allow_partial_exit;

                if (mat.group_id) this._groupSelect.select('group', mat.group_id);

                this._packagings = mat.packagings || [];
            } catch (e) {
                alert('Erro ao carregar material');
            }
        }

        this._onTrackingModeChange();
        this._renderPackagingsTable();

        // Trava campos se sem permissão
        const canEdit = hasPermission('registry', 'materials', Materials.selectedMaterial ? 'edit' : 'create');
        document.querySelectorAll('.md-container input, .md-container select')
            .forEach(el => { if (el.id !== 'mdPkgName' && el.id !== 'mdPkgQty') el.disabled = !canEdit; });
        const addRow = document.querySelector('.md-pkg-add-row');
        if (addRow) addRow.style.display = canEdit ? '' : 'none';

        // Marca dirty em qualquer mudança
        document.querySelectorAll('.md-container input, .md-container select')
            .forEach(el => el.addEventListener('change', () => this._markDirty()));
    },

    async onTabFocus() {
        // Refresh do select de grupos
        try {
            const groups = await apiCall(API + "/groups").catch(() => []);
            this._groupSelect?.setItems('group', (groups || []).map(g => ({ value: g.id, label: g.name })));
        } catch { /* silencioso */ }
    },

    // ── Ações Públicas ──

    /** Salva o material (criação ou edição) e sincroniza embalagens. */
    async save() {
        const name = document.getElementById("mdName").value.trim();
        if (!name) {
            alert("Digite o nome do material");
            return;
        }

        const groupSel = this._groupSelect?.getValue();
        const payload = {
            name,
            color: document.getElementById("mdColor").value || null,
            group_id: groupSel ? parseInt(groupSel.value) : null,
            unit_of_measure: document.getElementById("mdUnit").value || 'kg',
            tracking_mode: document.getElementById("mdTrackingMode").value || 'simple',
            allow_partial_exit: document.getElementById("mdAllowPartial").checked ? 1 : 0,
        };

        try {
            let materialId = this._materialId;

            if (materialId) {
                // Atualizar material
                await apiCall(API + `/materials/${materialId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            } else {
                // Criar material
                const result = await apiCall(API + "/materials", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                materialId = result.id;
            }

            // Sincronizar embalagens: remover
            for (const pkgId of this._removedPackagingIds) {
                await apiCall(API + `/materials/${materialId}/packagings/${pkgId}`, { method: "DELETE" });
            }

            // Sincronizar embalagens: adicionar pendentes
            for (const pkg of this._pendingPackagings) {
                await apiCall(API + `/materials/${materialId}/packagings`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: pkg.name, quantity: pkg.quantity })
                });
            }

            this._isDirty = false;
            showScreen('materials');
        } catch (error) {
            alert(error.message || "Erro ao salvar material");
        }
    },

    /** Adiciona uma embalagem à lista local (salva junto com o material). */
    addPackaging() {
        const nameEl = document.getElementById("mdPkgName");
        const qtyEl = document.getElementById("mdPkgQty");
        const name = nameEl.value.trim();
        if (!name) { alert("Digite o nome da embalagem"); return; }

        const quantity = parseFloat(qtyEl.value) || null;

        this._pendingPackagings.push({ name, quantity });
        this._markDirty();
        nameEl.value = '';
        qtyEl.value = '';
        this._renderPackagingsTable();
        nameEl.focus();
    },

    /** Remove uma embalagem existente (do banco) ou pendente. */
    removePackaging(type, index) {
        if (type === 'saved') {
            const pkg = this._packagings[index];
            if (pkg) this._removedPackagingIds.push(pkg.id);
            this._packagings.splice(index, 1);
        } else {
            this._pendingPackagings.splice(index, 1);
        }
        this._markDirty();
        this._renderPackagingsTable();
    },

    // ── Renderização ──

    /** Renderiza a tabela de embalagens (salvas + pendentes). */
    _renderPackagingsTable() {
        const tbody = document.getElementById("mdPkgBody");
        if (!tbody) return;
        tbody.innerHTML = "";

        const all = [
            ...this._packagings.map((p, i) => ({ ...p, _type: 'saved', _index: i })),
            ...this._pendingPackagings.map((p, i) => ({ ...p, _type: 'pending', _index: i })),
        ];

        if (all.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="3" class="md-empty-state">Nenhuma embalagem cadastrada.</td>`;
            tbody.appendChild(tr);
            return;
        }

        const canEdit = hasPermission('registry', 'materials', Materials.selectedMaterial ? 'edit' : 'create');

        for (const pkg of all) {
            const tr = document.createElement("tr");
            const qtyDisplay = pkg.quantity != null ? pkg.quantity : '—';
            const deleteBtn = canEdit
                ? `<button onclick="MaterialsDetails.removePackaging('${pkg._type}', ${pkg._index})"><span class="material-symbols-outlined">close</span></button>`
                : '';
            tr.innerHTML = `
                <td>${pkg.name}</td>
                <td class="md-pkg-col-qty">${qtyDisplay}</td>
                <td class="md-pkg-col-actions">${deleteBtn}</td>
            `;
            tbody.appendChild(tr);
        }
    },

    // ── Utilitários Privados ──

    /** Mostra/oculta o checkbox de saída parcial conforme o modo de rastreio. */
    _onTrackingModeChange() {
        const isLots = document.getElementById("mdTrackingMode")?.value === 'lots';
        const partialGroup = document.getElementById("mdPartialGroup");
        if (partialGroup) partialGroup.style.display = isLots ? '' : 'none';
        if (!isLots) {
            const el = document.getElementById("mdAllowPartial");
            if (el) el.checked = false;
        }
    },
};
