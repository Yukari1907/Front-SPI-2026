
"use strict";

// Listagem e cadastro reais. Edição/exclusão aguardam contratos seguros.
const $ = id => document.getElementById(id);
let usersRequestId = 0;
let signupPending = false;

function resetUserMetrics() {
    ["adminUsersCount", "adminAdminsCount", "adminProfilesCount", "adminLogsCount"].forEach(id => $(id).textContent = "—");
}

function showUsersState(message) {
    $("usersTable").innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(message)}</td></tr>`;
}

function renderUsers(users) {
    $("adminUsersCount").textContent = users.length;
    $("adminAdminsCount").textContent = users.filter(user => user.admin === true || ["admin", "administrador"].includes(String(user.perfil || "").trim().toLowerCase())).length;
    $("adminProfilesCount").textContent = new Set(users.map(user => String(user.perfil || "").trim().toLowerCase()).filter(Boolean)).size;
    $("adminLogsCount").textContent = "—"; // GET /users não retorna acessos.
    if (!users.length) {
        showUsersState("Nenhum usuário cadastrado.");
        return;
    }
    const roles = { admin: "Administrador", administrador: "Administrador", supervisor: "Supervisor", operador: "Operador" };
    $("usersTable").innerHTML = users.map(user => {
        const name = [user.nome, user.sobrenome].filter(Boolean).join(" ") || "—";
        const role = roles[String(user.perfil || "").trim().toLowerCase()] || user.perfil || "—";
        const status = user.ativo === true ? "Ativo" : user.ativo === false ? "Inativo" : "—";
        return `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(user.email || "—")}</td><td>${escapeHtml(role)}</td><td>${status}</td><td>${escapeHtml(user.unidade || "—")}</td><td><span class="text-muted" title="Edição e exclusão aguardam atualização do servidor">Indisponíveis</span></td></tr>`;
    }).join("");
}

async function loadUsers() {
    if (!canPerform("users:list")) return false;
    const requestId = ++usersRequestId;
    $("refreshUsers").disabled = true;
    $("usersTable").setAttribute("aria-busy", "true");
    resetUserMetrics();
    showUsersState("Carregando usuários...");
    try {
        const result = await apiGet("/users");
        if (requestId !== usersRequestId) return false;
        if (!result.ok || !Array.isArray(result.data) || !result.data.every(user => user && typeof user === "object" && !Array.isArray(user))) {
            showUsersState("Não foi possível carregar os usuários.");
            return false;
        }
        renderUsers(result.data);
        return true;
    } catch {
        if (requestId === usersRequestId) showUsersState("Não foi possível carregar os usuários.");
        return false;
    } finally {
        if (requestId === usersRequestId) {
            $("refreshUsers").disabled = false;
            $("usersTable").setAttribute("aria-busy", "false");
        }
    }
}

function openUserModal() {
    if (!canPerform("users:create")) {
        showToast("Seu perfil não possui permissão para esta ação.", "danger");
        return;
    }
    $("userForm").reset();
    $("userModal").classList.add("active");
}

function closeUserModal() {
    $("userModal").classList.remove("active");
}

document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
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

    $("refreshUsers").addEventListener("click", loadUsers);

    $("userModal").addEventListener("click", event => {
        if (event.target === $("userModal")) {
            closeUserModal();
        }
    });

    $("userForm").addEventListener("submit", async event => {
        event.preventDefault();

        const data = Object.fromEntries(
            new FormData(event.currentTarget)
        );

        if (!canPerform("users:create") || signupPending) return;
        const email = data.email.trim().toLowerCase();
        if (data.password.trim().length < 6) {
            showToast("A senha deve ter pelo menos 6 caracteres.", "danger");
            return;
        }
            const submitBtn = $("userForm").querySelector('[type="submit"]');
            signupPending = true;
            if (submitBtn) submitBtn.disabled = true;

            try {
                const [nome, ...sobrenomePartes] = data.name.trim().split(/\s+/);
                const sobrenome = sobrenomePartes.join(" ") || null;
                if (!nome || !email || !["admin", "supervisor", "operador"].includes(data.role)) {
                    showToast("Preencha nome, e-mail e um perfil válido.", "danger");
                    return;
                }

                const result = await apiPost("/signup", {
                    email,
                    password: data.password,
                    nome,
                    sobrenome,
                    perfil: data.role,
                    unidade: data.unit.trim() || null
                });

                if (result.status === 0) {
                    showToast("Backend indisponível. Usuário não cadastrado.", "danger");
                    return;
                }

                if (result.ok) {
                    closeUserModal();
                    showToast("Usuário cadastrado com sucesso.");
                    // Uma falha de leitura não desfaz o POST /signup bem-sucedido.
                    if (!await loadUsers()) {
                        showToast("Usuário cadastrado com sucesso, mas a listagem não pôde ser atualizada. Tente atualizar a lista.", "warning");
                    }
                } else if (result.status === 400 && result.data?.message?.includes("Email already exists")) {
                    showToast("E-mail já cadastrado no sistema.", "danger");
                } else {
                    showToast(result.data?.message || "Falha ao cadastrar usuário.", "danger");
                }
            } catch (e) {
                console.error("[Admin] Erro ao cadastrar usuário:", e);
                showToast("Erro inesperado ao cadastrar usuário.", "danger");
            } finally {
                signupPending = false;
                if (submitBtn) submitBtn.disabled = false;
            }

    });

    await loadUsers();
});
