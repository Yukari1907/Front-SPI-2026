
// Não há contrato de colaboradores ou conformidade individual.
const monitoredWorkers=[];

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

function getInitials(name){
    return name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();
}

function openWorkerDetails(workerId){
    const worker=monitoredWorkers.find(item=>item.id===workerId);
    if(!worker)return;

    document.getElementById("workerAvatar").textContent=getInitials(worker.name);
    document.getElementById("workerName").textContent=worker.name;
    document.getElementById("workerSector").textContent=worker.sector;
    document.getElementById("workerLastCheck").textContent=worker.lastCheck;
    document.getElementById("workerStatus").innerHTML=`<span class="badge ${worker.badge}">${worker.status}</span>`;
    document.getElementById("workerRegistration").textContent=worker.registration;
    document.getElementById("workerShift").textContent=worker.shift;

    document.getElementById("workerPpeList").innerHTML=worker.ppes.map(item=>`
        <div class="worker-ppe-item">
            <strong>${item[0]}</strong>
            <span class="badge ${item[2]}">${item[1]}</span>
        </div>
    `).join("");

    document.getElementById("registerWorkerAction").onclick=()=>{
        showToast("Registro de ações indisponível.", "warning");
    };

    document.getElementById("workerModal").classList.add("active");
}

function closeWorkerDetails(){
    document.getElementById("workerModal").classList.remove("active");
}

document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
    document.getElementById("workersTable").innerHTML=monitoredWorkers.map(worker=>`
        <tr>
            <td>${worker.name}</td>
            <td>${worker.sector}</td>
            <td>${worker.lastCheck}</td>
            <td><span class="badge ${worker.badge}">${worker.status}</span></td>
            <td>
                <button class="icon-btn" type="button" onclick="openWorkerDetails(${worker.id})" title="Visualizar colaborador">
                    <i class="fa-solid fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join("") || '<tr><td colspan="5" class="empty">Dados de colaboradores indisponíveis.</td></tr>';

    document.getElementById("closeWorkerModal").onclick=closeWorkerDetails;
    document.getElementById("closeWorkerModalFooter").onclick=closeWorkerDetails;
    document.getElementById("workerModal").addEventListener("click",event=>{
        if(event.target===document.getElementById("workerModal"))closeWorkerDetails();
    });

    showChartState("sectorChart", "Carregando conformidade por setor...");
    loadSectorCompliance();
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

window.openWorkerDetails=openWorkerDetails;
