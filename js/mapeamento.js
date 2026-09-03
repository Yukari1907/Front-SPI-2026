
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

async function loadMapeamento() {
    try {
        // Carrega setores e câmeras em paralelo
        const [setoresResult, camerasResult] = await Promise.all([
            apiGet("/setores"),
            apiGet("/cameras")
        ]);

        renderSectorList(setoresResult, camerasResult);
        renderFactoryMap(camerasResult);

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

document.addEventListener("DOMContentLoaded", () => {
    loadMapeamento();
});
