/**
 * @module auth
 * @description Rotas de autenticação: cadastro, login, verificação de sessão e logout.
 *
 * Senhas armazenadas com PBKDF2-SHA512 (100k iterações, salt aleatório por usuário).
 * Sessões gerenciadas via token opaco (32 bytes hex) armazenado no SQLite.
 *
 * Variável de ambiente:
 *   WCM_RELEASE_CODE — código obrigatório para cadastro (default: WCM-ADMIN)
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../db');

// ── Configuração ──────────────────────────────────────────────────────────

const RELEASE_CODE   = process.env.WCM_RELEASE_CODE || 'WCM-ADMIN';
const PBKDF2_ITER    = 100000;
const PBKDF2_KEYLEN  = 64;
const PBKDF2_DIGEST  = 'sha512';
const SESSION_HOURS  = 24 * 7;     // Token expira em 7 dias

// ── Tabelas ───────────────────────────────────────────────────────────────

db.run(`CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`);

// ── Helpers ───────────────────────────────────────────────────────────────

function hashPassword(password, salt) {
    return crypto
        .pbkdf2Sync(password, salt, PBKDF2_ITER, PBKDF2_KEYLEN, PBKDF2_DIGEST)
        .toString('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function expiresAt() {
    const d = new Date();
    d.setHours(d.getHours() + SESSION_HOURS);
    return d.toISOString();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── POST /auth/register ───────────────────────────────────────────────────

router.post('/register', (req, res) => {
    const { name, email, password, confirm_password, release_code } = req.body || {};

    if (!name || !email || !password || !confirm_password || !release_code) {
        return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios.' });
    }

    const nameTrim  = String(name).trim();
    const emailNorm = String(email).toLowerCase().trim();

    if (nameTrim.length < 2) {
        return res.status(400).json({ success: false, message: 'O nome deve ter pelo menos 2 caracteres.' });
    }
    if (!EMAIL_RE.test(emailNorm)) {
        return res.status(400).json({ success: false, message: 'E-mail inválido.' });
    }
    if (String(password).length < 8) {
        return res.status(400).json({ success: false, message: 'A senha deve ter pelo menos 8 caracteres.' });
    }
    if (password !== confirm_password) {
        return res.status(400).json({ success: false, message: 'As senhas não coincidem.' });
    }
    if (String(release_code).trim() !== RELEASE_CODE) {
        return res.status(403).json({ success: false, message: 'Código de liberação inválido.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);

    db.run(
        'INSERT INTO users (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)',
        [nameTrim, emailNorm, hash, salt],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(409).json({ success: false, message: 'E-mail já cadastrado.' });
                }
                return res.status(500).json({ success: false, message: 'Erro ao criar conta.', error: err.message });
            }

            const userId = this.lastID;
            const token  = generateToken();

            db.run(
                'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
                [userId, token, expiresAt()],
                (err2) => {
                    if (err2) {
                        return res.status(500).json({ success: false, message: 'Erro ao criar sessão.', error: err2.message });
                    }
                    res.json({ success: true, token, email: emailNorm, name: nameTrim });
                }
            );
        }
    );
});

// ── POST /auth/login ──────────────────────────────────────────────────────

router.post('/login', (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'E-mail e senha são obrigatórios.' });
    }

    const emailNorm = String(email).toLowerCase().trim();

    db.get('SELECT * FROM users WHERE email = ?', [emailNorm], (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Erro interno.', error: err.message });
        }
        // Resposta genérica para não vazar se o e-mail existe
        if (!user) {
            return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos.' });
        }

        const hash = hashPassword(password, user.password_salt);
        if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.password_hash))) {
            return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos.' });
        }

        const token = generateToken();

        db.run(
            'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, token, expiresAt()],
            (err2) => {
                if (err2) {
                    return res.status(500).json({ success: false, message: 'Erro ao criar sessão.', error: err2.message });
                }
                res.json({ success: true, token, email: emailNorm, name: user.name });
            }
        );
    });
});

// ── GET /auth/verify ──────────────────────────────────────────────────────

router.get('/verify', (req, res) => {
    const token = req.headers['x-auth-token'];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Token ausente.' });
    }

    db.get(
        `SELECT s.token, u.email, u.name
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = ? AND s.expires_at > datetime('now')`,
        [token],
        (err, session) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Erro interno.', error: err.message });
            }
            if (!session) {
                return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada.' });
            }
            res.json({ success: true, email: session.email, name: session.name });
        }
    );
});

// ── POST /auth/logout ─────────────────────────────────────────────────────

router.post('/logout', (req, res) => {
    const token = req.headers['x-auth-token'];
    if (!token) return res.json({ success: true });

    db.run('DELETE FROM sessions WHERE token = ?', [token], () => {
        res.json({ success: true });
    });
});

module.exports = router;
