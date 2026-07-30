
"use strict";

const ADMIN_USERS_KEY = "visaoepi_users";
const ADMIN_SESSION_KEY = "visaoepi_session";

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

const $ = id => document.getElementById(id);

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
        loginHistory: Array.isArray(user.loginHistory)
            ? user.loginHistory
            : [],
        createdAt: user.createdAt || new Date().toISOString(),
        createdBy: user.createdBy || "Sistema"
    };
}

function loadUsers() {
    const storedUsers = JSON.parse(
        localStorage.getItem(ADMIN_USERS_KEY) || "null"
    );

    if (!Array.isArray(storedUsers) || storedUsers.length === 0) {
        localStorage.setItem(
            ADMIN_USERS_KEY,
            JSON.stringify(DEFAULT_USERS)
        );

        return DEFAULT_USERS.map(normalizeUser);
    }

    const normalizedUsers = storedUsers.map(normalizeUser);

    localStorage.setItem(
        ADMIN_USERS_KEY,
        JSON.stringify(normalizedUsers)
    );

    return normalizedUsers;
}

let users = loadUsers();

function saveUsers() {
    localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(users));
}

function getCurrentSession() {
    return JSON.parse(
        localStorage.getItem(ADMIN_SESSION_KEY) ||
        sessionStorage.getItem(ADMIN_SESSION_KEY) ||
        "null"
    );
}

function formatDateTime(value) {
    if (!value) {
        return "Nunca";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
    }).format(date);
}

function renderUsers() {
    $("usersTable").innerHTML = users
        .map(
            user => `
                <tr>
                    <td>${escapeHtml(user.name)}</td>
                    <td>${escapeHtml(user.email)}</td>
                    <td>${escapeHtml(user.role)}</td>

                    <td>
                        <span class="badge ${
                            user.status === "Ativo"
                                ? "success"
                                : "danger"
                        }">
                            ${escapeHtml(user.status)}
                        </span>
                    </td>

                    <td>
                        <strong>${formatDateTime(user.lastAccess)}</strong>
                        <br>
                        <small class="text-muted">
                            ${user.accessCount} acesso(s)
                        </small>
                    </td>

                    <td>
                        <div class="action-buttons">
                            <button
                                class="icon-btn"
                                type="button"
                                onclick="viewUser(${user.id})"
                                title="Visualizar acessos"
                            >
                                <i class="fa-solid fa-eye"></i>
                            </button>

                            ${
                                canPerform("users:edit")
                                    ? `
                                        <button
                                            class="icon-btn"
                                            type="button"
                                            onclick="editUser(${user.id})"
                                            title="Editar"
                                        >
                                            <i class="fa-solid fa-pen"></i>
                                        </button>
                                    `
                                    : ""
                            }

                            ${
                                canPerform("users:status")
                                    ? `
                                        <button
                                            class="icon-btn"
                                            type="button"
                                            onclick="toggleUserStatus(${user.id})"
                                            title="Ativar ou bloquear"
                                        >
                                            <i class="fa-solid fa-user-lock"></i>
                                        </button>
                                    `
                                    : ""
                            }

                            ${
                                canPerform("users:delete")
                                    ? `
                                        <button
                                            class="icon-btn"
                                            type="button"
                                            onclick="deleteUser(${user.id})"
                                            title="Excluir"
                                        >
                                            <i class="fa-solid fa-trash"></i>
                                        </button>
                                    `
                                    : ""
                            }
                        </div>
                    </td>
                </tr>
            `
        )
        .join("");

    $("adminUsersCount").textContent = users.length;
    $("adminAdminsCount").textContent = users.filter(
        user => user.role === "Administrador"
    ).length;

    const totalLogins = users.reduce(
        (total, user) => total + Number(user.accessCount || 0),
        0
    );

    if ($("adminLogsCount")) {
        $("adminLogsCount").textContent = totalLogins;
    }
}

function openUserModal(user = null) {
    const permission=user?"users:edit":"users:create";

    if(!canPerform(permission)){
        showToast("Seu perfil não possui permissão para esta ação.","danger");
        return;
    }

    $("userForm").reset();
    $("userForm").elements.id.value = user?.id || "";
    $("userModalTitle").textContent = user
        ? "Editar usuário"
        : "Cadastrar novo usuário";

    const passwordField = $("userForm").elements.password;
    passwordField.required = !user;
    passwordField.placeholder = user
        ? "Deixe em branco para manter a senha"
        : "Mínimo de 6 caracteres";

    if (user) {
        Object.entries(user).forEach(([key, value]) => {
            const field = $("userForm").elements[key];

            if (field && key !== "password") {
                field.value = value ?? "";
            }
        });
    }

    $("userModal").classList.add("active");
}

function closeUserModal() {
    $("userModal").classList.remove("active");
}

function editUser(id) {
    if(!canPerform("users:edit")){
        showToast("Seu perfil não pode editar usuários.","danger");
        return;
    }

    openUserModal(users.find(user => user.id === id));
}

