"use strict";

// null significa desconhecido: nem GET /active-learning/status respondeu, nem uma
// alteração foi confirmada. Erro jamais vira "desativado".
const visionSettingsState = {
    activeLearning: null,
    activeLearningLoading: false,
    activeLearningPending: false,
    workerBatchPending: false
};

// Toda alteração iniciada invalida uma leitura inicial ainda em voo, para que a
// resposta atrasada do GET não sobrescreva o estado confirmado pelo POST.
let activeLearningEpoch = 0;

function renderActiveLearning() {
    const enabled = visionSettingsState.activeLearning;
    document.getElementById("activeLearningState").textContent = visionSettingsState.activeLearningLoading
        ? "Estado atual: consultando..."
        : enabled === null
            ? "Estado atual: indisponível"
            : enabled ? "Estado atual: ativado" : "Estado atual: desativado";
    const blocked = !canPerform("vision:active-learning")
        || visionSettingsState.activeLearningPending
        || visionSettingsState.activeLearningLoading;
    document.getElementById("enableActiveLearning").disabled = blocked;
    document.getElementById("disableActiveLearning").disabled = blocked;
    document.getElementById("activeLearningActions").setAttribute("aria-busy",
        String(visionSettingsState.activeLearningPending || visionSettingsState.activeLearningLoading));
}

/**
 * Estado inicial do Active Learning — GET /active-learning/status → {enabled: boolean}.
 * Exige admin ou supervisor no backend, por isso a leitura não é disparada sem a
 * permissão correspondente. Resposta fora do contrato ou erro mantêm "indisponível".
 */
async function loadActiveLearning() {
    if (!canPerform("vision:active-learning")) return;

    const epoch = activeLearningEpoch;
    visionSettingsState.activeLearningLoading = true;
    renderActiveLearning();

    let result;
    try {
        result = await apiGetActiveLearning();
    } catch {
        result = { ok: false, status: -1, data: null };
    }

    visionSettingsState.activeLearningLoading = false;

    // Uma alteração começou durante a consulta: o estado dela prevalece.
    if (epoch !== activeLearningEpoch) {
        renderActiveLearning();
        return;
    }

    if (result.ok && typeof result.data?.enabled === "boolean") {
        visionSettingsState.activeLearning = result.data.enabled;
    } else {
        document.getElementById("activeLearningFeedback").textContent =
            visionError(result, "Não foi possível consultar o estado atual do Active Learning.");
    }

    renderActiveLearning();
}

/**
 * Valor atual do lote — GET /video/lote → {tamanho_lote: int}, restrito a admin.
 * HTTP 503 significa "nenhum worker ativo", um estado real do servidor; nenhum
 * caminho de erro preenche um valor padrão como se viesse do backend.
 * A ALTERAÇÃO continua bloqueada (VISION_CAPABILITIES.workerBatchUpdate).
 */
async function loadWorkerBatch() {
    if (!canPerform("vision:workers")) return;

    const state = document.getElementById("workerBatchState");
    state.textContent = "Valor atual: consultando...";

    let result;
    try {
        result = await apiGetWorkerBatch();
    } catch {
        result = { ok: false, status: -1, data: null };
    }

    const size = Number(result.data?.tamanho_lote);
    if (result.ok && Number.isSafeInteger(size) && size >= 1) {
        state.textContent = `Valor atual: ${size}`;
        document.getElementById("workerBatchSize").value = String(size);
        return;
    }

    state.textContent = result.status === 503
        ? "Valor atual: nenhum worker ativo no momento."
        : result.status === 0 || result.status === -1
            ? "Valor atual: servidor inacessível."
            : "Valor atual: indisponível";
}

function visionError(result, fallback) {
    if (result.status === 403) return "Seu perfil não possui permissão para esta ação.";
    if (result.status === 401) return "Sessão expirada. Entre novamente.";
    if (result.status === 0 || result.status === -1) return "Não foi possível conectar ao servidor. Tente novamente.";
    return fallback;
}

