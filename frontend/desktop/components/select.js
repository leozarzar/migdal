/**
 * @file select.js
 * @description Componente Select com suporte a busca, seleção múltipla, seções e
 *   dropdown via portal (sem risco de clipping por overflow:hidden nos ancestrais).
 *
 * Aceita dois modos de dados:
 *   - `options` — lista plana com agrupamento opcional via `group`
 *   - `sections` — múltiplas seções nomeadas (compatível com o search-select legado)
 *
 * @example
 * // Lista plana (modo simples)
 * const sel = createSelect({
 *     options: [
 *         { value: 1, label: 'Maçã',   group: 'Frutas' },
 *         { value: 2, label: 'Banana', group: 'Frutas' },
 *         { value: 3, label: 'Cenoura' },
 *     ],
 *     placeholder: 'Selecione um item',
 *     searchable: true,
 *     clearable: true,
 *     onChange: value => console.log(value),
 * });
 * sel.mount(document.getElementById('myContainer'));
 * sel.setValue(1);
 *
 * @example
 * // Múltipla seleção
 * const sel = createSelect({
 *     options: [...],
 *     multiple: true,
 *     onChange: values => console.log(values),
 * });
 * sel.setValues([1, 3]);
 *
 * @example
 * // Seções nomeadas (carga lazy)
 * const sel = createSelect({
 *     sections: [
 *         { key: 'materials', label: 'Materiais', items: [] },
 *         { key: 'groups',    label: 'Grupos',    items: [] },
 *     ],
 *     onChange: value => console.log(value),
 * });
 * sel.mount(container);
 * sel.setItems('materials', await fetchMaterials());
 *
 * @param {object}   config
 * @param {Array}    [config.options]                     — Lista plana: [{ value, label, group? }]
 * @param {Array}    [config.sections]                    — Seções: [{ key, label?, items: [{ value, label, badge?, dotColor? }] }]
 * @param {string}   [config.placeholder='Selecionar...'] — Texto de placeholder.
 * @param {boolean}  [config.searchable=false]            — Exibe campo de busca no dropdown.
 * @param {boolean}  [config.multiple=false]              — Habilita seleção múltipla.
 * @param {boolean}  [config.clearable=true]              — Exibe botão para limpar (modo single).
 * @param {string}   [config.noneLabel]                   — Rótulo da opção "nenhum" (modo single).
 * @param {boolean}  [config.disabled=false]              — Estado desabilitado inicial.
 * @param {function} [config.onChange]                    — Callback ao mudar seleção.
 *   Single: recebe `(value | null)`
 *   Multi:  recebe `(values[])`
 *
 * @returns {{ el, mount, setOptions, setItems, getValue, setValue, setValues, clear, setDisabled, destroy }}
 */
