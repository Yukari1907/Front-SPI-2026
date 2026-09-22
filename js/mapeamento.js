
"use strict";

/**
 * mapeamento.js — Mapeamento de setores e câmeras via API real do backend.
 *
 * API utilizada:
 *   GET /setores  → listar setores
 *   GET /cameras  → listar câmeras (com id_setor para agrupamento)
 *   GET /cameras/status → contar câmeras com status Ativo
 *   GET /zonas → listar zonas cadastradas
 *   GET /epis → EPIs reais para seleção múltipla na criação
 *   POST /zonas/registrar → criar zona no quadro de uma câmera
 *   PUT /zonas/{id} → editar nome, área, permitido e câmera de uma zona
 *
 * POST aceita ids_epis: int[], incluindo []. PUT aceita substituir a lista,
 * mas GET só retorna epis_categoria, sem IDs. Omitimos ids_epis na edição
 * para preservar associações, sem inferir IDs por categoria.
 *
 * Nota: O backend não retorna coordenadas X/Y para o mapa visual.
 * As câmeras são posicionadas automaticamente de forma distribuída no canvas.
 */

// Paleta de cores para câmeras no mapa
const CAMERA_COLORS = [
    "#3155f5", "#0ea5e9", "#2e7d32", "#f59e0b",
    "#7c3aed", "#dc2626", "#0891b2", "#65a30d"
];

/**
 * Gera coordenadas distribuídas automaticamente para N câmeras.
 * Como o backend não retorna coordenadas, distribuímos em grade.
 */
function generatePositions(count) {
    const positions = [];
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = ((col + 0.5) / cols) * 80 + 10; // 10-90%
        const y = ((row + 0.5) / rows) * 70 + 15;  // 15-85%
        positions.push({ x, y });
    }

    return positions;
}

let mappingCameras = [];
let mappingZones = [];
// null = criação; id numérico = edição da zona correspondente.
let editingZoneId = null;

// TTL curto (45s) — sobrevive à navegação entre páginas via sessionStorage,
// mas não serve dado desatualizado por muito tempo após um cadastro novo.
const CAMERAS_SETORES_CACHE_TTL_MS = 45000;

async function loadMapCamerasOnline() {
    const badge = document.getElementById("mapCamerasOnline");
    if (!badge) return;

    badge.textContent = "— câmeras online";
    badge.classList.remove("success");

    // Mesmo critério do dashboard, sem cache para o status de conexão.
    const result = await apiGet("/cameras/status");
    if (!result.ok || !Array.isArray(result.data)) return;

    const online = result.data.filter(camera => camera.status === "Ativo").length;
    badge.textContent = `${online} câmera${online !== 1 ? "s" : ""} online`;
    badge.classList.toggle("success", online > 0);
}

async function loadMapeamento() {
    try {
        // Carrega setores e câmeras em paralelo (cache curto — mesma chamada
        // que monitoramento.js faz ao navegar entre as duas páginas)
        const [setoresResult, camerasResult] = await Promise.all([
            apiGetCached("/setores", CAMERAS_SETORES_CACHE_TTL_MS),
            apiGetCached("/cameras", CAMERAS_SETORES_CACHE_TTL_MS)
        ]);

        mappingCameras = Array.isArray(camerasResult.data) ? camerasResult.data : [];

        renderSectorList(setoresResult, camerasResult);
        renderFactoryMap(camerasResult);
        populateZoneCameraSelect(mappingCameras);
        configureMapAlertIndicator();
        await loadRiskZones(mappingCameras);

    } catch (e) {
        console.error("[Mapeamento] Erro ao carregar dados:", e);

        const sectorList = document.getElementById("sectorList");
        if (sectorList) {
            sectorList.innerHTML = '<div style="padding:12px;color:var(--danger)">Erro ao carregar setores.</div>';
        }
    }
}

function populateZoneCameraSelect(cameras) {
    const select = document.getElementById("zoneCamera");
    if (!select) return;

    select.innerHTML = '<option value="">Selecione uma câmera</option>' + cameras.map(camera =>
        `<option value="${escapeHtml(camera.id)}">${escapeHtml(camera.nome || `Câmera ${camera.id}`)}</option>`
    ).join("");
}

