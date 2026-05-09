/**
 * @file mobile/screens/receipt-form.js
 * @description Tela de formulário de novo/editar recebimento do mobile.
 *   Segmented control para natureza, bottom sheet para adicionar itens.
 *
 * Carregado após mobile/app.js.
 */

Object.assign(MobApp, {

    // ── Estado: Formulário ────────────────────────────────────────────────────

    /** Natureza selecionada no segmented control ('C', 'S', 'P' ou '') */
    _receiptNature: '',

    /** Índice do item sendo editado no bottom sheet (null = novo item) */
    _sheetEditingIndex: null,

    // ── Ciclo de Vida ─────────────────────────────────────────────────────────

    /**
     * Abre o formulário para criar um novo recebimento (chamado pelo FAB).
     */
    newReceipt() {
        this.showScreen('form');
    },

    /**
     * Abre o formulário para editar um recebimento existente.
     * @param {string|number} id
     */
    async openReceipt(id) {
        this.showScreen('form');
        // Sobrepõe o que showScreen('form') definiu para modo edição
        const rcpFormTitle = document.getElementById('rcpFormTitle');
        if (rcpFormTitle) rcpFormTitle.textContent = 'Editar Recebimento';
        document.getElementById('rcpSaveBtn').textContent = 'Atualizar Recebimento';

        const receipt = this._receipts.find(r => String(r.id) === String(id));
        if (!receipt) {
            this._toast('Recebimento não encontrado', 'error');
            return;
        }

        this._editingReceipt = receipt;

        // Preencher cabeçalho
        document.getElementById('rcpDate').value = receipt.date || '';
        this.setReceiptNature(receipt.nature || '');
        document.getElementById('rcpSupplier').value = receipt.supplier || '';
        await this.onSupplierChange();
        document.getElementById('rcpOrder').value =
            receipt.order_id != null ? String(receipt.order_id) : '';

        // Carregar itens do recebimento
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
                tracking_mode:   this._getMobMaterialTrackingMode(i.material),
            }));
            this._originalItems = [...this._items];
            this._renderItemsList();
        } catch {
            this._toast('Erro ao carregar itens do recebimento', 'error');
        }
    },

    // ── Natureza (segmented control) ──────────────────────────────────────────

    /**
     * Define a natureza e atualiza o segmented control + campos condicionais.
     * @param {string} nature - 'C', 'S', 'P' ou ''
     */
    setReceiptNature(nature) {
        this._receiptNature = nature;

        // Atualizar botões do segmented control
        ['C', 'S', 'P'].forEach(n => {
            const btn = document.getElementById('rcpNature' + n);
            if (btn) btn.classList.toggle('rcp-segmented-btn--active', nature === n);
        });

        const showSupplier = nature === 'C' || nature === 'S';
        const fieldSupplier = document.getElementById('rcpFieldSupplier');
        const fieldOrder    = document.getElementById('rcpFieldOrder');

        if (fieldSupplier) fieldSupplier.style.display = showSupplier ? '' : 'none';
        if (!showSupplier && fieldOrder) {
            fieldOrder.style.display = 'none';
            document.getElementById('rcpOrder').innerHTML = '<option value="">Sem pedido</option>';
        }

        // Operador no sheet: mostrar/esconder conforme natureza
        const fieldOp = document.getElementById('rcpSheetFieldOperator');
        if (fieldOp) fieldOp.style.display = nature === 'P' ? '' : 'none';
    },

    // ── Fornecedor → Pedidos ──────────────────────────────────────────────────

    async onSupplierChange() {
        const supplier   = document.getElementById('rcpSupplier').value;
        const orderEl    = document.getElementById('rcpOrder');
        const fieldOrder = document.getElementById('rcpFieldOrder');

        if (!supplier) {
            if (fieldOrder) fieldOrder.style.display = 'none';
            if (orderEl) orderEl.innerHTML = '<option value="">Sem pedido</option>';
            return;
        }

        try {
            const orders   = await apiCall(API + '/orders');
            const filtered = orders.filter(o => o.supplier === supplier && o.status === 'OPEN');
            orderEl.innerHTML = '<option value="">Sem pedido</option>'
                + filtered.map(o => `<option value="${o.id}">#${_esc(String(o.id))}</option>`).join('');
            fieldOrder.style.display = filtered.length ? '' : 'none';
        } catch {
            if (fieldOrder) fieldOrder.style.display = 'none';
        }
    },

    // ── Bottom Sheet: Item ────────────────────────────────────────────────────

    /**
     * Abre o bottom sheet para adicionar ou editar um item.
     * @param {number} [index] - índice do item a editar; omitir para novo
     */
    openItemSheet(index) {
        this._sheetEditingIndex = index !== undefined ? index : null;
        const isEdit = this._sheetEditingIndex !== null;

        document.getElementById('rcpSheetTitle').textContent =
            isEdit ? 'Editar item' : 'Adicionar item';
        document.getElementById('rcpSheetConfirmBtn').textContent =
            isEdit ? 'Salvar alterações' : 'Confirmar item';

        // Resetar campos
        document.getElementById('rcpSheetMaterial').value    = '';
        document.getElementById('rcpSheetQty').value         = '';
        document.getElementById('rcpSheetFieldCode').style.display    = 'none';
        document.getElementById('rcpSheetFieldOperator').style.display =
            this._receiptNature === 'P' ? '' : 'none';
        document.getElementById('rcpSheetOperator').value = '';

        if (isEdit) {
            const item = this._items[index];
            document.getElementById('rcpSheetMaterial').value = item.material;
            this.onSheetMaterialChange();
            if (item.tracking_mode === 'lots') {
                document.getElementById('rcpSheetCode').value = item.code;
            }
            document.getElementById('rcpSheetQty').value = item.quantity;
            if (item.operator) document.getElementById('rcpSheetOperator').value = item.operator;
        } else {
            document.getElementById('rcpSheetCode').value = '';
            this._presetSheetCode();
        }

        document.getElementById('rcpSheetBackdrop').style.display = 'flex';
    },

    /** Fecha o bottom sheet de item. */
    closeItemSheet() {
        const el = document.getElementById('rcpSheetBackdrop');
        if (el) el.style.display = 'none';
        this._sheetEditingIndex = null;
    },

    /** Clique no backdrop fecha o sheet (delegate to backdrop element). */
    _onSheetBackdropClick(e) {
        if (e.target === document.getElementById('rcpSheetBackdrop')) {
            this.closeItemSheet();
        }
    },

    /** Reage à mudança de material no sheet: mostra/esconde campo de código. */
    onSheetMaterialChange() {
        const material = document.getElementById('rcpSheetMaterial').value;
        const mode     = material ? this._getMobMaterialTrackingMode(material) : 'simple';
        const codeField = document.getElementById('rcpSheetFieldCode');
        if (codeField) codeField.style.display = mode === 'lots' ? '' : 'none';
        if (mode === 'lots') this._presetSheetCode();
    },

    /** Pré-preenche o campo código com o próximo valor disponível. */
    _presetSheetCode() {
        const material = document.getElementById('rcpSheetMaterial')?.value;
        if (!material || this._getMobMaterialTrackingMode(material) !== 'lots') return;
        const codeEl = document.getElementById('rcpSheetCode');
        if (codeEl && !codeEl.value) codeEl.value = this._getNextItemCode();
    },

    /**
     * Valida os campos do bottom sheet e confirma o item.
     */
    confirmSheetItem() {
        const materialEl = document.getElementById('rcpSheetMaterial');
        const material   = materialEl.value;
        const qty        = parseFloat(document.getElementById('rcpSheetQty').value);
        const nature     = this._receiptNature;
        const operatorEl = document.getElementById('rcpSheetOperator');
        const operator   = operatorEl.value;
        const isLot      = this._getMobMaterialTrackingMode(material) === 'lots';
        const codeRaw    = document.getElementById('rcpSheetCode').value.trim();

        if (!material) { this._toast('Selecione o material', 'error'); return; }
        if (!qty || isNaN(qty) || qty <= 0) { this._toast('Informe a quantidade', 'error'); return; }
        if (nature === 'P' && !operator) { this._toast('Selecione o operador', 'error'); return; }

        const code = isLot && codeRaw
            ? Number.parseInt(codeRaw, 10)
            : this._getNextItemCode();

        const itemData = {
            code,
            material,
            materialLabel: materialEl.options[materialEl.selectedIndex].text,
            quantity:      qty,
            operator:      nature === 'P' ? operator : '',
            operatorLabel: nature === 'P' ? operatorEl.options[operatorEl.selectedIndex].text : '',
            tracking_mode: this._getMobMaterialTrackingMode(material),
        };

        if (this._sheetEditingIndex !== null) {
            const orig = this._items[this._sheetEditingIndex];
            this._items[this._sheetEditingIndex] = {
                _stockUnitId:    orig._stockUnitId,
                _originalStatus: orig._originalStatus,
                ...itemData,
            };
        } else {
            this._items.push(itemData);
        }

        this.closeItemSheet();
        this._renderItemsList();
    },

    // ── Itens do formulário ───────────────────────────────────────────────────

    /**
     * Remove um item da lista.
     * @param {number} index
     */
    removeItem(index) {
        if (this._sheetEditingIndex === index) this.closeItemSheet();
        this._items.splice(index, 1);
        this._renderItemsList();
    },

    _getNextItemCode() {
        if (!this._items.length) return 1;
        const max = this._items.reduce((m, item) => {
            const c = Number.parseInt(item.code, 10);
            return Number.isInteger(c) ? Math.max(m, c) : m;
        }, 0);
        return max + 1;
    },

    _renderItemsList() {
        const list    = document.getElementById('rcpItemList');
        const totalEl = document.getElementById('rcpTotal');
        const qtyEl   = document.getElementById('rcpTotalQty');

        if (!this._items.length) {
            list.innerHTML = '<li class="rcp-form-empty">Nenhum item adicionado.</li>';
            if (totalEl) totalEl.style.display = 'none';
            return;
        }

        list.innerHTML = this._items.map((item, i) => {
            const isLot  = item.tracking_mode === 'lots';
            const lotNum = isLot ? '#' + String(item.code).padStart(3, '0') : '';
            return `
            <li class="rcp-item-card" onclick="MobApp.openItemSheet(${i})" role="button">
                ${isLot ? `
                <div class="rcp-item-card-lot" aria-label="Lote ${_esc(lotNum)}">
                    <span class="rcp-item-card-lot-num">${_esc(lotNum)}</span>
                </div>
                ` : ''}
                <div class="rcp-item-card-info">
                    <div class="rcp-item-card-name">${_esc(item.materialLabel)}</div>
                    ${item.operatorLabel ? `<span class="rcp-item-card-op-badge">${_esc(item.operatorLabel)}</span>` : ''}
                </div>
                <span class="rcp-item-card-qty">${_esc(_formatQuantityLabel(item.quantity))}</span>
                <button class="rcp-item-card-remove"
                        onclick="event.stopPropagation(); MobApp.removeItem(${i})"
                        aria-label="Remover item">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </li>`;
        }).join('');

        const total = this._items.reduce((s, it) => s + it.quantity, 0);
        if (qtyEl) qtyEl.textContent = _formatQuantityLabel(total);
        if (totalEl) totalEl.style.display = '';
    },

    // ── Salvar ────────────────────────────────────────────────────────────────

    async saveReceipt() {
        const nature      = this._receiptNature;
        const date        = document.getElementById('rcpDate').value;
        const supplier    = document.getElementById('rcpSupplier').value;
        const orderVal    = document.getElementById('rcpOrder').value;
        const order_id    = orderVal ? parseInt(orderVal, 10) : null;
        const locationVal = document.getElementById('rcpLocation')?.value;
        const location_id = locationVal ? Number(locationVal) : undefined;

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

        const saveBtn = document.getElementById('rcpSaveBtn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando...'; }

        try {
            if (this._editingReceipt) {
                await this._updateExistingReceipt(nature, date, supplier, order_id, location_id);
            } else {
                await this._createNewReceipt(nature, date, supplier, order_id, location_id);
            }
            this._toast(
                this._editingReceipt ? 'Recebimento atualizado!' : 'Recebimento salvo!',
                'success'
            );
            this.showScreen('list');
        } catch (e) {
            // Erro de confirmação cancelada pelo usuário não exibe toast
            if (e.message !== '_user_cancel') {
                this._toast('Erro ao salvar recebimento', 'error');
            }
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = this._editingReceipt
                    ? 'Atualizar Recebimento'
                    : 'Salvar Recebimento';
            }
        }
    },

    async _createNewReceipt(nature, date, supplier, order_id, location_id) {
        const receipt = await apiCall(API + '/receipts', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ nature, date, supplier: supplier || null, order_id }),
        });
        const receiptId = receipt && receipt.id;
        if (!receiptId) throw new Error('ID do recebimento não retornado');

        for (const item of this._items) {
            await this._saveReceiptItem(item, receiptId, supplier, date, location_id);
        }
    },

    async _updateExistingReceipt(nature, date, supplier, order_id, location_id) {
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

        const deletedItems  = this._originalItems.filter(orig =>
            !this._items.some(cur => cur._stockUnitId === orig._stockUnitId)
        );
        const newItems      = this._items.filter(cur => !cur._stockUnitId);
        const modifiedItems = this._items.filter(cur => {
            if (!cur._stockUnitId) return false;
            const orig = this._originalItems.find(o => o._stockUnitId === cur._stockUnitId);
            if (!orig) return false;
            return cur.code !== orig.code || cur.material !== orig.material ||
                   cur.quantity !== orig.quantity || cur.operator !== orig.operator;
        });

        // Confirmação para itens com baixa afetados
        const loweredDeleted  = deletedItems.filter(i  => i._originalStatus === 'OUT_STOCK');
        const loweredModified = modifiedItems.filter(i => i._originalStatus === 'OUT_STOCK');

        if (loweredDeleted.length || loweredModified.length) {
            let bodyHTML = '';
            if (loweredDeleted.length) {
                bodyHTML += `<p class="mob-confirm-section-label">Itens deletados com baixa:</p>
                    <ul>${loweredDeleted.map(i =>
                        `<li>Código ${_esc(String(i.code))} — ${_esc(i.material)}</li>`
                    ).join('')}</ul>`;
            }
            if (loweredModified.length) {
                bodyHTML += `<p class="mob-confirm-section-label">Itens editados com baixa:</p>
                    <ul>${loweredModified.map(i =>
                        `<li>Código ${_esc(String(i.code))} — ${_esc(i.material)}</li>`
                    ).join('')}</ul>`;
            }
            const ok = await MobApp._mobConfirm('Atenção: itens com baixa serão afetados', bodyHTML);
            if (!ok) { const e = new Error('_user_cancel'); throw e; }
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
        for (const item of newItems) {
            await this._saveReceiptItem(item, this._editingReceipt.id, supplier, date, location_id);
        }
    },

    // ── Reset ─────────────────────────────────────────────────────────────────

    _resetReceiptForm() {
        this._items             = [];
        this._originalItems     = [];
        this._receiptNature     = '';
        this._sheetEditingIndex = null;

        // Limpar segmented control
        ['C', 'S', 'P'].forEach(n => {
            const btn = document.getElementById('rcpNature' + n);
            if (btn) btn.classList.remove('rcp-segmented-btn--active');
        });

        // Limpar campos
        const dateEl = document.getElementById('rcpDate');
        if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
        const supplierEl = document.getElementById('rcpSupplier');
        if (supplierEl) supplierEl.value = '';
        const orderEl = document.getElementById('rcpOrder');
        if (orderEl) orderEl.innerHTML = '<option value="">Sem pedido</option>';

        // Ocultar campos condicionais
        const fs = document.getElementById('rcpFieldSupplier');
        const fo = document.getElementById('rcpFieldOrder');
        if (fs) fs.style.display = 'none';
        if (fo) fo.style.display = 'none';

        // Localização: popular e auto-selecionar se única
        this._initLocationField();

        // Lista de itens
        this._renderItemsList();

        // Fechar sheet se aberto
        this.closeItemSheet();
    },

    /**
     * Popula o select de localização.
     * Se o usuário tiver apenas uma localização disponível, auto-seleciona e oculta o campo.
     */
    async _initLocationField() {
        const fieldLoc = document.getElementById('rcpFieldLocation');
        const locEl    = document.getElementById('rcpLocation');
        if (!fieldLoc || !locEl) return;

        try {
            const locations = await apiCall(API + '/locations');
            const filtered  = filterUserLocations(locations || []);

            locEl.innerHTML = '<option value="">Selecione...</option>'
                + filtered.map(l => `<option value="${l.id}">${_esc(l.name)}</option>`).join('');

            // Se o home está filtrado por uma localização específica (não "Todas"),
            // usa essa localização e oculta o campo.
            const homeLocId = this.HomeScreen && this.HomeScreen._selectedLocationId;
            if (homeLocId) {
                locEl.value = String(homeLocId);
                fieldLoc.style.display = 'none';
                return;
            }

            // Sem filtro de localização no home ("Todas"):
            // se só há uma localização disponível, auto-seleciona e oculta.
            if (filtered.length === 1) {
                locEl.value = String(filtered[0].id);
                fieldLoc.style.display = 'none';
            } else if (filtered.length > 1) {
                fieldLoc.style.display = '';
            } else {
                fieldLoc.style.display = 'none';
            }
        } catch {
            fieldLoc.style.display = 'none';
        }
    },

    // ── Guard de navegação ────────────────────────────────────────────────────

    /**
     * Retorna true se o formulário tem alterações não salvas.
     */
    _hasUnsavedChanges() {
        if (!this._editingReceipt && this._items.length > 0) return true;
        if (this._editingReceipt) {
            if (this._items.length !== this._originalItems.length) return true;
            if (this._items.some(cur => {
                const orig = this._originalItems.find(o => o._stockUnitId === cur._stockUnitId);
                if (!orig) return true;
                return cur.code !== orig.code || cur.material !== orig.material ||
                       cur.quantity !== orig.quantity || cur.operator !== orig.operator;
            })) return true;
        }
        return false;
    },

    // ── Utilitários ───────────────────────────────────────────────────────────

    /**
     * Retorna o tracking_mode de um material pelo nome.
     * @param {string} name
     * @returns {'lots'|'simple'}
     */
    _getMobMaterialTrackingMode(name) {
        const mat = (this._materialsCache || []).find(m => m.name === name);
        return mat?.tracking_mode || 'simple';
    },

    /**
     * Persiste um item de recebimento:
     * lots → POST /stock-units; simple → POST /stock-movements/entry.
     */
    async _saveReceiptItem(item, receiptId, supplier, date, location_id) {
        if (item.tracking_mode === 'simple') {
            const mat = (this._materialsCache || []).find(m => m.name === item.material);
            if (!mat) { console.error('Material não encontrado no cache:', item.material); return; }
            await apiCall(API + '/stock-movements/entry', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    material_id: mat.id,
                    quantity:    Number(item.quantity),
                    date,
                    receipt_id:  receiptId,
                    operator:    item.operator || null,
                    reason:      'purchase',
                    location_id: location_id || null,
                }),
            });
        } else {
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
                    location_id,
                }),
            });
        }
    },
});
