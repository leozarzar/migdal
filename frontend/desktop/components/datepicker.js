/**
 * @file datepicker.js
 * @description Componente DatePicker com suporte a data única, intervalo de datas,
 *   mês único e intervalo de meses. Renderiza em portal (sem clipping por overflow:hidden).
 *
 * @example
 * // Seleção de dia único
 * createDatePicker({ onChange: d => console.log(d) }).mount(el);
 *
 * @example
 * // Seleção de intervalo de dias
 * createDatePicker({ range: true, onChange: ({ start, end }) => ... }).mount(el);
 *
 * @example
 * // Seleção de mês único
 * createDatePicker({ picker: 'month', onChange: d => console.log(d) }).mount(el);
 *
 * @example
 * // Seleção de intervalo de meses
 * createDatePicker({ picker: 'month', range: true, onChange: ({ start, end }) => ... }).mount(el);
 *
 * @param {object}   config
 * @param {'day'|'month'} [config.picker='day']              — Granularidade do picker.
 * @param {boolean}  [config.range=false]                    — Habilita seleção de intervalo.
 * @param {Date|{start,end}|null} [config.value=null]        — Valor inicial.
 * @param {string}   [config.placeholder]                    — Placeholder do trigger.
 * @param {string}   [config.locale='pt-BR']                 — Locale para nomes de mês/dia.
 * @param {Date}     [config.minDate]                        — Data mínima selecionável.
 * @param {Date}     [config.maxDate]                        — Data máxima selecionável.
 * @param {boolean}  [config.disabled=false]                 — Estado desabilitado.
 * @param {boolean}  [config.clearable=true]                 — Exibe botão para limpar.
 * @param {function} [config.onChange]                       — Callback ao alterar seleção.
 *   Single: recebe `(Date | null)`
 *   Range:  recebe `({ start: Date|null, end: Date|null })`
 *
 * @returns {{ el, mount, getValue, setValue, clear, setDisabled, destroy }}
 */
