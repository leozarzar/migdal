/**
 * @file notifications.js
 * @description NotificationsManager — gerencia o badge de notificações no header,
 * o painel dropdown de alertas e o polling periódico (5 min, pausado em inatividade).
 */

function _notifEsc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ── Estado ────────────────────────────────────────────────────────────────

const NotificationsManager = {
    /** @type {Array<{id:number, type:string, title:string, message:string, severity:string}>} */
    _data: [],

    /** @type {{total:number, critical:number, warning:number}} */
    _count: { total: 0, critical: 0, warning: 0 },

    /**
     * Chaves compostas das notificações já vistas — usadas para detectar novidades.
     * Formato: "type|entity_type|entity_id" — estável mesmo quando o DB reinsere com novo id.
     * Persistido em localStorage para sobreviver a reloads de página.
     */
    _knownKeys: new Set(),

    /** @type {number|null} */
    _pollInterval: null,

    /** @type {HTMLElement|null} */
    _panelEl: null,

    /** @type {boolean} */
    _isOpen: false,

    /** Referência ao listener de clique externo para remoção correta. */
    _outsideHandler: null,

    /** @type {object|null} Dialog do relatório semanal. */
    _reportDialog: null,

// ── Ciclo de vida ─────────────────────────────────────────────────────────

    /**
     * Inicializa o sistema: gera notificações, carrega contagem,
     * atualiza o badge e inicia o polling periódico.
     * Deve ser chamado uma única vez no startup do app.
     */
    /** Gera uma chave composta estável para uma notificação (independente do id do banco). */
    _makeKey(n) {
        // weekly_report não tem entity — usa created_at como discriminador único
        if (n.type === 'weekly_report') return `weekly_report|${n.created_at || n.id}`;
        return `${n.type}|${n.entity_type || ''}|${n.entity_id ?? ''}`;
    },

    _loadKnownKeys() {
        try {
            const raw = localStorage.getItem('wcm.notifications.knownKeys');
            if (raw) this._knownKeys = new Set(JSON.parse(raw));
        } catch { /* ignorar */ }
    },

    _saveKnownKeys() {
        try {
            localStorage.setItem('wcm.notifications.knownKeys', JSON.stringify([...this._knownKeys]));
        } catch { /* ignorar */ }
    },

    /**
     * Compara lista de notificações com _knownKeys, dispara toasts para as novas,
     * atualiza _knownKeys + badge e persiste no localStorage.
     * @param {Array} items
     */
    _processNewItems(items) {
        // Se o painel está aberto, o badge já foi zerado — não sobrescrever
        if (this._isOpen) return;

        const unread = items.filter(n => !this._knownKeys.has(this._makeKey(n)));

        this._count.total    = unread.length;
        this._count.critical = unread.filter(n => n.severity === 'critical').length;
        this._count.warning  = unread.filter(n => n.severity === 'warning').length;
        this._updateBadge();
    },

    async init() {
        this._loadKnownKeys();
        await this._generate();
        try {
            const initial = await apiCall(API + '/notifications');
            this._processNewItems(initial);
        } catch { /* silencioso */ }
        this._startPolling();

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this._stopPolling();
            } else {
                this._poll();
                this._startPolling();
            }
        });
    },

// ── Geração e polling ─────────────────────────────────────────────────────

    async _generate() {
        try {
            await apiCall(API + '/notifications/generate', { method: 'POST' });
        } catch { /* silencioso — não bloquear o startup */ }
    },

    async _fetchCount() {
        try {
            const data = await apiCall(API + '/notifications/count');
            this._count = { total: data.total || 0, critical: data.critical || 0, warning: data.warning || 0 };
            this._updateBadge();
        } catch { /* silencioso */ }
    },

    _startPolling() {
        this._stopPolling();
        this._pollInterval = setInterval(() => this._poll(), 5 * 60 * 1000);
    },

    _stopPolling() {
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
        }
    },

    async _poll() {
        try {
            await this._generate();
            const data = await apiCall(API + '/notifications');
            this._processNewItems(data);
            if (this._isOpen) this._renderPanelContent(data);
        } catch { /* silencioso */ }
    },

// ── Badge ─────────────────────────────────────────────────────────────────

    _updateBadge() {
        const badge = document.getElementById('notifBadge');
        if (!badge) return;
        const total = this._count.total || 0;
        if (total === 0) {
            badge.hidden = true;
            badge.textContent = '';
        } else {
            badge.hidden = false;
            badge.textContent = total > 99 ? '99+' : String(total);
            badge.className = 'notif-badge' + (this._count.critical > 0 ? ' notif-badge--critical' : '');
        }
    },

