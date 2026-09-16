
"use strict";

/**
 * monitoramento.js — Monitoramento de câmeras via API real do backend.
 *
 * API utilizada:
 *   GET /cameras            → listar câmeras (cache curto, ver api.js:apiGetCached)
 *   GET /setores            → listar setores (idem)
 *   GET /video/<id>         → stream MJPEG da câmera selecionada
 *   GET /detections/<id>    → últimas detecções da câmera selecionada (polling)
 *   PUT /cameras/<id>       → editar nome, IP, setor, rotação e espelhamento
 *                             (admin/supervisor, conforme perfil_required)
 *
 * Seletor de câmera: a tela mostra uma câmera por vez (não múltiplas
 * simultâneas), escolhida pelo <select> ou clicando na lista de câmeras.
 *
 * Nota sobre o WebSocket (ver CONTRATO_INTEGRACAO.md): o evento "novo_alerta"
 * cobre alertas (violações), não as detecções contínuas do YOLO — por isso
 * /detections continua em polling aqui, mesmo com o WS de alertas já ativo
 * (ligado globalmente em common.js/notifications.js para o painel de
 * notificações). Ver RELATORIO_IMPLEMENTACAO_FRONTEND.md para o porquê.
 */

const CAMERAS_SETORES_CACHE_TTL_MS = 45000;

let monitoramentoCameras = [];
let monitoramentoSetores = [];
let currentCameraId = null;

// GET /cameras e GET /cameras/status não devolvem rotacao/espelhar_*; somente a
// resposta do PUT devolve. Guardamos o que o backend confirmou nesta página
// para reapresentar no formulário, sem persistir nem inventar valor.
const camerasTransformacoesAplicadas = new Map();

// ─────────────────────────────────────────────
// Carregar câmeras e setores
// ─────────────────────────────────────────────

async function loadMonitoramento() {
    const cameraList = document.getElementById("cameraList");
    if (!cameraList) return;

    cameraList.innerHTML = '<div style="padding:16px;color:var(--text-muted)">Carregando câmeras...</div>';

    try {
        // Carrega câmeras e setores em paralelo (cache curto)
        const [camerasResult, setoresResult] = await Promise.all([
            apiGetCached("/cameras", CAMERAS_SETORES_CACHE_TTL_MS),
            apiGetCached("/setores", CAMERAS_SETORES_CACHE_TTL_MS)
        ]);

        // Monta dicionário de setores: id → nome
        const setoresMap = {};
        monitoramentoSetores = setoresResult.ok && Array.isArray(setoresResult.data) ? setoresResult.data : [];
        monitoramentoSetores.forEach(setor => {
            setoresMap[setor.id] = setor.nome;
        });

        if (camerasResult.status === 0) {
            cameraList.innerHTML = `
                <div style="padding:16px;color:var(--danger)">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    Não foi possível conectar ao backend. Verifique se o servidor está em execução.
                </div>
            `;
            return;
        }

        if (!camerasResult.ok || !Array.isArray(camerasResult.data)) {
            cameraList.innerHTML = '<div class="empty">Não foi possível carregar as câmeras.</div>';
            return;
        }
        if (camerasResult.data.length === 0) {
            cameraList.innerHTML = '<div style="padding:16px;color:var(--text-muted)">Nenhuma câmera cadastrada.</div>';
            document.getElementById("cameraSelect").innerHTML = "";
            return;
        }

        monitoramentoCameras = camerasResult.data;

        renderCameraList(setoresMap);
        renderCameraSelect(setoresMap);

        const editButton = document.getElementById("openCameraModal");
        if (editButton) editButton.disabled = false;

        // Mantém a câmera selecionada ao recarregar (ex.: após editar a câmera);
        // na primeira carga, seleciona a primeira.
        const preserved = monitoramentoCameras.some(camera => camera.id === currentCameraId);
        selectCamera(preserved ? currentCameraId : monitoramentoCameras[0].id);

    } catch (e) {
        console.error("[Monitoramento] Erro ao carregar câmeras:", e);
        cameraList.innerHTML = '<div style="padding:16px;color:var(--danger)">Erro ao carregar câmeras.</div>';
    }
}