function createSelect(config = {}) {

    // ══ Config ═══════════════════════════════════════════════════════════════

    const _placeholder = config.placeholder || 'Selecionar...';
    const _searchable  = config.searchable  === true;
    const _multiple    = config.multiple    === true;
    const _clearable   = config.clearable   !== false;
    const _noneLabel   = config.noneLabel   || null;

    // ══ Estado interno ════════════════════════════════════════════════════════

    let _value    = _multiple ? [] : null;
    let _sections = [];
    let _open     = false;
    let _disabled = config.disabled || false;
    let _query    = '';

    let _dropdownEl        = null;
    let _outsideHandler    = null;
    let _resizeHandler     = null;
    let _scrollHandlers    = [];
    let _windowScrollFn    = null;

    // ══ Inicializa seções ════════════════════════════════════════════════════

    function _buildSectionsFromOptions(options) {
        const grouped = {};
        const order   = [];
        (options || []).forEach(o => {
            const key = o.group || '__default__';
            if (!grouped[key]) { grouped[key] = []; order.push(key); }
            grouped[key].push({ value: o.value, label: o.label, badge: o.badge, dotColor: o.dotColor });
        });
        return order.map(key => ({
            key,
            label: key === '__default__' ? null : key,
            items: grouped[key],
        }));
    }

    if (config.options) {
        _sections = _buildSectionsFromOptions(config.options);
    } else if (config.sections) {
        _sections = config.sections.map(s => ({ ...s, items: [...(s.items || [])] }));
    }

    // ══ Helpers ═══════════════════════════════════════════════════════════════

    function _esc(v) {
        return String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function _findItem(value) {
        for (const s of _sections) {
            const item = s.items.find(i => String(i.value) === String(value));
            if (item) return item;
        }
        return null;
    }

    function _isSelected(value) {
        if (_multiple) return _value.some(v => String(v) === String(value));
        return _value !== null && String(_value) === String(value);
    }

    function _filteredSections() {
        if (!_query) return _sections;
        const q = _query.toLowerCase();
        return _sections.map(s => ({
            ...s,
            items: s.items.filter(i => i.label.toLowerCase().includes(q)),
        }));
    }

    function _pruneInvalidSelections() {
        if (_multiple) {
            const all = new Set(_sections.flatMap(s => s.items.map(i => String(i.value))));
            _value = _value.filter(v => all.has(String(v)));
        } else if (_value !== null) {
            if (!_findItem(_value)) _value = null;
        }
    }

    // ══ DOM ═══════════════════════════════════════════════════════════════════

    const _wrap = document.createElement('div');
    _wrap.className = 'wcm-sel-wrap';

    // Trigger
    const _trigger = document.createElement('button');
    _trigger.type = 'button';
    _trigger.className = 'wcm-sel-trigger';
    _trigger.disabled = _disabled;
    _wrap.appendChild(_trigger);

    // Content area
    const _contentEl = document.createElement('div');
    _contentEl.className = 'wcm-sel-content';
    _trigger.appendChild(_contentEl);

    // Controls (clear + chevron)
    const _controlsEl = document.createElement('div');
    _controlsEl.className = 'wcm-sel-controls';
    _trigger.appendChild(_controlsEl);

    let _clearEl = null;
    if (!_multiple && _clearable) {
        _clearEl = document.createElement('span');
        _clearEl.className = 'wcm-sel-clear';
        _clearEl.setAttribute('role', 'button');
        _clearEl.setAttribute('aria-label', 'Limpar seleção');
        _clearEl.innerHTML = '<span class="material-symbols-outlined">close</span>';
        _clearEl.style.display = 'none';
        _controlsEl.appendChild(_clearEl);
    }

    const _chevronEl = document.createElement('span');
    _chevronEl.className = 'wcm-sel-chevron';
    _chevronEl.innerHTML = '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    _controlsEl.appendChild(_chevronEl);

    // Dropdown (montado no body via portal)
    _dropdownEl = document.createElement('div');
    _dropdownEl.className = 'wcm-sel-dropdown';

    let _searchInputEl = null;
    if (_searchable) {
        const searchWrap = document.createElement('div');
        searchWrap.className = 'wcm-sel-search-wrap';
        const searchIcon = document.createElement('span');
        searchIcon.className = 'wcm-sel-search-icon material-symbols-outlined';
        searchIcon.textContent = 'search';
        searchWrap.appendChild(searchIcon);
        _searchInputEl = document.createElement('input');
        _searchInputEl.type = 'text';
        _searchInputEl.className = 'wcm-sel-search';
        _searchInputEl.placeholder = 'Buscar...';
        _searchInputEl.autocomplete = 'off';
        searchWrap.appendChild(_searchInputEl);
        _dropdownEl.appendChild(searchWrap);
    }

    const _listEl = document.createElement('div');
    _listEl.className = 'wcm-sel-list';
    _dropdownEl.appendChild(_listEl);

    // ══ Render ════════════════════════════════════════════════════════════════

    function _renderTrigger() {
        _contentEl.innerHTML = '';

        if (_multiple) {
            _contentEl.className = 'wcm-sel-content wcm-sel-tags';
            if (_value.length === 0) {
                const ph = document.createElement('span');
                ph.className = 'wcm-sel-placeholder';
                ph.textContent = _placeholder;
                _contentEl.appendChild(ph);
            } else {
                _value.forEach(v => {
                    const item = _findItem(v);
                    if (!item) return;
                    const tag = document.createElement('span');
                    tag.className = 'wcm-sel-tag';
                    tag.innerHTML =
                        _esc(item.label) +
                        `<button type="button" class="wcm-sel-tag-remove" aria-label="Remover ${_esc(item.label)}" data-value="${_esc(String(v))}">` +
                        '<span class="material-symbols-outlined">close</span></button>';
                    _contentEl.appendChild(tag);
                });
            }

            _contentEl.querySelectorAll('.wcm-sel-tag-remove').forEach(btn => {
                btn.addEventListener('mousedown', e => {
                    e.stopPropagation();
                    e.preventDefault();
                    const v = btn.getAttribute('data-value');
                    _value = _value.filter(x => String(x) !== v);
                    _renderTrigger();
                    if (_open) _renderList();
                    if (config.onChange) config.onChange([..._value]);
                });
            });

        } else {
            _contentEl.className = 'wcm-sel-content';
            if (_value === null) {
                const ph = document.createElement('span');
                ph.className = 'wcm-sel-placeholder';
                ph.textContent = _placeholder;
                _contentEl.appendChild(ph);
                if (_clearEl) _clearEl.style.display = 'none';
            } else {
                const item = _findItem(_value);
                const label = document.createElement('span');
                label.className = 'wcm-sel-label';
                label.textContent = item ? item.label : String(_value);
                _contentEl.appendChild(label);
                if (_clearEl) _clearEl.style.display = 'inline-flex';
            }
        }
    }

    function _renderList() {
        _listEl.innerHTML = '';
        const sections  = _filteredSections();
        const populated = sections.filter(s => s.items.length > 0);

        if (!_multiple && _noneLabel) {
            _listEl.appendChild(_makeOptionEl(null, _noneLabel, _value === null));
        }

        if (populated.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'wcm-sel-empty';
            empty.textContent = 'Nenhum resultado';
            _listEl.appendChild(empty);
            return;
        }

        const showHeaders = populated.length > 1 || (populated.length === 1 && populated[0].label);

        populated.forEach(section => {
            if (showHeaders && section.label) {
                const header = document.createElement('div');
                header.className = 'wcm-sel-section-header';
                header.textContent = section.label;
                _listEl.appendChild(header);
            }
            section.items.forEach(item => {
                _listEl.appendChild(_makeOptionEl(item.value, item.label, _isSelected(item.value), item));
            });
        });
    }

    function _makeOptionEl(value, label, selected, item = {}) {
        const el = document.createElement('div');
        el.className = 'wcm-sel-option' + (selected ? ' wcm-sel-option--selected' : '');
        el.addEventListener('click', () => _select(value));

        if (_multiple) {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'wcm-sel-option-checkbox';
            cb.checked = selected;
            cb.tabIndex = -1;
            cb.setAttribute('aria-hidden', 'true');
            el.appendChild(cb);
        }

        const textSpan = document.createElement('span');
        const dot   = item.dotColor ? `<span class="wcm-sel-option-dot" style="background:${_esc(item.dotColor)}"></span>` : '';
        const badge = item.badge    ? item.badge : '';
        textSpan.innerHTML = dot + badge + _esc(label);
        el.appendChild(textSpan);

        if (!_multiple && selected) {
            const check = document.createElement('span');
            check.className = 'wcm-sel-option-check material-symbols-outlined';
            check.textContent = 'check';
            el.appendChild(check);
        }

        return el;
    }

    function _select(value) {
        if (_multiple) {
            if (value === null) return;
            const str    = String(value);
            const exists = _value.some(v => String(v) === str);
            _value = exists ? _value.filter(v => String(v) !== str) : [..._value, value];
            _renderTrigger();
            _renderList();
            if (config.onChange) config.onChange([..._value]);
        } else {
            _value = value;
            _renderTrigger();
            _closeDropdown();
            if (config.onChange) config.onChange(value);
        }
    }

    // ══ Dropdown portal ═══════════════════════════════════════════════════════

    function _positionDropdown() {
        const rect       = _trigger.getBoundingClientRect();
        const viewportH  = window.innerHeight;
        const spaceBelow = viewportH - rect.bottom - 8;
        const spaceAbove = rect.top - 8;

        let top;
        if (spaceBelow >= 150 || spaceBelow >= spaceAbove) {
            top = rect.bottom + 4;
        } else {
            top = rect.top - 4 - Math.min(260, spaceAbove);
        }

        _dropdownEl.style.top   = top + 'px';
        _dropdownEl.style.left  = rect.left + 'px';
        _dropdownEl.style.width = Math.max(rect.width, 200) + 'px';
    }

    function _openDropdown() {
        _open = true;
        _trigger.classList.add('wcm-sel-trigger--open');
        _query = '';
        if (_searchInputEl) _searchInputEl.value = '';

        _dropdownEl.style.position = 'fixed';
        _dropdownEl.style.zIndex   = '9999';
        document.body.appendChild(_dropdownEl);
        _positionDropdown();
        _renderList();

        if (_searchInputEl) setTimeout(() => _searchInputEl.focus(), 0);

        _outsideHandler = e => {
            if (_wrap.contains(e.target) || _dropdownEl.contains(e.target)) return;
            _closeDropdown();
        };
        document.addEventListener('mousedown', _outsideHandler);

        _windowScrollFn = () => _positionDropdown();
        window.addEventListener('scroll', _windowScrollFn, { passive: true });

        _resizeHandler = () => _positionDropdown();
        window.addEventListener('resize', _resizeHandler);

        _scrollHandlers = [];
        let parent = _wrap.parentElement;
        while (parent && parent !== document.body) {
            const fn = () => _positionDropdown();
            parent.addEventListener('scroll', fn, { passive: true });
            _scrollHandlers.push({ el: parent, fn });
            parent = parent.parentElement;
        }
    }

    function _closeDropdown() {
        if (!_open) return;
        _open = false;
        _trigger.classList.remove('wcm-sel-trigger--open');

        if (_dropdownEl.parentNode) _dropdownEl.parentNode.removeChild(_dropdownEl);

        if (_outsideHandler) {
            document.removeEventListener('mousedown', _outsideHandler);
            _outsideHandler = null;
        }
        if (_windowScrollFn) {
            window.removeEventListener('scroll', _windowScrollFn);
            _windowScrollFn = null;
        }
        if (_resizeHandler) {
            window.removeEventListener('resize', _resizeHandler);
            _resizeHandler = null;
        }
        _scrollHandlers.forEach(({ el, fn }) => el.removeEventListener('scroll', fn));
        _scrollHandlers = [];
    }

    // ══ Bind events ═══════════════════════════════════════════════════════════

    _trigger.addEventListener('click', () => {
        if (_disabled) return;
        if (_open) { _closeDropdown(); } else { _openDropdown(); }
    });

    if (_clearEl) {
        _clearEl.addEventListener('mousedown', e => {
            e.stopPropagation();
            e.preventDefault();
            _value = null;
            _renderTrigger();
            if (_open) _renderList();
            if (config.onChange) config.onChange(null);
        });
    }

    if (_searchInputEl) {
        _searchInputEl.addEventListener('input', () => {
            _query = _searchInputEl.value.trim();
            _renderList();
        });
    }

    // ══ Init ══════════════════════════════════════════════════════════════════

    _renderTrigger();

    // ══ API pública ═══════════════════════════════════════════════════════════

    /**
     * Monta o componente dentro de um container.
     * @param {HTMLElement} containerEl
     */
    function mount(containerEl) {
        containerEl.appendChild(_wrap);
    }

    /**
     * Substitui a lista de opções (modo flat).
     * @param {Array<{ value, label, group? }>} options
     */
    function setOptions(options) {
        _sections = _buildSectionsFromOptions(options);
        _pruneInvalidSelections();
        _renderTrigger();
        if (_open) _renderList();
    }

    /**
     * Substitui os itens de uma seção (modo sections / carga lazy).
     * @param {string} sectionKey
     * @param {Array<{ value, label, badge?, dotColor? }>} items
     */
    function setItems(sectionKey, items) {
        const section = _sections.find(s => s.key === sectionKey);
        if (section) {
            section.items = items;
        } else {
            _sections.push({ key: sectionKey, label: sectionKey, items });
        }
        _pruneInvalidSelections();
        _renderTrigger();
        if (_open) _renderList();
    }

    /**
     * Retorna o valor atual.
     * Single: `value | null` — Multi: `value[]`
     */
    function getValue() {
        return _multiple ? [..._value] : _value;
    }

    /**
     * Define o valor programaticamente (modo single).
     * @param {*} value
     */
    function setValue(value) {
        if (_multiple) return;
        _value = value ?? null;
        _renderTrigger();
        if (_open) _renderList();
    }

    /**
     * Define os valores programaticamente (modo múltiplo).
     * @param {Array} values
     */
    function setValues(values) {
        if (!_multiple) return;
        _value = [...(values || [])];
        _renderTrigger();
        if (_open) _renderList();
    }

    /** Limpa a seleção. */
    function clear() {
        _value = _multiple ? [] : null;
        _renderTrigger();
        if (_open) _renderList();
    }

    /**
     * Habilita ou desabilita o componente.
     * @param {boolean} val
     */
    function setDisabled(val) {
        _disabled = val;
        _trigger.disabled = val;
        if (val) {
            _closeDropdown();
            _wrap.classList.add('wcm-sel-disabled');
        } else {
            _wrap.classList.remove('wcm-sel-disabled');
        }
    }

    /** Remove event listeners e o elemento do DOM. */
    function destroy() {
        _closeDropdown();
        _wrap.remove();
    }

    return { el: _wrap, mount, setOptions, setItems, getValue, setValue, setValues, clear, setDisabled, destroy };
}
