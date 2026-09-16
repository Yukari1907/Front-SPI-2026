
"use strict";

/**
 * dashboard.js — Dashboard com alertas recentes reais do backend.
 *
 * API utilizada:
 *   GET /alertas → lista alertas (usa os 3 mais recentes para o dashboard)
 *
 * Estatísticas e status usam as rotas documentadas em CONTRATO_INTEGRACAO.md.
 */

function formatTime(dateStr) {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(date);
}

async function loadDashboardKpis() {
    const cameras = await apiGet("/cameras/status");
    const cameraCount = document.getElementById("dashboardCamerasOnline");
    if (cameraCount) cameraCount.textContent = cameras.ok && Array.isArray(cameras.data)
        ? `${cameras.data.filter(camera => camera.status === "Ativo").length}/${cameras.data.length}` : "—";
}

async function loadDashboardEvents() {
    const tbody = document.getElementById("dashboardEvents");
    if (!tbody) return;
    document.getElementById("dashboardAlertsToday").textContent = "—";

    try {
        const result = await apiGet("/alertas");

        if (result.status !== 404 && !result.ok) {
            // Backend indisponível — exibe mensagem amigável
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center;color:var(--text-muted);padding:16px;">
                        Não foi possível carregar os eventos. Backend indisponível.
                    </td>
                </tr>
            `;
            return;
        }

        const valid = result.status === 404 || (result.ok && Array.isArray(result.data));
        if (!valid) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty">Dados indisponíveis</td></tr>';
            return;
        }
        const alertas = Array.isArray(result.data) ? result.data : [];
        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        document.getElementById("dashboardAlertsToday").textContent = alertas.some(alert => !alert.data)
            ? "—" : String(alertas.filter(alert => alert.data.slice(0, 10) === todayKey).length);

        if (alertas.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty">Nenhum evento registrado.</td>
                </tr>
            `;
            return;
        }

        // A listagem não garante ordenação; a data REST permite ordenação lexical.
        const recentes = [...alertas].sort((a, b) => String(b.data || "").localeCompare(String(a.data || ""))).slice(0, 3);

        tbody.innerHTML = recentes.map(alerta => {
            const meta = notificationSeverityMeta(alerta.severidade);
            const badge = meta.badge;
            const status = alerta.resolvido ? "Resolvido" : "Pendente";
            const camera = alerta.id_camera ? `Câmera ${alerta.id_camera}` : "Câmera";
            const zona = alerta.id_zona ? `— Zona ${alerta.id_zona}` : "";
            const descricao = alerta.evento || "Evento não especificado";

            return `
                <tr>
                    <td>${formatTime(alerta.data)}</td>
                    <td>${escapeHtml(camera)} ${escapeHtml(zona)}</td>
                    <td><span class="badge ${badge}">${escapeHtml(meta.label)}</span><small class="text-muted"> ${escapeHtml(status)}</small></td>
                    <td>${escapeHtml(descricao)}</td>
                </tr>
            `;
        }).join("");

    } catch (e) {
        console.error("[Dashboard] Erro ao carregar eventos:", e);
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center;color:var(--danger);">
                    Erro ao carregar eventos.
                </td>
            </tr>
        `;
    }
}

const DASHBOARD_PPE_COLORS = ["#3155f5", "#2e7d32", "#f59e0b", "#0ea5e9", "#7c3aed"];

function formatDia(diaStr) {
    const date = new Date(`${diaStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) return diaStr;
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

async function loadPpeChartData() {
    const result = await apiGet("/alertas/estatisticas/epi");

    if (!result.ok || !Array.isArray(result.data)) return null;
    return { labels: result.data.map(item => item.categoria), data: result.data.map(item => item.total) };
}

async function loadAlertsChartData() {
    const result = await apiGet("/alertas/estatisticas/periodo");

    if (!result.ok || !Array.isArray(result.data)) return null;

    return {
        labels: result.data.map(item => formatDia(item.dia)),
        data: result.data.map(item => item.total)
    };
}

document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
    // Carrega eventos reais
    loadDashboardEvents();
    loadDashboardKpis();

    const dark = document.documentElement.dataset.theme === "dark";
    if (typeof Chart !== "function") {
        showChartState("dashboardPpeChart", "Gráfico indisponível.");
        showChartState("dashboardAlertsChart", "Gráfico indisponível.");
        return;
    }
    Chart.defaults.color = dark ? "#e2e8f0" : "#374151";
    Chart.defaults.borderColor = dark ? "#334155" : "#e5e7eb";

    const ppeData = await loadPpeChartData();

    if (!ppeData || !ppeData.data.length) showChartState("dashboardPpeChart", ppeData ? "Nenhum alerta de EPI registrado." : "Dados indisponíveis");
    else new Chart(document.getElementById("dashboardPpeChart"), {
        type: "doughnut",
        data: {
            labels: ppeData.labels,
            datasets: [{
                data: ppeData.data,
                backgroundColor: DASHBOARD_PPE_COLORS
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "65%",
            plugins: { legend: { position: "right" } }
        }
    });

    const alertsData = await loadAlertsChartData();

    if (!alertsData || !alertsData.data.length) showChartState("dashboardAlertsChart", alertsData ? "Nenhum alerta no período." : "Dados indisponíveis");
    else new Chart(document.getElementById("dashboardAlertsChart"), {
        type: "line",
        data: {
            labels: alertsData.labels,
            datasets: [{
                label: "Alertas",
                data: alertsData.data,
                borderColor: "#dc2626",
                backgroundColor: "rgba(220,38,38,.16)",
                fill: true,
                tension: .4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
});
