
document.addEventListener("DOMContentLoaded",()=>{
    const events=[
        ["14:32","Câmera 03 - Prensa","Não conforme","Operador sem capacete","danger"],
        ["14:28","Câmera 01 - Estoque","Conforme","Todos os EPIs identificados","success"],
        ["14:20","Câmera 07 - Expedição","Atenção","Óculos não identificado","warning"]
    ];

    document.getElementById("dashboardEvents").innerHTML=events.map(event=>`
        <tr>
            <td>${event[0]}</td>
            <td>${event[1]}</td>
            <td><span class="badge ${event[4]}">${event[2]}</span></td>
            <td>${event[3]}</td>
        </tr>
    `).join("");

    const dark=document.documentElement.dataset.theme==="dark";
    Chart.defaults.color=dark?"#e2e8f0":"#374151";
    Chart.defaults.borderColor=dark?"#334155":"#e5e7eb";

    new Chart(document.getElementById("dashboardPpeChart"),{
        type:"doughnut",
        data:{
            labels:["Capacete","Colete","Luvas","Óculos","Botina"],
            datasets:[{
                data:[98,96,94,89,97],
                backgroundColor:["#3155f5","#2e7d32","#f59e0b","#0ea5e9","#7c3aed"]
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            cutout:"65%",
            plugins:{legend:{position:"right"}}
        }
    });

    new Chart(document.getElementById("dashboardAlertsChart"),{
        type:"line",
        data:{
            labels:["Seg 08h","Seg 14h","Ter 08h","Ter 14h","Qua 08h","Qua 14h","Qui 08h","Qui 14h","Sex 08h","Sex 14h"],
            datasets:[{
                label:"Alertas",
                data:[3,5,4,7,2,6,5,8,6,9],
                borderColor:"#dc2626",
                backgroundColor:"rgba(220,38,38,.16)",
                fill:true,
                tension:.4
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            scales:{y:{beginAtZero:true}}
        }
    });
});
