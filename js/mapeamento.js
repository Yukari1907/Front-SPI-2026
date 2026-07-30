
document.addEventListener("DOMContentLoaded",()=>{
    const sectors=[
        ["Produção",4],
        ["Prensa",3],
        ["Expedição",2],
        ["Estoque",3]
    ];

    document.getElementById("sectorList").innerHTML=sectors.map(sector=>`
        <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
            <span>${sector[0]}</span>
            <span class="badge success">${sector[1]} câmeras</span>
        </div>
    `).join("");

    const cameras=[
        ["C01",18,22,"#3155f5"],
        ["C02",43,20,"#3155f5"],
        ["C03",66,28,"#f59e0b"],
        ["C04",82,55,"#3155f5"],
        ["C05",28,68,"#3155f5"],
        ["C06",55,72,"#3155f5"]
    ];

    document.getElementById("factoryMap").innerHTML=cameras.map(camera=>`
        <button
            title="${camera[0]}"
            style="
                position:absolute;
                left:${camera[1]}%;
                top:${camera[2]}%;
                transform:translate(-50%,-50%);
                width:44px;
                height:44px;
                border:none;
                border-radius:50%;
                background:${camera[3]};
                color:#fff;
            "
        >
            <i class="fa-solid fa-video"></i>
        </button>
    `).join("");
});
