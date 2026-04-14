/**
 * @file mobile/screens/mobile-login.js
 * @description Lógica de autenticação da página de login mobile.
 *   Página standalone — não depende de utils.js nem de outros módulos do app.
 *   Usa fetch() diretamente.
 */

const MobLoginPage = {

    // ── Estado ───────────────────────────────────────────────────────────────

    _mode: 'login', // 'login' | 'register'

    // ── Inicialização ────────────────────────────────────────────────────────

    async _init() {
        // Tela grande → versão desktop
        if (window.innerWidth >= 768) {
            window.location.replace('/login');
            return;
        }

        // Se já há token válido, redireciona direto para o app
        const token = localStorage.getItem('wcm.auth.token');
        if (token) {
            try {
                const res = await fetch('/auth/verify', {
                    headers: { 'x-auth-token': token }
                });
                if (res.ok) {
                    window.location.replace('/mobile/app');
                    return;
                }
            } catch { /* ignora — token pode estar expirado */ }
            localStorage.removeItem('wcm.auth.token');
            localStorage.removeItem('wcm.auth.email');
            localStorage.removeItem('wcm.auth.name');
        }

        this._restoreRememberedEmail();
    },

    // ── Modo login / cadastro ────────────────────────────────────────────────

    /**
     * Alterna entre o modo de login e de cadastro.
     * @param {'login'|'register'} mode
     */
    setMode(mode) {
        this._mode = mode;

        const loginFields    = document.getElementById('mobLoginLoginFields');
        const registerFields = document.getElementById('mobLoginRegisterFields');
        const tabLogin       = document.getElementById('mobLoginTabLogin');
        const tabRegister    = document.getElementById('mobLoginTabRegister');
        const submitBtn      = document.getElementById('mobLoginSubmitBtn');
        const errorEl        = document.getElementById('mobLoginError');
        const successEl      = document.getElementById('mobLoginSuccess');

        if (mode === 'login') {
            loginFields.style.display    = '';
            registerFields.style.display = 'none';
            tabLogin.classList.add('mob-login-tab--active');
            tabRegister.classList.remove('mob-login-tab--active');
            submitBtn.textContent = 'Entrar';

            // Limpar campos de cadastro
            document.getElementById('mobLoginRegisterName').value            = '';
            document.getElementById('mobLoginRegisterPassword').value        = '';
            document.getElementById('mobLoginRegisterConfirmPassword').value = '';
            document.getElementById('mobLoginRegisterReleaseCode').value     = '';
        } else {
            loginFields.style.display    = 'none';
            registerFields.style.display = 'block';
            tabLogin.classList.remove('mob-login-tab--active');
            tabRegister.classList.add('mob-login-tab--active');
            submitBtn.textContent = 'Criar conta';

            // Limpar campos de login
            document.getElementById('mobLoginPassword').value = '';
        }

        errorEl.textContent = '';
        successEl.hidden    = true;
    },

    // ── Submit ───────────────────────────────────────────────────────────────

    async submit() {
        const errorEl   = document.getElementById('mobLoginError');
        const successEl = document.getElementById('mobLoginSuccess');
        const submitBtn = document.getElementById('mobLoginSubmitBtn');

        errorEl.textContent = '';
        successEl.hidden    = true;
        submitBtn.disabled  = true;

        try {
            if (this._mode === 'login') {
                await this._doLogin();
            } else {
                await this._doRegister();
            }
        } finally {
            submitBtn.disabled = false;
        }
    },

    async _doLogin() {
        const email    = document.getElementById('mobLoginEmail').value.trim();
        const password = document.getElementById('mobLoginPassword').value;
        const remember = document.getElementById('mobLoginRememberEmail').checked;

        if (!email || !password) {
            this._showError('Preencha e-mail e senha.');
            return;
        }

        const res  = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (!res.ok) {
            this._showError(data.message || 'Erro ao fazer login.');
            return;
        }

        localStorage.setItem('wcm.auth.token', data.token);
        localStorage.setItem('wcm.auth.email', data.email);
        if (data.name) localStorage.setItem('wcm.auth.name', data.name);

        if (remember) {
            localStorage.setItem('wcm.auth.rememberedEmail', email);
        } else {
            localStorage.removeItem('wcm.auth.rememberedEmail');
        }

        window.location.replace('/mobile/app');
    },

    async _doRegister() {
        const name            = document.getElementById('mobLoginRegisterName').value.trim();
        const email           = document.getElementById('mobLoginRegisterEmail').value.trim();
        const password        = document.getElementById('mobLoginRegisterPassword').value;
        const confirmPassword = document.getElementById('mobLoginRegisterConfirmPassword').value;
        const releaseCode     = document.getElementById('mobLoginRegisterReleaseCode').value.trim();

        if (!name || !email || !password || !confirmPassword || !releaseCode) {
            this._showError('Preencha todos os campos.');
            return;
        }
        if (password !== confirmPassword) {
            this._showError('As senhas não coincidem.');
            return;
        }

        const res  = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, confirm_password: confirmPassword, release_code: releaseCode }),
        });
        const data = await res.json();

        if (!res.ok) {
            this._showError(data.message || 'Erro ao criar conta.');
            return;
        }

        // Sucesso: ir para login com e-mail preenchido
        document.getElementById('mobLoginEmail').value = email;
        this.setMode('login');

        const successEl = document.getElementById('mobLoginSuccess');
        successEl.textContent = 'Conta criada com sucesso! Faça login para continuar.';
        successEl.hidden = false;
    },

    // ── Utilitários ──────────────────────────────────────────────────────────

    _showError(msg) {
        document.getElementById('mobLoginError').textContent = msg;
    },

    _restoreRememberedEmail() {
        const saved = localStorage.getItem('wcm.auth.rememberedEmail');
        if (!saved) return;
        document.getElementById('mobLoginEmail').value = saved;
        document.getElementById('mobLoginRememberEmail').checked = true;
    },
};

// Inicializa ao carregar a página
MobLoginPage._init();
