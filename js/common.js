
"use strict";

// Permissões de escrita confirmadas nos decorators do backend; leituras exigem sessão.
const READ_PAGES = ["dashboard", "monitoring", "alerts", "inventory", "ppe", "mapping", "reports", "settings", "profile", "about"];
let verifiedSession = null;
let verifiedProfile = null;
let resolveSessionReady;
window.sessionReady = new Promise(resolve => { resolveSessionReady = resolve; });

function getSession() { return verifiedSession; }
function getProfile() {
    return verifiedProfile || { name: "—", email: "—", role: "—", unit: "", phone: "" };
}
function getCurrentRole() { return verifiedSession?.role || ""; }
function getRolePermissions(role = getCurrentRole()) {
    if (!verifiedSession) return { pages: [], actions: [] };
    const normalized = String(role).trim().toLowerCase();
    const admin = verifiedSession.admin === true || ["admin", "administrador"].includes(normalized);
    const manager = admin || normalized === "supervisor";
    return {
        pages: admin ? [...READ_PAGES, "admin"] : READ_PAGES,
        actions: ["alerts:view", "alerts:manage", "inventory:export",
            ...(manager ? ["inventory:create", "inventory:edit", "inventory:delete", "cameras:edit", "cameras:create", "cameras:delete", "sectors:manage"] : []),
            ...(manager ? ["vision:active-learning"] : []),
            ...(admin ? ["users:create", "users:list", "vision:workers"] : [])]
    };
}

function canAccessPage(page,role=getCurrentRole()){
    return getRolePermissions(role).pages.includes(page);
}

function canPerform(action,role=getCurrentRole()){
    return getRolePermissions(role).actions.includes(action);
}

// ─────────────────────────────────────────────
// Datas vindas do backend
// ─────────────────────────────────────────────
//
// O repositório atual formata alertas como "AAAA-MM-DD HH:mm:ss", sem fuso.
// Mantemos também suporte a HTTP-date para respostas legadas e campos datetime
// serializados pelo Flask. Preservamos os componentes literais: o contrato de
// alertas não declara UTC. Não inferir fuso a partir de um relatório histórico.
const BACKEND_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HTTP_DATE_PATTERN = /^[A-Za-z]{3},\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;

/**
 * Carimbo ordenável "AAAA-MM-DDTHH:mm:ss" a partir de uma data do backend,
 * aceitando tanto HTTP-date quanto ISO 8601. Devolve "" quando não reconhece o
 * valor — um formato desconhecido nunca vira uma data plausível.
 * @param {unknown} value
 * @returns {string}
 */
function backendTimestampKey(value) {
    if (typeof value !== "string") return "";

    const httpDate = HTTP_DATE_PATTERN.exec(value.trim());
    if (httpDate) {
        const [, day, month, year, hour, minute, second] = httpDate;
        const monthIndex = BACKEND_MONTHS.indexOf(month);
        if (monthIndex === -1) return "";
        return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}T${hour}:${minute}:${second}`;
    }

    const iso = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(value.trim());
    if (iso) return `${iso[1]}T${iso[2]}`;

    const isoDay = /^(\d{4}-\d{2}-\d{2})$/.exec(value.trim());
    return isoDay ? `${isoDay[1]}T00:00:00` : "";
}

/**
 * Dia "AAAA-MM-DD" de uma data do backend, ou "" quando indeterminado.
 * @param {unknown} value
 * @returns {string}
 */
function backendDayKey(value) {
    return backendTimestampKey(value).slice(0, 10);
}

/**
 * Dia de hoje no fuso local, no mesmo formato de backendDayKey().
 * @returns {string}
 */
function localDayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function mutationError(result, fallback) {
    if (result.status === 401) return "Sessão expirada. Entre novamente.";
    if (result.status === 403) return "Seu perfil não possui permissão para esta ação.";
    if (result.status === 404) return "Registro não encontrado. Atualize a lista.";
    if (result.status === 409) return "O registro possui vínculos que impedem esta alteração.";
    if (result.status === 0 || result.status === -1) return "Não foi possível conectar ao servidor. Tente novamente.";
    if (result.status >= 500) return "O servidor não confirmou a operação. Atualize a lista antes de tentar novamente.";
    return result.data?.error || result.data?.message || fallback;
}

// Estado explícito para gráficos sem dados ou sem biblioteca disponível.
function showChartState(id, message) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    canvas.hidden = true;
    canvas.style.display = "none";
    let state = document.getElementById(`${id}State`);
    if (!state) {
        state = document.createElement("p");
        state.id = `${id}State`;
        state.className = "empty";
        canvas.parentElement.appendChild(state);
    }
    state.textContent = message;
}

function escapeHtml(value){
    return String(value??"")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

// Aspas CSV escapam delimitadores, mas não impedem interpretação como fórmula
// pela planilha. Campos textuais potencialmente executáveis recebem apóstrofo.
function csvEscape(value) {
    let text = String(value ?? "");
    if (typeof value === "string" && (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))) {
        text = "'" + text;
    }
    return `"${text.replaceAll('"', '""')}"`;
}

function initials(name){
    return String(name||"U")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0,2)
        .map(part=>part[0].toUpperCase())
        .join("");
}

