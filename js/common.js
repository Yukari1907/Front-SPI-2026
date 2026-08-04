
"use strict";

const SESSION_KEY="visaoepi_session";
const PROFILE_KEY="visaoepi_profile";

/* =========================================================
   PERMISSÕES POR PERFIL
========================================================= */

const ROLE_PERMISSIONS={
    "Administrador":{
        pages:[
            "dashboard",
            "monitoring",
            "alerts",
            "inventory",
            "ppe",
            "mapping",
            "reports",
            "admin",
            "settings",
            "profile",
            "about"
        ],
        actions:[
            "users:create",
            "users:view",
            "users:edit",
            "users:status",
            "users:delete",
            "inventory:create",
            "inventory:edit",
            "inventory:delete",
            "inventory:export",
            "ppe:manage",
            "alerts:manage",
            "settings:manage"
        ]
    },

    "Supervisor":{
        pages:[
            "dashboard",
            "monitoring",
            "alerts",
            "inventory",
            "ppe",
            "mapping",
            "reports",
            "profile",
            "about"
        ],
        actions:[
            "users:view",
            "inventory:create",
            "inventory:edit",
            "inventory:export",
            "ppe:manage",
            "alerts:manage"
        ]
    },

    "Técnico de Segurança":{
        pages:[
            "dashboard",
            "monitoring",
            "alerts",
            "ppe",
            "mapping",
            "reports",
            "profile",
            "about"
        ],
        actions:[
            "users:view",
            "ppe:manage",
            "alerts:manage"
        ]
    },

    "Operador":{
        pages:[
            "dashboard",
            "monitoring",
            "alerts",
            "profile",
            "about"
        ],
        actions:[
            "alerts:view"
        ]
    }
};

function getSession(){
    return JSON.parse(
        localStorage.getItem(SESSION_KEY)||
        sessionStorage.getItem(SESSION_KEY)||
        "null"
    );
}

function getProfile(){
    return JSON.parse(localStorage.getItem(PROFILE_KEY)||"null")||{
        name:"Administrador",
        email:"admin@visaoepi.com",
        role:"Administrador",
        unit:"Matriz"
    };
}

function getCurrentRole(){
    return getSession()?.role||getProfile()?.role||"Operador";
}

function getRolePermissions(role=getCurrentRole()){
    return ROLE_PERMISSIONS[role]||ROLE_PERMISSIONS["Operador"];
}

function canAccessPage(page,role=getCurrentRole()){
    return getRolePermissions(role).pages.includes(page);
}

function canPerform(action,role=getCurrentRole()){
    return getRolePermissions(role).actions.includes(action);
}

function escapeHtml(value){
    return String(value??"")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

function initials(name){
    return String(name||"U")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0,2)
        .map(part=>part[0].toUpperCase())
        .join("");
}

function logout(){
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href="login.html";
}

function showToast(message,type="success"){
    const container=document.getElementById("toastContainer");
    if(!container)return;

    const toast=document.createElement("div");
    toast.className="toast";
    toast.style.borderLeftColor=
        type==="danger"?"var(--danger)":
        type==="warning"?"var(--warning)":
        "var(--success)";
    toast.textContent=message;

    container.appendChild(toast);
    setTimeout(()=>toast.remove(),3000);
}

function showAccessDenied(){
    const main=document.querySelector(".main");

    if(!main)return;

    main.innerHTML=`
        <div
            class="card"
            style="
                max-width:680px;
                margin:80px auto;
                text-align:center;
                padding:42px;
            "
        >
            <i
                class="fa-solid fa-lock"
                style="
                    font-size:54px;
                    color:var(--danger);
                    margin-bottom:20px;
                "
            ></i>

            <h1>Acesso não autorizado</h1>

            <p
                class="text-muted"
                style="
                    margin:14px 0 24px;
                    line-height:1.7;
                "
            >
                Seu perfil não possui permissão para acessar esta página.
                Entre em contato com um administrador caso precise de acesso.
            </p>

            <a class="btn" href="dashboard.html">
                <i class="fa-solid fa-arrow-left"></i>
                Voltar ao Dashboard
            </a>
        </div>
    `;
}

function applyRolePermissions(){
    const role=getCurrentRole();
    const permissions=getRolePermissions(role);
    const currentPage=document.body.dataset.page;

    document.querySelectorAll(".nav a[data-page]").forEach(link=>{
        const allowed=permissions.pages.includes(link.dataset.page);
        const listItem=link.closest("li");

        if(listItem){
            listItem.style.display=allowed?"":"none";
        }
    });

    document.querySelectorAll("[data-permission]").forEach(element=>{
        const permission=element.dataset.permission;
        element.style.display=canPerform(permission,role)?"":"none";
    });

    if(currentPage&&!permissions.pages.includes(currentPage)){
        showAccessDenied();
        return false;
    }

    return true;
}

