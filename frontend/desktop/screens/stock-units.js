
/**
 * stock-units.js
 * Tela de Unidades de Estoque — listagem, edição, uso/devolução e exclusão de bags.
 */
const StockUnits = {

    // ── Estado ──

    /** Bag selecionado atualmente */
    selectedBag: null,
    _filterStatus: '',
    _materialSelect: null,
    _supplierSelect: null,
    _batchDialog: null,
    _detailDialog: null,
    _selectedIds: new Set(),
    _showOnlySelected: false,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela */
    render() {
        // Destroi os dialogs e selects do ciclo anterior
        this._batchDialog?.destroy();  this._batchDialog  = null;
        this._detailDialog?.destroy(); this._detailDialog = null;
        this._materialSelect?.destroy(); this._materialSelect = null;
        this._supplierSelect?.destroy(); this._supplierSelect = null;
        this._filterStatus = '';
        this._selectedIds = new Set();
        this._showOnlySelected = false;
        return `
        <div class="stock-units-container">
            <div id="stockUnitsBatchBar" class="stock-units-batch-bar" style="display:none">
                <span id="stockUnitsBatchCount"></span>
                <button class="stock-units-batch-btn" onclick="StockUnits.openBatchOut()">
                    <span class="material-symbols-outlined">output</span>
                    Dar saída
                </button>
                <button class="stock-units-batch-cancel" onclick="StockUnits._clearSelection()">Cancelar seleção</button>
            </div>
            <div class="stock-units-card">
                <div class="stock-units-filters">
                    <div class="stock-units-filters-icon-wrap">
                        <span class="material-symbols-outlined stock-units-filters-icon">filter_list</span>
                    </div>
                    <div class="stock-units-status-pills">
                        <button class="stock-units-status-pill" data-value="" onclick="StockUnits._setStatus('')">Todos</button>
                        <button class="stock-units-status-pill" data-value="IN_STOCK" onclick="StockUnits._setStatus('IN_STOCK')">Em estoque</button>
                        <button class="stock-units-status-pill" data-value="OUT_STOCK" onclick="StockUnits._setStatus('OUT_STOCK')">Usado</button>
                    </div>
                    <div id="stockUnitsMaterialContainer" class="stock-units-filter-select-wrap"></div>
                    <div id="stockUnitsSupplierContainer" class="stock-units-filter-select-wrap"></div>
                    <input id="search" class="stock-units-search" placeholder="Pesquisar" oninput="StockUnits.load()">
                    <button id="filterSelectedBtn" class="stock-units-filter-selected-btn" onclick="StockUnits._toggleShowSelected()" title="Mostrar apenas selecionados">
                        <span class="material-symbols-outlined">checklist</span>
                        Selecionados
                    </button>
                </div>
                <div id="stockUnitsCount" class="stock-units-count"></div>
                <div class="stock-units-table-container">
                    <table class="stock-units-table">
                        <thead>
                            <tr>
                                <th class="stock-units-col-check"><input type="checkbox" id="checkAll" onchange="StockUnits._onCheckAll(this)" title="Selecionar todos"></th>
                                <th></th>
                                <th>Código</th>
                                <th>ID Antigo</th>
                                <th>Material</th>
                                <th class="stock-units-col-supplier">Fornecedor</th>
                                <th class="stock-units-col-operator">Operador</th>
                                <th class="stock-units-col-qty">Quantidade</th>
                                <th class="stock-units-col-wait"><span class="material-symbols-outlined">schedule</span></th>
                                <th>Obs</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="stockUnitsTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    },

    /** Carrega os dados e renderiza a tabela */
    async load() {
        this._resetForm();

        // Cria os dialogs na primeira carga após render()
        if (!this._batchDialog)  this._batchDialog  = this._createBatchDialog();
        if (!this._detailDialog) this._detailDialog = this._createDetailDialog();

        try {
            const stockUnits = await apiCall(API + "/stock-units") || [];

            const isFirstLoad = !this._materialSelect;
            this._populateFilters(stockUnits);

            if (isFirstLoad) {
                this._filterStatus = localStorage.getItem('wcm.stockUnits.status') || '';
                const savedMaterial = localStorage.getItem('wcm.stockUnits.material') || '';
                const savedSupplier = localStorage.getItem('wcm.stockUnits.supplier') || '';
                const searchEl = document.getElementById('search');
                if (searchEl) searchEl.value = localStorage.getItem('wcm.stockUnits.search') || '';
                if (savedMaterial) this._materialSelect.select('material', savedMaterial);
                if (savedSupplier) this._supplierSelect.select('supplier', savedSupplier);
            }

            localStorage.setItem('wcm.stockUnits.search', document.getElementById('search')?.value || '');
            this._updateStatusPills();

            this._renderTable(stockUnits);

            this._updateSelectedFilterBtn();
            this._updateBatchBar();
        } catch (error) {
            alert("Erro ao carregar estoque");
        }
    },

    async onTabFocus() { return this.load(); },

    // ── Ações Públicas ──

    /** Seleciona um bag e abre o dialog de detalhes */
    selectStockUnit(bag, tr) {
        clearTableSelection();
        tr.classList.add("selected");

        document.getElementById("code").value = this._codeFor(bag);
        document.getElementById("old_id").value = bag.old_id || "";
        document.getElementById("material").value = bag.material;
        document.getElementById("supplier").value = bag.supplier || "";
        document.getElementById("operator").value = bag.operator || "";
        document.getElementById("weight").value = bag.weight;
        document.getElementById("date_in").value = bag.date_in;
        document.getElementById("date_out").value = bag.date_out || "";
        document.getElementById("notes").value = bag.notes ?? "";
        document.getElementById("deduction_type").value = bag.deduction_type || "uso";
        document.getElementById("deductionTypeField").style.display = bag.date_out ? "" : "none";

        this._detailDialog.setTitle(this._codeFor(bag));
        this._detailDialog.open();
        this.selectedBag = bag.id;
    },

    /** Salva alterações do bag selecionado */
    async editStockUnit() {
        const dateOut = document.getElementById("date_out").value;
        const data = {
            id: this.selectedBag,
            date_out: dateOut,
            status: getStatusFromDate(dateOut),
            notes: document.getElementById("notes").value,
            deduction_type: dateOut ? document.getElementById("deduction_type").value : null
        };

        try {
            await apiCall(API + "/stock-units/update", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });

            this._clearAndReload();
            alert("Salvo com sucesso");
        } catch (error) {
            alert("Erro ao salvar");
        }
    },

    /** Marca um bag como usado (saída) */
    async useStockUnit(event, id) {
        event.stopPropagation();
        await this._updateStockUnitStatus(id, 'out');
    },

    /** Devolve um bag ao estoque */
    async returnStockUnit(event, id) {
        event.stopPropagation();
        await this._updateStockUnitStatus(id, "in");
    },

    /** Remove um bag do sistema */
    async deleteStockUnit(event, id) {
        event.stopPropagation();
        if (!confirm("Tem certeza que deseja deletar?")) return;

        try {
            await apiCall(`${API}/stock-units/${id}`, { method: "DELETE" });
            this.load();
        } catch (error) {
            alert("Erro ao deletar");
        }
    },

    /** Cancela edição e recarrega a tela */
    cancelEdit() {
        this._clearAndReload();
    },

    // ── Renderização ──

    /** Renderiza a tabela com os bags filtrados */
    _renderTable(bags) {
        const filters = this._getFilters();
        const tbody = document.getElementById("stockUnitsTableBody");
        tbody.innerHTML = "";

        const filtered = bags
            .filter(bag => this._matchesFilters(bag, filters));

        const countEl = document.getElementById('stockUnitsCount');
        if (countEl) countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'item' : 'itens'}`;

        if (filtered.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="10" class="empty-state">Nenhuma unidade de estoque encontrada.</td>`;
            tbody.appendChild(tr);
            return;
        }

        filtered.forEach(bag => {
            const tr = this._createTableRow(bag);
            tr.onclick = () => this.selectStockUnit(bag, tr);
            tbody.appendChild(tr);
        });
    },

    /** Cria uma linha da tabela para um bag */
    _createTableRow(bag) {
        const tr = document.createElement("tr");
        const daysDiff = calculateDaysDifference(bag.date_in, bag.date_out);
        const isInStock = bag.status === "IN_STOCK";
        const isChecked = this._selectedIds.has(String(bag.id));

        tr.innerHTML = `
            <td class="stock-units-col-check" onclick="event.stopPropagation()">
                ${isInStock ? `<input type="checkbox" class="stock-units-row-check" data-id="${bag.id}" onchange="StockUnits._onRowCheck(this,'${bag.id}')" ${isChecked ? 'checked' : ''}>` : ''}
            </td>
            <td class="stock-units-col-status">
                ${isInStock ? "" : '<span class="material-symbols-outlined">check_circle</span>'}
            </td>
            <td class="stock-units-col-code"><span class="code-badge">${this._codeFor(bag)}</span></td>
            <td class="stock-units-col-old-id">${bag.old_id && bag.old_id !== this._codeFor(bag) ? bag.old_id : ""}</td>
            <td class="stock-units-col-material">${bag.material}</td>
            <td class="stock-units-col-supplier">${bag.supplier || ""}</td>
            <td class="stock-units-col-operator">${bag.operator || ""}</td>
            <td class="stock-units-col-qty">${bag.weight}</td>
            <td class="stock-units-col-wait">${daysDiff}d</td>
            <td class="stock-units-col-obs">${bag.notes ?? ""}</td>
            <td class="stock-units-col-actions">
                ${isInStock
                    ? `<button onclick="StockUnits.useStockUnit(event,'${bag.id}')">
                        <span class="material-symbols-outlined">output</span>
                       </button>`
                    : `<button onclick="StockUnits.returnStockUnit(event,'${bag.id}')">
                        <span class="material-symbols-outlined">undo</span>
                       </button>`
                }
                <button onclick="StockUnits.deleteStockUnit(event,'${bag.id}')">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        `;

        return tr;
    },

    /** Popula os SearchSelects de filtro de material e fornecedor */
    _populateFilters(bags) {
        const materials = [...new Set(bags.map(b => b.material).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        const suppliers = [...new Set(bags.map(b => b.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b));

        if (!this._materialSelect) {
            this._materialSelect = createSearchSelect({
                id: 'stockUnitsMaterial',
                placeholder: 'Material',
                searchable: true,
                multiple: false,
                sections: [{ key: 'material', items: [] }],
                onChange: ({ value }) => {
                    localStorage.setItem('wcm.stockUnits.material', value != null ? String(value) : '');
                    StockUnits.load();
                }
            });
            this._materialSelect.mount(document.getElementById('stockUnitsMaterialContainer'));
        }

        if (!this._supplierSelect) {
            this._supplierSelect = createSearchSelect({
                id: 'stockUnitsSupplier',
                placeholder: 'Fornecedor',
                searchable: true,
                multiple: false,
                sections: [{ key: 'supplier', items: [] }],
                onChange: ({ value }) => {
                    localStorage.setItem('wcm.stockUnits.supplier', value != null ? String(value) : '');
                    StockUnits.load();
                }
            });
            this._supplierSelect.mount(document.getElementById('stockUnitsSupplierContainer'));
        }

        this._materialSelect.setItems('material', materials.map(m => ({ value: m, label: m })));
        this._supplierSelect.setItems('supplier', suppliers.map(s => ({ value: s, label: s })));
    },

    // ── Utilitários Privados ──

    /** Obtém os valores atuais dos filtros */
    _getFilters() {
        const materialSel = this._materialSelect?.getValue();
        const supplierSel = this._supplierSelect?.getValue();
        return {
            status: this._filterStatus || null,
            material: materialSel ? String(materialSel.value) : null,
            supplier: supplierSel ? String(supplierSel.value) : null,
            search: document.getElementById("search").value.toLowerCase() || null,
            onlySelected: this._showOnlySelected
        };
    },

    /** Verifica se um bag corresponde aos filtros ativos */
    _matchesFilters(bag, filters) {
        if (filters.onlySelected && !this._selectedIds.has(String(bag.id))) return false;
        if (filters.status && bag.status !== filters.status) return false;
        if (filters.material && bag.material !== filters.material) return false;
        if (filters.supplier && bag.supplier !== filters.supplier) return false;

        if (filters.search) {
            const searchText = [
                this._codeFor(bag),
                bag.old_id ?? "",
                bag.old_id ?? "",
                bag.material ?? "",
                bag.supplier ?? "",
                bag.operator ?? "",
                bag.notes ?? ""
            ].join("-").toLowerCase();

            if (!searchText.includes(filters.search)) return false;
        }

        return true;
    },

    /** Gera o código de exibição de um bag (ex: #C1-001) */
    _codeFor(bag) {
        const prefix = bag.nature?.charAt(0) ?? "";
        const vol = String(bag.volume_id ?? "").padStart(3, "0");
        return `#${prefix}${bag.receipt_id}-${vol}`;
    },

    /** Reseta estado de seleção e fecha o dialog de detalhes */
    _resetForm() {
        this._detailDialog?.close();
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) headerOptions.innerHTML = "";
    },

    /** Limpa os campos do formulário de edição */
    _clearForm() {
        clearFormInputs(["code", "material", "supplier", "operator", "weight", "date_in", "date_out", "notes"]);
        const deductionTypeField = document.getElementById("deductionTypeField");
        if (deductionTypeField) deductionTypeField.style.display = "none";
        const deductionTypeEl = document.getElementById("deduction_type");
        if (deductionTypeEl) deductionTypeEl.value = "uso";
        clearTableSelection();
    },

    /** Limpa o formulário e recarrega a tela */
    _clearAndReload() {
        this._clearForm();
        this.load();
    },

    /** Checkbox "selecionar todos" */
    _onCheckAll(checkbox) {
        this._selectedIds = new Set();
        document.querySelectorAll('.stock-units-row-check').forEach(cb => {
            cb.checked = checkbox.checked;
            if (checkbox.checked) this._selectedIds.add(String(cb.dataset.id));
        });
        this._updateBatchBar();
    },

    /** Checkbox individual por linha */
    _onRowCheck(checkbox, id) {
        if (checkbox.checked) {
            this._selectedIds.add(String(id));
        } else {
            this._selectedIds.delete(String(id));
            const checkAll = document.getElementById('checkAll');
            if (checkAll) checkAll.checked = false;
        }
        this._updateBatchBar();
    },

    /** Exibe/oculta a barra de ações em lote */
    _updateBatchBar() {
        const bar = document.getElementById('stockUnitsBatchBar');
        const countEl = document.getElementById('stockUnitsBatchCount');
        if (!bar) return;
        const n = this._selectedIds.size;
        if (n > 0) {
            bar.style.display = '';
            countEl.textContent = `${n} ${n === 1 ? 'item selecionado' : 'itens selecionados'}`;
        } else {
            bar.style.display = 'none';
        }
    },

    /** Limpa todas as seleções e desativa o filtro de selecionados */
    _clearSelection() {
        this._selectedIds = new Set();
        this._showOnlySelected = false;
        document.querySelectorAll('.stock-units-row-check').forEach(cb => cb.checked = false);
        const checkAll = document.getElementById('checkAll');
        if (checkAll) checkAll.checked = false;
        this._updateBatchBar();
        this._updateSelectedFilterBtn();
        this.load();
    },

    /** Define o filtro de status e recarrega a tabela */
    _setStatus(value) {
        this._filterStatus = value;
        localStorage.setItem('wcm.stockUnits.status', value);
        this.load();
    },

    /** Atualiza o estado visual dos pills de status */
    _updateStatusPills() {
        document.querySelectorAll('.stock-units-status-pill').forEach(btn => {
            btn.classList.toggle('stock-units-status-pill--active', btn.dataset.value === (this._filterStatus || ''));
        });
    },

    /** Liga/desliga o filtro "mostrar apenas selecionados" */
    _toggleShowSelected() {
        this._showOnlySelected = !this._showOnlySelected;
        this._updateSelectedFilterBtn();
        this.load();
    },

    /** Atualiza o estado visual do botão de filtro de selecionados */
    _updateSelectedFilterBtn() {
        const btn = document.getElementById('filterSelectedBtn');
        if (!btn) return;
        btn.classList.toggle('stock-units-filter-selected-btn--active', this._showOnlySelected);
    },

    /** Abre o dialog de saída em lote */
    openBatchOut() {
        if (!this._batchDialog) return;
        const n = this._selectedIds.size;
        this._batchDialog.setSubtitle(`${n} ${n === 1 ? 'item será baixado' : 'itens serão baixados'}.`);
        document.getElementById('batchDateOut').value = new Date().toISOString().slice(0, 10);
        document.getElementById('batchDeductionType').value = 'uso';
        this._batchDialog.open();
    },

    /** Fecha o dialog sem confirmar */
    closeBatchDialog() {
        this._batchDialog?.close();
    },

    /** Confirma saída em lote */
    async confirmBatchOut() {
        const dateOut = document.getElementById('batchDateOut').value;
        const deductionType = document.getElementById('batchDeductionType').value;
        if (!dateOut) {
            alert('Informe a data de saída');
            return;
        }
        this.closeBatchDialog();

        const ids = [...this._selectedIds];
        try {
            await Promise.all(ids.map(id =>
                apiCall(`${API}/stock-units/update`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, date_out: dateOut, status: 'OUT_STOCK', notes: '', deduction_type: deductionType })
                })
            ));
            this._selectedIds = new Set();
            this.load();
        } catch {
            alert('Erro ao dar saída nos itens selecionados');
        }
    },

    /** Reage à mudança da data de saída — exibe/oculta tipo de baixa */
    _onDateOutChange() {
        const dateOut = document.getElementById("date_out").value;
        const field = document.getElementById("deductionTypeField");
        field.style.display = dateOut ? "" : "none";
        if (!dateOut) document.getElementById("deduction_type").value = "uso";
    },

    /** Cria o dialog de saída em lote via utilitário */
    _createBatchDialog() {
        return createDialog({
            title: 'Saída em Lote',
            subtitle: '',
            bodyHTML: `
                <div class="dialog-field">
                    <label for="batchDateOut">Data de saída</label>
                    <input type="date" id="batchDateOut" class="stock-units-edit-input">
                </div>
                <div class="dialog-field">
                    <label for="batchDeductionType">Tipo de baixa</label>
                    <select id="batchDeductionType" class="stock-units-edit-input">
                        <option value="uso">Uso</option>
                        <option value="ajuste">Ajuste</option>
                    </select>
                </div>
            `,
            actions: [
                { label: 'Confirmar', className: 'btn-primary', onClick: () => StockUnits.confirmBatchOut() },
                { label: 'Cancelar',  className: 'btn-secondary', onClick: () => StockUnits.closeBatchDialog() },
            ],
        });
    },

    /** Cria o dialog de detalhes/edição de um bag via utilitário */
    _createDetailDialog() {
        return createDialog({
            title: '',
            wide: true,
            closeOnBackdrop: true,
            onClose: () => clearTableSelection(),
            bodyHTML: `
                <div class="stock-units-edit-fields">
                    <div class="stock-units-edit-field">
                        <label>Código</label>
                        <input readonly id="code" class="stock-units-edit-input" placeholder="Código">
                    </div>
                    <div class="stock-units-edit-field">
                        <label>ID Antigo</label>
                        <input readonly id="old_id" class="stock-units-edit-input" placeholder="ID Antigo">
                    </div>
                    <div class="stock-units-edit-field">
                        <label>Material</label>
                        <input readonly id="material" class="stock-units-edit-input" placeholder="Material">
                    </div>
                    <div class="stock-units-edit-field">
                        <label>Fornecedor</label>
                        <input readonly id="supplier" class="stock-units-edit-input" placeholder="Fornecedor">
                    </div>
                    <div class="stock-units-edit-field">
                        <label>Operador</label>
                        <input readonly id="operator" class="stock-units-edit-input" placeholder="Operador">
                    </div>
                    <div class="stock-units-edit-field">
                        <label>Peso</label>
                        <input readonly id="weight" class="stock-units-edit-input" placeholder="Peso">
                    </div>
                    <div class="stock-units-edit-field">
                        <label>Entrada</label>
                        <input readonly id="date_in" type="date" class="stock-units-edit-input">
                    </div>
                    <div class="stock-units-edit-field">
                        <label>Saída</label>
                        <input id="date_out" type="date" class="stock-units-edit-input" onchange="StockUnits._onDateOutChange()">
                    </div>
                    <div id="deductionTypeField" class="stock-units-edit-field" style="display:none">
                        <label>Tipo de Baixa</label>
                        <select id="deduction_type" class="stock-units-edit-input">
                            <option value="uso">Uso</option>
                            <option value="ajuste">Ajuste</option>
                        </select>
                    </div>
                    <div class="stock-units-edit-field stock-units-edit-field-obs">
                        <label>Obs</label>
                        <input id="notes" class="stock-units-edit-input" placeholder="Observação">
                    </div>
                </div>
            `,
            actions: [
                { label: 'Editar',   icon: 'edit', className: 'btn-primary', onClick: () => StockUnits.editStockUnit() },
                { label: 'Cancelar', className: 'btn-secondary', onClick: () => StockUnits.cancelEdit() },
            ],
        });
    },

    /** Atualiza o status de um bag via API (uso ou devolução) */
    async _updateStockUnitStatus(id, action) {
        try {
            await apiCall(`${API}/stock-units/${id}/${action}`, { method: "PUT" });
            this.load();
        } catch (error) {
            alert(`Erro ao ${action === 'out' ? 'usar' : 'devolver'} unidade de estoque`);
        }
    },
};