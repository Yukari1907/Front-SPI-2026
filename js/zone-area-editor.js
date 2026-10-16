"use strict";

class ZoneAreaEditor {
    constructor() {
        this.stage = document.getElementById("zoneFrameStage");
        this.media = document.getElementById("zoneFrameMedia");
        this.overlay = document.getElementById("zoneAreaOverlay");
        this.polygon = document.getElementById("zoneAreaPolygon");
        this.elasticLine = document.getElementById("zoneElasticLine");
        this.closingLine = document.getElementById("zoneClosingLine");
        this.pointsGroup = document.getElementById("zonePointsGroup");
        this.status = document.getElementById("zoneAreaStatus");
        this.resetButton = document.getElementById("resetZoneArea");
        this.undoButton = document.getElementById("undoZonePoint");
        this.retryButton = document.getElementById("retryZoneFrame");
        this.allowedCheckbox = document.getElementById("zoneAllowed");

        this.version = 0;
        this.busy = false;
        this.points = [];
        this.isAllowed = false;

        this.clear();

        this.resetButton?.addEventListener("click", () => this.resetSelection());
        this.undoButton?.addEventListener("click", () => this.undoPoint());
        this.retryButton?.addEventListener("click", () => this.load(this.cameraId, this.initialSelection));

        // Reage à alteração de "Zona permitida" mudando as cores instantaneamente
        this.allowedCheckbox?.addEventListener("change", () => {
            this.setTheme(this.allowedCheckbox.checked);
        });

        // Clique para adicionar novo ponto
        this.overlay.addEventListener("click", event => {
            if (!this.ready || this.busy || event.button !== 0) return;
            event.preventDefault();

            const pt = this.point(event);
            this.points.push([Number(pt.x.toFixed(4)), Number(pt.y.toFixed(4))]);
            this.renderPolygon();
        });

        // Efeito Rubberband (linha elástica até a posição do cursor)
        this.overlay.addEventListener("mousemove", event => {
            if (!this.ready || this.busy || this.points.length === 0 || !this.elasticLine) return;
            const pt = this.point(event);
            const last = this.points[this.points.length - 1];

            this.elasticLine.setAttribute("x1", last[0]);
            this.elasticLine.setAttribute("y1", last[1]);
            this.elasticLine.setAttribute("x2", pt.x);
            this.elasticLine.setAttribute("y2", pt.y);
            this.elasticLine.style.display = "";
        });

        this.overlay.addEventListener("mouseleave", () => {
            if (this.elasticLine) this.elasticLine.style.display = "none";
        });

        this.overlay.addEventListener("dragstart", event => event.preventDefault());
    }

    setTheme(isAllowed) {
        this.isAllowed = Boolean(isAllowed);
        const color = this.isAllowed ? "#10b981" : "#ef4444";
        const themeClass = this.isAllowed ? "zone-poly-allowed" : "zone-poly-danger";

        if (this.polygon) {
            this.polygon.className.baseVal = themeClass;
        }
        if (this.elasticLine) {
            this.elasticLine.style.stroke = color;
        }
        if (this.closingLine) {
            this.closingLine.style.stroke = color;
        }
        this.renderPolygon();
    }

    undoPoint() {
        if (!this.ready || this.busy || !this.points || this.points.length === 0) return;
        this.points.pop();
        this.renderPolygon();
        if (this.undoButton) {
            this.undoButton.disabled = this.points.length === 0 || this.busy;
        }
    }

    resetSelection(message = "Nenhum ponto marcado. Clique sobre a imagem para iniciar o polígono.") {
        this.points = [];
        if (this.polygon) {
            this.polygon.style.display = "none";
            this.polygon.removeAttribute("points");
        }
        if (this.elasticLine) this.elasticLine.style.display = "none";
        if (this.closingLine) this.closingLine.style.display = "none";
        if (this.pointsGroup) this.pointsGroup.innerHTML = "";
        if (this.resetButton) this.resetButton.disabled = true;
        if (this.undoButton) this.undoButton.disabled = true;
        if (this.ready) this.status.textContent = message;
    }

