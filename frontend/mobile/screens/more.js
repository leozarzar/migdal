/**
 * @file mobile/screens/more.js
 * @description Tela "Mais" — grade de atalhos para funcionalidades secundárias
 *   com modo de edição (reordenar) persistido em localStorage.
 *
 * Estende MobApp com o sub-objeto MoreScreen.
 */

const MORE_LS_ORDER = 'wcm.mobile.more.order';

Object.assign(MobApp, {

    MoreScreen: {

        _editing: false,

        // Catálogo padrão de funcionalidades (id estável + label + ícone + ação)
        _items: [
            { id: 'orders',     label: 'Pedidos',       icon: 'shopping_cart',   action: () => MobApp.showScreen('orders') },
            { id: 'invoices',   label: 'Faturas',       icon: 'receipt_long',    action: () => MobApp._toast('Faturas — em breve') },
            { id: 'movements',  label: 'Movimentações', icon: 'swap_horiz',      action: () => MobApp._toast('Movimentações — em breve') },
            { id: 'kpi',        label: 'Indicadores',   icon: 'insights',        action: () => MobApp._toast('Indicadores — em breve') },
            { id: 'registry',   label: 'Cadastros',     icon: 'list_alt',        action: () => MobApp._toast('Cadastros — em breve') },
            { id: 'consumption',label: 'Consumo',       icon: 'local_fire_department', action: () => MobApp._toast('Consumo — em breve') },
            { id: 'monitor',    label: 'Monitor',       icon: 'monitoring',      action: () => MobApp._toast('Monitor — em breve') },
            { id: 'settings',   label: 'Configurações', icon: 'settings',        action: () => MobApp._toast('Configurações — em breve') },
            { id: 'help',       label: 'Ajuda',         icon: 'help',            action: () => MobApp._toast('Central de ajuda — em breve') },
        ],

        load() {
            this._editing = false;
            this._renderGrid();
            const btn = document.getElementById('mobMoreEditBtn');
            if (btn) btn.classList.remove('mob-more-edit-btn--active');
            const hint = document.getElementById('mobMoreHint');
            if (hint) hint.textContent = 'Atalhos rápidos para outras funcionalidades.';
        },

        _orderedItems() {
            let order = [];
            try { order = JSON.parse(localStorage.getItem(MORE_LS_ORDER) || '[]') || []; }
            catch { order = []; }

            const byId = Object.fromEntries(this._items.map(i => [i.id, i]));
            const seen = new Set();
            const result = [];
            order.forEach(id => {
                if (byId[id] && !seen.has(id)) { result.push(byId[id]); seen.add(id); }
            });
            this._items.forEach(i => { if (!seen.has(i.id)) result.push(i); });
            return result;
        },

        _saveOrder(items) {
            try {
                localStorage.setItem(MORE_LS_ORDER, JSON.stringify(items.map(i => i.id)));
            } catch { /* ignora */ }
        },

        _renderGrid() {
            const grid = document.getElementById('mobMoreGrid');
            if (!grid) return;
            const items = this._orderedItems();

            grid.classList.toggle('mob-more-grid--editing', this._editing);

            grid.innerHTML = items.map((it, idx) => {
                const upDisabled   = idx === 0 ? 'disabled' : '';
                const downDisabled = idx === items.length - 1 ? 'disabled' : '';
                return `
                <button type="button" class="mob-more-tile" data-id="${_esc(it.id)}" data-idx="${idx}">
                    <span class="mob-more-tile-icon"><span class="material-symbols-outlined">${_esc(it.icon)}</span></span>
                    <span class="mob-more-tile-label">${_esc(it.label)}</span>
                    <span class="mob-more-tile-arrows">
                        <button type="button" class="mob-more-tile-arrow" data-dir="up" ${upDisabled} aria-label="Mover para cima">
                            <span class="material-symbols-outlined">keyboard_arrow_up</span>
                        </button>
                        <button type="button" class="mob-more-tile-arrow" data-dir="down" ${downDisabled} aria-label="Mover para baixo">
                            <span class="material-symbols-outlined">keyboard_arrow_down</span>
                        </button>
                    </span>
                </button>`;
            }).join('');

            grid.querySelectorAll('.mob-more-tile').forEach((el) => {
                el.addEventListener('click', (e) => {
                    const arrowBtn = e.target.closest('.mob-more-tile-arrow');
                    if (arrowBtn) {
                        e.stopPropagation();
                        e.preventDefault();
                        const dir = arrowBtn.dataset.dir;
                        const idx = Number(el.dataset.idx);
                        this._move(idx, dir);
                        return;
                    }
                    if (this._editing) return;
                    const id = el.dataset.id;
                    const item = this._items.find(i => i.id === id);
                    if (item && typeof item.action === 'function') item.action();
                });
            });
        },

        _move(idx, dir) {
            const items = this._orderedItems();
            const target = dir === 'up' ? idx - 1 : idx + 1;
            if (target < 0 || target >= items.length) return;
            const [moved] = items.splice(idx, 1);
            items.splice(target, 0, moved);
            this._saveOrder(items);
            this._renderGrid();
        },

        toggleEdit() {
            this._editing = !this._editing;
            const btn  = document.getElementById('mobMoreEditBtn');
            const hint = document.getElementById('mobMoreHint');
            if (btn) {
                btn.classList.toggle('mob-more-edit-btn--active', this._editing);
                btn.querySelector('.material-symbols-outlined').textContent = this._editing ? 'check' : 'edit';
                btn.setAttribute('aria-label', this._editing ? 'Concluir' : 'Reordenar');
            }
            if (hint) {
                hint.textContent = this._editing
                    ? 'Use as setas para reordenar. Toque no ✓ para concluir.'
                    : 'Atalhos rápidos para outras funcionalidades.';
            }
            this._renderGrid();
        },
    },
});