// ── Painel ────────────────────────────────────────────────────────────────

    togglePanel() {
        if (this._isOpen) {
            this._closePanel();
        } else {
            this.openPanel();
        }
    },

    async openPanel() {
        this._isOpen = true;

        // Zera o badge imediatamente ao abrir — feedback visual instantâneo
        this._count = { total: 0, critical: 0, warning: 0 };
        this._updateBadge();

        try {
            this._data = await apiCall(API + '/notifications');
        } catch { this._data = []; }

        // Marca todas as notificações atuais como vistas e persiste
        for (const n of this._data) this._knownKeys.add(this._makeKey(n));
        this._saveKnownKeys();

        this._renderPanel();
    },

    _closePanel() {
        this._isOpen = false;
        if (this._panelEl) { this._panelEl.remove(); this._panelEl = null; }
        if (this._outsideHandler) {
            document.removeEventListener('mousedown', this._outsideHandler);
            this._outsideHandler = null;
        }
    },

    _renderPanel() {
        if (this._panelEl) this._panelEl.remove();

        const panel = document.createElement('div');
        panel.className = 'notif-panel';
        panel.id = 'notifPanel';
        document.body.appendChild(panel);
        this._panelEl = panel;

        this._renderPanelContent(this._data);

        // Posicionar abaixo do sino
        const bell = document.getElementById('notifBell');
        if (bell) {
            const rect = bell.getBoundingClientRect();
            panel.style.top   = (rect.bottom + 6) + 'px';
            panel.style.right = (window.innerWidth - rect.right) + 'px';
        }

        // Fechar ao clicar fora
        this._outsideHandler = (e) => {
            const bell = document.getElementById('notifBell');
            if (!panel.contains(e.target) && (!bell || !bell.contains(e.target))) {
                this._closePanel();
            }
        };
        setTimeout(() => document.addEventListener('mousedown', this._outsideHandler), 0);
    },

    /**
     * Converte o texto plano do relatório em HTML estruturado para a dialog.
     * Detecta cabeçalhos de seção (com ou sem **) e bullets.
     */
    _formatReportDialogHtml(text) {
        const SECTIONS = [
            { re: /RESUMO EXECUTIVO/i,    icon: 'analytics',        color: 'blue'   },
            { re: /PONTOS DE ATEN/i,      icon: 'report_problem',   color: 'amber'  },
            { re: /DESTAQUES POSITIVOS/i, icon: 'thumb_up',         color: 'green'  },
            { re: /RECOMENDA/i,           icon: 'tips_and_updates', color: 'purple' },
            { re: /AN[ÁA]LISE DE KPI/i,  icon: 'speed',            color: 'teal'   },
        ];
        const lines = text.split('\n');
        let html = '';
        let inList = false;
        for (const raw of lines) {
            const line = raw.trim();
            if (!line) {
                if (inList) { html += '</ul>'; inList = false; }
                continue;
            }
            const clean = line.replace(/\*\*/g, '');
            const sec = SECTIONS.find(s => s.re.test(clean));
            if (sec) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<div class="notif-report-dlg-section notif-report-dlg-section--${sec.color}"><span class="material-symbols-outlined">${sec.icon}</span><span>${_notifEsc(clean)}</span></div>`;
                continue;
            }
            if (line.startsWith('•') || line.startsWith('-')) {
                if (!inList) { html += '<ul class="notif-report-dlg-list">'; inList = true; }
                html += `<li>${_notifEsc(line.replace(/^[•\-]\s*/, ''))}</li>`;
                continue;
            }
            if (inList) { html += '</ul>'; inList = false; }
            html += `<p class="notif-report-dlg-para">${_notifEsc(line)}</p>`;
        }
        if (inList) html += '</ul>';
        return html;
    },

    _renderPanelContent(items) {
        if (!this._panelEl) return;

        const SEV_ICON  = { critical: 'error', warning: 'warning', info: 'info' };
        const isEmpty   = !items || !items.length;

        const cardsHtml = isEmpty
            ? `<div class="notif-panel-empty">
                   <span class="material-symbols-outlined">notifications_none</span>
                   <p>Nenhuma notificação ativa</p>
               </div>`
            : items.map(n => {
                const ago = this._timeAgo(n.created_at);
                if (n.type === 'weekly_report') {
                    return `
                        <div class="notif-card notif-card--report">
                            <span class="notif-card__icon material-symbols-outlined">summarize</span>
                            <div class="notif-card__body">
                                <p class="notif-card__title">Relatório Semanal</p>
                                <p class="notif-card__msg">Gerado automaticamente</p>
                                <p class="notif-card__time">${ago}</p>
                            </div>
                            <div class="notif-card__report-actions">
                                <button class="notif-card__view-btn"
                                        onclick="NotificationsManager.openReportDialog(${n.id})">
                                    <span class="material-symbols-outlined">open_in_new</span>
                                    Ver
                                </button>
                                <button class="notif-card__dismiss"
                                        title="Dispensar"
                                        onclick="NotificationsManager.dismiss(${n.id})">×</button>
                            </div>
                        </div>`;
                }
                return `
                    <div class="notif-card notif-card--${_notifEsc(n.severity)}">
                        <span class="notif-card__icon material-symbols-outlined">${SEV_ICON[n.severity] || 'info'}</span>
                        <div class="notif-card__body">
                            <p class="notif-card__title">${_notifEsc(n.title)}</p>
                            <p class="notif-card__msg">${_notifEsc(n.message)}</p>
                            <p class="notif-card__time">${ago}</p>
                        </div>
                        <button class="notif-card__dismiss"
                                title="Dispensar"
                                onclick="NotificationsManager.dismiss(${n.id})">×</button>
                    </div>`;
            }).join('');

        const dismissAllBtn = !isEmpty
            ? `<button class="notif-panel-dismiss-all" onclick="NotificationsManager.dismissAll()">Dispensar todas</button>`
            : '';

        this._panelEl.innerHTML =
            `<div class="notif-panel-header">
                 <span class="notif-panel-title">Notificações</span>
                 ${dismissAllBtn}
             </div>
             <div class="notif-panel-list">${cardsHtml}</div>`;

        // Atualizar referência de dados locais com o que está sendo exibido
        if (items) this._data = items;
    },

    /**
     * Retorna tempo relativo desde created_at (ex: "há 3 min", "há 2h", "há 1 dia").
     * created_at vem do SQLite como UTC sem timezone: 'YYYY-MM-DD HH:MM:SS'.
     * @param {string} createdAt
     * @returns {string}
     */
    _timeAgo(createdAt) {
        if (!createdAt) return '';
        const ms = Date.now() - new Date(createdAt.replace(' ', 'T') + 'Z').getTime();
        const s  = Math.floor(ms / 1000);
        if (s <  60)  return `há ${s}s`;
        const m = Math.floor(s / 60);
        if (m <  60)  return `há ${m} min`;
        const h = Math.floor(m / 60);
        if (h <  24)  return `há ${h}h`;
        const d = Math.floor(h / 24);
        return `há ${d} dia${d > 1 ? 's' : ''}`;
    },

    /** Formata 'YYYY-MM-DD' como 'dd/mm/aa'. */
    _fmtDate(str) {
        if (!str) return '—';
        const [y, m, d] = str.slice(0, 10).split('-');
        return `${d}/${m}/${y.slice(2)}`;
    },

    /** Formata 'YYYY-MM-DD HH:MM:SS' como 'dd/mm/aa HH:MM'. */
    _fmtDateTime(str) {
        if (!str) return '—';
        const [date, time = ''] = str.split(' ');
        const [y, m, d] = date.split('-');
        const [h, min]  = (time || '00:00').split(':');
        return `${d}/${m}/${y.slice(2)} ${h}:${min}`;
    },

    /**
     * Abre a dialog com o relatório semanal formatado.
     * Busca metadados (período, emissão) do endpoint /weekly-report/latest.
     * @param {number} id
     */
    async openReportDialog(id) {
        if (this._reportDialog) { this._reportDialog.destroy(); this._reportDialog = null; }
        const n = this._data.find(x => x.id === id);
        if (!n) return;
        this._closePanel();

        let metaHtml = '';
        try {
            const report = await apiCall(API + '/weekly-report/latest');
            if (report) {
                metaHtml = `<div class="notif-report-dlg-meta">
                    <span><span class="material-symbols-outlined">date_range</span>${this._fmtDate(report.week_start)} → ${this._fmtDate(report.week_end)}</span>
                    <span><span class="material-symbols-outlined">schedule</span>Emissão em ${this._fmtDateTime(report.created_at)}</span>
                </div>`;
            }
        } catch { /* silencioso */ }

        this._reportDialog = createDialog({
            title: 'Relatório Semanal de Estoque',
            subtitle: 'Análise gerada com IA a partir dos dados operacionais da semana.',
            bodyHTML: `<div class="notif-report-dlg-body">${metaHtml}${this._formatReportDialogHtml(n.message)}</div>`,
            wide: true,
            actions: [
                {
                    label: 'Dispensar notificação',
                    className: 'btn-secondary',
                    onClick: () => { this._reportDialog.close(); this.dismiss(id); },
                },
                {
                    label: 'Fechar',
                    className: 'btn-primary',
                    onClick: () => this._reportDialog.close(),
                },
            ],
            onClose: () => { this._reportDialog = null; },
        });
        this._reportDialog.open();
    },

// ── Ações públicas ────────────────────────────────────────────────────────

    /**
     * Dispensa uma notificação individual.
     * @param {number} id
     */
    async dismiss(id) {
        try {
            await apiCall(API + '/notifications/' + id + '/dismiss', { method: 'PATCH' });
            this._data = this._data.filter(n => n.id !== id);
            this._count.total    = Math.max(0, (this._count.total    || 0) - 1);
            this._count.critical = this._data.filter(n => n.severity === 'critical').length;
            this._count.warning  = this._data.filter(n => n.severity === 'warning').length;
            this._updateBadge();
            this._renderPanelContent(this._data);
        } catch (e) { alert(e.message); }
    },

    /**
     * Dispensa todas as notificações ativas.
     */
    async dismissAll() {
        try {
            for (const n of this._data) {
                await apiCall(API + '/notifications/' + n.id + '/dismiss', { method: 'PATCH' });
            }
            this._data           = [];
            this._count          = { total: 0, critical: 0, warning: 0 };
            this._updateBadge();
            this._renderPanelContent(this._data);
        } catch (e) { alert(e.message); }
    },
};
