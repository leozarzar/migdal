/**
 * @file multi-select.js
 * @description Componente de seleção múltipla com chips e dropdown via portal.
 * Segue o mesmo padrão visual de createSelect.
 *
 * Cada item deve ter:
 *   { value: any, chipLabel: string, rowText: string }
 *
 * @example
 * const ms = createMultiSelect({
 *     placeholder: 'Selecione recebimentos...',
 *     onChange: ids => console.log(ids),
 * });
 * ms.mount(document.getElementById('pifReceiptsMount'));
 * ms.setItems(receipts.map(r => ({
 *     value: r.id,
 *     chipLabel: r.code,
 *     rowText: `#${r.id} · ${r.date} · ${r.total_weight} kg`,
 * })));
 *
 * @param {object}   opts
 * @param {string}   [opts.placeholder='Selecionar...'] - Texto quando sem seleção
 * @param {Function} [opts.onChange]                    - Callback com array de values selecionados
 *
 * @returns {{ el, mount, setItems, getValues, clear, destroy }}
 */
function createMultiSelect(opts = {}) {
    const { placeholder = 'Selecionar...', onChange = null } = opts;

    let _items    = [];       // { value, chipLabel, rowText }
    let _selected = [];       // array de values (preserva ordem de seleção)
    let _open     = false;
    let _disabled = false;

    // ── Build DOM ────────────────────────────────────────────────────────────

    const el = document.createElement('div');
    el.className = 'wcm-msel';

    const _trigger = document.createElement('div');
    _trigger.className = 'wcm-msel-trigger';
    _trigger.setAttribute('role', 'combobox');
    _trigger.setAttribute('tabindex', '0');
    _trigger.setAttribute('aria-haspopup', 'listbox');
    _trigger.setAttribute('aria-expanded', 'false');

    const _contentEl = document.createElement('div');
    _contentEl.className = 'wcm-msel-content';

    const _chevronEl = document.createElement('span');
    _chevronEl.className = 'wcm-msel-chevron';
    _chevronEl.innerHTML =
        '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
        ' stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="6 9 12 15 18 9"></polyline></svg>';

    _trigger.appendChild(_contentEl);
    _trigger.appendChild(_chevronEl);
    el.appendChild(_trigger);

    // Portal dropdown (montado no body)
    let _dropdownEl   = null;
    let _outsideClean = null;

    // ── Trigger Render ───────────────────────────────────────────────────────

    function _renderTrigger() {
        _contentEl.innerHTML = '';
        if (_selected.length === 0) {
            const ph = document.createElement('span');
            ph.className = 'wcm-msel-placeholder';
            ph.textContent = placeholder;
            _contentEl.appendChild(ph);
        } else {
            _selected.forEach(v => {
                const item = _items.find(i => String(i.value) === String(v));
                if (!item) return;
                const chip = document.createElement('span');
                chip.className = 'wcm-msel-chip';
                chip.innerHTML =
                    `<span class="wcm-msel-chip-label">${_esc(item.chipLabel)}</span>` +
                    `<button type="button" class="wcm-msel-chip-remove" aria-label="Remover ${_esc(item.chipLabel)}" data-value="${_esc(String(v))}">` +
                    `<span class="material-symbols-outlined">close</span></button>`;
                chip.querySelector('.wcm-msel-chip-remove').addEventListener('mousedown', e => {
                    e.stopPropagation();
                    e.preventDefault();
                    _deselect(v);
                });
                _contentEl.appendChild(chip);
            });
        }
    }

    // ── Dropdown ─────────────────────────────────────────────────────────────

    function _openDropdown() {
        if (_open) return;
        _open = true;
        _trigger.setAttribute('aria-expanded', 'true');
        _trigger.classList.add('wcm-msel-trigger--open');

        _dropdownEl = document.createElement('div');
        _dropdownEl.className = 'wcm-msel-dropdown';
        document.body.appendChild(_dropdownEl);
        _renderList();
        _positionDropdown();

        _outsideClean = e => {
            if (!el.contains(e.target) && !_dropdownEl?.contains(e.target)) {
                _closeDropdown();
            }
        };
        document.addEventListener('mousedown', _outsideClean, true);
        window.addEventListener('scroll', _positionDropdown, { passive: true });
        window.addEventListener('resize', _positionDropdown);
    }

    function _closeDropdown() {
        if (!_open) return;
        _open = false;
        _trigger.setAttribute('aria-expanded', 'false');
        _trigger.classList.remove('wcm-msel-trigger--open');
        _dropdownEl?.remove();
        _dropdownEl = null;
        if (_outsideClean) {
            document.removeEventListener('mousedown', _outsideClean, true);
            _outsideClean = null;
        }
        window.removeEventListener('scroll', _positionDropdown);
        window.removeEventListener('resize', _positionDropdown);
    }

    function _positionDropdown() {
        if (!_dropdownEl) return;
        const rect      = _trigger.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const spaceBelow = viewportH - rect.bottom - 8;
        const spaceAbove = rect.top - 8;

        let top;
        if (spaceBelow >= 150 || spaceBelow >= spaceAbove) {
            top = rect.bottom + window.scrollY + 4;
        } else {
            top = rect.top + window.scrollY - 4 - Math.min(260, spaceAbove);
        }
        _dropdownEl.style.position = 'absolute';
        _dropdownEl.style.top      = top + 'px';
        _dropdownEl.style.left     = (rect.left + window.scrollX) + 'px';
        _dropdownEl.style.width    = Math.max(rect.width, 240) + 'px';
        _dropdownEl.style.zIndex   = '9999';
    }

    function _renderList() {
        if (!_dropdownEl) return;
        _dropdownEl.innerHTML = '';
        if (_items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'wcm-msel-empty';
            empty.textContent = 'Nenhum item disponível.';
            _dropdownEl.appendChild(empty);
            return;
        }
        _items.forEach(item => {
            const isSelected = _selected.some(v => String(v) === String(item.value));
            const row = document.createElement('div');
            row.className = 'wcm-msel-option' + (isSelected ? ' wcm-msel-option--selected' : '');
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', String(isSelected));

            const cb = document.createElement('input');
            cb.type      = 'checkbox';
            cb.className = 'wcm-msel-option-cb';
            cb.checked   = isSelected;
            cb.tabIndex  = -1;
            cb.setAttribute('aria-hidden', 'true');

            const text = document.createElement('span');
            text.className = 'wcm-msel-option-text';
            if (item.rowHtml) text.innerHTML = item.rowHtml;
            else              text.textContent = item.rowText || '';

            row.appendChild(cb);
            row.appendChild(text);
            row.addEventListener('click', () => _toggleItem(item.value));
            _dropdownEl.appendChild(row);
        });
    }

    // ── Selection ────────────────────────────────────────────────────────────

    function _toggleItem(value) {
        const strVal = String(value);
        const idx = _selected.findIndex(v => String(v) === strVal);
        if (idx !== -1) {
            _selected.splice(idx, 1);
        } else {
            const item = _items.find(i => String(i.value) === strVal);
            if (item) _selected.push(item.value);
        }
        _renderTrigger();
        if (_open) _renderList();
        if (onChange) onChange([..._selected]);
    }

    function _deselect(value) {
        _selected = _selected.filter(v => String(v) !== String(value));
        _renderTrigger();
        if (_open) _renderList();
        if (onChange) onChange([..._selected]);
    }

    // ── Eventos ──────────────────────────────────────────────────────────────

    _trigger.addEventListener('mousedown', e => {
        // Previne blur quando clica no trigger mas não em chip
        if (!e.target.closest('.wcm-msel-chip')) e.preventDefault();
    });

    _trigger.addEventListener('click', e => {
        if (_disabled) return;
        if (e.target.closest('.wcm-msel-chip-remove')) return;
        if (_open) _closeDropdown();
        else _openDropdown();
    });

    _trigger.addEventListener('keydown', e => {
        if (_disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (_open) _closeDropdown(); else _openDropdown();
        }
        if (e.key === 'Escape' && _open) _closeDropdown();
    });

    // ── API Pública ──────────────────────────────────────────────────────────

    /**
     * Define os itens disponíveis no dropdown.
     * @param {Array<{value, chipLabel, rowText}>} newItems
     */
    function setItems(newItems) {
        _items    = newItems || [];
        _selected = _selected.filter(v => _items.some(i => String(i.value) === String(v)));
        _renderTrigger();
        if (_open) _renderList();
    }

    /** Retorna array com os values selecionados. */
    function getValues() {
        return [..._selected];
    }

    /** Habilita/desabilita o componente. */
    function setDisabled(flag) {
        _disabled = !!flag;
        _trigger.classList.toggle('wcm-msel-trigger--disabled', _disabled);
        _trigger.setAttribute('aria-disabled', String(_disabled));
        _trigger.tabIndex = _disabled ? -1 : 0;
        if (_disabled && _open) _closeDropdown();
    }

    /** Define a seleção (substitui qualquer seleção anterior). */
    function setValues(values) {
        const next = (values || [])
            .map(v => _items.find(i => String(i.value) === String(v)))
            .filter(Boolean)
            .map(i => i.value);
        _selected = next;
        _renderTrigger();
        if (_open) _renderList();
    }

    /** Limpa a seleção. */
    function clear() {
        _selected = [];
        _renderTrigger();
        if (_open) _renderList();
    }

    /** Monta o componente em um elemento container. */
    function mount(container) {
        if (container) container.appendChild(el);
    }

    /** Destrói o componente e remove do DOM. */
    function destroy() {
        _closeDropdown();
        el.remove();
    }

    _renderTrigger();
    return { el, mount, setItems, setValues, getValues, clear, setDisabled, destroy };
}
