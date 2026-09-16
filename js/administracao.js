
"use strict";

// Somente o cadastro tem endpoint. Listagem, contagens e gestão ficam indisponíveis.
const $ = id => document.getElementById(id);

function renderUsers() {
    $("usersTable").innerHTML = '<tr><td colspan="6" class="empty">Listagem de usuários indisponível.</td></tr>';
    ["adminUsersCount", "adminAdminsCount", "adminLogsCount"].forEach(id => $(id).textContent = "—");
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

function closeUserDetailsModal() {
    $("userDetailsModal").classList.remove("active");
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

    $("userForm").addEventListener("submit", async event => {
        event.preventDefault();

        const data = Object.fromEntries(
            new FormData(event.currentTarget)
        );

        if (!canPerform("users:create")) return;
        const email = data.email.trim().toLowerCase();
        if (data.password.length < 6) {
            showToast("A senha deve ter pelo menos 6 caracteres.", "danger");
            return;
        }
            const submitBtn = $("userForm").querySelector('[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;

            try {
                const [nome, ...sobrenomePartes] = data.name.trim().split(" ");
                const sobrenome = sobrenomePartes.join(" ") || null;

                const result = await apiPost("/signup", {
                    email,
                    password: data.password,
                    nome,
                    sobrenome,
                    perfil: data.role,
                    unidade: data.unit || null
                });

                if (result.status === 0) {
                    showToast("Backend indisponível. Usuário não cadastrado.", "danger");
                    return;
                }

                if (result.ok) {
                    closeUserModal();
                    showToast("Usuário cadastrado com sucesso.");
                } else if (result.status === 400 && result.data?.message?.includes("Email already exists")) {
                    showToast("E-mail já cadastrado no sistema.", "danger");
                } else {
                    showToast(result.data?.message || "Falha ao cadastrar usuário.", "danger");
                }
            } catch (e) {
                console.error("[Admin] Erro ao cadastrar usuário:", e);
                showToast("Erro inesperado ao cadastrar usuário.", "danger");
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }

    });

    renderUsers();
});
