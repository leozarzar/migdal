/**
 * @file button.js
 * @description Botão reutilizável com variantes visuais.
 *
 * @example
 * // Uso programático (factory):
 * const btn = createButton({
 *     label: 'Salvar',
 *     variant: 'primary',
 *     icon: 'save',
 *     onClick: () => save(),
 * });
 * container.appendChild(btn.el);
 *
 * btn.setLoading(true);
 * btn.setLabel('Novo label');
 * btn.setDisabled(true);
 *
 * @example
 * // Uso inline em templates HTML (só CSS, sem JS):
 * `<button class="wcm-btn wcm-btn--primary" type="button" onclick="save()">
 *      <span class="material-symbols-outlined">save</span>
 *      Salvar
 *  </button>`
 *
 * @param {object}   config
 * @param {string}   [config.label='']                  — Texto exibido no botão.
 * @param {'primary'|'secondary'|'cancel'|'ghost'} [config.variant='primary'] — Variante visual.
 * @param {'sm'|'md'|'lg'}  [config.size='sm']          — Tamanho.
 * @param {string}   [config.icon]                      — Nome de ícone Material Symbols (antes do label).
 * @param {string}   [config.iconEnd]                   — Nome de ícone Material Symbols (depois do label).
 * @param {boolean}  [config.iconOnly=false]            — Remove padding lateral (para botões apenas-ícone).
 * @param {function} [config.onClick]                   — Callback de clique.
 * @param {boolean}  [config.disabled=false]            — Estado desabilitado inicial.
 * @param {boolean}  [config.loading=false]             — Estado de carregamento inicial.
 * @param {'button'|'submit'|'reset'} [config.type='button'] — Tipo HTML do botão.
 * @param {string}   [config.className='']              — Classes extras.
 * @param {string}   [config.title]                     — Tooltip (atributo title).
 *
 * @returns {{ el: HTMLButtonElement, setLabel, setDisabled, setLoading, destroy }}
 */
function createButton(config = {}) {
    const {
        label    = '',
        variant  = 'primary',
        size     = 'sm',
        icon     = null,
        iconEnd  = null,
        iconOnly = false,
        onClick  = null,
        disabled = false,
        loading  = false,
        type     = 'button',
        className = '',
        title    = undefined,
    } = config;

    let _label   = label;
    let _loading = loading;

    // ── Cria elemento ───────────────────────────────────────────────────────

    const el = document.createElement('button');
    el.type = type;
    if (title !== undefined) el.title = title;

    function _buildClasses() {
        const classes = [
            'wcm-btn',
            `wcm-btn--${variant}`,
            `wcm-btn--${size}`,
            iconOnly ? 'wcm-btn--icon-only' : '',
            _loading  ? 'wcm-btn--loading'   : '',
            className,
        ];
        el.className = classes.filter(Boolean).join(' ');
    }

    function _buildContent() {
        const parts = [];

        if (_loading) {
            parts.push('<span class="wcm-btn-spinner"></span>');
        } else if (icon) {
            parts.push(`<span class="material-symbols-outlined">${_esc(icon)}</span>`);
        }

        if (_label && !iconOnly) {
            parts.push(_esc(_label));
        }

        if (iconEnd && !_loading) {
            parts.push(`<span class="material-symbols-outlined">${_esc(iconEnd)}</span>`);
        }

        el.innerHTML = parts.join('');
    }

    function _esc(v) {
        return String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function _render() {
        _buildClasses();
        _buildContent();
        el.disabled = disabled || _loading;
    }

    // ── API ─────────────────────────────────────────────────────────────────

    function setLabel(newLabel) {
        _label = newLabel;
        _buildContent();
    }

    function setDisabled(value) {
        el.disabled = value || _loading;
    }

    function setLoading(value) {
        _loading = value;
        _buildClasses();
        _buildContent();
        el.disabled = value;
    }

    function destroy() {
        el.remove();
    }

    // ── Inicializa ──────────────────────────────────────────────────────────

    if (onClick) {
        el.addEventListener('click', onClick);
    }

    _render();

    return { el, setLabel, setDisabled, setLoading, destroy };
}
