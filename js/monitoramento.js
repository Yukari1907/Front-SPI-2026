
document.addEventListener("DOMContentLoaded",()=>{
    const cameras=[
        ["Câmera 01","Estoque","success"],
        ["Câmera 02","Produção","success"],
        ["Câmera 03","Prensa","warning"],
        ["Câmera 04","Expedição","success"]
    ];

    document.getElementById("cameraList").innerHTML=cameras.map(camera=>`
        <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
            <span>
                <i class="fa-solid fa-video"></i>
                ${camera[0]}<br>
                <small class="text-muted">${camera[1]}</small>
            </span>

            <span class="badge ${camera[2]}">
                ${camera[2]==="success"?"Online":"Atenção"}
            </span>
        </div>
    `).join("");
});
