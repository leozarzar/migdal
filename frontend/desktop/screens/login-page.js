/**
 * ── login-page.js ────────────────────────────────────────────
 * Lógica da página dedicada de login (/login).
 * Arquivo independente — sem dependência do app.js, utils.js
 * ou qualquer outro módulo da aplicação.
 *
 * Fluxo:
 *   - Se já há token válido  → redireciona para /app
 *   - Login bem-sucedido     → salva token e redireciona para /app
 *   - Cadastro bem-sucedido  → volta para modo login com mensagem
 */

const _API = window.location.origin;

// ── Verificação inicial ───────────────────────────────────────
// Se já há token, valida no backend e redireciona para o app.
(async function checkExistingSession() {
    // Tela pequena → versão mobile
    if (window.innerWidth < 768) {
        window.location.replace('/mobile/login');
        return;
    }
    const token = localStorage.getItem('wcm.auth.token');
    if (!token) {
        _restoreRememberedEmail();
        return;
    }
    try {
        const res = await fetch(`${_API}/auth/verify`, {
            headers: { 'x-auth-token': token }
        });
        if (res.ok) {
            window.location.replace('/app');
        } else {
            localStorage.removeItem('wcm.auth.token');
            localStorage.removeItem('wcm.auth.email');
            localStorage.removeItem('wcm.auth.name');
            _restoreRememberedEmail();
        }
    } catch {
        // Sem rede — deixa o usuário ver o formulário
        _restoreRememberedEmail();
    }
})();

// ── Estado ───────────────────────────────────────────────────
const LoginPage = {
    _mode: 'login',

// ── Troca de modo (Login ↔ Cadastro) ─────────────────────────

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

// ── Submissão ─────────────────────────────────────────────────

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

                const res  = await fetch(`${_API}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Erro ao fazer login.');

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

                window.location.replace('/app');

            } else {
                const name            = document.getElementById('loginRegisterName').value.trim();
                const email           = document.getElementById('loginRegisterEmail').value.trim();
                const password        = document.getElementById('loginRegisterPassword').value;
                const confirmPassword = document.getElementById('loginRegisterConfirmPassword').value;
                const releaseCode     = document.getElementById('loginRegisterReleaseCode').value.trim();

                const res  = await fetch(`${_API}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name, email, password,
                        confirm_password: confirmPassword,
                        release_code: releaseCode
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Erro ao criar conta.');

                // Volta para login com mensagem e e-mail preenchido
                this.setMode('login');
                document.getElementById('loginEmail').value = email;
                const successEl = document.getElementById('loginSuccess');
                if (successEl) {
                    successEl.textContent = 'Conta criada com sucesso! Faça login para continuar.';
                    successEl.hidden = false;
                }
                btn.disabled    = false;
                btn.textContent = 'Entrar';
            }

        } catch (e) {
            errorEl.textContent = e.message;
            btn.disabled    = false;
            btn.textContent = this._mode === 'login' ? 'Entrar' : 'Criar conta';
        }
    }
};

// ── Utilitário ────────────────────────────────────────────────

function _restoreRememberedEmail() {
    const remembered = localStorage.getItem('wcm.rememberedEmail');
    if (!remembered) return;
    const emailInput    = document.getElementById('loginEmail');
    const rememberCheck = document.getElementById('loginRememberEmail');
    if (emailInput)    emailInput.value      = remembered;
    if (rememberCheck) rememberCheck.checked = true;
}
