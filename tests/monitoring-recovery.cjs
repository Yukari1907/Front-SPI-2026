// API simulada, relógio controlado e transporte MJPEG HTTP local; nenhuma escrita real.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { setTimeout: sleep } = require('node:timers/promises');
const root = path.resolve(__dirname, '..');
const passed = [], errors = [], calls = [], videoCalls = [], writes = [], connections = new Set();
const check = name => { passed.push(name); console.log('PASS', name); };
const zone = (id, nome = `Zona ${id}`, x = .1) => ({ id, nome, x, y: .2, largura: .3, altura: .4, permitido: false });
let zones = [zone(1), zone(2)], zonesStatus = 200, zoneGate = null;
let videoStatus = 200, videoMode = 'image', frame, holdFrames = false;
let detectionStatus = 200;
const eventually = async predicate => {
    const deadline = Date.now() + 8000;
    while (!await predicate()) {
        if (Date.now() > deadline) throw Error('Condição não satisfeita em 8s');
        await sleep(20);
    }
};

(async () => {
    const server = http.createServer((req, res) => {
        if (req.url.startsWith('/video/')) {
            videoCalls.push(req.url);
            if (videoStatus !== 200) { res.writeHead(videoStatus); res.end(); return; }
            if (videoMode === 'image') {
                res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
                res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#306090"/></svg>');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame', 'Cache-Control': 'no-store' });
            res.flushHeaders();
            connections.add(res);
            const timer = setInterval(() => {
                if (!holdFrames && frame) res.write(Buffer.concat([
                    Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'), frame, Buffer.from('\r\n')
                ]));
            }, 100);
            res.on('close', () => { clearInterval(timer); connections.delete(res); });
            return;
        }
        const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.writeHead(404); res.end(); return;
        }
        const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.SPI_CHROMIUM_EXECUTABLE || undefined });
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        await context.addInitScript(origin => { window.SPI_API_BASE_URL = origin; }, origin);
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (!['GET', 'OPTIONS'].includes(request.method())) {
                writes.push(url.pathname); return route.abort();
            }
            if (url.origin !== origin) {
                if (url.hostname === 'cdn.socket.io') return route.fulfill({ contentType: 'application/javascript', body: 'window.io=()=>({on:()=>{}});' });
                return route.fulfill({ body: '' });
            }
            let data = [], status = 200;
            if (url.pathname === '/session') data = { authenticated: true, user: { id: 1, nome: 'Teste', perfil: 'admin', admin: true, ativo: true } };
            else if (url.pathname === '/cameras' || url.pathname === '/cameras/status') data = [{ id: 1, nome: 'A', id_setor: 1 }, { id: 2, nome: 'B', id_setor: 1 }];
            else if (url.pathname === '/setores') data = [{ id: 1, nome: 'Produção' }];
            else if (url.pathname.startsWith('/zonas/camera/')) {
                calls.push(url.pathname);
                const response = { data: structuredClone(zones), status: zonesStatus };
                if (zoneGate) await zoneGate;
                if (response.status === 0) return route.abort('failed');
                return route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.data) });
            } else if (url.pathname.startsWith('/detections/')) {
                status = detectionStatus;
                data = { connected: true, detections: [], fps: 15, latencia_ms: 40 };
            } else if (!url.pathname.startsWith('/alertas')) return route.continue();
            calls.push(url.pathname);
            return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.install({ time: new Date('2026-09-22T12:00:00Z') });
        await page.clock.pauseAt(new Date('2026-09-22T12:00:01Z'));
        await page.goto(origin + '/monitoramento.html');
        // Relógio pausado não deve capturar transições de tema pela metade.
        await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
        const state = () => page.evaluate(() => monitoringContext?.state);
        const ready = () => eventually(async () => await state() === 'ready');
        const failed = () => eventually(async () => await state() === 'failed');
        const settled = () => eventually(() => page.evaluate(() => monitoringContext && !monitoringContext.zonesInFlight));
        const tick = async ms => { await page.clock.runFor(ms); await settled(); };
        const zonesCalls = () => calls.filter(call => call.startsWith('/zonas/camera/')).length;
        const hidden = async value => page.evaluate(value => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: value ? 'hidden' : 'visible' });
            document.dispatchEvent(new Event('visibilitychange'));
        }, value);
        const sameStructure = () => page.evaluate(() => window.savedImage === document.getElementById('videoStream')
            && window.savedOverlay === document.getElementById('zonasOverlay')
            && window.savedError === window.savedImage.onerror && window.savedLoad === window.savedImage.onload);
        const saveStructure = () => page.evaluate(() => {
            window.savedImage = document.getElementById('videoStream');
            window.savedOverlay = document.getElementById('zonasOverlay');
            window.savedError = window.savedImage.onerror;
            window.savedLoad = window.savedImage.onload;
        });
        await ready(); await settled(); await saveStructure();
        await page.evaluate(() => { window.unchangedZone = document.querySelector('[data-id="2"]'); });
        assert.equal(zonesCalls(), 1);
        const firstVideoCount = videoCalls.length;
        const detectionCount = calls.filter(call => call.startsWith('/detections/')).length;
        zones = [zone(1, 'Zona atualizada', .25), zone(2), zone(3)];
        await tick(14999); assert.equal(zonesCalls(), 1);
        await tick(1); assert.equal(zonesCalls(), 2);
        assert.equal(await page.locator('#zonasOverlay [data-id="1"] rect').getAttribute('x'), '25.00%');
        assert.match(await page.locator('#zonasOverlay').textContent(), /Zona atualizada/);
        assert.equal(await page.locator('#zonasOverlay g').count(), 3);
        assert(await sameStructure());
        assert.equal(videoCalls.length, firstVideoCount);
        assert.equal(await page.locator('#cameraSelect').inputValue(), '1');
        assert(calls.filter(call => call.startsWith('/detections/')).length > detectionCount);
        check('Zonas relidas em 15s atualizam geometria/nome sem reiniciar câmera, stream ou detecções');
        assert(await page.evaluate(() => window.unchangedZone === document.querySelector('[data-id="2"]')));
        await page.evaluate(() => { window.changedZone = document.querySelector('[data-id="1"]'); });
        await tick(15000);
        assert(await page.evaluate(() => window.changedZone === document.querySelector('[data-id="1"]')));
        assert.equal(await page.locator('#zonasOverlay').count(), 1);
        assert.equal(await page.locator('#zonasOverlay g').count(), 3);
        check('Somente grupos alterados são substituídos; respostas idênticas não duplicam ou recriam SVG/grupos');

        for (const failure of [503, 0, 'formato', 'zona inválida']) {
            zonesStatus = typeof failure === 'number' ? failure : 200;
            zones = failure === 'formato' ? {} : failure === 'zona inválida' ? [null] : [];
            await tick(15000);
            assert.equal(await page.locator('#zonasOverlay g').count(), 3);
            assert.equal(await state(), 'ready');
            assert(await sameStructure());
            check(`Falha de zonas (${failure}) preserva o último overlay válido e o vídeo`);
        }
        zonesStatus = 200; zones = [zone(4, 'Recuperada')];
        await tick(15000);
        assert.equal(await page.locator('#zonasOverlay g').count(), 1);
        assert.equal(await page.locator('#zonasOverlay [data-id="4"]').count(), 1);
        check('Próxima consulta recupera zonas e remove somente grupos ausentes');
        zones = []; await tick(15000);
        assert.equal(await page.locator('#zonasOverlay g').count(), 0);
        check('Lista vazia válida remove overlays antigos');
        zones = [zone(1), zone(1)]; await tick(15000);
        assert.equal(await page.locator('#zonasOverlay g').count(), 1);
        check('Resposta com IDs repetidos não duplica grupos SVG');

        let releaseZones;
        zoneGate = new Promise(resolve => { releaseZones = resolve; });
        await page.clock.runFor(15000);
        await eventually(() => page.evaluate(() => monitoringContext.zonesInFlight));
        const pendingCount = zonesCalls();
        await page.clock.runFor(60000);
        await page.evaluate(() => { fetchZonas(currentCameraId); fetchZonas(currentCameraId); });
        await hidden(true); await hidden(false);
        assert.equal(zonesCalls(), pendingCount);
        zoneGate = null; releaseZones(); await settled();
        await tick(15000); assert.equal(zonesCalls(), pendingCount + 1);
        check('Consulta lenta e retomada de visibilidade mantêm uma única requisição de zonas por contexto');

        zones = [zone(999, 'Contexto antigo')];
        zoneGate = new Promise(resolve => { releaseZones = resolve; });
        await page.clock.runFor(15000);
        await eventually(() => page.evaluate(() => monitoringContext.zonesInFlight));
        const oldZoneCount = zonesCalls();
        await page.evaluate(() => { window.oldZonesContext = monitoringContext; });
        zoneGate = null; zones = [zone(2, 'Contexto novo')];
        await page.evaluate(() => { selectCamera(2); selectCamera(1); });
        await ready(); await settled();
        releaseZones();
        await eventually(() => page.evaluate(() => !window.oldZonesContext.zonesInFlight));
        assert.equal(await page.locator('#zonasOverlay [data-id="999"]').count(), 0);
        assert.equal(await page.locator('#zonasOverlay [data-id="2"]').count(), 1);
        await tick(15000); assert.equal(zonesCalls(), oldZoneCount + 3);
        check('Troca A → B → A descarta zonas atrasadas e não rearma timers do contexto anterior');

        videoStatus = 503;
        await page.evaluate(() => renderVideoStream(currentCameraId));
        await failed(); await saveStructure();
        assert(await page.locator('#streamUnavailable').isVisible());
        assert.equal(await page.locator('#videoStream').count(), 1);
        assert.equal(await page.locator('#zonasOverlay').count(), 1);
        assert.equal(await page.locator('#videoStream').isVisible(), false);
        assert.equal(await page.locator('#zonasOverlay').isVisible(), false);
        check('503 inicial exibe indisponibilidade e preserva uma imagem e um SVG');
        const retryStart = videoCalls.length;
        await tick(4999); assert.equal(videoCalls.length, retryStart);
        await tick(1); await failed();
        assert.equal(videoCalls.length, retryStart + 1);
        assert.match(videoCalls.at(-1), /^\/video\/1\?retry=/);
        await tick(9999); assert.equal(videoCalls.length, retryStart + 1);
        await tick(1); await failed();
        await tick(19999); assert.equal(videoCalls.length, retryStart + 2);
        await tick(1); await failed();
        await tick(29999); assert.equal(videoCalls.length, retryStart + 3);
        await tick(1); await failed();
        assert.equal(videoCalls.length, retryStart + 4);
        assert.equal(new Set(videoCalls.slice(retryStart)).size, 4);
        check('Retry com cache-busting respeita backoff de 5/10/20/30s sem loop rápido');
        videoStatus = 200; await tick(30000); await ready();
        assert(await sameStructure());
        assert.equal(await page.locator('#streamUnavailable').isVisible(), false);
        assert(await page.locator('#videoStream').isVisible());
        assert(await page.locator('#zonasOverlay').isVisible());
        assert.equal(await page.locator('#cameraSelect').inputValue(), '1');
        check('Recuperação restaura automaticamente a mesma imagem/SVG e a câmera selecionada');

        detectionStatus = 503; await tick(3000);
        await eventually(async () => (await page.locator('#cameraConnectionStatus').textContent()).includes('indisponíveis'));
        assert.equal(await state(), 'ready');
        check('Falha de detecções não invalida vídeo recuperado');
        detectionStatus = 200; videoStatus = 503;
        await page.evaluate(() => { handleStreamError(document.getElementById('videoStream')); });
        await tick(3000);
        await eventually(async () => (await page.locator('#cameraConnectionStatus').textContent()) === 'Conectada');
        assert.equal(await state(), 'failed');
        check('Detecções recuperadas não removem indisponibilidade do vídeo');
        const afterFailure = videoCalls.length;
        await tick(1999); assert.equal(videoCalls.length, afterFailure);
        await tick(1); await failed(); assert.equal(videoCalls.length, afterFailure + 1);
        check('Após recuperação, nova falha reinicia backoff em 5s');

        await page.evaluate(() => {
            window.oldContext = monitoringContext;
            window.oldError = monitoringContext.img.onerror;
            window.oldLoad = monitoringContext.img.onload;
        });
        videoStatus = 200;
        await page.evaluate(() => selectCamera(2)); await ready(); await settled();
        const switchedCount = videoCalls.length;
        await page.evaluate(() => { window.oldError(); window.oldLoad(); });
        await tick(60000);
        assert.equal(videoCalls.length, switchedCount);
        assert.match(await page.locator('#videoStream').getAttribute('src'), /\/video\/2$/);
        assert.equal(await page.locator('#cameraSelect').inputValue(), '2');
        assert(await page.evaluate(() => ['zonesTimer', 'retryTimer', 'frameTimer'].every(key => window.oldContext[key] === null)));
        check('Troca durante retry cancela timers antigos e ignora handlers de erro/load da câmera anterior');

        videoStatus = 503;
        await page.evaluate(() => renderVideoStream(currentCameraId)); await failed(); await settled();
        await hidden(true);
        const hiddenVideos = videoCalls.length, hiddenZones = zonesCalls();
        await page.clock.runFor(120000);
        assert.equal(videoCalls.length, hiddenVideos); assert.equal(zonesCalls(), hiddenZones);
        assert(await page.evaluate(() => ['zonesTimer', 'retryTimer', 'frameTimer'].every(key => monitoringContext[key] === null)));
        check('Página oculta pausa zonas, retry e sondagem local sem acumular timers');
        videoStatus = 200;
        await hidden(false); await settled();
        assert.equal(zonesCalls(), hiddenZones + 1);
        await tick(4999); assert.equal(videoCalls.length, hiddenVideos);
        await tick(1); await ready(); assert.equal(videoCalls.length, hiddenVideos + 1);
        await tick(15000); assert.equal(zonesCalls(), hiddenZones + 2);
        check('Retomada revalida zonas e recupera vídeo respeitando o intervalo de retry');

        await saveStructure();
        const healthyVideoCount = videoCalls.length;
        await hidden(true); await page.clock.runFor(60000);
        await hidden(false); await settled(); await tick(15000);
        assert.equal(videoCalls.length, healthyVideoCount);
        assert(await sameStructure());
        check('Ocultar e reabrir página com vídeo válido preserva imagem, SVG, handlers e conexão');

        videoStatus = 503;
        await page.evaluate(() => {
            window.originalVideoUrl = window.apiVideoUrl;
            window.apiVideoUrl = id => `${window.originalVideoUrl(id)}?fixture=keep`;
            renderVideoStream(currentCameraId);
        });
        await failed(); await settled();
        assert.match(videoCalls.at(-1), /\?fixture=keep$/);
        videoStatus = 200; await tick(5000); await ready();
        assert.match(videoCalls.at(-1), /\?fixture=keep&retry=/);
        await page.evaluate(() => { window.apiVideoUrl = window.originalVideoUrl; });
        check('Cache-busting somente na reconexão preserva parâmetros existentes da URL');

        const geometry = async () => {
            const result = await page.evaluate(() => {
                const img = document.getElementById('videoStream'), svg = document.getElementById('zonasOverlay');
                const a = img.getBoundingClientRect(), b = svg.getBoundingClientRect();
                return { aligned: ['x', 'y', 'width', 'height'].every(key => Math.abs(a[key] - b[key]) < 1),
                    ratio: a.width / a.height, intrinsic: img.naturalWidth / img.naturalHeight,
                    fits: a.left >= 0 && a.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth };
            });
            assert(result.aligned && result.fits); assert(Math.abs(result.ratio - result.intrinsic) < .01);
        };
        for (const width of [1440, 768, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 700 : 1000 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
                videoStatus = 503;
                await page.evaluate(() => renderVideoStream(currentCameraId)); await failed(); await settled();
                assert(await page.locator('#streamUnavailable').isVisible());
                assert(await page.locator('#streamUnavailable').evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
                }));
                assert(await page.locator('#streamUnavailable').evaluate(el => {
                    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
                        const s = value / 255;
                        return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
                    }).reduce((total, value, i) => total + value * [.2126, .7152, .0722][i], 0);
                    const style = getComputedStyle(el), a = luminance(style.color), b = luminance(style.backgroundColor);
                    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5;
                }));
                await page.screenshot({ path: path.join(os.tmpdir(), `spi-stage5-${width}-${theme}-failed.png`), fullPage: true });
                videoStatus = 200; await tick(5000); await ready();
                await geometry();
                assert.equal(await page.locator('#videoStream').count(), 1);
                assert.equal(await page.locator('#zonasOverlay').count(), 1);
                await page.screenshot({ path: path.join(os.tmpdir(), `spi-stage5-${width}-${theme}-ready.png`), fullPage: true });
                check(`Indisponibilidade e recuperação alinhadas, sem duplicação/overflow: ${width}px / ${theme}`);
            }
        }

        frame = Buffer.from(await page.evaluate(() => {
            const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = '#306090'; ctx.fillRect(0, 0, 640, 360);
            return canvas.toDataURL('image/jpeg').split(',')[1];
        }), 'base64');
        videoMode = 'mjpeg'; videoStatus = 503;
        await page.evaluate(() => renderVideoStream(currentCameraId)); await failed(); await settled();
        videoStatus = 200;
        await tick(5000);
        await eventually(() => page.evaluate(() => document.getElementById('videoStream').naturalWidth === 640));
        await tick(500); await ready();
        assert.equal(connections.size, 1);
        await geometry();
        assert.equal(await page.locator('#streamUnavailable').isVisible(), false);
        check('503 recupera para MJPEG multipart aberto, com primeiro frame visível sem depender de load');
        // Erro de transporte real: interrompe a resposta multipart após os frames.
        videoStatus = 503;
        for (const response of connections) response.destroy();
        await eventually(() => page.evaluate(() => document.getElementById('videoStream').naturalWidth === 0));
        await tick(5000);
        await failed();
        await tick(5000); await failed();
        videoStatus = 200; await tick(10000);
        await eventually(() => page.evaluate(() => document.getElementById('videoStream').naturalWidth === 640));
        await tick(500); await ready(); await geometry();
        check('Interrupção HTTP do MJPEG em andamento exibe erro e reconecta automaticamente');

        holdFrames = true;
        await page.evaluate(() => renderVideoStream(currentCameraId)); await settled();
        await eventually(() => connections.size === 1);
        await tick(30000); await failed();
        assert(await page.locator('#streamUnavailable').isVisible());
        holdFrames = false; await tick(5000);
        await eventually(() => page.evaluate(() => document.getElementById('videoStream').naturalWidth === 640));
        await tick(500); await ready();
        check('MJPEG sem primeiro frame expira em 30s e recupera na próxima tentativa');

        zones = [zone(999, 'Resposta após saída')];
        zoneGate = new Promise(resolve => { releaseZones = resolve; });
        await page.clock.runFor(15000);
        await eventually(() => page.evaluate(() => monitoringContext.zonesInFlight));
        await page.evaluate(() => {
            window.disposedContext = monitoringContext;
            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        });
        const stoppedVideoCount = videoCalls.length, stoppedZoneCount = zonesCalls();
        zoneGate = null; releaseZones();
        await eventually(() => page.evaluate(() => !window.disposedContext.zonesInFlight));
        assert.equal(await page.locator('#zonasOverlay [data-id="999"]').count(), 0);
        check('Resposta de zonas após pagehide é descartada e não rearma polling');
        await page.clock.runFor(120000);
        assert.equal(videoCalls.length, stoppedVideoCount); assert.equal(zonesCalls(), stoppedZoneCount);
        assert(await page.evaluate(() => monitoringContext === null && detectionsInterval === null
            && ['zonesTimer', 'retryTimer', 'frameTimer'].every(key => window.disposedContext[key] === null)
            && window.disposedContext.img.onload === null && window.disposedContext.img.onerror === null));
        await eventually(() => connections.size === 0);
        check('pagehide limpa timers/handlers e encerra conexão MJPEG');
        videoMode = 'image';
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
        await ready(); await settled();
        assert.equal(await page.locator('#cameraSelect').inputValue(), '2');
        assert.equal(videoCalls.length, stoppedVideoCount + 1);
        assert.equal(zonesCalls(), stoppedZoneCount + 1);
        check('Retorno pelo cache de navegação restaura o contexto da câmera selecionada');
        await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
        await page.clock.runFor(120000);
        assert.equal(videoCalls.length, stoppedVideoCount + 1); assert.equal(zonesCalls(), stoppedZoneCount + 1);
        check('beforeunload também impede novos timers/requisições');
        assert.deepEqual(writes, []); assert.deepEqual(errors, []);
        check('Zero mutações HTTP e zero exceções JavaScript');
        console.log(JSON.stringify({ passed: passed.length, pageErrors: errors, backend: 'simulado', transport: 'imagem e MJPEG multipart HTTP' }));
    } finally {
        if (browser) await browser.close();
        for (const response of connections) response.destroy();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
