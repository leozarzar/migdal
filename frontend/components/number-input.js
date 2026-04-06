/**
 * @file number-input.js
 * @description Componente de campo numérico com badge de unidade opcional.
 *
 * @example
 * const inp = createNumberInput({
 *     id:    'myInput',
 *     value: 7,
 *     min:   1,
 *     max:   365,
 *     unit:  'dias',
 *     onChange: (v) => console.log('valor:', v)
 * });
 * inp.mount(document.getElementById('myContainer'));
 */

/**
 * Cria uma instância do componente NumberInput.
 *
 * @param {object}   config
 * @param {string}   [config.id]        — ID aplicado ao <input> interno.
 * @param {number}   [config.value]     — Valor inicial.
 * @param {number}   [config.min]       — Valor mínimo.
 * @param {number}   [config.max]       — Valor máximo.
 * @param {number}   [config.step]      — Incremento do spinner.
 * @param {string}   [config.unit]      — Texto do badge de unidade (ex: "dias", "%").
 * @param {function} [config.onChange]  — Callback chamado em mudanças de valor.
 *
 * @returns {{ getValue, setValue, mount, destroy }}
 */
function createNumberInput({ id, value = '', min, max, step, unit, onChange } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'ninput-wrap';

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'ninput-field';
    if (id)   input.id   = id;
    if (value !== '') input.value = value;
    if (min   !== undefined) input.setAttribute('min',  min);
    if (max   !== undefined) input.setAttribute('max',  max);
    if (step  !== undefined) input.setAttribute('step', step);

    if (onChange) {
        input.addEventListener('change', () => onChange(parseFloat(input.value)));
    }

    wrap.appendChild(input);

    if (unit) {
        const badge = document.createElement('span');
        badge.className = 'ninput-unit';
        badge.textContent = unit;
        wrap.appendChild(badge);
    }

    return {
        /** Retorna o valor numérico atual do campo. */
        getValue() { return parseFloat(input.value); },

        /** Define o valor do campo. */
        setValue(v) { input.value = v; },

        /**
         * Monta o componente no contêiner indicado.
         * @param {HTMLElement|string} container — Elemento ou ID do contêiner.
         */
        mount(container) {
            const el = typeof container === 'string'
                ? document.getElementById(container)
                : container;
            if (el) el.appendChild(wrap);
        },

        /** Remove o componente do DOM. */
        destroy() {
            wrap.remove();
        }
    };
}
