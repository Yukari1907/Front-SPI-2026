
"use strict";

/**
 * login.js — Autenticação via API real do backend (POST /login).
 *
 * Não armazena senha em localStorage ou sessionStorage.
 * A sessão é gerenciada pelo backend (Flask session + cookie).
 * O frontend armazena apenas dados de exibição (nome, email, perfil) para
 * uso na UI — sem informações sensíveis.
 */

const SESSION_KEY = "visaoepi_session";
const PROFILE_KEY = "visaoepi_profile";

/**
 * Salva dados não-sensíveis do usuário para uso na interface.
 * Nunca inclui senha. A sessão real é mantida pelo cookie do backend.
 */
function saveProfileFromApiUser(user, remember) {
    const profileData = {
        name: [user.nome, user.sobrenome].filter(Boolean).join(" "),
        email: user.email,
        role: user.perfil,
        unit: user.unidade || "",
        telefone: user.telefone || ""
    };

    // Armazena dados de sessão local para controle de permissões da UI
    const sessionData = {
        authenticated: true,
        userId: user.id,
        email: user.email,
        name: profileData.name,
        role: user.perfil,
        unit: user.unidade || "",
        loginAt: new Date().toISOString()
    };

    // Perfil sempre em localStorage (persiste entre janelas/abas)
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profileData));

    // Sessão: localStorage se "lembrar", sessionStorage se não
    const storage = remember ? localStorage : sessionStorage;
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    storage.setItem(SESSION_KEY, JSON.stringify(sessionData));
}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("loginForm");
    const passwordInput = document.getElementById("loginPassword");
    const message = document.getElementById("loginMessage");

    // Toggle visibilidade da senha
    document.getElementById("passwordToggle").addEventListener("click", () => {
        const visible = passwordInput.type === "text";
        passwordInput.type = visible ? "password" : "text";
        document.getElementById("passwordToggle").innerHTML = visible
            ? '<i class="fa-solid fa-eye"></i>'
            : '<i class="fa-solid fa-eye-slash"></i>';
    });

    // Link "Esqueci a senha"
    document.getElementById("forgotPassword").addEventListener("click", event => {
        event.preventDefault();
        message.style.color = "#3155f5";
        message.textContent = "Entre em contato com o administrador do sistema para redefinir sua senha.";
    });

    // Submit do formulário de login
    form.addEventListener("submit", async event => {
        event.preventDefault();

        const email = form.email.value.trim().toLowerCase();
        const password = form.password.value;
        const remember = document.getElementById("rememberLogin").checked;

        // Feedback imediato ao usuário
        const submitButton = form.querySelector('[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        message.style.color = "#3155f5";
        message.textContent = "Verificando credenciais...";

        try {
            const result = await apiPost("/login", { email, password });

            if (result.status === 0) {
                // Backend indisponível
                message.style.color = "#dc2626";
                message.textContent = "Não foi possível conectar ao servidor. Verifique se o backend está em execução.";
                return;
            }

            if (result.ok && result.status === 200) {
                // Login bem-sucedido
                const user = result.data?.user;

                if (user) {
                    // Verifica se o usuário está ativo
                    if (user.ativo === false) {
                        message.style.color = "#dc2626";
                        message.textContent = "Este usuário está bloqueado. Procure um administrador.";
                        return;
                    }

                    saveProfileFromApiUser(user, remember);
                }

                message.style.color = "#2e7d32";
                message.textContent = "Acesso autorizado. Redirecionando...";

                window.setTimeout(() => {
                    window.location.href = "dashboard.html";
                }, 350);

            } else if (result.status === 401) {
                message.style.color = "#dc2626";
                message.textContent = "E-mail ou senha inválidos.";

            } else if (result.status === 400) {
                message.style.color = "#dc2626";
                message.textContent = result.data?.message || "Dados inválidos. Verifique o formulário.";

            } else {
                message.style.color = "#dc2626";
                message.textContent = result.data?.message || "Erro ao realizar login. Tente novamente.";
            }

        } catch (err) {
            console.error("[Login] Erro inesperado:", err);
            message.style.color = "#dc2626";
            message.textContent = "Erro inesperado. Tente novamente.";

        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
});
