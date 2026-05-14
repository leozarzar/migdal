/**
 * @module company
 * @description Rotas de dados da empresa.
 *
 * Tabela:
 *   company — informações centralizadas da empresa
 *
 * GET é público (qualquer usuário autenticado).
 * POST/PUT exigem papel admin.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ── GET /company ──────────────────────────────────────────────────────────

router.get('/', (req, res) => {
    db.get(`SELECT * FROM company LIMIT 1`, [], (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Erro ao buscar dados da empresa.', error: err.message });
        }
        res.json(row || {});
    });
});

// ── POST /company ─────────────────────────────────────────────────────────

router.post('/', (req, res) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ success: false, message: 'Apenas administradores podem criar dados da empresa.' });
    }

    const { name, cnpj, ie, address, neighborhood, city, state, cep, phone, email } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, message: 'Nome da empresa é obrigatório.' });
    }

    db.run(
        `INSERT INTO company (name, cnpj, ie, address, neighborhood, city, state, cep, phone, email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, cnpj || '', ie || '', address || '', neighborhood || '', city || '', state || '', cep || '', phone || '', email || ''],
        function (err) {
            if (err) {
                return res.status(500).json({ success: false, message: 'Erro ao criar dados da empresa.', error: err.message });
            }

            db.get(`SELECT * FROM company WHERE id = ?`, [this.lastID], (selectErr, row) => {
                if (selectErr || !row) {
                    return res.status(500).json({ success: false, message: 'Erro ao recuperar dados criados.' });
                }
                res.json(row);
            });
        }
    );
});

// ── PUT /company/:id ──────────────────────────────────────────────────────

router.put('/:id', (req, res) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ success: false, message: 'Apenas administradores podem atualizar dados da empresa.' });
    }

    const id = req.params.id;
    const { name, cnpj, ie, address, neighborhood, city, state, cep, phone, email } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, message: 'Nome da empresa é obrigatório.' });
    }

    db.run(
        `UPDATE company SET name = ?, cnpj = ?, ie = ?, address = ?, neighborhood = ?, city = ?, state = ?, cep = ?, phone = ?, email = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [name, cnpj || '', ie || '', address || '', neighborhood || '', city || '', state || '', cep || '', phone || '', email || '', id],
        function (err) {
            if (err) {
                return res.status(500).json({ success: false, message: 'Erro ao atualizar dados da empresa.', error: err.message });
            }

            if (this.changes === 0) {
                return res.status(404).json({ success: false, message: 'Empresa não encontrada.' });
            }

            db.get(`SELECT * FROM company WHERE id = ?`, [id], (selectErr, row) => {
                if (selectErr || !row) {
                    return res.status(500).json({ success: false, message: 'Erro ao recuperar dados atualizados.' });
                }
                res.json(row);
            });
        }
    );
});

// ── POST /company/logo ────────────────────────────────────────────────────

const LOGO_DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_LOGO_BYTES   = 3 * 1024 * 1024;

router.post('/logo', (req, res) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ success: false, message: 'Apenas administradores podem alterar o logo.' });
    }

    const logo = (req.body && req.body.logo) || '';
    if (typeof logo !== 'string' || !LOGO_DATA_URL_RE.test(logo)) {
        return res.status(400).json({ success: false, message: 'Formato de imagem inválido. Use PNG, JPEG ou WebP.' });
    }
    if (Buffer.byteLength(logo, 'utf8') > MAX_LOGO_BYTES) {
        return res.status(400).json({ success: false, message: 'Logo muito grande. Máximo 3 MB.' });
    }

    db.run(`UPDATE company SET logo = ? WHERE id = (SELECT id FROM company LIMIT 1)`, [logo], function (err) {
        if (err) return res.status(500).json({ success: false, message: 'Erro ao salvar logo.', error: err.message });
        res.json({ success: true, logo });
    });
});

// ── DELETE /company/logo ──────────────────────────────────────────────────

router.delete('/logo', (req, res) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ success: false, message: 'Apenas administradores podem remover o logo.' });
    }

    db.run(`UPDATE company SET logo = NULL WHERE id = (SELECT id FROM company LIMIT 1)`, [], function (err) {
        if (err) return res.status(500).json({ success: false, message: 'Erro ao remover logo.', error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;