async function loadRiskZones(cameras = mappingCameras) {
    const list = document.getElementById("riskZonesList");
    if (!list) return;

    list.innerHTML = '<p class="text-muted">Carregando zonas...</p>';
    const result = await apiGet("/zonas");
    if (!result.ok || !Array.isArray(result.data)) {
        list.innerHTML = '<p class="text-muted">Não foi possível carregar as zonas cadastradas.</p>';
        return;
    }

    mappingZones = result.data;
    list.innerHTML = mappingZones.length ? mappingZones.map(zone => {
        const camera = cameras.find(item => item.id === zone.id_camera);
        return `
            <div style="padding:12px 0;border-bottom:1px solid var(--border)">
                <strong>${escapeHtml(zone.nome || `Zona ${zone.id}`)}</strong>
                <p class="text-muted">${escapeHtml(camera?.nome || `Câmera ${zone.id_camera}`)}</p>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
                    <span class="badge ${zone.permitido ? "success" : "danger"}">${zone.permitido ? "Permitida" : "Restrita / de risco"}</span>
                    <button class="btn secondary" type="button" data-edit-zone="${escapeHtml(zone.id)}">
                        <i class="fa-solid fa-pen"></i>
                        Editar zona
                    </button>
                    <button class="btn secondary" type="button" disabled aria-describedby="zoneDeleteUnavailable">Excluir zona</button>
                </div>
            </div>
        `;
    }).join("") + '<p id="zoneDeleteUnavailable" class="text-muted">Exclusão indisponível — aguardando atualização do servidor.</p>' : '<p class="text-muted">Nenhuma zona cadastrada.</p>';

    list.querySelectorAll("[data-edit-zone]").forEach(button => {
        button.addEventListener("click", () => {
            const zone = mappingZones.find(item => String(item.id) === button.dataset.editZone);
            if (zone) openZoneModal(zone);
        });
    });
}

/**
 * Preenche a seleção múltipla com o cadastro real.
 * Erro de API e lista vazia são estados distintos: nenhum deles inventa opções.
 */
async function loadZoneEpis() {
    const select = document.getElementById("zoneEpi");
    const hint = document.getElementById("zoneEpiHint");
    if (!select || !hint) return;

    select.disabled = true;
    select.innerHTML = '<option value="">Carregando EPIs cadastrados…</option>';

    const result = await apiGet("/epis");

    if (!result.ok || !Array.isArray(result.data)) {
        select.innerHTML = '<option value="">EPIs indisponíveis</option>';
        hint.textContent = "Não foi possível carregar os EPIs cadastrados. A zona pode ser criada sem EPI obrigatório.";
        return;
    }

    if (result.data.length === 0) {
        select.innerHTML = '<option value="">Nenhum EPI cadastrado</option>';
        hint.textContent = "Nenhum EPI cadastrado no inventário.";
        return;
    }

    select.innerHTML = result.data.map(epi =>
        `<option value="${escapeHtml(epi.id)}">${escapeHtml(epi.nome)}${epi.categoria ? ` — ${escapeHtml(epi.categoria)}` : ""}</option>`
    ).join("");
    hint.textContent = "Opcional. Selecione um ou mais EPIs (Ctrl ou Command para alternar opções). Sem seleção, a zona não exige EPI.";
    select.disabled = false;
}

let zoneAreaEditor = null;

/**
 * Abre o modal de zona. Sem argumento cria; com a zona real carrega os dados
 * atuais dela para edição, incluindo a área persistida sobre o frame da câmera.
 */
function openZoneModal(zone = null) {
    const modal = document.getElementById("zoneModal");
    const form = document.getElementById("zoneForm");
    if (!modal || !form || !zoneAreaEditor) return;

    const cameraSelect = document.getElementById("zoneCamera");
    const editing = zone !== null;
    editingZoneId = editing ? zone.id : null;
    cameraSelect.disabled = editing;

    form.reset();
    zoneAreaEditor.clear();

    document.getElementById("zoneModalTitle").textContent = editing ? "Editar zona" : "Criar nova zona";
    document.getElementById("zoneModalHint").textContent = editing
        ? "Os dados abaixo são os atuais da zona. Redesenhe a área para alterá-la. A troca de câmera está indisponível nesta edição."
        : "Escolha uma câmera e desenhe a área da zona sobre a imagem.";
    document.getElementById("saveZoneLabel").textContent = editing ? "Salvar zona" : "Criar zona";
    document.getElementById("zoneEpiGroup").hidden = editing;
    document.getElementById("zoneEpiUnavailable").hidden = !editing;

    if (editing) {
        cameraSelect.value = String(zone.id_camera);
        document.getElementById("zoneName").value = zone.nome || "";
        document.getElementById("zoneAllowed").checked = zone.permitido === true;

        const area = {
            x: Number(zone.x), y: Number(zone.y),
            largura: Number(zone.largura), altura: Number(zone.altura)
        };
        const known = Object.values(area).every(Number.isFinite);
        // A câmera precisa existir na lista real para o stream ser carregado.
        zoneAreaEditor.load(
            mappingCameras.some(camera => camera.id === zone.id_camera) ? Number(zone.id_camera) : null,
            known ? area : null
        );
    } else {
        loadZoneEpis();
    }

    modal.classList.add("active");
    cameraSelect.focus();
}

