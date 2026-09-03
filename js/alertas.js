
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
 * Nota: O backend retorna campos estruturais (id_camera, id_zona, id_epi, evento).
 * Os campos de exibição do frontend (sector, worker, severity, description, action)
 * não existem no banco — são exibidos com valores padrão quando ausentes.
 */

let alerts = [];
let currentAlertId = null;

const $ = id => document.getElementById(id);

// ─────────────────────────────────────────────
// Mapeamento de campos backend → frontend
// ─────────────────────────────────────────────

function fromApiAlerta(apiAlerta) {
    return {
        id: apiAlerta.id,
        // Campos diretos do backend
        event: apiAlerta.evento || "Evento não especificado",
        dateTime: apiAlerta.data || new Date().toISOString(),
        resolvido: apiAlerta.resolvido,
        id_camera: apiAlerta.id_camera,
        id_zona: apiAlerta.id_zona,
        id_epi: apiAlerta.id_epi,
        id_monitorar: apiAlerta.id_monitorar,
        // Campos derivados/inferidos (backend não os retorna diretamente)
        sector: apiAlerta.id_zona ? `Zona ${apiAlerta.id_zona}` : "Não especificado",
        camera: apiAlerta.id_camera ? `Câmera ${apiAlerta.id_camera}` : "Não especificada",
        worker: apiAlerta.id_usuario ? `Usuário ${apiAlerta.id_usuario}` : "Não identificado",
        // Severidade inferida a partir do evento
        severity: inferSeverity(apiAlerta.evento),
        status: apiAlerta.resolvido ? "Resolvido" : "Pendente",
        description: `Alerta detectado: ${apiAlerta.evento || "evento não especificado"}.`,
        action: apiAlerta.resolvido
            ? "Ocorrência revisada e marcada como resolvida no sistema."
            : "Verifique o evento e tome as medidas necessárias."
    };
}

/**
 * Infere severidade com base nas palavras-chave do evento.
 * O backend não tem campo de severidade — inferimos a partir do texto.
 */
function inferSeverity(evento) {
    if (!evento) return "Médio";
    const ev = evento.toLowerCase();
    if (ev.includes("capacete") || ev.includes("restrita") || ev.includes("incêndio")) return "Crítico";
    if (ev.includes("luva") || ev.includes("bota") || ev.includes("colete")) return "Médio";
    return "Baixo";
}

// ─────────────────────────────────────────────
// Carregar dados do backend
// ─────────────────────────────────────────────

async function loadAlertsFromApi() {
    try {
        const result = await apiGet("/alertas");

        if (result.status === 0) {
            showToast("Backend indisponível. Sem dados de alertas.", "warning");
            renderAlerts();
            return;
        }

        if (result.ok && Array.isArray(result.data)) {
            alerts = result.data.map(fromApiAlerta);
        } else if (result.status === 404) {
            // Backend retorna 404 quando não há alertas
            alerts = [];
        } else {
            showToast("Não foi possível carregar os alertas.", "danger");
            alerts = [];
        }

        renderAlerts();
    } catch (e) {
        console.error("[Alertas] Erro ao carregar alertas:", e);
        alerts = [];
        renderAlerts();
    }
}

// ─────────────────────────────────────────────
// Renderização
// ─────────────────────────────────────────────

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
    }).format(date);
}

function severityClass(severity) {
    if (severity === "Crítico") return "danger";
    if (severity === "Médio") return "warning";
    return "success";
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

    return alerts.filter(alert => {
        const searchableText = normalizeFilterText([
            alert.event,
            alert.sector,
            alert.camera,
            alert.worker,
            alert.description
        ].join(" "));

        const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
        const matchesSeverity = !severity || alert.severity === severity;
        const matchesStatus = !status || alert.status === status;

        return matchesSearch && matchesSeverity && matchesStatus;
    });
}

function renderAlerts() {
    const filteredAlerts = getFilteredAlerts();

    if (!filteredAlerts.length) {
        $("alertsTable").innerHTML = `
            <tr>
                <td colspan="6" class="empty">
                    Nenhum alerta encontrado com os filtros selecionados.
                </td>
            </tr>
        `;
        return;
    }

    $("alertsTable").innerHTML = filteredAlerts
        .map(alert => `
            <tr>
                <td>${formatDateTime(alert.dateTime)}</td>
                <td>${escapeHtml(alert.sector)}</td>
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
    $("alertDetailSector").textContent = alert.sector;
    $("alertDetailCamera").textContent = alert.camera;
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

document.addEventListener("DOMContentLoaded", () => {
    // Carrega dados reais do backend
    loadAlertsFromApi();

    $("alertSearch")?.addEventListener("input", renderAlerts);
    $("alertSeverity")?.addEventListener("change", renderAlerts);
    $("alertStatus")?.addEventListener("change", renderAlerts);

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
