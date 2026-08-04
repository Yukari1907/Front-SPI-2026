
"use strict";

const ALERTS_KEY = "visaoepi_alerts";

const DEFAULT_ALERTS = [
    {
        id: 1,
        dateTime: "2026-07-27T14:32:00",
        sector: "Prensa",
        camera: "Câmera 03",
        event: "Sem capacete",
        severity: "Crítico",
        status: "Pendente",
        worker: "MAT-1024",
        description:
            "O sistema identificou um trabalhador na área da prensa sem capacete de segurança.",
        action: "Interromper a atividade e orientar o colaborador."
    },
    {
        id: 2,
        dateTime: "2026-07-27T14:20:00",
        sector: "Expedição",
        camera: "Câmera 07",
        event: "Sem óculos",
        severity: "Médio",
        status: "Em análise",
        worker: "MAT-1048",
        description:
            "Óculos de proteção não identificado durante a movimentação de materiais.",
        action: "Confirmar a ocorrência e verificar o equipamento entregue."
    },
    {
        id: 3,
        dateTime: "2026-07-27T13:50:00",
        sector: "Estoque",
        camera: "Câmera 01",
        event: "Área restrita",
        severity: "Crítico",
        status: "Pendente",
        worker: "MAT-1059",
        description:
            "Pessoa detectada dentro de uma área restrita sem autorização registrada.",
        action: "Acionar o supervisor e retirar a pessoa da área."
    },
    {
        id: 4,
        dateTime: "2026-07-27T12:40:00",
        sector: "Produção",
        camera: "Câmera 04",
        event: "Sem luvas",
        severity: "Baixo",
        status: "Resolvido",
        worker: "MAT-1072",
        description:
            "Luvas não identificadas durante uma atividade de baixo risco.",
        action: "Ocorrência revisada e colaborador orientado."
    }
];

let alerts = loadAlerts();
let currentAlertId = null;

const $ = id => document.getElementById(id);

function loadAlerts() {
    const stored = JSON.parse(localStorage.getItem(ALERTS_KEY) || "null");

    if (!Array.isArray(stored) || stored.length === 0) {
        localStorage.setItem(ALERTS_KEY, JSON.stringify(DEFAULT_ALERTS));
        return [...DEFAULT_ALERTS];
    }

    return stored;
}

function saveAlerts() {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

function formatDateTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

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
    const searchTerm = normalizeFilterText(
        $("alertSearch")?.value
    );

    const severity = $("alertSeverity")?.value || "";
    const status = $("alertStatus")?.value || "";

    return alerts.filter(alert => {
        const searchableText = normalizeFilterText([
            alert.event,
            alert.sector,
            alert.camera,
            alert.worker,
            alert.description,
            alert.action
        ].join(" "));

        const matchesSearch =
            !searchTerm || searchableText.includes(searchTerm);

        const matchesSeverity =
            !severity || alert.severity === severity;

        const matchesStatus =
            !status || alert.status === status;

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
        .map(
            alert => `
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
            `
        )
        .join("");
}

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

function resolveCurrentAlert() {
    if (
        typeof canPerform !== "function" ||
        !canPerform("alerts:manage")
    ) {
        showToast(
            "Seu perfil não possui permissão para resolver alertas.",
            "danger"
        );
        return;
    }

    const alert = alerts.find(item => item.id === currentAlertId);

    if (!alert) {
        return;
    }

    alert.status = "Resolvido";
    alert.action =
        "Ocorrência revisada e marcada como resolvida no sistema.";

    saveAlerts();
    renderAlerts();
    closeAlertModal();
    showToast("Alerta marcado como resolvido.");
}

document.addEventListener("DOMContentLoaded", () => {
    renderAlerts();

    $("alertSearch")?.addEventListener("input", renderAlerts);
    $("alertSeverity")?.addEventListener("change", renderAlerts);
    $("alertStatus")?.addEventListener("change", renderAlerts);

    $("closeAlertDetailsModal").addEventListener(
        "click",
        closeAlertModal
    );

    $("closeAlertDetailsFooter").addEventListener(
        "click",
        closeAlertModal
    );

    $("alertDetailsModal").addEventListener("click", event => {
        if (event.target === $("alertDetailsModal")) {
            closeAlertModal();
        }
    });

    $("resolveAlertButton").addEventListener(
        "click",
        resolveCurrentAlert
    );
});

window.viewAlert = viewAlert;
