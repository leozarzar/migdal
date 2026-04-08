/**
 * @file search-select.js
 * @description Componente de seleção customizado com campo de busca e suporte a
 *   múltiplas seções de itens (ex: Materiais + Grupos, Fornecedores + Tipos…).
 *
 * Parâmetros de configuração:
 *   - `searchable`  — exibe ou oculta o campo de busca.
 *   - `sections`    — uma ou mais listas nomeadas de itens.
 *   - `multiple`    — habilita seleção múltipla com chips no trigger.
 *
 * @example
 * const sel = createSearchSelect({
 *     id:          'mySel',
 *     placeholder: 'Selecione um item',
 *     searchable:  true,
 *     multiple:    false,
 *     sections: [
 *         { key: 'fruit',    label: 'Frutas',   items: [] },
 *         { key: 'vegetable', label: 'Legumes', items: [] }
 *     ],
 *     onChange: ({ key, value, label, item }) => {
 *         console.log('Selecionado:', key, value, label);
 *     }
 * });
 *
 * sel.mount(document.getElementById('myContainer'));
 * sel.setItems('fruit', [
 *     { value: 1, label: 'Maçã' },
 *     { value: 2, label: 'Banana', badge: '<span class="sselect-badge sselect-badge--green">novo</span>' }
 * ]);
 */

/**
 * Cria uma instância do componente SearchSelect.
 *
 * @param {object}   config
 * @param {string}   config.id                              — Prefixo único para IDs DOM (sem espaços).
 * @param {string}   [config.placeholder='Selecione...']   — Texto do placeholder.
 * @param {boolean}  [config.searchable=true]              — Exibir campo de busca.
 * @param {boolean}  [config.multiple=false]               — Habilitar seleção múltipla.
 * @param {string}   [config.searchPlaceholder='Buscar...'] — Placeholder do campo de busca.
 * @param {Array<SectionConfig>} config.sections           — Definição das seções de itens.
 * @param {function} config.onChange                       — Callback disparado em mudanças de seleção.
 *   - Single: recebe `{ key, value, label, item }`
 *   - Multiple: recebe `{ multiple: true, values: [], changed: {...}, action: 'add'|'remove' }`
 *
 * @typedef {object} SectionConfig
 * @property {string}            key     — Chave identificadora da seção.
 * @property {string}            [label] — Cabeçalho visível da seção (omitir = sem header).
 * @property {Array<ItemConfig>} [items=[]] — Itens iniciais da seção.
 *
 * @typedef {object} ItemConfig
 * @property {*}      value  — Valor único do item (passado ao onChange).
 * @property {string} label  — Texto exibido na lista e no trigger.
 * @property {string} [badge] — HTML opcional de um badge exibido antes do label.
 *
 * @returns {{ mount, setItems, getValue, getValues, clear, destroy }}
 */
