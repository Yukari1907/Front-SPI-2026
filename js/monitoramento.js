
"use strict";

/**
 * monitoramento.js — Monitoramento de câmeras via API real do backend.
 *
 * API utilizada:
 *   GET /cameras   → listar câmeras
 *   GET /setores   → listar setores (para exibir nome do setor)
 *   GET /video/<id> → stream MJPEG da câmera
 *   GET /detections → últimas detecções (polling)
 */

// ─────────────────────────────────────────────
// Carregar câmeras e setores
// ─────────────────────────────────────────────

async function loadMonitoramento() {
    const cameraList = document.getElementById("cameraList");
    if (!cameraList) return;

    cameraList.innerHTML = '<div style="padding:16px;color:var(--text-muted)">Carregando câmeras...</div>';

    try {
        // Carrega câmeras e setores em paralelo
        const [camerasResult, setoresResult] = await Promise.all([
            apiGet("/cameras"),
            apiGet("/setores")
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
            return;
        }

        const cameras = camerasResult.data;

        cameraList.innerHTML = cameras.map(camera => {
            const setorNome = setoresMap[camera.id_setor] || `Setor ${camera.id_setor}`;
            return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)">
                    <span>
                        <i class="fa-solid fa-video"></i>
                        Câmera ${camera.id}<br>
                        <small class="text-muted">${escapeHtml(camera.ip)} — ${escapeHtml(setorNome)}</small>
                    </span>

                    <span class="badge success">Online</span>
                </div>
            `;
        }).join("");

        // Renderiza o stream de vídeo da primeira câmera disponível
        renderVideoStream(cameras[0].id);

        // Inicia polling de detecções
        startDetectionsPolling();

    } catch (e) {
        console.error("[Monitoramento] Erro ao carregar câmeras:", e);
        cameraList.innerHTML = '<div style="padding:16px;color:var(--danger)">Erro ao carregar câmeras.</div>';
    }
}

// ─────────────────────────────────────────────
// Stream de vídeo
// ─────────────────────────────────────────────

function renderVideoStream(cameraId) {
    const container = document.getElementById("videoContainer");
    if (!container) return;

    const streamUrl = apiVideoUrl(cameraId);

    // Usa tag <img> para MJPEG stream (padrão suportado pelo backend Flask)
    container.innerHTML = `
        <img
            id="videoStream"
            src="${streamUrl}"
            alt="Stream câmera ${cameraId}"
            style="
                width:100%;
                max-height:480px;
                object-fit:contain;
                border-radius:8px;
                background:#000;
            "
            onerror="handleStreamError(this)"
        >
    `;
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
// Polling de detecções
// ─────────────────────────────────────────────

let detectionsInterval = null;

async function fetchDetections() {
    const container = document.getElementById("detectionsContainer");
    if (!container) return;

    try {
        const result = await apiGet("/detections");

        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
            container.innerHTML = result.data.map(det => `
                <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:0.875rem;">
                    <strong>${escapeHtml(String(det.class_name || det.label || "Detecção"))}</strong>
                    ${det.confidence ? `<span class="text-muted"> — confiança: ${(det.confidence * 100).toFixed(1)}%</span>` : ""}
                </div>
            `).join("");
        } else if (result.status === 0) {
            // Backend offline — para o polling
            stopDetectionsPolling();
        }
    } catch (e) {
        // Silencioso — detecções são secundárias
    }
}

function startDetectionsPolling() {
    if (detectionsInterval) return;
    fetchDetections(); // Imediato
    detectionsInterval = setInterval(fetchDetections, 3000); // A cada 3s
}

function stopDetectionsPolling() {
    if (detectionsInterval) {
        clearInterval(detectionsInterval);
        detectionsInterval = null;
    }
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
