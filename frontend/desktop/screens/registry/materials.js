/**
 * ── materials.js ──
 * Tela de listagem de materiais.
 * Exibe tabela com todos os materiais e navega para a tela de detalhes.
 */
const Materials = {

    // ── Estado ──

    selectedMaterial: null,
    _importDialog: null,
    _dataTable: null,
    _newBtn: null,
    _importBtn: null,
    _allMaterials: [],
    _searchQuery: '',

    // ── Ciclo de Vida ──

    render() {
        this._importDialog?.destroy(); this._importDialog = null;
        this._dataTable?.destroy();    this._dataTable = null;
        this._newBtn?.destroy();       this._newBtn = null;
        this._importBtn?.destroy();    this._importBtn = null;
        this._allMaterials = [];
        this._searchQuery = '';
        return `
        <div class="materials-container">
            <div class="materials-filters">
                <div class="materials-filters-icon-wrap">
                    <span class="material-symbols-outlined materials-filters-icon">filter_list</span>
                </div>
                <input type="text" id="materialsSearch" class="materials-search-input" placeholder="Buscar" oninput="Materials._onSearch(this.value)">
                <div id="materialsActionsContainer" class="materials-filters-actions"></div>
            </div>
            <div id="materialsTableContainer"></div>
        </div>
        `;
    },

    async load() {
        this._mountButtons();

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    {
                        key: 'color', header: '', width: '32px',
                        render: r => r.color
                            ? `<span class="materials-color-swatch" style="background:${r.color}"></span>`
                            : `<span class="materials-color-swatch materials-color-swatch--none"></span>`,
                    },
                    { key: 'name', header: 'Nome', sortable: true, render: r => r.name },
                    { key: 'unit_of_measure', header: 'Unidade', width: '80px', render: r => r.unit_of_measure || 'kg' },
                    {
                        key: 'tracking_mode', header: 'Rastreio', width: '140px',
                        render: r => r.tracking_mode === 'lots'
                            ? '<span class="materials-tracking-badge materials-tracking-badge--lots">Lotes</span>'
                                + (r.allow_partial_exit ? '<span class="materials-tracking-badge materials-tracking-badge--partial">Parcial</span>' : '')
                            : '<span class="materials-tracking-badge materials-tracking-badge--simple">Simples</span>',
                    },
                ],
                getRowKey: r => r.id,
                onRowClick: r => this.selectMaterial(r),
                actions: [
                    {
                        label: 'Excluir', icon: 'delete', variant: 'destructive',
                        hidden: () => !hasPermission('registry', 'materials', 'delete'),
                        onClick: r => this.deleteMaterial(r.id),
                    },
                ],
                emptyMessage: 'Nenhum material cadastrado.',
                emptyIcon: 'category',
            });
            this._dataTable.mount(document.getElementById('materialsTableContainer'));
        }

        this._dataTable.setLoading(true);

        try {
            const materials = await apiCall(API + '/materials');
            this._allMaterials = materials || [];
            this._applyFilter();
        } catch {
            alert('Erro ao carregar materiais');
            this._dataTable.setLoading(false);
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    newMaterial() {
        this.selectedMaterial = null;
        showScreen('material-details');
    },

    selectMaterial(material) {
        this.selectedMaterial = material;
        showScreen('material-details');
    },

    async deleteMaterial(id) {
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

    // ── Privado ──

    _onSearch(val) {
        this._searchQuery = val;
        this._applyFilter();
    },

    _applyFilter() {
        const q = this._searchQuery.toLowerCase();
        const filtered = q ? this._allMaterials.filter(r => r.name.toLowerCase().includes(q)) : this._allMaterials;
        this._dataTable?.setData(filtered);
    },

    _mountButtons() {
        document.getElementById('headerOptionsContent').innerHTML = '';
        const container = document.getElementById('materialsActionsContainer');
        if (!container) return;
        container.innerHTML = '';

        if (!hasPermission('registry', 'materials', 'create')) return;

        this._importBtn?.destroy();
        this._importBtn = createButton({
            label: 'Importar do catálogo',
            variant: 'secondary',
            onClick: () => this.importFromCatalog(),
        });
        container.appendChild(this._importBtn.el);

        this._newBtn?.destroy();
        this._newBtn = createButton({
            label: 'Novo Material',
            variant: 'primary',
            icon: 'add',
            onClick: () => this.newMaterial(),
        });
        container.appendChild(this._newBtn.el);
    },

    // ── Importação do Catálogo Global ──

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
                    <table class="materials-import-table">
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

    async _linkMaterial(materialId) {
        const locationId = Materials._getActiveLocationId();
        try {
            await apiCall(API + `/materials/${materialId}/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location_id: locationId })
            });
            const row = document.querySelector(`.materials-import-row[data-material-id="${materialId}"]`);
            if (row) row.remove();
            const materials = await apiCall(API + '/materials');
            this._dataTable?.setData(materials || []);
        } catch (e) {
            alert(e.message || 'Erro ao vincular material');
        }
    },

    _filterImportList() {
        const search = (document.getElementById('materialsImportSearch')?.value || '').toLowerCase();
        const rows = document.querySelectorAll('.materials-import-row');
        for (const row of rows) {
            const name = row.querySelector('.materials-import-name')?.textContent?.toLowerCase() || '';
            row.style.display = name.includes(search) ? '' : 'none';
        }
    },

    _getActiveLocationId() {
        const filterId = AppState.getLocationFilter();
        if (filterId) return Number(filterId);
        const userLocs = (window.AppUser || {}).locationIds || [];
        if (userLocs.length === 1) return userLocs[0];
        return null;
    },
};
