
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
 * Associações de EPI (contrato atual do backend, nomes assimétricos):
 *   leitura  → `epis_id: int[]` (além de `epis_categoria: string[]`), em
 *              GET /zonas, /zonas/{id}, /zonas/camera/{id} e nas respostas de
 *              POST /zonas/registrar e PUT /zonas/{id};
 *   escrita  → `ids_epis: int[]` no corpo do POST e do PUT.
 * No PUT, `ids_epis` ausente preserva as associações atuais e `[]` apaga todas.
 * Por isso a edição só envia `ids_epis` quando a pré-seleção real foi aplicada.
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
let mappingSetores = [];
let mappingZones = [];
// null = criação; id numérico = edição da zona correspondente.
let editingZoneId = null;
// true somente quando a seleção na tela reflete as associações reais da zona.
let zoneEpisReady = false;
// Invalida o carregamento de EPIs de uma abertura anterior do modal.
let zoneModalToken = 0;

/**
 * IDs dos EPIs associados a uma zona, como o backend atual os devolve em `epis_id`.
 * Devolve null quando o campo não veio ou não tem o formato esperado — associações
 * desconhecidas nunca podem ser confundidas com "nenhum EPI", sob pena de um PUT
 * com `ids_epis: []` apagar as associações existentes.
 * @param {object} zone
 * @returns {number[]|null}
 */
function zoneEpiIds(zone) {
    if (!Array.isArray(zone?.epis_id)) return null;

    const ids = zone.epis_id.map(item =>
        Number(typeof item === "object" && item !== null ? item.id : item));

    return ids.every(Number.isInteger) ? ids : null;
}

