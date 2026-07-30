
document.addEventListener("DOMContentLoaded",()=>{
    const alerts=[
        ["27/07 14:32","Prensa","Sem capacete","Crítico","Pendente"],
        ["27/07 14:20","Expedição","Sem óculos","Médio","Em análise"],
        ["27/07 13:50","Estoque","Área restrita","Crítico","Pendente"],
        ["27/07 12:40","Produção","Sem luvas","Baixo","Resolvido"]
    ];

    document.getElementById("alertsTable").innerHTML=alerts.map(alert=>`
        <tr>
            <td>${alert[0]}</td>
            <td>${alert[1]}</td>
            <td>${alert[2]}</td>
            <td><span class="badge ${alert[3]==="Crítico"?"danger":alert[3]==="Médio"?"warning":"success"}">${alert[3]}</span></td>
            <td>${alert[4]}</td>
            <td><button class="icon-btn"><i class="fa-solid fa-eye"></i></button></td>
        </tr>
    `).join("");
});