function viewUser(id) {
    if(!canPerform("users:view")){
        showToast("Seu perfil não pode consultar usuários.","danger");
        return;
    }

    const user = users.find(item => item.id === id);

    if (!user) {
        return;
    }

    $("userDetailsName").textContent = user.name;
    $("userDetailsEmail").textContent = user.email;
    $("userDetailsRole").textContent = user.role;
    $("userDetailsUnit").textContent = user.unit;
    $("userDetailsStatus").textContent = user.status;
    $("userDetailsAccessCount").textContent =
        String(user.accessCount || 0);
    $("userDetailsLastAccess").textContent =
        formatDateTime(user.lastAccess);
    $("userDetailsCreatedAt").textContent =
        formatDateTime(user.createdAt);
    $("userDetailsCreatedBy").textContent =
        user.createdBy || "Sistema";

    const history = Array.isArray(user.loginHistory)
        ? user.loginHistory
        : [];

    $("userLoginHistory").innerHTML = history.length
        ? history
              .map(
                  (access, index) => `
                    <div
                        style="
                            display:flex;
                            align-items:center;
                            gap:12px;
                            padding:12px 0;
                            border-bottom:1px solid var(--border);
                        "
                    >
                        <span class="timeline-icon">
                            <i class="fa-solid fa-right-to-bracket"></i>
                        </span>

                        <div>
                            <strong>Acesso ${index + 1}</strong>
                            <p class="text-muted">
                                ${formatDateTime(access)}
                            </p>
                        </div>
                    </div>
                `
              )
              .join("")
        : '<p class="empty">Nenhum acesso registrado.</p>';

    $("userDetailsModal").classList.add("active");
}

function closeUserDetailsModal() {
    $("userDetailsModal").classList.remove("active");
}

function toggleUserStatus(id) {
    if(!canPerform("users:status")){
        showToast("Seu perfil não pode bloquear ou ativar usuários.","danger");
        return;
    }

    const user = users.find(item => item.id === id);

    if (!user) {
        return;
    }

    user.status =
        user.status === "Ativo" ? "Bloqueado" : "Ativo";

    saveUsers();
    renderUsers();

    showToast(
        `Usuário ${user.status.toLowerCase()}.`,
        user.status === "Ativo" ? "success" : "warning"
    );
}

function deleteUser(id) {
    if(!canPerform("users:delete")){
        showToast("Seu perfil não pode excluir usuários.","danger");
        return;
    }

    const user = users.find(item => item.id === id);
    const session = getCurrentSession();

    if (!user) {
        return;
    }

    if (Number(session?.userId) === Number(id)) {
        showToast(
            "Você não pode excluir o usuário da sessão atual.",
            "danger"
        );
        return;
    }

    if (!confirm(`Excluir o usuário ${user.name}?`)) {
        return;
    }

    users = users.filter(item => item.id !== id);
    saveUsers();
    renderUsers();
    showToast("Usuário excluído.", "danger");
}

document.addEventListener("DOMContentLoaded", () => {
    const openButton = $("openUserModal");

    if (!openButton) {
        console.error('Botão com id="openUserModal" não encontrado.');
        return;
    }

    openButton.addEventListener(
        "click",
        () => openUserModal()
    );

    $("closeUserModal").addEventListener(
        "click",
        closeUserModal
    );

    $("cancelUserModal").addEventListener(
        "click",
        closeUserModal
    );

    $("closeUserDetailsModal").addEventListener(
        "click",
        closeUserDetailsModal
    );

    $("closeUserDetailsFooter").addEventListener(
        "click",
        closeUserDetailsModal
    );

    $("userModal").addEventListener("click", event => {
        if (event.target === $("userModal")) {
            closeUserModal();
        }
    });

    $("userDetailsModal").addEventListener("click", event => {
        if (event.target === $("userDetailsModal")) {
            closeUserDetailsModal();
        }
    });

    $("userForm").addEventListener("submit", event => {
        event.preventDefault();

        const data = Object.fromEntries(
            new FormData(event.currentTarget)
        );

        const existingId = Number(data.id);
        const currentUser = users.find(
            user => user.id === existingId
        );

        const email = data.email.trim().toLowerCase();

        const duplicated = users.some(
            user =>
                user.email === email &&
                user.id !== existingId
        );

        if (duplicated) {
            showToast(
                "Já existe um usuário com esse e-mail.",
                "danger"
            );
            return;
        }

        if (!existingId && data.password.length < 6) {
            showToast(
                "A senha deve ter pelo menos 6 caracteres.",
                "danger"
            );
            return;
        }

        if (
            existingId &&
            data.password &&
            data.password.length < 6
        ) {
            showToast(
                "A nova senha deve ter pelo menos 6 caracteres.",
                "danger"
            );
            return;
        }

        const session = getCurrentSession();

        const user = {
            id: existingId || Date.now(),
            name: data.name.trim(),
            email,
            role: data.role,
            unit: data.unit,
            password:
                data.password ||
                currentUser?.password ||
                "123456",
            status: data.status,
            lastAccess: currentUser?.lastAccess || null,
            accessCount:
                Number(currentUser?.accessCount) || 0,
            loginHistory: Array.isArray(
                currentUser?.loginHistory
            )
                ? currentUser.loginHistory
                : [],
            createdAt:
                currentUser?.createdAt ||
                new Date().toISOString(),
            createdBy:
                currentUser?.createdBy ||
                session?.name ||
                "Administrador"
        };

        const index = users.findIndex(
            item => item.id === user.id
        );

        if (index >= 0) {
            users[index] = user;
        } else {
            users.unshift(user);
        }

        saveUsers();
        renderUsers();
        closeUserModal();

        showToast(
            index >= 0
                ? "Usuário atualizado."
                : "Usuário cadastrado."
        );
    });

    renderUsers();
});

window.editUser = editUser;
window.viewUser = viewUser;
window.toggleUserStatus = toggleUserStatus;
window.deleteUser = deleteUser;
