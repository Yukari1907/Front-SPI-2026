
const INVENTORY_KEY="visaoepi_inventory";

let inventoryItems=JSON.parse(localStorage.getItem(INVENTORY_KEY)||"null")||[
    {id:1,name:"Capacete MSA V-Gard",code:"EPI-001",category:"Capacetes",certificate:"CA 498",quantity:32,minimumQuantity:10,inUse:18,expiration:"2027-02-18",location:"Estante A-01",status:"Disponível"},
    {id:2,name:"Óculos de Proteção Incolor",code:"EPI-014",category:"Óculos",certificate:"CA 10344",quantity:8,minimumQuantity:12,inUse:24,expiration:"2026-08-12",location:"Estante B-04",status:"Estoque Baixo"},
    {id:3,name:"Luva Anticorte",code:"EPI-025",category:"Luvas",certificate:"CA 32041",quantity:45,minimumQuantity:15,inUse:31,expiration:"2027-05-10",location:"Estante C-02",status:"Disponível"},
    {id:4,name:"Botina Nobuck Bico de Aço",code:"EPI-047",category:"Botinas",certificate:"CA 17148",quantity:5,minimumQuantity:10,inUse:20,expiration:"2026-08-02",location:"Estante D-01",status:"Crítico"}
];

let filteredItems=[...inventoryItems];
let inventoryPage=1;
let categoryChart;
let statusChart;

const $=id=>document.getElementById(id);

function saveInventory(){
    localStorage.setItem(INVENTORY_KEY,JSON.stringify(inventoryItems));
}

function formatDate(date){
    return date
        ? new Intl.DateTimeFormat("pt-BR").format(new Date(date+"T00:00:00"))
        : "—";
}

function statusClass(status){
    return status==="Disponível"
        ? "success"
        : status==="Estoque Baixo"
            ? "warning"
            : "danger";
}

function calculateStatus(quantity,minimum,expiration){
    if(expiration&&new Date(expiration)<new Date())return"Crítico";
    if(quantity<=0)return"Crítico";
    if(quantity<=minimum)return"Estoque Baixo";
    return"Disponível";
}


function renderExpiryTable(){
    const body=document.getElementById("expiryTableBody");
    if(!body)return;

    const today=new Date();
    today.setHours(0,0,0,0);

    const upcoming=inventoryItems
        .filter(item=>item.expiration)
        .map(item=>{
            const expiration=new Date(item.expiration+"T00:00:00");
            const days=Math.ceil((expiration-today)/86400000);
            return {...item,days};
        })
        .filter(item=>item.days>=0)
        .sort((a,b)=>a.days-b.days)
        .slice(0,4);

    body.innerHTML=upcoming.length
        ? upcoming.map(item=>{
            const level=item.days<=7?"danger":item.days<=30?"warning":"success";
            return `
                <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td><span class="expiry-days ${level}">${item.days} dias</span></td>
                </tr>
            `;
        }).join("")
        : '<tr><td colspan="2" class="empty">Nenhuma validade próxima.</td></tr>';
}

function renderInventory(){
    const start=(inventoryPage-1)*5;

    $("inventoryTable").innerHTML=filteredItems
        .slice(start,start+5)
        .map(item=>`
            <tr>
                <td>
                    <div class="inventory-name">
                        <strong>${escapeHtml(item.name)}</strong>
                        <small>${escapeHtml(item.code)}</small>
                    </div>
                </td>

                <td>${item.category}</td>
                <td>${item.certificate}</td>
                <td>${item.quantity}</td>
                <td>${formatDate(item.expiration)}</td>
                <td>${item.location||"—"}</td>

                <td>
                    <span class="badge ${statusClass(item.status)}">
                        ${item.status}
                    </span>
                </td>

                <td>
                    <div class="action-buttons">
                        <button class="icon-btn" onclick="viewInventoryItem(${item.id})">
                            <i class="fa-solid fa-eye"></i>
                        </button>

                        <button class="icon-btn" onclick="editInventoryItem(${item.id})">
                            <i class="fa-solid fa-pen"></i>
                        </button>

                        <button class="icon-btn" onclick="deleteInventoryItem(${item.id})">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `)
        .join("");

    const totalPages=Math.max(1,Math.ceil(filteredItems.length/5));

    $("inventoryPagination").innerHTML=Array
        .from({length:totalPages},(_,index)=>`
            <button
                class="${inventoryPage===index+1?"active":""}"
                onclick="goInventoryPage(${index+1})"
            >
                ${index+1}
            </button>
        `)
        .join("");

    $("invTotal").textContent=inventoryItems.reduce((sum,item)=>sum+item.quantity,0);
    $("invUse").textContent=inventoryItems.reduce((sum,item)=>sum+item.inUse,0);
    $("invLow").textContent=inventoryItems.filter(item=>item.quantity<=item.minimumQuantity).length;
    $("invExpiry").textContent=inventoryItems.filter(item=>{
        const days=(new Date(item.expiration)-new Date())/86400000;
        return days>=0&&days<=30;
    }).length;

    updateInventoryCharts();
    renderExpiryTable();
}

