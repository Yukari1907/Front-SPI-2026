
"use strict";

/**
 * inventario.js — Gerenciamento de EPIs via API real do backend.
 *
 * API utilizada:
 *   GET    /epis            → listar todos
 *   POST   /epis            → criar
 *   PUT    /epis/<id>       → atualizar
 *   DELETE /epis/<id>       → excluir
 *
 * Mapeamento de campos (frontend → backend):
 *   name          → nome
 *   category      → categoria
 *   certificate   → certificado
 *   expiration    → validade
 *   quantity      → estoque
 *   minimumQuantity → quantidade_min
 *   inUse         → em_uso
 *
 * O campo "location" (localização) não existe no backend — mantido apenas
 * localmente para exibição; não é persistido no banco.
 */

let inventoryItems = [];
let filteredItems = [];
let inventoryPage = 1;
let categoryChart;
let statusChart;

const $ = id => document.getElementById(id);

// ─────────────────────────────────────────────
// Mapeamento de campos backend → frontend
// ─────────────────────────────────────────────

function fromApi(apiEpi) {
    const status = calculateStatus(
        apiEpi.estoque,
        apiEpi.quantidade_min,
        apiEpi.validade
    );
    return {
        id: apiEpi.id,
        name: apiEpi.nome,
        category: apiEpi.categoria,
        certificate: apiEpi.certificado || "",
        expiration: apiEpi.validade || "",
        quantity: apiEpi.estoque,
        minimumQuantity: apiEpi.quantidade_min,
        inUse: apiEpi.em_uso,
        location: "", // Campo não existe no backend
        status
    };
}

function toApi(frontendItem) {
    return {
        nome: frontendItem.name,
        categoria: frontendItem.category,
        certificado: frontendItem.certificate || "",
        validade: frontendItem.expiration || null,
        estoque: Number(frontendItem.quantity) || 0,
        quantidade_min: Number(frontendItem.minimumQuantity) || 0,
        em_uso: Number(frontendItem.inUse) || 0
    };
}

// ─────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────

function formatDate(date) {
    return date
        ? new Intl.DateTimeFormat("pt-BR").format(new Date(date + "T00:00:00"))
        : "—";
}

function statusClass(status) {
    return status === "Disponível"
        ? "success"
        : status === "Estoque Baixo"
            ? "warning"
            : "danger";
}

function calculateStatus(quantity, minimum, expiration) {
    if (expiration && new Date(expiration) < new Date()) return "Crítico";
    if (quantity <= 0) return "Crítico";
    if (quantity <= minimum) return "Estoque Baixo";
    return "Disponível";
}

// ─────────────────────────────────────────────
// Carregar dados do backend
// ─────────────────────────────────────────────

async function loadInventoryFromApi() {
    try {
        const result = await apiGet("/epis");

        if (result.status === 0) {
            showToast("Backend indisponível. Sem dados de EPIs.", "warning");
            return;
        }

        if (result.ok && Array.isArray(result.data)) {
            inventoryItems = result.data.map(fromApi);
            filteredItems = [...inventoryItems];
            renderInventory();
        } else {
            showToast("Não foi possível carregar os EPIs.", "danger");
        }
    } catch (e) {
        console.error("[Inventario] Erro ao carregar EPIs:", e);
        showToast("Erro ao carregar inventário.", "danger");
    }
}

// ─────────────────────────────────────────────
// Renderização
// ─────────────────────────────────────────────

function renderExpiryTable() {
    const body = document.getElementById("expiryTableBody");
    if (!body) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = inventoryItems
        .filter(item => item.expiration)
        .map(item => {
            const expiration = new Date(item.expiration + "T00:00:00");
            const days = Math.ceil((expiration - today) / 86400000);
            return { ...item, days };
        })
        .filter(item => item.days >= 0)
        .sort((a, b) => a.days - b.days)
        .slice(0, 4);

    body.innerHTML = upcoming.length
        ? upcoming.map(item => {
            const level = item.days <= 7 ? "danger" : item.days <= 30 ? "warning" : "success";
            return `
                <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td><span class="expiry-days ${level}">${item.days} dias</span></td>
                </tr>
            `;
        }).join("")
        : '<tr><td colspan="2" class="empty">Nenhuma validade próxima.</td></tr>';
}

