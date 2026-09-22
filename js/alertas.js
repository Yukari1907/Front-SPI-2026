
"use strict";

/**
 * alertas.js — Gerenciamento de alertas via API real do backend.
 *
 * API utilizada:
 *   GET  /alertas              → listar todos
 *   GET  /alertas/<id>         → obter alerta específico
 *   PUT  /alertas/<id>/resolvido → marcar como resolvido
 *   DELETE /alertas/<id>       → excluir alerta
 *
 * GET /zonas, /cameras e /setores fornecem os nomes e vínculos de localização.
 * /alertas retorna id_zona e id_camera, sem nomes nem id_setor.
 * Setor é obtido pela câmera; zona nunca é usada como nome de setor.
 */

let alerts = [];
let alertsLoaded = false;
let currentAlertId = null;
const ALERTS_PAGE_SIZE = 50;
let currentPage = 1;

const $ = id => document.getElementById(id);

// ─────────────────────────────────────────────
// Mapeamento de campos backend → frontend
// ─────────────────────────────────────────────

function fromApiAlerta(apiAlerta, locations) {
    const zone = locations.zones.get(apiAlerta.id_zona);
    const camera = locations.cameras.get(apiAlerta.id_camera ?? zone?.id_camera);
    const sector = locations.sectors.get(camera?.id_setor);
    const name = item => typeof item?.nome === "string" ? item.nome.trim() : "";
    return {
        id: apiAlerta.id,
        // Campos diretos do backend
        event: apiAlerta.evento || "Evento não especificado",
        dateTime: apiAlerta.data || null,
        resolvido: apiAlerta.resolvido,
        id_camera: apiAlerta.id_camera,
        id_zona: apiAlerta.id_zona,
        id_epi: apiAlerta.id_epi,
        id_monitorar: apiAlerta.id_monitorar,
        type: apiAlerta.tipo_deteccao || "legado",
        // Nomes dos cadastros reais. Ausência não gera rótulos a partir de IDs.
        sector: name(sector),
        zone: name(zone),
        camera: name(camera),
        worker: apiAlerta.id_usuario ? `Usuário ${apiAlerta.id_usuario}` : "—",
        // Severidade persistida, sem inferir pelo texto do evento.
        severidade: apiAlerta.severidade,
        severity: notificationSeverityMeta(apiAlerta.severidade).label,
        status: apiAlerta.resolvido ? "Resolvido" : "Pendente",
        description: `Alerta detectado: ${apiAlerta.evento || "evento não especificado"}.`,
        action: apiAlerta.resolvido
            ? "Ocorrência revisada e marcada como resolvida no sistema."
            : "Verifique o evento e tome as medidas necessárias."
    };
}

// ─────────────────────────────────────────────
// Carregar dados do backend
// ─────────────────────────────────────────────

async function loadAlertsFromApi() {
    try {
        const result = await apiGet("/alertas");
        alertsLoaded = (result.ok && Array.isArray(result.data)) || result.status === 404;
        alerts = [];
        if (result.ok && Array.isArray(result.data) && result.data.length) {
            // Uma consulta por cadastro, sem requisições por alerta ou por página.
            // Falhas de localização não impedem a listagem/resolução dos alertas.
            const results = await Promise.allSettled([
                apiGet("/zonas"), apiGet("/cameras"), apiGet("/setores")
            ]);
            const [zones, cameras, sectors] = results.map(result => {
                const response = result.status === "fulfilled" ? result.value : null;
                const items = response?.ok && Array.isArray(response.data) ? response.data : [];
                return new Map(items.filter(item => item?.id != null).map(item => [item.id, item]));
            });
            alerts = result.data.map(alert => fromApiAlerta(alert, { zones, cameras, sectors }));
        }
        if (!alertsLoaded) showToast("Não foi possível carregar os alertas.", "warning");
    } catch (e) {
        console.error("[Alertas] Erro ao carregar alertas:", e);
        alertsLoaded = false;
        alerts = [];
    }
    renderAlerts();
}

