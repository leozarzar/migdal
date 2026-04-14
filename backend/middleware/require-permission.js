/**
 * @module require-permission
 * @description Middleware factory que exige uma permissão específica de ação.
 * Admins passam direto. Usuários sem papel são bloqueados.
 */

const db = require('../db');

/**
 * @param {string} module  - ID do módulo (ex: 'inventory')
 * @param {string} screen  - ID da tela    (ex: 'stock-units')
 * @param {string} action  - Ação requerida ('create'|'edit'|'delete')
 */
function requirePermission(module, screen, action) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Não autenticado.' });
        }
        if (req.user.isAdmin) return next();

        if (!req.user.roleId) {
            return res.status(403).json({ success: false, message: 'Sem permissão.' });
        }

        db.get(
            `SELECT actions FROM role_permissions WHERE role_id = ? AND module = ? AND screen = ?`,
            [req.user.roleId, module, screen],
            (err, row) => {
                if (err) return res.status(500).json({ success: false, message: 'Erro interno.' });

                const actions = row ? JSON.parse(row.actions || '[]') : [];
                if (!actions.includes(action)) {
                    return res.status(403).json({ success: false, message: 'Sem permissão para esta ação.' });
                }
                next();
            }
        );
    };
}

module.exports = requirePermission;
