/**
 * ── LoginScreen ──────────────────────────────────────────────
 * Gerencia a tela de login/cadastro que bloqueia o acesso ao app
 * enquanto o usuário não estiver autenticado.
 *
 * Fluxo de uso (em app.js):
 *   const ok = await LoginScreen.checkAuth();
 *   if (ok) { LoginScreen.hideOverlay(); }
 *   else    { await LoginScreen.waitForLogin(); }
 */

// ── Estado ───────────────────────────────────────────────────
const LoginScreen = {
    _mode: 'login',          // 'login' | 'register'
    _loginResolve: null,     // resolve da promise de waitForLogin()

// ── Autenticação ─────────────────────────────────────────────

    /**
     * Verifica se há token armazenado e se ainda é válido no backend.
     * @returns {Promise<boolean>}
     */
    async checkAuth() {
        const token = localStorage.getItem('wcm.auth.token');
        if (!token) {
            this._restoreRememberedEmail();
            return false;
        }
        try {
            const data = await apiCall(`${API}/auth/verify`, {
                headers: { 'x-auth-token': token }
            });
            // Atualiza nome local caso tenha mudado (ex: nova sessão)
            if (data && data.name) localStorage.setItem('wcm.auth.name', data.name);
            return true;
        } catch {
            localStorage.removeItem('wcm.auth.token');
            localStorage.removeItem('wcm.auth.email');
            localStorage.removeItem('wcm.auth.name');
            this._restoreRememberedEmail();
            return false;
        }
    },

    /**
     * Retorna uma promise que resolve apenas quando o login for concluído.
     * Deve ser chamado quando checkAuth() retornar false.
     * @returns {Promise<void>}
     */
    waitForLogin() {
        return new Promise(resolve => {
            this._loginResolve = resolve;
        });
    },

    /**
     * Oculta o overlay com animação (auth já confirmada).
     */
    hideOverlay() {
        const overlay = document.getElementById('loginOverlay');
        if (!overlay) return;
        overlay.classList.add('login-overlay--hidden');
        setTimeout(() => { overlay.style.display = 'none'; }, 360);
    },

    /**
     * Desloga o usuário, limpa o token e exibe o overlay novamente.
     */
    async logout() {
        const token = localStorage.getItem('wcm.auth.token');
        if (token) {
            try {
                await apiCall(`${API}/auth/logout`, {
                    method: 'POST',
                    headers: { 'x-auth-token': token }
                });
            } catch { /* ignora erros de rede no logout */ }
        }
        localStorage.removeItem('wcm.auth.token');
        localStorage.removeItem('wcm.auth.email');
        localStorage.removeItem('wcm.auth.name');

        window.location.replace('/login');
    },

// ── Troca de modo (Login ↔ Cadastro) ─────────────────────────

    /**
     * Alterna entre os modos 'login' e 'register'.
     * @param {'login'|'register'} mode
     */
    setMode(mode) {
        this._mode = mode;
        const loginFields    = document.getElementById('loginLoginFields');
        const registerFields = document.getElementById('loginRegisterFields');
        const loginTab       = document.getElementById('loginTabLogin');
        const registerTab    = document.getElementById('loginTabRegister');
        const submitBtn      = document.getElementById('loginSubmitBtn');
        const formTitle      = document.getElementById('loginFormTitle');
        const formSubtitle   = document.getElementById('loginFormSubtitle');
        const errorEl        = document.getElementById('loginError');
        const successEl      = document.getElementById('loginSuccess');

        if (mode === 'login') {
            loginFields.style.display    = '';
            registerFields.style.display = 'none';
            loginTab.classList.add('login-tab--active');
            registerTab.classList.remove('login-tab--active');
            submitBtn.textContent    = 'Entrar';
            formTitle.textContent    = 'Bem-vindo de volta';
            formSubtitle.textContent = 'Faça login para acessar o sistema WCM.';
            // Limpar campos de cadastro ao voltar
            document.getElementById('loginRegisterName').value            = '';
            document.getElementById('loginRegisterEmail').value           = '';
            document.getElementById('loginRegisterPassword').value        = '';
            document.getElementById('loginRegisterConfirmPassword').value = '';
            document.getElementById('loginRegisterReleaseCode').value     = '';
        } else {
            loginFields.style.display    = 'none';
            registerFields.style.display = 'flex';
            loginTab.classList.remove('login-tab--active');
            registerTab.classList.add('login-tab--active');
            submitBtn.textContent    = 'Criar conta';
            formTitle.textContent    = 'Criar conta';
            formSubtitle.textContent = 'Preencha os dados para se cadastrar.';
        }
        if (errorEl)   errorEl.textContent = '';
        if (successEl) successEl.hidden    = true;
    },

// ── Submissão do formulário ───────────────────────────────────

    /**
     * Processa o submit do formulário de login ou cadastro.
     */
    async submit() {
        const errorEl = document.getElementById('loginError');
        const btn     = document.getElementById('loginSubmitBtn');

        errorEl.textContent = '';
        btn.disabled        = true;
        btn.textContent     = 'Aguarde...';

        try {
            if (this._mode === 'login') {
                const email    = document.getElementById('loginEmail').value.trim();
                const password = document.getElementById('loginPassword').value;

                const data = await apiCall(`${API}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                // Lembrar e-mail
                const remember = document.getElementById('loginRememberEmail').checked;
                if (remember) {
                    localStorage.setItem('wcm.rememberedEmail', email);
                } else {
                    localStorage.removeItem('wcm.rememberedEmail');
                }

                localStorage.setItem('wcm.auth.token', data.token);
                localStorage.setItem('wcm.auth.email', data.email);
                localStorage.setItem('wcm.auth.name', data.name || '');
                this._onLoginSuccess(data.email, data.name);

            } else {
                const name            = document.getElementById('loginRegisterName').value.trim();
                const email           = document.getElementById('loginRegisterEmail').value.trim();
                const password        = document.getElementById('loginRegisterPassword').value;
                const confirmPassword = document.getElementById('loginRegisterConfirmPassword').value;
                const releaseCode     = document.getElementById('loginRegisterReleaseCode').value.trim();

                await apiCall(`${API}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        email,
                        password,
                        confirm_password: confirmPassword,
                        release_code: releaseCode
                    })
                });

                // Cadastro bem-sucedido → redirecionar para login
                this._onRegisterSuccess(email);
                btn.disabled    = false;
                btn.textContent = 'Entrar';
            }

        } catch (e) {
            errorEl.textContent = e.message;
            btn.disabled    = false;
            btn.textContent = this._mode === 'login' ? 'Entrar' : 'Criar conta';
        }
    },

