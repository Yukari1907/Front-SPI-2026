
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
 * O campo "location" (localização) não existe no backend — indisponível.
 */

let inventoryItems = [];
let inventoryLoaded = false;
let filteredItems = [];
let inventoryPage = 1;
let categoryChart;
let statusChart;
let inventorySaving = false;
const inventoryDeleting = new Set();

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
        validade: frontendItem.expiration,
        estoque: Number(frontendItem.quantity),
        quantidade_min: Number(frontendItem.minimumQuantity),
        em_uso: Number(frontendItem.inUse)
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
    if (status === "Dados indisponíveis") return "";
    return status === "Disponível"
        ? "success"
        : status === "Estoque Baixo"
            ? "warning"
            : "danger";
}

function calculateStatus(quantity, minimum, expiration) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (expiration && new Date(expiration + "T00:00:00") < today) return "Crítico";
    if (!Number.isFinite(quantity) || !Number.isFinite(minimum)) return "Dados indisponíveis";
    if (quantity <= 0) return "Crítico";
    if (quantity <= minimum) return "Estoque Baixo";
    return "Disponível";
}

// ─────────────────────────────────────────────
// Carregar dados do backend
// ─────────────────────────────────────────────

async function loadInventoryFromApi() {
    $("inventoryTable").innerHTML = '<tr><td colspan="8" class="empty">Carregando EPIs...</td></tr>';
    $("inventoryTable").setAttribute("aria-busy", "true");
    const result = await apiGet("/epis");
    inventoryLoaded = result.ok && Array.isArray(result.data);
    inventoryItems = inventoryLoaded ? result.data.map(fromApi) : [];
    const category = $("inventoryCategory").value;
    $("inventoryCategory").innerHTML = '<option value="">Todas</option>' + [...new Set(inventoryItems.map(item => item.category))]
        .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    $("inventoryCategory").value = category;
    filterInventory();
    $("inventoryTable").setAttribute("aria-busy", "false");
    if (!inventoryLoaded) showToast("Não foi possível carregar os EPIs.", "warning");
    return inventoryLoaded;
}

// ─────────────────────────────────────────────
// Renderização
// ─────────────────────────────────────────────