function configureZoneCreation() {
    const modal = document.getElementById("zoneModal");
    const form = document.getElementById("zoneForm");
    const openButton = document.getElementById("openZoneModal");
    const saveButton = document.getElementById("saveZoneButton");
    if (!modal || !form || !openButton || !saveButton) return;
    const cameraSelect = document.getElementById("zoneCamera");
    const areaEditor = new ZoneAreaEditor();
    zoneAreaEditor = areaEditor;
    cameraSelect.addEventListener("change", () => {
        const cameraId = Number(cameraSelect.value);
        // Troca manual de câmera invalida a área anterior, inclusive na edição.
        areaEditor.load(mappingCameras.some(camera => camera.id === cameraId) ? cameraId : null);
    });
    window.addEventListener("pagehide", () => areaEditor.clear());

    const close = () => {
        if (saveButton.disabled) return;
        areaEditor.clear();
        form.reset();
        editingZoneId = null;
        modal.classList.remove("active");
        openButton.focus();
    };
    openButton.addEventListener("click", () => openZoneModal());
    document.getElementById("closeZoneModal").addEventListener("click", close);
    document.getElementById("cancelZoneModal").addEventListener("click", close);
    modal.addEventListener("click", event => {
        if (event.target === modal) close();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && modal.classList.contains("active")) close();
        if (event.key === "Tab" && modal.classList.contains("active")) {
            const controls = [...modal.querySelectorAll("button, input, select")]
                .filter(element => !element.disabled && element.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (saveButton.disabled || !form.reportValidity()) return;

        const editing = editingZoneId !== null;
        const fields = new FormData(form);
        const zone = {
            id_camera: Number(cameraSelect.value),
            nome: fields.get("nome").trim(),
            permitido: fields.has("permitido")
        };
        if (!zone.nome || !mappingCameras.some(camera => camera.id === zone.id_camera)) {
            showToast("Informe o nome da zona e selecione uma câmera cadastrada.", "warning");
            return;
        }
        const selection = areaEditor.getSelection(zone.id_camera);
        if (!selection) {
            showToast(areaEditor.ready ? "Desenhe uma área válida sobre a imagem da câmera." : "Aguarde uma imagem disponível da câmera para definir a zona.", "warning");
            return;
        }
        Object.assign(zone, selection);

        // Lista explícita na criação; omissão no PUT preserva as associações.
        if (!editing) zone.ids_epis = fields.getAll("ids_epis").filter(Boolean).map(Number);

        saveButton.disabled = true;
        cameraSelect.disabled = true;
        areaEditor.setBusy(true);
        try {
            const result = editing
                ? await apiPut(`/zonas/${editingZoneId}`, zone)
                : await apiPost("/zonas/registrar", zone);
            if (!result.ok) {
                showToast(result.data?.error || result.data?.message
                    || (editing ? "Não foi possível salvar a zona." : "Não foi possível criar a zona."), "danger");
                return;
            }
            form.reset();
            saveButton.disabled = false;
            close();
            showToast(editing ? "Zona atualizada com sucesso." : "Zona criada com sucesso.");
            await loadRiskZones();
        } catch {
            showToast(editing ? "Não foi possível salvar a zona. Tente novamente." : "Não foi possível criar a zona. Tente novamente.", "danger");
        } finally {
            saveButton.disabled = false;
            cameraSelect.disabled = editingZoneId !== null;
            areaEditor.setBusy(false);
        }
    });
}

function renderSectorList(setoresResult, camerasResult) {
    const sectorList = document.getElementById("sectorList");
    if (!sectorList) return;

    if (!setoresResult.ok || !Array.isArray(setoresResult.data)) {
        sectorList.innerHTML = '<div style="padding:12px;color:var(--danger)">Backend indisponível.</div>';
        return;
    }

    const setores = Array.isArray(setoresResult.data) ? setoresResult.data : [];
    const cameras = Array.isArray(camerasResult.data) ? camerasResult.data : [];

    if (setores.length === 0) {
        sectorList.innerHTML = '<div style="padding:12px;color:var(--text-muted)">Nenhum setor cadastrado.</div>';
        return;
    }

    // Conta câmeras por setor
    const camerasPerSetor = {};
    cameras.forEach(camera => {
        camerasPerSetor[camera.id_setor] = (camerasPerSetor[camera.id_setor] || 0) + 1;
    });

    sectorList.innerHTML = setores.map(setor => {
        const camerasCount = camerasResult.ok && Array.isArray(camerasResult.data)
            ? camerasPerSetor[setor.id] || 0 : "—";
        return `
            <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
                <span>${escapeHtml(setor.nome)}</span>
                <span class="badge ${camerasCount > 0 ? "success" : ""}">
                    ${camerasCount} câmera${camerasCount !== 1 ? "s" : ""}
                </span>
            </div>
        `;
    }).join("");
}

function renderFactoryMap(camerasResult) {
    const factoryMap = document.getElementById("factoryMap");
    if (!factoryMap) return;

    const cameras = Array.isArray(camerasResult.data) ? camerasResult.data : [];

    if (!camerasResult.ok || !Array.isArray(camerasResult.data)) {
        factoryMap.innerHTML = '<p class="empty">Não foi possível carregar as câmeras.</p>';
        return;
    }
    if (cameras.length === 0) {
        factoryMap.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--text-muted);text-align:center"><i class="fa-solid fa-map" style="font-size:48px;display:block;margin-bottom:8px"></i>Nenhuma câmera cadastrada</div>';
        return;
    }

    const positions = generatePositions(cameras.length);

    factoryMap.innerHTML = cameras.map((camera, index) => {
        const pos = positions[index];
        const color = CAMERA_COLORS[index % CAMERA_COLORS.length];
        return `
            <button
                title="${escapeHtml(camera.nome || `Câmera ${camera.id}`)}"
                style="
                    position:absolute;
                    left:${pos.x}%;
                    top:${pos.y}%;
                    transform:translate(-50%,-50%);
                    width:44px;
                    height:44px;
                    border:none;
                    border-radius:50%;
                    background:${color};
                    color:#fff;
                    cursor:pointer;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                "
            >
                <i class="fa-solid fa-video"></i>
            </button>
        `;
    }).join("");
}