function createUserChip(profile){
    const container=document.getElementById("userChip");
    if(!container)return;

    container.innerHTML=`
        <button id="userChipButton" type="button">
            <span class="avatar">${initials(profile.name)}</span>

            <span class="user-copy">
                <strong>${escapeHtml(profile.name)}</strong><br>
                <small>${escapeHtml(profile.role)}</small>
            </span>

            <i class="fa-solid fa-chevron-down"></i>
        </button>

        <div class="user-menu" id="userMenu">
            <a href="perfil.html">
                <i class="fa-solid fa-user"></i>
                Meu perfil
            </a>

            ${
                canAccessPage("settings")
                    ? `
                        <a href="configuracao.html">
                            <i class="fa-solid fa-gear"></i>
                            Configurações
                        </a>
                    `
                    : ""
            }

            <button type="button" onclick="logout()">
                <i class="fa-solid fa-right-from-bracket"></i>
                Sair
            </button>
        </div>
    `;

    const button=document.getElementById("userChipButton");
    const menu=document.getElementById("userMenu");

    button.addEventListener("click",event=>{
        event.stopPropagation();
        menu.classList.toggle("active");
    });

    document.addEventListener("click",()=>menu.classList.remove("active"));
}

function configureNotifications(){
    const button=document.getElementById("notificationButton");
    const panel=document.getElementById("notificationPanel");

    if(!button||!panel)return;

    button.addEventListener("click",event=>{
        event.stopPropagation();
        panel.classList.toggle("active");
    });

    document.addEventListener("click",()=>panel.classList.remove("active"));
}


/* =========================================================
   PESQUISA GLOBAL
========================================================= */

const GLOBAL_SEARCH_ITEMS = [
    {
        page: "dashboard",
        title: "Dashboard",
        description: "Visão geral, conformidade, câmeras e indicadores",
        href: "dashboard.html",
        icon: "fa-chart-line",
        keywords: ["dashboard", "visão geral", "indicadores", "conformidade"]
    },
    {
        page: "monitoring",
        title: "Monitoramento",
        description: "Câmeras e processamento em tempo real",
        href: "monitoramento.html",
        icon: "fa-video",
        keywords: ["monitoramento", "câmeras", "camera", "yolo", "tempo real"]
    },
    {
        page: "alerts",
        title: "Alertas",
        description: "Ocorrências, severidades e resolução",
        href: "alertas.html",
        icon: "fa-bell",
        keywords: ["alertas", "ocorrências", "incidentes", "severidade"]
    },
    {
        page: "inventory",
        title: "Inventário",
        description: "Estoque, validade e cadastro de EPIs",
        href: "inventario.html",
        icon: "fa-boxes-stacked",
        keywords: ["inventário", "estoque", "validade", "epi"]
    },
    {
        page: "ppe",
        title: "Controle de EPIs",
        description: "Colaboradores, entregas e conformidade",
        href: "controle-de-epis.html",
        icon: "fa-helmet-safety",
        keywords: ["controle", "epis", "colaboradores", "entregas"]
    },
    {
        page: "mapping",
        title: "Mapeamento",
        description: "Setores, câmeras e zonas de risco",
        href: "mapeamento.html",
        icon: "fa-map-location-dot",
        keywords: ["mapeamento", "mapa", "setores", "zonas de risco"]
    },
    {
        page: "reports",
        title: "Relatórios",
        description: "Indicadores, gráficos e exportações",
        href: "relatorios.html",
        icon: "fa-chart-column",
        keywords: ["relatórios", "relatorio", "csv", "gráficos"]
    },
    {
        page: "admin",
        title: "Administração",
        description: "Usuários, permissões e histórico de acessos",
        href: "administracao.html",
        icon: "fa-users-gear",
        keywords: ["administração", "usuários", "permissões", "acessos"]
    },
    {
        page: "settings",
        title: "Configurações",
        description: "Tema, IA, notificações e integrações",
        href: "configuracao.html",
        icon: "fa-gear",
        keywords: ["configurações", "tema", "yolo", "api"]
    },
    {
        page: "profile",
        title: "Meu Perfil",
        description: "Dados pessoais e preferências",
        href: "perfil.html",
        icon: "fa-user",
        keywords: ["perfil", "conta", "senha", "dados pessoais"]
    },
    {
        page: "about",
        title: "Sobre",
        description: "Informações sobre o VisãoEPI Pro",
        href: "sobre.html",
        icon: "fa-circle-info",
        keywords: ["sobre", "sistema", "tecnologias", "versão"]
    }
];

