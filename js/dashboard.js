
"use strict";

/**
 * dashboard.js — Visão geral com dados reais do backend.
 *
 * Cada indicador e o endpoint de onde ele sai:
 *   Detecções avaliadas → GET /estatisticas/conformes → total_conformes + total_nao_conformes
 *   Conformidade EPI     → GET /estatisticas/conformes → conformes / (conformes + não conformes)
 *   Alertas hoje         → GET /alertas (histórico completo, filtrado pelo dia localmente)
 *   Câmeras online       → GET /cameras/status → itens com status "Ativo"
 *   Alertas por EPI      → GET /alertas/estatisticas/epi
 *   Alertas por dia      → GET /alertas/estatisticas/periodo (padrão de 30 dias do backend)
 *   Alertas recentes     → GET /alertas (3 mais recentes)
 *
 * /estatisticas/conformes não aceita filtro algum: é a soma histórica global, e os
 * dois cards declaram "Total acumulado" em vez de sugerir recorte de período.
 *
 * Carregando, zero real, vazio e erro são estados distintos: zero aparece como 0 e
 * nenhuma falha de leitura vira zero.
 */

function formatTime(dateStr) {
    // Hora tal como o servidor registrou: o sufixo "GMT" do HTTP-date não
    // corresponde ao horário local ingênuo gravado, e converter deslocaria o valor.
    const key = backendTimestampKey(dateStr);
    return key ? key.slice(11, 16) : "—";
}

function setKpi(valueId, stateId, value, state) {
    const valueElement = document.getElementById(valueId);
    const stateElement = document.getElementById(stateId);
    if (valueElement) valueElement.textContent = value;
    if (stateElement) stateElement.textContent = state;
}

/**
 * Mensagem do estado de leitura, distinguindo sem permissão, servidor fora do ar e
 * resposta fora do contrato. Nenhum deles pode ser confundido com zero real.
 */
function readFailureState(result, fallback = "Dados indisponíveis") {
    if (result.status === 403) return "Seu perfil não possui permissão para esta consulta.";
    if (result.status === 401) return "Sessão expirada.";
    if (result.status === 0 || result.status === -1) return "Não foi possível conectar ao servidor.";
    if (result.status >= 500) return "O servidor não respondeu a esta consulta.";
    return fallback;
}

function finiteCount(raw) {
    if (typeof raw !== "number" && typeof raw !== "string") return null;
    if (raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Cards Detecções avaliadas e Conformidade EPI — GET /estatisticas/conformes.
 * O percentual só é calculado com denominador válido: base sem observação alguma
 * mostra estado próprio, nunca 100%.
 */
async function loadDashboardCompliance() {
    const result = await apiGetComplianceCounts();
    const compliant = finiteCount(result.data?.total_conformes);
    const nonCompliant = finiteCount(result.data?.total_nao_conformes);

    if (!result.ok || compliant === null || nonCompliant === null) {
        const state = readFailureState(result);
        setKpi("dashboardEvaluated", "dashboardEvaluatedState", "—", state);
        setKpi("dashboardCompliance", "dashboardComplianceState", "—", state);
        return;
    }

    const total = compliant + nonCompliant;
    setKpi("dashboardEvaluated", "dashboardEvaluatedState",
        total.toLocaleString("pt-BR"), "Total acumulado");

    if (total === 0) {
        setKpi("dashboardCompliance", "dashboardComplianceState", "—", "Sem observações registradas");
        return;
    }

    setKpi("dashboardCompliance", "dashboardComplianceState",
        `${(compliant / total * 100).toFixed(1).replace(".", ",")}%`,
        `${compliant.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} — total acumulado`);
}

async function loadDashboardKpis() {
    const result = await apiGet("/cameras/status");

    if (!result.ok || !Array.isArray(result.data)) {
        setKpi("dashboardCamerasOnline", "dashboardCamerasOnlineState", "—", readFailureState(result));
        return;
    }
    // Base sem câmera é zero real, e zero real aparece como zero.
    const online = result.data.filter(camera => camera.status === "Ativo").length;
    setKpi("dashboardCamerasOnline", "dashboardCamerasOnlineState",
        `${online}/${result.data.length}`,
        result.data.length ? "Status atual das câmeras" : "Nenhuma câmera cadastrada");
}

/**
 * Alertas recentes e o card "Alertas hoje".
 *
 * GET /alertas devolve o histórico completo e responde 404 quando não há nenhum
 * alerta — esse 404 é vazio real, não erro. A data vem em HTTP-date, por isso o dia
 * e a ordenação passam por backendDayKey()/backendTimestampKey().
 */
async function loadDashboardEvents() {
    const tbody = document.getElementById("dashboardEvents");
    if (!tbody) return;

    try {
        const result = await apiGet("/alertas");
        const empty = result.status === 404;

        if (!empty && !result.ok) {
            setKpi("dashboardAlertsToday", "dashboardAlertsTodayState", "—", readFailureState(result));
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty">Não foi possível carregar os eventos.</td>
                </tr>
            `;
            return;
        }

        if (!empty && !Array.isArray(result.data)) {
            setKpi("dashboardAlertsToday", "dashboardAlertsTodayState", "—", "Dados indisponíveis");
            tbody.innerHTML = '<tr><td colspan="4" class="empty">Dados indisponíveis</td></tr>';
            return;
        }

        const alertas = empty || !Array.isArray(result.data) ? [] : result.data;
        const days = alertas.map(alerta => backendDayKey(alerta?.data));

        // Uma única data ilegível já torna a contagem do dia incerta: melhor não
        // afirmar um número do que afirmar um número errado.
        if (days.some(day => !day)) {
            setKpi("dashboardAlertsToday", "dashboardAlertsTodayState", "—", "Datas em formato não reconhecido");
        } else {
            const today = localDayKey();
            setKpi("dashboardAlertsToday", "dashboardAlertsTodayState",
                String(days.filter(day => day === today).length), "Registros de hoje");
        }

        if (alertas.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty">Nenhum evento registrado.</td>
                </tr>
            `;
            return;
        }

        // A listagem não garante ordenação; o carimbo normalizado ordena por texto.
        const recentes = [...alertas]
            .sort((a, b) => backendTimestampKey(b?.data).localeCompare(backendTimestampKey(a?.data)))
            .slice(0, 3);

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
        setKpi("dashboardAlertsToday", "dashboardAlertsTodayState", "—", "Dados indisponíveis");
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="empty">Erro ao carregar eventos.</td>
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
    loadDashboardCompliance();

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
