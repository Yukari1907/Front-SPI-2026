
"use strict";

/**
 * dashboard.js — Dashboard com alertas recentes reais do backend.
 *
 * API utilizada:
 *   GET /alertas → lista alertas (usa os 3 mais recentes para o dashboard)
 *
 * Os gráficos continuam com dados estáticos demonstrativos
 * (não há API de séries históricas no backend).
 */

function formatTime(dateStr) {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(date);
}

function inferBadge(evento) {
    if (!evento) return "success";
    const ev = evento.toLowerCase();
    if (ev.includes("capacete") || ev.includes("restrita")) return "danger";
    if (ev.includes("óculos") || ev.includes("oculos") || ev.includes("luva")) return "warning";
    return "success";
}

async function loadDashboardEvents() {
    const tbody = document.getElementById("dashboardEvents");
    if (!tbody) return;

    try {
        const result = await apiGet("/alertas");

        if (result.status === 0 || !result.ok) {
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

        const alertas = Array.isArray(result.data) ? result.data : [];

        if (alertas.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty">Nenhum evento registrado.</td>
                </tr>
            `;
            return;
        }

        // Exibe os 3 alertas mais recentes (assumindo que vêm ordenados do backend)
        const recentes = alertas.slice(0, 3);

        tbody.innerHTML = recentes.map(alerta => {
            const badge = alerta.resolvido ? "success" : inferBadge(alerta.evento);
            const status = alerta.resolvido ? "Conforme" : "Não conforme";
            const camera = alerta.id_camera ? `Câmera ${alerta.id_camera}` : "Câmera";
            const zona = alerta.id_zona ? `— Zona ${alerta.id_zona}` : "";
            const descricao = alerta.evento || "Evento não especificado";

            return `
                <tr>
                    <td>${formatTime(alerta.data)}</td>
                    <td>${escapeHtml(camera)} ${escapeHtml(zona)}</td>
                    <td><span class="badge ${badge}">${escapeHtml(status)}</span></td>
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

// Categorias de EPI exibidas no gráfico de rosca. Ver CONTRATO_INTEGRACAO.md:
// GET /alertas/estatisticas/epi só devolve categorias que já tiveram alerta
// (sem total:0 para as ausentes) — o frontend precisa completar com zero.
const DASHBOARD_PPE_CATEGORIES = ["Capacete", "Colete", "Luvas", "Óculos", "Botina"];
const DASHBOARD_PPE_COLORS = ["#3155f5", "#2e7d32", "#f59e0b", "#0ea5e9", "#7c3aed"];

const DASHBOARD_PPE_FALLBACK = [98, 96, 94, 89, 97];
const DASHBOARD_ALERTS_FALLBACK = {
    labels: ["Seg 08h", "Seg 14h", "Ter 08h", "Ter 14h", "Qua 08h", "Qua 14h", "Qui 08h", "Qui 14h", "Sex 08h", "Sex 14h"],
    data: [3, 5, 4, 7, 2, 6, 5, 8, 6, 9]
};

function formatDia(diaStr) {
    const date = new Date(`${diaStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) return diaStr;
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

async function loadPpeChartData() {
    const result = await apiGet("/alertas/estatisticas/epi");

    if (result.status === 0 || !result.ok || !Array.isArray(result.data)) {
        showToast("Estatísticas de EPI indisponíveis — exibindo dados de exemplo.", "warning");
        return DASHBOARD_PPE_FALLBACK;
    }

    // Completa com zero as categorias que não aparecem na resposta
    // (nunca geraram alerta), conforme o contrato.
    const totaisPorCategoria = {};
    result.data.forEach(item => {
        totaisPorCategoria[item.categoria] = item.total;
    });

    return DASHBOARD_PPE_CATEGORIES.map(categoria => totaisPorCategoria[categoria] || 0);
}

async function loadAlertsChartData() {
    const result = await apiGet("/alertas/estatisticas/periodo");

    if (result.status === 0 || !result.ok || !Array.isArray(result.data)) {
        showToast("Estatísticas de alertas por período indisponíveis — exibindo dados de exemplo.", "warning");
        return DASHBOARD_ALERTS_FALLBACK;
    }

    return {
        labels: result.data.map(item => formatDia(item.dia)),
        data: result.data.map(item => item.total)
    };
}

document.addEventListener("DOMContentLoaded", async () => {
    // Carrega eventos reais
    loadDashboardEvents();

    const dark = document.documentElement.dataset.theme === "dark";
    Chart.defaults.color = dark ? "#e2e8f0" : "#374151";
    Chart.defaults.borderColor = dark ? "#334155" : "#e5e7eb";

    const ppeData = await loadPpeChartData();

    new Chart(document.getElementById("dashboardPpeChart"), {
        type: "doughnut",
        data: {
            labels: DASHBOARD_PPE_CATEGORIES,
            datasets: [{
                data: ppeData,
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

    new Chart(document.getElementById("dashboardAlertsChart"), {
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