function normalizeSearchText(value){
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function configureGlobalSearch(){
    const input = document.getElementById("globalSearch");

    if(!input){
        return;
    }

    const wrapper = input.closest(".search-global");

    if(!wrapper){
        return;
    }

    let results = wrapper.querySelector(".search-results");

    if(!results){
        results = document.createElement("div");
        results.className = "search-results";
        results.setAttribute("role", "listbox");
        wrapper.appendChild(results);
    }

    let visibleItems = [];
    let selectedIndex = -1;

    function closeResults(){
        results.classList.remove("active");
        selectedIndex = -1;
    }

    function openPage(index){
        const item = visibleItems[index];

        if(item){
            window.location.href = item.href;
        }
    }

    function updateSelection(){
        results.querySelectorAll(".search-result-item").forEach((button, index)=>{
            button.classList.toggle("selected", index === selectedIndex);
        });
    }

    function renderResults(){
        const term = normalizeSearchText(input.value);

        if(!term){
            closeResults();
            results.innerHTML = "";
            return;
        }

        visibleItems = GLOBAL_SEARCH_ITEMS.filter(item=>{
            const allowed = typeof canAccessPage === "function"
                ? canAccessPage(item.page)
                : true;

            const searchable = normalizeSearchText([
                item.title,
                item.description,
                ...(item.keywords || [])
            ].join(" "));

            return allowed && searchable.includes(term);
        });

        selectedIndex = visibleItems.length ? 0 : -1;

        if(!visibleItems.length){
            results.innerHTML = `
                <div class="search-empty">
                    Nenhum resultado encontrado.
                </div>
            `;
            results.classList.add("active");
            return;
        }

        results.innerHTML = visibleItems.map((item, index)=>`
            <button
                type="button"
                class="search-result-item ${index === selectedIndex ? "selected" : ""}"
                data-search-index="${index}"
            >
                <i class="fa-solid ${item.icon}"></i>

                <span class="search-result-copy">
                    <strong>${escapeHtml(item.title)}</strong>
                    <small>${escapeHtml(item.description)}</small>
                </span>
            </button>
        `).join("");

        results.classList.add("active");

        results.querySelectorAll(".search-result-item").forEach(button=>{
            button.addEventListener("click", ()=>{
                openPage(Number(button.dataset.searchIndex));
            });
        });
    }

    input.addEventListener("input", renderResults);

    input.addEventListener("focus", ()=>{
        if(input.value.trim()){
            renderResults();
        }
    });

    input.addEventListener("keydown", event=>{
        if(!results.classList.contains("active")){
            if(event.key === "Enter"){
                renderResults();
            }
            return;
        }

        if(event.key === "ArrowDown"){
            event.preventDefault();

            if(visibleItems.length){
                selectedIndex = (selectedIndex + 1) % visibleItems.length;
                updateSelection();
            }
        }

        if(event.key === "ArrowUp"){
            event.preventDefault();

            if(visibleItems.length){
                selectedIndex =
                    (selectedIndex - 1 + visibleItems.length) %
                    visibleItems.length;

                updateSelection();
            }
        }

        if(event.key === "Enter"){
            event.preventDefault();

            if(selectedIndex >= 0){
                openPage(selectedIndex);
            }
        }

        if(event.key === "Escape"){
            closeResults();
        }
    });

    document.addEventListener("click", event=>{
        if(!wrapper.contains(event.target)){
            closeResults();
        }
    });
}


document.addEventListener("DOMContentLoaded",()=>{
    if(!window.location.pathname.endsWith("login.html")){
        const session=getSession();

        if(!session?.authenticated){
            window.location.href="login.html";
            return;
        }

        const allowed=applyRolePermissions();

        if(!allowed){
            return;
        }

        createUserChip(getProfile());
        configureNotifications();
        configureGlobalSearch();
    }

    const currentPage=document.body.dataset.page;

    document.querySelectorAll(".nav a[data-page]").forEach(link=>{
        link.classList.toggle("active",link.dataset.page===currentPage);
    });
});

window.logout=logout;
window.showToast=showToast;
window.canAccessPage=canAccessPage;
window.canPerform=canPerform;
window.getCurrentRole=getCurrentRole;
window.applyRolePermissions=applyRolePermissions;
