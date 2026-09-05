
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

const API_BASE_URL = "http://localhost:5000";

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
            localStorage.removeItem("visaoepi_session");
            sessionStorage.removeItem("visaoepi_session");
            window.location.href = "login.html";
            return { ok: false, status: 401, data };
        }

        return { ok: response.ok, status: response.status, data };

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
                data: { message: "Não foi possível conectar ao servidor. Verifique se o backend está em execução." }
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
 * GET com cache curto em sessionStorage (sobrevive à navegação entre páginas
 * desta app multi-page, ao contrário de uma variável JS solta). Usado para
 * chamadas repetidas entre páginas, como /cameras e /setores.
 * @param {string} path
 * @param {number} ttlMs - tempo de vida do cache, em milissegundos
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function apiGetCached(path, ttlMs) {
    const cacheKey = `visaoepi_cache:${path}`;

    try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
        if (cached && Date.now() - cached.savedAt < ttlMs) {
            return cached.result;
        }
    } catch {
        // Cache corrompido/indisponível — ignora e busca de novo
    }

    const result = await apiGet(path);

    if (result.ok) {
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), result }));
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
