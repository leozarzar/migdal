/**
 * @file mobile/screens/receipt-form.js
 * @description Tela de formulário de novo/editar recebimento do mobile.
 *   Estende MobApp com os métodos de criação, edição, itens e salvamento.
 *
 * Carregado após mobile/app.js.
 */

Object.assign(MobApp, {

    // ── Tela: Formulário de Novo/Editar Recebimento ──────────────────────────

    async openReceipt(id) {
        this.showScreen('form');
        this._previousScreen = 'list';
        document.getElementById('mobHeaderSubtitle').textContent = 'Editar Recebimento';
        document.getElementById('mobSaveBtn').textContent = 'Atualizar Recebimento';

        // Usa o cache local — evita re-fetch e problema de comparação de tipos
        const receipt = this._receipts.find(r => String(r.id) === String(id));
        if (!receipt) {
            this._toast('Recebimento não encontrado', 'error');
            return;
        }

        this._editingReceipt = receipt;

        document.getElementById('mobNature').value   = receipt.nature   || '';
        document.getElementById('mobDate').value     = receipt.date     || '';
        this.onNatureChange();
        // Supplier precisa ser definido DEPOIS de onNatureChange mostrar o campo
        document.getElementById('mobSupplier').value = receipt.supplier || '';
        await this.onSupplierChange();
        document.getElementById('mobOrder').value = receipt.order_id != null ? String(receipt.order_id) : '';

        try {
            const rawItems = await apiCall(API + '/receipts/items/' + id);
            this._items = (rawItems || []).map(i => ({
                _stockUnitId:    i.id,
                _originalStatus: i.status,
                code:            i.volume_id == null ? '' : Number(i.volume_id),
                material:        i.material,
                materialLabel:   i.material,
                quantity:        i.weight,
                operator:        i.operator || '',
                operatorLabel:   i.operator || '',
            }));
            // Snapshot imutável para calcular o diff ao salvar
            this._originalItems = [...this._items];
            this._renderItemsList();
            this._setNextItemCode();
        } catch {
            this._toast('Erro ao carregar itens do recebimento', 'error');
        }
    },

    onNatureChange() {
        const nature = document.getElementById('mobNature').value;
        const showSupplier = nature === 'C' || nature === 'S';
        document.getElementById('fieldSupplier').style.display      = showSupplier ? '' : 'none';
        document.getElementById('fieldItemOperator').style.display  = nature === 'P' ? '' : 'none';
        if (!showSupplier) {
            document.getElementById('fieldOrder').style.display = 'none';
            document.getElementById('mobOrder').innerHTML = '<option value="">Selecione...</option>';
        }
    },

    async onSupplierChange() {
        const supplier = document.getElementById('mobSupplier').value;
        const orderEl  = document.getElementById('mobOrder');
        const fieldOrder = document.getElementById('fieldOrder');

        if (!supplier) {
            fieldOrder.style.display = 'none';
            orderEl.innerHTML = '<option value="">Selecione...</option>';
            return;
        }

        try {
            const orders = await apiCall(API + '/orders');
            const filtered = orders.filter(o => o.supplier === supplier && o.status === 'OPEN');

            orderEl.innerHTML = '<option value="">Sem pedido</option>'
                + filtered.map(o => `<option value="${o.id}">#${o.id}</option>`).join('');

            fieldOrder.style.display = '';
        } catch {
            fieldOrder.style.display = 'none';
        }
    },

    addItem() {
        const nature     = document.getElementById('mobNature').value;
        const materialEl = document.getElementById('mobItemMaterial');
        const material   = materialEl.value;
        const qty        = parseFloat(document.getElementById('mobItemQty').value);
        const code       = document.getElementById('mobItemCode').value.trim();
        const operatorEl = document.getElementById('mobItemOperator');
        const operator   = operatorEl.value;

        if (!material) {
            this._toast('Selecione o material', 'error');
            return;
        }
        if (!qty || isNaN(qty) || qty <= 0) {
            this._toast('Informe a quantidade', 'error');
            return;
        }
        if (nature === 'P' && !operator) {
            this._toast('Selecione o operador', 'error');
            return;
        }

        const nextCode = code
            ? Number.parseInt(code, 10)
            : this._getNextItemCode();

        if (this._editingItemIndex !== null) {
            const origItem = this._items[this._editingItemIndex];
            this._items[this._editingItemIndex] = {
                _stockUnitId:    origItem._stockUnitId,
                _originalStatus: origItem._originalStatus,
                code:            nextCode,
                material,
                materialLabel:   materialEl.options[materialEl.selectedIndex].text,
                quantity:        qty,
                operator:        nature === 'P' ? operator : '',
                operatorLabel:   nature === 'P' ? operatorEl.options[operatorEl.selectedIndex].text : '',
            };
            this._editingItemIndex = null;
            this._restoreMobAddBtn();
        } else {
            this._items.push({
                code:          nextCode,
                material,
                materialLabel: materialEl.options[materialEl.selectedIndex].text,
                quantity:      qty,
                operator:      nature === 'P' ? operator : '',
                operatorLabel: nature === 'P' ? operatorEl.options[operatorEl.selectedIndex].text : '',
            });
        }

        // Limpa campos do formulário de item
        document.getElementById('mobItemQty').value       = '';
        document.getElementById('mobItemOperator').value  = '';

        this._renderItemsList();
        this._setNextItemCode();
    },

    startEditItem(index) {
        this._editingItemIndex = index;
        const item = this._items[index];
        document.getElementById('mobItemCode').value     = item.code;
        document.getElementById('mobItemMaterial').value = item.material;
        document.getElementById('mobItemQty').value      = item.quantity;
        if (item.operator) document.getElementById('mobItemOperator').value = item.operator;
        const addBtn = document.getElementById('mobAddItemBtn');
        if (addBtn) addBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">stylus</span>Editar Item';
        const cancelBtn = document.getElementById('mobCancelEditBtn');
        if (cancelBtn) cancelBtn.style.display = '';
        this._renderItemsList();
    },

    cancelEditItem() {
        this._editingItemIndex = null;
        this._restoreMobAddBtn();
        document.getElementById('mobItemMaterial').value = '';
        document.getElementById('mobItemQty').value      = '';
        document.getElementById('mobItemOperator').value = '';
        this._setNextItemCode();
        this._renderItemsList();
    },

    _restoreMobAddBtn() {
        const addBtn = document.getElementById('mobAddItemBtn');
        if (addBtn) addBtn.textContent = '+ Adicionar Item';
        const cancelBtn = document.getElementById('mobCancelEditBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    },

    removeItem(index) {
        if (this._editingItemIndex === index) {
            this._editingItemIndex = null;
            this._restoreMobAddBtn();
        } else if (this._editingItemIndex !== null && this._editingItemIndex > index) {
            this._editingItemIndex -= 1;
        }
        this._items.splice(index, 1);
        this._renderItemsList();
        this._setNextItemCode();
    },

    async saveReceipt() {
        const nature    = document.getElementById('mobNature').value;
        const date      = document.getElementById('mobDate').value;
        const supplier  = document.getElementById('mobSupplier').value;
        const orderVal  = document.getElementById('mobOrder').value;
        const order_id  = orderVal ? parseInt(orderVal, 10) : null;

        if (!nature) { this._toast('Selecione a natureza', 'error'); return; }
        if (!date)   { this._toast('Informe a data', 'error'); return; }
        if ((nature === 'C' || nature === 'S') && !supplier) {
            this._toast('Selecione o fornecedor', 'error');
            return;
        }
        if (this._items.length === 0) {
            this._toast('Adicione ao menos um item', 'error');
            return;
        }

        try {
            let receiptId;

            if (this._editingReceipt) {
                // ── Edição ──
                await apiCall(API + '/receipts/update', {
                    method:  'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        id:       this._editingReceipt.id,
                        nature,
                        date,
                        supplier: supplier || null,
                        order_id,
                    }),
                });

                // Diff: calcula itens removidos, modificados e novos
                const deletedItems = this._originalItems.filter(orig =>
                    !this._items.some(cur => cur._stockUnitId === orig._stockUnitId)
                );
                const newItems = this._items.filter(cur => !cur._stockUnitId);
                const modifiedItems = this._items.filter(cur => {
                    if (!cur._stockUnitId) return false;
                    const orig = this._originalItems.find(o => o._stockUnitId === cur._stockUnitId);
                    if (!orig) return false;
                    return cur.code !== orig.code || cur.material !== orig.material ||
                           cur.quantity !== orig.quantity || cur.operator !== orig.operator;
                });

                // Confirmação unificada para itens com baixa afetados
                const loweredDeleted  = deletedItems.filter(i  => i._originalStatus === 'OUT_STOCK');
                const loweredModified = modifiedItems.filter(i => i._originalStatus === 'OUT_STOCK');
                if (loweredDeleted.length > 0 || loweredModified.length > 0) {
                    let bodyHTML = '';
                    if (loweredDeleted.length > 0) {
                        bodyHTML += `<p class="mob-confirm-section-label">Itens deletados com baixa:</p>
                            <ul>${loweredDeleted.map(i => `<li>Código ${_esc(String(i.code))} — ${_esc(i.material)}</li>`).join('')}</ul>`;
                    }
                    if (loweredModified.length > 0) {
                        bodyHTML += `<p class="mob-confirm-section-label">Itens editados com baixa:</p>
                            <ul>${loweredModified.map(i => `<li>Código ${_esc(String(i.code))} — ${_esc(i.material)}</li>`).join('')}</ul>`;
                    }
                    const ok = await MobApp._mobConfirm('Atenção: itens com baixa serão afetados', bodyHTML);
                    if (!ok) return;
                }

                for (const item of deletedItems) {
                    await apiCall(API + `/stock-units/${item._stockUnitId}`, { method: 'DELETE' });
                }

                for (const item of modifiedItems) {
                    await apiCall(API + `/stock-units/${item._stockUnitId}`, {
                        method:  'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify({
                            volume_id: Number.parseInt(item.code, 10),
                            material:  item.material,
                            weight:    item.quantity,
                            operator:  item.operator || null,
                        }),
                    });
                }

                receiptId = this._editingReceipt.id;
                for (const item of newItems) {
                    await apiCall(API + '/stock-units', {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify({
                            receipt_id: receiptId,
                            volume_id:  Number.parseInt(item.code, 10),
                            material:   item.material,
                            weight:     item.quantity,
                            supplier:   supplier || null,
                            operator:   item.operator || null,
                            status:     'IN_STOCK',
                            date_in:    date,
                            notes:      '',
                        }),
                    });
                }

                this._toast('Recebimento atualizado!', 'success');
                this.showScreen('list');
                return;
            } else {
                // ── Criação ──
                const receipt = await apiCall(API + '/receipts', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ nature, date, supplier: supplier || null, order_id }),
                });
                receiptId = receipt && receipt.id;
                if (!receiptId) throw new Error('ID do recebimento não retornado');
            }

            for (const item of this._items) {
                await apiCall(API + '/stock-units', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        receipt_id: receiptId,
                        volume_id:  Number.parseInt(item.code, 10),
                        material:   item.material,
                        weight:     item.quantity,
                        supplier:   supplier || null,
                        operator:   item.operator || null,
                        status:     'IN_STOCK',
                        date_in:    date,
                        notes:      '',
                    }),
                });
            }

            this._toast(this._editingReceipt ? 'Recebimento atualizado!' : 'Recebimento salvo!', 'success');
            this.showScreen('list');
        } catch {
            this._toast('Erro ao salvar recebimento', 'error');
        }
    },

    _resetReceiptForm() {
        this._items = [];
        this._originalItems = [];
        document.getElementById('mobNature').value            = '';
        document.getElementById('mobDate').value              = new Date().toISOString().slice(0, 10);
        document.getElementById('mobSupplier').value          = '';
        document.getElementById('mobOrder').value             = '';
        document.getElementById('mobItemMaterial').value      = '';
        document.getElementById('mobItemQty').value           = '';
        document.getElementById('mobItemOperator').value      = '';
        document.getElementById('fieldSupplier').style.display     = 'none';
        document.getElementById('fieldOrder').style.display        = 'none';
        document.getElementById('fieldItemOperator').style.display = 'none';
        this._renderItemsList();
        this._setNextItemCode();
    },

    _getNextItemCode() {
        if (!this._items.length) {
            return 1;
        }

        const maxCode = this._items.reduce((currentMax, item) => {
            const parsedCode = Number.parseInt(item.code, 10);
            if (!Number.isInteger(parsedCode)) {
                return currentMax;
            }

            return Math.max(currentMax, parsedCode);
        }, 0);

        return maxCode + 1;
    },

    _setNextItemCode() {
        const codeInput = document.getElementById('mobItemCode');
        if (!codeInput) {
            return;
        }

        codeInput.value = this._getNextItemCode();
    },

    _renderItemsList() {
        const list = document.getElementById('mobItemsList');
        const totalEl = document.getElementById('mobReceiptTotal');
        const totalQtyEl = document.getElementById('mobTotalQty');

        if (this._items.length === 0) {
            list.innerHTML = '<li class="mob-items-empty">Nenhum item adicionado.</li>';
            totalEl.style.display = 'none';
            return;
        }

        list.innerHTML = this._items.map((item, i) => `
            <li class="mob-item-row${this._editingItemIndex === i ? ' mob-item-editing' : ''}" onclick="MobApp.startEditItem(${i})">
                <div class="mob-item-info">
                    <div class="mob-item-material">${_esc(item.materialLabel)}</div>
                    <div class="mob-item-meta">
                        Código: ${_esc(item.code)} &nbsp;·&nbsp; Qtd: ${item.quantity}
                        ${item.operatorLabel ? ` &nbsp;·&nbsp; Op: ${_esc(item.operatorLabel)}` : ''}
                    </div>
                </div>
                <button class="mob-item-remove" onclick="event.stopPropagation(); MobApp.removeItem(${i})" aria-label="Remover item">×</button>
            </li>
        `).join('');

        const total = this._items.reduce((s, it) => s + it.quantity, 0);
        totalQtyEl.textContent = total;
        totalEl.style.display  = '';
    },
});
