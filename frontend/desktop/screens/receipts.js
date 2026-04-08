/**
 * ── receipts.js ──
 * Tela de listagem de recebimentos.
 * Exibe recebimentos com filtro por fornecedor e vínculo a pedidos.
 */
const Receipts = {

    // ── Estado ──

    selectedReceipt: null,
    _filterRestored: false,

    // ── Ciclo de Vida ──

    /** Retorna o template HTML da tela e reseta a seleção. */
    render() {
        this.selectedReceipt = null;
        this._filterRestored = false;
        return `
        <div class="receipts-container">
            <div class="receipts-card">
                <div class="receipts-filters">
                    <select id="filterSupplier" onchange="Receipts.load()">
                        <option value="">Fornecedor</option>
                    </select>
                </div>
                <div class="receipts-table-container">
                    <table class="receipts-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Data</th>
                                <th>Fornecedor</th>
                                <th class="header-qty">Quantidade</th>
                                <th>Pedido</th>
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

    /** Inicializa a tela: configura header, carrega e renderiza recebimentos. */
    async load() {
        this._setHeaderOptions();
        try {
            const receipts = await apiCall(API + "/receipts");
            populateSelect(receipts, "filterSupplier", "supplier", "Fornecedor");

            const selectEl = document.getElementById("filterSupplier");
            if (selectEl) {
                if (!this._filterRestored) {
                    this._filterRestored = true;
                    const saved = localStorage.getItem('wcm.receipts.supplier');
                    if (saved) selectEl.value = saved;
                }
                localStorage.setItem('wcm.receipts.supplier', selectEl.value);
            }

            await this._renderTable(receipts);
        } catch (error) {
            alert("Erro ao carregar recebimentos");
        }
    },

    // ── Ações Públicas ──

    /** Navega para a tela de criação de novo recebimento. */
    newReceipt() {
        showScreen('receipt-details');
    },

    /** Seleciona um recebimento e navega para a tela de detalhes. */
    selectReceipt(receipt, tr) {
        this.selectedReceipt = receipt;
        showScreen('receipt-details');
    },

    /** Deleta um recebimento após confirmação do usuário. */
    async deleteReceipt(event, id) {
        event.stopPropagation();
        
        if (!confirm("Tem certeza que deseja deletar?")) return;

        try {
            await apiCall(API + `/receipts/${id}`, { method: "DELETE" });
            this.load();
        } catch (error) {
            alert("Erro ao deletar recebimento");
        }
    },

    // ── Renderização ──

    /** Renderiza a tabela de recebimentos aplicando o filtro de fornecedor. */
    async _renderTable(receipts) {
        const supplier = document.getElementById("filterSupplier").value;
        const tbody = document.getElementById("tableBody");
        tbody.innerHTML = "";

        const filtered = receipts
            .filter(receipt => !supplier || receipt.supplier === supplier);

        for (const receipt of filtered) {
            try {
                const tr = await this._createTableRow(receipt);
                tr.onclick = () => this.selectReceipt(receipt, tr);
                tbody.appendChild(tr);
            } catch (error) {
                console.error(`Erro ao processar recebimento ${receipt.code}:`, error);
            }
        }

        if (tbody.children.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="6" class="empty-state">Nenhum recebimento encontrado.</td>`;
            tbody.appendChild(tr);
        }
    },

    /** Cria uma linha <tr> com dados do recebimento. */
    async _createTableRow(receipt) {
        const tr = document.createElement("tr");
        const receiptId = `${receipt.nature}${receipt.id}`;
        const orderDisplay = receipt.order_id ? `#${receipt.order_id}` : "";
        
        let totalQty = 0;
        try {
            const receiptItems = await apiCall(API + `/receipts/items/${receipt.id}`);
            totalQty = sumProperty(receiptItems, "weight");
        } catch (error) {
            console.error("Erro ao carregar itens do recebimento:", error);
            totalQty = 0;
        }

        // Formata data de YYYY-MM-DD para DD/MM/YY
        tr.innerHTML = `
            <td class="receipts-col-code">#${receiptId}</td>
            <td class="receipts-col-date">${receipt.date ? receipt.date.split('-').reverse().join('/').replace(/^(\d{2}\/\d{2}\/)\d{2}(\d{2})$/, '$1$2') : ''}</td>
            <td class="receipts-col-supplier">${receipt.supplier || ""}</td>
            <td class="receipts-col-qty">${totalQty}</td>
            <td class="receipts-col-order">${orderDisplay}</td>
            <td class="receipts-col-actions">
                <button onclick="Receipts.deleteReceipt(event,'${receipt.id}')">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        `;

        return tr;
    },

    /** Injeta botões de ação no header da página. */
    _setHeaderOptions() {
        const headerOptions = document.getElementById("headerOptionsContent");
        headerOptions.innerHTML = `
            <button class="btn-new" onclick="Receipts.newReceipt()">
                <span class="material-symbols-outlined">add</span>
                Novo Recebimento
            </button>
        `;
    },
};