    renderPolygon() {
        if (!this.points || this.points.length === 0) {
            this.resetSelection();
            return;
        }

        const color = this.isAllowed ? "#10b981" : "#ef4444";

        // Renderiza polígono preenchido
        if (this.points.length >= 3) {
            const pointsAttr = this.points.map(p => `${p[0]},${p[1]}`).join(" ");
            this.polygon.setAttribute("points", pointsAttr);
            this.polygon.style.display = "";
            if (this.closingLine) this.closingLine.style.display = "none";
        } else {
            this.polygon.style.display = "none";
            this.polygon.removeAttribute("points");

            // Exibe linha de fechamento provisória entre 1º e 2º ponto se houver 2
            if (this.points.length === 2 && this.closingLine) {
                this.closingLine.setAttribute("x1", this.points[0][0]);
                this.closingLine.setAttribute("y1", this.points[0][1]);
                this.closingLine.setAttribute("x2", this.points[1][0]);
                this.closingLine.setAttribute("y2", this.points[1][1]);
                this.closingLine.style.display = "";
            }
        }

        if (this.undoButton) {
            this.undoButton.disabled = this.points.length === 0 || this.busy;
        }

        // Renderização dos vértices estilizados
        const NS = "http://www.w3.org/2000/svg";
        this.pointsGroup.innerHTML = "";

        this.points.forEach(([x, y], idx) => {
            const isFirst = idx === 0;
            const g = document.createElementNS(NS, "g");

            // Área de clique transparente
            const hitArea = document.createElementNS(NS, "circle");
            hitArea.setAttribute("cx", x);
            hitArea.setAttribute("cy", y);
            hitArea.setAttribute("r", "0.025");
            hitArea.setAttribute("fill", "transparent");
            hitArea.style.cursor = "pointer";

            // Círculo externo
            const outer = document.createElementNS(NS, "circle");
            outer.setAttribute("cx", x);
            outer.setAttribute("cy", y);
            outer.setAttribute("r", isFirst ? "0.012" : "0.009");
            outer.setAttribute("fill", color);
            outer.setAttribute("vector-effect", "non-scaling-stroke");

            // Miolo branco nítido
            const inner = document.createElementNS(NS, "circle");
            inner.setAttribute("cx", x);
            inner.setAttribute("cy", y);
            inner.setAttribute("r", isFirst ? "0.006" : "0.0045");
            inner.setAttribute("fill", "#ffffff");
            inner.setAttribute("vector-effect", "non-scaling-stroke");

            // Badge com número do ponto
            const textBg = document.createElementNS(NS, "circle");
            const badgeY = Math.max(0.025, y - 0.032);
            textBg.setAttribute("cx", x);
            textBg.setAttribute("cy", badgeY);
            textBg.setAttribute("r", "0.012");
            textBg.setAttribute("fill", "#0f172a");
            textBg.setAttribute("stroke", color);
            textBg.setAttribute("stroke-width", "1.5px");
            textBg.setAttribute("vector-effect", "non-scaling-stroke");

            const text = document.createElementNS(NS, "text");
            text.setAttribute("x", x);
            text.setAttribute("y", badgeY + 0.004);
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("font-size", "0.014");
            text.setAttribute("fill", "#ffffff");
            text.setAttribute("style", "pointer-events: none; user-select: none; font-family: sans-serif; font-weight: bold;");
            text.textContent = String(idx + 1);

            g.appendChild(hitArea);
            g.appendChild(outer);
            g.appendChild(inner);
            g.appendChild(textBg);
            g.appendChild(text);

            this.pointsGroup.appendChild(g);
        });

        if (this.resetButton) this.resetButton.disabled = this.busy;

        if (this.status) {
            if (this.points.length < 3) {
                this.status.innerHTML = `<strong>${this.points.length} ponto(s) marcado(s).</strong> Clique na imagem para definir pelo menos 3 pontos.`;
            } else {
                this.status.innerHTML = `<span style="color:${color}">✔ <strong>${this.points.length} pontos marcados.</strong> Polígono fechado e pronto para salvar.</span>`;
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
        this.initialSelection = initialSelection;
        this.setTheme(this.allowedCheckbox?.checked || false);

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
        if (this.resetButton) this.resetButton.disabled = busy || !this.points || this.points.length === 0;
        if (this.undoButton) this.undoButton.disabled = busy || !this.points || this.points.length === 0;
        if (this.retryButton) this.retryButton.disabled = busy;
        if (this.overlay) this.overlay.classList.toggle("is-busy", busy);
    }
}