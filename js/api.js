
"use strict";

/**
 * api.js — Camada centralizada de comunicação com o backend SPI.
 *
 * Todas as chamadas HTTP do frontend devem passar por aqui.
 * Configuração única de: URL base, credentials, Content-Type, tratamento de erros.
 *
 * URL base configurável via constante API_BASE_URL.
 * Altere conforme o ambiente (desenvolvimento/produção).
 */

const API_BASE_URL = (window.SPI_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "");

// Respostas de câmeras contêm a origem RTSP, possivelmente com senha. Nunca
// persistir esse conteúdo; o cache de câmeras dura somente nesta página.
const cameraApiCache = new Map();
const isCameraCachePath = path => /^\/cameras(?:[/?]|$)/.test(path);
try {
    Object.keys(sessionStorage).filter(key => key.startsWith("visaoepi_cache:")
        && /:\/cameras(?:[/?]|$)/.test(key)).forEach(key => sessionStorage.removeItem(key));
} catch { /* Storage indisponível: câmeras continuam apenas em memória. */ }

function clearApiSession() {
    cameraApiCache.clear();
    localStorage.removeItem("visaoepi_session");
    localStorage.removeItem("visaoepi_profile");
    sessionStorage.removeItem("visaoepi_session");
    Object.keys(sessionStorage).filter(key => key.startsWith("visaoepi_cache:")).forEach(key => sessionStorage.removeItem(key));
}

/**
 * Executa uma requisição HTTP ao backend.
 * @param {string} path - Caminho relativo (ex: '/login')
 * @param {object} options - Opções do fetch (method, body, etc.)
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function apiRequest(path, options = {}) {
    const url = `${API_BASE_URL}${path}`;

    const defaultOptions = {
        credentials: "include", // Necessário para cookies de sessão
        headers: {
            "Content-Type": "application/json"
        }
    };

    // Mescla opções: headers customizados sobrescrevem os padrões
    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {})
        }
    };

    try {
        const response = await fetch(url, mergedOptions);

        let data = null;

        // Tenta interpretar a resposta como JSON
        const contentType = response.headers.get("Content-Type") || "";
        if (contentType.includes("application/json")) {
            try {
                data = await response.json();
            } catch {
                data = null;
            }
        }

        // Sessão expirada → redireciona para login (exceto na própria rota de login)
        if (response.status === 401 && !path.includes("/login") && !path.includes("/session")) {
            clearApiSession();
            window.location.href = "login.html";
            return { ok: false, status: 401, data };
        }

        return { ok: response.ok && (response.status === 204 || data !== null), status: response.status, data };

    } catch (error) {
        // Falha de rede ou backend indisponível
        console.error(`[API] Erro ao acessar ${path}:`, error);

        const isNetworkError =
            error instanceof TypeError &&
            (error.message.includes("fetch") ||
                error.message.includes("network") ||
                error.message.includes("Failed"));

        if (isNetworkError) {
            return {
                ok: false,
                status: 0,
                data: { message: "Não foi possível conectar ao servidor. Tente novamente." }
            };
        }

        return { ok: false, status: -1, data: { message: "Erro desconhecido na comunicação com o servidor." } };
    }
}

/**
 * Requisição GET.
 * @param {string} path
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function apiGet(path) {
    return apiRequest(path, { method: "GET" });
}

/**
 * Requisição POST com body JSON.
 * @param {string} path
 * @param {object} body
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function apiPost(path, body) {
    return apiRequest(path, {
        method: "POST",
        body: JSON.stringify(body)
    });
}

/**
 * Requisição PUT com body JSON.
 * @param {string} path
 * @param {object} body
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function apiPut(path, body) {
    return apiRequest(path, {
        method: "PUT",
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
}

/**
 * Requisição DELETE.
 * @param {string} path
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function apiDelete(path) {
    return apiRequest(path, { method: "DELETE" });
}

/**
 * URL do stream de vídeo de uma câmera.
 * @param {number} cameraId
 * @returns {string}
 */
function apiVideoUrl(cameraId) {
    return `${API_BASE_URL}/video/${cameraId}`;
}

/**
 * Chave do cache de uma rota: separa por backend e por usuário validado,
 * para que um cache antigo nunca seja servido a outra sessão.
 * @param {string} path
 * @returns {string}
 */
function apiCacheKey(path) {
    const userId = typeof getSession === "function" ? getSession()?.userId : "";
    return `visaoepi_cache:${API_BASE_URL}:${userId}:${path}`;
}

/**
 * Invalida o cache de uma rota específica, após uma alteração persistida
 * no backend (ex.: PUT /cameras/{id} muda o que GET /cameras devolve).
 * @param {string} path
 */
