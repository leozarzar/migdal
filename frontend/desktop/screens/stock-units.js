
/**
 * stock-units.js
 * Tela de Unidades de Estoque — listagem, edição, uso/devolução e exclusão de bags.
 */
const StockUnits = {

    // ── Estado ──

    /** Bag selecionado atualmente */
    selectedBag: null,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela */
    render() {
        return `
        <div class="stock-units-container">
            <div id="stockUnitsEditPanel" class="stock-units-edit-panel" style="display:none">
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
                <div class="stock-units-edit-actions">
                    <button class="btn-primary stock-units-btn-edit" onclick="StockUnits.editStockUnit()">
                        <span class="material-symbols-outlined">edit</span>
                        Editar
                    </button>
                    <button class="btn-secondary" onclick="StockUnits.cancelEdit()">Cancelar</button>
                </div>
            </div>
            <div class="stock-units-card">
                <div class="stock-units-filters">
                    <select id="filterStatus" onchange="StockUnits.load()">
                        <option value="">Status</option>
                        <option value="IN_STOCK">Em estoque</option>
                        <option value="OUT_STOCK">Usado</option>
                    </select>
                    <select id="filterMaterial" onchange="StockUnits.load()">
                        <option value="">Material</option>
                    </select>
                    <select id="filterSupplier" onchange="StockUnits.load()">
                        <option value="">Fornecedor</option>
                    </select>
                    <input id="search" class="stock-units-search" placeholder="Pesquisar" oninput="StockUnits.load()">
                </div>
                <div class="stock-units-table-container">
                    <table class="stock-units-table">
                        <thead>
                            <tr>
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
                        <tbody id="tableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    },

    /** Carrega os dados e renderiza a tabela */
    async load() {
        this._resetForm();

        try {
            const stockUnits = await apiCall(API + "/stock-units") || [];
            this._populateFilters(stockUnits);
            this._renderTable(stockUnits);
        } catch (error) {
            alert("Erro ao carregar estoque");
        }
    },

    // ── Ações Públicas ──

    /** Seleciona um bag e exibe seus dados no painel de edição */
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
        document.getElementById("date_out").value = bag.date_out;
        document.getElementById("notes").value = bag.notes ?? "";
        document.getElementById("deduction_type").value = bag.deduction_type || "uso";
        document.getElementById("deductionTypeField").style.display = bag.date_out ? "" : "none";

        const editPanel = document.getElementById("stockUnitsEditPanel");
        if (editPanel) editPanel.style.display = "";

        setReadonly(["date_out", "notes"], false);
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
        await this._updateStockUnitStatus(id, "out");
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
        const tbody = document.getElementById("tableBody");
        tbody.innerHTML = "";

        const filtered = bags
            .filter(bag => this._matchesFilters(bag, filters));

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

        tr.innerHTML = `
            <td class="stock-units-col-status">
                ${isInStock ? "" : '<span class="material-symbols-outlined">check_circle</span>'}
            </td>
            <td class="stock-units-col-code">${this._codeFor(bag)}</td>
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

    /** Popula os selects de filtro de material e fornecedor */
    _populateFilters(bags) {
        populateSelect(bags, "filterMaterial", "material", "Material");
        populateSelect(bags, "filterSupplier", "supplier", "Fornecedor");
    },

    // ── Utilitários Privados ──

    /** Obtém os valores atuais dos filtros */
    _getFilters() {
        return {
            status: document.getElementById("filterStatus").value || null,
            material: document.getElementById("filterMaterial").value || null,
            supplier: document.getElementById("filterSupplier").value || null,
            search: document.getElementById("search").value.toLowerCase() || null
        };
    },

    /** Verifica se um bag corresponde aos filtros ativos */
    _matchesFilters(bag, filters) {
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

    /** Reseta o formulário e botões para estado inicial */
    _resetForm() {
        const editPanel = document.getElementById("stockUnitsEditPanel");
        if (editPanel) editPanel.style.display = "none";
        const headerOptions = document.getElementById("headerOptionsContent");
        if (headerOptions) headerOptions.innerHTML = "";
        setReadonly(["date_out", "notes"], true);
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

    /** Reage à mudança da data de saída — exibe/oculta tipo de baixa */
    _onDateOutChange() {
        const dateOut = document.getElementById("date_out").value;
        const field = document.getElementById("deductionTypeField");
        field.style.display = dateOut ? "" : "none";
        if (!dateOut) document.getElementById("deduction_type").value = "uso";
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