async function logout() {
    const result = await apiPost("/logout", {});
    if (!result.ok) {
        showToast("Não foi possível encerrar a sessão. Tente novamente.", "danger");
        return;
    }
    verifiedSession = null;
    verifiedProfile = null;
    clearApiSession();
    window.location.href = "login.html";
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
            <span class="avatar">${escapeHtml(initials(profile.name))}</span>

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

const NOTIFICATION_SEVERITY_META={
    3:{badge:"danger",icon:"fa-triangle-exclamation",color:"var(--danger)",label:"Crítico"},
    2:{badge:"warning",icon:"fa-triangle-exclamation",color:"var(--warning)",label:"Médio"},
    1:{badge:"success",icon:"fa-shield-halved",color:"var(--success)",label:"Baixo"}
};

function notificationSeverityMeta(severidade){
    return NOTIFICATION_SEVERITY_META[severidade]||{
        badge:"",icon:"fa-circle-info",color:"var(--text-muted)",label:"Não informada"
    };
}


function ensureNotificationClearButton(){
    const panel=document.getElementById("notificationPanel");
    if(!panel)return null;

    let button=document.getElementById("clearNotificationsButton");

    if(button)return button;

    const title=panel.querySelector(".section-title");
    if(!title)return null;

    title.style.alignItems="center";

    button=document.createElement("button");
    button.id="clearNotificationsButton";
    button.type="button";
    button.className="notification-clear-btn";
    button.innerHTML='<i class="fa-solid fa-broom"></i><span>Limpar</span>';
    button.title="Limpar notificações recentes";

    title.appendChild(button);

    button.addEventListener("click",event=>{
        event.stopPropagation();

        if(typeof clearRecentAlerts==="function"){
            clearRecentAlerts();
        }

        renderNotificationPanel();

        if(typeof showToast==="function"){
            showToast("Notificações recentes limpas.");
        }
    });

    return button;
}

function renderNotificationPanel(){
    const list=document.getElementById("notificationList");
    const count=document.getElementById("notificationCount");

    if(!list||!count)return;

    const alerts=typeof getRecentAlerts==="function"?getRecentAlerts():[];

    count.textContent=String(alerts.length);

    if(!alerts.length){
        list.innerHTML=`<div class="notification-empty text-muted" style="padding:12px 0">Nenhuma notificação recente.</div>`;
        return;
    }

    list.innerHTML=alerts.map(alerta=>{
        const meta=notificationSeverityMeta(alerta.severidade);
        const evento=formatAlertNotification(alerta);
        return `
            <div class="notification-item">
                <i class="fa-solid ${meta.icon}" style="color:${meta.color}"></i>
                <div>
                    <strong>${escapeHtml(meta.label)}</strong>
                    <p class="text-muted">${escapeHtml(evento)}</p>
                </div>
            </div>
        `;
    }).join("");
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

    // Adiciona o botão de limpar e renderiza o estado inicial.
    ensureNotificationClearButton();
    renderNotificationPanel();

    if(typeof onAlert==="function"){
        onAlert(alerta=>{
            renderNotificationPanel();

            if(typeof showToast==="function"){
                showToast(
                    formatAlertNotification(alerta),
                    alerta.severidade>=3?"danger":alerta.severidade===2?"warning":"success"
                );
            }
        });
    }

    if(typeof initNotifications==="function"){
        initNotifications();
    }
}

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
        description: "Detecções avaliadas e conformidade de EPIs",
        href: "controle-de-epis.html",
        icon: "fa-helmet-safety",
        keywords: ["controle", "epis", "detecções", "conformidade"]
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


document.addEventListener("DOMContentLoaded", async () => {
    if (window.location.pathname.endsWith("login.html")) { resolveSessionReady(true); return; }
    const result = await apiGet("/session");
    const user = result.data?.user;
    if (result.status === 401) {
        clearApiSession();
        resolveSessionReady(false);
        window.location.href = "login.html";
        return;
    }
    if (!result.ok || result.data?.authenticated !== true || !user?.id || user.ativo === false) {
        resolveSessionReady(false);
        document.querySelector(".main").innerHTML = '<div class="card"><h1>Sessão indisponível</h1><p>Não foi possível validar sua sessão. Tente recarregar a página.</p><a href="login.html">Voltar ao login</a></div>';
        return;
    }
    verifiedProfile = {
        name: [user.nome, user.sobrenome].filter(Boolean).join(" ") || "—",
        email: user.email || "—", role: user.perfil || "—", unit: user.unidade || "", phone: user.telefone || ""
    };
    verifiedSession = { authenticated: true, userId: user.id, role: user.perfil, admin: user.admin === true };
    const allowed = applyRolePermissions();
    resolveSessionReady(allowed);
    if (!allowed) return;
    createUserChip(getProfile());
    configureNotifications();
    configureGlobalSearch();
    const currentPage = document.body.dataset.page;
    document.querySelectorAll(".nav a[data-page]").forEach(link => {
        link.classList.toggle("active", link.dataset.page === currentPage);
    });
});

window.logout=logout;
window.showToast=showToast;
window.canAccessPage=canAccessPage;
window.canPerform=canPerform;
window.getCurrentRole=getCurrentRole;
window.applyRolePermissions=applyRolePermissions;
window.backendTimestampKey=backendTimestampKey;
window.backendDayKey=backendDayKey;
window.localDayKey=localDayKey;
