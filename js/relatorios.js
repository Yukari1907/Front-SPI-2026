
"use strict";

let reportSummary = null;
let reportSectors = [];
let reportComplianceValue = "Dados indisponíveis";

async function loadReportCompliance() {
    const end = new Date(), start = new Date();
    start.setDate(start.getDate() - 29);
    const day = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const params = new URLSearchParams({ data_inicio: `${day(start)} 00:00:00`, data_fim: `${day(end)} 23:59:59` });
    const result = await apiGet(`/estatisticas/conformidade?${params}`);
    const value = result.data?.conformidade_media;
    const totals = ["total_deteccoes", "total_conformes", "total_nao_conformes"];
    const valid = result.ok && totals.every(key => result.data?.[key] !== null && result.data?.[key] !== undefined
        && Number.isFinite(Number(result.data[key])) && Number(result.data[key]) >= 0);
    const label = document.getElementById("reportComplianceState");
    if (valid && value === null) {
        label.textContent = "Sem observações no período.";
        reportComplianceValue = "Sem observações no período";
    } else if (valid && value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100) {
        reportComplianceValue = `${Number(value).toFixed(1)}%`;
        document.getElementById("reportComplianceAverage").textContent = reportComplianceValue;
        label.textContent = "Últimos 30 dias, incluindo hoje";
    } else {
        label.textContent = result.status === 403 ? "Sem permissão para consultar." : "Estatísticas indisponíveis.";
    }
}

async function loadReports() {
    const results = await Promise.all([apiGet("/alertas"), apiGet("/cameras"), apiGet("/setores"), apiGet("/zonas")]);
    const [alertsResult, camerasResult, sectorsResult, zonesResult] = results;
    const valid = alertsResult.status === 404 || (alertsResult.ok && Array.isArray(alertsResult.data));
    if (!valid) {
        showChartState("reportAlerts", "Dados indisponíveis.");
        return;
    }
    const alerts = alertsResult.status === 404 ? [] : alertsResult.data;
    // Datas REST são horários locais do backend serializados em HTTP-date;
    // backendDayKey() as normaliza sem reinterpretar o fuso.
    const days = alerts.map(alert => backendDayKey(alert?.data));
    if (days.some(day => !day)) {
        showChartState("reportAlerts", "Datas dos alertas indisponíveis.");
        return;
    }
    const last = new Date(); const first = new Date(); first.setDate(first.getDate() - 29);
    const start = localDayKey(first), end = localDayKey(last);
    const filtered = alerts.filter((_, index) => days[index] >= start && days[index] <= end);
    const resolved = filtered.filter(alert => alert.resolvido === true).length;
    reportSummary = { total: filtered.length, resolved, rate: filtered.length ? `${(resolved / filtered.length * 100).toFixed(1)}%` : "—" };
    document.getElementById("reportTotal").textContent = reportSummary.total;
    document.getElementById("reportResolved").textContent = reportSummary.resolved;
    document.getElementById("reportRate").textContent = `Taxa de resolução: ${reportSummary.rate}`;
    const map = result => new Map((result.ok && Array.isArray(result.data) ? result.data : []).map(item => [item.id, item]));
    const cameras = map(camerasResult), sectors = map(sectorsResult), zones = map(zonesResult);
    const totals = new Map();
    filtered.forEach(alert => {
        const camera = cameras.get(alert.id_camera ?? zones.get(alert.id_zona)?.id_camera);
        const sector = sectors.get(camera?.id_setor);
        const key = sector?.id ?? null;
        const row = totals.get(key) || [sector?.nome || "Setor indisponível", 0];
        row[1] += 1; totals.set(key, row);
    });
    reportSectors = [...totals.values()];
    document.getElementById("exportReport").disabled = false;
    if (!reportSectors.length || typeof Chart !== "function") {
        showChartState("reportAlerts", reportSectors.length ? "Gráfico indisponível." : "Nenhum alerta no período.");
        return;
    }
    const dark = document.documentElement.dataset.theme === "dark";
    Chart.defaults.color = dark ? "#e2e8f0" : "#374151";
    Chart.defaults.borderColor = dark ? "#334155" : "#e5e7eb";
    new Chart(document.getElementById("reportAlerts"), {
        type: "bar",
        data: { labels: reportSectors.map(item => item[0]), datasets: [{ label: "Alertas", data: reportSectors.map(item => item[1]), backgroundColor: "#3155f5" }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function exportReportsCsv(){
    if (!reportSummary) return;
    const rows = [
        ["VISÃO EPI PRO - RELATÓRIO GERENCIAL"],
        [],
        ["INDICADORES GERAIS"],
        ["Indicador", "Valor"],
        ["Conformidade média", reportComplianceValue],
        ["Alertas nos últimos 30 dias (incluindo hoje)", reportSummary.total],
        ["Alertas resolvidos", reportSummary.resolved],
        ["Taxa de resolução", reportSummary.rate],
        ["Disponibilidade histórica das câmeras", "Dados indisponíveis"],
        [],
        ["EVOLUÇÃO DA CONFORMIDADE"],
        ["Mês", "Conformidade (%)"],
        ["Dados indisponíveis"],
        [],
        ["ALERTAS POR SETOR"],
        ["Setor", "Quantidade"],
        ...reportSectors,
        [],
        [
            "Gerado em",
            new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "medium"
            }).format(new Date())
        ]
    ];

    const csv = rows
        .map(row => row.map(csvEscape).join(";"))
        .join("\r\n");

    const blob = new Blob(
        ["\ufeff" + csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
        "relatorio_visaoepi_" +
        new Date().toISOString().slice(0, 10) +
        ".csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showToast("Relatório CSV gerado com sucesso.");
}

document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
    showChartState("reportCompliance", "Dados de conformidade indisponíveis.");
    document.getElementById("printReport").addEventListener("click", () => window.print());
    document.getElementById("exportReport").disabled = true;
    document.getElementById("exportReport").addEventListener("click", exportReportsCsv);
    await Promise.all([loadReports(), loadReportCompliance()]);
});
