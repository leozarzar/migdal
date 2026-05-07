/**
 * ── materials.js ──
 * Tela de listagem de materiais.
 * Exibe tabela com todos os materiais e navega para a tela de detalhes.
 */
const Materials = {

    // ── Estado ──

    /** Material selecionado para edição (lido pelo MaterialsDetails) */
    selectedMaterial: null,

    /** Dialog de importação do catálogo global */
    _importDialog: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela. */
    render() {
        this._importDialog?.destroy(); this._importDialog = null;
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

    /** Desvincula o material da localização ativa (ou exclui do catálogo se admin sem localização). */
    async deleteMaterial(event, id) {
        event.stopPropagation();
        const locationId = this._getActiveLocationId();
        const msg = locationId
            ? 'Desvincular este material da localização atual?\n\nAtenção: saldos em estoque permanecerão visíveis até que o item seja zerado.'
            : 'Excluir este material do catálogo global? Esta ação não pode ser desfeita.';
        if (!confirm(msg)) return;

        try {
            if (locationId) {
                await apiCall(API + `/materials/${id}/link`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ location_id: locationId })
                });
            } else {
                await apiCall(API + `/materials/${id}`, { method: 'DELETE' });
            }
            this.load();
        } catch (error) {
            alert(error.message || 'Erro ao remover material');
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
        const canCreate = hasPermission('registry', 'materials', 'create');
        headerOptions.innerHTML = canCreate ? `
            <button class="btn-secondary" onclick="Materials.importFromCatalog()">Importar do catálogo</button>
            <button class="btn-primary" onclick="Materials.newMaterial()">Novo Material</button>
        ` : '';
    },

    // ── Importação do Catálogo Global ──

    /** Abre dialog para importar materiais do catálogo global. */
    async importFromCatalog() {
        const locationId = Materials._getActiveLocationId();
        if (!window.AppUser?.isAdmin && !locationId) {
            alert('Selecione uma localização na barra lateral antes de importar.');
            return;
        }

        let globalMaterials;
        try {
            globalMaterials = await apiCall(API + '/materials/global');
        } catch (e) {
            alert('Erro ao carregar catálogo global');
            return;
        }

        if (!globalMaterials || globalMaterials.length === 0) {
            alert('Não há materiais disponíveis para importação.');
            return;
        }

        const listHTML = globalMaterials.map(m => {
            const groupLabel = m.group_name ? `<span class="materials-import-group">${_esc(m.group_name)}</span>` : '';
            const colorDot = m.color
                ? `<span class="materials-color-swatch" style="background:${_esc(m.color)}"></span>`
                : `<span class="materials-color-swatch materials-color-swatch--none"></span>`;
            const uom = m.unit_of_measure || 'kg';
            return `
                <tr class="materials-import-row" data-material-id="${m.id}">
                    <td>${colorDot}</td>
                    <td class="materials-import-name">${_esc(m.name)}</td>
                    <td>${_esc(uom)}</td>
                    <td>${groupLabel}</td>
                    <td>
                        <button class="btn-primary btn-sm" onclick="Materials._linkMaterial(${m.id})">Vincular</button>
                    </td>
                </tr>
            `;
        }).join('');

        this._importDialog?.destroy();
        this._importDialog = createDialog({
            title: 'Importar do Catálogo Global',
            subtitle: 'Selecione materiais para vincular à sua localização.',
            wide: true,
            bodyHTML: `
                <div class="materials-import-search">
                    <input type="text" id="materialsImportSearch" class="md-form-control" placeholder="Filtrar materiais..." oninput="Materials._filterImportList()">
                </div>
                <div class="materials-import-table-container">
                    <table class="materials-table">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Nome</th>
                                <th>Unidade</th>
                                <th>Grupo</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="materialsImportBody">${listHTML}</tbody>
                    </table>
                </div>
            `,
        });
        this._importDialog.open();
    },

    /** Vincula um material do catálogo global à localização ativa. */
    async _linkMaterial(materialId) {
        const locationId = Materials._getActiveLocationId();
        try {
            await apiCall(API + `/materials/${materialId}/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location_id: locationId })
            });
            // Remove a linha do dialog
            const row = document.querySelector(`.materials-import-row[data-material-id="${materialId}"]`);
            if (row) row.remove();
            // Recarrega a lista principal
            const materials = await apiCall(API + '/materials');
            this._renderTable(materials);
        } catch (e) {
            alert(e.message || 'Erro ao vincular material');
        }
    },

    /** Filtra a lista de importação pelo campo de busca. */
    _filterImportList() {
        const search = (document.getElementById('materialsImportSearch')?.value || '').toLowerCase();
        const rows = document.querySelectorAll('.materials-import-row');
        for (const row of rows) {
            const name = row.querySelector('.materials-import-name')?.textContent?.toLowerCase() || '';
            row.style.display = name.includes(search) ? '' : 'none';
        }
    },

    /** Retorna o location_id ativo (do filtro da sidebar ou localização única do usuário). */
    _getActiveLocationId() {
        const filterId = AppState.getLocationFilter();
        if (filterId) return Number(filterId);
        const userLocs = (window.AppUser || {}).locationIds || [];
        if (userLocs.length === 1) return userLocs[0];
        return null;
    },
};
