/**
 * @file data-table.js
 * @description Tabela genérica com ordenação, seleção por checkbox, paginação e ações por linha.
 *
 * @example
 * const table = createDataTable({
 *     columns: [
 *         { key: 'name', header: 'Nome', sortable: true, render: row => row.name },
 *         { key: 'status', header: 'Status', render: row => `<span class="badge">${row.status}</span>` },
 *     ],
 *     getRowKey: row => row.id,
 *     pageSize: 20,
 *     actions: [
 *         { label: 'Editar', icon: 'edit', onClick: row => editRow(row) },
 *         { label: 'Excluir', icon: 'delete', variant: 'destructive', onClick: row => deleteRow(row) },
 *     ],
 *     onRowClick: row => openDetails(row),
 * });
 *
 * table.mount(document.getElementById('myContainer'));
 * table.setData(myData);
 *
 * @param {object}   config
 * @param {Array}    config.columns                          — Definição das colunas.
 *   Cada coluna: { key, header, width?, sortable?, sortValue?(row), render(row) → string }
 * @param {function} config.getRowKey                        — Retorna chave única de uma linha.
 * @param {Array}    [config.data=[]]                        — Dados iniciais.
 * @param {boolean}  [config.selectable=false]               — Exibe coluna de checkboxes.
 * @param {function} [config.onSelectionChange]              — Callback ao mudar seleção. Recebe array de linhas selecionadas.
 * @param {function} [config.onRowClick]                     — Callback ao clicar numa linha.
 * @param {number}   [config.pageSize]                       — Itens por página. Omitir = sem paginação.
 * @param {Array}    [config.actions=[]]                     — Ações do menu por linha.
 *   Cada ação: { label, icon?, variant?: 'default'|'destructive', onClick(row), hidden?(row) }
 * @param {boolean}  [config.loading=false]                  — Estado inicial de carregamento.
 * @param {string}   [config.emptyMessage]                   — Mensagem de tabela vazia.
 * @param {string}   [config.emptyIcon]                      — Nome do ícone Material Symbols para estado vazio.
 *
 * @returns {{ mount, setData, setLoading, getSelected, clearSelection, destroy }}
 */
