"use strict";

/**
 * controle.js — Conformidade de EPIs com dados reais do backend.
 *
 *   Conformes / Não conformes / Detecções avaliadas / Taxa de conformidade
 *     → GET /estatisticas/conformes → {total_conformes, total_nao_conformes}
 *   Conformidade por setor  → GET /setores + GET /estatisticas/setor/{id}
 *   Alertas por categoria   → GET /alertas/estatisticas/epi
 *
 * Semântica de /estatisticas/conformes: soma histórica global da tabela de
 * estatísticas. A rota não aceita data, setor, câmera, zona nem EPI, por isso os
 * quatro cards declaram "Total acumulado" e não acompanham o recorte de 30 dias do
 * gráfico por setor. São detecções amostradas, não pessoas distintas.
 *
 * Zero real aparece como 0; erro e resposta fora do contrato mantêm "—".
 */

/**
 * Valor de contagem aceito pelo contrato, ou null quando fora dele.
 * @param {unknown} raw
 * @returns {number|null}
 */
function complianceCount(raw) {
    if (typeof raw !== "number" && typeof raw !== "string") return null;
    if (raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

function setComplianceCard(valueId, stateId, value, state) {
    const valueElement = document.getElementById(valueId);
    const stateElement = document.getElementById(stateId);
    if (valueElement) valueElement.textContent = value;
    if (stateElement) stateElement.textContent = state;
}

const COMPLIANCE_CARDS = ["compliantCount", "nonCompliantCount", "evaluatedCount", "complianceRate"];
const COMPLIANCE_STATES = ["compliantState", "nonCompliantState", "evaluatedState", "complianceRateState"];

async function loadComplianceCounts() {
    const result = await apiGetComplianceCounts();
    const compliant = complianceCount(result.data?.total_conformes);
    const nonCompliant = complianceCount(result.data?.total_nao_conformes);

    if (!result.ok || compliant === null || nonCompliant === null) {
        const state = result.status === 403
            ? "Seu perfil não possui permissão para esta consulta."
            : result.status === 0 || result.status === -1
                ? "Não foi possível conectar ao servidor."
                : "Dados indisponíveis";
        COMPLIANCE_CARDS.forEach((id, index) => setComplianceCard(id, COMPLIANCE_STATES[index], "—", state));
        return;
    }

    const total = compliant + nonCompliant;
    setComplianceCard("compliantCount", "compliantState", compliant.toLocaleString("pt-BR"), "Total acumulado");
    setComplianceCard("nonCompliantCount", "nonCompliantState", nonCompliant.toLocaleString("pt-BR"), "Total acumulado");
    setComplianceCard("evaluatedCount", "evaluatedState", total.toLocaleString("pt-BR"), "Detecções avaliadas, não pessoas");

    // Sem denominador válido não há taxa: uma base sem observação não é 100%.
    if (total === 0) {
        setComplianceCard("complianceRate", "complianceRateState", "—", "Sem observações registradas");
        return;
    }
    setComplianceCard("complianceRate", "complianceRateState",
        `${(compliant / total * 100).toFixed(1).replace(".", ",")}%`,
        "Conformes sobre o total acumulado");
}

async function loadSectorCompliance() {
    const result = await apiGet("/setores");
    if (!result.ok || !Array.isArray(result.data)) {
        showChartState("sectorChart", "Não foi possível consultar os setores.");
        return;
    }
    if (!result.data.length) {
        showChartState("sectorChart", "Nenhum setor cadastrado.");
        return;
    }
    const end = new Date(), start = new Date(); start.setDate(start.getDate() - 29);
    const day = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const params = new URLSearchParams({ data_inicio: `${day(start)} 00:00:00`, data_fim: `${day(end)} 23:59:59` });
    const values = await Promise.all(result.data.map(async sector => {
        const response = await apiGet(`/estatisticas/setor/${sector.id}?${params}`);
        const raw = response.data?.conformidade_media;
        const valid = response.ok && (raw === null || ((typeof raw === "number" || typeof raw === "string")
            && raw !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0 && Number(raw) <= 100));
        return { sector, valid, value: raw === null ? null : Number(raw) };
    }));
    if (values.some(item => !item.valid)) {
        showChartState("sectorChart", "Estatísticas por setor indisponíveis. Tente recarregar a página.");
        return;
    }
    const observed = values.filter(item => item.value !== null);
    if (!observed.length || typeof Chart !== "function") {
        showChartState("sectorChart", observed.length ? "Gráfico indisponível." : "Sem observações de conformidade no período.");
        return;
    }
    const canvas = document.getElementById("sectorChart");
    canvas.hidden = false; canvas.style.display = "";
    document.getElementById("sectorChartState")?.remove();
    new Chart(canvas, {
        type: "bar",
        data: { labels: observed.map(item => item.sector.nome), datasets: [{ label: "Conformidade (%) — últimos 30 dias", data: observed.map(item => item.value), backgroundColor: "#3155f5" }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } }
    });
    if (observed.length !== values.length) {
        const note = document.createElement("p"); note.className = "text-muted";
        note.textContent = "Setores sem observações no período não possuem percentual e não são exibidos.";
        canvas.parentElement.appendChild(note);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
    showChartState("sectorChart", "Carregando conformidade por setor...");
    loadSectorCompliance();
    loadComplianceCounts();
    const result = await apiGet("/alertas/estatisticas/epi");
    if (!result.ok || !Array.isArray(result.data) || !result.data.length || typeof Chart !== "function") {
        showChartState("ppeIssueChart", result.ok && Array.isArray(result.data) && !result.data.length
            ? "Nenhum alerta de EPI registrado." : "Dados indisponíveis.");
        return;
    }
    const dark = document.documentElement.dataset.theme === "dark";
    Chart.defaults.color = dark ? "#e2e8f0" : "#374151";
    Chart.defaults.borderColor = dark ? "#334155" : "#e5e7eb";
    new Chart(document.getElementById("ppeIssueChart"), {
        type: "doughnut",
        data: {
            labels: result.data.map(item => item.categoria),
            datasets: [{ data: result.data.map(item => item.total),
                backgroundColor: ["#3155f5", "#0ea5e9", "#f59e0b", "#2e7d32", "#7c3aed"] }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: "60%" }
    });
});
