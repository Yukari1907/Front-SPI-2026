
"use strict";

let reportSummary = null;
let reportSectors = [];

async function loadReports() {
    const results = await Promise.all([apiGet("/alertas"), apiGet("/cameras"), apiGet("/setores"), apiGet("/zonas")]);
    const [alertsResult, camerasResult, sectorsResult, zonesResult] = results;
    const valid = alertsResult.status === 404 || (alertsResult.ok && Array.isArray(alertsResult.data));
    if (!valid) {
        showChartState("reportAlerts", "Dados indisponíveis.");
        return;
    }
    const alerts = alertsResult.status === 404 ? [] : alertsResult.data;
    // Datas REST são horários locais do backend, sem fuso no contrato.
    if (alerts.some(alert => !/^\d{4}-\d{2}-\d{2} /.test(alert.data || "") || Number.isNaN(new Date(alert.data.replace(" ", "T")).getTime()))) {
        showChartState("reportAlerts", "Datas dos alertas indisponíveis.");
        return;
    }
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 29);
    const filtered = alerts.filter(alert => {
        const date = new Date(alert.data.replace(" ", "T"));
        return date >= start && date <= end;
    });
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

function csvEscape(value){
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportReportsCsv(){
    if (!reportSummary) return;
    const rows = [
        ["VISÃO EPI PRO - RELATÓRIO GERENCIAL"],
        [],
        ["INDICADORES GERAIS"],
        ["Indicador", "Valor"],
        ["Conformidade média", "Dados indisponíveis"],
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
    await loadReports();
});
