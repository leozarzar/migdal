/**
 * @file canvas-chart-utils.js
 * @description Utilitários compartilhados de renderização para gráficos em <canvas>:
 *   setup com DPR, eixo Y com grade, estado vazio, série de linhas suavizadas,
 *   posicionamento de tooltip e helpers de cor/spline.
 *
 *   Usado por: Dashboard, StockMonitor, ConsumptionStats e HomeScreen (mobile).
 *   Carregado após stock-policy-utils.js e antes de todos os screens.
 */
const CanvasChartUtils = {

    // ── Formatação ────────────────────────────────────────────────────────────

    /**
     * Formata valor numérico com sufixo K/M para rótulos de eixo.
     * Remove zeros à direita (ex.: 2.0K → "2K", 1.5M → "1.5M").
     * @param {number} v
     * @returns {string}
     */
    formatY(v) {
        if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + 'M';
        if (v >= 1_000)     return (v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1) + 'K';
        return Math.round(v).toString();
    },

    /**
     * Converte cor hexadecimal para string rgba.
     * @param {string} hex   - Cor em formato #RRGGBB.
     * @param {number} alpha - Opacidade (0–1).
     * @returns {string}
     */
    hexToRgba(hex, alpha) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return `rgba(100,116,139,${alpha})`;
        return `rgba(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)},${alpha})`;
    },

    // ── Setup do canvas ───────────────────────────────────────────────────────

    /**
     * Inicializa o canvas com escala DPR para telas Retina e retorna o contexto
     * 2D e a largura em CSS pixels.
     *
     * @param {HTMLCanvasElement} canvas
     * @param {number} height    - Altura em CSS pixels.
     * @param {number} [minWidth=300] - Largura mínima em CSS pixels.
     * @returns {{ ctx: CanvasRenderingContext2D, width: number }}
     */
    setupCanvas(canvas, height, minWidth = 300) {
        const wrapper       = canvas.parentElement;
        const dpr           = window.devicePixelRatio || 1;
        const width         = Math.max(canvas.offsetWidth || (wrapper ? wrapper.clientWidth : 640), minWidth);
        canvas.width        = Math.floor(width  * dpr);
        canvas.height       = Math.floor(height * dpr);
        canvas.style.height = height + 'px';
        const ctx           = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        return { ctx, width };
    },

    // ── Eixo Y ───────────────────────────────────────────────────────────────

    /**
     * Desenha o eixo Y: grade horizontal pontilhada (opcional) e rótulos K/M.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {{top,right,bottom,left}} padding
     * @param {number} chartWidth
     * @param {number} chartHeight
     * @param {number} yMax
     * @param {object} [opts]
     * @param {number}  [opts.gridCount=4]   - Número de linhas de grade.
     * @param {number}  [opts.fontSize=12]   - Tamanho da fonte dos rótulos (px).
     * @param {number}  [opts.labelOffset=8] - Distância em px entre rótulo e eixo.
     * @param {boolean} [opts.withGrid=true] - Desenha linhas de grade.
     */
    drawYAxis(ctx, padding, chartWidth, chartHeight, yMax, {
        gridCount   = 4,
        fontSize    = 12,
        labelOffset = 8,
        withGrid    = true,
    } = {}) {
        if (withGrid) {
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth   = 1;
            ctx.setLineDash([4, 4]);
            for (let i = 0; i <= gridCount; i++) {
                const y = padding.top + (chartHeight / gridCount) * i;
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(padding.left + chartWidth, y);
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }

        ctx.fillStyle    = '#607d9a';
        ctx.font         = `${fontSize}px Arial`;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i <= gridCount; i++) {
            const value = yMax - (yMax / gridCount) * i;
            const y     = padding.top + (chartHeight / gridCount) * i;
            ctx.fillText(CanvasChartUtils.formatY(value), padding.left - labelOffset, y);
        }
    },

    // ── Estado vazio ─────────────────────────────────────────────────────────

    /**
     * Exibe mensagem de estado vazio centralizada no canvas.
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} message
     * @param {number} width
     * @param {number} height
     * @param {number} [fontSize=14]
     */
    drawEmptyState(ctx, message, width, height, fontSize = 14) {
        ctx.fillStyle    = '#94a3b8';
        ctx.font         = `${fontSize}px Arial`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(message, width / 2, height / 2);
    },

    // ── Série de linhas suavizadas ────────────────────────────────────────────

    /**
     * Desenha uma série de linha suavizada com preenchimento gradiente e pontos.
     * Cada ponto é adicionado ao array `chartPoints` se fornecido.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Array<{x:number,y:number}>} pts
     * @param {string} color         - Cor hexadecimal (#RRGGBB).
     * @param {{top,right,bottom,left}} padding
     * @param {number} chartHeight
     * @param {Array|null} [chartPoints] - Array para acumular pontos (para hover).
     */
    drawLineSeries(ctx, pts, color, padding, chartHeight, chartPoints = null) {
        if (!pts.length) return;

        // Preenchimento com gradiente vertical (cor do material → transparente)
        const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
        grad.addColorStop(0, CanvasChartUtils.hexToRgba(color, 0.22));
        grad.addColorStop(1, CanvasChartUtils.hexToRgba(color, 0.02));

        ctx.save();
        ctx.beginPath();
        CanvasChartUtils.buildSmoothPath(ctx, pts);
        ctx.lineTo(pts[pts.length - 1].x, padding.top + chartHeight);
        ctx.lineTo(pts[0].x,              padding.top + chartHeight);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        // Linha suave (monotone cubic) sobre os pontos
        ctx.save();
        ctx.beginPath();
        CanvasChartUtils.buildSmoothPath(ctx, pts);
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2.5;
        ctx.lineJoin    = 'round';
        ctx.stroke();
        ctx.restore();

        // Registra pontos para detecção de hover (sem desenhar dots)
        if (chartPoints) pts.forEach(pt => chartPoints.push(pt));
    },

    // ── Tooltip ───────────────────────────────────────────────────────────────

    /**
     * Posiciona um elemento de tooltip relativo ao seu elemento wrapper,
     * deslocando automaticamente para evitar sair da área visível.
     *
     * @param {HTMLElement} tooltip
     * @param {MouseEvent}  e
     * @param {HTMLElement} wrap    - Elemento pai do canvas (bounding box de referência).
     * @param {number}      [margin=14]
     */
    positionTooltip(tooltip, e, wrap, margin = 14) {
        const rect = wrap.getBoundingClientRect();
        let tx = e.clientX - rect.left + margin;
        let ty = e.clientY - rect.top  + margin;
        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;
        if (tx + tw > rect.width  - 4) tx = e.clientX - rect.left - tw - margin;
        if (ty + th > rect.height - 4) ty = e.clientY - rect.top  - th - margin;
        tooltip.style.left = tx + 'px';
        tooltip.style.top  = ty + 'px';
    },

    // ── Spline monotônica (Fritsch-Carlson) ───────────────────────────────────

    /**
     * Traça um caminho suavizado no canvas usando interpolação cúbica monotônica
     * de Fritsch-Carlson. Garante que a curva passe por todos os pontos sem overshoot.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Array<{x:number, y:number}>} pts - Pontos ordenados por X.
     */
    buildSmoothPath(ctx, pts) {
        if (!pts.length) return;
        if (pts.length === 1) { ctx.moveTo(pts[0].x, pts[0].y); return; }
        if (pts.length === 2) { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); return; }

        const n = pts.length;

        // 1. Inclinações (Δy/Δx) entre pontos consecutivos
        const slopes = [];
        for (let i = 0; i < n - 1; i++) {
            const dx = pts[i + 1].x - pts[i].x;
            slopes.push(dx === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx);
        }

        // 2. Tangentes: média das inclinações vizinhas
        const m = new Array(n);
        m[0]     = slopes[0];
        m[n - 1] = slopes[n - 2];
        for (let i = 1; i < n - 1; i++) m[i] = (slopes[i - 1] + slopes[i]) / 2;

        // 3. Restrição de monotonicidade (α² + β² ≤ 9) — evita overshoot
        for (let i = 0; i < n - 1; i++) {
            if (slopes[i] === 0) { m[i] = 0; m[i + 1] = 0; }
            else {
                const alpha = m[i] / slopes[i];
                const beta  = m[i + 1] / slopes[i];
                const s = alpha * alpha + beta * beta;
                if (s > 9) {
                    const t = 3 / Math.sqrt(s);
                    m[i]     = alpha * t * slopes[i];
                    m[i + 1] = beta  * t * slopes[i];
                }
            }
        }

        // 4. Curvas Bézier cúbicas com pontos de controle derivados das tangentes
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < n - 1; i++) {
            const dx   = pts[i + 1].x - pts[i].x;
            const cp1x = pts[i].x     + dx / 3;
            const cp1y = pts[i].y     + m[i]     * dx / 3;
            const cp2x = pts[i + 1].x - dx / 3;
            const cp2y = pts[i + 1].y - m[i + 1] * dx / 3;
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, pts[i + 1].x, pts[i + 1].y);
        }
    },
};
