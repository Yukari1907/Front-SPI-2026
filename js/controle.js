
const monitoredWorkers=[
    {
        id:1,
        name:"Ana Souza",
        sector:"Produção",
        lastCheck:"14:32",
        status:"Conforme",
        badge:"success",
        registration:"COL-001",
        shift:"Manhã",
        ppes:[
            ["Capacete","Conforme","success"],
            ["Óculos","Conforme","success"],
            ["Luvas","Conforme","success"],
            ["Botina","Conforme","success"]
        ]
    },
    {
        id:2,
        name:"Carlos Lima",
        sector:"Prensa",
        lastCheck:"14:28",
        status:"Sem óculos",
        badge:"warning",
        registration:"COL-014",
        shift:"Manhã",
        ppes:[
            ["Capacete","Conforme","success"],
            ["Óculos","Não identificado","danger"],
            ["Luvas","Conforme","success"],
            ["Botina","Conforme","success"]
        ]
    },
    {
        id:3,
        name:"João Silva",
        sector:"Expedição",
        lastCheck:"14:20",
        status:"Conforme",
        badge:"success",
        registration:"COL-025",
        shift:"Tarde",
        ppes:[
            ["Capacete","Conforme","success"],
            ["Óculos","Conforme","success"],
            ["Colete","Conforme","success"],
            ["Botina","Conforme","success"]
        ]
    },
    {
        id:4,
        name:"Mariana Alves",
        sector:"Estoque",
        lastCheck:"14:12",
        status:"Sem luvas",
        badge:"danger",
        registration:"COL-032",
        shift:"Tarde",
        ppes:[
            ["Capacete","Conforme","success"],
            ["Óculos","Conforme","success"],
            ["Luvas","Não identificado","danger"],
            ["Botina","Conforme","success"]
        ]
    }
];

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
        showToast(`Ação registrada para ${worker.name}.`);
    };

    document.getElementById("workerModal").classList.add("active");
}

function closeWorkerDetails(){
    document.getElementById("workerModal").classList.remove("active");
}

document.addEventListener("DOMContentLoaded",()=>{
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
    `).join("");

    document.getElementById("closeWorkerModal").onclick=closeWorkerDetails;
    document.getElementById("closeWorkerModalFooter").onclick=closeWorkerDetails;
    document.getElementById("workerModal").addEventListener("click",event=>{
        if(event.target===document.getElementById("workerModal"))closeWorkerDetails();
    });

    const dark=document.documentElement.dataset.theme==="dark";
    Chart.defaults.color=dark?"#e2e8f0":"#374151";
    Chart.defaults.borderColor=dark?"#334155":"#e5e7eb";

    new Chart(document.getElementById("sectorChart"),{
        type:"radar",
        data:{
            labels:["Produção","Prensa","Expedição","Estoque","Manutenção"],
            datasets:[{
                label:"Conformidade %",
                data:[96,89,94,98,91],
                backgroundColor:"rgba(49,85,245,.18)",
                borderColor:"#3155f5"
            }]
        },
        options:{responsive:true,maintainAspectRatio:false}
    });

    new Chart(document.getElementById("ppeIssueChart"),{
        type:"doughnut",
        data:{
            labels:["Capacete","Óculos","Luvas","Colete","Botina"],
            datasets:[{
                data:[5,8,4,2,3],
                backgroundColor:["#3155f5","#0ea5e9","#f59e0b","#2e7d32","#7c3aed"]
            }]
        },
        options:{responsive:true,maintainAspectRatio:false,cutout:"60%"}
    });
});

window.openWorkerDetails=openWorkerDetails;