function createSearchSelect(config) {

    // ══ Estado interno ══════════════════════════════════════════════════════

    let _selectedKey   = null;
    let _selectedValue = null;
    let _selectedItems = [];
    let _sections      = (config.sections || []).map(s => ({ ...s, items: [...(s.items || [])] }));
    let _outsideClickHandler = null;

    const _id       = config.id;
    const _searchable = config.searchable !== false;
    const _multiple = config.multiple === true;

    // ══ Utilitários ══════════════════════════════════════════════════════════

    /**
     * Escapa caracteres HTML especiais para prevenir XSS.
     * @param {*} value
     * @returns {string}
     */
    function _esc(value) {
        return String(value)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    }

    /**
     * Constrói um ID DOM prefixado pelo id do componente.
     * @param {string} suffix
     * @returns {string}
     */
    function _domId(suffix) {
        return `${_id}-${suffix}`;
    }

    /**
     * Filtra as seções com base no texto de busca.
     * @param {string} query
     * @returns {Array<SectionConfig>}
     */
    function _filterSections(query) {
        if (!query) return _sections;
        const q = query.toLowerCase();
        return _sections.map(s => ({
            ...s,
            items: (s.items || []).filter(i => i.label.toLowerCase().includes(q))
        }));
    }

    /**
     * Verifica se um item está selecionado (modo múltiplo).
     * @param {string} sectionKey
     * @param {*} value
     * @returns {boolean}
     */
    function _isSelectedMulti(sectionKey, value) {
        return _selectedItems.some(s => s.key === sectionKey && String(s.value) === String(value));
    }

    /**
     * Atualiza o conteúdo visual do trigger.
     * - Single: label textual única
     * - Multiple: chips dos itens selecionados
     */
    function _renderTriggerSelection() {
        const labelEl = document.getElementById(_domId('label'));
        if (!labelEl) return;

        if (!_multiple) {
            const selected = getValue();
            if (!selected) {
                labelEl.textContent = config.placeholder || 'Selecione...';
                labelEl.className = 'sselect-trigger-label sselect-placeholder';
                return;
            }
            labelEl.innerHTML = (selected.item.badge || '') + _esc(selected.label);
            labelEl.className = 'sselect-trigger-label';
            return;
        }

        if (!_selectedItems.length) {
            labelEl.innerHTML = `<span class="sselect-placeholder">${_esc(config.placeholder || 'Selecione...')}</span>`;
            labelEl.className = 'sselect-trigger-tags';
            return;
        }

        const chips = _selectedItems.map(selected => {
            const dot = selected.item.dotColor
                ? `<span class="sselect-tag-dot" style="background:${_esc(selected.item.dotColor)}"></span>`
                : '';
            const badge = selected.item.badge || '';
            return `<span class="sselect-tag">
                ${dot}
                ${badge}${_esc(selected.label)}
                <button type="button" class="sselect-tag-remove" data-section-key="${_esc(selected.key)}" data-value="${_esc(String(selected.value))}" aria-label="Remover ${_esc(selected.label)}">×</button>
            </span>`;
        }).join('');

        labelEl.innerHTML = chips;
        labelEl.className = 'sselect-trigger-tags';

        labelEl.querySelectorAll('.sselect-tag-remove').forEach(btn => {
            btn.onclick = (event) => {
                event.stopPropagation();
                const sectionKey = btn.getAttribute('data-section-key');
                const value = btn.getAttribute('data-value');
                _selectedItems = _selectedItems.filter(s => !(s.key === sectionKey && String(s.value) === String(value)));
                _renderTriggerSelection();
                _renderList(_sections);
                if (config.onChange) {
                    config.onChange({ multiple: true, values: getValues(), action: 'remove' });
                }
            };
        });
    }

    // ══ Renderização ════════════════════════════════════════════════════════

    /**
     * Retorna a string HTML do componente.
     * Útil para embutir o componente em templates de tela via `innerHTML`.
     * @returns {string}
     */
    function renderHTML() {
        const searchRow = _searchable ? `
                <div class="sselect-search-wrap">
                    <span class="material-symbols-outlined sselect-search-icon">search</span>
                    <input type="text" class="sselect-search" id="${_domId('search')}"
                        placeholder="${_esc(config.searchPlaceholder || 'Buscar...')}" autocomplete="off">
                </div>` : '';

        const triggerLabel = _multiple
            ? `<div id="${_domId('label')}" class="sselect-trigger-tags"><span class="sselect-placeholder">${_esc(config.placeholder || 'Selecione...')}</span></div>`
            : `<span id="${_domId('label')}" class="sselect-trigger-label sselect-placeholder">${_esc(config.placeholder || 'Selecione...')}</span>`;

        return `
        <div class="sselect-wrap" id="${_domId('wrap')}">
            <button class="sselect-trigger" id="${_domId('toggle')}" type="button" aria-expanded="false">
                ${triggerLabel}
                <img class="sselect-caret" src="icons/expand.svg" alt="Expandir">
            </button>
            <div class="sselect-dropdown" id="${_domId('dropdown')}">
                ${searchRow}
                <div class="sselect-list" id="${_domId('list')}">
                    <div class="sselect-empty">Carregando...</div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Re-renderiza a lista de opções com as seções fornecidas.
     * Mostra cabeçalhos de seção quando há mais de uma seção com itens,
     * ou quando a seção tem `label` definido e há ao menos uma outra seção.
     * @param {Array<SectionConfig>} sections
     */
    function _renderList(sections) {
        const list = document.getElementById(_domId('list'));
        if (!list) return;

        const populated = sections.filter(s => s.items && s.items.length > 0);

        if (populated.length === 0) {
            list.innerHTML = '<div class="sselect-empty">Nenhum resultado encontrado</div>';
            return;
        }

        // Exibe cabeçalhos somente quando há mais de uma seção visível
        const showHeaders = populated.length > 1;

        let html = '';
        populated.forEach(section => {
            if (showHeaders && section.label) {
                html += `<div class="sselect-section-header">${_esc(section.label)}</div>`;
            }
            section.items.forEach(item => {
                const isSelected = _multiple
                    ? _isSelectedMulti(section.key, item.value)
                    : (_selectedKey === section.key && String(_selectedValue) === String(item.value));
                const badge = item.badge || '';
                const checkbox = _multiple
                    ? `<input type="checkbox" class="sselect-option-checkbox" ${isSelected ? 'checked' : ''} tabindex="-1" aria-hidden="true">`
                    : '';
                html += `<div class="sselect-option${isSelected ? ' sselect-option--selected' : ''}"
                    data-section-key="${_esc(section.key)}"
                    data-value="${_esc(String(item.value))}">${checkbox}${badge}${_esc(item.label)}</div>`;
            });
        });

        list.innerHTML = html;

        list.querySelectorAll('.sselect-option').forEach(opt => {
            opt.onclick = () => _selectOption(opt);
        });
    }

    /**
     * Aplica a seleção a partir de uma opção do DOM.
     * Fecha o dropdown, atualiza o label do trigger e invoca o callback.
     * @param {HTMLElement} opt
     */
    function _selectOption(opt) {
        const sectionKey = opt.getAttribute('data-section-key');
        const rawValue   = opt.getAttribute('data-value');
        const section    = _sections.find(s => s.key === sectionKey);
        const item       = section && section.items.find(i => String(i.value) === rawValue);

        if (!item) return;

        const toggle  = document.getElementById(_domId('toggle'));
        const wrap    = document.getElementById(_domId('wrap'));

        if (_multiple) {
            const exists = _isSelectedMulti(sectionKey, item.value);
            if (exists) {
                _selectedItems = _selectedItems.filter(s => !(s.key === sectionKey && String(s.value) === String(item.value)));
            } else {
                _selectedItems.push({ key: sectionKey, value: item.value, label: item.label, item });
            }

            _renderTriggerSelection();
            _renderList(_sections);

            if (config.onChange) {
                config.onChange({ multiple: true, values: getValues(), changed: { key: sectionKey, value: item.value, label: item.label, item }, action: exists ? 'remove' : 'add' });
            }
            return;
        }

        _selectedKey   = sectionKey;
        _selectedValue = rawValue;
        _renderTriggerSelection();

        // Fecha o dropdown no modo single
        if (wrap)   wrap.classList.remove('open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');

        // Re-renderiza para atualizar o estado "selecionado" na lista
        _renderList(_sections);

        if (config.onChange) {
            config.onChange({ key: sectionKey, value: item.value, label: item.label, item });
        }
    }

    // ══ Eventos ═════════════════════════════════════════════════════════════

    /**
     * Associa os eventos de abrir/fechar, busca e clique fora do componente.
     */
    function _bindEvents() {
        const wrap   = document.getElementById(_domId('wrap'));
        const toggle = document.getElementById(_domId('toggle'));
        const search = document.getElementById(_domId('search'));

        if (toggle) {
            toggle.onclick = () => {
                if (!wrap) return;
                const isOpen = wrap.classList.toggle('open');
                toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                if (isOpen) {
                    // Limpa busca e focaliza ao abrir
                    if (search) search.value = '';
                    _renderList(_sections);
                    if (search) setTimeout(() => search.focus(), 0);
                }
            };
        }

        if (search) {
            search.oninput = () => {
                _renderList(_filterSections(search.value.trim()));
            };
        }

        // Remove listener anterior antes de registrar o novo (re-mount)
        if (_outsideClickHandler) {
            document.removeEventListener('click', _outsideClickHandler);
        }
        _outsideClickHandler = (e) => {
            if (!wrap || wrap.contains(e.target)) return;
            wrap.classList.remove('open');
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
        };
        document.addEventListener('click', _outsideClickHandler);
    }

    // ══ API pública ══════════════════════════════════════════════════════════

    /**
     * Monta o componente dentro de um elemento container.
     * Gera o HTML e associa os eventos.
     * @param {HTMLElement} containerElement — Elemento que será o pai do componente.
     */
    function mount(containerElement) {
        containerElement.innerHTML = renderHTML();
        _bindEvents();
        _renderTriggerSelection();
    }

    /**
     * Substitui os itens de uma seção e re-renderiza a lista.
     * @param {string}             sectionKey — Chave da seção (config.sections[].key).
     * @param {Array<ItemConfig>}  items      — Novos itens da seção.
     */
    function setItems(sectionKey, items) {
        const section = _sections.find(s => s.key === sectionKey);
        if (section) section.items = items;

        if (_multiple) {
            const allItems = _sections.flatMap(s => (s.items || []).map(i => ({ key: s.key, value: i.value, label: i.label, item: i })));
            _selectedItems = _selectedItems.filter(sel => allItems.some(i => i.key === sel.key && String(i.value) === String(sel.value)));
        } else if (_selectedKey !== null) {
            const selectedSection = _sections.find(s => s.key === _selectedKey);
            const selectedStillExists = selectedSection && selectedSection.items.some(i => String(i.value) === String(_selectedValue));
            if (!selectedStillExists) {
                _selectedKey = null;
                _selectedValue = null;
            }
        }

        _renderTriggerSelection();
        _renderList(_sections);
    }

    /**
     * Retorna a seleção atual, ou `null` se nenhum item estiver selecionado.
     * @returns {{ key: string, value: *, label: string, item: object } | null}
     */
    function getValue() {
        if (_multiple) {
            return getValues();
        }
        if (_selectedKey === null) return null;
        const section = _sections.find(s => s.key === _selectedKey);
        const item    = section && section.items.find(i => String(i.value) === String(_selectedValue));
        return item ? { key: _selectedKey, value: item.value, label: item.label, item } : null;
    }

    /**
     * Retorna todos os itens selecionados no modo múltiplo.
     * Em modo single, retorna array vazio ou com um item.
     * @returns {Array<{ key: string, value: *, label: string, item: object }>}
     */
    function getValues() {
        if (_multiple) return [..._selectedItems];
        const value = getValue();
        return value ? [value] : [];
    }

    /**
     * Limpa a seleção e restaura o texto de placeholder no trigger.
     */
    function clear() {
        _selectedKey   = null;
        _selectedValue = null;
        _selectedItems = [];
        _renderTriggerSelection();
        _renderList(_sections);
    }

    /**
     * Remove os event listeners globais registrados pelo componente.
     * Deve ser chamado antes de desmontar a tela ou recriar o componente.
     */
    function destroy() {
        if (_outsideClickHandler) {
            document.removeEventListener('click', _outsideClickHandler);
            _outsideClickHandler = null;
        }
    }

    /**
     * Seleciona programaticamente um item em modo single sem disparar onChange.
     * @param {string} sectionKey — Chave da seção.
     * @param {*}      value      — Valor do item a selecionar.
     */
    function select(sectionKey, value) {
        if (_multiple) return;
        const section = _sections.find(s => s.key === sectionKey);
        const item = section && section.items.find(i => String(i.value) === String(value));
        if (!item) return;
        _selectedKey   = sectionKey;
        _selectedValue = String(item.value);
        _renderTriggerSelection();
        _renderList(_sections);
    }

    /**
     * Seleciona programaticamente vários itens em modo multiple sem disparar onChange.
     * @param {string}   sectionKey — Chave da seção.
     * @param {Array<*>} values     — Valores a selecionar.
     */
    function setSelectedValues(sectionKey, values) {
        if (!_multiple) return;
        const section = _sections.find(s => s.key === sectionKey);
        if (!section) return;
        const strValues = new Set((values || []).map(String));
        section.items.forEach(item => {
            if (strValues.has(String(item.value))) {
                if (!_selectedItems.some(s => s.key === sectionKey && String(s.value) === String(item.value))) {
                    _selectedItems.push({ key: sectionKey, value: item.value, label: item.label, item });
                }
            }
        });
        _renderTriggerSelection();
        _renderList(_sections);
    }

    return { renderHTML, mount, setItems, getValue, getValues, select, setSelectedValues, clear, destroy };
}
