
"use strict";

const REPORT_COMPLIANCE_DATA = [
    ["Janeiro", 88],
    ["Fevereiro", 90],
    ["Março", 91],
    ["Abril", 93],
    ["Maio", 94],
    ["Junho", 96]
];

const REPORT_ALERTS_DATA = [
    ["Produção", 12],
    ["Prensa", 22],
    ["Expedição", 8],
    ["Estoque", 6]
];

function csvEscape(value){
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportReportsCsv(){
    const rows = [
        ["VISÃO EPI PRO - RELATÓRIO GERENCIAL"],
        [],
        ["INDICADORES GERAIS"],
        ["Indicador", "Valor"],
        ["Conformidade média", "94%"],
        ["Alertas no período", 67],
        ["Alertas resolvidos", 58],
        ["Taxa de resolução", "86%"],
        ["Disponibilidade das câmeras", "98%"],
        [],
        ["EVOLUÇÃO DA CONFORMIDADE"],
        ["Mês", "Conformidade (%)"],
        ...REPORT_COMPLIANCE_DATA,
        [],
        ["ALERTAS POR SETOR"],
        ["Setor", "Quantidade"],
        ...REPORT_ALERTS_DATA,
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

document.addEventListener("DOMContentLoaded",()=>{
    const dark = document.documentElement.dataset.theme === "dark";

    Chart.defaults.color = dark ? "#e2e8f0" : "#374151";
    Chart.defaults.borderColor = dark ? "#334155" : "#e5e7eb";

    new Chart(document.getElementById("reportCompliance"),{
        type:"line",
        data:{
            labels:REPORT_COMPLIANCE_DATA.map(item => item[0].slice(0, 3)),
            datasets:[{
                label:"Conformidade %",
                data:REPORT_COMPLIANCE_DATA.map(item => item[1]),
                borderColor:"#3155f5",
                backgroundColor:"rgba(49,85,245,.12)",
                fill:true,
                tension:.4
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false
        }
    });

    new Chart(document.getElementById("reportAlerts"),{
        type:"bar",
        data:{
            labels:REPORT_ALERTS_DATA.map(item => item[0]),
            datasets:[{
                label:"Alertas",
                data:REPORT_ALERTS_DATA.map(item => item[1]),
                backgroundColor:[
                    "#3155f5",
                    "#dc2626",
                    "#f59e0b",
                    "#2e7d32"
                ]
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                legend:{
                    display:false
                }
            }
        }
    });

    document
        .getElementById("printReport")
        .addEventListener("click", ()=>window.print());

    document
        .getElementById("exportReport")
        .addEventListener("click", exportReportsCsv);
});
