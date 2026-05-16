/**
 * @file tabs.js
 * @description Componente de abas com sublinhado animado na aba ativa.
 *   Renderiza apenas a barra de abas — o conteúdo dos painéis fica a cargo do consumidor.
 *
 * @example
 * const tabs = createTabs({
 *     tabs: [
 *         { key: 'detalhes', label: 'Detalhes' },
 *         { key: 'itens',    label: 'Itens'    },
 *     ],
 *     active: 'detalhes',
 *     onChange: key => console.log('mudou para', key),
 * });
 * tabs.mount(document.getElementById('myTabsMount'));
 *
 * @param {object}   opts
 * @param {Array<{key, label}>} opts.tabs
 * @param {string}   [opts.active]    - key da aba inicialmente ativa (default: primeira)
 * @param {Function} [opts.onChange]  - callback(key) ao mudar de aba
 *
 * @returns {{ el, mount, setActive, getActive, destroy }}
 */
function createTabs(opts = {}) {
    const tabs = Array.isArray(opts.tabs) ? opts.tabs : [];
    let _active = opts.active || (tabs[0] && tabs[0].key) || null;

    const el = document.createElement('div');
    el.className = 'wcm-tabs';
    el.setAttribute('role', 'tablist');

    const _buttons = new Map();

    tabs.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wcm-tabs-btn';
        btn.setAttribute('role', 'tab');
        btn.dataset.key = t.key;
        btn.textContent = t.label;
        btn.addEventListener('click', () => setActive(t.key));
        el.appendChild(btn);
        _buttons.set(t.key, btn);
    });

    function _refresh() {
        _buttons.forEach((btn, key) => {
            const isActive = key === _active;
            btn.classList.toggle('wcm-tabs-btn--active', isActive);
            btn.setAttribute('aria-selected', String(isActive));
            btn.tabIndex = isActive ? 0 : -1;
        });
    }

    function setActive(key) {
        if (!_buttons.has(key) || key === _active) return;
        _active = key;
        _refresh();
        if (typeof opts.onChange === 'function') opts.onChange(key);
    }

    function getActive() { return _active; }

    function mount(container) {
        if (container) container.appendChild(el);
    }

    function destroy() { el.remove(); }

    _refresh();

    return { el, mount, setActive, getActive, destroy };
}
