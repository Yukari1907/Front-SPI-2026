const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const front = path.resolve(__dirname, '..');
const stage = front;
const errors = [], calls = [], passed = [];
let detections = { connected: true, fps: 15, latencia_ms: 46, class_count: { sem_capacete: 1, pessoa: 2 }, detections: [{ label: 'sem_capacete', confidence: 0 }] };
let detectionStatus = 200;
let streamDimensions = [640, 360], streamStatus = 200, streamGate = null;
let monitoringZones = [];
let alertsStatus = 200;
let resolveStatus = 200;
const resolveRequests = [];
const mutations = [], zoneRequests = [];
let zonesStatus = 200, createZoneStatus = 201;
let zoneData = [
    { id: 1, nome: 'Prensa hidráulica', id_camera: 1, x: 0.1, y: 0.1, largura: 0.3, altura: 0.3, permitido: false },
    { id: 2, nome: 'Área de carga', id_camera: 1, x: 0.5, y: 0.5, largura: 0.2, altura: 0.2, permitido: true }
];
let cameraStatus = 200;
let cameras = [{ id: 1, nome: 'Entrada', id_setor: 1, status: 'Ativo' }, { id: 2, nome: 'Saída', id_setor: 1, status: 'Desconectado' }, { id: 3, status: 'Inativo' }];
const monitoringCameras = [
    { ...cameras[0], ip: 'rtsp://camera_user:camera_password@10.20.30.41:554/stream' },
    { ...cameras[1], ip: '10.20.30.42' },
    { id: 3, id_setor: null, ip: 'http://camera_user:camera_password@10.20.30.43/video' },
    { id: 4, ip: 'https://camera_user:camera_password@camera.internal/video' },
    { id: 5, id_setor: '', ip: 'rtsp://camera.internal/stream' },
    { id: 6, id_setor: 9, ip: '10.20.30.46' }
];
let cameraListData = monitoringCameras;
let cameraListStatus = 200, sectorsStatus = 200;
let sectorData = [{ id: 1, nome: 'Produção' }];
let alertData = [
    { id: 1, data: '2026-09-11 09:00:00', evento: 'capacete', severidade: 1, resolvido: false, id_camera: 1 },
    { id: 2, data: '2026-09-11 10:00:00', evento: 'luva', severidade: 3, resolvido: false, id_camera: 2 },
    { id: 3, data: '2026-09-11 11:00:00', evento: 'queda', severidade: 2, resolvido: true },
    { id: 4, data: '2026-09-11 12:00:00', evento: 'desconhecido', severidade: 9, resolvido: false }
];
const check = (name) => { passed.push(name); console.log('PASS', name); };

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.SPI_CHROMIUM_EXECUTABLE || undefined });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        await context.addInitScript(() => localStorage.setItem('visaoepi_session', JSON.stringify({ authenticated: true, role: 'Administrador', name: 'Teste' })));
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.port === '5000') {
                calls.push(url.pathname + url.search);
                if (!['GET', 'OPTIONS'].includes(route.request().method())) mutations.push(url.pathname);
                let status = 200, data;
                if (url.pathname === '/session') data = {};
                else if (url.pathname === '/cameras/status') {
                    if (cameraStatus === 0) return route.abort('failed');
                    data = cameras; status = cameraStatus;
                }
                else if (url.pathname === '/cameras') {
                    if (cameraListStatus === 0) return route.abort('failed');
                    data = cameraListData || cameras.slice(0, 2); status = cameraListStatus;
                }
                else if (url.pathname === '/setores') {
                    if (sectorsStatus === 0) return route.abort('failed');
                    data = sectorData; status = sectorsStatus;
                }
                else if (url.pathname === '/zonas') {
                    if (zonesStatus === 0) return route.abort('failed');
                    data = zoneData; status = zonesStatus;
                }
                else if (url.pathname === '/zonas/registrar') {
                    const body = route.request().postDataJSON();
                    zoneRequests.push({ method: route.request().method(), body });
                    if (createZoneStatus === 0) return route.abort('failed');
                    status = createZoneStatus;
                    data = status === 201 ? { id: zoneData.length + 1, ...body } : { error: 'Falha ao registrar a zona' };
                    if (status === 201) zoneData.push(data);
                }
                else if (url.pathname.startsWith('/zonas/')) data = monitoringZones;
                else if (url.pathname.startsWith('/detections/')) { data = detections; status = detectionStatus; }
                else if (url.pathname.startsWith('/video/')) {
                    const [width, height] = streamDimensions;
                    const status = streamStatus;
                    if (streamGate) await streamGate;
                    if (status !== 200) return route.fulfill({ status, body: '' });
                    return route.fulfill({ headers: { 'Cache-Control': 'no-store' }, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#306090"/><rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="white"/></svg>` });
                }
                else if (url.pathname.startsWith('/alertas/estatisticas')) data = [];
                else if (/\/alertas\/\d+\/resolvido/.test(url.pathname)) {
                    resolveRequests.push({ path: url.pathname, method: route.request().method(), body: route.request().postData() });
                    data = { message: resolveStatus === 200 ? 'OK' : 'Falha ao resolver alerta.' }; status = resolveStatus;
                }
                else if (url.pathname === '/alertas') {
                    if (alertsStatus === 0) return route.abort('failed');
                    data = alertData; status = alertsStatus;
                }
                else throw Error('API inesperada: ' + url.pathname);
                return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
            }
            if (url.hostname === 'cdn.socket.io') return route.fulfill({ contentType: 'application/javascript', body: 'window.socketHandlers={};window.io=()=>({on:(event,callback)=>window.socketHandlers[event]=callback});' });
            if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'application/javascript', body: 'window.Chart=class {static defaults={};constructor(){}};' });
            if (url.hostname !== 'localhost') return route.fulfill({ body: '', contentType: 'text/css' });
            const file = decodeURIComponent(url.pathname).replace(/^\//, '');
            const target = fs.existsSync(path.join(stage, file)) ? path.join(stage, file) : path.join(front, file);
            const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
            if (!fs.existsSync(target)) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ body: fs.readFileSync(target), contentType: types[path.extname(target)] || 'text/plain' });
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        const assertContrast = async locator => {
            const ratio = await locator.evaluate(el => {
                const rgb = color => color.match(/[\d.]+/g).slice(0, 3).map(Number);
                const luminance = color => rgb(color).map(value => {
                    const s = value / 255;
                    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
                }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
                let ancestor = el;
                while (ancestor.parentElement && getComputedStyle(ancestor).backgroundColor === 'rgba(0, 0, 0, 0)') ancestor = ancestor.parentElement;
                const a = luminance(getComputedStyle(el).color);
                const b = luminance(getComputedStyle(ancestor).backgroundColor);
                return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            });
            assert(ratio >= 4.5, `Contraste mínimo 4.5:1, obtido ${ratio.toFixed(2)}:1`);
        };
        await page.goto('http://localhost:8765/monitoramento.html');
        await page.waitForFunction(() => document.getElementById('performanceFps').textContent === '15.0');
        assert.match(await page.locator('#detectionsContainer').innerText(), /sem_capacete.*[\s\S]*0\.0%/);
        assert.match(await page.locator('#detectionsContainer').innerText(), /pessoa: 2/);
        assert.equal(await page.locator('#performanceFpsBar').evaluate(el => el.style.width), '50%');
        assert.equal(await page.locator('#performanceLatencyBar').evaluate(el => el.style.width), '23%');
        check('Objeto de detecções, class_count independente, confiança zero e métricas');

        const assertNoCameraConnections = async () => {
            const connectionPattern = /rtsp:\/\/|https?:\/\/|\b(?:\d{1,3}\.){3}\d{1,3}\b|camera_user|camera_password|camera\.internal/i;
            assert.doesNotMatch(await page.locator('body').innerText(), connectionPattern);
            // Inclui atributos (title/aria-label), além do texto visível dos controles.
            assert.doesNotMatch(await page.locator('#cameraList').innerHTML(), connectionPattern);
            assert.doesNotMatch(await page.locator('#cameraSelect').innerHTML(), connectionPattern);
            assert.deepEqual(await page.evaluate(() => monitoramentoCameras), monitoringCameras);
        };
        for (const camera of monitoringCameras) {
            const item = page.locator(`[data-camera-id="${camera.id}"]`);
            assert.match(await item.innerText(), new RegExp(`Câmera ${camera.id}`));
            assert.equal(await item.locator('.badge').innerText(), camera.id === 1 ? 'Conectada' : 'Não verificado');
            const sector = camera.id_setor === 1 ? 'Produção' : camera.id_setor === 9 ? 'Setor 9' : '';
            assert.equal(await item.locator('small').count(), sector ? 1 : 0);
            if (sector) assert.equal(await item.locator('small').innerText(), sector);
            assert.equal(await page.locator(`#cameraSelect option[value="${camera.id}"]`).innerText(), `Câmera ${camera.id}${sector ? ` — ${sector}` : ''}`);
        }
        await assertNoCameraConnections();
        check('Lista e dropdown preservam identificação, setor/fallback e status; omitem setor ausente e conexões sem alterar dados');

        await page.locator('[data-camera-id="2"]').click();
        await page.waitForFunction(() => document.querySelector('[data-camera-status="2"]').textContent === 'Conectada');
        assert.equal(await page.locator('#cameraSelect').inputValue(), '2');
        assert.equal(await page.evaluate(() => currentCameraId), 2);
        assert.match(await page.locator('#videoStream').getAttribute('src'), /\/video\/2$/);
        assert(calls.includes('/detections/2'));
        assert.equal(await page.locator('[data-camera-id="2"]').evaluate(el => el.style.background), 'var(--primary-soft)');
        await page.locator('#cameraSelect').selectOption('1');
        await page.waitForFunction(() => document.querySelector('[data-camera-status="1"]').textContent === 'Conectada');
        assert.equal(await page.evaluate(() => currentCameraId), 1);
        assert.match(await page.locator('#videoStream').getAttribute('src'), /\/video\/1$/);
        assert.equal(await page.locator('[data-camera-id="1"]').evaluate(el => el.style.background), 'var(--primary-soft)');
        assert.equal(await page.locator('[data-camera-id="2"]').evaluate(el => el.style.background), 'transparent');
        await assertNoCameraConnections();
        check('Clique na lista e dropdown sincronizam seleção, destaque, stream e detecções por ID');

        // Imagens estáticas do mock ficam no cache de imagens do navegador, mesmo
        // com no-store. Só no teste, diferencia cada conexão simulada ao MJPEG.
        await page.evaluate(() => {
            window.originalVideoUrl = apiVideoUrl;
            let connection = 0;
            window.apiVideoUrl = id => `${window.originalVideoUrl(id)}?fixture=${++connection}`;
        });
        const assertStreamGeometry = async dimensions => {
            await page.waitForFunction(([width, height]) => {
                const img = document.getElementById('videoStream');
                return img?.naturalWidth === width && img.naturalHeight === height;
            }, dimensions).catch(async error => {
                const actual = await page.locator('#videoStream').evaluate(img => [img.naturalWidth, img.naturalHeight, img.currentSrc]);
                throw new Error(`Dimensões esperadas ${dimensions}; recebidas ${actual}`, { cause: error });
            });
            const geometry = await page.evaluate(() => {
                const img = document.getElementById('videoStream');
                const rect = el => {
                    const { x, y, width, height } = el.getBoundingClientRect();
                    return { x, y, width, height };
                };
                return {
                    image: rect(img),
                    layers: ['videoContainer', 'streamWrapper', 'zonasOverlay'].map(id => rect(document.getElementById(id))),
                    zone: rect(document.querySelector('#zonasOverlay rect')),
                    card: rect(document.querySelector('.monitoring-grid > .card')),
                    fit: getComputedStyle(img).objectFit,
                    transform: getComputedStyle(img).transform,
                    viewport: [innerWidth, innerHeight], scrollWidth: document.documentElement.scrollWidth
                };
            });
            const { image, layers, zone, card, viewport } = geometry;
            const close = (actual, expected) => assert(Math.abs(actual - expected) < 1, `${actual} ≈ ${expected}`);
            assert(image.width > 0 && image.height > 0);
            close(image.width, image.height * dimensions[0] / dimensions[1]);
            for (const layer of layers) for (const key of ['x', 'y', 'width', 'height']) close(layer[key], image[key]);
            close(image.x + image.width / 2, card.x + card.width / 2);
            close(zone.x, image.x + image.width * 0.1);
            close(zone.y, image.y + image.height * 0.1);
            close(zone.width, image.width * 0.3);
            close(zone.height, image.height * 0.3);
            assert(image.x >= card.x && image.x + image.width <= card.x + card.width);
            assert(image.height <= viewport[1] * 0.75 + 1);
            assert(image.width <= dimensions[0] + 1 && image.height <= dimensions[1] + 1);
            assert(geometry.scrollWidth <= viewport[0]);
            assert.equal(geometry.fit, 'contain');
            assert.equal(geometry.transform, 'none');
        };
        monitoringZones = [zoneData[0]];
        for (const width of [1440, 768, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 700 : 1000 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
                for (const dimensions of [[1920, 1080], [1080, 1920], [1280, 720], [720, 1280], [640, 480], [1000, 1000], [853, 479]]) {
                    streamDimensions = dimensions;
                    const cameraId = await page.locator('#cameraSelect').inputValue() === '1' ? '2' : '1';
                    await page.locator('#cameraSelect').selectOption(cameraId);
                    await page.waitForFunction(id => document.querySelector(`[data-camera-status="${id}"]`).textContent === 'Conectada', cameraId);
                    await page.waitForSelector('#zonasOverlay rect', { state: 'attached' });
                    await assertStreamGeometry(dimensions);
                    assert.equal(await page.evaluate(() => String(currentCameraId)), cameraId);
                    assert.match(await page.locator('#videoStream').getAttribute('src'), new RegExp(`/video/${cameraId}\\?fixture=\\d+$`));
                    await assertNoCameraConnections();
                }
                streamStatus = 503;
                await page.evaluate(() => renderVideoStream(currentCameraId));
                await page.waitForSelector('#videoContainer .stream-placeholder');
                assert.match(await page.locator('#videoContainer').innerText(), /Stream de vídeo indisponível/);
                assert.equal(await page.locator('#zonasOverlay').count(), 0);
                assert(await page.locator('#videoContainer').evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth
                        && rect.height <= innerHeight && document.documentElement.scrollWidth <= innerWidth;
                }));
                await assertContrast(page.locator('#videoContainer .stream-placeholder'));
                streamStatus = 200;
                check(`Frames completos, zonas alinhadas, trocas de orientação e indisponibilidade em ${width}px (${theme})`);
            }
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        streamDimensions = [1080, 1920];
        let releaseStream;
        streamGate = new Promise(resolve => { releaseStream = resolve; });
        await page.evaluate(() => renderVideoStream(currentCameraId));
        assert.equal(await page.locator('#videoStream').evaluate(img => img.naturalWidth), 0);
        assert.equal(await page.locator('#videoStream').evaluate(img => getComputedStyle(img).aspectRatio), 'auto');
        assert.equal(await page.locator('#videoContainer').evaluate(el => getComputedStyle(el).aspectRatio), 'auto');
        releaseStream(); streamGate = null;
        await page.waitForSelector('#zonasOverlay rect', { state: 'attached' });
        await assertStreamGeometry(streamDimensions);
        for (const viewport of [{ width: 390, height: 700 }, { width: 768, height: 500 }, { width: 1440, height: 1000 }]) {
            await page.setViewportSize(viewport);
            await assertStreamGeometry(streamDimensions);
        }
        check('Carregamento sem proporção fictícia, recuperação e resize sem recarregar o stream');

        await page.evaluate(async () => {
            const original = apiGet;
            const oldImage = document.getElementById('videoStream');
            let resolve;
            window.apiGet = () => new Promise(done => { resolve = done; });
            const oldZones = fetchZonas(currentCameraId);
            window.apiGet = original;
            selectCamera(currentCameraId === 1 ? 2 : 1);
            selectCamera(currentCameraId === 1 ? 2 : 1);
            handleStreamError(oldImage);
            resolve({ ok: true, data: [{ id: 999, nome: 'Zona antiga', x: 0, y: 0, largura: 1, altura: 1 }] });
            await oldZones;
        });
        await page.waitForSelector('#zonasOverlay rect', { state: 'attached' });
        await assertStreamGeometry(streamDimensions);
        assert.equal(await page.locator('#zonasOverlay [data-id="999"]').count(), 0);
        assert.equal(await page.locator('#zonasOverlay [data-id="1"]').count(), 1);
        check('Erro de imagem e zonas atrasadas ignorados após troca rápida A → B → A');
        monitoringZones = [];
        streamDimensions = [640, 360];
        await page.evaluate(() => { window.apiVideoUrl = window.originalVideoUrl; delete window.originalVideoUrl; });
        await page.locator('#cameraSelect').selectOption('1');

        await page.evaluate(() => renderDetectionState({ connected: true, detections: [], class_count: { pessoa: 1 }, fps: 90, latencia_ms: 800 }));
        assert.equal(await page.locator('#performanceFpsBar').evaluate(el => el.style.width), '100%');
        assert.equal(await page.locator('#performanceLatencyBar').evaluate(el => el.style.width), '100%');
        assert.match(await page.locator('#detectionsContainer').innerText(), /pessoa: 1[\s\S]*Nenhuma detecção recente/);
        await page.evaluate(() => renderDetectionState({ connected: true, detections: [], class_count: {}, fps: 0, latencia_ms: null }));
        assert.equal(await page.locator('#performanceLatency').innerText(), '—');
        assert.equal(await page.locator('#performanceLatencyBar').evaluate(el => el.style.width), '0%');
        check('Limites das barras, captura sem resultado e latência null');

        detections = { connected: false, detections: [], class_count: {}, fps: 0, latencia_ms: null };
        await page.evaluate(() => fetchDetections(1));
        assert.equal(await page.locator('#cameraConnectionStatus').innerText(), 'Desconectada');
        assert.equal(await page.locator('[data-camera-status="1"]').innerText(), 'Desconectada');
        assert.equal(await page.locator('[data-camera-status="1"]').getAttribute('class'), 'badge');
        assert.doesNotMatch(await page.locator('#detectionsContainer').innerText(), /sem_capacete/);
        detectionStatus = 503;
        await page.evaluate(() => fetchDetections(1));
        assert.equal(await page.locator('#performanceFps').innerText(), '—');
        assert.equal(await page.locator('[data-camera-status="1"]').innerText(), 'Detecções indisponíveis.');
        await page.evaluate(async () => {
            const original = apiGet;
            window.apiGet = async () => ({ ok: false, status: 0, data: null });
            await fetchDetections(1);
            window.apiGet = original;
        });
        assert.equal(await page.locator('#performanceLatencyBar').evaluate(el => el.style.width), '0%');
        detectionStatus = 200;
        detections = { connected: true, fps: 20, latencia_ms: 30, detections: [], class_count: {} };
        await page.waitForFunction(() => document.getElementById('performanceFps').textContent === '20.0', { timeout: 6000 });
        assert.equal(await page.locator('[data-camera-status="1"]').innerText(), 'Conectada');
        assert.equal(await page.locator('[data-camera-status="1"]').getAttribute('class'), 'badge success');
        await assertNoCameraConnections();
        check('Desconexão, HTTP 503 e falha de rede limpam dados; polling recupera automaticamente');

        await page.evaluate(async () => {
            stopDetectionsPolling();
            const original = apiGet;
            let resolve;
            window.apiGet = () => new Promise(done => { resolve = done; });
            const old = fetchDetections(1);
            currentCameraId = 2;
            renderDetectionState(null, 'Consultando câmera...');
            resolve({ ok: true, data: { connected: true, fps: 99, latencia_ms: 1, detections: [], class_count: {} } });
            await old;
            window.apiGet = original;
        });
        assert.equal(await page.locator('#performanceFps').innerText(), '—');
        assert.equal(await page.locator('[data-camera-status="2"]').innerText(), 'Consultando câmera...');
        check('Resposta atrasada da câmera anterior é ignorada');

        for (const width of [1440, 768, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
                for (const item of await page.locator('.camera-list-item').all()) {
                    await item.scrollIntoViewIfNeeded();
                    assert(await item.evaluate(el => {
                        const rect = el.getBoundingClientRect();
                        const children = [...el.children].map(child => child.getBoundingClientRect());
                        return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth
                            && el.scrollWidth <= el.clientWidth
                            && children.every(child => child.left >= rect.left && child.right <= rect.right)
                            && (children[0].right <= children[1].left || children[0].bottom <= children[1].top);
                    }), `Lista sem transbordamento ou sobreposição em ${width}px (${theme})`);
                }
                await assertNoCameraConnections();
                await assertContrast(page.locator('[data-camera-id="2"] > span').first());
                await assertContrast(page.locator('[data-camera-id="2"] small'));
            }
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        check('Lista alinhada em desktop, tablet e celular, nos temas claro e escuro');

        await page.evaluate(() => window.socketHandlers.novo_alerta({ evento: 'Possível queda', severidade: 3, tipo_deteccao: 'queda', id_camera: 2, id_zona: null, nome_camera: '<img src=x onerror=alert(1)>', nome_setor: 'Produção', nome_zona: null }));
        assert.match(await page.locator('#notificationList').innerText(), /Possível queda.*<img.*Produção/);
        assert.equal(await page.locator('#notificationList img').count(), 0);
        assert.match(await page.locator('#toastContainer').innerText(), /Produção/);
        assert.equal(await page.evaluate(() => formatAlertNotification({ evento: 'Alerta', id_camera: 2 })), 'Alerta — Câmera 2');
        assert.equal(await page.evaluate(() => formatAlertNotification({ evento: 'Alerta' })), 'Alerta');
        check('Notificação de queda sem zona, fallback e escape de HTML em nomes');

        const persistedAlerts = structuredClone(alertData);
        const mutationsBeforeClear = mutations.length;
        await page.locator('#notificationButton').click();
        assert.equal(await page.locator('#clearNotificationsButton').innerText(), 'Limpar');
        await page.evaluate(() => {
            window.clearCalls = 0;
            const original = clearRecentAlerts;
            window.clearRecentAlerts = () => { window.clearCalls++; original(); };
            ensureNotificationClearButton();
            for (let index = 0; index < 25; index++) window.socketHandlers.novo_alerta({ evento: `Recente ${index}`, severidade: 3 });
        });
        assert.equal(await page.locator('#clearNotificationsButton').count(), 1);
        assert.equal(await page.locator('#notificationCount').innerText(), '20');
        for (const theme of ['light', 'dark']) {
            await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
            await page.mouse.move(0, 0);
            await page.waitForTimeout(250);
            await assertContrast(page.locator('#clearNotificationsButton'));
            await page.locator('#clearNotificationsButton').hover();
            await page.waitForTimeout(250);
            await assertContrast(page.locator('#clearNotificationsButton'));
        }
        await page.locator('#clearNotificationsButton').click();
        assert.equal(await page.evaluate(() => window.clearCalls), 1);
        assert.equal(await page.evaluate(() => getRecentAlerts().length), 0);
        assert.equal(await page.locator('#notificationCount').innerText(), '0');
        assert.match(await page.locator('#notificationList').innerText(), /Nenhuma notificação recente/);
        assert(await page.locator('#notificationPanel').isVisible());
        await page.locator('#clearNotificationsButton').click();
        await page.evaluate(() => window.socketHandlers.novo_alerta({ evento: 'Alerta após limpar', severidade: 2 }));
        assert.equal(await page.locator('#notificationCount').innerText(), '1');
        assert.match(await page.locator('#notificationList').innerText(), /Alerta após limpar/);
        assert.equal(mutations.length, mutationsBeforeClear);
        assert.deepEqual(alertData, persistedAlerts);
        check('Limpar chama clearRecentAlerts, atualiza painel/contador sem escrita na API, mantém Socket.IO e contraste nos dois temas');

        const notificationPages = fs.readdirSync(front).filter(file => file.endsWith('.html') && fs.readFileSync(path.join(front, file), 'utf8').includes('id="notificationPanel"'));
        assert(notificationPages.length >= 4);
        for (const file of notificationPages) {
            const html = fs.readFileSync(path.join(front, file), 'utf8');
            assert.match(html, /id="notificationPanel"[^>]*>\s*<div class="section-title">/);
            for (const id of ['notificationButton', 'notificationList', 'notificationCount']) assert(html.includes(`id="${id}"`), `${file}: ${id}`);
            for (const src of ['css/components.css', 'js/common.js', 'js/notifications.js', 'socket.io.min.js']) assert(html.includes(src), `${file}: ${src}`);
            assert(html.indexOf('js/notifications.js') < html.indexOf('js/common.js'));
        }
        check(`Estrutura e scripts do painel confirmados nas ${notificationPages.length} páginas de notificações`);

        cameraListData = null;
        await page.goto('http://localhost:8765/alertas.html');
        await page.waitForFunction(() => document.getElementById('alertsCritical').textContent === '1');
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['1', '1', '1', '1']);
        await page.locator('#alertSeverity').selectOption('Crítico');
        assert.match(await page.locator('#alertsTable').innerText(), /luva[\s\S]*Crítico/);
        assert.doesNotMatch(await page.locator('#alertsTable').innerText(), /capacete/);
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['1', '1', '1', '1']);
        await page.locator('#alertsTable button').click();
        await page.locator('#resolveAlertButton').click();
        await page.waitForFunction(() => document.getElementById('alertsResolved').textContent === '2');
        assert(await page.locator('#alertsPrevious').isDisabled());
        assert(await page.locator('#alertsNext').isDisabled());
        check('Severidade numérica, filtro, contagem global, resolução e navegação de página única');

        alertsStatus = 404;
        await page.evaluate(() => loadAlertsFromApi());
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['0', '0', '0', '0']);
        alertsStatus = 500;
        await page.evaluate(() => loadAlertsFromApi());
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['—', '—', '—', '—']);
        check('404 de alertas vira vazio; erro de API não vira contagem zero');

        const originalAlertData = alertData;
        const makeAlerts = count => Array.from({ length: count }, (_, index) => ({
            id: index + 1,
            data: '2026-09-11 09:00:00',
            evento: `Ocorrência ${index + 1}`,
            severidade: index % 3 + 1,
            resolvido: false,
            id_camera: index + 1,
            id_zona: index + 1,
            id_usuario: index + 1
        }));
        const alertsCalls = () => calls.filter(url => url === '/alertas').length;
        const assertAlertPage = async (expected, range, previousDisabled, nextDisabled) => {
            assert.equal(await page.locator('#alertsRange').innerText(), range);
            assert.equal(await page.locator('#alertsPrevious').isDisabled(), previousDisabled);
            assert.equal(await page.locator('#alertsNext').isDisabled(), nextDisabled);
            assert.equal(await page.locator('#alertsTable button').count(), expected.length);
            assert.deepEqual(await page.locator('#alertsTable tr:has(button) td:nth-child(4)').allTextContents(), expected.map(alert => alert.evento));
        };
        const resetAlertFilters = async () => {
            await page.locator('#alertSearch').fill('');
            await page.locator('#alertSeverity').selectOption('');
            await page.locator('#alertStatus').selectOption('');
        };

        alertsStatus = 200;
        const savedLocations = { zones: zoneData, cameras: cameraListData, sectors: sectorData };
        zoneData = [
            { id: 1, nome: 'Zona 1', id_camera: 1 },
            { id: 2, nome: 'Área de inspeção', id_camera: 2 },
            { id: 3, nome: null, id_camera: 3 },
            { id: 4, nome: 'Zona sem câmera', id_camera: 404 },
            { id: 5, nome: '   ', id_camera: 5 },
            { id: 6, nome: '<img src=x onerror=alert(1)>', id_camera: 6 }
        ];
        cameraListData = [
            { id: 1, nome: 'Entrada', id_setor: 7 },
            { id: 2, nome: 'Inspeção', id_setor: 8 },
            { id: 3, nome: null, id_setor: 9 },
            { id: 5, nome: 'Câmera sem setor', id_setor: 404 },
            { id: 6, nome: 'Saída', id_setor: 10 }
        ];
        sectorData = [
            { id: 7, nome: 'Produção' }, { id: 8, nome: 'Inspeção final' },
            { id: 9, nome: null }, { id: 10, nome: '<b>Setor cadastrado</b>' }
        ];
        alertData = makeAlerts(8).map((alert, index) => ({
            ...alert,
            id_zona: index === 6 ? null : index === 7 ? 404 : index + 1,
            id_camera: index === 1 ? null : index === 6 ? 1 : index === 7 ? 404 : index + 1
        }));
        await resetAlertFilters();
        await page.evaluate(() => loadAlertsFromApi());
        assert.deepEqual(await page.locator('.table-wrap th').allTextContents(), ['Data/Hora', 'Setor', 'Zona', 'Evento', 'Severidade', 'Status', 'Ação']);
        const locationCells = () => page.locator('#alertsTable tr:has(button)').evaluateAll(rows => rows.map(row => [row.cells[1].textContent, row.cells[2].textContent]));
        assert.deepEqual(await locationCells(), [
            ['Produção', 'Zona 1'], ['Inspeção final', 'Área de inspeção'],
            ['—', '—'], ['—', 'Zona sem câmera'], ['—', '—'],
            ['<b>Setor cadastrado</b>', '<img src=x onerror=alert(1)>'], ['Produção', '—'], ['—', '—']
        ]);
        assert.equal(await page.locator('#alertsTable img, #alertsTable b').count(), 0);
        await page.locator('#alertsTable button').first().click();
        assert.equal(await page.locator('#alertDetailSector').innerText(), 'Produção');
        assert.equal(await page.locator('#alertDetailZone').innerText(), 'Zona 1');
        assert.equal(await page.locator('#alertDetailCamera').innerText(), 'Entrada');
        await page.locator('#closeAlertDetailsModal').click();
        check('Setor/Zona separados, vínculos zona→câmera→setor e câmera→setor, nomes reais no modal, ausências neutras e escape de HTML');

        for (const [term, ids] of [['producao', [1, 7]], ['zona 1', [1]], ['area de inspecao', [2]], ['zona 404', []], ['setor 404', []], ['—', []]]) {
            await page.locator('#alertSearch').fill(term);
            await assertAlertPage(alertData.filter(alert => ids.includes(alert.id)), ids.length ? `1–${ids.length} de ${ids.length}` : '0 de 0', true, true);
        }
        await resetAlertFilters();
        const locationCounts = await page.locator('.kpi strong').allTextContents();
        for (const status of [500, 0, 404]) {
            sectorsStatus = status;
            await page.evaluate(() => loadAlertsFromApi());
            assert((await locationCells()).every(([sector]) => sector === '—'));
            assert.equal((await locationCells())[0][1], 'Zona 1');
            await assertAlertPage(alertData, '1–8 de 8', true, true);
            assert.deepEqual(await page.locator('.kpi strong').allTextContents(), locationCounts);
        }
        sectorsStatus = 200;
        const realSectors = sectorData;
        for (const invalid of [[], {}, [null], [{ id: 7, nome: '   ' }]]) {
            sectorData = invalid;
            await page.evaluate(() => loadAlertsFromApi());
            assert((await locationCells()).every(([sector]) => sector === '—'));
        }
        sectorData = realSectors;
        for (const status of [500, 0]) {
            cameraListStatus = status;
            await page.evaluate(() => loadAlertsFromApi());
            assert((await locationCells()).every(([sector]) => sector === '—'));
            assert.equal((await locationCells())[0][1], 'Zona 1');
            cameraListStatus = 200;
            zonesStatus = status;
            await page.evaluate(() => loadAlertsFromApi());
            assert((await locationCells()).every(([, zone]) => zone === '—'));
            assert.equal((await locationCells())[0][0], 'Produção');
            assert.equal((await locationCells())[1][0], '—');
            zonesStatus = 200;
        }
        await page.evaluate(() => loadAlertsFromApi());
        assert.deepEqual((await locationCells())[0], ['Produção', 'Zona 1']);
        check('Busca somente por nomes existentes; falhas parciais, cadastro inválido/vazio e recuperação preservam alertas e cards');
        zoneData = savedLocations.zones;
        cameraListData = savedLocations.cameras;
        sectorData = savedLocations.sectors;

        for (const count of [0, 1, 49, 50, 51, 100, 101, 120]) {
            alertData = makeAlerts(count);
            await resetAlertFilters();
            await page.evaluate(() => loadAlertsFromApi());
            const loadedCalls = calls.length;
            await assertAlertPage(alertData.slice(0, 50), count ? `1–${Math.min(50, count)} de ${count}` : '0 de 0', true, count <= 50);
            await page.locator('#alertsPrevious').dispatchEvent('click');
            assert.equal(await page.evaluate(() => currentPage), 1);
            if (!count) assert.match(await page.locator('#alertsTable').innerText(), /Nenhum alerta encontrado/);
            const seenEvents = await page.locator('#alertsTable tr:has(button) td:nth-child(4)').allTextContents();
            for (let start = 50; start < count; start += 50) {
                await page.locator('#alertsNext').click();
                const end = Math.min(start + 50, count);
                await assertAlertPage(alertData.slice(start, end), `${start + 1}–${end} de ${count}`, false, end === count);
                seenEvents.push(...await page.locator('#alertsTable tr:has(button) td:nth-child(4)').allTextContents());
            }
            assert.deepEqual(seenEvents, alertData.map(alert => alert.evento));
            const lastPage = Math.max(1, Math.ceil(count / 50));
            await page.locator('#alertsNext').dispatchEvent('click');
            assert.equal(await page.evaluate(() => currentPage), lastPage);
            for (let number = lastPage - 1; number >= 1; number--) {
                await page.locator('#alertsPrevious').click();
                const start = (number - 1) * 50;
                await assertAlertPage(alertData.slice(start, start + 50), `${start + 1}–${start + 50} de ${count}`, number === 1, false);
            }
            assert.equal(calls.length, loadedCalls);
            check(`Paginação com ${count} alertas: intervalos, limites, ordem, ida/volta e nenhuma consulta adicional`);
        }

        alertData = makeAlerts(120).map((alert, index) => ({
            ...alert, severidade: index < 73 ? 3 : index < 90 ? 2 : 1, resolvido: index >= 103
        }));
        zoneData = [...savedLocations.zones, { id: 120, nome: 'Expedição de peças', id_camera: 120 }];
        cameraListData = [...cameras, { id: 120, nome: 'Portão leste', id_setor: 120 }];
        sectorData = [...savedLocations.sectors, { id: 120, nome: 'Logística' }];
        await page.evaluate(() => loadAlertsFromApi());
        const filterCalls = alertsCalls();
        await page.locator('#alertsNext').click();
        await page.locator('#alertsNext').click();
        await page.locator('#alertSeverity').selectOption('Crítico');
        await assertAlertPage(alertData.slice(0, 50), '1–50 de 73', true, false);
        await page.locator('#alertsNext').click();
        await assertAlertPage(alertData.slice(50, 73), '51–73 de 73', false, true);
        await page.locator('#alertSeverity').selectOption('Médio');
        await assertAlertPage(alertData.slice(73, 90), '1–17 de 17', true, true);
        await page.locator('#alertSeverity').selectOption('');
        await page.locator('#alertsNext').click();
        await page.locator('#alertStatus').selectOption('Resolvido');
        await assertAlertPage(alertData.slice(103), '1–17 de 17', true, true);
        await page.locator('#alertStatus').selectOption('Em análise');
        await assertAlertPage([], '0 de 0', true, true);
        assert.match(await page.locator('#alertsTable').innerText(), /Nenhum alerta encontrado com os filtros selecionados/);
        await page.locator('#alertStatus').selectOption('');
        // Os nomes cadastrados pertencem a um registro fora da primeira página.
        for (const term of ['  OCORRENCIA 120 ', 'expedicao de pecas', 'logistica', 'portao leste', 'usuario 120']) {
            await page.locator('#alertSearch').fill('');
            await page.locator('#alertsNext').click();
            await page.locator('#alertSearch').fill(term);
            await assertAlertPage(alertData.slice(119), '1–1 de 1', true, true);
        }
        await page.locator('#alertStatus').selectOption('Resolvido');
        await page.locator('#alertSeverity').selectOption('Baixo');
        await assertAlertPage(alertData.slice(119), '1–1 de 1', true, true);
        await page.locator('#alertSearch').fill('sem correspondência');
        await assertAlertPage([], '0 de 0', true, true);
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['73', '17', '30', '17']);
        assert.equal(alertsCalls(), filterCalls);
        check('Todos os filtros reiniciam na página 1; busca global à coleção, normalização, combinação e cards preservados');
        zoneData = savedLocations.zones;
        cameraListData = savedLocations.cameras;
        sectorData = savedLocations.sectors;

        await resetAlertFilters();
        alertData = makeAlerts(101);
        await page.evaluate(() => loadAlertsFromApi());
        await page.locator('#alertStatus').selectOption('Pendente');
        await page.locator('#alertsNext').click();
        await page.locator('#alertsNext').click();
        const resolutionCalls = alertsCalls();
        await page.locator('#alertsTable button').click();
        resolveStatus = 400;
        await page.locator('#resolveAlertButton').click();
        await page.waitForFunction(() => document.getElementById('toastContainer').textContent.includes('Falha ao resolver alerta.'));
        await assertAlertPage(alertData.slice(100), '101–101 de 101', false, true);
        assert.equal(await page.locator('#alertsResolved').innerText(), '0');
        resolveStatus = 200;
        await page.locator('#resolveAlertButton').click();
        await page.waitForFunction(() => document.getElementById('alertsResolved').textContent === '1');
        await assertAlertPage(alertData.slice(50, 100), '51–100 de 100', false, true);
        assert.deepEqual(resolveRequests.at(-1), { path: '/alertas/101/resolvido', method: 'PUT', body: null });
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['33', '34', '34', '1']);
        await page.locator('#alertsTable button').last().click();
        await page.locator('#resolveAlertButton').click();
        await page.waitForFunction(() => document.getElementById('alertsResolved').textContent === '2');
        await assertAlertPage(alertData.slice(50, 99), '51–99 de 99', false, true);
        await page.locator('#alertStatus').selectOption('');
        await page.locator('#alertsNext').click();
        await page.locator('#alertsTable button').first().click();
        await page.locator('#resolveAlertButton').click();
        await page.waitForFunction(() => document.getElementById('alertsResolved').textContent === '3');
        await assertAlertPage(alertData.slice(50, 100), '51–100 de 101', false, false);
        assert.match(await page.locator('#alertsTable tr').first().innerText(), /Crítico[\s\S]*Resolvido/);
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['33', '34', '34', '3']);
        assert.equal(alertsCalls(), resolutionCalls);
        check('Resolução mantém PUT/severidade, preserva página válida, recua da página extinta e não altera estado em falha');

        alertData = makeAlerts(1);
        await page.locator('#alertStatus').selectOption('Pendente');
        await page.evaluate(() => loadAlertsFromApi());
        await page.locator('#alertsTable button').click();
        await page.locator('#resolveAlertButton').click();
        await page.waitForFunction(() => document.getElementById('alertsResolved').textContent === '1');
        await assertAlertPage([], '0 de 0', true, true);
        assert.equal(await page.evaluate(() => currentPage), 1);
        check('Resolução do último resultado filtrado apresenta vazio coerente');

        await resetAlertFilters();
        for (const [status, data, range] of [[404, { message: 'Nenhum alerta' }, '0 de 0'], [500, {}, '—'], [0, [], '—'], [200, {}, '—'], [200, [], '0 de 0']]) {
            alertsStatus = status;
            alertData = data;
            await page.evaluate(() => loadAlertsFromApi());
            await assertAlertPage([], range, true, true);
            assert.deepEqual(await page.locator('.kpi strong').allTextContents(), Array(4).fill(range === '—' ? '—' : '0'));
            assert.match(await page.locator('#alertsTable').innerText(), range === '—' ? /Não foi possível carregar/ : /Nenhum alerta encontrado/);
            assert.equal(await page.locator('#alertsTable td').getAttribute('colspan'), '7');
        }
        check('Paginação distingue 404/lista vazia, HTTP 500, falha de rede e resposta inválida');

        alertData = makeAlerts(120);
        await page.evaluate(() => loadAlertsFromApi());
        await assertAlertPage(alertData.slice(0, 50), '1–50 de 120', true, false);
        for (const width of [1440, 768, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
                await page.mouse.move(0, 0);
                await page.waitForTimeout(250);
                for (const selector of ['.table-wrap th:nth-child(2)', '.table-wrap th:nth-child(3)', '#alertsTable tr:first-child td:nth-child(2)', '#alertsTable tr:first-child td:nth-child(3)']) {
                    await assertContrast(page.locator(selector));
                }
                assert(await page.locator('.table-wrap').evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.left >= 0 && rect.right <= innerWidth && el.clientWidth > 0
                        && document.documentElement.scrollWidth <= innerWidth
                        && getComputedStyle(el).overflowX === 'auto';
                }));
                await page.locator('#alertsTable button').first().scrollIntoViewIfNeeded();
                await page.locator('#alertsTable button').first().click();
                assert(await page.locator('#alertDetailsModal').isVisible());
                await page.locator('#closeAlertDetailsModal').click();
                await page.locator('#alertsRange').scrollIntoViewIfNeeded();
                for (const selector of ['#alertsRange', '#alertsPrevious', '#alertsNext']) {
                    const rect = await page.locator(selector).boundingBox();
                    assert(rect && rect.width > 0 && rect.x >= 0 && rect.x + rect.width <= width);
                }
                await page.locator('#alertsNext').click();
                await assertAlertPage(alertData.slice(50, 100), '51–100 de 120', false, false);
                await page.locator('#alertsPrevious').click();
            }
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.waitForFunction(() => !!window.socketHandlers.novo_alerta);
        await page.evaluate(() => window.socketHandlers.novo_alerta({ evento: 'Alerta durante paginação', severidade: 3, id_camera: 1 }));
        assert.match(await page.locator('#notificationList').innerText(), /Alerta durante paginação/);
        await assertAlertPage(alertData.slice(0, 50), '1–50 de 120', true, false);
        check('Recuperação após erro, controles nos dois temas e três larguras, e notificações Socket.IO preservadas');

        alertData = originalAlertData;
        alertsStatus = 200;
        await page.goto('http://localhost:8765/dashboard.html');
        await page.waitForFunction(() => document.getElementById('dashboardCamerasOnline').textContent === '1/3');
        assert.match(await page.locator('#dashboardEvents').innerText(), /Não informada[\s\S]*Médio[\s\S]*Crítico/);
        assert.equal(await page.locator('#dashboardEvents .badge.danger').innerText(), 'Crítico');
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['—', '—', '—', '1/3']);
        cameras = [];
        await page.evaluate(() => loadDashboardKpis());
        assert.equal(await page.locator('#dashboardCamerasOnline').innerText(), '0/0');
        cameraStatus = 500;
        await page.evaluate(() => loadDashboardKpis());
        assert.equal(await page.locator('#dashboardCamerasOnline').innerText(), '—');
        check('Dashboard: severidade, ordenação recente, online/total, vazio e erro');

        cameras = [{ id: 1, id_setor: 1, ip: 'local', status: 'Ativo' }];
        cameraStatus = 200;
        await page.evaluate(() => sessionStorage.clear());
        await page.goto('http://localhost:8765/mapeamento.html');
        await page.waitForFunction(() => document.getElementById('mapCamerasOnline').textContent === '1 câmera online');
        await page.waitForFunction(() => document.getElementById('riskZonesList').textContent.includes('Prensa hidráulica'));
        assert.equal(await page.locator('#factoryMap > button').count(), 1);
        assert.equal(await page.locator('#factoryMap > button').getAttribute('title'), 'Câmera 1 — IP: local');
        assert.equal(await page.locator('#factoryMap > button').evaluate(el => el.style.background), 'rgb(49, 85, 245)');
        assert.match(await page.locator('#sectorList').innerText(), /Produção[\s\S]*1 câmera/);
        assert.match(await page.locator('.mapping-grid aside').innerText(), /Zonas de Risco[\s\S]*Prensa hidráulica[\s\S]*Área de carga/);
        assert.deepEqual(await page.locator('#factoryMap').evaluate(async el => {
            const style = getComputedStyle(el);
            const image = new Image();
            image.src = style.backgroundImage.slice(5, -2);
            await image.decode();
            return [image.naturalWidth / image.naturalHeight, style.backgroundSize, style.backgroundRepeat];
        }), [1.5, 'contain', 'no-repeat']);
        check('Mapa carrega a planta original, câmera com tooltip e cor, setores e zonas preservados');

        for (const width of [1440, 768, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
                await page.locator('#factoryMap').scrollIntoViewIfNeeded();
                assert(await page.locator('#factoryMap').evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    const button = el.querySelector('button');
                    const marker = button.getBoundingClientRect();
                    const hit = document.elementFromPoint(marker.x + marker.width / 2, marker.y + marker.height / 2);
                    return rect.width > 0 && Math.abs(rect.width / rect.height - 1.5) < 0.01
                        && rect.left >= 0 && rect.right <= innerWidth
                        && button.contains(hit) && getComputedStyle(button).zIndex === '1';
                }));
                await page.locator('#factoryMap > button').click();
            }
            if (width <= 960) {
                const map = await page.locator('#factoryMap').boundingBox();
                const sectors = await page.locator('#sectorList').boundingBox();
                assert(sectors.y >= map.y + map.height);
            }
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        check('Planta proporcional e ícones clicáveis em desktop, tablet e celular, nos dois temas');

        const mapBeforeCreation = await page.locator('#factoryMap').innerHTML();
        const sectorsBeforeCreation = await page.locator('#sectorList').innerHTML();
        assert.match(await page.locator('#openZoneModal').innerText(), /Nova zona/);
        assert.equal(await page.locator('#zoneModal').isVisible(), false);
        for (const width of [1440, 768, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
                await page.locator('#openZoneModal').click();
                assert(await page.locator('#zoneModal').isVisible());
                assert(await page.locator('#zoneCamera').evaluate(el => el === document.activeElement));
                await assertContrast(page.locator('#zoneName'));
                const rect = await page.locator('#zoneModal .modal-box').boundingBox();
                assert(rect.x >= 0 && rect.x + rect.width <= width);
                await page.locator('#cancelZoneModal').click();
                assert.equal(await page.locator('#zoneModal').isVisible(), false);
            }
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        for (const method of ['close', 'backdrop', 'escape']) {
            await page.locator('#openZoneModal').click();
            if (method === 'close') await page.locator('#closeZoneModal').click();
            if (method === 'backdrop') {
                await page.locator('#zoneModal h2').click();
                assert(await page.locator('#zoneModal').isVisible());
                await page.locator('#zoneModal').click({ position: { x: 5, y: 5 } });
            }
            if (method === 'escape') await page.keyboard.press('Escape');
            assert.equal(await page.locator('#zoneModal').isVisible(), false);
        }
        check('Nova zona abre e fecha por X, Cancelar, fundo e Escape; modal legível e responsivo nos dois temas');

        await page.locator('#openZoneModal').click();
        await page.locator('#saveZoneButton').click();
        assert.equal(zoneRequests.length, 0);
        await page.locator('#zoneCamera').selectOption('1');
        await page.locator('#zoneName').fill('  Zona <img src=x onerror=alert(1)>  ');
        for (const [selector, value] of [['#zoneX', '0.8'], ['#zoneY', '0.2'], ['#zoneWidth', '0.3'], ['#zoneHeight', '0.4']]) await page.locator(selector).fill(value);
        await page.locator('#saveZoneButton').click();
        assert.equal(zoneRequests.length, 0);
        assert.match(await page.locator('#toastContainer').innerText(), /inteiramente dentro do quadro/);
        await page.locator('#zoneX').fill('0.1');
        for (const status of [400, 0]) {
            createZoneStatus = status;
            const count = zoneRequests.length;
            await page.locator('#saveZoneButton').click();
            await page.waitForFunction(() => !document.getElementById('saveZoneButton').disabled);
            assert.equal(zoneRequests.length, count + 1);
            assert(await page.locator('#zoneModal').isVisible());
            assert.equal(await page.locator('#zoneCamera').inputValue(), '1');
            assert.equal(zoneData.length, 2);
        }
        createZoneStatus = 201;
        await page.locator('#saveZoneButton').click();
        await page.waitForFunction(() => !document.getElementById('zoneModal').classList.contains('active') && document.getElementById('riskZonesList').textContent.includes('Zona <img'));
        assert.deepEqual(zoneRequests.at(-1), { method: 'POST', body: {
            id_camera: 1, nome: 'Zona <img src=x onerror=alert(1)>', x: 0.1, y: 0.2, largura: 0.3, altura: 0.4, permitido: false
        } });
        assert.equal(await page.locator('#riskZonesList img').count(), 0);
        assert.equal(await page.locator('#zoneName').inputValue(), '');
        await page.locator('#openZoneModal').click();
        await page.locator('#zoneCamera').selectOption('1');
        await page.locator('#zoneName').fill('Passagem permitida');
        await page.locator('#zoneAllowed').check();
        await page.locator('#saveZoneButton').click();
        await page.waitForFunction(() => document.getElementById('riskZonesList').textContent.includes('Passagem permitida'));
        assert.equal(zoneRequests.at(-1).body.permitido, true);
        assert.equal(await page.locator('#riskZonesList .badge.success').count(), 2);
        assert.equal(await page.locator('#factoryMap').innerHTML(), mapBeforeCreation);
        assert.equal(await page.locator('#sectorList').innerHTML(), sectorsBeforeCreation);
        assert.equal(await page.locator('#mapCamerasOnline').innerText(), '1 câmera online');
        assert.match(await page.locator('#factoryMap').evaluate(el => getComputedStyle(el).backgroundImage), /planta-fabrica\.png/);
        check('Cadastro valida campos/limites, trata HTTP 400 e rede, envia tipos corretos, recarrega zonas e preserva planta/câmeras/setores/online');

        const savedZones = zoneData;
        for (const [status, data, expected] of [
            [200, [], /Nenhuma zona cadastrada/],
            [500, [], /Não foi possível carregar/],
            [0, [], /Não foi possível carregar/],
            [200, {}, /Não foi possível carregar/],
            [200, savedZones, /Prensa hidráulica[\s\S]*Área de carga[\s\S]*Passagem permitida/]
        ]) {
            zonesStatus = status; zoneData = data;
            await page.evaluate(() => loadRiskZones());
            assert.match(await page.locator('#riskZonesList').innerText(), expected);
            assert.equal(await page.locator('#factoryMap').innerHTML(), mapBeforeCreation);
            assert.equal(await page.locator('#sectorList').innerHTML(), sectorsBeforeCreation);
        }
        check('Listagem de zonas distingue vazio, erro HTTP, rede e formato inválido e recupera sem afetar o mapa');

        await page.waitForFunction(() => !!window.socketHandlers.novo_alerta);
        await page.evaluate(() => window.socketHandlers.novo_alerta({ evento: 'Possível queda', severidade: 3, id_camera: 1, nome_camera: 'Entrada', nome_setor: 'Produção', tipo_deteccao: 'queda', id_zona: null }));
        assert.match(await page.locator('#mapAlertIndicator').innerText(), /Possível queda \(1\)/);
        assert.equal(await page.locator('#mapAlertIndicator').evaluate(el => getComputedStyle(el).zIndex), '2');
        check('Indicador Socket.IO preservado acima das câmeras e da planta');

        for (const [data, status, expected] of [
            [[{ status: 'Ativo' }, { status: 'Desconectado' }, { status: 'Inativo' }, { status: 'Ativo' }], 200, '2 câmeras online'],
            [[], 200, '0 câmeras online'],
            [[{ status: 'Desconectado' }, { status: 'Inativo' }], 200, '0 câmeras online'],
            [{ message: 'Resposta inválida' }, 200, '— câmeras online'],
            [[], 500, '— câmeras online'],
            [[], 0, '— câmeras online'],
            [[{ status: 'Ativo' }], 200, '1 câmera online']
        ]) {
            cameras = data;
            cameraStatus = status;
            await page.evaluate(() => loadMapCamerasOnline());
            assert.equal(await page.locator('#mapCamerasOnline').innerText(), expected);
            assert.equal(await page.locator('#mapCamerasOnline').evaluate(el => el.classList.contains('success')), /^[12] /.test(expected));
            assert.equal(await page.locator('#factoryMap > button').count(), 1);
            assert.match(await page.locator('#sectorList').innerText(), /Produção/);
        }
        check('Online conta somente Ativo, trata vazio, resposta inválida, HTTP 500 e rede, e recupera');

        await page.evaluate(() => {
            renderSectorList({ status: 0 }, { data: [] });
            renderFactoryMap({ data: [] });
        });
        assert.match(await page.locator('#sectorList').innerText(), /Backend indisponível/);
        assert.match(await page.locator('#factoryMap').innerText(), /Nenhuma câmera cadastrada/);
        assert.match(await page.locator('#factoryMap').evaluate(el => getComputedStyle(el).backgroundImage), /planta-fabrica\.png/);
        await page.evaluate(() => renderSectorList({ ok: true, status: 200, data: [] }, { data: [] }));
        assert.match(await page.locator('#sectorList').innerText(), /Nenhum setor cadastrado/);
        check('Fallback e lista vazia de setores preservados; planta permanece sem câmeras');
        assert.equal(calls.some(url => /limit|offset|page|periodo=1/.test(url)), false);
        assert.deepEqual(errors, []);
        check('Sem parâmetros inventados, KPI de hoje fora do escopo e sem exceções JS');
        console.log(JSON.stringify({ passed: passed.length, pageErrors: errors, backend: 'simulado' }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