// TTL curto (45s): setores em sessionStorage; câmeras apenas em memória, pois
// a origem pode conter credenciais. Escritas invalidam ambos os caches.
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
        // null (falha de leitura) nunca vira lista vazia: os formulários que
        // dependem de um setor real ficam indisponíveis em vez de inventar opções.
        mappingSetores = setoresResult.ok && Array.isArray(setoresResult.data) ? setoresResult.data : [];
        renderCameraSectorOptions();

        renderSectorList(setoresResult, camerasResult);
        renderCameraList(camerasResult);
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
        const cameraList = document.getElementById("cameraList");
        if (cameraList) {
            cameraList.innerHTML = '<div style="padding:12px;color:var(--danger)">Erro ao carregar as câmeras.</div>';
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
                    <button class="btn secondary" type="button" disabled
                        title="A exclusão de zonas está indisponível nesta versão."
                        aria-describedby="zoneDeleteUnavailable">Excluir zona</button>
                </div>
            </div>
        `;
    }).join("") + '<p id="zoneDeleteUnavailable" class="text-muted">A exclusão de zonas está indisponível nesta versão.</p>' : '<p class="text-muted">Nenhuma zona cadastrada.</p>';

    list.querySelectorAll("[data-edit-zone]").forEach(button => {
        button.addEventListener("click", () => {
            const zone = mappingZones.find(item => String(item.id) === button.dataset.editZone);
            if (zone) openZoneModal(zone);
        });
    });
}

/**
 * Resumo do que está marcado, para que a seleção múltipla seja evidente mesmo com
 * a lista rolada — inclusive "nenhum EPI", que é uma escolha válida e diferente de
 * "não sei quais são".
 */
function updateZoneEpiSummary() {
    const summary = document.getElementById("zoneEpiSelectionSummary");
    const container = document.getElementById("zoneEpiOptions");
    if (!summary || !container) return;

    const checkboxes = [...container.querySelectorAll('input[name="ids_epis"]')];
    if (!checkboxes.length) {
        summary.textContent = "";
        return;
    }
    const selected = checkboxes.filter(checkbox => checkbox.checked).length;
    summary.textContent = selected === 0
        ? "Nenhum EPI obrigatório selecionado."
        : `${selected} de ${checkboxes.length} EPIs marcados como obrigatórios.`;
}

/**
 * Monta a seleção de EPIs obrigatórios com o cadastro real de GET /epis e marca
 * `selectedIds`. Erro de API e lista vazia são estados distintos: nenhum deles
 * inventa um EPI.
 *
 * @param {number[]} selectedIds - IDs reais associados à zona (vazio na criação).
 * @returns {Promise<boolean>} true apenas quando a seleção na tela passa a refletir
 * exatamente `selectedIds`. Enquanto for false, a edição omite `ids_epis` no PUT,
 * para que um cadastro não carregado nunca apague as associações da zona.
 */
async function loadZoneEpis(selectedIds = [], token = zoneModalToken) {
    const container = document.getElementById("zoneEpiOptions");
    const hint = document.getElementById("zoneEpiHint");
    if (!container || !hint) return false;

    container.setAttribute("aria-busy", "true");
    container.innerHTML = '<p class="text-muted">Carregando EPIs cadastrados…</p>';
    updateZoneEpiSummary();

    const result = await apiGet("/epis");
    // Validar antes de qualquer escrita no DOM, não só no .then do chamador.
    if (token !== zoneModalToken) return false;

    const finish = value => {
        container.setAttribute("aria-busy", "false");
        updateZoneEpiSummary();
        return value;
    };

    if (!result.ok || !Array.isArray(result.data)) {
        container.innerHTML = '<p class="text-muted">Não foi possível carregar os EPIs cadastrados.</p>';
        hint.textContent = "A zona pode ser criada sem EPI obrigatório.";
        return finish(false);
    }

    if (result.data.length === 0) {
        container.innerHTML = '<p class="text-muted">Nenhum EPI cadastrado no inventário.</p>';
        hint.textContent = "Cadastre um EPI no inventário para poder exigi-lo numa zona.";
        // Um cadastro vazio só reflete a zona se ela também não tem EPI associado.
        return finish(selectedIds.length === 0);
    }

    container.innerHTML = result.data.map(epi => `
        <label class="epi-option">
            <input type="checkbox" name="ids_epis" value="${escapeHtml(epi.id)}">
            <span class="epi-option-text">
                <span class="epi-option-name">${escapeHtml(epi.nome)}</span>
                ${epi.categoria ? `<span class="epi-option-category">${escapeHtml(epi.categoria)}</span>` : ""}
            </span>
        </label>
    `).join("");
    hint.textContent = "Marque quantos precisar. Sem nenhum marcado, a zona não exige EPI.";

    // A pré-seleção só é fiel se todo ID associado existir no cadastro atual.
    const checkboxes = [...container.querySelectorAll('input[name="ids_epis"]')];
    const applied = selectedIds.every(id => {
        const checkbox = checkboxes.find(item => Number(item.value) === id);
        if (checkbox) checkbox.checked = true;
        return Boolean(checkbox);
    });

    return finish(applied);
}

/**
 * Mantém o Tab dentro do modal aberto, sem alterar a ordem natural do foco.
 */
function trapModalFocus(modal, event) {
    const controls = [...modal.querySelectorAll("button, input, select")]
        .filter(element => !element.disabled && element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
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

    // Os IDs reais chegam em `epis_id`; null (campo ausente ou fora do formato)
    // mantém as associações intocadas em vez de arriscar apagá-las.
    const epiIds = editing ? zoneEpiIds(zone) : [];
    zoneEpisReady = false;
    document.getElementById("zoneEpiGroup").hidden = false;
    document.getElementById("zoneEpiUnavailable").hidden = true;

    const token = ++zoneModalToken;
    loadZoneEpis(epiIds || [], token).then(applied => {
        if (token !== zoneModalToken) return;  // O modal já foi reaberto em outra zona.
        zoneEpisReady = applied && epiIds !== null;
        if (editing && !zoneEpisReady) {
            document.getElementById("zoneEpiGroup").hidden = true;
            document.getElementById("zoneEpiUnavailable").hidden = false;
        }
    });

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
    // Uma única assinatura no container: as caixas são recriadas a cada abertura.
    document.getElementById("zoneEpiOptions")?.addEventListener("change", updateZoneEpiSummary);
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
        zoneEpisReady = false;
        zoneModalToken++;  // Descarta um carregamento de EPIs ainda em voo.
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
        if (event.key === "Tab" && modal.classList.contains("active")) trapModalFocus(modal, event);
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

        // Na criação, a lista explícita (inclusive vazia) define as associações.
        // Na edição, só envia depois que a pré-seleção real foi aplicada: omitir
        // `ids_epis` faz o backend preservar as associações atuais da zona.
        if (!editing || zoneEpisReady) zone.ids_epis = fields.getAll("ids_epis").filter(Boolean).map(Number);

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
        sectorList.innerHTML = '<div style="padding:12px;color:var(--danger)">Não foi possível carregar os setores.</div>';
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

    // Gerir setores exige admin/supervisor no backend (@perfil_required); sem essa
    // permissão a lista continua visível, apenas sem os controles de escrita.
    const manage = canPerform("sectors:manage");

    sectorList.innerHTML = setores.map(setor => {
        const camerasCount = camerasResult.ok && Array.isArray(camerasResult.data)
            ? camerasPerSetor[setor.id] || 0 : "—";
        return `
            <div class="registry-row">
                <span>${escapeHtml(setor.nome)}</span>
                <span class="badge ${camerasCount > 0 ? "success" : ""}">
                    ${camerasCount} câmera${camerasCount !== 1 ? "s" : ""}
                </span>
                ${manage ? `
                <button class="btn secondary" type="button" data-sector-edit="${escapeHtml(setor.id)}">
                    <i class="fa-solid fa-pen"></i>
                    Editar
                </button>
                <button class="btn secondary" type="button" data-sector-delete="${escapeHtml(setor.id)}">
                    <i class="fa-solid fa-trash"></i>
                    Excluir
                </button>` : ""}
            </div>
        `;
    }).join("");

    if (!manage) return;
    sectorList.querySelectorAll("[data-sector-edit]").forEach(button => button.addEventListener("click", () => {
        const setor = mappingSetores.find(item => String(item.id) === button.dataset.sectorEdit);
        if (setor) openSectorModal(setor);
    }));
    sectorList.querySelectorAll("[data-sector-delete]").forEach(button => button.addEventListener("click", () =>
        deleteSector(Number(button.dataset.sectorDelete))));
}

/**
 * Lista das câmeras reais, com a exclusão ao lado da câmera a que pertence.
 *
 * DELETE /cameras/{id} exige admin ou supervisor (@perfil_required) — sem essa
 * permissão a lista continua visível, apenas sem o controle de escrita.
 *
 * O endereço/IP nunca aparece aqui nem na confirmação: ele pode carregar
 * credenciais de RTSP.
 */
function renderCameraList(camerasResult) {
    const cameraList = document.getElementById("cameraList");
    if (!cameraList) return;

    if (!camerasResult.ok || !Array.isArray(camerasResult.data)) {
        cameraList.innerHTML = '<div style="padding:12px;color:var(--danger)">Não foi possível carregar as câmeras.</div>';
        return;
    }

    const cameras = camerasResult.data;
    if (cameras.length === 0) {
        cameraList.innerHTML = '<div style="padding:12px;color:var(--text-muted)">Nenhuma câmera cadastrada.</div>';
        return;
    }

    const remove = canPerform("cameras:delete");
    const sectorName = id => mappingSetores.find(setor => setor.id === id)?.nome || "";

    cameraList.innerHTML = cameras.map(camera => {
        const setor = sectorName(camera.id_setor);
        return `
            <div class="registry-row">
                <span>
                    ${escapeHtml(camera.nome || `Câmera ${camera.id}`)}
                    <small class="text-muted">ID ${escapeHtml(camera.id)}${setor ? ` — ${escapeHtml(setor)}` : ""}</small>
                </span>
                ${remove ? `
                <button class="btn secondary" type="button" data-camera-delete="${escapeHtml(camera.id)}">
                    <i class="fa-solid fa-trash"></i>
                    Excluir
                </button>` : ""}
            </div>
        `;
    }).join("");

    if (!remove) return;
    cameraList.querySelectorAll("[data-camera-delete]").forEach(button => button.addEventListener("click", () =>
        deleteCamera(Number(button.dataset.cameraDelete))));
}

function setCameraRowsDisabled(disabled) {
    document.querySelectorAll("[data-camera-delete]").forEach(button => { button.disabled = disabled; });
}

/**
 * Exclui uma câmera real. A tela só muda depois do 200 do backend: erro preserva
 * a lista e mostra a mensagem, sem fingir exclusão.
 *
 * DELETE /cameras/{id} devolve 400 genérico tanto para "não encontrada" quanto para
 * vínculos que impedem a exclusão (alertas referenciam a câmera e o monitoramento
 * das zonas dela com ON DELETE RESTRICT). Sem informação para distinguir, a
 * mensagem fica genérica e honesta — ver N3 em ETAPA3_CORRECOES_FUNCIONAIS_UI.md.
 */
async function deleteCamera(id) {
    const feedback = document.getElementById("cameraFeedback");
    const camera = mappingCameras.find(item => item.id === id);
    if (!canPerform("cameras:delete") || registryPending || !camera) return;

    const setor = mappingSetores.find(item => item.id === camera.id_setor)?.nome;
    // Nome, ID e setor identificam a câmera sem expor endereço, RTSP ou credencial.
    const confirmacao = `Excluir a câmera "${camera.nome || `Câmera ${id}`}" (ID ${id})`
        + `${setor ? ` do setor "${setor}"` : ""}?`
        + " As zonas e o monitoramento dessa câmera também são removidos. Esta ação não pode ser desfeita.";
    if (!confirm(confirmacao)) return;

    registryPending = true;
    setCameraRowsDisabled(true);
    if (feedback) feedback.textContent = "Excluindo câmera...";
    try {
        const result = await apiDelete(`/cameras/${id}`);
        if (!result.ok) {
            if (feedback) {
                feedback.textContent = result.status === 400
                    ? "Não foi possível excluir a câmera. Ela pode ter alertas ou zonas vinculados, ou já ter sido removida."
                    : mutationError(result, "Não foi possível excluir a câmera.");
            }
            setCameraRowsDisabled(false);
            return;
        }
        if (feedback) feedback.textContent = "";
        registryPending = false;
        // Mapa, setores, contadores, zonas e os selects dependentes vêm todos da
        // releitura real, com o cache curto de /cameras e /setores invalidado.
        await reloadMappingStructure();
        showToast("Câmera excluída com sucesso.");
    } catch {
        if (feedback) feedback.textContent = "Não foi possível confirmar a exclusão. Atualize a página antes de tentar novamente.";
        setCameraRowsDisabled(false);
    } finally {
        registryPending = false;
    }
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
// ─────────────────────────────
// Cadastro de setores e câmeras (estrutura da planta)
// ─────────────────────────────
// Contrato atual confirmado em backend-SPI:
//   POST /setores/registrar   perfil_required(admin, supervisor)  {nome} -> 201 {id, nome}
//   PUT  /setores/{id}        perfil_required(admin, supervisor)  {nome} -> 200 {id, nome}
//   DELETE /setores/{id}      perfil_required(admin, supervisor)         -> 200 {message}
//   POST /cameras/registrar   perfil_required(admin, supervisor)
//        {ip, id_setor, nome?, rotacao?, espelhar_horizontal?, espelhar_vertical?}
//        -> 201 com a câmera completa. CameraDTO exige ip (1..255) e id_setor int,
//           e só aceita rotacao em [0, 90, 180, 270].
// A permissão do frontend acompanha esses decorators; a autorização definitiva
// continua sendo do servidor.

// Valores aceitos por CameraDTO.rotacao; nenhum outro é oferecido.
const MAPPING_CAMERA_ROTATIONS = [0, 90, 180, 270];

let registryPending = false;

function setRegistryError(id, message) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
}

/**
 * Opções de setor da criação de câmera. Sem setor real carregado o envio fica
 * bloqueado: o backend exige um `id_setor` existente e nada é inventado aqui.
 */
function renderCameraSectorOptions() {
    const select = document.getElementById("newCameraSector");
    const save = document.getElementById("saveNewCamera");
    if (!select || !save) return;

    const previous = select.value;
    select.innerHTML = mappingSetores.length
        ? '<option value="">Selecione um setor</option>' + mappingSetores.map(setor =>
            `<option value="${escapeHtml(setor.id)}">${escapeHtml(setor.nome)}</option>`).join("")
        : '<option value="">Nenhum setor disponível</option>';
    if (mappingSetores.some(setor => String(setor.id) === previous)) select.value = previous;

    select.disabled = mappingSetores.length === 0;
    save.disabled = mappingSetores.length === 0;
}

/**
 * Recarrega setores, câmeras, mapa e zonas a partir do backend, ignorando o
 * cache curto de /setores e /cameras que a alteração acabou de invalidar.
 */
async function reloadMappingStructure() {
    apiClearCached("/setores");
    apiClearCached("/cameras");
    await loadMapeamento();
    await loadMapCamerasOnline();
}

/**
 * Aplica uma mutação de cadastro. A tela só muda depois da resposta real do
 * backend: erro mantém o formulário aberto, sem registro local nem sucesso
 * antecipado.
 * @returns {Promise<boolean>} true somente quando o backend confirmou.
 */
async function submitRegistry({ permission, request, success, errorId, form, save }) {
    if (!canPerform(permission) || registryPending) return false;

    registryPending = true;
    save.disabled = true;
    setRegistryError(errorId, "");
    try {
        const result = await request();
        if (!result.ok) {
            setRegistryError(errorId, mutationError(result, "Não foi possível concluir a operação."));
            return false;
        }
        form.reset();
        registryPending = false;
        await reloadMappingStructure();
        showToast(success);
        return true;
    } catch {
        setRegistryError(errorId, "Não foi possível confirmar a operação. Atualize a página antes de tentar novamente.");
        return false;
    } finally {
        registryPending = false;
        save.disabled = false;
        renderCameraSectorOptions();
    }
}

/**
 * Abre o modal de setor. Sem argumento cria; com o setor real carrega o nome
 * atual para edição.
 */
function openSectorModal(setor = null) {
    const modal = document.getElementById("sectorModal");
    const form = document.getElementById("sectorForm");
    if (!modal || !form || !canPerform("sectors:manage")) return;

    const editing = setor !== null;
    form.reset();
    form.elements.id.value = editing ? String(setor.id) : "";
    document.getElementById("sectorName").value = editing ? setor.nome || "" : "";
    document.getElementById("sectorModalTitle").textContent = editing ? "Editar setor" : "Novo setor";
    document.getElementById("sectorModalHint").textContent = editing
        ? `Dados atuais do setor ${setor.id}.`
        : "Cadastre um setor da planta.";
    document.getElementById("saveSectorLabel").textContent = editing ? "Salvar setor" : "Criar setor";
    setRegistryError("sectorFormError", "");

    modal.classList.add("active");
    document.getElementById("sectorName").focus();
}

function setSectorRowsDisabled(disabled) {
    document.querySelectorAll("[data-sector-delete], [data-sector-edit]")
        .forEach(button => { button.disabled = disabled; });
}

async function deleteSector(id) {
    const feedback = document.getElementById("sectorFeedback");
    const setor = mappingSetores.find(item => item.id === id);
    if (!canPerform("sectors:manage") || registryPending || !setor) return;
    if (!confirm(`Excluir setor "${setor.nome || id}" (ID ${id})? Esta ação não pode ser desfeita.`)) return;

    registryPending = true;
    setSectorRowsDisabled(true);
    if (feedback) feedback.textContent = "Excluindo setor...";
    try {
        const result = await apiDelete(`/setores/${id}`);
        if (!result.ok) {
            if (feedback) feedback.textContent = mutationError(result, "Não foi possível excluir o setor.");
            setSectorRowsDisabled(false);
            return;
        }
        if (feedback) feedback.textContent = "";
        registryPending = false;
        await reloadMappingStructure();
        showToast("Setor excluído com sucesso.");
    } catch {
        if (feedback) feedback.textContent = "Não foi possível confirmar a exclusão. Atualize a página antes de tentar novamente.";
        setSectorRowsDisabled(false);
    } finally {
        registryPending = false;
    }
}

/**
 * Fechamento por botão, clique no fundo e Esc, com o foco preso enquanto aberto.
 */
function bindRegistryModal(modalId, openerId, onOpen) {
    const modal = document.getElementById(modalId);
    const opener = document.getElementById(openerId);
    if (!modal || !opener) return () => {};

    const close = () => {
        if (registryPending) return;
        modal.querySelector('input[name="ip"]')?.form.reset();
        modal.classList.remove("active");
        opener.focus();
    };

    opener.addEventListener("click", onOpen);
    modal.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", close));
    modal.addEventListener("click", event => {
        if (event.target === modal) close();
    });
    document.addEventListener("keydown", event => {
        if (!modal.classList.contains("active")) return;
        if (event.key === "Escape") close();
        if (event.key === "Tab") trapModalFocus(modal, event);
    });
    return close;
}

function configureRegistries() {
    const sectorForm = document.getElementById("sectorForm");
    const cameraForm = document.getElementById("cameraCreateForm");
    if (!sectorForm || !cameraForm) return;

    const closeSector = bindRegistryModal("sectorModal", "openSectorModal", () => openSectorModal());
    const closeCamera = bindRegistryModal("cameraCreateModal", "openCameraCreateModal", () => {
        if (!canPerform("cameras:create")) return;
        cameraForm.reset();
        setRegistryError("cameraCreateError", "");
        renderCameraSectorOptions();
        if (!mappingSetores.length) {
            setRegistryError("cameraCreateError", "Cadastre um setor antes: toda câmera precisa pertencer a um setor existente.");
        }
        document.getElementById("cameraCreateModal").classList.add("active");
        document.getElementById("newCameraName").focus();
    });

    sectorForm.addEventListener("submit", async event => {
        event.preventDefault();
        const save = document.getElementById("saveSector");
        if (registryPending || save.disabled || !sectorForm.reportValidity()) return;

        const id = Number(sectorForm.elements.id.value);
        const nome = sectorForm.elements.nome.value.trim();
        if (!nome) {
            setRegistryError("sectorFormError", "Informe o nome do setor.");
            return;
        }

        const ok = await submitRegistry({
            permission: "sectors:manage",
            request: () => id ? apiPut(`/setores/${id}`, { nome }) : apiPost("/setores/registrar", { nome }),
            success: id ? "Setor atualizado com sucesso." : "Setor criado com sucesso.",
            errorId: "sectorFormError", form: sectorForm, save
        });
        if (ok) closeSector();
    });

    cameraForm.addEventListener("submit", async event => {
        event.preventDefault();
        const save = document.getElementById("saveNewCamera");
        if (registryPending || save.disabled || !cameraForm.reportValidity()) return;

        const fields = new FormData(cameraForm);
        const ip = String(fields.get("ip") || "").trim();
        const idSetor = Number(fields.get("id_setor"));
        const rotacao = Number(fields.get("rotacao"));

        if (!ip) {
            setRegistryError("cameraCreateError", "Informe o endereço/IP da câmera.");
            return;
        }
        if (!mappingSetores.some(setor => Number(setor.id) === idSetor)) {
            setRegistryError("cameraCreateError", "Selecione um setor cadastrado.");
            return;
        }
        if (!MAPPING_CAMERA_ROTATIONS.includes(rotacao)) {
            setRegistryError("cameraCreateError", "Selecione uma das rotações disponíveis.");
            return;
        }

        // Tipos exatos do CameraDTO: strings, inteiro e booleanos reais. O POST
        // atual já persiste rotação e espelhamentos, então os três são enviados.
        const payload = {
            nome: String(fields.get("nome") || "").trim(),
            ip,
            id_setor: idSetor,
            rotacao,
            espelhar_horizontal: document.getElementById("newCameraMirrorH").checked,
            espelhar_vertical: document.getElementById("newCameraMirrorV").checked
        };

        const ok = await submitRegistry({
            permission: "cameras:create",
            request: () => apiPost("/cameras/registrar", payload),
            success: "Câmera criada com sucesso.",
            errorId: "cameraCreateError", form: cameraForm, save
        });
        if (ok) closeCamera();
    });
}

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
    configureRegistries();
    loadMapeamento();
    loadMapCamerasOnline();
});
