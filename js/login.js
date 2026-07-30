
"use strict";

const USERS_KEY = "visaoepi_users";
const SESSION_KEY = "visaoepi_session";
const PROFILE_KEY = "visaoepi_profile";

const DEFAULT_USERS = [
    {
        id: 1,
        name: "Administrador",
        email: "admin@visaoepi.com",
        role: "Administrador",
        unit: "Matriz",
        status: "Ativo",
        password: "123456",
        lastAccess: null,
        accessCount: 0,
        loginHistory: [],
        createdAt: "2026-07-20T09:00:00.000Z",
        createdBy: "Sistema"
    },
    {
        id: 2,
        name: "Ana Souza",
        email: "ana@empresa.com",
        role: "Supervisor",
        unit: "Matriz",
        status: "Ativo",
        password: "123456",
        lastAccess: null,
        accessCount: 0,
        loginHistory: [],
        createdAt: "2026-07-21T10:00:00.000Z",
        createdBy: "Administrador"
    },
    {
        id: 3,
        name: "Carlos Lima",
        email: "carlos@empresa.com",
        role: "Operador",
        unit: "Unidade Industrial 1",
        status: "Ativo",
        password: "123456",
        lastAccess: null,
        accessCount: 0,
        loginHistory: [],
        createdAt: "2026-07-22T11:00:00.000Z",
        createdBy: "Administrador"
    },
    {
        id: 4,
        name: "Mariana Alves",
        email: "mariana@empresa.com",
        role: "Técnico de Segurança",
        unit: "Matriz",
        status: "Bloqueado",
        password: "123456",
        lastAccess: null,
        accessCount: 0,
        loginHistory: [],
        createdAt: "2026-07-23T12:00:00.000Z",
        createdBy: "Administrador"
    }
];

function normalizeUser(user) {
    return {
        id: Number(user.id) || Date.now(),
        name: user.name || "Usuário",
        email: String(user.email || "").trim().toLowerCase(),
        role: user.role || "Operador",
        unit: user.unit || "Matriz",
        status: user.status || "Ativo",
        password: user.password || "123456",
        lastAccess: user.lastAccess || null,
        accessCount: Number(user.accessCount) || 0,
        loginHistory: Array.isArray(user.loginHistory) ? user.loginHistory : [],
        createdAt: user.createdAt || new Date().toISOString(),
        createdBy: user.createdBy || "Sistema"
    };
}

function loadUsers() {
    const storedUsers = JSON.parse(localStorage.getItem(USERS_KEY) || "null");

    if (!Array.isArray(storedUsers) || storedUsers.length === 0) {
        localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
        return DEFAULT_USERS.map(normalizeUser);
    }

    const normalizedUsers = storedUsers.map(normalizeUser);
    localStorage.setItem(USERS_KEY, JSON.stringify(normalizedUsers));

    return normalizedUsers;
}

function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function saveProfile(user) {
    const currentProfile =
        JSON.parse(localStorage.getItem(PROFILE_KEY) || "null") || {};

    localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({
            ...currentProfile,
            name: user.name,
            email: user.email,
            role: user.role,
            unit: user.unit
        })
    );
}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("loginForm");
    const passwordInput = document.getElementById("loginPassword");
    const message = document.getElementById("loginMessage");

    document
        .getElementById("passwordToggle")
        .addEventListener("click", () => {
            const visible = passwordInput.type === "text";
            passwordInput.type = visible ? "password" : "text";

            document.getElementById("passwordToggle").innerHTML = visible
                ? '<i class="fa-solid fa-eye"></i>'
                : '<i class="fa-solid fa-eye-slash"></i>';
        });

    document
        .getElementById("forgotPassword")
        .addEventListener("click", event => {
            event.preventDefault();
            message.style.color = "#3155f5";
            message.textContent =
                "Na demonstração, a senha inicial dos usuários é 123456.";
        });

    form.addEventListener("submit", event => {
        event.preventDefault();

        const email = form.email.value.trim().toLowerCase();
        const password = form.password.value;
        const users = loadUsers();

        const userIndex = users.findIndex(
            user =>
                user.email === email &&
                user.password === password
        );

        if (userIndex < 0) {
            message.style.color = "#dc2626";
            message.textContent = "E-mail ou senha inválidos.";
            return;
        }

        const user = users[userIndex];

        if (user.status !== "Ativo") {
            message.style.color = "#dc2626";
            message.textContent =
                "Este usuário está bloqueado. Procure um administrador.";
            return;
        }

        const accessDate = new Date().toISOString();

        user.lastAccess = accessDate;
        user.accessCount = (Number(user.accessCount) || 0) + 1;
        user.loginHistory = [
            accessDate,
            ...(Array.isArray(user.loginHistory) ? user.loginHistory : [])
        ].slice(0, 10);

        users[userIndex] = user;
        saveUsers(users);
        saveProfile(user);

        const session = {
            authenticated: true,
            userId: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            unit: user.unit,
            loginAt: accessDate
        };

        const remember = document.getElementById("rememberLogin").checked;
        const storage = remember ? localStorage : sessionStorage;

        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        storage.setItem(SESSION_KEY, JSON.stringify(session));

        message.style.color = "#2e7d32";
        message.textContent = "Acesso autorizado. Redirecionando...";

        window.setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 350);
    });
});
