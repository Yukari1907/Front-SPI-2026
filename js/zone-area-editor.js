"use strict";

// Independente da Curadoria: zonas usam canto superior esquerdo, não centro YOLO.
class ZoneAreaEditor {
    constructor() {
        this.stage = document.getElementById("zoneFrameStage");
        this.media = document.getElementById("zoneFrameMedia");
        this.overlay = document.getElementById("zoneAreaOverlay");
        this.rectangle = document.getElementById("zoneAreaRect");
        this.status = document.getElementById("zoneAreaStatus");
        this.resetButton = document.getElementById("resetZoneArea");
        this.retryButton = document.getElementById("retryZoneFrame");
        this.version = 0;
        this.busy = false;
        this.clear();
        this.resetButton.addEventListener("click", () => this.resetSelection());
        this.retryButton.addEventListener("click", () => this.load(this.cameraId));
        this.overlay.addEventListener("pointerdown", event => {
            if (!this.ready || this.busy || !event.isPrimary || event.button !== 0) return;
            event.preventDefault();
            this.resetSelection();
            this.drag = { id: event.pointerId, start: this.point(event) };
            this.overlay.setPointerCapture(event.pointerId);
        });
        this.overlay.addEventListener("pointermove", event => {
            if (this.drag?.id !== event.pointerId) return;
            this.updateRectangle(event);
        });
        this.overlay.addEventListener("pointerup", event => {
            if (this.drag?.id !== event.pointerId) return;
            this.updateRectangle(event);
            this.endDrag();
            if (!this.validSelection()) {
                this.resetSelection("Área muito pequena. Arraste para selecionar uma área maior.");
            } else {
                this.status.textContent = "Área selecionada. Você pode desenhar novamente ou redefinir.";
            }
        });
        ["pointercancel", "lostpointercapture"].forEach(type => {
            this.overlay.addEventListener(type, () => {
                if (this.drag) this.resetSelection("Seleção interrompida. Desenhe a área novamente.");
            });
        });
        this.overlay.addEventListener("dragstart", event => event.preventDefault());
    }

    endDrag() {
        const id = this.drag?.id;
        this.drag = null;
        if (id !== undefined && this.overlay.hasPointerCapture(id)) this.overlay.releasePointerCapture(id);
    }

    resetSelection(message = "Nenhuma área selecionada. Arraste sobre a imagem.") {
        this.endDrag();
        this.selection = null;
        this.rectangle.style.display = "none";
        this.resetButton.disabled = true;
        if (this.ready) this.status.textContent = message;
    }

    stopMedia() {
        ++this.version;
        clearInterval(this.sizeTimer);
        clearTimeout(this.loadTimer);
        clearTimeout(this.healthTimer);
        clearTimeout(this.healthDeadline);
        if (this.image) {
            this.image.onload = null;
            this.image.onerror = null;
            this.image.removeAttribute("src");
            this.image.remove();
            this.image = null;
        }
        this.ready = false;
        this.stage.hidden = true;
        this.resetSelection();
    }

    clear() {
        this.stopMedia();
        this.cameraId = null;
        this.retryButton.hidden = true;
        this.status.textContent = "Selecione uma câmera para carregar a imagem.";
    }

    unavailable() {
        this.stopMedia();
        this.retryButton.hidden = false;
        this.status.textContent = "Imagem indisponível. Verifique a conexão da câmera, tente novamente ou escolha outra câmera.";
    }

    load(cameraId) {
        this.clear();
        if (!Number.isInteger(cameraId)) return;
        this.cameraId = cameraId;
        const version = this.version;
        const image = new Image();
        this.image = image;
        image.id = "zoneFrame";
        image.alt = "Imagem da câmera selecionada para definir a zona";
        image.draggable = false;
        const current = () => this.version === version && this.image === image;
        this.status.textContent = "Carregando imagem da câmera…";
        let dimensions = "";
        let connected = false;
        const checkImage = () => {
            if (!current() || !image.naturalWidth || !image.naturalHeight) return;
            const nextDimensions = `${image.naturalWidth}x${image.naturalHeight}`;
            if (dimensions && dimensions !== nextDimensions) this.resetSelection();
            dimensions = nextDimensions;
            if (!connected || this.ready) return;
            this.ready = true;
            this.stage.hidden = false;
            clearTimeout(this.loadTimer);
            this.status.textContent = "Nenhuma área selecionada. Arraste sobre a imagem.";
        };
        // MJPEG pode expor dimensões antes de emitir load (a resposta é contínua).
        image.onload = checkImage;
        image.onerror = () => { if (current()) this.unavailable(); };
        this.media.appendChild(image);
        this.sizeTimer = setInterval(checkImage, 150);
        this.loadTimer = setTimeout(() => { if (current()) this.unavailable(); }, 12000);
        image.src = apiVideoUrl(cameraId);
        const checkConnection = async () => {
            this.healthDeadline = setTimeout(() => { if (current()) this.unavailable(); }, 8000);
            try {
                const result = await apiGet(`/detections/${cameraId}`);
                if (!current()) return;
                clearTimeout(this.healthDeadline);
                if (!result.ok || result.data?.connected !== true) {
                    this.unavailable();
                    return;
                }
                connected = true;
                checkImage();
            } catch {
                if (current()) this.unavailable();
                return;
            }
            if (current()) this.healthTimer = setTimeout(checkConnection, 2000);
        };
        checkConnection();
    }

    point(event) {
        // O elemento img tem o tamanho exato do frame, sem borda, padding ou crop.
        const bounds = this.image.getBoundingClientRect();
        const clamp = value => Math.max(0, Math.min(1, value));
        return { x: clamp((event.clientX - bounds.left) / bounds.width),
            y: clamp((event.clientY - bounds.top) / bounds.height) };
    }

    updateRectangle(event) {
        const end = this.point(event);
        const start = this.drag.start;
        const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
        this.selection = { x, y,
            largura: Math.min(Math.abs(end.x - start.x), 1 - x),
            altura: Math.min(Math.abs(end.y - start.y), 1 - y) };
        const { largura, altura } = this.selection;
        Object.entries({ x, y, width: largura, height: altura }).forEach(([key, value]) => {
            this.rectangle.setAttribute(key, value);
        });
        this.rectangle.style.display = "";
        this.resetButton.disabled = false;
        this.status.textContent = "Solte para confirmar a área.";
    }

    validSelection() {
        const s = this.selection;
        // 2% de cada dimensão exibida: escala com a imagem, inclusive no mobile.
        return this.ready && s && Object.values(s).every(Number.isFinite) &&
            s.x >= 0 && s.y >= 0 && s.largura >= 0.02 && s.altura >= 0.02 &&
            s.x + s.largura <= 1 && s.y + s.altura <= 1;
    }

    getSelection(cameraId) {
        return this.cameraId === cameraId && !this.drag && this.validSelection() ? { ...this.selection } : null;
    }

    setBusy(busy) {
        this.busy = busy;
        this.resetButton.disabled = busy || !this.selection;
        this.retryButton.disabled = busy;
        this.overlay.classList.toggle("is-busy", busy);
    }
}
