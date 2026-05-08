/**
 * @file dialog.js
 * @description Utilitário para criação de modais com backdrop, título, corpo
 *   arbitrário e botões de ação configuráveis.
 *
 * @example
 * const dlg = createDialog({
 *     title: 'Confirmar',
 *     subtitle: '3 itens serão removidos.',
 *     bodyHTML: '<input id="myField" class="...">',
 *     actions: [
 *         { label: 'Confirmar', className: 'btn-primary', onClick: () => dlg.close() },
 *         { label: 'Cancelar',  className: 'btn-secondary', onClick: () => dlg.close() },
 *     ],
 * });
 * dlg.open();
 * // later:
 * dlg.destroy();
 *
 * @param {object}   config
 * @param {string}   config.title                  — Título do dialog.
 * @param {string}   [config.subtitle]             — Texto secundário abaixo do título.
 * @param {string}   [config.bodyHTML='']          — HTML arbitrário do corpo.
 * @param {Array}    [config.actions=[]]           — Botões de ação.
 *   Cada item: { label, variant?, icon?, id?, onClick? }
 *   - `variant` é repassado para createButton: 'primary', 'secondary', 'cancel', 'ghost' (padrão: 'secondary').
 *   - `icon` é o nome de um Material Symbol.
 * @param {boolean}  [config.wide=false]           — Painel mais largo (600 px).
 * @param {boolean}  [config.overflowVisible=false] — Permite overflow visível (para dropdowns).
 * @param {boolean}  [config.closeOnBackdrop=true] — Fecha ao clicar fora.
 * @param {function} [config.onOpen]               — Callback ao abrir.
 * @param {function} [config.onClose]              — Callback ao fechar.
 *
 * @returns {{ open, close, destroy, setTitle, setSubtitle, el }}
 */
function createDialog(config) {
    const _closeOnBackdrop = config.closeOnBackdrop !== false;

    // ── Escape helper ──────────────────────────────────────────────────────
    function _esc(v) {
        return String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ── Monta DOM ──────────────────────────────────────────────────────────
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.style.display = 'none';

    const panel = document.createElement('div');
    panel.className = 'dialog-panel'
        + (config.wide ? ' dialog-panel--wide' : '')
        + (config.overflowVisible ? ' dialog-panel--overflow-visible' : '');

    panel.innerHTML = `
        <div class="dialog-header">
            <h3 class="dialog-title">${_esc(config.title)}</h3>
            <button class="dialog-close" type="button" aria-label="Fechar">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        ${config.subtitleHTML ? `<p class="dialog-subtitle">${config.subtitleHTML}</p>` : config.subtitle ? `<p class="dialog-subtitle">${_esc(config.subtitle)}</p>` : ''}
        <div class="dialog-body">
            ${config.bodyHTML || ''}
        </div>
        ${(config.actions || []).length ? '<div class="dialog-actions"></div>' : ''}
    `;

    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    // ── Renderiza botões de ação com createButton ──────────────────────────
    const actionsEl = panel.querySelector('.dialog-actions');
    const _actionBtns = (config.actions || []).map(action => {
        const variant = action.variant || 'secondary';
        const btn = createButton({ label: action.label, variant, icon: action.icon, onClick: action.onClick });
        if (action.id) btn.el.id = action.id;
        actionsEl?.appendChild(btn.el);
        return btn;
    });

    // ── Eventos ────────────────────────────────────────────────────────────
    panel.querySelector('.dialog-close').onclick = close;

    if (_closeOnBackdrop) {
        backdrop.addEventListener('click', e => {
            if (e.target === backdrop) close();
        });
    }

    // ── API pública ────────────────────────────────────────────────────────

    /** Exibe o dialog. */
    function open() {
        backdrop.style.display = 'flex';
        config.onOpen?.();
    }

    /** Oculta o dialog sem removê-lo do DOM. */
    function close() {
        backdrop.style.display = 'none';
        config.onClose?.();
    }

    /** Remove o dialog do DOM definitivamente. */
    function destroy() {
        _actionBtns.forEach(b => b.destroy());
        backdrop.remove();
    }

    /** Atualiza o título do dialog. */
    function setTitle(text) {
        const el = panel.querySelector('.dialog-title');
        if (el) el.textContent = text;
    }

    /** Atualiza o subtítulo do dialog. */
    function setSubtitle(text) {
        const el = panel.querySelector('.dialog-subtitle');
        if (el) el.textContent = text;
    }

    return { open, close, destroy, setTitle, setSubtitle, el: panel };
}
