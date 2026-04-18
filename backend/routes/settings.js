/**
 * @module settings
 * @description Rotas de configuração global da aplicação.
 *
 * Tabela:
 *   app_settings — pares chave/valor com configurações do sistema
 *
 * GET é público (qualquer usuário autenticado).
 * PUT exige papel admin.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// Chaves permitidas — impede criação de settings arbitrárias
const ALLOWED_KEYS = new Set([
]);

// Valores válidos por chave
const VALID_VALUES = {
};

// ── GET /settings ─────────────────────────────────────────────────────────

router.get('/', (req, res) => {
    db.all(`SELECT key, value FROM app_settings ORDER BY key`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Erro ao buscar configurações.', error: err.message });
        }
        const settings = {};
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        res.json(settings);
    });
});

// ── PUT /settings/:key ────────────────────────────────────────────────────

router.put('/:key', (req, res) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ success: false, message: 'Apenas administradores podem alterar configurações.' });
    }

    const key = req.params.key;
    if (!ALLOWED_KEYS.has(key)) {
        return res.status(400).json({ success: false, message: `Configuração '${key}' não é válida.` });
    }

    const { value } = req.body;
    if (value == null || typeof value !== 'string') {
        return res.status(400).json({ success: false, message: 'Valor é obrigatório e deve ser string.' });
    }

    const allowed = VALID_VALUES[key];
    if (allowed && !allowed.includes(value)) {
        return res.status(400).json({ success: false, message: `Valor inválido. Permitidos: ${allowed.join(', ')}` });
    }

    db.run(
        `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value],
        function (err) {
            if (err) {
                return res.status(500).json({ success: false, message: 'Erro ao salvar configuração.', error: err.message });
            }
            res.json({ success: true, key, value });
        }
    );
});

module.exports = router;