function renderCameraList(setoresMap) {
    const cameraList = document.getElementById("cameraList");
    if (!cameraList) return;

    cameraList.innerHTML = monitoramentoCameras.map(camera => {
        const setorNome = setoresMap[camera.id_setor] || (camera.id_setor != null && camera.id_setor !== "" ? `Setor ${camera.id_setor}` : "");
        const selected = camera.id === currentCameraId;
        return `
            <button
                type="button"
                class="camera-list-item"
                data-camera-id="${camera.id}"
                style="
                    display:flex;justify-content:space-between;align-items:center;
                    width:100%;text-align:left;border:none;background:${selected ? "var(--primary-soft)" : "transparent"};
                    padding:12px;border-radius:8px;border-bottom:1px solid var(--border);cursor:pointer;
                "
            >
                <span>
                    <i class="fa-solid fa-video"></i>
                    Câmera ${camera.id}
                    ${setorNome ? `<br><small class="text-muted">${escapeHtml(setorNome)}</small>` : ""}
                </span>

                <span class="badge" data-camera-status="${camera.id}">Não verificado</span>
            </button>
        `;
    }).join("");

    cameraList.querySelectorAll(".camera-list-item").forEach(button => {
        button.addEventListener("click", () => {
            selectCamera(Number(button.dataset.cameraId));
        });
    });
}

function renderCameraSelect(setoresMap) {
    const select = document.getElementById("cameraSelect");
    if (!select) return;

    select.innerHTML = monitoramentoCameras.map(camera => {
        const setorNome = setoresMap[camera.id_setor] || (camera.id_setor != null && camera.id_setor !== "" ? `Setor ${camera.id_setor}` : "");
        return `<option value="${camera.id}">Câmera ${camera.id}${setorNome ? ` — ${escapeHtml(setorNome)}` : ""}</option>`;
    }).join("");

    if (currentCameraId !== null) select.value = String(currentCameraId);

    // onchange (e não addEventListener) para não acumular handlers ao recarregar.
    select.onchange = () => {
        selectCamera(Number(select.value));
    };
}

function selectCamera(cameraId) {
    if (!cameraId || cameraId === currentCameraId) {
        currentCameraId = cameraId;
        return;
    }

    currentCameraId = cameraId;

    const select = document.getElementById("cameraSelect");
    if (select) select.value = String(cameraId);

    renderCameraListSelection();
    renderVideoStream(cameraId);

    stopDetectionsPolling();
    startDetectionsPolling(cameraId);
}

function renderCameraListSelection() {
    document.querySelectorAll(".camera-list-item").forEach(button => {
        const isSelected = Number(button.dataset.cameraId) === currentCameraId;
        button.style.background = isSelected ? "var(--primary-soft)" : "transparent";
    });
}

// ─────────────────────────────────────────────
// Stream de vídeo
// ─────────────────────────────────────────────

function renderVideoStream(cameraId) {
    const container = document.getElementById("videoContainer");
    if (!container) return;

    const streamUrl = apiVideoUrl(cameraId);

    // O CSS dimensiona o wrapper pela imagem, sem presumir a proporção da câmera.
    currentCameraZonas = [];
    container.innerHTML = `
        <div id="streamWrapper">
            <img
                id="videoStream"
                src="${streamUrl}"
                alt="Carregando stream da câmera ${cameraId}"
                onerror="handleStreamError(this)"
            >
            <!-- SVG sobreposto ao frame -->
            <svg id="zonasOverlay"></svg>
        </div>
    `;

    // Dispara a busca das zonas da câmera selecionada
    fetchZonas(cameraId);
}

function handleStreamError(img) {
    if (img !== document.getElementById("videoStream")) return;
    img.onerror = null; // Previne loop infinito
    const container = document.getElementById("videoContainer");
    if (container) {
        container.innerHTML = `
            <div class="stream-placeholder">
                <i class="fa-solid fa-video-slash" style="font-size:48px;margin-bottom:16px;display:block;"></i>
                Stream de vídeo indisponível.<br>
                <small>Verifique se a câmera está conectada e o backend em execução.</small>
            </div>
        `;
    }
}

// ─────────────────────────────────────────────
// Polling de detecções (por câmera selecionada)
// ─────────────────────────────────────────────

let detectionsInterval = null;
let detectionsCameraId = null;
let detectionsPollVersion = 0;
const MONITORING_FPS_TARGET = 30;
const MONITORING_LATENCY_SCALE_MS = 200;