function renderInventory() {
    const start = (inventoryPage - 1) * 5;

    $("inventoryTable").innerHTML = filteredItems
        .slice(start, start + 5)
        .map(item => `
            <tr>
                <td>
                    <div class="inventory-name">
                        <strong>${escapeHtml(item.name)}</strong>
                        <small>${escapeHtml(item.certificate)}</small>
                    </div>
                </td>

                <td>${escapeHtml(item.category)}</td>
                <td>${escapeHtml(item.certificate)}</td>
                <td>${item.quantity}</td>
                <td>${formatDate(item.expiration)}</td>
                <td>${escapeHtml(item.location || "—")}</td>

                <td>
                    <span class="badge ${statusClass(item.status)}">
                        ${escapeHtml(item.status)}
                    </span>
                </td>

                <td>
                    <div class="action-buttons">
                        <button class="icon-btn" onclick="viewInventoryItem(${item.id})" title="Visualizar">
                            <i class="fa-solid fa-eye"></i>
                        </button>

                        <button class="icon-btn" onclick="editInventoryItem(${item.id})" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>

                        <button class="icon-btn" onclick="deleteInventoryItem(${item.id})" title="Excluir">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `)
        .join("");

    const totalPages = Math.max(1, Math.ceil(filteredItems.length / 5));

    $("inventoryPagination").innerHTML = Array
        .from({ length: totalPages }, (_, index) => `
            <button
                class="${inventoryPage === index + 1 ? "active" : ""}"
                onclick="goInventoryPage(${index + 1})"
            >
                ${index + 1}
            </button>
        `)
        .join("");

    $("invTotal").textContent = inventoryItems.reduce((sum, item) => sum + item.quantity, 0);
    $("invUse").textContent = inventoryItems.reduce((sum, item) => sum + item.inUse, 0);
    $("invLow").textContent = inventoryItems.filter(item => item.quantity <= item.minimumQuantity).length;
    $("invExpiry").textContent = inventoryItems.filter(item => {
        const days = (new Date(item.expiration) - new Date()) / 86400000;
        return days >= 0 && days <= 30;
    }).length;

    updateInventoryCharts();
    renderExpiryTable();
}

function updateInventoryCharts() {
    const categoryTotals = {};
    const statusTotals = {};

    inventoryItems.forEach(item => {
        categoryTotals[item.category] = (categoryTotals[item.category] || 0) + item.quantity;
        statusTotals[item.status] = (statusTotals[item.status] || 0) + 1;
    });

    categoryChart.data.labels = Object.keys(categoryTotals);
    categoryChart.data.datasets[0].data = Object.values(categoryTotals);
    categoryChart.update();

    statusChart.data.labels = Object.keys(statusTotals);
    statusChart.data.datasets[0].data = Object.values(statusTotals);
    statusChart.update();
}

// ─────────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────────

function filterInventory() {
    const term = $("inventorySearch").value.toLowerCase();
    const category = $("inventoryCategory").value;
    const status = $("inventoryStatus").value;

    filteredItems = inventoryItems.filter(item =>
        (!term || [item.name, item.certificate, item.category].some(value =>
            String(value).toLowerCase().includes(term)
        )) &&
        (!category || item.category === category) &&
        (!status || item.status === status)
    );

    inventoryPage = 1;
    renderInventory();
}

// ─────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────

function openInventoryModal(item = null) {
    $("inventoryForm").reset();
    $("inventoryForm").elements.id.value = item?.id || "";
    $("inventoryModalTitle").textContent = item ? "Editar EPI" : "Cadastrar EPI";

    if (item) {
        // Mapeamento de campos de exibição para os campos do formulário
        const fieldMap = {
            id: item.id,
            name: item.name,
            category: item.category,
            certificate: item.certificate,
            expiration: item.expiration,
            quantity: item.quantity,
            minimumQuantity: item.minimumQuantity,
            inUse: item.inUse,
            location: item.location
        };

        Object.entries(fieldMap).forEach(([key, value]) => {
            const field = $("inventoryForm").elements[key];
            if (field) field.value = value ?? "";
        });
    }

    $("inventoryModal").classList.add("active");
}

function closeInventoryModal() {
    $("inventoryModal").classList.remove("active");
}

function editInventoryItem(id) {
    openInventoryModal(inventoryItems.find(item => item.id === id));
}

function viewInventoryItem(id) {
    const item = inventoryItems.find(current => current.id === id);
    if (!item) return;
    showToast(`${item.name} — Estoque: ${item.quantity} | Status: ${item.status}`);
}

