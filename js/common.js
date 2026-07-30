
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
                <strong>${escapeHtml(profile.name)}</strong>
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