// Contagem global da listagem completa documentada em /alertas.
// Os filtros da tabela não alteram os cards; resolvidos também contam na severidade.
function renderAlertCounts() {
    const counts = {
        alertsCritical: alerts.filter(alert => alert.severidade === 3).length,
        alertsMedium: alerts.filter(alert => alert.severidade === 2).length,
        alertsLow: alerts.filter(alert => alert.severidade === 1).length,
        alertsResolved: alerts.filter(alert => alert.resolvido === true).length
    };
    Object.entries(counts).forEach(([id, count]) => {
        if ($(id)) $(id).textContent = alertsLoaded ? String(count) : "—";
    });
}

// ─────────────────────────────────────────────
// Renderização
// ─────────────────────────────────────────────

function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
    }).format(date);
}

function severityClass(severity) {
    if (severity === "Crítico") return "danger";
    if (severity === "Médio") return "warning";
    return severity === "Baixo" ? "success" : "";
}

function normalizeFilterText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function getFilteredAlerts() {
    const searchTerm = normalizeFilterText($("alertSearch")?.value);
    const severity = $("alertSeverity")?.value || "";
    const status = $("alertStatus")?.value || "";
    const type = $("alertType")?.value || "";
    const start = $("alertStartDate")?.value || "";
    const end = $("alertEndDate")?.value || "";

    return alerts.filter(alert => {
        const searchableText = normalizeFilterText([
            alert.event,
            alert.sector,
            alert.zone,
            alert.camera,
            alert.worker,
            alert.description
        ].join(" "));

        const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
        const matchesSeverity = !severity || alert.severity === severity;
        const matchesStatus = !status || alert.status === status;

        const matchesType = !type || (type === "postura"
            ? ["postura_tronco", "postura_rotacao", "queda"].includes(alert.type) : alert.type === type);
        // /alertas não aceita parâmetros de data. Filtramos a coleção real localmente.
        const day = /^\d{4}-\d{2}-\d{2}/.exec(alert.dateTime || "")?.[0];
        const matchesDate = (!start && !end) || (day && (!start || day >= start) && (!end || day <= end));
        return matchesSearch && matchesSeverity && matchesStatus && matchesType && matchesDate;
    });
}

function renderAlerts() {
    renderAlertCounts();
    const filteredAlerts = getFilteredAlerts();
    const total = filteredAlerts.length;
    const totalPages = Math.max(1, Math.ceil(total / ALERTS_PAGE_SIZE));
    // Recalcula também após resolver/recarregar, mantendo a página se ainda existir.
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const start = (currentPage - 1) * ALERTS_PAGE_SIZE;
    const end = Math.min(start + ALERTS_PAGE_SIZE, total);

    $("alertsPrevious").disabled = !alertsLoaded || currentPage === 1;
    $("alertsNext").disabled = !alertsLoaded || currentPage === totalPages;
    $("alertsRange").textContent = !alertsLoaded ? "—"
        : total ? `${start + 1}–${end} de ${total}` : "0 de 0";

    if (!filteredAlerts.length) {
        $("alertsTable").innerHTML = `
            <tr>
                <td colspan="7" class="empty">
                    ${alertsLoaded ? "Nenhum alerta encontrado com os filtros selecionados." : "Não foi possível carregar os alertas."}
                </td>
            </tr>
        `;
        return;
    }

    // Paginação local após todos os filtros, preservando a ordem recebida da API.
    $("alertsTable").innerHTML = filteredAlerts.slice(start, end)
        .map(alert => `
            <tr>
                <td>${formatDateTime(alert.dateTime)}</td>
                <td>${escapeHtml(alert.sector || "—")}</td>
                <td>${escapeHtml(alert.zone || "—")}</td>
                <td>${escapeHtml(alert.event)}</td>

                <td>
                    <span class="badge ${severityClass(alert.severity)}">
                        ${escapeHtml(alert.severity)}
                    </span>
                </td>

                <td>${escapeHtml(alert.status)}</td>

                <td>
                    <button
                        class="icon-btn"
                        type="button"
                        onclick="viewAlert(${alert.id})"
                        title="Visualizar alerta"
                        aria-label="Visualizar alerta"
                    >
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>
            </tr>
        `)
        .join("");
}