function renderDetectionState(data, message = "") {
    const connected = data?.connected === true;
    const validMetric = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
    const fps = data && validMetric(data.fps) ? data.fps : null;
    const latency = connected && validMetric(data.latencia_ms) ? data.latencia_ms : null;
    const setText = (id, text) => {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    };
    setText("performanceFps", fps === null ? "—" : fps.toFixed(1));
    setText("performanceLatency", latency === null ? "—" : `${latency.toFixed(1)} ms`);
    [["performanceFpsBar", fps / MONITORING_FPS_TARGET],
        ["performanceLatencyBar", (latency || 0) / MONITORING_LATENCY_SCALE_MS]].forEach(([id, ratio]) => {
        const bar = document.getElementById(id);
        if (bar) bar.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
    });
    const statusText = message || (connected ? "Conectada" : "Desconectada");
    const statusClass = connected ? "badge success" : "badge";
    const status = document.getElementById("cameraConnectionStatus");
    if (status) { status.textContent = statusText; status.className = statusClass; }
    const cameraBadge = document.querySelector(`[data-camera-status="${currentCameraId}"]`);
    if (cameraBadge) { cameraBadge.textContent = statusText; cameraBadge.className = statusClass; }

    const container = document.getElementById("detectionsContainer");
    if (!container) return;
    const detections = connected && Array.isArray(data.detections) ? data.detections : [];
    const counts = connected && data.class_count && typeof data.class_count === "object" && !Array.isArray(data.class_count)
        ? Object.entries(data.class_count).filter(([, count]) => validMetric(count)) : [];
    const summary = counts.length ? `<p class="text-muted">Contagem no frame: ${counts.map(([label, count]) => `${escapeHtml(label)}: ${count}`).join(" · ")}</p>` : "";
    container.innerHTML = summary + (detections.length ? detections.map(det => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:0.875rem;">
            <strong>${escapeHtml(String(det.label || "Detecção"))}</strong>
            ${validMetric(det.confidence) ? `<span class="text-muted"> — confiança: ${(det.confidence * 100).toFixed(1)}%</span>` : ""}
        </div>
    `).join("") : `<div style="padding:12px 0;color:var(--text-muted)">${escapeHtml(message || (connected ? "Nenhuma detecção recente." : "Câmera desconectada."))}</div>`);
}

async function fetchDetections(cameraId, version = detectionsPollVersion) {
    try {
        const result = await apiGet(`/detections/${cameraId}`);
        if (cameraId !== currentCameraId || version !== detectionsPollVersion) return;
        const valid = result.ok && result.data && typeof result.data.connected === "boolean";
        renderDetectionState(valid ? result.data : null, valid ? "" : "Detecções indisponíveis.");
    } catch (e) {
        if (cameraId === currentCameraId && version === detectionsPollVersion) {
            renderDetectionState(null, "Detecções indisponíveis.");
        }
    }
}

function startDetectionsPolling(cameraId) {
    stopDetectionsPolling();
    detectionsCameraId = cameraId;
    const version = detectionsPollVersion;
    renderDetectionState(null, "Consultando câmera...");
    // Agenda após a resposta: evita sobreposição e continua após 503/falha de rede.
    const poll = async () => {
        await fetchDetections(cameraId, version);
        if (version === detectionsPollVersion && detectionsCameraId === cameraId) {
            detectionsInterval = setTimeout(poll, 3000);
        }
    };
    poll();
}

function stopDetectionsPolling() {
    detectionsPollVersion += 1;
    clearTimeout(detectionsInterval);
    detectionsInterval = null;
    detectionsCameraId = null;
}

let currentCameraZonas = [];

// ─────────────────────────────────────────────
// Busca e Renderização de Zonas
// ─────────────────────────────────────────────

async function fetchZonas(cameraId) {
    const overlay = document.getElementById("zonasOverlay");
    try {
        const result = await apiGet(`/zonas/camera/${cameraId}`);
        // Descarta respostas de streams substituídos, inclusive na troca A → B → A.
        if (overlay !== document.getElementById("zonasOverlay")) return;
        if (result.ok && Array.isArray(result.data)) {
            currentCameraZonas = result.data;
        } else {
            currentCameraZonas = [];
        }
    } catch (e) {
        if (overlay !== document.getElementById("zonasOverlay")) return;
        console.error("[Monitoramento] Erro ao buscar zonas:", e);
        currentCameraZonas = [];
    }
    renderZonasOverlay();
}

function renderZonasOverlay() {
    const overlay = document.getElementById("zonasOverlay");
    if (!overlay) return;

    if (!currentCameraZonas || currentCameraZonas.length === 0) {
        overlay.innerHTML = "";
        return;
    }

    // A proporção da "Golden Ratio" garante que tons fiquem bem espalhados pela roda de cores
    const GOLDEN_RATIO_CONJUGATE = 0.618033988749895;

    overlay.innerHTML = currentCameraZonas.map((zona, index) => {
        // Conversão de escala 0.0-1.0 para porcentagem (%)
        const x = (zona.x * 100).toFixed(2);
        const y = (zona.y * 100).toFixed(2);
        const w = (zona.largura * 100).toFixed(2);
        const h = (zona.altura * 100).toFixed(2);

        // Se a zona tiver ID numérico, usamos ele; caso contrário, usamos o índice
        const seed = Number(zona.id) || (index + 1);
        
        // Gera um ângulo de matiz (0 a 360) único e bem contrastado
        const hue = Math.floor(((seed * GOLDEN_RATIO_CONJUGATE) % 1) * 360);

        // Cores derivadas do mesmo matiz (HSL)
        const strokeColor = `hsla(${hue}, 85%, 55%, 0.85)`; // Borda bem visível
        const fillColor   = `hsla(${hue}, 85%, 55%, 0.07)`; // Fundo quase transparente (4% opacidade)
        const badgeBg     = `hsl(${hue}, 75%, 42%)`;        // Fundo sólido e elegante da etiqueta

        return `
            <g class="zona-group" data-id="${zona.id}">
                <!-- Retângulo da zona -->
                <rect 
                    x="${x}%" y="${y}%" 
                    width="${w}%" height="${h}%" 
                    fill="${fillColor}" 
                    stroke="${strokeColor}" 
                    stroke-width="2" 
                    stroke-dasharray="5 3"
                    rx="4"
                />
                
                <!-- Badge superior moderna com cor combinando -->
                <foreignObject x="${x}%" y="${y}%" width="${w}%" height="32px" style="overflow: visible;">
                    <div xmlns="http://www.w3.org/1999/xhtml" style="
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        background: ${badgeBg};
                        color: #ffffff;
                        padding: 2px 8px;
                        border-radius: 4px 0 6px 0;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        font-size: 11px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.35);
                        pointer-events: none;
                    ">
                        <i class="fa-solid ${zona.permitido ? 'fa-shield-halved' : 'fa-triangle-exclamation'}" style="font-size: 10px;"></i>
                        <span>${escapeHtml(zona.nome || 'Zona')}</span>
                    </div>
                </foreignObject>
            </g>
        `;
    }).join("");
}

// ─────────────────────────────────────────────
// Edição da câmera (admin/supervisor no backend)
// ─────────────────────────────────────────────

// Valores aceitos por CameraDTO.rotacao; nenhum outro é oferecido.
const CAMERA_ROTATIONS = [0, 90, 180, 270];

function renderCameraSectorOptions(camera) {
    const select = document.getElementById("cameraSector");
    const options = monitoramentoSetores.map(setor =>
        `<option value="${escapeHtml(setor.id)}">${escapeHtml(setor.nome)}</option>`);

    // O setor atual da câmera precisa existir como opção para o PUT não movê-la
    // de setor quando a listagem estiver indisponível ou incompleta.
    const current = Number(camera.id_setor);
    if (Number.isInteger(current) && !monitoramentoSetores.some(setor => Number(setor.id) === current)) {
        options.unshift(`<option value="${current}">Setor ${current}</option>`);
    }

    select.innerHTML = options.join("");
    if (Number.isInteger(current)) select.value = String(current);
    return select.options.length > 0;
}

function configureCameraEditing() {
    const modal = document.getElementById("cameraModal");
    const form = document.getElementById("cameraForm");
    const openButton = document.getElementById("openCameraModal");
    const saveButton = document.getElementById("saveCameraButton");
    if (!modal || !form || !openButton || !saveButton) return;

    const error = document.getElementById("cameraFormError");
    const showError = message => {
        error.textContent = message;
        error.hidden = !message;
    };

    const close = () => {
        if (saveButton.disabled) return;
        modal.classList.remove("active");
        showError("");
        openButton.focus();
    };

    openButton.addEventListener("click", () => {
        const camera = monitoramentoCameras.find(item => item.id === currentCameraId);
        if (!camera) {
            showToast("Selecione uma câmera cadastrada para editar.", "warning");
            return;
        }

        showError("");
        document.getElementById("cameraModalHint").textContent =
            `Configuração da câmera ${camera.id}${camera.nome ? ` — ${camera.nome}` : ""}.`;
        document.getElementById("cameraName").value = camera.nome || "";
        document.getElementById("cameraIp").value = camera.ip || "";

        if (!renderCameraSectorOptions(camera)) {
            showError("Nenhum setor disponível: o backend exige um setor válido para salvar a câmera.");
        }

        // GET não devolve rotação/espelhamento: só reapresentamos o que o
        // próprio backend confirmou em um PUT desta sessão.
        const applied = camerasTransformacoesAplicadas.get(camera.id);
        document.getElementById("cameraRotation").value = String(applied?.rotacao ?? 0);
        document.getElementById("cameraMirrorH").checked = applied?.espelhar_horizontal === true;
        document.getElementById("cameraMirrorV").checked = applied?.espelhar_vertical === true;
        document.getElementById("cameraTransformNote").textContent = applied
            ? "Rotação e espelhamento confirmados pelo backend ao salvar nesta sessão."
            : "O backend não informa a rotação e o espelhamento atuais: o valor enviado aqui substitui o que estiver gravado.";

        modal.classList.add("active");
        document.getElementById("cameraName").focus();
    });

    document.getElementById("closeCameraModal").addEventListener("click", close);
    document.getElementById("cancelCameraModal").addEventListener("click", close);
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

        const cameraId = currentCameraId;
        const fields = new FormData(form);
        const nome = String(fields.get("nome") || "").trim();
        const ip = String(fields.get("ip") || "").trim();
        const idSetor = Number(fields.get("id_setor"));
        const rotacao = Number(fields.get("rotacao"));

        if (!ip) {
            showError("Informe o endereço/IP da câmera.");
            return;
        }
        if (!Number.isInteger(idSetor)) {
            showError("Selecione um setor cadastrado.");
            return;
        }
        if (!CAMERA_ROTATIONS.includes(rotacao)) {
            showError("Selecione uma rotação suportada pelo backend.");
            return;
        }

        // Tipos exatos do CameraDTO: strings, inteiro e booleanos reais.
        const payload = {
            nome: nome || null,
            ip,
            id_setor: idSetor,
            rotacao,
            espelhar_horizontal: document.getElementById("cameraMirrorH").checked,
            espelhar_vertical: document.getElementById("cameraMirrorV").checked
        };

        saveButton.disabled = true;
        showError("");
        try {
            const result = await apiPut(`/cameras/${cameraId}`, payload);
            if (!result.ok) {
                showError(result.data?.message || result.data?.error
                    || (result.status === 403
                        ? "Seu perfil não tem permissão para editar câmeras."
                        : "Não foi possível salvar a câmera."));
                return;
            }

            // Guarda o que o backend devolveu, não o que foi enviado.
            const data = result.data || {};
            if (CAMERA_ROTATIONS.includes(Number(data.rotacao))) {
                camerasTransformacoesAplicadas.set(cameraId, {
                    rotacao: Number(data.rotacao),
                    espelhar_horizontal: data.espelhar_horizontal === true,
                    espelhar_vertical: data.espelhar_vertical === true
                });
            }

            apiClearCached("/cameras");
            saveButton.disabled = false;
            close();
            showToast("Câmera atualizada com sucesso.");
            await loadMonitoramento();
        } catch {
            showError("Não foi possível salvar a câmera. Tente novamente.");
        } finally {
            saveButton.disabled = false;
        }
    });
}

// ─────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
    const datasetReviewLink = document.getElementById("datasetReviewLink");

    if (datasetReviewLink) {
        // Define o href completo com a base do backend
        const targetUrl = `${window.API_BASE_URL}/curadoria`;
        datasetReviewLink.href = targetUrl;

        datasetReviewLink.addEventListener("click", (e) => {
            e.preventDefault();
            // Abre o site da curadoria servido pelo Flask em nova aba
            window.open(targetUrl, "_blank", "noopener,noreferrer");
        });
    }
    
    configureCameraEditing();
    loadMonitoramento();
});

// Para o polling ao sair da página
window.addEventListener("pagehide", stopDetectionsPolling);
window.addEventListener("beforeunload", stopDetectionsPolling);

window.handleStreamError = handleStreamError;