function apiClearCached(path) {
    cameraApiCache.delete(apiCacheKey(path));
    try {
        sessionStorage.removeItem(apiCacheKey(path));
    } catch {
        // sessionStorage indisponível — não há cache a invalidar
    }
}

/**
 * GET com cache curto em sessionStorage (sobrevive à navegação entre páginas
 * desta app multi-page, ao contrário de uma variável JS solta). Usado para
 * chamadas repetidas entre páginas, como /setores. Câmeras usam somente memória,
 * pois a resposta necessária à edição pode conter credenciais na origem RTSP.
 * @param {string} path
 * @param {number} ttlMs - tempo de vida do cache, em milissegundos
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function apiGetCached(path, ttlMs) {
    const cacheKey = apiCacheKey(path);
    const memoryOnly = isCameraCachePath(path);

    try {
        const cached = memoryOnly ? cameraApiCache.get(cacheKey)
            : JSON.parse(sessionStorage.getItem(cacheKey) || "null");
        if (cached && Date.now() - cached.savedAt < ttlMs) {
            return cached.result;
        }
    } catch {
        // Cache corrompido/indisponível — ignora e busca de novo
    }

    const result = await apiGet(path);

    if (result.ok) {
        try {
            const entry = { savedAt: Date.now(), result };
            if (memoryOnly) cameraApiCache.set(cacheKey, entry);
            else sessionStorage.setItem(cacheKey, JSON.stringify(entry));
        } catch {
            // sessionStorage indisponível (modo privado, quota) — segue sem cache
        }
    }

    return result;
}

// Expõe as funções globalmente para uso em todos os módulos
window.API_BASE_URL = API_BASE_URL;
window.apiGet = apiGet;
window.apiPost = apiPost;
window.apiPut = apiPut;
window.apiDelete = apiDelete;
window.apiVideoUrl = apiVideoUrl;
window.apiGetCached = apiGetCached;
window.apiClearCached = apiClearCached;

// Bloqueio do contrato atual de POST /video/lote/{n}: a rota chama
// parar_vision_workers() e iniciar_vision_workers() sem tratamento de falha — uma
// exceção no reinício deixa a visão parada — e a resposta 200 devolve apenas
// {message}, sem `tamanho_lote`, então o frontend não consegue confirmar o valor
// aplicado. A LEITURA (GET /video/lote) é segura e está integrada.
// Liberar SOMENTE em uma entrega validada com o backend; nunca por storage/query string.
const VISION_CAPABILITIES = Object.freeze({ workerBatchUpdate: false });
window.VISION_CAPABILITIES = VISION_CAPABILITIES;

/**
 * Estado atual do Active Learning.
 * GET /active-learning/status → 200 {"enabled": boolean}. Exige admin ou supervisor.
 */
function apiGetActiveLearning() {
    return apiGet("/active-learning/status");
}

/**
 * Tamanho atual do lote de câmeras por worker.
 * GET /video/lote → 200 {"tamanho_lote": int} | 503 {"message"} quando não há
 * worker ativo. Exige admin.
 */
function apiGetWorkerBatch() {
    return apiGet("/video/lote");
}

/**
 * Quantidade de conformes e não conformes.
 * GET /estatisticas/conformes → 200 {"total_conformes": int, "total_nao_conformes": int}.
 * Exige apenas sessão ativa. Soma histórica global: a rota não aceita nenhum filtro.
 */
function apiGetComplianceCounts() {
    return apiGet("/estatisticas/conformes");
}

function apiSetActiveLearning(enabled) {
    if (typeof enabled !== "boolean") {
        return Promise.resolve({ ok: false, status: 400, data: { message: "Estado inválido." } });
    }
    return apiPost("/active-learning/toggle", { enabled });
}

function apiSetWorkerBatch(value) {
    const size = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
    if (!Number.isSafeInteger(size) || size < 1) {
        return Promise.resolve({ ok: false, status: 400, data: { message: "Informe um número inteiro maior ou igual a 1." } });
    }
    if (!VISION_CAPABILITIES.workerBatchUpdate) {
        return Promise.resolve({ ok: false, status: 0, data: { message: "A alteração do lote está indisponível nesta versão." } });
    }
    return apiPost(`/video/lote/${size}`, { tamanho_lote: size });
}

window.apiGetActiveLearning = apiGetActiveLearning;
window.apiGetWorkerBatch = apiGetWorkerBatch;
window.apiGetComplianceCounts = apiGetComplianceCounts;
window.apiSetActiveLearning = apiSetActiveLearning;
window.apiSetWorkerBatch = apiSetWorkerBatch;