async function setActiveLearning(enabled) {
    if (!canPerform("vision:active-learning")
        || visionSettingsState.activeLearningPending
        || visionSettingsState.activeLearningLoading) return;
    const feedback = document.getElementById("activeLearningFeedback");
    activeLearningEpoch++;  // Descarta a leitura inicial ainda em voo, se houver.
    visionSettingsState.activeLearningPending = true;
    feedback.textContent = "Aplicando alteração...";
    renderActiveLearning();
    try {
        const result = await apiSetActiveLearning(enabled);
        if (!result.ok || result.data?.enabled !== enabled) {
            feedback.textContent = visionError(result, "Não foi possível confirmar a alteração do Active Learning. O estado anterior foi mantido na tela.");
            showToast(feedback.textContent, "danger");
            return;
        }
        visionSettingsState.activeLearning = result.data.enabled;
        feedback.textContent = "Alteração confirmada pelo servidor.";
        showToast(enabled ? "Active Learning ativado." : "Active Learning desativado.");
    } catch {
        feedback.textContent = "Não foi possível alterar o Active Learning. O estado anterior foi mantido na tela.";
        showToast(feedback.textContent, "danger");
    } finally {
        visionSettingsState.activeLearningPending = false;
        renderActiveLearning();
    }
}

async function applyWorkerBatch(event) {
    event.preventDefault();
    if (!canPerform("vision:workers") || visionSettingsState.workerBatchPending) return;
    const feedback = document.getElementById("workerBatchFeedback");
    // Defesa adicional ao botão desabilitado e ao bloqueio na API.
    if (!VISION_CAPABILITIES.workerBatchUpdate) {
        feedback.textContent = "A alteração do lote está indisponível nesta versão.";
        return;
    }
    const input = document.getElementById("workerBatchSize");
    const size = Number(input.value);
    if (!input.checkValidity() || !Number.isSafeInteger(size) || size < 1) {
        feedback.textContent = "Informe um número inteiro maior ou igual a 1.";
        return;
    }
    const button = document.getElementById("applyWorkerBatch");
    visionSettingsState.workerBatchPending = true;
    button.disabled = true;
    feedback.textContent = "Aplicando alteração...";
    try {
        const result = await apiSetWorkerBatch(size);
        if (!result.ok || result.data?.tamanho_lote !== size) {
            feedback.textContent = visionError(result, "Não foi possível confirmar a alteração do lote.");
            return;
        }
        document.getElementById("workerBatchState").textContent = `Aplicado nesta sessão: ${size}`;
        feedback.textContent = "Lote confirmado pelo servidor.";
    } catch {
        feedback.textContent = "Não foi possível alterar o lote.";
    } finally {
        visionSettingsState.workerBatchPending = false;
        button.disabled = !canPerform("vision:workers") || !VISION_CAPABILITIES.workerBatchUpdate;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
    renderActiveLearning();
    loadActiveLearning();
    loadWorkerBatch();
    document.getElementById("enableActiveLearning").addEventListener("click", () => setActiveLearning(true));
    document.getElementById("disableActiveLearning").addEventListener("click", () => setActiveLearning(false));
    document.getElementById("workerBatchForm").addEventListener("submit", applyWorkerBatch);
    const workersAvailable = canPerform("vision:workers") && VISION_CAPABILITIES.workerBatchUpdate;
    document.getElementById("workerBatchSize").disabled = !workersAvailable;
    document.getElementById("applyWorkerBatch").disabled = !workersAvailable;
    // A leitura preenche o valor atual real; o campo só aceita edição quando a
    // alteração estiver liberada, para não sugerir um Aplicar que está bloqueado.
    if (workersAvailable) document.getElementById("workerBatchAvailability").textContent = "Informe o tamanho do lote que deseja aplicar.";
    const themeSelect=document.getElementById("themeSelect");
    themeSelect.value=localStorage.getItem("visaoepi_theme")||"light";

    themeSelect.addEventListener("change",()=>{
        applyTheme(themeSelect.value);
    });

    document.getElementById("saveSettings").addEventListener("click",()=>{
        applyTheme(themeSelect.value);
        showToast("Tema salvo neste navegador.");
    });
});
