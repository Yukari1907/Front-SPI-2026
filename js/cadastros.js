"use strict";

// Os cadastros são consultados sob demanda; nenhum registro local substitui o GET.
const registryState = { sectors: null, cameras: null, pending: false };
const registryElement = id => document.getElementById(id);

function setRegistryBusy(busy) {
    registryState.pending = busy;
    registryElement("registryPanel").setAttribute("aria-busy", String(busy));
    registryElement("registryPanel").querySelectorAll("button, input, select").forEach(control => { control.disabled = busy; });
    if (!busy) {
        const available = Array.isArray(registryState.sectors) && registryState.sectors.length > 0;
        registryElement("newCameraSector").disabled = !available;
        registryElement("saveNewCamera").disabled = !available;
    }
}

function resetSectorForm() {
    registryElement("sectorForm").reset();
    registryElement("sectorForm").elements.id.value = "";
    registryElement("saveSector").textContent = "Criar setor";
    registryElement("cancelSector").hidden = true;
}

function renderRegistry(kind, result) {
    const sectors = kind === "sectors";
    const list = registryElement(sectors ? "sectorsRegistry" : "camerasRegistry");
    const valid = result.ok && Array.isArray(result.data) && result.data.every(item => Number.isSafeInteger(item?.id) && item.id > 0);
    registryState[kind] = valid ? result.data : null;
    if (!valid) {
        list.textContent = result.status === 403 ? "Sem permissão para consultar este cadastro."
            : `Não foi possível carregar ${sectors ? "os setores" : "as câmeras"}. Tente carregar novamente.`;
        return;
    }
    const write = canPerform(sectors ? "sectors:manage" : "cameras:delete");
    list.innerHTML = result.data.map(item => `<div class="registry-row">
        <strong>${escapeHtml(item.nome || `${sectors ? "Setor" : "Câmera"} ${item.id}`)}</strong>
        ${write && sectors ? `<button class="btn secondary" type="button" data-sector-edit="${item.id}">Editar</button>` : ""}
        ${write ? `<button class="btn secondary" type="button" data-registry-delete="${item.id}" data-kind="${kind}">Excluir</button>` : ""}
    </div>`).join("") || `Nenhum${sectors ? " setor cadastrado" : "a câmera cadastrada"}.`;
}

async function refreshRegistries() {
    const previousSector = registryElement("newCameraSector").value;
    const [sectors, cameras] = await Promise.all([apiGet("/setores"), apiGet("/cameras")]);
    renderRegistry("sectors", sectors);
    renderRegistry("cameras", cameras);
    const options = registryState.sectors;
    registryElement("newCameraSector").innerHTML = options?.length
        ? '<option value="">Selecione um setor</option>' + options.map(item => `<option value="${item.id}">${escapeHtml(item.nome)}</option>`).join("")
        : `<option value="">${options ? "Nenhum setor cadastrado" : "Setores indisponíveis"}</option>`;
    if (options?.some(item => String(item.id) === previousSector)) registryElement("newCameraSector").value = previousSector;
    return registryState.sectors !== null && registryState.cameras !== null;
}

async function loadRegistries() {
    if (registryState.pending) return;
    setRegistryBusy(true);
    registryElement("sectorsRegistry").textContent = "Carregando setores...";
    registryElement("camerasRegistry").textContent = "Carregando câmeras...";
    registryElement("registryFeedback").textContent = "Consultando cadastros...";
    try {
        const complete = await refreshRegistries();
        registryElement("registryFeedback").textContent = complete ? "Cadastros atualizados." : "Consulta incompleta. Tente carregar novamente.";
    } finally { setRegistryBusy(false); }
}

async function mutateRegistry(permission, request, success, reset) {
    if (!canPerform(permission) || registryState.pending) return;
    setRegistryBusy(true);
    registryElement("registryFeedback").textContent = "Aplicando alteração...";
    try {
        const result = await request();
        if (!result.ok) {
            registryElement("registryFeedback").textContent = mutationError(result, "Não foi possível concluir a operação.");
            return;
        }
        reset?.();
        apiClearCached("/setores");
        apiClearCached("/cameras");
        const complete = await refreshRegistries();
        registryElement("registryFeedback").textContent = success + (complete ? "" : " A operação foi confirmada, mas a lista não pôde ser atualizada.");
        showToast(success);
    } catch {
        registryElement("registryFeedback").textContent = "Não foi possível confirmar a operação. Atualize a lista antes de tentar novamente.";
    } finally { setRegistryBusy(false); }
}

async function deleteRegistry(kind, id) {
    const sectors = kind === "sectors";
    if (!sectors && kind !== "cameras") return;
    const permission = sectors ? "sectors:manage" : "cameras:delete";
    if (!canPerform(permission) || registryState.pending) return;
    const item = registryState[kind]?.find(row => row.id === id);
    if (!item) return;
    const label = sectors ? "setor" : "câmera";
    if (!confirm(`Excluir ${label} "${item.nome || id}" (ID ${id})? Esta ação não pode ser desfeita.`)) return;
    await mutateRegistry(permission, () => apiDelete(`/${sectors ? "setores" : "cameras"}/${id}`),
        `${sectors ? "Setor excluído" : "Câmera excluída"} com sucesso.`, sectors ? resetSectorForm : null);
}

document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
    registryElement("sectorForm").hidden = !canPerform("sectors:manage");
    registryElement("cameraCreateForm").hidden = !canPerform("cameras:create");
    if (!canPerform("sectors:manage")) registryElement("registryPermission").textContent = "Consulta disponível. Seu perfil não possui permissão para gerenciar estes cadastros.";
    registryElement("loadRegistries").addEventListener("click", loadRegistries);
    registryElement("cancelSector").addEventListener("click", resetSectorForm);
    registryElement("registryPanel").addEventListener("click", event => {
        const edit = event.target.closest("[data-sector-edit]");
        if (edit && !registryState.pending && canPerform("sectors:manage")) {
            const item = registryState.sectors?.find(row => row.id === Number(edit.dataset.sectorEdit));
            if (!item) return;
            registryElement("sectorForm").elements.id.value = String(item.id);
            registryElement("sectorName").value = item.nome;
            registryElement("saveSector").textContent = "Salvar setor";
            registryElement("cancelSector").hidden = false;
            registryElement("sectorName").focus();
        }
        const remove = event.target.closest("[data-registry-delete]");
        if (remove) deleteRegistry(remove.dataset.kind, Number(remove.dataset.registryDelete));
    });
    registryElement("sectorForm").addEventListener("submit", event => {
        event.preventDefault();
        const form = event.currentTarget;
        if (registryState.pending || !form.reportValidity()) return;
        const id = Number(form.elements.id.value), nome = form.elements.nome.value.trim();
        if (!nome) return;
        mutateRegistry("sectors:manage", () => id ? apiPut(`/setores/${id}`, { nome }) : apiPost("/setores/registrar", { nome }),
            id ? "Setor atualizado." : "Setor criado.", resetSectorForm);
    });
    registryElement("cameraCreateForm").addEventListener("submit", event => {
        event.preventDefault();
        const form = event.currentTarget;
        if (registryState.pending || !form.reportValidity()) return;
        const payload = { nome: form.elements.nome.value.trim(), ip: form.elements.ip.value.trim(), id_setor: Number(form.elements.id_setor.value) };
        if (!payload.nome || !payload.ip || !registryState.sectors?.some(item => item.id === payload.id_setor)) return;
        mutateRegistry("cameras:create", () => apiPost("/cameras/registrar", payload), "Câmera criada.", () => form.reset());
    });
});