// ─────────────────────────────────────────────
// Indicador de alerta em tempo real (genérico)
// ─────────────────────────────────────────────
// Mantém o aviso genérico de alerta recente. O contrato atual inclui id_camera,
// mas a associação visual do alerta a uma câmera fica para uma próxima etapa.

let mapAlertCount = 0;
let mapAlertConfigured = false;

function configureMapAlertIndicator() {
    if (mapAlertConfigured) return;
    if (typeof onAlert !== "function") return;

    mapAlertConfigured = true;

    onAlert(alerta => {
        mapAlertCount += 1;
        renderMapAlertIndicator(alerta);
    });
}

function renderMapAlertIndicator(alerta) {
    const factoryMap = document.getElementById("factoryMap");
    if (!factoryMap) return;

    let badge = document.getElementById("mapAlertIndicator");

    if (!badge) {
        badge = document.createElement("div");
        badge.id = "mapAlertIndicator";
        badge.style.cssText = `
            position:absolute;top:12px;right:12px;z-index:2;
            background:var(--danger);color:#fff;padding:8px 14px;
            border-radius:20px;font-size:0.8125rem;display:flex;
            align-items:center;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,.18);
        `;
        factoryMap.appendChild(badge);
    }

    const evento = alerta.evento || "Novo alerta";
    badge.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>${escapeHtml(evento)} (${mapAlertCount})</span>
    `;

    badge.style.opacity = "1";
    clearTimeout(badge._fadeTimeout);
    badge._fadeTimeout = setTimeout(() => {
        badge.style.transition = "opacity .6s";
        badge.style.opacity = "0";
    }, 6000);
}

document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
    configureZoneCreation();
    loadMapeamento();
    loadMapCamerasOnline();
});