function createDatePicker(config = {}) {

    // ══ Config ═══════════════════════════════════════════════════════════════

    const _picker      = config.picker === 'month' ? 'month' : 'day';
    const _range       = config.range === true;
    const _locale      = config.locale || 'pt-BR';
    const _clearable   = config.clearable !== false;
    const _minDate     = config.minDate ? _stripTime(config.minDate) : null;
    const _maxDate     = config.maxDate ? _stripTime(config.maxDate) : null;

    const _defaultPlaceholder = _range
        ? (_picker === 'month' ? 'Selecionar meses' : 'Selecionar período')
        : (_picker === 'month' ? 'Selecionar mês'   : 'Selecionar data');
    const _placeholder = config.placeholder || _defaultPlaceholder;

    // ══ Estado interno ═══════════════════════════════════════════════════════

    let _value;
    if (_range) {
        const v = config.value || {};
        _value = {
            start: v.start ? _stripTime(v.start) : null,
            end:   v.end   ? _stripTime(v.end)   : null,
        };
    } else {
        _value = config.value ? _stripTime(config.value) : null;
    }

    let _open         = false;
    let _disabled     = config.disabled || false;
    let _viewMonth    = null; // Date no dia 1 do mês visível (modo day, painel 0)
    let _viewYear     = 0;   // Ano visível (modo month)
    let _hoverDate    = null;
    let _pendingStart = null;

    // Inicializa view
    {
        const seed = _range
            ? (_value.start || _value.end || new Date())
            : (_value || new Date());
        _viewMonth = new Date(seed.getFullYear(), seed.getMonth(), 1);
        _viewYear  = seed.getFullYear();
    }

    let _outsideHandler = null;
    let _resizeHandler  = null;
    let _scrollHandlers = [];
    let _windowScrollFn = null;

    // ══ Helpers de data ══════════════════════════════════════════════════════

    function _stripTime(d) {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x;
    }

    function _sameDay(a, b) {
        if (!a || !b) return false;
        return a.getFullYear() === b.getFullYear()
            && a.getMonth()    === b.getMonth()
            && a.getDate()     === b.getDate();
    }

    function _sameMonth(a, b) {
        if (!a || !b) return false;
        return a.getFullYear() === b.getFullYear()
            && a.getMonth()    === b.getMonth();
    }

    function _isBefore(a, b) { return a.getTime() <  b.getTime(); }
    function _isAfter (a, b) { return a.getTime() >  b.getTime(); }

    function _addMonths(date, delta) {
        return new Date(date.getFullYear(), date.getMonth() + delta, 1);
    }

    function _isDisabledDate(d) {
        if (_minDate && _isBefore(d, _minDate)) return true;
        if (_maxDate && _isAfter (d, _maxDate)) return true;
        return false;
    }

    function _isDisabledMonth(firstOfMonth) {
        if (_minDate) {
            const minFirst = new Date(_minDate.getFullYear(), _minDate.getMonth(), 1);
            if (_isBefore(firstOfMonth, minFirst)) return true;
        }
        if (_maxDate) {
            const maxFirst = new Date(_maxDate.getFullYear(), _maxDate.getMonth(), 1);
            if (_isAfter(firstOfMonth, maxFirst)) return true;
        }
        return false;
    }

    function _formatTrigger(date) {
        if (_picker === 'month') {
            const s = date.toLocaleDateString(_locale, { year: 'numeric', month: 'short' });
            return s.charAt(0).toUpperCase() + s.slice(1);
        }
        return date.toLocaleDateString(_locale, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function _formatMonthHeader(date) {
        const s = date.toLocaleDateString(_locale, { year: 'numeric', month: 'long' });
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function _weekdayLabels() {
        const base = new Date(2024, 11, 29); // domingo
        const out  = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(base);
            d.setDate(base.getDate() + i);
            out.push(d.toLocaleDateString(_locale, { weekday: 'short' }).slice(0, 2));
        }
        return out;
    }

    function _monthLabel(monthIndex) {
        const d = new Date(2024, monthIndex, 1);
        const s = d.toLocaleDateString(_locale, { month: 'short' });
        return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '');
    }

    // ══ DOM ══════════════════════════════════════════════════════════════════

    const _wrap = document.createElement('div');
    _wrap.className = 'wcm-dp-wrap';

    const _trigger = document.createElement('button');
    _trigger.type = 'button';
    _trigger.className = 'wcm-dp-trigger';
    _trigger.disabled = _disabled;
    _wrap.appendChild(_trigger);

    const _iconEl = document.createElement('span');
    _iconEl.className = 'wcm-dp-icon material-symbols-outlined';
    _iconEl.textContent = 'calendar_month';
    _trigger.appendChild(_iconEl);

    const _contentEl = document.createElement('span');
    _contentEl.className = 'wcm-dp-content';
    _trigger.appendChild(_contentEl);

    let _clearEl = null;
    if (_clearable) {
        _clearEl = document.createElement('span');
        _clearEl.className = 'wcm-dp-clear';
        _clearEl.setAttribute('role', 'button');
        _clearEl.setAttribute('aria-label', 'Limpar seleção');
        _clearEl.innerHTML = '<span class="material-symbols-outlined">close</span>';
        _clearEl.style.display = 'none';
        _trigger.appendChild(_clearEl);
    }

    const _dropdownEl = document.createElement('div');
    _dropdownEl.className = 'wcm-dp-dropdown';
    if (_range) _dropdownEl.classList.add('wcm-dp-dropdown--range');

    // ══ Render trigger ════════════════════════════════════════════════════════

    function _renderTrigger() {
        _contentEl.textContent = '';
        const hasValue = _range ? (_value.start || _value.end) : !!_value;

        if (!hasValue) {
            _contentEl.classList.add('wcm-dp-content--placeholder');
            _contentEl.textContent = _placeholder;
            if (_clearEl) _clearEl.style.display = 'none';
            return;
        }

        _contentEl.classList.remove('wcm-dp-content--placeholder');

        if (_range) {
            const a = _value.start ? _formatTrigger(_value.start) : '...';
            const b = _value.end   ? _formatTrigger(_value.end)   : '...';
            _contentEl.textContent = a + ' – ' + b;
        } else {
            _contentEl.textContent = _formatTrigger(_value);
        }

        if (_clearEl) _clearEl.style.display = 'inline-flex';
    }

    // ══ Render dropdown ═══════════════════════════════════════════════════════

    function _renderDropdown() {
        _dropdownEl.innerHTML = '';
        if (_picker === 'month') {
            _renderMonthPickerDropdown();
        } else {
            _renderDayPickerDropdown();
        }
    }

    // ── Day picker ─────────────────────────────────────────────────────────

    function _renderDayPickerDropdown() {
        const panels = _range ? 2 : 1;
        const grid = document.createElement('div');
        grid.className = 'wcm-dp-months';
        _dropdownEl.appendChild(grid);

        for (let i = 0; i < panels; i++) {
            grid.appendChild(_renderDayPanel(_addMonths(_viewMonth, i), i, panels));
        }
    }

    function _renderDayPanel(monthDate, index, totalPanels) {
        const monthEl = document.createElement('div');
        monthEl.className = 'wcm-dp-month';

        const header = document.createElement('div');
        header.className = 'wcm-dp-month-header';

        const prevBtn = _makeNavBtn('prev');
        prevBtn.addEventListener('click', e => {
            e.stopPropagation();
            _viewMonth = _addMonths(_viewMonth, -1);
            _renderDropdown();
        });
        if (index !== 0) prevBtn.style.visibility = 'hidden';
        header.appendChild(prevBtn);

        const title = document.createElement('div');
        title.className = 'wcm-dp-month-title';
        title.textContent = _formatMonthHeader(monthDate);
        header.appendChild(title);

        const nextBtn = _makeNavBtn('next');
        nextBtn.addEventListener('click', e => {
            e.stopPropagation();
            _viewMonth = _addMonths(_viewMonth, 1);
            _renderDropdown();
        });
        if (index !== totalPanels - 1) nextBtn.style.visibility = 'hidden';
        header.appendChild(nextBtn);

        monthEl.appendChild(header);

        const wkRow = document.createElement('div');
        wkRow.className = 'wcm-dp-weekdays';
        _weekdayLabels().forEach(lbl => {
            const c = document.createElement('div');
            c.className = 'wcm-dp-weekday';
            c.textContent = lbl;
            wkRow.appendChild(c);
        });
        monthEl.appendChild(wkRow);

        const grid = document.createElement('div');
        grid.className = 'wcm-dp-grid';

        const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const lastOfMonth  = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        const startWeekday = firstOfMonth.getDay();
        const totalCells   = Math.ceil((startWeekday + lastOfMonth.getDate()) / 7) * 7;

        const start = new Date(firstOfMonth);
        start.setDate(start.getDate() - startWeekday);

        for (let i = 0; i < totalCells; i++) {
            const cellDate = new Date(start);
            cellDate.setDate(start.getDate() + i);
            grid.appendChild(_renderDayCell(cellDate, monthDate));
        }

        monthEl.appendChild(grid);
        return monthEl;
    }

    function _renderDayCell(date, monthDate) {
        const cell = document.createElement('div');
        cell.className = 'wcm-dp-cell';
        cell.dataset.date = date.toISOString().slice(0, 10);

        const inMonth = date.getMonth() === monthDate.getMonth();
        const disabled = _isDisabledDate(date);
        const isToday  = _sameDay(date, _stripTime(new Date()));

        if (!inMonth)  cell.classList.add('wcm-dp-cell--out');
        if (disabled)  cell.classList.add('wcm-dp-cell--disabled');
        if (isToday)   cell.classList.add('wcm-dp-cell--today');

        _applyDayCellClasses(cell, date);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wcm-dp-day';
        btn.textContent = String(date.getDate());
        btn.disabled = disabled;
        btn.addEventListener('click', e => { e.stopPropagation(); _onDayClick(date); });
        if (_range) {
            btn.addEventListener('mouseenter', () => {
                if (_pendingStart) { _hoverDate = date; _updateDayRangeClasses(); }
            });
        }
        cell.appendChild(btn);
        return cell;
    }

    function _applyDayCellClasses(cell, date) {
        cell.classList.remove('wcm-dp-cell--start', 'wcm-dp-cell--end', 'wcm-dp-cell--in-range', 'wcm-dp-cell--selected');
        if (_range) {
            const { start, end } = _effectiveRange();
            if (start && _sameDay(date, start)) cell.classList.add('wcm-dp-cell--start', 'wcm-dp-cell--selected');
            if (end   && _sameDay(date, end))   cell.classList.add('wcm-dp-cell--end',   'wcm-dp-cell--selected');
            if (start && end && _isAfter(date, start) && _isBefore(date, end)) {
                cell.classList.add('wcm-dp-cell--in-range');
            }
        } else {
            if (_value && _sameDay(date, _value)) cell.classList.add('wcm-dp-cell--selected');
        }
    }

    function _updateDayRangeClasses() {
        _dropdownEl.querySelectorAll('.wcm-dp-cell[data-date]').forEach(cell => {
            _applyDayCellClasses(cell, new Date(cell.dataset.date + 'T00:00:00'));
        });
    }

    function _onDayClick(date) {
        if (_isDisabledDate(date)) return;

        if (!_range) {
            _value = date;
            _renderTrigger();
            _closeDropdown();
            if (config.onChange) config.onChange(new Date(date));
            return;
        }

        if (!_pendingStart) {
            _pendingStart = date;
            _hoverDate    = date;
            _value = { start: null, end: null };
            _updateDayRangeClasses();
        } else {
            const ordered = _isAfter(_pendingStart, date)
                ? { start: date, end: _pendingStart }
                : { start: _pendingStart, end: date };
            _value = ordered;
            _pendingStart = null;
            _hoverDate    = null;
            _renderTrigger();
            _closeDropdown();
            if (config.onChange) config.onChange({ start: new Date(ordered.start), end: new Date(ordered.end) });
        }
    }

    // ── Month picker ───────────────────────────────────────────────────────

    function _renderMonthPickerDropdown() {
        const panel = document.createElement('div');
        panel.className = 'wcm-dp-month wcm-dp-month--picker';

        const header = document.createElement('div');
        header.className = 'wcm-dp-month-header';

        const prevBtn = _makeNavBtn('prev');
        prevBtn.addEventListener('click', e => {
            e.stopPropagation();
            _viewYear--;
            _renderDropdown();
        });
        header.appendChild(prevBtn);

        const title = document.createElement('div');
        title.className = 'wcm-dp-month-title';
        title.textContent = String(_viewYear);
        header.appendChild(title);

        const nextBtn = _makeNavBtn('next');
        nextBtn.addEventListener('click', e => {
            e.stopPropagation();
            _viewYear++;
            _renderDropdown();
        });
        header.appendChild(nextBtn);

        panel.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'wcm-dp-mgrid';

        for (let m = 0; m < 12; m++) {
            const firstOfMonth = new Date(_viewYear, m, 1);
            grid.appendChild(_renderMonthCell(firstOfMonth));
        }

        panel.appendChild(grid);
        _dropdownEl.appendChild(panel);
    }

    function _renderMonthCell(firstOfMonth) {
        const cell = document.createElement('div');
        cell.className = 'wcm-dp-mcell';
        cell.dataset.month = `${firstOfMonth.getFullYear()}-${String(firstOfMonth.getMonth()).padStart(2, '0')}`;

        const disabled = _isDisabledMonth(firstOfMonth);
        const isCurrentMonth = _sameMonth(firstOfMonth, _stripTime(new Date()));

        if (disabled)       cell.classList.add('wcm-dp-mcell--disabled');
        if (isCurrentMonth) cell.classList.add('wcm-dp-mcell--today');

        _applyMonthCellClasses(cell, firstOfMonth);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wcm-dp-mday';
        btn.textContent = _monthLabel(firstOfMonth.getMonth());
        btn.disabled = disabled;
        btn.addEventListener('click', e => { e.stopPropagation(); _onMonthClick(firstOfMonth); });
        if (_range) {
            btn.addEventListener('mouseenter', () => {
                if (_pendingStart) { _hoverDate = firstOfMonth; _updateMonthRangeClasses(); }
            });
        }
        cell.appendChild(btn);
        return cell;
    }

    function _applyMonthCellClasses(cell, firstOfMonth) {
        cell.classList.remove('wcm-dp-mcell--start', 'wcm-dp-mcell--end', 'wcm-dp-mcell--in-range', 'wcm-dp-mcell--selected');
        if (_range) {
            const { start, end } = _effectiveRange();
            if (start && _sameMonth(firstOfMonth, start)) cell.classList.add('wcm-dp-mcell--start', 'wcm-dp-mcell--selected');
            if (end   && _sameMonth(firstOfMonth, end))   cell.classList.add('wcm-dp-mcell--end',   'wcm-dp-mcell--selected');
            if (start && end && _isAfter(firstOfMonth, start) && _isBefore(firstOfMonth, end)) {
                cell.classList.add('wcm-dp-mcell--in-range');
            }
        } else {
            if (_value && _sameMonth(firstOfMonth, _value)) cell.classList.add('wcm-dp-mcell--selected');
        }
    }

    function _updateMonthRangeClasses() {
        _dropdownEl.querySelectorAll('.wcm-dp-mcell[data-month]').forEach(cell => {
            const [y, m] = cell.dataset.month.split('-').map(Number);
            _applyMonthCellClasses(cell, new Date(y, m, 1));
        });
    }

    function _onMonthClick(firstOfMonth) {
        if (_isDisabledMonth(firstOfMonth)) return;

        if (!_range) {
            _value = firstOfMonth;
            _renderTrigger();
            _closeDropdown();
            if (config.onChange) config.onChange(new Date(firstOfMonth));
            return;
        }

        if (!_pendingStart) {
            _pendingStart = firstOfMonth;
            _hoverDate    = firstOfMonth;
            _value = { start: null, end: null };
            _updateMonthRangeClasses();
        } else {
            const ordered = _isAfter(_pendingStart, firstOfMonth)
                ? { start: firstOfMonth, end: _pendingStart }
                : { start: _pendingStart, end: firstOfMonth };
            _value = ordered;
            _pendingStart = null;
            _hoverDate    = null;
            _renderTrigger();
            _closeDropdown();
            if (config.onChange) config.onChange({ start: new Date(ordered.start), end: new Date(ordered.end) });
        }
    }

    // ── Shared ─────────────────────────────────────────────────────────────

    function _makeNavBtn(dir) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wcm-dp-nav';
        btn.innerHTML = dir === 'prev'
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        return btn;
    }

    function _effectiveRange() {
        if (_range && _pendingStart) {
            const a = _pendingStart;
            const b = _hoverDate || _pendingStart;
            return _isAfter(a, b) ? { start: b, end: a } : { start: a, end: b };
        }
        return _range ? _value : { start: null, end: null };
    }

    // ══ Dropdown portal ═══════════════════════════════════════════════════════

    function _positionDropdown() {
        const rect      = _trigger.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const ddH       = _dropdownEl.getBoundingClientRect().height || 300;

        const spaceBelow = viewportH - rect.bottom - 8;
        const spaceAbove = rect.top - 8;

        const top = (spaceBelow >= ddH || spaceBelow >= spaceAbove)
            ? rect.bottom + 4
            : Math.max(8, rect.top - 4 - ddH);

        _dropdownEl.style.top  = top + 'px';
        _dropdownEl.style.left = rect.left + 'px';
    }

    function _openDropdown() {
        if (_disabled) return;
        _open = true;
        _trigger.classList.add('wcm-dp-trigger--open');

        const seed = _range
            ? (_value.start || _value.end || new Date())
            : (_value || new Date());
        _viewMonth = new Date(seed.getFullYear(), seed.getMonth(), 1);
        _viewYear  = seed.getFullYear();
        _pendingStart = null;
        _hoverDate    = null;

        _dropdownEl.style.position = 'fixed';
        _dropdownEl.style.zIndex   = '9999';
        document.body.appendChild(_dropdownEl);
        _renderDropdown();
        _positionDropdown();

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
        _trigger.classList.remove('wcm-dp-trigger--open');

        if (_dropdownEl.parentNode) _dropdownEl.parentNode.removeChild(_dropdownEl);

        if (_outsideHandler) { document.removeEventListener('mousedown', _outsideHandler); _outsideHandler = null; }
        if (_windowScrollFn) { window.removeEventListener('scroll',  _windowScrollFn);     _windowScrollFn = null; }
        if (_resizeHandler)  { window.removeEventListener('resize',  _resizeHandler);      _resizeHandler  = null; }
        _scrollHandlers.forEach(({ el, fn }) => el.removeEventListener('scroll', fn));
        _scrollHandlers = [];

        _pendingStart = null;
        _hoverDate    = null;
    }

    // ══ Bind events ═══════════════════════════════════════════════════════════

    _trigger.addEventListener('click', () => {
        if (_disabled) return;
        if (_open) _closeDropdown(); else _openDropdown();
    });

    if (_clearEl) {
        _clearEl.addEventListener('mousedown', e => {
            e.stopPropagation();
            e.preventDefault();
            _value = _range ? { start: null, end: null } : null;
            _renderTrigger();
            if (_open) _renderDropdown();
            if (config.onChange) config.onChange(_range ? { start: null, end: null } : null);
        });
    }

    // ══ Init ══════════════════════════════════════════════════════════════════

    _renderTrigger();

    // ══ API pública ═══════════════════════════════════════════════════════════

    function mount(containerEl) { containerEl.appendChild(_wrap); }

    function getValue() {
        if (_range) {
            return {
                start: _value.start ? new Date(_value.start) : null,
                end:   _value.end   ? new Date(_value.end)   : null,
            };
        }
        return _value ? new Date(_value) : null;
    }

    function setValue(value) {
        if (_range) {
            const v = value || {};
            _value = {
                start: v.start ? _stripTime(v.start) : null,
                end:   v.end   ? _stripTime(v.end)   : null,
            };
        } else {
            _value = value ? _stripTime(value) : null;
        }
        _renderTrigger();
        if (_open) _renderDropdown();
    }

    function clear() {
        _value = _range ? { start: null, end: null } : null;
        _renderTrigger();
        if (_open) _renderDropdown();
    }

    function setDisabled(val) {
        _disabled = val;
        _trigger.disabled = val;
        if (val) { _closeDropdown(); _wrap.classList.add('wcm-dp-disabled'); }
        else     { _wrap.classList.remove('wcm-dp-disabled'); }
    }

    function destroy() { _closeDropdown(); _wrap.remove(); }

    return { el: _wrap, mount, getValue, setValue, clear, setDisabled, destroy };
}
