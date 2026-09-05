
"use strict";

/**
 * mapeamento.js — Mapeamento de setores e câmeras via API real do backend.
 *
 * API utilizada:
 *   GET /setores  → listar setores
 *   GET /cameras  → listar câmeras (com id_setor para agrupamento)
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

// TTL curto (45s) — sobrevive à navegação entre páginas via sessionStorage,
// mas não serve dado desatualizado por muito tempo após um cadastro novo.
const CAMERAS_SETORES_CACHE_TTL_MS = 45000;

async function loadMapeamento() {
    try {
        // Carrega setores e câmeras em paralelo (cache curto — mesma chamada
        // que monitoramento.js faz ao navegar entre as duas páginas)
        const [setoresResult, camerasResult] = await Promise.all([
            apiGetCached("/setores", CAMERAS_SETORES_CACHE_TTL_MS),
            apiGetCached("/cameras", CAMERAS_SETORES_CACHE_TTL_MS)
        ]);

        renderSectorList(setoresResult, camerasResult);
        renderFactoryMap(camerasResult);
        configureMapAlertIndicator();

    } catch (e) {
        console.error("[Mapeamento] Erro ao carregar dados:", e);

        const sectorList = document.getElementById("sectorList");
        if (sectorList) {
            sectorList.innerHTML = '<div style="padding:12px;color:var(--danger)">Erro ao carregar setores.</div>';
        }
    }
}

function renderSectorList(setoresResult, camerasResult) {
    const sectorList = document.getElementById("sectorList");
    if (!sectorList) return;

    if (setoresResult.status === 0) {
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
        const camerasCount = camerasPerSetor[setor.id] || 0;
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
                title="Câmera ${camera.id} — IP: ${escapeHtml(camera.ip)}"
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
// O payload do WebSocket (ver CONTRATO_INTEGRACAO.md) só tem
// {id_monitorar, id_usuario, evento, severidade} — sem id_camera — então não
// dá para acender o ícone da câmera específica no mapa a partir do evento.
// Enquanto isso não mudar no backend, mostramos só que HOUVE alerta recente,
// sem apontar para uma câmera exata.

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

document.addEventListener("DOMContentLoaded", () => {
    loadMapeamento();
});
