/**
 * @module roles
 * @description Rotas de gestão de papéis (roles) e permissões.
 *
 * Tabelas:
 *   roles            — papéis do sistema (Administrador, Almoxarife, etc.)
 *   role_permissions  — permissões granulares por módulo/tela/ação
 *
 * O papel com is_admin=1 tem acesso total sem checagem de permissões.
 * Um seed "Administrador" é criado no startup se não existir.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const requirePermission = require('../middleware/require-permission');

// ── Tabelas ───────────────────────────────────────────────────────────────

db.run(`CREATE TABLE IF NOT EXISTS roles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    is_admin    INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS role_permissions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id  INTEGER NOT NULL,
    module   TEXT NOT NULL,
    screen   TEXT NOT NULL,
    actions  TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    UNIQUE(role_id, module, screen)
)`);

// Migration: adicionar role_id em users (falha silenciosa se já existir)
db.run(`ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id)`, () => {});

// ── Seed: Administrador ───────────────────────────────────────────────────

db.get(`SELECT id FROM roles WHERE is_admin = 1`, [], (err, row) => {
    if (!err && !row) {
        db.run(
            `INSERT INTO roles (name, description, is_admin) VALUES (?, ?, 1)`,
            ['Administrador', 'Acesso total ao sistema'],
            function (seedErr) {
                if (seedErr) return;
                const adminRoleId = this.lastID;
                // Atribuir role admin ao primeiro usuário existente (se houver)
                db.get(`SELECT id FROM users ORDER BY id ASC LIMIT 1`, [], (_, user) => {
                    if (user) {
                        db.run(`UPDATE users SET role_id = ? WHERE id = ?`, [adminRoleId, user.id]);
                    }
                });
            }
        );
    }
});

// ── GET /roles ────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
    db.all(
        `SELECT r.*, COUNT(u.id) AS user_count
         FROM roles r
         LEFT JOIN users u ON u.role_id = r.id
         GROUP BY r.id
         ORDER BY r.is_admin DESC, r.name ASC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao listar papéis.', error: err.message });
            res.json(rows);
        }
    );
});

// ── GET /roles/:id ────────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
    const { id } = req.params;

    db.get(`SELECT * FROM roles WHERE id = ?`, [id], (err, role) => {
        if (err) return res.status(500).json({ success: false, message: 'Erro ao buscar papel.', error: err.message });
        if (!role) return res.status(404).json({ success: false, message: 'Papel não encontrado.' });

        db.all(`SELECT * FROM role_permissions WHERE role_id = ?`, [id], (err2, permissions) => {
            if (err2) return res.status(500).json({ success: false, message: 'Erro ao buscar permissões.', error: err2.message });
            // Parse actions JSON
            const parsed = permissions.map(p => ({
                ...p,
                actions: JSON.parse(p.actions || '[]')
            }));
            res.json({ ...role, permissions: parsed });
        });
    });
});

// ── POST /roles ───────────────────────────────────────────────────────────

router.post('/', requirePermission('admin', 'admin-roles', 'create'), (req, res) => {
    const { name, description } = req.body || {};

    if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Nome é obrigatório.' });
    }

    db.run(
        `INSERT INTO roles (name, description) VALUES (?, ?)`,
        [String(name).trim(), description || null],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(409).json({ success: false, message: 'Já existe um papel com esse nome.' });
                }
                return res.status(500).json({ success: false, message: 'Erro ao criar papel.', error: err.message });
            }
            res.json({ success: true, id: this.lastID });
        }
    );
});

// ── PUT /roles/:id ────────────────────────────────────────────────────────

router.put('/:id', requirePermission('admin', 'admin-roles', 'edit'), (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body || {};

    if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Nome é obrigatório.' });
    }

    db.run(
        `UPDATE roles SET name = ?, description = ? WHERE id = ? AND is_admin = 0`,
        [String(name).trim(), description || null, id],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(409).json({ success: false, message: 'Já existe um papel com esse nome.' });
                }
                return res.status(500).json({ success: false, message: 'Erro ao atualizar papel.', error: err.message });
            }
            if (this.changes === 0) {
                return res.status(400).json({ success: false, message: 'Papel não encontrado ou é Administrador (não editável).' });
            }
            res.json({ success: true });
        }
    );
});

// ── DELETE /roles/:id ─────────────────────────────────────────────────────

router.delete('/:id', requirePermission('admin', 'admin-roles', 'delete'), (req, res) => {
    const { id } = req.params;

    // Impedir exclusão de role admin
    db.get(`SELECT is_admin FROM roles WHERE id = ?`, [id], (err, role) => {
        if (err) return res.status(500).json({ success: false, message: 'Erro interno.', error: err.message });
        if (!role) return res.status(404).json({ success: false, message: 'Papel não encontrado.' });
        if (role.is_admin) return res.status(400).json({ success: false, message: 'O papel Administrador não pode ser excluído.' });

        // Impedir exclusão se houver usuários associados
        db.get(`SELECT COUNT(*) AS count FROM users WHERE role_id = ?`, [id], (err2, row) => {
            if (err2) return res.status(500).json({ success: false, message: 'Erro interno.', error: err2.message });
            if (row.count > 0) {
                return res.status(400).json({ success: false, message: `Existem ${row.count} usuário(s) associados a este papel. Reatribua-os antes de excluir.` });
            }

            db.run(`DELETE FROM roles WHERE id = ?`, [id], function (err3) {
                if (err3) return res.status(500).json({ success: false, message: 'Erro ao excluir papel.', error: err3.message });
                // Cascade deleta role_permissions automaticamente
                res.json({ success: true });
            });
        });
    });
});

// ── PUT /roles/:id/permissions ────────────────────────────────────────────

router.put('/:id/permissions', requirePermission('admin', 'admin-roles', 'edit'), (req, res) => {
    const { id } = req.params;
    const { permissions } = req.body || {};

    if (!Array.isArray(permissions)) {
        return res.status(400).json({ success: false, message: 'permissions deve ser um array.' });
    }

    db.get(`SELECT id, is_admin FROM roles WHERE id = ?`, [id], (err, role) => {
        if (err) return res.status(500).json({ success: false, message: 'Erro interno.', error: err.message });
        if (!role) return res.status(404).json({ success: false, message: 'Papel não encontrado.' });

        // Deletar permissões existentes e inserir novas
        db.run(`DELETE FROM role_permissions WHERE role_id = ?`, [id], (delErr) => {
            if (delErr) return res.status(500).json({ success: false, message: 'Erro ao limpar permissões.', error: delErr.message });

            if (permissions.length === 0) {
                return res.json({ success: true });
            }

            const stmt = db.prepare(
                `INSERT INTO role_permissions (role_id, module, screen, actions) VALUES (?, ?, ?, ?)`
            );

            let hasError = false;
            for (const perm of permissions) {
                if (hasError) break;
                const actions = Array.isArray(perm.actions) ? perm.actions : [];
                stmt.run([id, perm.module, perm.screen, JSON.stringify(actions)], (insertErr) => {
                    if (insertErr && !hasError) {
                        hasError = true;
                        return res.status(500).json({ success: false, message: 'Erro ao inserir permissão.', error: insertErr.message });
                    }
                });
            }

            stmt.finalize((finErr) => {
                if (!hasError) {
                    if (finErr) return res.status(500).json({ success: false, message: 'Erro ao finalizar permissões.', error: finErr.message });
                    res.json({ success: true });
                }
            });
        });
    });
});

// ── GET /roles/users ──────────────────────────────────────────────────────

router.get('/users/list', (req, res) => {
    db.all(
        `SELECT u.id, u.name, u.email, u.role_id, u.created_at, r.name AS role_name
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         ORDER BY u.name ASC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao listar usuários.', error: err.message });
            res.json(rows);
        }
    );
});

// ── PUT /roles/users/:id/role ─────────────────────────────────────────────

router.put('/users/:id/role', requirePermission('admin', 'admin-users', 'edit'), (req, res) => {
    const { id } = req.params;
    const { role_id } = req.body || {};

    if (role_id === undefined || role_id === null) {
        return res.status(400).json({ success: false, message: 'role_id é obrigatório.' });
    }

    // Verificar se o role existe (ou é null para remover)
    if (role_id) {
        db.get(`SELECT id FROM roles WHERE id = ?`, [role_id], (err, role) => {
            if (err) return res.status(500).json({ success: false, message: 'Erro interno.', error: err.message });
            if (!role) return res.status(404).json({ success: false, message: 'Papel não encontrado.' });

            db.run(`UPDATE users SET role_id = ? WHERE id = ?`, [role_id, id], function (err2) {
                if (err2) return res.status(500).json({ success: false, message: 'Erro ao atribuir papel.', error: err2.message });
                if (this.changes === 0) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
                res.json({ success: true });
            });
        });
    } else {
        db.run(`UPDATE users SET role_id = NULL WHERE id = ?`, [id], function (err) {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao remover papel.', error: err.message });
            if (this.changes === 0) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
            res.json({ success: true });
        });
    }
});

module.exports = router;
