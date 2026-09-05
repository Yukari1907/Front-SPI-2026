
"use strict";

/**
 * monitoramento.js — Monitoramento de câmeras via API real do backend.
 *
 * API utilizada:
 *   GET /cameras            → listar câmeras (cache curto, ver api.js:apiGetCached)
 *   GET /setores            → listar setores (idem)
 *   GET /video/<id>         → stream MJPEG da câmera selecionada
 *   GET /detections/<id>    → últimas detecções da câmera selecionada (polling)
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
let currentCameraId = null;

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
        if (setoresResult.ok && Array.isArray(setoresResult.data)) {
            setoresResult.data.forEach(setor => {
                setoresMap[setor.id] = setor.nome;
            });
        }

        if (camerasResult.status === 0) {
            cameraList.innerHTML = `
                <div style="padding:16px;color:var(--danger)">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    Não foi possível conectar ao backend. Verifique se o servidor está em execução.
                </div>
            `;
            return;
        }

        if (!camerasResult.ok || !Array.isArray(camerasResult.data) || camerasResult.data.length === 0) {
            cameraList.innerHTML = '<div style="padding:16px;color:var(--text-muted)">Nenhuma câmera cadastrada.</div>';
            document.getElementById("cameraSelect").innerHTML = "";
            return;
        }

        monitoramentoCameras = camerasResult.data;

        renderCameraList(setoresMap);
        renderCameraSelect(setoresMap);

        // Seleciona a primeira câmera por padrão
        selectCamera(monitoramentoCameras[0].id);

    } catch (e) {
        console.error("[Monitoramento] Erro ao carregar câmeras:", e);
        cameraList.innerHTML = '<div style="padding:16px;color:var(--danger)">Erro ao carregar câmeras.</div>';
    }
}

function renderCameraList(setoresMap) {
    const cameraList = document.getElementById("cameraList");
    if (!cameraList) return;

    cameraList.innerHTML = monitoramentoCameras.map(camera => {
        const setorNome = setoresMap[camera.id_setor] || `Setor ${camera.id_setor}`;
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
                    Câmera ${camera.id}<br>
                    <small class="text-muted">${escapeHtml(camera.ip)} — ${escapeHtml(setorNome)}</small>
                </span>

                <span class="badge success">Online</span>
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
        const setorNome = setoresMap[camera.id_setor] || `Setor ${camera.id_setor}`;
        return `<option value="${camera.id}">Câmera ${camera.id} — ${escapeHtml(setorNome)}</option>`;
    }).join("");

    select.addEventListener("change", () => {
        selectCamera(Number(select.value));
    });
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

    // Cria a camada de vídeo + overlay SVG perfeitamente alinhados
    container.innerHTML = `
        <div id="streamWrapper" style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
            <img
                id="videoStream"
                src="${streamUrl}"
                alt="Stream câmera ${cameraId}"
                style="
                    width: 100%;
                    max-height: 520px;
                    object-fit: contain;
                    border-radius: 8px;
                    background: #000;
                    display: block;
                "
                onerror="handleStreamError(this)"
            >
            <!-- SVG sobreposto ao frame -->
            <svg 
                id="zonasOverlay" 
                style="
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                "
            ></svg>
        </div>
    `;

    // Dispara a busca das zonas da câmera selecionada
    fetchZonas(cameraId);
}

function handleStreamError(img) {
    img.onerror = null; // Previne loop infinito
    const container = document.getElementById("videoContainer");
    if (container) {
        container.innerHTML = `
            <div style="
                padding:48px;
                text-align:center;
                color:var(--text-muted);
                background:var(--surface);
                border-radius:8px;
            ">
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

async function fetchDetections(cameraId) {
    const container = document.getElementById("detectionsContainer");
    if (!container) return;

    try {
        const result = await apiGet(`/detections/${cameraId}`);

        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
            container.innerHTML = result.data.map(det => `
                <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:0.875rem;">
                    <strong>${escapeHtml(String(det.label || det.class_name || "Detecção"))}</strong>
                    ${det.confidence ? `<span class="text-muted"> — confiança: ${(det.confidence * 100).toFixed(1)}%</span>` : ""}
                </div>
            `).join("");
        } else if (result.status === 0) {
            // Backend offline — para o polling
            stopDetectionsPolling();
        } else {
            container.innerHTML = '<div style="padding:12px 0;color:var(--text-muted)">Nenhuma detecção recente.</div>';
        }
    } catch (e) {
        // Silencioso — detecções são secundárias
    }
}

function startDetectionsPolling(cameraId) {
    if (detectionsInterval && detectionsCameraId === cameraId) return;

    stopDetectionsPolling();
    detectionsCameraId = cameraId;
    fetchDetections(cameraId); // Imediato
    detectionsInterval = setInterval(() => fetchDetections(cameraId), 3000); // A cada 3s
}

function stopDetectionsPolling() {
    if (detectionsInterval) {
        clearInterval(detectionsInterval);
        detectionsInterval = null;
        detectionsCameraId = null;
    }
}

let currentCameraZonas = [];

// ─────────────────────────────────────────────
// Busca e Renderização de Zonas
// ─────────────────────────────────────────────

async function fetchZonas(cameraId) {
    try {
        const result = await apiGet(`/zonas/camera/${cameraId}`);
        if (result.ok && Array.isArray(result.data)) {
            currentCameraZonas = result.data;
        } else {
            currentCameraZonas = [];
        }
    } catch (e) {
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
// Inicialização
// ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    loadMonitoramento();
});

// Para o polling ao sair da página
window.addEventListener("pagehide", stopDetectionsPolling);
window.addEventListener("beforeunload", stopDetectionsPolling);

window.handleStreamError = handleStreamError;
