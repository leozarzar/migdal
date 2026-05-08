/**
 * @file textarea.js
 * @description Campo de texto multilinha reutilizável, com mesmo estilo do createInput.
 *
 * @example
 * const field = createTextarea({
 *     placeholder: 'Observações...',
 *     rows: 3,
 *     onInput: value => console.log(value),
 * });
 * container.appendChild(field.el);
 *
 * field.setValue('texto inicial');
 * field.setError('Campo obrigatório');
 *
 * @param {object}   config
 * @param {string}   [config.placeholder='']   — Placeholder.
 * @param {string}   [config.value='']         — Valor inicial.
 * @param {number}   [config.rows=3]           — Número de linhas visíveis.
 * @param {boolean}  [config.disabled=false]   — Estado desabilitado.
 * @param {boolean}  [config.readonly=false]   — Estado somente-leitura.
 * @param {string}   [config.id]               — Atributo id do textarea.
 * @param {string}   [config.name]             — Atributo name do textarea.
 * @param {number}   [config.maxLength]        — Atributo maxlength.
 * @param {string}   [config.className='']     — Classes extras no textarea.
 * @param {function} [config.onInput]          — Callback a cada keystroke. Recebe (value, event).
 * @param {function} [config.onChange]         — Callback ao perder foco com valor alterado. Recebe (value, event).
 *
 * @returns {{ el: HTMLDivElement, textarea: HTMLTextAreaElement, getValue, setValue, setDisabled, setError, clearError, focus, destroy }}
 */
function createTextarea(config = {}) {
    const {
        placeholder = '',
        value       = '',
        rows        = 3,
        disabled    = false,
        readonly    = false,
        id          = undefined,
        name        = undefined,
        maxLength   = undefined,
        className   = '',
        onInput     = null,
        onChange    = null,
    } = config;

    // ── Wrapper ─────────────────────────────────────────────────────────────

    const el = document.createElement('div');
    el.className = 'wcm-input-wrapper';

    // ── Textarea ─────────────────────────────────────────────────────────────

    const textarea = document.createElement('textarea');
    textarea.placeholder = placeholder;
    textarea.value       = value;
    textarea.rows        = rows;
    textarea.disabled    = disabled;
    textarea.readOnly    = readonly;

    if (id        !== undefined) textarea.id        = id;
    if (name      !== undefined) textarea.name      = name;
    if (maxLength !== undefined) textarea.maxLength = maxLength;

    textarea.className = ['wcm-textarea', className].filter(Boolean).join(' ');

    el.appendChild(textarea);

    // ── Eventos ──────────────────────────────────────────────────────────────

    if (onInput)  textarea.addEventListener('input',  e => onInput(e.target.value, e));
    if (onChange) textarea.addEventListener('change', e => onChange(e.target.value, e));

    // ── API ──────────────────────────────────────────────────────────────────

    function getValue()        { return textarea.value; }
    function setValue(v)       { textarea.value = v ?? ''; }
    function setDisabled(v)    { textarea.disabled = v; }

    function setError(message) {
        textarea.classList.add('wcm-textarea--error');
        textarea.title = message || '';
    }

    function clearError() {
        textarea.classList.remove('wcm-textarea--error');
        textarea.title = '';
    }

    function focus() { textarea.focus(); }
    function destroy() { el.remove(); }

    return { el, textarea, getValue, setValue, setDisabled, setError, clearError, focus, destroy };
}