// ── Pós-cadastro ─────────────────────────────────────────────

    /**
     * Chamado após cadastro bem-sucedido.
     * Volta para o modo login com mensagem de confirmação e e-mail pré-preenchido.
     * @param {string} email
     */
    _onRegisterSuccess(email) {
        this.setMode('login');
        document.getElementById('loginEmail').value = email;
        document.getElementById('loginPassword').value = '';

        const successEl = document.getElementById('loginSuccess');
        if (successEl) {
            successEl.textContent = `Conta criada com sucesso! Faça login para continuar.`;
            successEl.hidden = false;
        }
    },

// ── Pós-login ────────────────────────────────────────────────

    /**
     * Chamado após login/cadastro bem-sucedido.
     * Oculta o overlay e resolve a promise de waitForLogin().
     * @param {string} email
     */
    _onLoginSuccess(email, name) {
        // Atualiza nome/email na sidebar
        const emailEl = document.getElementById('sidebarUserEmail');
        if (emailEl) emailEl.textContent = name || email;

        // Inicial do avatar a partir do nome (ou e-mail)
        const avatarEl = document.getElementById('sidebarUserAvatar');
        if (avatarEl) avatarEl.textContent = (name || email).charAt(0).toUpperCase();

        this.hideOverlay();

        if (this._loginResolve) {
            this._loginResolve();
            this._loginResolve = null;
        }
    },

// ── Inicialização ─────────────────────────────────────────────

    /**
     * Restaura e-mail salvo no campo de e-mail e marca o checkbox "Lembrar e-mail".
     * Chamado ao verificar auth quando não há token (overlay visível).
     */
    _restoreRememberedEmail() {
        const remembered = localStorage.getItem('wcm.rememberedEmail');
        if (!remembered) return;
        const emailInput    = document.getElementById('loginEmail');
        const rememberCheck = document.getElementById('loginRememberEmail');
        if (emailInput)    emailInput.value       = remembered;
        if (rememberCheck) rememberCheck.checked  = true;
    }
};
