/**
 * ── materials.js ──
 * Tela de cadastro de materiais.
 * Permite listar, adicionar, editar e deletar materiais com cor e grupo.
 */
const Materials = {

    // ── Estado ──

    selectedMaterial: null,

    /** Instância do SearchSelect para seleção de grupo */
    _groupSelect: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela. */
    render() {
        this._groupSelect?.destroy(); this._groupSelect = null;
        return `
        <div class="materials-container">
            <div class="materials-card">
                <div class="materials-form-wrapper">
                    <div class="materials-field-group">
                        <label class="materials-field-label" for="materialName">Nome</label>
                        <input id="materialName" class="materials-input" placeholder="Nome do material">
                    </div>
                    <div class="materials-field-group">
                        <label class="materials-field-label" for="materialColor">Cor</label>
                        <input type="color" id="materialColor" class="materials-color-input" value="#3b5bdb">
                    </div>
                    <div class="materials-field-group">
                        <label class="materials-field-label">Grupo</label>
                        <div class="select-with-btn materials-group-field">
                            <div id="materialGroupContainer"></div>
                            <button class="btn-open-tab" onclick="openNewTab('groups')" title="Abrir cadastro de grupos em nova aba">
                                <span class="material-symbols-outlined">open_in_new</span>
                            </button>
                        </div>
                    </div>
                    <button class="materials-btn-save" id="materialSaveBtn" onclick="Materials.saveMaterial()"><span class="material-symbols-outlined">playlist_add</span>Adicionar</button>
                    <button class="materials-btn-cancel" id="materialsCancelBtn" style="display:none" onclick="Materials.cancelEdit()">Cancelar</button>
                </div>
                <div class="materials-table-container">
                    <table class="materials-table">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Nome</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="materialsTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    },

    /** Inicializa a tela: reseta formulário, configura header e carrega dados. */
    async load() {
        this._groupSelect = createSearchSelect({
            id: 'materialGroup',
            placeholder: 'Sem grupo',
            searchable: true,
            searchPlaceholder: 'Buscar...',
            sections: [{ key: 'group', items: [] }]
        });
        this._groupSelect.mount(document.getElementById('materialGroupContainer'));

        this._resetForm();
        this._setHeaderOptions();

        try {
            const [materials, groups] = await Promise.all([
                apiCall(API + "/materials"),
                apiCall(API + "/groups").catch(() => [])
            ]);
            this._populateGroupsSelect(groups || []);
            this._renderTable(materials);
        } catch (error) {
            alert("Erro ao carregar materiais");
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    /** Salva um novo material ou atualiza o selecionado. */
    async saveMaterial() {
        const name = document.getElementById("materialName").value.trim();
        const color = document.getElementById("materialColor")?.value || null;
        const groupSel = this._groupSelect?.getValue();
        const group_id = groupSel ? parseInt(groupSel.value) : null;

        if (!name) {
            alert("Digite o nome do material");
            return;
        }

        try {
            if (this.selectedMaterial) {
                // Editar
                await apiCall(API + `/materials/${this.selectedMaterial}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, color, group_id })
                });
                alert("Material atualizado com sucesso");
            } else {
                // Criar
                await apiCall(API + "/materials", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, color, group_id })
                });
                alert("Material criado com sucesso");
            }
            this.load();
        } catch (error) {
            alert(error.message || "Erro ao salvar material");
        }
    },

    /** Limpa a seleção e foca no campo de nome para novo cadastro. */
    newMaterial() {
        clearFormInputs(["materialName"]);
        clearTableSelection();
        this.selectedMaterial = null;
        document.getElementById("materialName").focus();
    },

    /** Seleciona um material e preenche o formulário para edição. */
    selectMaterial(material, tr) {
        clearTableSelection();
        tr.classList.add("selected");
        document.getElementById("materialName").value = material.name;
        const colorInput = document.getElementById("materialColor");
        if (colorInput) colorInput.value = material.color || "#3b5bdb";
        if (material.group_id) this._groupSelect?.select('group', material.group_id);
        else this._groupSelect?.clear();
        this.selectedMaterial = material.id;
        const cancelBtn = document.getElementById("materialsCancelBtn");
        if (cancelBtn) cancelBtn.style.display = "";
        const saveBtn = document.getElementById("materialSaveBtn");
        if (saveBtn) saveBtn.innerHTML = 'Salvar';
    },

    /** Cancela a edição e reseta o formulário. */
    cancelEdit() {
        this._resetForm();
    },

    /** Deleta um material após confirmação do usuário. */
    async deleteMaterial(event, id) {
        event.stopPropagation();
        
        if (!confirm("Tem certeza que deseja deletar?")) return;

        try {
            await apiCall(API + `/materials/${id}`, { method: "DELETE" });
            this.load();
        } catch (error) {
            alert("Erro ao deletar material");
        }
    },

    // ── Renderização ──

    /** Renderiza a tabela de materiais ou mensagem de estado vazio. */
    _renderTable(materials) {
        const tbody = document.getElementById("materialsTableBody");
        tbody.innerHTML = "";

        if (!materials || materials.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="2" class="empty-state">Nenhum material cadastrado.</td>`;
            tbody.appendChild(tr);
            return;
        }

        materials.forEach(material => {
            const tr = this._createTableRow(material);
            tr.onclick = () => this.selectMaterial(material, tr);
            tbody.appendChild(tr);
        });
    },

    /** Cria uma linha <tr> para exibição de um material. */
    _createTableRow(material) {
        const tr = document.createElement("tr");

        const swatch = material.color
            ? `<span class="materials-color-swatch" style="background:${material.color}"></span>`
            : `<span class="materials-color-swatch materials-color-swatch--none"></span>`;

        tr.innerHTML = `
            <td class="materials-col-color">${swatch}</td>
            <td class="materials-col-name">${material.name}</td>
            <td class="materials-col-actions">
                <button onclick="Materials.deleteMaterial(event, ${material.id})">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        `;

        return tr;
    },

    /** Injeta botões de ação no header da página. */
    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        if (!headerOptions) return;
        headerOptions.innerHTML = "";
    },

    // ── Utilitários Privados ──

    /** Reseta o formulário para o estado inicial (novo registro). */
    _resetForm() {
        clearFormInputs(["materialName"]);
        const colorInput = document.getElementById("materialColor");
        if (colorInput) colorInput.value = "#3b5bdb";
        this._groupSelect?.clear();
        clearTableSelection();
        this.selectedMaterial = null;
        const cancelBtn = document.getElementById("materialsCancelBtn");
        if (cancelBtn) cancelBtn.style.display = "none";
        const saveBtn = document.getElementById("materialSaveBtn");
        if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined">playlist_add</span>Adicionar';
    },

    /** Popula o SearchSelect de grupos com as opções disponíveis. */
    _populateGroupsSelect(groups) {
        if (!this._groupSelect) return;
        this._groupSelect.setItems('group', groups.map(g => ({ value: g.id, label: g.name })));
    },
};
