
document.addEventListener("DOMContentLoaded",()=>{
    const dark=document.documentElement.dataset.theme==="dark";
    Chart.defaults.color=dark?"#e2e8f0":"#374151";
    Chart.defaults.borderColor=dark?"#334155":"#e5e7eb";

    new Chart(document.getElementById("reportCompliance"),{
        type:"line",
        data:{
            labels:["Jan","Fev","Mar","Abr","Mai","Jun"],
            datasets:[{
                label:"Conformidade %",
                data:[88,90,91,93,94,96],
                borderColor:"#3155f5",
                tension:.4
            }]
        },
        options:{responsive:true,maintainAspectRatio:false}
    });

    new Chart(document.getElementById("reportAlerts"),{
        type:"bar",
        data:{
            labels:["Produção","Prensa","Expedição","Estoque"],
            datasets:[{
                data:[12,22,8,6],
                backgroundColor:["#3155f5","#dc2626","#f59e0b","#2e7d32"]
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{legend:{display:false}}
        }
    });

    document.getElementById("printReport").onclick=()=>window.print();
    document.getElementById("exportReport").onclick=()=>showToast("Relatório exportado.");
});