function renderExpiryTable() {
    const body = document.getElementById("expiryTableBody");
    if (!body) return;

    if (!inventoryLoaded) {
        body.innerHTML = '<tr><td colspan="2" class="empty">Dados indisponíveis.</td></tr>';
        return;
    }
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
    inventoryPage = Math.min(inventoryPage, Math.max(1, Math.ceil(filteredItems.length / 5)));
    const start = (inventoryPage - 1) * 5;
    $("exportInventory").disabled = !inventoryLoaded;

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
                <td>${item.quantity ?? "—"}</td>
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

                        <button class="icon-btn" data-inventory-write="inventory:edit" onclick="editInventoryItem(${item.id})" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>

                        <button class="icon-btn" data-inventory-write="inventory:delete" data-delete-epi="${item.id}" ${inventoryDeleting.has(item.id) ? 'disabled aria-busy="true"' : ''} onclick="deleteInventoryItem(${item.id})" title="Excluir">
                            <i class="fa-solid ${inventoryDeleting.has(item.id) ? 'fa-spinner fa-spin' : 'fa-trash'}"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `)
        .join("") || `<tr><td colspan="8" class="empty">${inventoryLoaded ? "Nenhum EPI encontrado." : "Dados indisponíveis."}</td></tr>`;

    document.querySelectorAll('[data-inventory-write]').forEach(button => { button.hidden = !canPerform(button.dataset.inventoryWrite); });
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

    const sum = key => inventoryItems.every(item => Number.isFinite(item[key]))
        ? inventoryItems.reduce((total, item) => total + item[key], 0) : "—";
    $("invTotal").textContent = inventoryLoaded ? sum("quantity") : "—";
    $("invUse").textContent = inventoryLoaded ? sum("inUse") : "—";
    $("invLow").textContent = inventoryLoaded && inventoryItems.every(item => Number.isFinite(item.quantity) && Number.isFinite(item.minimumQuantity))
        ? inventoryItems.filter(item => item.quantity <= item.minimumQuantity).length : "—";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    $("invExpiry").textContent = inventoryLoaded ? inventoryItems.filter(item => {
        const days = (new Date(item.expiration + "T00:00:00") - today) / 86400000;
        return days >= 0 && days <= 30;
    }).length : "—";

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

    if (!categoryChart || !statusChart) return;
    if (inventoryItems.some(item => !Number.isFinite(item.quantity))) {
        showChartState("inventoryCategoryChart", "Quantidades indisponíveis.");
        showChartState("inventoryStatusChart", "Dados indisponíveis.");
        return;
    }
    ["inventoryCategoryChart", "inventoryStatusChart"].forEach(id => {
        const empty = !inventoryLoaded || !inventoryItems.length;
        if (empty) showChartState(id, inventoryLoaded ? "Nenhum EPI cadastrado." : "Dados indisponíveis.");
        else {
            document.getElementById(id).hidden = false;
            document.getElementById(id).style.display = "";
            document.getElementById(`${id}State`)?.remove();
        }
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
    if (inventorySaving) return;
    if (!canPerform(item ? "inventory:edit" : "inventory:create")) return;
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
    if (inventorySaving) return;
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
    if (!canPerform("inventory:delete") || inventoryDeleting.has(id)) return;
    const item = inventoryItems.find(row => row.id === id);
    if (!item || !confirm(`Excluir EPI "${item.name}" (ID ${id})? Esta ação não pode ser desfeita.`)) return;
    inventoryDeleting.add(id);
    renderInventory();
    try {
        const result = await apiDelete(`/epis/${id}`);
        if (!result.ok) {
            showToast(mutationError(result, "Falha ao excluir EPI."), "danger");
            return;
        }
        if (await loadInventoryFromApi()) showToast("EPI excluído.");
        else showToast("EPI excluído, mas a listagem não pôde ser atualizada.", "warning");
    } finally {
        inventoryDeleting.delete(id);
        renderInventory();
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
    if (!inventoryLoaded) return;
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

document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
    const dark = document.documentElement.dataset.theme === "dark";

    if (typeof Chart === "function") {
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

    } else {
        showChartState("inventoryCategoryChart", "Gráfico indisponível.");
        showChartState("inventoryStatusChart", "Gráfico indisponível.");
    }

    $("openInventoryModal").onclick = () => openInventoryModal();
    $("closeInventoryModal").onclick = $("cancelInventoryModal").onclick = closeInventoryModal;

    $("inventorySearch").oninput = filterInventory;
    $("inventoryCategory").onchange = $("inventoryStatus").onchange = filterInventory;

    $("refreshInventory").onclick = async () => {
        if (await loadInventoryFromApi()) showToast("Inventário atualizado.");
    };

    $("exportInventory").onclick = exportInventoryCsv;

    // Submit do formulário (criar ou editar EPI)
    $("inventoryForm").onsubmit = async event => {
        event.preventDefault();
        if (inventorySaving || !event.currentTarget.reportValidity()) return;

        const formData = Object.fromEntries(new FormData(event.currentTarget));
        const existingId = Number(formData.id);
        if (!canPerform(existingId ? "inventory:edit" : "inventory:create")) return;

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
        if (![apiPayload.estoque, apiPayload.quantidade_min, apiPayload.em_uso].every(value => Number.isSafeInteger(value) && value >= 0)) {
            showToast("Informe quantidades inteiras maiores ou iguais a zero.", "warning");
            return;
        }
        inventorySaving = true;
        const saveButton = $("inventoryForm").querySelector('[type="submit"]');
        saveButton.disabled = true;
        $("inventoryForm").setAttribute("aria-busy", "true");

        try {
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
                if (!Number.isSafeInteger(result.data?.id)) {
                    showToast("Resposta inválida ao salvar EPI. Atualize a lista antes de tentar novamente.", "danger");
                    return;
                }
                const savedEpi = fromApi(result.data);


                if (existingId) {
                    const index = inventoryItems.findIndex(item => item.id === existingId);
                    if (index >= 0) inventoryItems[index] = savedEpi;
                } else {
                    inventoryItems.unshift(savedEpi);
                }

                filteredItems = [...inventoryItems];
                inventorySaving = false;
                closeInventoryModal();
                renderInventory();
                showToast(existingId ? "EPI atualizado." : "EPI cadastrado.");
            } else {
                showToast(mutationError(result, "Falha ao salvar EPI."), "danger");
            }
        } finally {
            inventorySaving = false;
            saveButton.disabled = false;
            $("inventoryForm").setAttribute("aria-busy", "false");
        }
    };

    // Carrega dados reais do backend
    loadInventoryFromApi();
});

window.viewInventoryItem = viewInventoryItem;
window.editInventoryItem = editInventoryItem;
window.deleteInventoryItem = deleteInventoryItem;
window.goInventoryPage = goInventoryPage;
