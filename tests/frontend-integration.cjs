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
let zonesStatus = 200, createZoneStatus = 201, updateZoneStatus = 200;
let epiStatus = 200, epiData = [{ id: 5, nome: 'Capacete real', categoria: 'Cabeça' }, { id: 6, nome: 'Luva <b>', categoria: '' }];
let updateCameraStatus = 200;
const cameraRequests = [];
let sessionUser = { id: 1, nome: 'Teste', perfil: 'admin', admin: true, ativo: true };
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
let complianceCounts = { total_conformes: 8, total_nao_conformes: 2 };
const TEST_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const backendDayKeyForTest = value => {
    const http = /^[A-Za-z]{3},\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/.exec(String(value || '').trim());
    if (http) return `${http[3]}-${String(TEST_MONTHS.indexOf(http[2]) + 1).padStart(2, '0')}-${http[1].padStart(2, '0')}`;
    return /^\d{4}-\d{2}-\d{2}/.exec(String(value || '').trim())?.[0] || '';
};
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
                if (url.pathname === '/session') data = { authenticated: true, user: sessionUser };
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
                else if (/^\/zonas\/\d+$/.test(url.pathname)) {
                    const body = route.request().postDataJSON();
                    zoneRequests.push({ method: route.request().method(), path: url.pathname, body });
                    if (updateZoneStatus === 0) return route.abort('failed');
                    status = updateZoneStatus;
                    if (status === 200) {
                        const id = Number(url.pathname.split('/').pop());
                        data = { id, ...body };
                        zoneData = zoneData.map(zone => (zone.id === id ? data : zone));
                    } else data = { error: 'Falha ao atualizar a zona' };
                }
                else if (url.pathname.startsWith('/zonas/')) data = monitoringZones;
                else if (url.pathname === '/epis') {
                    if (epiStatus === 0) return route.abort('failed');
                    data = epiData; status = epiStatus;
                }
                else if (/^\/cameras\/\d+$/.test(url.pathname)) {
                    const body = route.request().postDataJSON();
                    cameraRequests.push({ method: route.request().method(), path: url.pathname, body });
                    if (updateCameraStatus === 0) return route.abort('failed');
                    status = updateCameraStatus;
                    data = status === 200
                        ? { id: Number(url.pathname.split('/').pop()), ...body }
                        : { message: 'Acesso negado: você não tem permissão para acessar este recurso.' };
                }
                else if (url.pathname.startsWith('/detections/')) { data = detections; status = detectionStatus; }
                else if (url.pathname.startsWith('/video/')) {
                    const [width, height] = streamDimensions;
                    const status = streamStatus;
                    if (streamGate) await streamGate;
                    if (status !== 200) return route.fulfill({ status, body: '' });
                    return route.fulfill({ headers: { 'Cache-Control': 'no-store' }, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#306090"/><rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="white"/></svg>` });
                }
                else if (url.pathname === '/estatisticas/conformes') data = complianceCounts;
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
                assert.equal(await page.locator('#zonasOverlay').count(), 1);
                assert.equal(await page.locator('#zonasOverlay').isVisible(), false);
                assert.equal(await page.locator('#videoStream').count(), 1);
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
        // Só existem Pendente/Resolvido. Combinação real sem resultados preserva
        // a cobertura de vazio, sem exigir um estado que a API não fornece.
        await page.locator('#alertSeverity').selectOption('Crítico');
        await assertAlertPage([], '0 de 0', true, true);
        assert.match(await page.locator('#alertsTable').innerText(), /Nenhum alerta encontrado com os filtros selecionados/);
        await page.locator('#alertStatus').selectOption('');
        await page.locator('#alertSeverity').selectOption('');
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
        // Detecções avaliadas e taxa saem de GET /estatisticas/conformes (8 + 2).
        await page.waitForFunction(() => document.getElementById('dashboardCompliance').textContent === '80,0%');
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['10', '80,0%', String(alertData.filter(alert => backendDayKeyForTest(alert.data) === new Date().toLocaleDateString('sv-SE')).length), '1/3']);
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
        assert.equal(await page.locator('#factoryMap > button').getAttribute('title'), 'Câmera 1');
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

        detections = { ...detections, connected: true };
        detectionStatus = 200;
        streamStatus = 200;
        await page.evaluate(() => {
            const original = apiVideoUrl;
            let connection = 0;
            window.apiVideoUrl = id => `${original(id)}?fixture=${++connection}`;
        });
        const area = page.locator('#zoneAreaOverlay');
        const selected = page.locator('#zoneAreaRect');
        const readArea = () => selected.evaluate(rect => Object.fromEntries(
            ['x', 'y', 'width', 'height'].map(key => [key, Number(rect.getAttribute(key))])
        ));
        const near = (a, b, tolerance = 0.005) => assert(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);
        const assertArea = async expected => {
            const actual = await readArea();
            Object.keys(expected).forEach(key => near(actual[key], expected[key]));
        };
        const drawArea = async (start = [0.1, 0.2], end = [0.4, 0.6]) => {
            await area.waitFor({ state: 'visible' });
            await area.scrollIntoViewIfNeeded();
            const bounds = await area.boundingBox();
            await page.mouse.move(bounds.x + bounds.width * start[0], bounds.y + bounds.height * start[1]);
            await page.mouse.down();
            await page.mouse.move(bounds.x + bounds.width * end[0], bounds.y + bounds.height * end[1], { steps: 5 });
            await page.mouse.up();
        };
        const assertEditorGeometry = async dimensions => {
            const geometry = await page.evaluate(() => {
                const box = el => {
                    const { x, y, width, height } = el.getBoundingClientRect();
                    return { x, y, width, height };
                };
                const image = document.getElementById('zoneFrame');
                const modal = document.querySelector('#zoneModal .modal-box');
                return { image: box(image), overlay: box(document.getElementById('zoneAreaOverlay')),
                    rect: box(document.getElementById('zoneAreaRect')), natural: [image.naturalWidth, image.naturalHeight],
                    fit: getComputedStyle(image).objectFit, overflow: modal.scrollWidth > modal.clientWidth,
                    modal: box(modal), viewport: innerWidth };
            });
            assert.deepEqual(geometry.natural, dimensions);
            for (const key of ['x', 'y', 'width', 'height']) near(geometry.image[key], geometry.overlay[key], 0.1);
            near(geometry.image.width / geometry.image.height, dimensions[0] / dimensions[1], 0.01);
            assert.equal(geometry.fit, 'contain');
            assert.equal(geometry.overflow, false);
            assert(geometry.modal.x >= 0 && geometry.modal.x + geometry.modal.width <= geometry.viewport);
            const normalized = await readArea();
            near(geometry.rect.x, geometry.image.x + normalized.x * geometry.image.width, 0.2);
            near(geometry.rect.y, geometry.image.y + normalized.y * geometry.image.height, 0.2);
            near(geometry.rect.width, normalized.width * geometry.image.width, 0.2);
            near(geometry.rect.height, normalized.height * geometry.image.height, 0.2);
        };

        for (const width of [1440, 768, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 700 : 1000 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
                for (const dimensions of [[1920, 1080], [1080, 1920], [640, 480], [1280, 720], [900, 600]]) {
                    streamDimensions = dimensions;
                    await page.locator('#openZoneModal').click();
                    assert.deepEqual(await page.locator('#zoneCamera option').evaluateAll(options => options.map(option => option.value)), ['', '1']);
                    await page.locator('#zoneCamera').selectOption('1');
                    await drawArea();
                    await assertArea({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
                    await assertEditorGeometry(dimensions);
                    await assertContrast(page.locator('#zoneAreaStatus'));
                    assert.equal(await area.evaluate(el => getComputedStyle(el).touchAction), 'none');
                    await page.locator('#cancelZoneModal').click();
                    assert.equal(await page.locator('#zoneFrame').count(), 0);
                }
            }
        }
        check('Editor: 30 combinações de resolução, 1440/768/390 e temas; imagem inteira, SVG alinhado, câmeras da API e cleanup');
        await page.setViewportSize({ width: 1440, height: 1000 });
        streamDimensions = [1920, 1080];
        await page.locator('#openZoneModal').click();
        await page.locator('#zoneCamera').selectOption('1');
        assert.equal(await page.locator('#zoneX, #zoneY, #zoneWidth, #zoneHeight').count(), 0);
        for (const [start, end] of [
            [[0.1, 0.2], [0.7, 0.8]], [[0.7, 0.8], [0.1, 0.2]],
            [[0.7, 0.2], [0.1, 0.8]], [[0.1, 0.8], [0.7, 0.2]]
        ]) {
            await drawArea(start, end);
            await assertArea({ x: 0.1, y: 0.2, width: 0.6, height: 0.6 });
        }
        const beforeResize = await readArea();
        for (const width of [390, 768, 1440]) {
            await page.setViewportSize({ width, height: 800 });
            await assertEditorGeometry(streamDimensions);
            assert.deepEqual(await readArea(), beforeResize);
        }
        await drawArea([0.2, 0.3], [1.2, 1.2]);
        await assertArea({ x: 0.2, y: 0.3, width: 0.8, height: 0.7 });
        await drawArea([0.8, 0.7], [-0.2, -0.2]);
        await assertArea({ x: 0, y: 0, width: 0.8, height: 0.7 });
        await page.locator('#resetZoneArea').click();
        assert.equal(await selected.isVisible(), false);
        await drawArea([0.3, 0.3], [0.301, 0.301]);
        assert.equal(await selected.isVisible(), false);
        assert.match(await page.locator('#zoneAreaStatus').innerText(), /muito pequena/);
        await page.locator('#zoneName').fill('Área sem seleção');
        await page.locator('#saveZoneButton').click();
        assert.equal(zoneRequests.length, 0);
        check('Editor: quatro direções, normalização, resize, clamp em todos os limites, redefinir e mínimo inválido');

        // Touch real pelo protocolo do Chromium, incluindo captura fora da imagem.
        const cdp = await context.newCDPSession(page);
        await page.setViewportSize({ width: 390, height: 700 });
        await area.scrollIntoViewIfNeeded();
        const touchBounds = await area.boundingBox();
        const touchPoint = (x, y) => ({ x: touchBounds.x + touchBounds.width * x, y: touchBounds.y + touchBounds.height * y });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(0.1, 0.2)] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touchPoint(0.7, 0.8)] });
        assert(await selected.isVisible());
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await assertArea({ x: 0.1, y: 0.2, width: 0.6, height: 0.6 });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(0.2, 0.3)] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        assert.equal(await selected.isVisible(), false);
        await cdp.detach();
        await page.setViewportSize({ width: 1440, height: 1000 });
        check('Editor: arraste touch real, preview durante arraste e pointercancel');

        // Câmera B fornecida exclusivamente pela API simulada de teste.
        cameraListData = [...cameras, { id: 2, nome: 'Câmera B', id_setor: 1 }];
        await page.evaluate(async () => {
            sessionStorage.clear();
            apiClearCached('/cameras');
            await loadMapeamento();
        });
        await page.locator('#zoneCamera').selectOption('1');
        await drawArea();
        let releaseFrame;
        streamGate = new Promise(resolve => { releaseFrame = resolve; });
        const pendingVideo = page.waitForRequest(request => new URL(request.url()).pathname === '/video/2');
        await page.locator('#zoneCamera').selectOption('2');
        await pendingVideo;
        assert.equal(await selected.isVisible(), false);
        assert.equal(await area.isVisible(), false);
        await page.locator('#saveZoneButton').click();
        assert.equal(zoneRequests.length, 0);
        await page.evaluate(() => {
            window.oldZoneImage = document.getElementById('zoneFrame');
            window.oldZoneLoad = oldZoneImage.onload;
            window.oldZoneError = oldZoneImage.onerror;
        });
        streamGate = null;
        streamDimensions = [1080, 1920];
        await page.locator('#zoneCamera').selectOption('1');
        await drawArea();
        releaseFrame();
        await page.evaluate(() => { oldZoneLoad(); oldZoneError(); });
        await assertEditorGeometry(streamDimensions);
        assert(await selected.isVisible());
        // Voltar a B também não reativa callbacks da primeira conexão de B.
        await page.locator('#zoneCamera').selectOption('2');
        await drawArea();
        await page.evaluate(() => { oldZoneLoad(); oldZoneError(); });
        assert(await selected.isVisible());
        check('Editor: troca limpa seleção, ausência de frame bloqueia envio e callbacks atrasados B → A → B são ignorados');

        streamStatus = 503;
        await page.locator('#zoneCamera').selectOption('1');
        await page.waitForFunction(() => document.getElementById('zoneAreaStatus').textContent.includes('indisponível'));
        await page.locator('#saveZoneButton').click();
        assert.equal(zoneRequests.length, 0);
        assert.equal(await area.isVisible(), false);
        streamStatus = 200;
        await page.locator('#retryZoneFrame').click();
        await drawArea();
        detections = { ...detections, connected: false };
        await page.waitForFunction(() => document.getElementById('zoneAreaStatus').textContent.includes('indisponível'));
        assert.equal(await selected.isVisible(), false);
        assert.equal(await page.locator('#zoneFrame').count(), 0);
        detections = { ...detections, connected: true };
        await page.locator('#retryZoneFrame').click();
        await drawArea();
        await page.locator('#cancelZoneModal').click();
        // Restaura as câmeras da API para preservar as regressões anteriores.
        cameraListData = null;
        await page.evaluate(async () => { sessionStorage.clear(); apiClearCached('/cameras'); await loadMapeamento(); });
        check('Editor: HTTP 503, perda de conexão após seleção, bloqueio de cadastro e recuperação por Tentar novamente');

        await page.locator('#openZoneModal').click();
        await page.locator('#saveZoneButton').click();
        assert.equal(zoneRequests.length, 0);
        await page.locator('#zoneCamera').selectOption('1');
        await page.locator('#zoneName').fill('  Zona <img src=x onerror=alert(1)>  ');
        await area.waitFor({ state: 'visible' });
        await page.locator('#saveZoneButton').click();
        assert.equal(zoneRequests.length, 0);
        assert.match(await page.locator('#toastContainer').innerText(), /Desenhe uma área válida/);
        await drawArea();
        const submittedArea = await readArea();
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
            id_camera: 1, nome: 'Zona <img src=x onerror=alert(1)>', x: submittedArea.x, y: submittedArea.y,
            largura: submittedArea.width, altura: submittedArea.height, permitido: false, ids_epis: []
        } });
        assert.equal(await page.locator('#riskZonesList img').count(), 0);
        assert.equal(await page.locator('#zoneName').inputValue(), '');
        await page.locator('#openZoneModal').click();
        await page.locator('#zoneCamera').selectOption('1');
        await page.locator('#zoneName').fill('Passagem permitida');
        await page.locator('#zoneAllowed').check();
        await drawArea();
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
            renderFactoryMap({ ok: true, status: 200, data: [] });
        });
        assert.match(await page.locator('#sectorList').innerText(), /Não foi possível carregar os setores/);
        assert.match(await page.locator('#factoryMap').innerText(), /Nenhuma câmera cadastrada/);
        assert.match(await page.locator('#factoryMap').evaluate(el => getComputedStyle(el).backgroundImage), /planta-fabrica\.png/);
        await page.evaluate(() => renderSectorList({ ok: true, status: 200, data: [] }, { data: [] }));
        assert.match(await page.locator('#sectorList').innerText(), /Nenhum setor cadastrado/);
        check('Fallback e lista vazia de setores preservados; planta permanece sem câmeras');
        // --- EPI obrigatorio na zona, edicao de zona e edicao de camera ---
        cameraListData = [
            { id: 1, nome: 'Entrada', id_setor: 1, ip: 'rtsp://camera_user:camera_password@10.20.30.41:554/stream' },
            { id: 2, nome: 'Saída', id_setor: 1, ip: '10.20.30.42' }
        ];
        cameras = cameraListData;
        cameraStatus = 200; cameraListStatus = 200; sectorsStatus = 200; zonesStatus = 200;
        detections = { connected: true, fps: 15, latencia_ms: 46, class_count: {}, detections: [] };
        detectionStatus = 200; streamStatus = 200; streamDimensions = [640, 360];
        sectorData = [{ id: 1, nome: 'Produção' }, { id: 2, nome: 'Expedição' }];
        zoneData = [{ id: 7, nome: 'Prensa hidráulica', id_camera: 1, x: 0.1, y: 0.2, largura: 0.3, altura: 0.25, permitido: false }];
        await page.evaluate(() => sessionStorage.clear());
        await page.goto('http://localhost:8765/mapeamento.html');
        await page.waitForFunction(() => document.querySelectorAll('#zoneCamera option').length === 3);

        // A seleção de EPIs obrigatórios usa caixas de seleção, não mais <select multiple>.
        const epiReady = () => page.waitForFunction(() =>
            document.getElementById('zoneEpiOptions').getAttribute('aria-busy') === 'false');
        const epiLabels = () => page.locator('#zoneEpiOptions .epi-option')
            .evaluateAll(options => options.map(option => option.textContent.replace(/\s+/g, ' ').trim()));
        const epiChecked = () => page.locator('#zoneEpiOptions input[name="ids_epis"]')
            .evaluateAll(inputs => inputs.filter(input => input.checked).map(input => Number(input.value)).sort((a, b) => a - b));
        const epiSelect = async values => {
            for (const input of await page.locator('#zoneEpiOptions input[name="ids_epis"]').all()) {
                const value = await input.getAttribute('value');
                await input.setChecked(values.includes(value));
            }
        };

        await page.locator('#openZoneModal').click();
        await epiReady();
        assert.deepEqual(await epiLabels(), ['Capacete real Cabeça', 'Luva <b>']);
        assert.equal(await page.locator('#zoneEpiOptions b').count(), 0);
        assert.deepEqual(await epiChecked(), []);
        assert.match(await page.locator('#zoneEpiSelectionSummary').innerText(), /Nenhum EPI obrigatório selecionado/);
        assert(await page.locator('#zoneEpiGroup').isVisible());
        assert.equal(await page.locator('#zoneEpiUnavailable').isVisible(), false);
        for (const [status, data, expectedOption, expectedHint] of [
            [200, [], /Nenhum EPI cadastrado/, /Cadastre um EPI no inventário/],
            [500, epiData, /Não foi possível carregar os EPIs/, /sem EPI obrigatório/],
            [0, epiData, /Não foi possível carregar os EPIs/, /sem EPI obrigatório/]
        ]) {
            await page.locator('#cancelZoneModal').click();
            const previous = epiData;
            epiStatus = status; epiData = data;
            await page.locator('#openZoneModal').click();
            await epiReady();
            assert.match(await page.locator('#zoneEpiOptions').innerText(), expectedOption);
            assert.match(await page.locator('#zoneEpiHint').innerText(), expectedHint);
            assert.equal(await page.locator('#zoneEpiOptions .epi-option').count(), 0);
            epiData = previous;
        }
        epiStatus = 200;
        await page.locator('#cancelZoneModal').click();
        check('EPI obrigatório vem do cadastro real e distingue lista vazia, HTTP 500 e falha de rede, sem opções fixas');

        await page.locator('#openZoneModal').click();
        await epiReady();
        await page.locator('#zoneCamera').selectOption('1');
        await page.locator('#zoneName').fill('Zona com EPI');
        await epiSelect(['5', '6']);
        assert.match(await page.locator('#zoneEpiSelectionSummary').innerText(), /2 de 2 EPIs marcados/);
        await drawArea();
        const createdArea = await readArea();
        await page.locator('#saveZoneButton').click();
        await page.waitForFunction(() => !document.getElementById('zoneModal').classList.contains('active'));
        assert.deepEqual(zoneRequests.at(-1), { method: 'POST', body: {
            id_camera: 1, nome: 'Zona com EPI', permitido: false,
            x: createdArea.x, y: createdArea.y, largura: createdArea.width, altura: createdArea.height, ids_epis: [5, 6]
        } });
        await page.locator('#openZoneModal').click();
        await epiReady();
        await page.locator('#zoneCamera').selectOption('1');
        await page.locator('#zoneName').fill('Zona sem EPI');
        await drawArea();
        await page.locator('#saveZoneButton').click();
        await page.waitForFunction(() => !document.getElementById('zoneModal').classList.contains('active'));
        assert.equal('id_epi' in zoneRequests.at(-1).body, false);
        assert.deepEqual(zoneRequests.at(-1).body.ids_epis, []);
        check('Criação envia ids_epis numéricos, múltiplos ou lista vazia, sem id_epi legado');

        // ETAPA 3 — A seleção precisa funcionar por teclado e por toque, não só por
        // Ctrl+clique como exigia o <select multiple>.
        await page.locator('#openZoneModal').click();
        await epiReady();
        const primeiraCaixa = page.locator('#zoneEpiOptions input[name="ids_epis"]').first();
        await primeiraCaixa.focus();
        assert.equal(await page.evaluate(() => document.activeElement.name), 'ids_epis');
        await page.keyboard.press('Space');
        assert.deepEqual(await epiChecked(), [5]);
        // Tab alcança a caixa seguinte e Espaço marca sem desmarcar a anterior.
        await page.keyboard.press('Tab');
        await page.keyboard.press('Space');
        assert.deepEqual(await epiChecked(), [5, 6]);
        await page.keyboard.press('Space');
        assert.deepEqual(await epiChecked(), [5]);
        assert.match(await page.locator('#zoneEpiSelectionSummary').innerText(), /1 de 2 EPIs marcados/);
        check('EPIs da zona: marcar e desmarcar vários por teclado, sem Ctrl e sem perder a seleção anterior');

        // Toque real no rótulo inteiro, não só no quadradinho.
        const rotulo = page.locator('#zoneEpiOptions .epi-option').nth(1);
        const caixaRotulo = await rotulo.boundingBox();
        assert(caixaRotulo.height >= 40, 'alvo de toque menor que 40px');
        const toque = { x: caixaRotulo.x + caixaRotulo.width / 2, y: caixaRotulo.y + caixaRotulo.height / 2 };
        const touchCdp = await context.newCDPSession(page);
        const tocar = async () => {
            await touchCdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [toque] });
            await touchCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        };
        await tocar();
        assert.deepEqual(await epiChecked(), [5, 6]);
        await tocar();
        assert.deepEqual(await epiChecked(), [5]);
        await touchCdp.detach();
        await page.locator('#cancelZoneModal').click();
        check('EPIs da zona: toque no rótulo alterna a seleção, com alvo de toque adequado');

        // O backend atual devolve `epis_id: int[]` em toda leitura de zona.
        zoneData = [{ id: 7, nome: 'Prensa hidráulica', id_camera: 1, x: 0.1, y: 0.2, largura: 0.3, altura: 0.25, permitido: false, epis_id: [6, 5] }];
        await page.evaluate(() => loadRiskZones());
        await page.locator('[data-edit-zone="7"]').click();
        assert.equal(await page.locator('#zoneModalTitle').innerText(), 'Editar zona');
        assert.equal(await page.locator('#saveZoneLabel').innerText(), 'Salvar zona');
        assert.equal(await page.locator('#zoneName').inputValue(), 'Prensa hidráulica');
        assert.equal(await page.locator('#zoneCamera').inputValue(), '1');
        assert.equal(await page.locator('#zoneAllowed').isChecked(), false);
        await epiReady();
        assert(await page.locator('#zoneEpiGroup').isVisible());
        assert.equal(await page.locator('#zoneEpiUnavailable').isVisible(), false);
        assert.deepEqual(await epiChecked(), [5, 6]);
        await area.waitFor({ state: 'visible' });
        await assertArea({ x: 0.1, y: 0.2, width: 0.3, height: 0.25 });
        assert.match(await page.locator('#zoneAreaStatus').innerText(), /Área atual da zona/);
        check('Edição lê os IDs reais em epis_id e pré-seleciona os EPIs associados sobre a área persistida');

        for (const status of [400, 0]) {
            updateZoneStatus = status;
            const before = zoneRequests.length;
            await page.locator('#saveZoneButton').click();
            await page.waitForFunction(() => !document.getElementById('saveZoneButton').disabled);
            assert.equal(zoneRequests.length, before + 1);
            assert.equal(zoneRequests.at(-1).method, 'PUT');
            assert.equal(zoneRequests.at(-1).path, '/zonas/7');
            assert.deepEqual(zoneRequests.at(-1).body, { id_camera: 1, nome: 'Prensa hidráulica', permitido: false, x: 0.1, y: 0.2, largura: 0.3, altura: 0.25, ids_epis: [5, 6] });
            assert(await page.locator('#zoneModal').isVisible());
            assert.equal(await page.locator('#zoneName').inputValue(), 'Prensa hidráulica');
            assert.match(await page.locator('#riskZonesList').innerText(), /Prensa hidráulica/);
        }
        check('Área persistida é reenviada sem redesenho; PUT com HTTP 400 e falha de rede preserva o formulário e a lista');

        updateZoneStatus = 200;
        await drawArea([0.5, 0.45], [0.85, 0.8]);
        const editedArea = await readArea();
        await page.locator('#zoneName').fill('Prensa revisada');
        await page.locator('#zoneAllowed').check();
        await page.locator('#saveZoneButton').click();
        await page.waitForFunction(() => !document.getElementById('zoneModal').classList.contains('active')
            && document.getElementById('riskZonesList').textContent.includes('Prensa revisada'));
        assert.deepEqual(zoneRequests.at(-1), { method: 'PUT', path: '/zonas/7', body: {
            id_camera: 1, nome: 'Prensa revisada', permitido: true, ids_epis: [5, 6],
            x: editedArea.x, y: editedArea.y, largura: editedArea.width, altura: editedArea.height
        } });
        assert.equal('id_epi' in zoneRequests.at(-1).body, false);
        assert.match(await page.locator('#riskZonesList .badge').first().innerText(), /Permitida/);
        await page.locator('#openZoneModal').click();
        assert.equal(await page.locator('#zoneModalTitle').innerText(), 'Criar nova zona');
        assert.equal(await page.locator('#zoneName').inputValue(), '');
        assert(await page.locator('#zoneEpiGroup').isVisible());
        await page.locator('#cancelZoneModal').click();
        check('Redesenho envia a nova área normalizada e os IDs reais em ids_epis, nunca id_epi, e volta ao modo de criação');

        // A pré-seleção termina quando `zoneEpisReady` fecha ou quando o modal declara
        // que as associações atuais serão preservadas. Esperar só pelo select habilitado
        // observaria um estado intermediário.
        const openZoneEdit = async (fixture = { epis_id: [5, 6] }) => {
            zoneData = [{ id: 7, nome: 'Prensa revisada', id_camera: 1, x: 0.1, y: 0.2, largura: 0.3, altura: 0.25, permitido: true, ...fixture }];
            await page.evaluate(() => loadRiskZones());
            await page.locator('[data-edit-zone="7"]').click();
            await page.waitForFunction(() => zoneEpisReady === true
                || document.getElementById('zoneEpiUnavailable').hidden === false);
        };
        const saveZone = async () => {
            await page.locator('#saveZoneButton').click();
            await page.waitForFunction(() => !document.getElementById('zoneModal').classList.contains('active'));
        };

        // Alteração da seleção: o PUT substitui a lista, inclusive esvaziando-a.
        await openZoneEdit();
        assert(await page.locator('#zoneEpiGroup').isVisible());
        await epiSelect(['6']);
        await saveZone();
        assert.deepEqual(zoneRequests.at(-1).body.ids_epis, [6]);

        await openZoneEdit({ epis_id: [6] });
        assert.deepEqual(await epiChecked(), [6]);
        await epiSelect([]);
        assert.match(await page.locator('#zoneEpiSelectionSummary').innerText(), /Nenhum EPI obrigatório selecionado/);
        await saveZone();
        assert.deepEqual(zoneRequests.at(-1).body.ids_epis, []);
        check('Edição substitui a lista de EPIs, inclusive por lista vazia, quando a seleção real está na tela');

        // Sem IDs confiáveis, o PUT omite ids_epis e o backend preserva as associações.
        for (const [fixture, label] of [
            [{}, 'campo epis_id ausente na resposta'],
            [{ epis_id: null }, 'epis_id nulo'],
            [{ epis_id: ['capacete'] }, 'epis_id fora do formato de IDs'],
            [{ epis_id: [5, 99] }, 'ID associado que não existe no cadastro de EPIs']
        ]) {
            await openZoneEdit(fixture);
            assert.equal(await page.locator('#zoneEpiGroup').isVisible(), false);
            assert(await page.locator('#zoneEpiUnavailable').isVisible());
            assert.match(await page.locator('#zoneEpiUnavailable').innerText(), /ficam como estão ao salvar/);
            await saveZone();
            assert.equal(zoneRequests.at(-1).method, 'PUT');
            assert.equal('ids_epis' in zoneRequests.at(-1).body, false);
            check('Edição não apaga associações: ' + label);
        }

        // Cadastro de EPIs indisponível não pode transformar [5, 6] em [].
        for (const [status, data, label] of [
            [500, epiData, 'HTTP 500 em /epis'],
            [0, epiData, 'falha de rede em /epis'],
            [200, [], 'cadastro de EPIs vazio']
        ]) {
            const previous = epiData;
            epiStatus = status; epiData = data;
            await openZoneEdit();
            assert.equal(await page.locator('#zoneEpiGroup').isVisible(), false);
            await saveZone();
            assert.equal('ids_epis' in zoneRequests.at(-1).body, false);
            epiStatus = 200; epiData = previous;
            check('Cadastro de EPIs indisponível omite ids_epis em vez de esvaziá-lo: ' + label);
        }

        // Formato alternativo de agregado: objetos com id em vez de inteiros puros.
        await openZoneEdit({ epis_id: [{ id: 5 }, { id: 6 }] });
        assert.deepEqual(await epiChecked(), [5, 6]);
        await page.locator('#cancelZoneModal').click();
        check('Agregado de EPIs em objetos com id é lido como os mesmos IDs reais');

        // Voltar ao modo de criação não pode herdar a seleção da zona editada.
        await page.locator('#openZoneModal').click();
        await page.waitForFunction(() => zoneEpisReady === true);
        assert.deepEqual(await epiChecked(), []);
        assert(await page.locator('#zoneEpiGroup').isVisible());
        await page.locator('#cancelZoneModal').click();
        check('Criação após edição abre sem seleção herdada');

        for (const width of [1440, 768, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
                await page.locator('[data-edit-zone="7"]').click();
                assert(await page.locator('#zoneModal').isVisible());
                await assertContrast(page.locator('#zoneName'));
                const box = await page.locator('#zoneModal .modal-box').boundingBox();
                assert(box.x >= 0 && box.x + box.width <= width);
                await page.locator('#cancelZoneModal').click();
            }
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.evaluate(() => document.documentElement.dataset.theme = 'light');
        check('Modal de edição de zona cabe e permanece legível em 1440/768/390 nos dois temas');

        await page.evaluate(() => sessionStorage.clear());
        await page.goto('http://localhost:8765/monitoramento.html');
        await page.waitForFunction(() => document.querySelectorAll('#cameraSelect option').length === 2);
        await page.locator('#cameraSelect').selectOption('2');
        await page.waitForFunction(() => currentCameraId === 2);
        await page.locator('#openCameraModal').click();
        assert.equal(await page.locator('#cameraName').inputValue(), 'Saída');
        assert.equal(await page.locator('#cameraIp').inputValue(), '10.20.30.42');
        assert.equal(await page.locator('#cameraSector').inputValue(), '1');
        assert.deepEqual(await page.locator('#cameraSector option').evaluateAll(options => options.map(option => option.value)), ['1', '2']);
        assert.deepEqual(await page.locator('#cameraRotation option').evaluateAll(options => options.map(option => option.value)), ['0', '90', '180', '270']);
        assert.equal(await page.locator('#cameraRotation').inputValue(), '0');
        assert.equal(await page.locator('#cameraMirrorH').isChecked(), false);
        assert.equal(await page.locator('#cameraMirrorV').isChecked(), false);
        assert.match(await page.locator('#cameraTransformNote').innerText(), /Não foi possível confirmar a rotação e o espelhamento atuais/);
        assert.doesNotMatch(await page.locator('#cameraList').innerHTML(), /10\.20\.30\.42/);
        assert.doesNotMatch(await page.locator('#cameraSelect').innerHTML(), /10\.20\.30\.42/);
        check('Editor de câmera carrega nome/IP/setor reais, oferece só as rotações do DTO e não fabrica rotação/espelhamento');

        await page.locator('#cameraName').fill('Saída revisada');
        await page.locator('#cameraIp').fill('rtsp://10.20.30.99:554/stream');
        await page.locator('#cameraSector').selectOption('2');
        await page.locator('#cameraRotation').selectOption('270');
        await page.locator('#cameraMirrorH').check();
        for (const [status, expected] of [[403, /Acesso negado/], [0, /conectar ao servidor/]]) {
            updateCameraStatus = status;
            const before = cameraRequests.length;
            await page.locator('#saveCameraButton').click();
            await page.waitForFunction(() => !document.getElementById('cameraFormError').hidden);
            assert.equal(cameraRequests.length, before + 1);
            assert.match(await page.locator('#cameraFormError').innerText(), expected);
            assert(await page.locator('#cameraModal').isVisible());
            assert.equal(await page.locator('#cameraName').inputValue(), 'Saída revisada');
            assert.equal(await page.locator('#cameraIp').inputValue(), 'rtsp://10.20.30.99:554/stream');
            assert.equal(await page.locator('#cameraSector').inputValue(), '2');
            assert.equal(await page.locator('[data-camera-id="2"] small').innerText(), 'Produção');
        }
        check('PUT recusado por perfil (403) ou por rede preserva o formulário, informa o erro e não atualiza a interface');

        updateCameraStatus = 200;
        cameraListData = [cameraListData[0], { id: 2, nome: 'Saída revisada', id_setor: 2, ip: 'rtsp://10.20.30.99:554/stream' }];
        const camerasCallsBefore = calls.filter(url => url === '/cameras').length;
        const streamBefore = await page.locator('#videoStream').getAttribute('src');
        await page.locator('#saveCameraButton').click();
        await page.waitForFunction(() => !document.getElementById('cameraModal').classList.contains('active'));
        assert.deepEqual(cameraRequests.at(-1), { method: 'PUT', path: '/cameras/2', body: {
            nome: 'Saída revisada', ip: 'rtsp://10.20.30.99:554/stream', id_setor: 2,
            rotacao: 270, espelhar_horizontal: true, espelhar_vertical: false
        } });
        assert.equal(typeof cameraRequests.at(-1).body.espelhar_horizontal, 'boolean');
        assert.equal(typeof cameraRequests.at(-1).body.id_setor, 'number');
        await page.waitForFunction(() => document.querySelector('#cameraSelect option[value="2"]').textContent.includes('Expedição'));
        assert(calls.filter(url => url === '/cameras').length > camerasCallsBefore);
        assert.equal(await page.evaluate(() => currentCameraId), 2);
        assert.equal(await page.locator('#cameraSelect').inputValue(), '2');
        assert.equal(await page.locator('#videoStream').getAttribute('src'), streamBefore);
        assert.equal(await page.locator('[data-camera-id="2"] small').innerText(), 'Expedição');
        assert.doesNotMatch(await page.locator('#cameraList').innerHTML(), /10\.20\.30\.99/);
        await page.locator('#openCameraModal').click();
        assert.equal(await page.locator('#cameraRotation').inputValue(), '270');
        assert(await page.locator('#cameraMirrorH').isChecked());
        assert.equal(await page.locator('#cameraMirrorV').isChecked(), false);
        assert.match(await page.locator('#cameraTransformNote').innerText(), /atuais da câmera/);
        assert.equal(await page.locator('#cameraName').inputValue(), 'Saída revisada');
        check('PUT aceito envia tipos exatos, invalida o cache, atualiza nome/setor, preserva a câmera e o stream e reapresenta a transformação confirmada');

        for (const width of [1440, 768, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
                assert(await page.locator('#cameraModal').isVisible());
                await assertContrast(page.locator('#cameraIp'));
                const box = await page.locator('#cameraModal .modal-box').boundingBox();
                assert(box.x >= 0 && box.x + box.width <= width);
            }
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.evaluate(() => document.documentElement.dataset.theme = 'light');
        await page.locator('#cancelCameraModal').click();
        assert.equal(await page.locator('#cameraModal').isVisible(), false);
        check('Modal de edição de câmera cabe e permanece legível em 1440/768/390 nos dois temas');

        // ETAPA 2 - Editar camera e contextual: segue a camera selecionada e o
        // Monitoramento nao ganha listagem nem CRUD de cameras/setores.
        for (const id of ['openCameraCreateModal', 'openSectorModal', 'cameraCreateForm', 'sectorForm', 'registryPanel', 'loadRegistries']) {
            assert.equal(await page.locator('#' + id).count(), 0, id);
        }
        assert.equal(await page.locator('[data-registry-delete], [data-sector-edit], [data-sector-delete]').count(), 0);
        assert.equal(await page.locator('#openCameraModal').count(), 1);

        await page.locator('#cameraSelect').selectOption('1');
        await page.waitForFunction(() => currentCameraId === 1);
        await page.locator('#openCameraModal').click();
        assert.equal(await page.locator('#cameraName').inputValue(), 'Entrada');
        assert.equal(await page.locator('#cameraIp').inputValue(), 'rtsp://camera_user:camera_password@10.20.30.41:554/stream');
        assert.equal(await page.locator('#cameraSector').inputValue(), '1');
        // A transformacao confirmada da camera 2 nao vaza para a camera 1.
        assert.equal(await page.locator('#cameraRotation').inputValue(), '0');
        assert.equal(await page.locator('#cameraMirrorH').isChecked(), false);
        assert.equal(await page.locator('#cameraMirrorV').isChecked(), false);
        check('Editar camera acompanha a camera selecionada e o Monitoramento nao vira CRUD de cameras');

        updateCameraStatus = 200;
        cameraListData = [{ id: 1, nome: 'Entrada revisada', id_setor: 2, ip: 'rtsp://10.20.30.41:554/stream', rotacao: 90, espelhar_horizontal: false, espelhar_vertical: true }, cameraListData[1]];
        await page.locator('#cameraName').fill('Entrada revisada');
        await page.locator('#cameraIp').fill('rtsp://10.20.30.41:554/stream');
        await page.locator('#cameraSector').selectOption('2');
        await page.locator('#cameraRotation').selectOption('90');
        await page.locator('#cameraMirrorV').check();
        await page.locator('#saveCameraButton').click();
        await page.waitForFunction(() => !document.getElementById('cameraModal').classList.contains('active'));
        assert.equal(cameraRequests.at(-1).path, '/cameras/1');
        assert.deepEqual(cameraRequests.at(-1).body, {
            nome: 'Entrada revisada', ip: 'rtsp://10.20.30.41:554/stream', id_setor: 2,
            rotacao: 90, espelhar_horizontal: false, espelhar_vertical: true
        });
        // O rotulo do select e da lista vem do setor real, nao do nome enviado.
        await page.waitForFunction(() => document.querySelector('#cameraSelect option[value="1"]').textContent.includes('Expedicao')
            || document.querySelector('#cameraSelect option[value="1"]').textContent.includes('Expedição'));
        assert.equal(await page.locator('[data-camera-id="1"] small').innerText(), 'Expedição');
        assert.equal(await page.evaluate(() => currentCameraId), 1);
        // O modal reapresenta a transformacao confirmada pelo backend para esta camera.
        await page.locator('#openCameraModal').click();
        assert.equal(await page.locator('#cameraRotation').inputValue(), '90');
        assert.equal(await page.locator('#cameraMirrorH').isChecked(), false);
        assert(await page.locator('#cameraMirrorV').isChecked());
        await page.locator('#cancelCameraModal').click();
        // Salvar nao pode duplicar o stream, o container nem os listeners de midia.
        assert.equal(await page.locator('#videoStream').count(), 1);
        assert.equal(await page.locator('#videoContainer img').count(), 1);
        assert.equal(await page.locator('#videoContainer svg').count(), await page.locator('#videoContainer svg').count());
        assert(await page.locator('#videoContainer svg').count() <= 1);
        check('Salvar a camera selecionada atualiza a lista sem duplicar stream, container ou overlay');

        for (const [perfil, admin, allowed] of [['operador', false, false], ['supervisor', false, true], ['admin', true, true]]) {
            sessionUser = { id: 1, nome: 'Teste', perfil, admin, ativo: true };
            await page.evaluate(() => sessionStorage.clear());
            await page.goto('http://localhost:8765/monitoramento.html');
            await page.waitForFunction(() => document.querySelectorAll('#cameraSelect option').length === 2);
            assert.equal(await page.evaluate(() => canPerform('cameras:edit')), allowed);
            assert.equal(await page.locator('#openCameraModal').isVisible(), allowed);
        }
        check('Ação de editar câmera segue os perfis reais do backend: admin e supervisor sim, operador não');

        assert.equal(calls.some(url => /limit|offset|page|periodo=1/.test(url)), false);
        assert.deepEqual(errors, []);
        check('Sem parâmetros inventados e sem exceções JS');
        console.log(JSON.stringify({ passed: passed.length, pageErrors: errors, backend: 'simulado' }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
