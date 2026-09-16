
// Não há contrato de colaboradores ou conformidade individual.
const monitoredWorkers=[];

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

    showChartState("sectorChart", "Dados de conformidade indisponíveis.");
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
