/**
 * ── operators.js ──
 * Tela de cadastro de operadores.
 * Permite listar, adicionar, editar e deletar operadores.
 */
const Operators = {

    // ── Estado ──

    _dataTable: null,
    _dialog: null,
    _newBtn: null,
    _searchInput: null,
    _nameInput: null,
    _editingId: null,
    _allOperators: [],

    // ── Ciclo de Vida ──

    render() {
        this._dataTable?.destroy();   this._dataTable   = null;
        this._dialog?.destroy();      this._dialog      = null;
        this._newBtn?.destroy();      this._newBtn      = null;
        this._searchInput?.destroy(); this._searchInput = null;
        this._nameInput   = null;
        this._editingId   = null;
        this._allOperators = [];
        return `
        <div class="operators-container">
            <div class="operators-filters">
                <div class="operators-filters-icon-wrap">
                    <span class="material-symbols-outlined operators-filters-icon">filter_list</span>
                </div>
                <div id="operatorsSearchContainer"></div>
                <div id="operatorsNewBtnContainer" class="operators-filters-actions"></div>
            </div>
            <div id="operatorsTableContainer"></div>
        </div>
        `;
    },

    async load() {
        this._mountNewButton();

        if (!this._searchInput) {
            this._searchInput = createInput({
                placeholder: 'Buscar',
                icon: 'Search',
                onInput: () => this._applyFilter(),
            });
            document.getElementById('operatorsSearchContainer').appendChild(this._searchInput.el);
        }

        if (!this._dialog) this._dialog = this._createDialog();

        if (!this._dataTable) {
            this._dataTable = createDataTable({
                columns: [
                    { key: 'name', header: 'Nome', sortable: true, render: r => r.name },
                ],
                getRowKey: r => r.id,
                actions: [
                    {
                        label: 'Editar', icon: 'edit',
                        hidden: () => !hasPermission('registry', 'operators', 'edit'),
                        onClick: r => this.openDialog(r),
                    },
                    {
                        label: 'Excluir', icon: 'delete', variant: 'destructive',
                        hidden: () => !hasPermission('registry', 'operators', 'delete'),
                        onClick: r => this.deleteOperator(r.id),
                    },
                ],
                emptyMessage: 'Nenhum operador cadastrado.',
                emptyIcon: 'badge',
            });
            this._dataTable.mount(document.getElementById('operatorsTableContainer'));
        }

        this._dataTable.setLoading(true);

        try {
            this._allOperators = await apiCall(API + '/operators') || [];
            this._applyFilter();
        } catch (error) {
            this._dataTable.setData([]);
            alert('Erro ao carregar operadores');
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    openDialog(operator = null) {
        this._editingId = operator?.id ?? null;
        this._dialog.setTitle(operator ? 'Editar Operador' : 'Novo Operador');
        if (this._nameInput) this._nameInput.setValue(operator?.name ?? '');
        this._dialog.open();
        setTimeout(() => this._nameInput?.input.focus(), 50);
    },

    async saveOperator() {
        const name = this._nameInput?.getValue().trim();

        if (!name) {
            alert('Digite o nome do operador');
            return;
        }

        try {
            if (this._editingId) {
                await apiCall(API + `/operators/${this._editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }),
                });
            } else {
                await apiCall(API + '/operators', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }),
                });
            }
            this._dialog.close();
            this.load();
        } catch (error) {
            alert(error.message || 'Erro ao salvar operador');
        }
    },

    async deleteOperator(id) {
        if (!confirm('Tem certeza que deseja deletar este operador?')) return;
        try {
            await apiCall(API + `/operators/${id}`, { method: 'DELETE' });
            this.load();
        } catch (error) {
            alert(error.message || 'Erro ao deletar operador');
        }
    },

    // ── Privado ──

    _applyFilter() {
        const q = this._searchInput?.getValue().toLowerCase() ?? '';
        const filtered = q
            ? this._allOperators.filter(r => r.name.toLowerCase().includes(q))
            : this._allOperators;
        this._dataTable?.setData(filtered);
    },

    _createDialog() {
        const dlg = createDialog({
            title: '',
            closeOnBackdrop: true,
            bodyHTML: `
                <div class="dialog-field">
                    <label>Nome <span class="required">*</span></label>
                    <div id="operatorNameMount"></div>
                </div>
            `,
            actions: [
                { label: 'Salvar', variant: 'primary', icon: 'save', onClick: () => Operators.saveOperator() },
                { label: 'Cancelar', variant: 'cancel', onClick: () => dlg.close() },
            ],
        });

        this._nameInput = createInput({ id: 'operatorName', placeholder: 'Nome do operador' });
        document.getElementById('operatorNameMount').appendChild(this._nameInput.el);

        return dlg;
    },

    _mountNewButton() {
        const headerOptions = document.getElementById('headerOptionsContent');
        if (headerOptions) headerOptions.innerHTML = '';
        if (!hasPermission('registry', 'operators', 'create')) return;
        this._newBtn = createButton({
            label: 'Novo Operador',
            variant: 'primary',
            icon: 'add',
            onClick: () => this.openDialog(),
        });
        document.getElementById('operatorsNewBtnContainer').appendChild(this._newBtn.el);
    },
};
