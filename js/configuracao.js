"use strict";

// null significa desconhecido. Uma futura leitura pode alimentar este mesmo estado.
const visionSettingsState = { activeLearning: null, activeLearningPending: false, workerBatchPending: false };

function renderActiveLearning() {
    const enabled = visionSettingsState.activeLearning;
    document.getElementById("activeLearningState").textContent = enabled === null
        ? "Estado atual: indisponível"
        : enabled ? "Ativado nesta sessão" : "Desativado nesta sessão";
    const blocked = !canPerform("vision:active-learning") || visionSettingsState.activeLearningPending;
    document.getElementById("enableActiveLearning").disabled = blocked;
    document.getElementById("disableActiveLearning").disabled = blocked;
    document.getElementById("activeLearningActions").setAttribute("aria-busy", String(visionSettingsState.activeLearningPending));
}

function visionError(result, fallback) {
    if (result.status === 403) return "Seu perfil não possui permissão para esta ação.";
    if (result.status === 401) return "Sessão expirada. Entre novamente.";
    if (result.status === 0 || result.status === -1) return "Não foi possível conectar ao servidor. Tente novamente.";
    return fallback;
}

async function setActiveLearning(enabled) {
    if (!canPerform("vision:active-learning") || visionSettingsState.activeLearningPending) return;
    const feedback = document.getElementById("activeLearningFeedback");
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
        feedback.textContent = "Alteração confirmada pelo servidor nesta sessão.";
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
        feedback.textContent = "Indisponível — aguardando atualização do servidor.";
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
    document.getElementById("enableActiveLearning").addEventListener("click", () => setActiveLearning(true));
    document.getElementById("disableActiveLearning").addEventListener("click", () => setActiveLearning(false));
    document.getElementById("workerBatchForm").addEventListener("submit", applyWorkerBatch);
    const workersAvailable = canPerform("vision:workers") && VISION_CAPABILITIES.workerBatchUpdate;
    document.getElementById("workerBatchSize").disabled = !workersAvailable;
    document.getElementById("applyWorkerBatch").disabled = !workersAvailable;
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
