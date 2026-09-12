const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const front = path.resolve(__dirname, '..');
const stage = front;
const errors = [], calls = [], passed = [];
let detections = { connected: true, fps: 15, latencia_ms: 46, class_count: { sem_capacete: 1, pessoa: 2 }, detections: [{ label: 'sem_capacete', confidence: 0 }] };
let detectionStatus = 200;
let alertsStatus = 200;
let cameraStatus = 200;
let cameras = [{ id: 1, nome: 'Entrada', id_setor: 1, status: 'Ativo' }, { id: 2, nome: 'Saída', id_setor: 1, status: 'Desconectado' }, { id: 3, status: 'Inativo' }];
const alertData = [
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
                let status = 200, data;
                if (url.pathname === '/session') data = {};
                else if (url.pathname === '/cameras/status') { data = cameras; status = cameraStatus; }
                else if (url.pathname === '/cameras') data = cameras.slice(0, 2);
                else if (url.pathname === '/setores') data = [{ id: 1, nome: 'Produção' }];
                else if (url.pathname.startsWith('/zonas/')) data = [];
                else if (url.pathname.startsWith('/detections/')) { data = detections; status = detectionStatus; }
                else if (url.pathname.startsWith('/video/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"/>' });
                else if (url.pathname.startsWith('/alertas/estatisticas')) data = [];
                else if (/\/alertas\/\d+\/resolvido/.test(url.pathname)) data = { message: 'OK' };
                else if (url.pathname === '/alertas') { data = alertData; status = alertsStatus; }
                else throw Error('API inesperada: ' + url.pathname);
                return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
            }
            if (url.hostname === 'cdn.socket.io') return route.fulfill({ contentType: 'application/javascript', body: 'window.socketHandlers={};window.io=()=>({on:(event,callback)=>window.socketHandlers[event]=callback});' });
            if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'application/javascript', body: 'window.Chart=class {static defaults={};constructor(){}};' });
            if (url.hostname !== 'localhost') return route.fulfill({ body: '', contentType: 'text/css' });
            const file = decodeURIComponent(url.pathname).replace(/^\//, '');
            const target = fs.existsSync(path.join(stage, file)) ? path.join(stage, file) : path.join(front, file);
            const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
            if (!fs.existsSync(target)) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ body: fs.readFileSync(target), contentType: types[path.extname(target)] || 'text/plain' });
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://localhost:8765/monitoramento.html');
        await page.waitForFunction(() => document.getElementById('performanceFps').textContent === '15.0');
        assert.match(await page.locator('#detectionsContainer').innerText(), /sem_capacete.*[\s\S]*0\.0%/);
        assert.match(await page.locator('#detectionsContainer').innerText(), /pessoa: 2/);
        assert.equal(await page.locator('#performanceFpsBar').evaluate(el => el.style.width), '50%');
        assert.equal(await page.locator('#performanceLatencyBar').evaluate(el => el.style.width), '23%');
        check('Objeto de detecções, class_count independente, confiança zero e métricas');

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
        assert.doesNotMatch(await page.locator('#detectionsContainer').innerText(), /sem_capacete/);
        detectionStatus = 503;
        await page.evaluate(() => fetchDetections(1));
        assert.equal(await page.locator('#performanceFps').innerText(), '—');
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
        check('Resposta atrasada da câmera anterior é ignorada');

        await page.evaluate(() => window.socketHandlers.novo_alerta({ evento: 'Possível queda', severidade: 3, tipo_deteccao: 'queda', id_camera: 2, id_zona: null, nome_camera: '<img src=x onerror=alert(1)>', nome_setor: 'Produção', nome_zona: null }));
        assert.match(await page.locator('#notificationList').innerText(), /Possível queda.*<img.*Produção/);
        assert.equal(await page.locator('#notificationList img').count(), 0);
        assert.match(await page.locator('#toastContainer').innerText(), /Produção/);
        assert.equal(await page.evaluate(() => formatAlertNotification({ evento: 'Alerta', id_camera: 2 })), 'Alerta — Câmera 2');
        assert.equal(await page.evaluate(() => formatAlertNotification({ evento: 'Alerta' })), 'Alerta');
        check('Notificação de queda sem zona, fallback e escape de HTML em nomes');

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
        check('Severidade numérica, filtro, contagem global, resolução e navegação pendente');

        alertsStatus = 404;
        await page.evaluate(() => loadAlertsFromApi());
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['0', '0', '0', '0']);
        alertsStatus = 500;
        await page.evaluate(() => loadAlertsFromApi());
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['—', '—', '—', '—']);
        check('404 de alertas vira vazio; erro de API não vira contagem zero');

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
        await page.goto('http://localhost:8765/mapeamento.html');
        await page.waitForFunction(() => !!window.socketHandlers.novo_alerta);
        await page.evaluate(() => window.socketHandlers.novo_alerta({ evento: 'Possível queda', severidade: 3, id_camera: 1, nome_camera: 'Entrada', nome_setor: 'Produção', tipo_deteccao: 'queda', id_zona: null }));
        assert.match(await page.locator('#mapAlertIndicator').innerText(), /Possível queda \(1\)/);
        check('mapeamento.js existente aceita payload novo sem alterações');
        assert.equal(calls.some(url => /limit|offset|page|periodo=1/.test(url)), false);
        assert.deepEqual(errors, []);
        check('Sem parâmetros inventados, KPI de hoje fora do escopo e sem exceções JS');
        console.log(JSON.stringify({ passed: passed.length, pageErrors: errors, backend: 'simulado' }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
