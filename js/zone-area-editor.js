"use strict";

// Independente da Curadoria: zonas usam canto superior esquerdo, não centro YOLO.
class ZoneAreaEditor {
    constructor() {
        this.stage = document.getElementById("zoneFrameStage");
        this.media = document.getElementById("zoneFrameMedia");
        this.overlay = document.getElementById("zoneAreaOverlay");
        this.polygon = document.getElementById("zoneAreaPolygon");
        this.pointsGroup = document.getElementById("zonePointsGroup");
        this.status = document.getElementById("zoneAreaStatus");
        this.resetButton = document.getElementById("resetZoneArea");
        this.undoButton = document.getElementById("undoZonePoint");
        this.retryButton = document.getElementById("retryZoneFrame");
        this.version = 0;
        this.busy = false;
        this.points = [];

        this.clear();

        this.resetButton.addEventListener("click", () => this.resetSelection());
        if (this.undoButton) {
            this.undoButton.addEventListener("click", () => this.undoPoint());
        }
        this.retryButton.addEventListener("click", () => this.load(this.cameraId, this.initialSelection));

        this.overlay.addEventListener("click", event => {
            if (!this.ready || this.busy || event.button !== 0) return;
            event.preventDefault();

            const pt = this.point(event);
            this.points.push([Number(pt.x.toFixed(4)), Number(pt.y.toFixed(4))]);
            this.renderPolygon();
        });

        this.overlay.addEventListener("dragstart", event => event.preventDefault());
    }

    undoPoint() {
        if (!this.points.length || this.busy) return;
        this.points.pop();
        this.renderPolygon();
    }

    resetSelection(message = "Nenhum ponto marcado. Clique sobre a imagem para iniciar o polígono.") {
        this.points = [];
        if (this.polygon) this.polygon.style.display = "none";
        if (this.pointsGroup) this.pointsGroup.innerHTML = "";
        this.resetButton.disabled = true;
        if (this.undoButton) this.undoButton.disabled = true;
        if (this.ready) this.status.textContent = message;
    }

    renderPolygon() {
        if (!this.points || this.points.length === 0) {
            if (this.polygon) {
                this.polygon.style.display = "none";
                this.polygon.removeAttribute("points");
            }
            if (this.pointsGroup) this.pointsGroup.innerHTML = "";
            if (this.resetButton) this.resetButton.disabled = true;
            return;
        }

        if (this.points.length >= 3) {
            const pointsAttr = this.points.map(p => `${p[0]},${p[1]}`).join(" ");
            this.polygon.setAttribute("points", pointsAttr);
            this.polygon.style.display = "";
        } else {
            this.polygon.style.display = "none";
            this.polygon.removeAttribute("points");
        }

        const NS = "http://www.w3.org/2000/svg";
        this.pointsGroup.innerHTML = ""; // Limpa os marcadores anteriores

        this.points.forEach(([x, y], idx) => {
            const g = document.createElementNS(NS, "g");

            const circle = document.createElementNS(NS, "circle");
            circle.setAttribute("cx", x);
            circle.setAttribute("cy", y);
            circle.setAttribute("r", "0.012");
            circle.setAttribute("fill", "#3155f5");
            circle.setAttribute("stroke", "#ffffff");
            circle.setAttribute("stroke-width", "2");
            circle.setAttribute("vector-effect", "non-scaling-stroke");

            const text = document.createElementNS(NS, "text");
            text.setAttribute("x", x);
            text.setAttribute("y", Math.max(0.02, y - 0.02));
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("font-size", "0.035");
            text.setAttribute("fill", "#ffffff");
            text.setAttribute("stroke", "#000000");
            text.setAttribute("stroke-width", "0.004");
            text.setAttribute("paint-order", "stroke fill");
            text.setAttribute("style", "pointer-events: none; user-select: none; font-family: sans-serif; font-weight: bold;");
            text.textContent = String(idx + 1);

            g.appendChild(circle);
            g.appendChild(text);
            this.pointsGroup.appendChild(g);
        });

        if (this.resetButton) this.resetButton.disabled = this.busy;

        if (this.status) {
            if (this.points.length < 3) {
                this.status.textContent = `${this.points.length} ponto(s) marcado(s). Marque pelo menos 3 pontos para formar a área.`;
            } else {
                this.status.textContent = `${this.points.length} pontos marcados. Área definida com sucesso!`;
            }
        }
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
        this.initialSelection = null;
        this.retryButton.hidden = true;
        this.status.textContent = "Selecione uma câmera para carregar a imagem.";
    }

    unavailable() {
        this.stopMedia();
        this.retryButton.hidden = false;
        this.status.textContent = "Imagem indisponível. Verifique a conexão da câmera, tente novamente ou escolha outra câmera.";
    }

    load(cameraId, initialSelection = null) {
        this.clear();
        if (!Number.isInteger(cameraId)) return;
        this.cameraId = cameraId;
        // Área já persistida (edição). Normalizada 0–1, independe da resolução.
        this.initialSelection = initialSelection;
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
            if (dimensions && dimensions !== nextDimensions) this.applyInitialSelection();
            dimensions = nextDimensions;
            if (!connected || this.ready) return;
            this.ready = true;
            this.stage.hidden = false;
            clearTimeout(this.loadTimer);
            this.applyInitialSelection();
        };

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
        return {
            x: clamp((event.clientX - bounds.left) / bounds.width),
            y: clamp((event.clientY - bounds.top) / bounds.height)
        };
    }

    applyInitialSelection() {
        this.resetSelection();
        if (!this.initialSelection) return;

        const pts = Array.isArray(this.initialSelection)
            ? this.initialSelection
            : this.initialSelection.poligono;

        if (Array.isArray(pts) && pts.length >= 3) {
            this.points = pts.map(p => [Number(p[0]), Number(p[1])]);
            this.renderPolygon();
            if (this.ready) this.status.textContent = `Área atual da zona carregada (${this.points.length} pontos). Clique para adicionar ou redefina.`;
        }
    }

    validSelection() {
        return this.ready && Array.isArray(this.points) && this.points.length >= 3 &&
            this.points.every(p => Array.isArray(p) && p.length === 2 &&
                typeof p[0] === "number" && typeof p[1] === "number" &&
                p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1);
    }

    getSelection(cameraId) {
        return this.cameraId === cameraId && this.validSelection() ? { poligono: [...this.points] } : null;
    }

    setBusy(busy) {
        this.busy = busy;
        this.resetButton.disabled = busy || !this.points.length;
        if (this.undoButton) this.undoButton.disabled = busy || !this.points.length;
        this.retryButton.disabled = busy;
        this.overlay.classList.toggle("is-busy", busy);
    }
}