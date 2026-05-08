/**
 * @file toggle-group.js
 * @description Grupo de botões de seleção exclusiva (toggle group).
 *
 * @example
 * const tg = createToggleGroup({
 *     options: [
 *         { value: 'daily',   label: 'Diário'  },
 *         { value: 'weekly',  label: 'Semanal' },
 *         { value: 'monthly', label: 'Mensal'  },
 *     ],
 *     value: 'daily',
 *     onChange: (value) => console.log(value),
 * });
 * tg.mount('myContainerId');
 *
 * @param {object}   config
 * @param {{ value: string, label: string }[]} [config.options=[]]  — Opções do grupo.
 * @param {string}   [config.value=null]    — Valor selecionado inicial.
 * @param {function} [config.onChange]      — Callback chamado com o novo valor ao selecionar.
 *
 * @returns {{ el: HTMLElement, getValue, setValue, mount, destroy }}
 */
function createToggleGroup({ options = [], value = null, onChange = null } = {}) {
    let _value = value;

    const el = document.createElement('div');
    el.className = 'wcm-toggle-group';

    function _esc(v) {
        return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _render() {
        el.innerHTML = options.map(opt => `
            <button
                class="wcm-toggle-btn${String(_value) === String(opt.value) ? ' wcm-toggle-btn--active' : ''}"
                data-value="${_esc(String(opt.value))}"
                type="button"
            >${_esc(opt.label)}</button>
        `).join('');

        el.querySelectorAll('.wcm-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const newValue = btn.dataset.value;
                if (newValue === String(_value)) return;
                _value = newValue;
                _render();
                if (onChange) onChange(_value);
            });
        });
    }

    function getValue() {
        return _value;
    }

    function setValue(newValue) {
        _value = newValue;
        _render();
    }

    function mount(containerOrId) {
        const container = typeof containerOrId === 'string'
            ? document.getElementById(containerOrId)
            : containerOrId;
        if (container) container.appendChild(el);
    }

    function destroy() {
        el.remove();
    }

    _render();

    return { el, getValue, setValue, mount, destroy };
}
