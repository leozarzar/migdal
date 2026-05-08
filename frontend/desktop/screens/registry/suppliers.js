/**
 * ── suppliers.js ──
 * Tela de cadastro de fornecedores.
 * Permite listar, adicionar, editar e deletar fornecedores.
 */
const Suppliers = {

    // ── Estado ──

    selectedSupplier: null,

    /** Dialog de importação do catálogo global */
    _importDialog: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela. */
    render() {
        this._importDialog?.destroy(); this._importDialog = null;
        return `
        <div class="suppliers-container">
                <div class="suppliers-form-wrapper">
                    <input id="supplierName" class="suppliers-input" placeholder="Nome do fornecedor">
                    <button class="suppliers-btn-save" id="supplierSaveBtn" onclick="Suppliers.saveSupplier()"><span class="material-symbols-outlined">playlist_add</span>Adicionar</button>
                    <button class="suppliers-btn-cancel" id="suppliersCancelBtn" style="display:none" onclick="Suppliers.cancelEdit()">Cancelar</button>
                </div>
                <div class="suppliers-table-container">
                    <table class="suppliers-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="suppliersTableBody"></tbody>
                    </table>
                </div>
        </div>
        `;
    },

    /** Inicializa a tela: reseta formulário e carrega fornecedores. */
    async load() {
        this._resetForm();
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) {
            headerOptions.innerHTML = hasPermission('registry', 'suppliers', 'create') ? `
                <button class="btn-secondary" onclick="Suppliers.importFromCatalog()">Importar do catálogo</button>
            ` : '';
        }

        const formWrapper = document.querySelector('.suppliers-form-wrapper');
        if (formWrapper) formWrapper.style.display = hasPermission('registry', 'suppliers', 'create') ? '' : 'none';

        try {
            const suppliers = await apiCall(API + "/suppliers");
            this._renderTable(suppliers);
        } catch (error) {
            alert("Erro ao carregar fornecedores");
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    /** Salva um novo fornecedor ou atualiza o selecionado. */
    async saveSupplier() {
        const action = this.selectedSupplier ? 'edit' : 'create';
        if (!hasPermission('registry', 'suppliers', action)) return;

        const name = document.getElementById("supplierName").value.trim();

        if (!name) {
            alert("Digite o nome do fornecedor");
            return;
        }

        try {
            if (this.selectedSupplier) {
                // Editar
                await apiCall(API + `/suppliers/${this.selectedSupplier}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name })
                });
                alert("Fornecedor atualizado com sucesso");
            } else {
                // Criar — inclui location_id
                const locationId = Suppliers._getActiveLocationId();
                if (!window.AppUser?.isAdmin && !locationId) {
                    alert('Selecione uma localização na barra lateral antes de cadastrar.');
                    return;
                }

                try {
                    await apiCall(API + "/suppliers", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name, location_id: locationId })
                    });
                    alert("Fornecedor criado com sucesso");
                } catch (error) {
                    if (error.status === 409 && error.data?.conflict) {
                        this._handleConflict(error.data.existing, locationId);
                        return;
                    }
                    throw error;
                }
            }
            this.load();
        } catch (error) {
            alert(error.message || "Erro ao salvar fornecedor");
        }
    },

    /** Limpa a seleção e foca no campo de nome para novo cadastro. */
    newSupplier() {
        clearFormInputs(["supplierName"]);
        clearTableSelection();
        this.selectedSupplier = null;
        document.getElementById("supplierName").focus();
    },

    /** Seleciona um fornecedor e preenche o formulário para edição. */
    selectSupplier(supplier, tr) {
        clearTableSelection();
        tr.classList.add("selected");
        document.getElementById("supplierName").value = supplier.name;
        this.selectedSupplier = supplier.id;
        const cancelBtn = document.getElementById("suppliersCancelBtn");
        if (cancelBtn) cancelBtn.style.display = "";
        const saveBtn = document.getElementById("supplierSaveBtn");
        if (saveBtn) saveBtn.innerHTML = 'Salvar';
    },

    /** Cancela a edição e reseta o formulário. */
    cancelEdit() {
        this._resetForm();
    },

    /** Desvincula o fornecedor da localização ativa (ou exclui do catálogo se admin sem localização). */
    async deleteSupplier(event, id) {
        event.stopPropagation();
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
                    body: JSON.stringify({ location_id: locationId })
                });
            } else {
                await apiCall(API + `/suppliers/${id}`, { method: 'DELETE' });
            }
            this.load();
        } catch (error) {
            alert(error.message || 'Erro ao remover fornecedor');
        }
    },

    // ── Renderização ──

    /** Renderiza a tabela de fornecedores ou mensagem de estado vazio. */
    _renderTable(suppliers) {
        const tbody = document.getElementById("suppliersTableBody");
        tbody.innerHTML = "";

        if (!suppliers || suppliers.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="2" class="empty-state">Nenhum fornecedor cadastrado.</td>`;
            tbody.appendChild(tr);
            return;
        }

        const canEdit = hasPermission('registry', 'suppliers', 'edit');
        suppliers.forEach(supplier => {
            const tr = this._createTableRow(supplier);
            if (canEdit) {
                tr.onclick = () => this.selectSupplier(supplier, tr);
            } else {
                tr.style.cursor = 'default';
            }
            tbody.appendChild(tr);
        });
    },

    /** Cria uma linha <tr> para exibição de um fornecedor. */
    _createTableRow(supplier) {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td class="suppliers-col-name">${supplier.name}</td>
            <td class="suppliers-col-actions">
                ${hasPermission('registry', 'suppliers', 'delete') ? `<button onclick="Suppliers.deleteSupplier(event, ${supplier.id})">
                    <span class="material-symbols-outlined">delete</span>
                </button>` : ''}
            </td>
        `;

        return tr;
    },

    // ── Utilitários Privados ──

    /** Reseta o formulário para o estado inicial (novo registro). */
    _resetForm() {
        clearFormInputs(["supplierName"]);
        clearTableSelection();
        this.selectedSupplier = null;
        const cancelBtn = document.getElementById("suppliersCancelBtn");
        if (cancelBtn) cancelBtn.style.display = "none";
        const saveBtn = document.getElementById("supplierSaveBtn");
        if (saveBtn) saveBtn.innerHTML = '<span class="material-symbols-outlined">playlist_add</span>Adicionar';
    },

    // ── Importação do Catálogo Global ──

    /** Abre dialog para importar fornecedores do catálogo global. */
    async importFromCatalog() {
        const locationId = Suppliers._getActiveLocationId();
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
                <td class="suppliers-import-name">${_esc(s.name)}</td>
                <td>
                    <button class="btn-primary btn-sm" onclick="Suppliers._linkSupplier(${s.id})">Vincular</button>
                </td>
            </tr>
        `).join('');

        this._importDialog?.destroy();
        this._importDialog = createDialog({
            title: 'Importar do Catálogo Global',
            subtitle: 'Selecione fornecedores para vincular à sua localização.',
            bodyHTML: `
                <div class="suppliers-import-search">
                    <input type="text" id="suppliersImportSearch" class="md-form-control" placeholder="Filtrar fornecedores..." oninput="Suppliers._filterImportList()">
                </div>
                <div class="suppliers-import-table-container">
                    <table class="suppliers-table">
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
    },

    /** Vincula um fornecedor do catálogo global à localização ativa. */
    async _linkSupplier(supplierId) {
        const locationId = Suppliers._getActiveLocationId();
        try {
            await apiCall(API + `/suppliers/${supplierId}/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location_id: locationId })
            });
            const row = document.querySelector(`.suppliers-import-row[data-supplier-id="${supplierId}"]`);
            if (row) row.remove();
            const suppliers = await apiCall(API + '/suppliers');
            this._renderTable(suppliers);
        } catch (e) {
            alert(e.message || 'Erro ao vincular fornecedor');
        }
    },

    /** Filtra a lista de importação pelo campo de busca. */
    _filterImportList() {
        const search = (document.getElementById('suppliersImportSearch')?.value || '').toLowerCase();
        const rows = document.querySelectorAll('.suppliers-import-row');
        for (const row of rows) {
            const name = row.querySelector('.suppliers-import-name')?.textContent?.toLowerCase() || '';
            row.style.display = name.includes(search) ? '' : 'none';
        }
    },

    /** Mostra dialog de colisão de nome ao tentar criar fornecedor com nome já existente. */
    _handleConflict(existing, locationId) {
        const dlg = createDialog({
            title: 'Fornecedor já existe',
            subtitle: 'Um fornecedor com esse nome já existe no catálogo global. Deseja vinculá-lo à sua localização?',
            bodyHTML: `
                <div class="suppliers-conflict-info">
                    <p><strong>${_esc(existing.name)}</strong></p>
                </div>
            `,
            actions: [
                {
                    label: 'Vincular à minha localização',
                    className: 'btn-primary',
                    onClick: async () => {
                        try {
                            await apiCall(API + `/suppliers/${existing.id}/link`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ location_id: locationId })
                            });
                            dlg.close();
                            dlg.destroy();
                            Suppliers.load();
                        } catch (e) {
                            alert(e.message || 'Erro ao vincular fornecedor');
                        }
                    }
                },
                {
                    label: 'Cancelar',
                    className: 'btn-secondary',
                    onClick: () => { dlg.close(); dlg.destroy(); }
                }
            ]
        });
        dlg.open();
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
