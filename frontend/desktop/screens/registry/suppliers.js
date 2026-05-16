/**
 * ── suppliers.js ──
 * Tela de cadastro de fornecedores.
 * Lista, importa e remove fornecedores. A criação/edição
 * detalhada ocorre na tela SupplierForm.
 */
const Suppliers = {

    // ── Estado ──

    _dataTable: null,
    _newBtn: null,
    _importBtn: null,
    _searchInput: null,
    _importDialog: null,
    selectedSupplier: null,

    // ── Ciclo de Vida ──

    render() {
        this._dataTable?.destroy();    this._dataTable    = null;
        this._newBtn?.destroy();       this._newBtn       = null;
        this._importBtn?.destroy();    this._importBtn    = null;
        this._searchInput?.destroy();  this._searchInput  = null;
        this._importDialog?.destroy(); this._importDialog = null;
        return `
        <div class="suppliers-container">
            <div class="suppliers-filters">
                <div class="suppliers-filters-icon-wrap">
                    <span class="material-symbols-outlined suppliers-filters-icon">filter_list</span>
                </div>
                <div id="suppliersSearchContainer"></div>
                <div id="suppliersNewBtnContainer" class="suppliers-filters-actions"></div>
            </div>
            <div id="suppliersTableContainer"></div>
        </div>
        `;
    },

    async load() {
        this._mountButtons();

        if (!this._searchInput) {
            this._searchInput = createInput({
                placeholder: 'Buscar',
                icon: 'Search',
                onInput: () => { clearTimeout(this._searchTimer); this._searchTimer = setTimeout(() => this._fetchPage(1), 1000); },
            });
            document.getElementById('suppliersSearchContainer').appendChild(this._searchInput.el);
        }

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    { key: 'name',          header: 'Nome',            sortable: true, render: r => r.name },
                    { key: 'business_name', header: 'Nome Empresarial',sortable: true, render: r => r.business_name || '' },
                    { key: 'tax_id',        header: 'CNPJ/CPF',                       render: r => r.tax_id || '' },
                    { key: 'city',          header: 'Cidade',           sortable: true, render: r => [r.city, r.state].filter(Boolean).join(' / ') },
                    { key: 'phone',         header: 'Telefone',                        render: r => r.phone || '' },
                ],
                getRowKey: r => r.id,
                pageSize: 13,
                onPageChange: (page, pageSize, sortKey, sortDir) => this._fetchPage(page, sortKey, sortDir),
                actions: [
                    {
                        label: 'Editar', icon: 'edit',
                        hidden: () => !hasPermission('registry', 'suppliers', 'edit'),
                        onClick: r => this.openEdit(r),
                    },
                    {
                        label: 'Excluir', icon: 'delete', variant: 'destructive',
                        hidden: () => !hasPermission('registry', 'suppliers', 'delete'),
                        onClick: r => this.deleteSupplier(r.id),
                    },
                ],
                onRowClick: r => {
                    if (hasPermission('registry', 'suppliers', 'edit')) this.openEdit(r);
                },
                emptyMessage: 'Nenhum fornecedor cadastrado.',
                emptyIcon: 'store',
            });
            this._dataTable.mount(document.getElementById('suppliersTableContainer'));
        }

        await this._fetchPage(1);
    },

    async onTabFocus() { return this.load(); },

    // ── Busca e Paginação ──

    async _fetchPage(page = 1, sortKey = '', sortDir = null) {
        const params = new URLSearchParams({ page, limit: 13 });
        const q = this._searchInput?.getValue() ?? '';
        if (q) params.set('search', q);
        if (sortKey) { params.set('sort_by', sortKey); params.set('sort_dir', sortDir || 'asc'); }

        this._dataTable.setLoading(true);
        try {
            const { data, total } = await apiCall(API + '/suppliers?' + params);
            this._dataTable.setData(data || [], total || 0, page);
        } catch (error) {
            this._dataTable.setData([], 0);
            alert('Erro ao carregar fornecedores');
        }
    },

    // ── Ações Públicas ──

    openNew() {
        this.selectedSupplier = null;
        showScreen('supplier-form');
    },

    openEdit(supplier) {
        this.selectedSupplier = supplier;
        showScreen('supplier-form');
    },

    async deleteSupplier(id) {
        const locationId = this._getActiveLocationId();
        const msg = locationId
            ? 'Desvincular este fornecedor da localização atual?\n\nAtenção: saldos em estoque associados permanecerão visíveis até que o item seja zerado.'
            : 'Excluir este fornecedor do catálogo global? Esta ação não pode ser desfeita.';
        if (!confirm(msg)) return;

        try {
            if (locationId) {
                await apiCall(API + `/suppliers/${id}/link`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ location_id: locationId }),
                });
            } else {
                await apiCall(API + `/suppliers/${id}`, { method: 'DELETE' });
            }
            this.load();
        } catch (error) {
            alert(error.message || 'Erro ao remover fornecedor');
        }
    },

    // ── Importação do Catálogo Global ──

    async importFromCatalog() {
        const locationId = this._getActiveLocationId();
        if (!window.AppUser?.isAdmin && !locationId) {
            alert('Selecione uma localização na barra lateral antes de importar.');
            return;
        }

        let globalSuppliers;
        try {
            globalSuppliers = await apiCall(API + '/suppliers/global');
        } catch (e) {
            alert('Erro ao carregar catálogo global');
            return;
        }

        if (!globalSuppliers || globalSuppliers.length === 0) {
            alert('Não há fornecedores disponíveis para importação.');
            return;
        }

        const listHTML = globalSuppliers.map(s => `
            <tr class="suppliers-import-row" data-supplier-id="${s.id}">
                <td class="suppliers-import-name">${s.name}</td>
                <td class="suppliers-import-action">
                    <button class="btn-primary btn-sm" onclick="Suppliers._linkSupplier(${s.id})">Vincular</button>
                </td>
            </tr>
        `).join('');

        this._importDialog?.destroy();
        this._importDialog = createDialog({
            title: 'Importar do Catálogo Global',
            subtitle: 'Selecione fornecedores para vincular à sua localização.',
            wide: true,
            bodyHTML: `
                <div class="suppliers-import-search">
                    <div id="suppliersImportSearchMount"></div>
                </div>
                <div class="suppliers-import-table-wrap">
                    <table class="suppliers-import-tbl">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="suppliersImportBody">${listHTML}</tbody>
                    </table>
                </div>
            `,
        });
        this._importDialog.open();

        const importSearch = createInput({
            id: 'suppliersImportSearch',
            placeholder: 'Filtrar fornecedores...',
            icon: 'Search',
            onInput: () => Suppliers._filterImportList(),
        });
        document.getElementById('suppliersImportSearchMount').appendChild(importSearch.el);
    },

    async _linkSupplier(supplierId) {
        const locationId = this._getActiveLocationId();
        try {
            await apiCall(API + `/suppliers/${supplierId}/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location_id: locationId }),
            });
            const row = document.querySelector(`.suppliers-import-row[data-supplier-id="${supplierId}"]`);
            if (row) row.remove();
            await this._fetchPage(1);
        } catch (e) {
            alert(e.message || 'Erro ao vincular fornecedor');
        }
    },

    _filterImportList() {
        const search = (document.getElementById('suppliersImportSearch')?.value || '').toLowerCase();
        const rows = document.querySelectorAll('.suppliers-import-row');
        for (const row of rows) {
            const name = row.querySelector('.suppliers-import-name')?.textContent?.toLowerCase() || '';
            row.style.display = name.includes(search) ? '' : 'none';
        }
    },

    // ── Privado ──

    _mountButtons() {
        const headerOptions = document.getElementById('headerOptionsContent');
        if (headerOptions) headerOptions.innerHTML = '';

        const container = document.getElementById('suppliersNewBtnContainer');
        if (!container) return;
        container.innerHTML = '';

        if (!hasPermission('registry', 'suppliers', 'create')) return;

        this._importBtn = createButton({
            label: 'Importar do catálogo',
            variant: 'secondary',
            icon: 'download',
            onClick: () => this.importFromCatalog(),
        });
        container.appendChild(this._importBtn.el);

        this._newBtn = createButton({
            label: 'Novo Fornecedor',
            variant: 'primary',
            icon: 'add',
            onClick: () => this.openNew(),
        });
        container.appendChild(this._newBtn.el);
    },

    _getActiveLocationId() {
        const filterId = AppState.getLocationFilter();
        if (filterId) return Number(filterId);
        const userLocs = (window.AppUser || {}).locationIds || [];
        if (userLocs.length === 1) return userLocs[0];
        return null;
    },
};
