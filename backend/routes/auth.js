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
    role_id       INTEGER REFERENCES roles(id),
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`ALTER TABLE users ADD COLUMN avatar TEXT`, () => {});

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

            // Se este é o primeiro usuário do sistema, atribuir automaticamente
            // o papel Administrador (is_admin = 1) para garantir acesso total.
            db.get(`SELECT id FROM roles WHERE is_admin = 1 LIMIT 1`, [], (_, adminRole) => {
                if (adminRole) {
                    db.run(`UPDATE users SET role_id = ? WHERE id = ? AND role_id IS NULL`,
                        [adminRole.id, userId]);
                }
                const token = generateToken();
                db.run(
                    'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
                    [userId, token, expiresAt()],
                    (err2) => {
                        if (err2) {
                            return res.status(500).json({ success: false, message: 'Erro ao criar sess\u00e3o.', error: err2.message });
                        }
                        res.json({ success: true, token, email: emailNorm, name: nameTrim });
                    }
                );
            });
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
        `SELECT s.token, s.user_id, u.email, u.name, u.avatar, u.role_id,
                r.name AS role_name, r.is_admin
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE s.token = ? AND s.expires_at > datetime('now')`,
        [token],
        (err, session) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Erro interno.', error: err.message });
            }
            if (!session) {
                return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada.' });
            }

            // Helper: busca locationIds pelo papel do usuário
            function sendWithLocations(userObj, permissions) {
                db.all(
                    `SELECT location_id FROM role_locations WHERE role_id = ?`,
                    [session.role_id],
                    (locErr, locRows) => {
                        userObj.locationIds = (locRows || []).map(r => r.location_id);
                        res.json({
                            success: true,
                            email: session.email,
                            name: session.name,
                            user: userObj,
                            permissions
                        });
                    }
                );
            }

            // Se admin, retorna direto sem buscar permissões granulares
            if (session.is_admin) {
                return sendWithLocations(
                    { id: session.user_id, name: session.name, email: session.email, avatar: session.avatar || null, role: session.role_name, isAdmin: true },
                    []
                );
            }

            // Buscar permissões granulares do papel
            if (!session.role_id) {
                return sendWithLocations(
                    { id: session.user_id, name: session.name, email: session.email, avatar: session.avatar || null, role: null, isAdmin: false },
                    []
                );
            }

            db.all(
                `SELECT module, screen, actions FROM role_permissions WHERE role_id = ?`,
                [session.role_id],
                (err2, perms) => {
                    if (err2) {
                        return res.status(500).json({ success: false, message: 'Erro ao buscar permissões.', error: err2.message });
                    }
                    const parsed = (perms || []).map(p => ({
                        module: p.module,
                        screen: p.screen,
                        actions: JSON.parse(p.actions || '[]')
                    }));
                    sendWithLocations(
                        { id: session.user_id, name: session.name, email: session.email, avatar: session.avatar || null, role: session.role_name, isAdmin: false },
                        parsed
                    );
                }
            );
        }
    );
});

// ── Helper: resolve usuário a partir do header x-auth-token ───────────────

function authenticate(req, res, next) {
    const token = req.headers['x-auth-token'];
    if (!token) return res.status(401).json({ success: false, message: 'Token ausente.' });

    db.get(
        `SELECT s.user_id FROM sessions s
         WHERE s.token = ? AND s.expires_at > datetime('now')`,
        [token],
        (err, session) => {
            if (err || !session) {
                return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada.' });
            }
            req.userId = session.user_id;
            next();
        }
    );
}

// ── POST /auth/avatar ─────────────────────────────────────────────────────
// Body: { avatar: "data:image/...;base64,..." }   (até ~3 MB recomendado)

const AVATAR_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 MB

router.post('/avatar', authenticate, (req, res) => {
    const avatar = (req.body && req.body.avatar) || '';
    if (typeof avatar !== 'string' || !AVATAR_DATA_URL_RE.test(avatar)) {
        return res.status(400).json({ success: false, message: 'Imagem inválida.' });
    }
    if (Buffer.byteLength(avatar, 'utf8') > MAX_AVATAR_BYTES) {
        return res.status(413).json({ success: false, message: 'Imagem muito grande.' });
    }

    db.run('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.userId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Erro ao salvar foto.', error: err.message });
        }
        res.json({ success: true, avatar });
    });
});

// ── DELETE /auth/avatar ───────────────────────────────────────────────────

router.delete('/avatar', authenticate, (req, res) => {
    db.run('UPDATE users SET avatar = NULL WHERE id = ?', [req.userId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Erro ao remover foto.', error: err.message });
        }
        res.json({ success: true });
    });
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