// ─────────────────────────────────────────────
// Modal de detalhes
// ─────────────────────────────────────────────

function viewAlert(id) {
    const alert = alerts.find(item => item.id === id);

    if (!alert) {
        showToast("Alerta não encontrado.", "danger");
        return;
    }

    currentAlertId = id;

    $("alertDetailTitle").textContent = alert.event;
    $("alertDetailDate").textContent = formatDateTime(alert.dateTime);
    $("alertDetailSector").textContent = alert.sector || "—";
    $("alertDetailZone").textContent = alert.zone || "—";
    $("alertDetailCamera").textContent = alert.camera || "—";
    $("alertDetailWorker").textContent = alert.worker;
    $("alertDetailSeverity").textContent = alert.severity;
    $("alertDetailStatus").textContent = alert.status;
    $("alertDetailDescription").textContent = alert.description;
    $("alertDetailAction").textContent = alert.action;

    const resolveButton = $("resolveAlertButton");
    if (resolveButton) {
        const canManage =
            typeof canPerform === "function" &&
            canPerform("alerts:manage");

        resolveButton.style.display =
            canManage && alert.status !== "Resolvido"
                ? "inline-flex"
                : "none";
    }

    $("alertDetailsModal").classList.add("active");
}

function closeAlertModal() {
    $("alertDetailsModal").classList.remove("active");
    currentAlertId = null;
}

async function resolveCurrentAlert() {
    if (
        typeof canPerform !== "function" ||
        !canPerform("alerts:manage")
    ) {
        showToast("Seu perfil não possui permissão para resolver alertas.", "danger");
        return;
    }

    if (!currentAlertId) return;

    const result = await apiPut(`/alertas/${currentAlertId}/resolvido`);

    if (result.status === 0) {
        showToast("Backend indisponível.", "warning");
        return;
    }

    if (result.ok) {
        // Atualiza o estado local do alerta
        const alert = alerts.find(item => item.id === currentAlertId);
        if (alert) {
            alert.status = "Resolvido";
            alert.resolvido = true;
            alert.action = "Ocorrência revisada e marcada como resolvida no sistema.";
        }

        renderAlerts();
        closeAlertModal();
        showToast("Alerta marcado como resolvido.");
    } else {
        showToast(result.data?.message || "Falha ao resolver alerta.", "danger");
    }
}

// ─────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
    // Carrega dados reais do backend
    loadAlertsFromApi();

    const resetAlertsPage = () => {
        currentPage = 1;
        renderAlerts();
    };
    $("alertSearch")?.addEventListener("input", resetAlertsPage);
    $("alertSeverity")?.addEventListener("change", resetAlertsPage);
    $("alertStatus")?.addEventListener("change", resetAlertsPage);
    ["alertType", "alertStartDate", "alertEndDate"].forEach(id => $(id)?.addEventListener("change", resetAlertsPage));

    $("alertsPrevious").addEventListener("click", () => {
        if ($("alertsPrevious").disabled) return;
        currentPage -= 1;
        renderAlerts();
    });
    $("alertsNext").addEventListener("click", () => {
        if ($("alertsNext").disabled) return;
        currentPage += 1;
        renderAlerts();
    });

    $("closeAlertDetailsModal").addEventListener("click", closeAlertModal);
    $("closeAlertDetailsFooter").addEventListener("click", closeAlertModal);

    $("alertDetailsModal").addEventListener("click", event => {
        if (event.target === $("alertDetailsModal")) {
            closeAlertModal();
        }
    });

    $("resolveAlertButton").addEventListener("click", resolveCurrentAlert);
});

window.viewAlert = viewAlert;
