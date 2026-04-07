/**
 * @file mobile/screens/stock-details.js
 * @description Tela de detalhes/edição de unidade de estoque do mobile.
 *   Estende MobApp com os métodos de visualização e salvamento.
 *
 * Carregado após mobile/app.js e stock-list.js.
 */

Object.assign(MobApp, {

    // ── Estado ───────────────────────────────────────────────────────────────

    _editingStockUnit: null,

    // ── Tela: Detalhes de Estoque ────────────────────────────────────────────

    openStockUnit(id) {
        const unit = (this._stockUnits || []).find(u => u.id === id);
        if (!unit) return;
        this._editingStockUnit = { ...unit };
        this._previousScreen = 'stock-list';
        this.showScreen('stock-details');
    },

    _renderStockDetails() {
        const u = this._editingStockUnit;
        if (!u) return;

        // Header subtitle shows the code
        const code = this._stockCodeFor(u);
        document.getElementById('mobHeaderSubtitle').textContent    = code;

        document.getElementById('mobStockDetMaterial').textContent  = u.material   || '-';
        document.getElementById('mobStockDetSupplier').textContent  = u.supplier   || '-';
        document.getElementById('mobStockDetWeight').textContent    = u.weight != null ? `${u.weight} kg` : '-';
        document.getElementById('mobStockDetVolumeId').textContent  = u.volume_id  != null ? String(u.volume_id) : '-';
        document.getElementById('mobStockDetOldId').textContent     = u.old_id     || '-';
        document.getElementById('mobStockDetDateIn').textContent    = u.date_in    ? _formatDateLongBr(u.date_in)  : '-';

        document.getElementById('mobStockDetNotes').value           = u.notes || '';
        document.getElementById('mobStockDetDateOut').value         = u.date_out || '';

        const deductionEl = document.getElementById('mobStockDetDeductionType');
        deductionEl.value = u.deduction_type || 'uso';
        document.getElementById('mobStockDetDeductionTypeField').style.display = u.date_out ? '' : 'none';
    },

    onStockDetDateOutChange() {
        const dateOut = document.getElementById('mobStockDetDateOut').value;
        const field   = document.getElementById('mobStockDetDeductionTypeField');
        field.style.display = dateOut ? '' : 'none';
        if (!dateOut) document.getElementById('mobStockDetDeductionType').value = 'uso';
    },

    async saveStockUnit() {
        const u = this._editingStockUnit;
        if (!u) return;

        const date_out       = document.getElementById('mobStockDetDateOut').value.trim() || null;
        const status         = date_out ? 'OUT_STOCK' : 'IN_STOCK';
        const notes          = document.getElementById('mobStockDetNotes').value.trim()   || null;
        const deduction_type = date_out
            ? (document.getElementById('mobStockDetDeductionType').value || 'uso')
            : null;

        try {
            await apiCall(API + '/stock-units/update', {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ id: u.id, status, date_out, notes, deduction_type }),
            });

            // Sincronizar cache
            const idx = (this._stockUnits || []).findIndex(x => x.id === u.id);
            if (idx !== -1) {
                Object.assign(this._stockUnits[idx], { status, date_out, notes, deduction_type });
            }

            this._toast('Unidade atualizada!', 'success');
            this.showScreen('stock-list');
        } catch {
            this._toast('Erro ao salvar', 'error');
        }
    },
});
