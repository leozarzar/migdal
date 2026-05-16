/**
 * @file items-widget.js
 * @description Componente de resumo de itens reutilizável.
 * Exibe card clicável (com ícone Lucide) quando há itens, ou mensagem de
 * placeholder quando vazio. Utiliza as classes CSS `rd-items-summary*` já
 * definidas em receipts-details-style.css.
 *
 * @example
 * const widget = createItemsWidget({
 *     icon: 'clipboard-list',
 *     emptyMessage: 'Selecione um fornecedor para ver os itens.',
 *     onEdit: () => PurchaseInvoiceForm.openItemsDialog(),
 * });
 * widget.mount(document.getElementById('pifItemsWidgetMount'));
 * widget.update({ count: 3, totalQty: 250, lines: ['Aço 1020', 'Alumínio'] });
 *
 * @param {object}        opts
 * @param {string}        [opts.icon='package-2']  - Nome do ícone Lucide
 * @param {string}        [opts.emptyMessage]       - Mensagem exibida quando count=0
 * @param {Function|null} [opts.onEdit]             - Callback ao clicar no card (null = read-only)
 *
 * @returns {{ el, mount, update, destroy }}
 */
function createItemsWidget(opts = {}) {
    const {
        icon         = 'package-2',
        emptyMessage = 'Nenhum item.',
        onEdit       = null,
    } = opts;

    const el = document.createElement('div');

    // ── Render ──────────────────────────────────────────────────────────────

    /**
     * Atualiza o widget com novos dados de itens.
     * @param {object}   data
     * @param {number}   [data.count=0]       - Número de itens
     * @param {number}   [data.totalQty=0]    - Quantidade total
     * @param {string[]} [data.lines=[]]      - Nomes/descrições para exibir
     * @param {string}   [data.countLabel]    - Rótulo personalizado (ex: "3 prazos")
     * @param {string}   [data.totalLabel]    - Total formatado (ex: "R$ 1.200,00")
     */
    function update({ count = 0, totalQty = 0, lines = [], countLabel = null, totalLabel = null } = {}) {
        // Remove listener anterior, se houver
        const prev = el.querySelector('.rd-items-summary');
        if (prev) prev.removeEventListener('click', _handleClick);

        if (count === 0) {
            el.innerHTML = `<p class="rd-items-empty">${_esc(emptyMessage)}</p>`;
            return;
        }

        const clickable = typeof onEdit === 'function';
        const matText = lines.length <= 2
            ? lines.map(l => _esc(l)).join(', ')
            : lines.slice(0, 2).map(l => _esc(l)).join(', ') + ` +${lines.length - 2} mais`;

        const summaryCount = countLabel ?? `${count} ${count === 1 ? 'item' : 'itens'}`;
        const summaryTotal = totalLabel ?? String(totalQty);

        el.innerHTML = `
            <div class="rd-items-summary${clickable ? ' rd-items-summary--clickable' : ''}">
                <div class="rd-items-summary-left">
                    <i data-lucide="${_esc(icon)}" class="rd-items-summary-icon rd-items-summary-icon--left"></i>
                    <div class="rd-items-summary-info">
                        <span class="rd-items-summary-count">${_esc(summaryCount)} · Total: ${_esc(summaryTotal)}</span>
                        <span class="rd-items-summary-materials">${matText}</span>
                    </div>
                </div>
                ${clickable ? `<i data-lucide="pencil-line" class="rd-items-summary-icon"></i>` : ''}
            </div>`;

        if (clickable) {
            el.querySelector('.rd-items-summary').addEventListener('click', _handleClick);
        }
        if (typeof lucide !== 'undefined') {
            lucide.createIcons({ nameAttr: 'data-lucide', rootNode: el });
        }
    }

    function _handleClick() {
        if (typeof onEdit === 'function') onEdit();
    }

    // ── API Pública ──────────────────────────────────────────────────────────

    /** Monta o widget em um elemento container. */
    function mount(container) {
        if (container) container.appendChild(el);
    }

    /** Remove o widget do DOM. */
    function destroy() {
        el.remove();
    }

    // Estado inicial vazio
    update();

    return { el, mount, update, destroy };
}
