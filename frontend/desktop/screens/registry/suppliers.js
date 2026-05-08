/**
 * ── suppliers.js ──
 * Tela de cadastro de fornecedores.
 * Permite listar, adicionar, editar e deletar fornecedores.
 */
const Suppliers = {

    // ── Estado ──

    _dataTable: null,
    _dialog: null,
    _newBtn: null,
    _importBtn: null,
    _searchInput: null,
    _nameInput: null,
    _editingId: null,
    _allSuppliers: [],
    _importDialog: null,

    // ── Ciclo de Vida ──

    render() {
        this._dataTable?.destroy();   this._dataTable   = null;
        this._dialog?.destroy();      this._dialog      = null;
        this._newBtn?.destroy();      this._newBtn      = null;
        this._importBtn?.destroy();   this._importBtn   = null;
        this._searchInput?.destroy(); this._searchInput = null;
        this._importDialog?.destroy(); this._importDialog = null;
        this._nameInput  = null;
        this._editingId  = null;
        this._allSuppliers = [];
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
                onInput: () => this._applyFilter(),
            });
            document.getElementById('suppliersSearchContainer').appendChild(this._searchInput.el);
        }

        if (!this._dialog) this._dialog = this._createDialog();

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    { key: 'name', header: 'Nome', sortable: true, render: r => r.name },
                ],
                getRowKey: r => r.id,
                pageSize: 13,
                actions: [
                    {
                        label: 'Editar', icon: 'edit',
                        hidden: () => !hasPermission('registry', 'suppliers', 'edit'),
                        onClick: r => this.openDialog(r),
                    },
                    {
                        label: 'Excluir', icon: 'delete', variant: 'destructive',
                        hidden: () => !hasPermission('registry', 'suppliers', 'delete'),
                        onClick: r => this.deleteSupplier(r.id),
                    },
                ],
                emptyMessage: 'Nenhum fornecedor cadastrado.',
                emptyIcon: 'store',
            });
            this._dataTable.mount(document.getElementById('suppliersTableContainer'));
        }

        this._dataTable.setLoading(true);

        try {
            this._allSuppliers = await apiCall(API + '/suppliers') || [];
            this._applyFilter();
        } catch (error) {
            this._dataTable.setData([]);
            alert('Erro ao carregar fornecedores');
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    openDialog(supplier = null) {
        this._editingId = supplier?.id ?? null;
        this._dialog.setTitle(supplier ? 'Editar Fornecedor' : 'Novo Fornecedor');
        if (this._nameInput) this._nameInput.setValue(supplier?.name ?? '');
        this._dialog.open();
        setTimeout(() => this._nameInput?.input.focus(), 50);
    },

    async saveSupplier() {
        const action = this._editingId ? 'edit' : 'create';
        if (!hasPermission('registry', 'suppliers', action)) return;

        const name = this._nameInput?.getValue().trim();

        if (!name) {
            alert('Digite o nome do fornecedor');
            return;
        }

        try {
            if (this._editingId) {
                await apiCall(API + `/suppliers/${this._editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }),
                });
            } else {
                const locationId = this._getActiveLocationId();
                if (!window.AppUser?.isAdmin && !locationId) {
                    alert('Selecione uma localização na barra lateral antes de cadastrar.');
                    return;
                }
                try {
                    await apiCall(API + '/suppliers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, location_id: locationId }),
                    });
                } catch (error) {
                    if (error.status === 409 && error.data?.conflict) {
                        this._dialog.close();
                        this._handleConflict(error.data.existing, locationId);
                        return;
                    }
                    throw error;
                }
            }
            this._dialog.close();
            this.load();
        } catch (error) {
            alert(error.message || 'Erro ao salvar fornecedor');
        }
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
            this._allSuppliers = await apiCall(API + '/suppliers') || [];
            this._applyFilter();
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

    _handleConflict(existing, locationId) {
        const dlg = createDialog({
            title: 'Fornecedor já existe',
            subtitle: 'Um fornecedor com esse nome já existe no catálogo global. Deseja vinculá-lo à sua localização?',
            bodyHTML: `
                <div class="suppliers-conflict-info">
                    <p><strong>${existing.name}</strong></p>
                </div>
            `,
            actions: [
                {
                    label: 'Vincular à minha localização',
                    variant: 'primary',
                    onClick: async () => {
                        try {
                            await apiCall(API + `/suppliers/${existing.id}/link`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ location_id: locationId }),
                            });
                            dlg.close();
                            dlg.destroy();
                            Suppliers.load();
                        } catch (e) {
                            alert(e.message || 'Erro ao vincular fornecedor');
                        }
                    },
                },
                {
                    label: 'Cancelar',
                    variant: 'cancel',
                    onClick: () => { dlg.close(); dlg.destroy(); },
                },
            ],
        });
        dlg.open();
    },

    // ── Privado ──

    _applyFilter() {
        const q = this._searchInput?.getValue().toLowerCase() ?? '';
        const filtered = q
            ? this._allSuppliers.filter(r => r.name.toLowerCase().includes(q))
            : this._allSuppliers;
        this._dataTable?.setData(filtered);
    },

    _createDialog() {
        const dlg = createDialog({
            title: '',
            closeOnBackdrop: true,
            bodyHTML: `
                <div class="dialog-field">
                    <label>Nome <span class="required">*</span></label>
                    <div id="supplierNameMount"></div>
                </div>
            `,
            actions: [
                { label: 'Salvar', variant: 'primary', icon: 'save', onClick: () => Suppliers.saveSupplier() },
                { label: 'Cancelar', variant: 'cancel', onClick: () => dlg.close() },
            ],
        });

        this._nameInput = createInput({ id: 'supplierName', placeholder: 'Nome do fornecedor' });
        document.getElementById('supplierNameMount').appendChild(this._nameInput.el);

        return dlg;
    },

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
            onClick: () => this.openDialog(),
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