function updateInventoryCharts(){
    const categoryTotals={};
    const statusTotals={};

    inventoryItems.forEach(item=>{
        categoryTotals[item.category]=(categoryTotals[item.category]||0)+item.quantity;
        statusTotals[item.status]=(statusTotals[item.status]||0)+1;
    });

    categoryChart.data.labels=Object.keys(categoryTotals);
    categoryChart.data.datasets[0].data=Object.values(categoryTotals);
    categoryChart.update();

    statusChart.data.labels=Object.keys(statusTotals);
    statusChart.data.datasets[0].data=Object.values(statusTotals);
    statusChart.update();
}

function filterInventory(){
    const term=$("inventorySearch").value.toLowerCase();
    const category=$("inventoryCategory").value;
    const status=$("inventoryStatus").value;

    filteredItems=inventoryItems.filter(item=>
        (!term||[item.name,item.code,item.certificate].some(value=>
            String(value).toLowerCase().includes(term)
        )) &&
        (!category||item.category===category) &&
        (!status||item.status===status)
    );

    inventoryPage=1;
    renderInventory();
}

function openInventoryModal(item=null){
    $("inventoryForm").reset();
    $("inventoryForm").elements.id.value=item?.id||"";
    $("inventoryModalTitle").textContent=item?"Editar EPI":"Cadastrar EPI";

    if(item){
        Object.entries(item).forEach(([key,value])=>{
            const field=$("inventoryForm").elements[key];
            if(field)field.value=value??"";
        });
    }

    $("inventoryModal").classList.add("active");
}

function closeInventoryModal(){
    $("inventoryModal").classList.remove("active");
}

function editInventoryItem(id){
    openInventoryModal(inventoryItems.find(item=>item.id===id));
}

function viewInventoryItem(id){
    const item=inventoryItems.find(current=>current.id===id);
    alert(`${item.name}\nEstoque: ${item.quantity}\nStatus: ${item.status}`);
}

function deleteInventoryItem(id){
    if(!confirm("Excluir EPI?"))return;

    inventoryItems=inventoryItems.filter(item=>item.id!==id);
    filteredItems=[...inventoryItems];

    saveInventory();
    renderInventory();
    showToast("EPI excluído.","danger");
}

function goInventoryPage(page){
    inventoryPage=page;
    renderInventory();
}

function exportInventoryCsv(){
    const header=["Nome","Código","Categoria","CA","Quantidade","Em uso","Validade","Localização","Status"];

    const rows=filteredItems.map(item=>[
        item.name,
        item.code,
        item.category,
        item.certificate,
        item.quantity,
        item.inUse,
        formatDate(item.expiration),
        item.location,
        item.status
    ]);

    const csv=[header,...rows]
        .map(row=>row.map(value=>`"${String(value??"").replaceAll('"','""')}"`).join(";"))
        .join("\n");

    const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv"}));
    const link=document.createElement("a");

    link.href=url;
    link.download="inventario.csv";
    link.click();

    URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded",()=>{
    const dark=document.documentElement.dataset.theme==="dark";

    Chart.defaults.color=dark?"#e2e8f0":"#374151";
    Chart.defaults.borderColor=dark?"#334155":"#e5e7eb";

    categoryChart=new Chart($("inventoryCategoryChart"),{
        type:"bar",
        data:{labels:[],datasets:[{data:[],backgroundColor:"#3155f5"}]},
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{legend:{display:false}}
        }
    });

    statusChart=new Chart($("inventoryStatusChart"),{
        type:"doughnut",
        data:{
            labels:[],
            datasets:[{
                data:[],
                backgroundColor:["#2e7d32","#f59e0b","#dc2626","#3155f5"]
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            cutout:"65%"
        }
    });

    $("openInventoryModal").onclick=()=>openInventoryModal();
    $("closeInventoryModal").onclick=$("cancelInventoryModal").onclick=closeInventoryModal;

    $("inventorySearch").oninput=filterInventory;
    $("inventoryCategory").onchange=$("inventoryStatus").onchange=filterInventory;

    $("refreshInventory").onclick=()=>{
        filteredItems=[...inventoryItems];
        renderInventory();
        showToast("Inventário atualizado.");
    };

    $("exportInventory").onclick=exportInventoryCsv;

    $("inventoryForm").onsubmit=event=>{
        event.preventDefault();

        const item=Object.fromEntries(new FormData(event.currentTarget));

        item.id=Number(item.id)||Date.now();
        item.quantity=Number(item.quantity);
        item.minimumQuantity=Number(item.minimumQuantity);
        item.inUse=Number(item.inUse);
        item.status=item.status||calculateStatus(
            item.quantity,
            item.minimumQuantity,
            item.expiration
        );

        const index=inventoryItems.findIndex(current=>current.id===item.id);

        if(index>=0){
            inventoryItems[index]=item;
        }else{
            inventoryItems.unshift(item);
        }

        saveInventory();
        filteredItems=[...inventoryItems];
        closeInventoryModal();
        renderInventory();
        showToast(index>=0?"EPI atualizado.":"EPI cadastrado.");
    };

    renderInventory();
});

window.viewInventoryItem=viewInventoryItem;
window.editInventoryItem=editInventoryItem;
window.deleteInventoryItem=deleteInventoryItem;
window.goInventoryPage=goInventoryPage;