function createDataTable(config) {

    // ══ Estado interno ══════════════════════════════════════════════════════

    let _data    = config.data || [];
    let _loading = config.loading || false;
    let _sortKey = '';
    let _sortDir = null; // 'asc' | 'desc' | null
    let _selected = new Set();
    let _page    = 1;

    // ══ Config ══════════════════════════════════════════════════════════════

    const _columns    = config.columns || [];
    const _getRowKey  = config.getRowKey;
    const _selectable = config.selectable || false;
    const _pageSize   = config.pageSize || null;
    const _actions    = config.actions || [];
    const _emptyMsg   = config.emptyMessage || 'Nenhum registro encontrado';
    const _emptyIcon  = config.emptyIcon || 'table_rows';

    let _container = null;
    let _outsideClickHandler = null;

    // ══ Computed ════════════════════════════════════════════════════════════

    function _getSorted() {
        if (!_sortDir || !_sortKey) return _data;
        const col = _columns.find(c => c.key === _sortKey);
        return [..._data].sort((a, b) => {
            const av = col?.sortValue ? col.sortValue(a) : String(a[_sortKey] ?? '');
            const bv = col?.sortValue ? col.sortValue(b) : String(b[_sortKey] ?? '');
            if (av < bv) return _sortDir === 'asc' ? -1 : 1;
            if (av > bv) return _sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }

    function _getPaginated(sorted) {
        if (!_pageSize) return sorted;
        const start = (_page - 1) * _pageSize;
        return sorted.slice(start, start + _pageSize);
    }

    function _getTotalPages(sorted) {
        if (!_pageSize) return 1;
        return Math.max(1, Math.ceil(sorted.length / _pageSize));
    }

    // ══ Renderização ════════════════════════════════════════════════════════

    function _sortIconHTML(colKey, sortable) {
        if (!sortable) return '';
        if (_sortKey !== colKey || _sortDir === null)
            return '<span class="material-symbols-outlined dt-sort-icon dt-sort-icon--neutral">unfold_more</span>';
        if (_sortDir === 'asc')
            return '<span class="material-symbols-outlined dt-sort-icon dt-sort-icon--active">arrow_upward</span>';
        return '<span class="material-symbols-outlined dt-sort-icon dt-sort-icon--active">arrow_downward</span>';
    }

    function _renderHeader(paginated) {
        const pageKeys = paginated.map(r => String(_getRowKey(r)));
        const allPageSelected = pageKeys.length > 0 && pageKeys.every(k => _selected.has(k));
        const somePageSelected = pageKeys.some(k => _selected.has(k)) && !allPageSelected;

        let html = '<tr>';

        if (_selectable) {
            html += `<th class="dt-checkbox-cell">
                <input type="checkbox" class="dt-checkbox" id="dt-select-all"
                    ${allPageSelected ? 'checked' : ''}
                    aria-label="Selecionar todos">
            </th>`;
        }

        for (const col of _columns) {
            const isActive = _sortKey === col.key;
            const ariaSort = isActive
                ? (_sortDir === 'asc' ? 'ascending' : 'descending')
                : undefined;
            html += `<th
                ${col.width ? `style="width:${col.width}"` : ''}
                ${col.sortable ? 'class="dt-th-sortable"' : ''}
                ${col.sortable ? `data-sort-key="${col.key}"` : ''}
                ${ariaSort ? `aria-sort="${ariaSort}"` : ''}
            >
                <span class="dt-th-inner">
                    ${col.header}
                    ${_sortIconHTML(col.key, col.sortable)}
                </span>
            </th>`;
        }

        if (_actions.length) {
            html += '<th class="dt-actions-cell"></th>';
        }

        html += '</tr>';

        // Store indeterminate flag to apply after DOM update
        _pendingIndeterminate = somePageSelected;

        return html;
    }

    let _pendingIndeterminate = false;

    function _renderBody(sorted, paginated) {
        const totalCols = _columns.length + (_selectable ? 1 : 0) + (_actions.length ? 1 : 0);

        if (_loading) {
            return `<tr><td colspan="${totalCols}">
                <div class="dt-loading">
                    <div class="dt-spinner"></div>
                </div>
            </td></tr>`;
        }

        if (paginated.length === 0) {
            return `<tr><td colspan="${totalCols}">
                <div class="dt-empty-state">
                    <span class="material-symbols-outlined dt-empty-icon">${_emptyIcon}</span>
                    <p>${_emptyMsg}</p>
                </div>
            </td></tr>`;
        }

        return paginated.map(row => {
            const key = String(_getRowKey(row));
            const isSelected = _selected.has(key);

            let html = `<tr
                class="dt-row${isSelected ? ' dt-row--selected' : ''}"
                ${config.onRowClick ? 'style="cursor:pointer"' : ''}
                data-row-key="${key}">`;

            if (_selectable) {
                html += `<td class="dt-checkbox-cell">
                    <input type="checkbox" class="dt-checkbox dt-row-checkbox"
                        ${isSelected ? 'checked' : ''}
                        data-row-key="${key}"
                        aria-label="Selecionar linha">
                </td>`;
            }

            for (const col of _columns) {
                html += `<td>${col.render(row)}</td>`;
            }

            if (_actions.length) {
                const visibleActions = _actions.filter(a => !a.hidden?.(row));
                const itemsHTML = visibleActions.map((action, i) => {
                    const iconHTML = action.icon
                        ? `<span class="material-symbols-outlined dt-menu-item-icon">${action.icon}</span>`
                        : '';
                    return `<button class="dt-menu-item${action.variant === 'destructive' ? ' dt-menu-item--destructive' : ''}" data-action-idx="${i}">
                        ${iconHTML}${action.label}
                    </button>`;
                }).join('');

                html += `<td class="dt-actions-cell">
                    <div class="dt-action-wrap">
                        <button class="dt-action-trigger" aria-label="Ações">
                            <span class="material-symbols-outlined">more_horiz</span>
                        </button>
                        <div class="dt-dropdown" hidden>
                            ${itemsHTML}
                        </div>
                    </div>
                </td>`;
            }

            html += '</tr>';
            return html;
        }).join('');
    }

    function _renderPagination(sorted) {
        if (!_pageSize) return '';
        const totalPages = _getTotalPages(sorted);
        if (totalPages <= 1) return '';

        const start = (_page - 1) * _pageSize + 1;
        const end   = Math.min(_page * _pageSize, sorted.length);

        const pages = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || Math.abs(i - _page) <= 1) pages.push(i);
        }
        const withEllipsis = [];
        for (let i = 0; i < pages.length; i++) {
            if (i > 0 && pages[i] - pages[i - 1] > 1) withEllipsis.push('...');
            withEllipsis.push(pages[i]);
        }

        const pageButtons = withEllipsis.map(p =>
            p === '...'
                ? `<span class="dt-page-ellipsis">…</span>`
                : `<button class="dt-page-btn dt-page-btn--num${_page === p ? ' dt-page-btn--active' : ''}"
                    data-page="${p}" ${_page === p ? 'aria-current="page"' : ''}>${p}</button>`
        ).join('');

        return `
        <div class="dt-pagination">
            <span class="dt-pagination-info">${start}–${end} de ${sorted.length}</span>
            <div class="dt-pagination-controls">
                <button class="dt-page-btn dt-page-btn--nav" data-page-prev ${_page === 1 ? 'disabled' : ''} aria-label="Página anterior">
                    <span class="material-symbols-outlined">chevron_left</span>
                    Anterior
                </button>
                ${pageButtons}
                <button class="dt-page-btn dt-page-btn--nav" data-page-next ${_page === totalPages ? 'disabled' : ''} aria-label="Próxima página">
                    Próxima
                    <span class="material-symbols-outlined">chevron_right</span>
                </button>
            </div>
        </div>`;
    }

    // ══ Render principal ════════════════════════════════════════════════════

    function _render() {
        if (!_container) return;

        const sorted    = _getSorted();
        const paginated = _getPaginated(sorted);

        const thead = _container.querySelector('thead');
        const tbody = _container.querySelector('tbody');
        const pagin = _container.querySelector('.dt-pagination-wrapper');

        if (thead) thead.innerHTML = _renderHeader(paginated);
        if (tbody) tbody.innerHTML = _renderBody(sorted, paginated);
        if (pagin) pagin.innerHTML = _renderPagination(sorted);

        const selectAll = _container.querySelector('#dt-select-all');
        if (selectAll) selectAll.indeterminate = _pendingIndeterminate;

        _bindEvents();
    }

    // ══ Eventos ═════════════════════════════════════════════════════════════

    function _bindEvents() {
        if (!_container) return;

        // Ordenação por cabeçalho
        _container.querySelectorAll('[data-sort-key]').forEach(th => {
            th.onclick = () => {
                const key = th.getAttribute('data-sort-key');
                if (_sortKey !== key) {
                    _sortKey = key; _sortDir = 'asc';
                } else if (_sortDir === 'asc') {
                    _sortDir = 'desc';
                } else {
                    _sortKey = ''; _sortDir = null;
                }
                _page = 1;
                _render();
            };
        });

        // Checkbox "selecionar todos"
        const selectAll = _container.querySelector('#dt-select-all');
        if (selectAll) {
            selectAll.onchange = () => {
                const sorted    = _getSorted();
                const paginated = _getPaginated(sorted);
                const pageKeys  = paginated.map(r => String(_getRowKey(r)));
                const allSel    = pageKeys.every(k => _selected.has(k));
                if (allSel) {
                    pageKeys.forEach(k => _selected.delete(k));
                } else {
                    pageKeys.forEach(k => _selected.add(k));
                }
                config.onSelectionChange?.(_data.filter(r => _selected.has(String(_getRowKey(r)))));
                _render();
            };
        }

        // Checkboxes individuais (a célula inteira intercepta para não propagar o click da linha)
        _container.querySelectorAll('.dt-checkbox-cell').forEach(td => {
            td.onclick = e => e.stopPropagation();
        });
        _container.querySelectorAll('.dt-row-checkbox').forEach(cb => {
            cb.onchange = () => {
                const key = cb.getAttribute('data-row-key');
                if (_selected.has(key)) _selected.delete(key);
                else _selected.add(key);
                config.onSelectionChange?.(_data.filter(r => _selected.has(String(_getRowKey(r)))));
                _render();
            };
        });

        // Clique na linha
        if (config.onRowClick) {
            _container.querySelectorAll('tbody tr.dt-row').forEach(tr => {
                tr.onclick = () => {
                    const key = tr.getAttribute('data-row-key');
                    const row = _data.find(r => String(_getRowKey(r)) === key);
                    if (row) config.onRowClick(row);
                };
            });
        }

        // Menu de ações — botão trigger abre/fecha dropdown
        _container.querySelectorAll('.dt-action-trigger').forEach(btn => {
            btn.onclick = e => {
                e.stopPropagation();
                const dropdown = btn.parentElement.querySelector('.dt-dropdown');
                const isOpen   = !dropdown.hidden;
                _closeDropdowns();
                if (!isOpen) dropdown.removeAttribute('hidden');
            };
        });

        // Célula de ações não propaga clique de linha
        _container.querySelectorAll('.dt-actions-cell').forEach(td => {
            td.onclick = e => e.stopPropagation();
        });

        // Itens do menu de ações
        _container.querySelectorAll('.dt-menu-item').forEach(item => {
            item.onclick = e => {
                e.stopPropagation();
                const tr  = item.closest('tr.dt-row');
                if (!tr) return;
                const key = tr.getAttribute('data-row-key');
                const row = _data.find(r => String(_getRowKey(r)) === key);
                if (!row) return;
                const visibleActions = _actions.filter(a => !a.hidden?.(row));
                const idx = parseInt(item.getAttribute('data-action-idx'), 10);
                visibleActions[idx]?.onClick(row);
                _closeDropdowns();
            };
        });

        // Paginação
        _container.querySelectorAll('[data-page]').forEach(btn => {
            btn.onclick = () => {
                _page = parseInt(btn.getAttribute('data-page'), 10);
                _render();
            };
        });
        const prevBtn = _container.querySelector('[data-page-prev]');
        if (prevBtn) prevBtn.onclick = () => { if (_page > 1) { _page--; _render(); } };

        const nextBtn = _container.querySelector('[data-page-next]');
        if (nextBtn) nextBtn.onclick = () => {
            if (_page < _getTotalPages(_getSorted())) { _page++; _render(); }
        };
    }

    function _closeDropdowns() {
        _container?.querySelectorAll('.dt-dropdown').forEach(d => d.setAttribute('hidden', ''));
    }

    // ══ API pública ══════════════════════════════════════════════════════════

    /**
     * Monta a tabela dentro do elemento container.
     * @param {HTMLElement} containerElement
     */
    function mount(containerElement) {
        _container = containerElement;
        _container.innerHTML = `
            <div class="dt-wrapper">
                <div class="dt-table-container">
                    <table class="dt-table">
                        <thead></thead>
                        <tbody></tbody>
                    </table>
                </div>
                <div class="dt-pagination-wrapper"></div>
            </div>`;

        if (_outsideClickHandler) document.removeEventListener('click', _outsideClickHandler);
        _outsideClickHandler = e => {
            if (!_container?.contains(e.target)) _closeDropdowns();
        };
        document.addEventListener('click', _outsideClickHandler);

        _render();
    }

    /**
     * Substitui os dados e reseta seleção e página.
     * @param {Array} data
     */
    function setData(data) {
        _data     = data || [];
        _loading  = false;
        _page     = 1;
        _selected = new Set();
        _render();
    }

    /**
     * Alterna o estado de carregamento.
     * @param {boolean} loading
     */
    function setLoading(loading) {
        _loading = loading;
        _render();
    }

    /**
     * Retorna as linhas atualmente selecionadas.
     * @returns {Array}
     */
    function getSelected() {
        return _data.filter(r => _selected.has(String(_getRowKey(r))));
    }

    /**
     * Limpa a seleção atual.
     */
    function clearSelection() {
        _selected = new Set();
        _render();
    }

    /**
     * Remove os event listeners globais. Chamar antes de desmontar a tela.
     */
    function destroy() {
        if (_outsideClickHandler) {
            document.removeEventListener('click', _outsideClickHandler);
            _outsideClickHandler = null;
        }
        _container = null;
    }

    return { mount, setData, setLoading, getSelected, clearSelection, destroy };
}