async function deleteInventoryItem(id) {
    if (!confirm("Excluir EPI? Esta ação não pode ser desfeita.")) return;

    const result = await apiDelete(`/epis/${id}`);

    if (result.status === 0) {
        showToast("Backend indisponível.", "warning");
        return;
    }

    if (result.ok) {
        inventoryItems = inventoryItems.filter(item => item.id !== id);
        filteredItems = filteredItems.filter(item => item.id !== id);
        renderInventory();
        showToast("EPI excluído.", "danger");
    } else {
        showToast(result.data?.error || "Falha ao excluir EPI.", "danger");
    }
}

function goInventoryPage(page) {
    inventoryPage = page;
    renderInventory();
}

// ─────────────────────────────────────────────
// Exportação CSV
// ─────────────────────────────────────────────

function exportInventoryCsv() {
    const header = ["Nome", "Categoria", "CA", "Quantidade", "Em uso", "Validade", "Status"];

    const rows = filteredItems.map(item => [
        item.name,
        item.category,
        item.certificate,
        item.quantity,
        item.inUse,
        formatDate(item.expiration),
        item.status
    ]);

    const csv = [header, ...rows]
        .map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";"))
        .join("\n");

    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
    const link = document.createElement("a");

    link.href = url;
    link.download = "inventario.csv";
    link.click();

    URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    const dark = document.documentElement.dataset.theme === "dark";

    Chart.defaults.color = dark ? "#e2e8f0" : "#374151";
    Chart.defaults.borderColor = dark ? "#334155" : "#e5e7eb";

    categoryChart = new Chart($("inventoryCategoryChart"), {
        type: "bar",
        data: { labels: [], datasets: [{ data: [], backgroundColor: "#3155f5" }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });

    statusChart = new Chart($("inventoryStatusChart"), {
        type: "doughnut",
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: ["#2e7d32", "#f59e0b", "#dc2626", "#3155f5"]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "65%"
        }
    });

    $("openInventoryModal").onclick = () => openInventoryModal();
    $("closeInventoryModal").onclick = $("cancelInventoryModal").onclick = closeInventoryModal;

    $("inventorySearch").oninput = filterInventory;
    $("inventoryCategory").onchange = $("inventoryStatus").onchange = filterInventory;

    $("refreshInventory").onclick = async () => {
        await loadInventoryFromApi();
        showToast("Inventário atualizado.");
    };

    $("exportInventory").onclick = exportInventoryCsv;

    // Submit do formulário (criar ou editar EPI)
    $("inventoryForm").onsubmit = async event => {
        event.preventDefault();

        const formData = Object.fromEntries(new FormData(event.currentTarget));
        const existingId = Number(formData.id);

        const frontendItem = {
            name: formData.name,
            category: formData.category,
            certificate: formData.certificate,
            expiration: formData.expiration,
            quantity: Number(formData.quantity),
            minimumQuantity: Number(formData.minimumQuantity),
            inUse: Number(formData.inUse),
            location: formData.location || ""
        };

        const apiPayload = toApi(frontendItem);

        let result;

        if (existingId) {
            result = await apiPut(`/epis/${existingId}`, apiPayload);
        } else {
            result = await apiPost("/epis", apiPayload);
        }

        if (result.status === 0) {
            showToast("Backend indisponível.", "warning");
            return;
        }

        if (result.ok) {
            const savedEpi = fromApi(result.data);
            // Preserva o campo location (não existe no backend)
            savedEpi.location = frontendItem.location;

            if (existingId) {
                const index = inventoryItems.findIndex(item => item.id === existingId);
                if (index >= 0) inventoryItems[index] = savedEpi;
            } else {
                inventoryItems.unshift(savedEpi);
            }

            filteredItems = [...inventoryItems];
            closeInventoryModal();
            renderInventory();
            showToast(existingId ? "EPI atualizado." : "EPI cadastrado.");
        } else {
            showToast(result.data?.error || "Falha ao salvar EPI.", "danger");
        }
    };

    // Carrega dados reais do backend
    loadInventoryFromApi();
});

window.viewInventoryItem = viewInventoryItem;
window.editInventoryItem = editInventoryItem;
window.deleteInventoryItem = deleteInventoryItem;
window.goInventoryPage = goInventoryPage;
