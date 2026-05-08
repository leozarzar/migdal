/**
 * ── locations.js ──
 * Tela de cadastro de localizações (armazéns/posições).
 * Permite listar, adicionar, editar e deletar localizações.
 */
const Locations = {

    // ── Estado ──

    _dataTable: null,
    _dialog: null,
    _newBtn: null,
    _searchInput: null,
    _editingId: null,
    _nameInput: null,
    _descInput: null,
    _allLocations: [],

    // ── Ciclo de Vida ──

    render() {
        this._dataTable?.destroy();  this._dataTable  = null;
        this._dialog?.destroy();     this._dialog     = null;
        this._newBtn?.destroy();     this._newBtn     = null;
        this._searchInput?.destroy(); this._searchInput = null;
        this._nameInput  = null;
        this._descInput  = null;
        this._editingId  = null;
        this._allLocations = [];
        return `<div class="locations-container">
            <div class="locations-filters">
                <div class="locations-filters-icon-wrap">
                    <span class="material-symbols-outlined locations-filters-icon">filter_list</span>
                </div>
                <div id="locationsSearchContainer"></div>
                <div id="locationsNewBtnContainer" class="locations-filters-actions"></div>
            </div>
            <div id="locationsTableContainer"></div>
        </div>`;
    },

    async load() {
        this._mountNewButton();

        if (!this._searchInput) {
            this._searchInput = createInput({
                placeholder: 'Buscar',
                icon: 'Search',
                onInput: () => this._applyFilter(),
            });
            document.getElementById('locationsSearchContainer').appendChild(this._searchInput.el);
        }

        if (!this._dialog) this._dialog = this._createDialog();

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    { key: 'name', header: 'Nome', sortable: true, render: r => `<strong>${_esc(r.name)}</strong>` },
                    { key: 'description', header: 'Descrição', render: r => _esc(r.description || '—') },
                ],
                getRowKey: r => r.id,
                actions: [
                    {
                        label: 'Editar', icon: 'edit',
                        hidden: () => !hasPermission('registry', 'locations', 'edit'),
                        onClick: r => this.openDialog(r),
                    },
                    {
                        label: 'Excluir', icon: 'delete', variant: 'destructive',
                        hidden: () => !hasPermission('registry', 'locations', 'delete'),
                        onClick: r => this.deleteLocation(r.id),
                    },
                ],
                emptyMessage: 'Nenhuma localização cadastrada.',
                emptyIcon: 'location_on',
            });
            this._dataTable.mount(document.getElementById('locationsTableContainer'));
        }

        this._dataTable.setLoading(true);

        try {
            this._allLocations = await apiCall(API + '/locations');
            this._applyFilter();
        } catch (error) {
            this._dataTable.setData([]);
            alert('Erro ao carregar localizações');
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    openDialog(location = null) {
        this._editingId = location?.id ?? null;
        this._dialog.setTitle(location ? 'Editar Localização' : 'Nova Localização');
        if (this._nameInput) this._nameInput.setValue(location?.name ?? '');
        if (this._descInput) this._descInput.setValue(location?.description ?? '');
        this._dialog.open();
        setTimeout(() => this._nameInput?.input.focus(), 50);
    },

    async saveLocation() {
        const name = this._nameInput?.getValue().trim();
        const description = this._descInput?.getValue().trim();

        if (!name) {
            alert('Digite o nome da localização');
            return;
        }

        try {
            if (this._editingId) {
                await apiCall(API + `/locations/${this._editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description }),
                });
            } else {
                await apiCall(API + '/locations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description }),
                });
            }
            this._dialog.close();
            this.load();
        } catch (error) {
            alert(error.message || 'Erro ao salvar localização');
        }
    },

    async deleteLocation(id) {
        if (!confirm('Tem certeza que deseja deletar esta localização?')) return;
        try {
            await apiCall(API + `/locations/${id}`, { method: 'DELETE' });
            this.load();
        } catch (error) {
            alert(error.message || 'Erro ao deletar localização');
        }
    },

    // ── Privado ──

    _applyFilter() {
        const q = this._searchInput?.getValue().toLowerCase() ?? '';
        const filtered = q
            ? this._allLocations.filter(r =>
                r.name.toLowerCase().includes(q) ||
                (r.description || '').toLowerCase().includes(q))
            : this._allLocations;
        this._dataTable?.setData(filtered);
    },

    _createDialog() {
        const dlg = createDialog({
            title: '',
            closeOnBackdrop: true,
            bodyHTML: `
                <div class="dialog-field">
                    <label>Nome <span class="required">*</span></label>
                    <div id="locationNameMount"></div>
                </div>
                <div class="dialog-field">
                    <label>Descrição</label>
                    <div id="locationDescMount"></div>
                </div>
            `,
            actions: [
                { label: 'Salvar', variant: 'primary', icon: 'save', onClick: () => Locations.saveLocation() },
                { label: 'Cancelar', variant: 'cancel', onClick: () => dlg.close() },
            ],
        });

        this._nameInput = createInput({ id: 'locationName', placeholder: 'Nome da localização' });
        this._descInput = createTextarea({ id: 'locationDescription', placeholder: 'Descrição (opcional)', rows: 3 });

        document.getElementById('locationNameMount').appendChild(this._nameInput.el);
        document.getElementById('locationDescMount').appendChild(this._descInput.el);

        return dlg;
    },

    _mountNewButton() {
        const headerOptions = document.getElementById('headerOptionsContent');
        if (headerOptions) headerOptions.innerHTML = '';
        if (!hasPermission('registry', 'locations', 'create')) return;
        this._newBtn = createButton({
            label: 'Nova Localização',
            variant: 'primary',
            icon: 'add',
            onClick: () => this.openDialog(),
        });
        document.getElementById('locationsNewBtnContainer').appendChild(this._newBtn.el);
    },
};
