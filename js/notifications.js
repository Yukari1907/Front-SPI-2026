
"use strict";

/**
 * notifications.js — Cliente Socket.IO para alertas em tempo real.
 *
 * Backend usa flask-socketio (não WebSocket nativo), então o cliente aqui
 * precisa ser socket.io-client (carregado via CDN nas páginas autenticadas).
 * Ver CONTRATO_INTEGRACAO.md — evento "novo_alerta", payload:
 *   { id_monitorar, id_usuario, evento, severidade }
 * (sem "id" do alerta — o INSERT no backend não usa RETURNING).
 *
 * Expõe um pub/sub simples (onAlert) para outras páginas/módulos assinarem,
 * sem cada um precisar conhecer detalhes do socket.io.
 */

const NOTIFICATIONS_MAX_RECENT = 20;

let spiSocket = null;
let recentAlerts = [];
const alertListeners = [];

function notifyListeners(alerta) {
    alertListeners.forEach(cb => {
        try {
            cb(alerta);
        } catch (e) {
            console.error("[Notifications] Erro num listener de alerta:", e);
        }
    });
}

function initNotifications() {
    if (spiSocket) return spiSocket; // já inicializado

    if (typeof io !== "function") {
        // Cliente socket.io não carregou (CDN indisponível, etc.) — a página
        // continua funcionando normalmente, só sem o feed em tempo real.
        console.warn("[Notifications] socket.io-client não disponível.");
        return null;
    }

    spiSocket = io(API_BASE_URL, {
        withCredentials: true,
        transports: ["websocket", "polling"]
    });

    spiSocket.on("connect", () => {
        console.info("[Notifications] Conectado ao WebSocket.");
    });

    spiSocket.on("disconnect", () => {
        console.warn("[Notifications] Desconectado do WebSocket — reconectando automaticamente.");
    });

    spiSocket.on("connect_error", (err) => {
        console.warn("[Notifications] Erro ao conectar WebSocket:", err?.message || err);
    });

    spiSocket.on("novo_alerta", (alerta) => {
        recentAlerts = [{ ...alerta, receivedAt: new Date().toISOString() }, ...recentAlerts]
            .slice(0, NOTIFICATIONS_MAX_RECENT);

        notifyListeners(alerta);
    });

    return spiSocket;
}

/**
 * Assina novos alertas recebidos via WebSocket.
 * @param {(alerta: object) => void} callback
 */
function onAlert(callback) {
    if (typeof callback === "function") {
        alertListeners.push(callback);
    }
}

function getRecentAlerts() {
    return recentAlerts;
}

window.initNotifications = initNotifications;
window.onAlert = onAlert;
window.getRecentAlerts = getRecentAlerts;
