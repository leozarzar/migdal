/**
 * @file input.js
 * @description Campo de texto reutilizável com suporte a ícone, estados de erro,
 *   loading e API de controle programático.
 *
 * @example
 * // Uso programático (factory):
 * const field = createInput({
 *     placeholder: 'Buscar...',
 *     icon: 'Search',
 *     onInput: value => filter(value),
 * });
 * container.appendChild(field.el);
 *
 * field.setValue('texto inicial');
 * field.setError('Campo obrigatório');
 * field.focus();
 *
 * @example
 * // Uso inline em templates HTML (só CSS, sem JS):
 * `<div class="wcm-input-wrapper">
 *      <span class="wcm-input-icon material-symbols-outlined">search</span>
 *      <input class="wcm-input wcm-input--with-icon" type="text" placeholder="Buscar...">
 *  </div>`
 *
 * @param {object}   config
 * @param {string}   [config.type='text']              — Tipo do input HTML.
 * @param {string}   [config.placeholder='']           — Placeholder.
 * @param {string}   [config.value='']                 — Valor inicial.
 * @param {'Search'|'Mail'|'Lock'|'User'|'Phone'} [config.icon] — Ícone à esquerda.
 * @param {boolean}  [config.disabled=false]           — Estado desabilitado.
 * @param {boolean}  [config.readonly=false]           — Estado somente-leitura.
 * @param {string}   [config.id]                       — Atributo id do input.
 * @param {string}   [config.name]                     — Atributo name do input.
 * @param {string}   [config.autocomplete]             — Atributo autocomplete.
 * @param {string}   [config.className='']             — Classes extras no input.
 * @param {number}   [config.maxLength]                — Atributo maxlength.
 * @param {function} [config.onInput]                  — Callback a cada keystroke. Recebe (value, event).
 * @param {function} [config.onChange]                 — Callback ao perder foco com valor alterado. Recebe (value, event).
 * @param {function} [config.onKeydown]                — Callback em keydown. Recebe (event).
 * @param {function} [config.onEnter]                  — Atalho para keydown Enter. Recebe (value, event).
 *
 * @returns {{ el: HTMLDivElement, input: HTMLInputElement, getValue, setValue, setDisabled, setError, clearError, focus, destroy }}
 */
function createInput(config = {}) {
    const {
        type         = 'text',
        placeholder  = '',
        value        = '',
        icon         = null,
        disabled     = false,
        readonly     = false,
        id           = undefined,
        name         = undefined,
        autocomplete = undefined,
        className    = '',
        maxLength    = undefined,
        onInput      = null,
        onChange     = null,
        onKeydown    = null,
        onEnter      = null,
    } = config;

    // Mapeamento Lucide → Material Symbol (nomes de ícone do projeto)
    const ICON_MAP = {
        Search  : 'search',
        Mail    : 'mail',
        Lock    : 'lock',
        User    : 'person',
        Phone   : 'phone',
        Arroba  : 'alternate_email',
        Company : 'domain',
    };

    // ── Wrapper ─────────────────────────────────────────────────────────────

    const el = document.createElement('div');
    el.className = 'wcm-input-wrapper';

    // ── Ícone ────────────────────────────────────────────────────────────────

    if (icon && ICON_MAP[icon]) {
        const iconEl = document.createElement('span');
        iconEl.className = 'wcm-input-icon material-symbols-outlined';
        iconEl.textContent = ICON_MAP[icon];
        el.appendChild(iconEl);
    }

    // ── Input ────────────────────────────────────────────────────────────────

    const input = document.createElement('input');
    input.type = type;
    input.placeholder = placeholder;
    input.value = value;
    input.disabled = disabled;
    input.readOnly = readonly;

    if (id           !== undefined) input.id           = id;
    if (name         !== undefined) input.name         = name;
    if (autocomplete !== undefined) input.autocomplete = autocomplete;
    if (maxLength    !== undefined) input.maxLength    = maxLength;

    const classes = [
        'wcm-input',
        icon ? 'wcm-input--with-icon' : '',
        className,
    ];
    input.className = classes.filter(Boolean).join(' ');

    el.appendChild(input);

    // ── Eventos ──────────────────────────────────────────────────────────────

    if (onInput) {
        input.addEventListener('input', e => onInput(e.target.value, e));
    }

    if (onChange) {
        input.addEventListener('change', e => onChange(e.target.value, e));
    }

    if (onKeydown || onEnter) {
        input.addEventListener('keydown', e => {
            if (onKeydown) onKeydown(e);
            if (onEnter && e.key === 'Enter') onEnter(input.value, e);
        });
    }

    // ── API ──────────────────────────────────────────────────────────────────

    function getValue() {
        return input.value;
    }

    function setValue(newValue) {
        input.value = newValue ?? '';
    }

    function setDisabled(value) {
        input.disabled = value;
    }

    function setError(message) {
        input.classList.add('wcm-input--error');
        input.title = message || '';
    }

    function clearError() {
        input.classList.remove('wcm-input--error');
        input.title = '';
    }

    function focus() {
        input.focus();
    }

    function destroy() {
        el.remove();
    }

    return { el, input, getValue, setValue, setDisabled, setError, clearError, focus, destroy };
}
