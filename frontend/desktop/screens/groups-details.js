/**
 * ── groups-details.js ──
 * Tela de detalhes de um grupo de materiais.
 * Permite criar/editar grupo e gerenciar materiais associados.
 */
const GroupsDetails = {

    // ── Estado ──

    groupId: null,
    associatedMaterials: [],
    allMaterials: [],
    _isDirty: false,

    /** Instância do SearchSelect para seleção de material */
    _materialSelect: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela. */
    render() {
        this._materialSelect?.destroy(); this._materialSelect = null;
        return `
        <div class="gd-container">
            <div class="gd-page-header">
                <h1 class="gd-page-title" id="gdPageTitle">Novo Grupo</h1>
            </div>

            <div class="gd-top-row">

                <!-- Card: Informações -->
                <div class="gd-card gd-card-info">
                    <div class="gd-card-header">
                        <h2>Informações</h2>
                    </div>
                    <div class="gd-card-content">
                        <div class="gd-form-group">
                            <label for="gdName">Nome do Grupo <span class="gd-required">*</span></label>
                            <input type="text" id="gdName" class="gd-form-control" placeholder="Nome do grupo">
                        </div>
                    </div>
                </div>

                <!-- Card: Materiais Associados -->
                <div class="gd-card gd-card-materials">
                    <div class="gd-card-header">
                        <h2>Materiais Associados</h2>
                    </div>
                    <div class="gd-card-content">
                        <div class="gd-add-row">
                            <div class="select-with-btn" style="flex:1">
                                <div id="gdMaterialSelectContainer"></div>
                                <button class="btn-open-tab" onclick="openNewTab('materials')" title="Abrir cadastro de materiais em nova aba">
                                    <span class="material-symbols-outlined">open_in_new</span>
                                </button>
                            </div>
                            <button class="gd-btn-add" onclick="GroupsDetails.addMaterial()">
                                <span class="material-symbols-outlined">playlist_add</span>
                                Adicionar
                            </button>
                        </div>
                        <div class="gd-materials-table-container">
                            <table class="gd-materials-table">
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th>Material</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody id="gdMaterialsBody"></tbody>
                            </table>
                        </div>
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

    /** Inicializa a tela: carrega materiais e popula dados do grupo selecionado. */
    async load() {
        this._isDirty = false;
        this._materialSelect = createSearchSelect({
            id: 'gdMaterialSelect',
            placeholder: 'Selecionar material...',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [{ key: 'material', items: [] }]
        });
        this._materialSelect.mount(document.getElementById('gdMaterialSelectContainer'));

        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) {
            headerOptions.innerHTML = `
                <button class="btn-primary" onclick="GroupsDetails.save()">Salvar</button>
            `;
        }

        this.groupId = null;
        this.associatedMaterials = [];
        this.allMaterials = [];

        try {
            this.allMaterials = await apiCall(API + "/materials") || [];
        } catch (e) {
            this.allMaterials = [];
        }

        if (Groups.selectedGroup) {
            this.groupId = Groups.selectedGroup.id;
            document.getElementById("gdPageTitle").textContent = Groups.selectedGroup.name;
            document.getElementById("gdName").value = Groups.selectedGroup.name;

            try {
                const data = await apiCall(API + `/groups/${this.groupId}`);
                this.associatedMaterials = data.materials || [];
            } catch (e) {
                this.associatedMaterials = [];
            }
        }

        this._renderMaterialsSelect();
        this._renderMaterialsTable();

        // Marca o form como sujo em qualquer alteração de campo
        document.querySelectorAll('#content input, #content select, #content textarea')
            .forEach(el => el.addEventListener('change', () => this._markDirty()));
    },

    async _refreshSelects() {
        if (!this._materialSelect) return;
        try {
            this.allMaterials = await apiCall(API + "/materials") || [];
            this._renderMaterialsSelect();
        } catch (e) { /* falha silenciosa em background */ }
    },

    async onTabFocus() { await this._refreshSelects(); },

    // ── Ações Públicas ──

    /** Salva o grupo (criação ou edição) e seus materiais associados. */
    async save() {
        const name = document.getElementById("gdName").value.trim();

        if (!name) {
            alert("Digite o nome do grupo");
            return;
        }

        const materialIds = this.associatedMaterials.map(m => m.id);

        try {
            if (this.groupId) {
                await apiCall(API + `/groups/${this.groupId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name })
                });
                await apiCall(API + `/groups/${this.groupId}/materials`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ material_ids: materialIds })
                });
                alert("Grupo atualizado com sucesso");
            } else {
                const result = await apiCall(API + "/groups", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name })
                });
                this.groupId = result.id;
                if (materialIds.length > 0) {
                    await apiCall(API + `/groups/${this.groupId}/materials`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ material_ids: materialIds })
                    });
                }
                alert("Grupo criado com sucesso");
            }
            this._isDirty = false;
            showScreen('groups');
        } catch (error) {
            alert(error.message || "Erro ao salvar grupo");
        }
    },

    /** Adiciona um material à lista de associados. */
    addMaterial() {
        const sel = this._materialSelect?.getValue();
        if (!sel) return;
        const id = parseInt(sel.value);
        if (!id) return;

        const material = this.allMaterials.find(m => m.id === id);
        if (!material) return;

        this.associatedMaterials.push(material);
        this._renderMaterialsSelect();
        this._renderMaterialsTable();
        this._materialSelect.clear();
    },

    /** Remove um material da lista de associados. */
    removeMaterial(id) {
        this.associatedMaterials = this.associatedMaterials.filter(m => m.id !== id);
        this._renderMaterialsSelect();
        this._renderMaterialsTable();
    },

    // ── Renderização ──

    /** Popula o SearchSelect com materiais disponíveis (não associados). */
    _renderMaterialsSelect() {
        if (!this._materialSelect) return;

        const associatedIds = new Set(this.associatedMaterials.map(m => m.id));
        const available = this.allMaterials.filter(m => !associatedIds.has(m.id));

        this._materialSelect.setItems('material', available.map(m => ({ value: m.id, label: m.name })));
    },

    /** Renderiza a tabela de materiais associados ao grupo. */
    _renderMaterialsTable() {
        const tbody = document.getElementById("gdMaterialsBody");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (this.associatedMaterials.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="3" class="gd-empty-state">Nenhum material associado.</td>`;
            tbody.appendChild(tr);
            return;
        }

        this.associatedMaterials.forEach(m => {
            const tr = document.createElement("tr");
            const swatch = m.color
                ? `<span class="gd-color-swatch" style="background:${m.color}"></span>`
                : `<span class="gd-color-swatch gd-color-swatch--none"></span>`;
            tr.innerHTML = `
                <td class="gd-col-color">${swatch}</td>
                <td>${m.name}</td>
                <td class="gd-col-actions">
                    <button onclick="GroupsDetails.removeMaterial(${m.id})">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
};
