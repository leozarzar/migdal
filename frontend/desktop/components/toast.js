/**
 * @file toast.js
 * @description Toast notification component.
 * Displays temporary messages in the bottom-right corner of the screen.
 */

function _escToast(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Exibe um toast temporário no canto inferior direito da tela.
 * @param {string} message - Texto do toast.
 * @param {'info'|'success'|'warning'|'danger'} [type='info'] - Tipo visual.
 * @param {number} [duration=4000] - Duração em milissegundos antes do toast sumir.
 */
function showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const iconMap = { info: 'info', success: 'check_circle', warning: 'warning', danger: 'error' };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML =
        `<span class="toast__icon material-symbols-outlined">${iconMap[type] || 'info'}</span>` +
        `<span class="toast__message">${_escToast(message)}</span>` +
        `<button class="toast__close" onclick="this.parentElement.remove()">×</button>`;

    container.appendChild(toast);

    // Acionar animação de entrada na próxima frame
    requestAnimationFrame(() => toast.classList.add('toast--visible'));

    setTimeout(() => {
        toast.classList.remove('toast--visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}
