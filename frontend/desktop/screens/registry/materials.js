/**
 * ── materials.js ──
 * Tela de listagem de materiais.
 * Exibe tabela com todos os materiais e navega para a tela de detalhes.
 */
const Materials = {

    // ── Estado ──

    /** Material selecionado para edição (lido pelo MaterialsDetails) */
    selectedMaterial: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela. */
    render() {
        return `
        <div class="materials-container">
            <div class="materials-card">
                <div class="materials-table-container">
                    <table class="materials-table">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Nome</th>
                                <th>Unidade</th>
                                <th>Rastreio</th>
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

    /** Carrega a lista de materiais e configura o header. */
    async load() {
        this._setHeaderOptions();
        try {
            const materials = await apiCall(API + "/materials");
            this._renderTable(materials);
        } catch (error) {
            alert("Erro ao carregar materiais");
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    /** Abre tela de detalhes para criar novo material. */
    newMaterial() {
        this.selectedMaterial = null;
        showScreen('material-details');
    },

    /** Abre tela de detalhes para editar material existente. */
    selectMaterial(material) {
        this.selectedMaterial = material;
        showScreen('material-details');
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
            tr.innerHTML = `<td colspan="5" class="empty-state">Nenhum material cadastrado.</td>`;
            tbody.appendChild(tr);
            return;
        }

        materials.forEach(material => {
            const tr = this._createTableRow(material);
            tr.onclick = () => this.selectMaterial(material);
            tbody.appendChild(tr);
        });
    },

    /** Cria uma linha <tr> para exibição de um material. */
    _createTableRow(material) {
        const tr = document.createElement("tr");

        const swatch = material.color
            ? `<span class="materials-color-swatch" style="background:${material.color}"></span>`
            : `<span class="materials-color-swatch materials-color-swatch--none"></span>`;

        const trackingBadge = material.tracking_mode === 'lots'
            ? '<span class="materials-tracking-badge materials-tracking-badge--lots">Lotes</span>'
                + (material.allow_partial_exit ? '<span class="materials-tracking-badge materials-tracking-badge--partial">Parcial</span>' : '')
            : '<span class="materials-tracking-badge materials-tracking-badge--simple">Simples</span>';

        const uom = material.unit_of_measure || 'kg';

        tr.innerHTML = `
            <td class="materials-col-color">${swatch}</td>
            <td class="materials-col-name">${material.name}</td>
            <td class="materials-col-unit">${uom}</td>
            <td class="materials-col-tracking">${trackingBadge}</td>
            <td class="materials-col-actions">
                ${hasPermission('registry', 'materials', 'delete') ? `<button onclick="Materials.deleteMaterial(event, ${material.id})">
                    <span class="material-symbols-outlined">delete</span>
                </button>` : ''}
            </td>
        `;

        return tr;
    },

    /** Injeta botões de ação no header da página. */
    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        if (!headerOptions) return;
        headerOptions.innerHTML = hasPermission('registry', 'materials', 'create') ? `
            <button class="btn-primary" onclick="Materials.newMaterial()">Novo Material</button>
        ` : '';
    },
};
