// Transporte MJPEG real; câmeras e imagens sintéticas existem somente neste teste.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.SPI_CHROMIUM_EXECUTABLE || undefined });
    const errors = [], posts = [], puts = [], streams = new Set(), passed = [];
    let zones = [];
    let frame, holdFrames = false, healthGate = null, connected = true;
    const check = name => { passed.push(name); console.log('PASS', name); };
    const server = http.createServer((req, res) => {
        if (req.url.startsWith('/stream/')) {
            res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame', 'Cache-Control': 'no-store' });
            res.flushHeaders();
            streams.add(res);
            const timer = setInterval(() => {
                if (!holdFrames && frame) {
                    res.write(Buffer.concat([Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'), frame, Buffer.from('\r\n')]));
                }
            }, 100);
            res.on('close', () => { clearInterval(timer); streams.delete(res); });
            return;
        }
        const target = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
        if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
            res.writeHead(404); res.end(); return;
        }
        const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
        res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
        res.end(fs.readFileSync(target));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 700 } });
        await context.addInitScript(() => localStorage.setItem('visaoepi_session', JSON.stringify({ authenticated: true, role: 'Administrador', name: 'Teste' })));
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.continue();
            if (url.port === '5000') {
                let data = [];
                if (url.pathname === '/session') data = { authenticated: true, user: { id: 1, nome: 'Teste', perfil: 'admin', admin: true, ativo: true } };
                else if (url.pathname === '/cameras' || url.pathname === '/cameras/status') data = [{ id: 1, nome: 'A', status: 'Ativo' }, { id: 2, nome: 'B', status: 'Ativo' }];
                else if (url.pathname.startsWith('/detections/')) {
                    data = { connected };
                    const gate = healthGate;
                    if (gate) await gate;
                } else if (url.pathname === '/zonas/registrar') posts.push(route.request().postDataJSON());
                else if (/^\/zonas\/\d+$/.test(url.pathname)) {
                    puts.push({ method: route.request().method(), path: url.pathname, body: route.request().postDataJSON() });
                    data = { id: Number(url.pathname.split('/').pop()) };
                }
                else if (url.pathname === '/zonas') data = zones;
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
            }
            if (url.hostname === 'cdn.socket.io') return route.fulfill({ contentType: 'application/javascript', body: 'window.io=()=>({on:()=>{}});' });
            return route.fulfill({ body: '' });
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + '/mapeamento.html');
        await page.waitForFunction(() => document.querySelectorAll('#zoneCamera option').length === 3);
        await page.evaluate(origin => {
            let connection = 0;
            window.apiVideoUrl = id => `${origin}/stream/${id}?connection=${++connection}`;
        }, origin);
        const jpeg = async (width, height) => Buffer.from(await page.evaluate(([width, height]) => {
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#306090'; ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width / 4, height / 4);
            return canvas.toDataURL('image/jpeg').split(',')[1];
        }, [width, height]), 'base64');
        frame = await jpeg(1920, 1080);
        await page.locator('#openZoneModal').click();
        await page.locator('#zoneCamera').selectOption('1');
        await page.locator('#zoneAreaOverlay').waitFor({ state: 'visible' });
        assert.equal(streams.size, 1);
        assert.deepEqual(await page.locator('#zoneFrame').evaluate(el => [el.naturalWidth, el.naturalHeight]), [1920, 1080]);
        const draw = async () => {
            const area = page.locator('#zoneAreaOverlay');
            await area.scrollIntoViewIfNeeded();
            const box = await area.boundingBox();
            await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
            await page.mouse.down();
            await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
            await page.mouse.up();
            assert(await page.locator('#zoneAreaRect').isVisible());
        };
        await draw();
        check('MJPEG multipart contínuo: primeiro frame habilita desenho sem esperar o fim da resposta');
        frame = await jpeg(1080, 1920);
        await page.waitForFunction(() => document.getElementById('zoneFrame').naturalHeight === 1920);
        await page.waitForFunction(() => document.getElementById('zoneAreaRect').style.display === 'none');
        await draw();
        check('Mudança de resolução no mesmo MJPEG limpa a seleção e permite desenhar no frame vertical');
        await page.locator('#cancelZoneModal').click();
        await page.waitForFunction(() => !document.getElementById('zoneFrame'));
        // Aguarda o cancelamento da conexão no servidor sem manter o stream vivo.
        await new Promise((resolve, reject) => {
            const deadline = Date.now() + 5000;
            const timer = setInterval(() => {
                if (!streams.size) { clearInterval(timer); resolve(); }
                else if (Date.now() > deadline) { clearInterval(timer); reject(Error('Stream não encerrado')); }
            }, 50);
        });
        check('Fechar o modal encerra a conexão MJPEG e remove a imagem');

        holdFrames = true;
        await page.locator('#openZoneModal').click();
        await page.locator('#zoneName').fill('Sem frame');
        await page.locator('#zoneCamera').selectOption('1');
        await page.locator('#saveZoneButton').click();
        assert.equal(posts.length, 0);
        await page.waitForFunction(() => document.getElementById('zoneAreaStatus').textContent.includes('indisponível'), null, { timeout: 15000 });
        assert.equal(await page.locator('#zoneFrame').count(), 0);
        assert(await page.locator('#retryZoneFrame').isVisible());
        holdFrames = false;
        await page.locator('#retryZoneFrame').click();
        await page.locator('#zoneAreaOverlay').waitFor({ state: 'visible' });
        check('MJPEG sem primeiro frame expira em 12s, impede cadastro e recupera no retry');

        let releaseHealth;
        connected = false;
        healthGate = new Promise(resolve => { releaseHealth = resolve; });
        const request = page.waitForRequest(req => new URL(req.url()).pathname === '/detections/2');
        await page.locator('#zoneCamera').selectOption('2');
        await request;
        const oldGate = healthGate;
        healthGate = null;
        connected = true;
        await page.locator('#zoneCamera').selectOption('1');
        await page.locator('#zoneAreaOverlay').waitFor({ state: 'visible' });
        await draw();
        releaseHealth();
        await oldGate;
        await page.waitForTimeout(200);
        assert(await page.locator('#zoneAreaRect').isVisible());
        check('Resposta de conexão atrasada da câmera anterior não invalida a seleção atual');

        healthGate = new Promise(resolve => { releaseHealth = resolve; });
        await page.waitForFunction(() => document.getElementById('zoneAreaStatus').textContent.includes('indisponível'), null, { timeout: 12000 });
        assert.equal(await page.locator('#zoneFrame').count(), 0);
        releaseHealth(); healthGate = null;
        assert.deepEqual(errors, []);
        assert.equal(posts.length, 0);
        check('Consulta de conexão sem resposta expira, descarta seleção e não produz exceções JS');

        // Edição de zona sobre o mesmo transporte MJPEG real.
        await page.locator('#cancelZoneModal').click();
        zones = [{ id: 9, nome: 'Área persistida', id_camera: 1, x: 0.2, y: 0.15, largura: 0.4, altura: 0.3, permitido: false }];
        await page.evaluate(() => loadRiskZones());
        frame = await jpeg(1280, 720);
        const readRect = () => page.locator('#zoneAreaRect').evaluate(rect =>
            ['x', 'y', 'width', 'height'].map(key => Number(rect.getAttribute(key))));
        await page.locator('[data-edit-zone="9"]').click();
        await page.locator('#zoneAreaOverlay').waitFor({ state: 'visible' });
        assert.deepEqual(await page.locator('#zoneFrame').evaluate(el => [el.naturalWidth, el.naturalHeight]), [1280, 720]);
        assert.deepEqual(await readRect(), [0.2, 0.15, 0.4, 0.3]);
        assert.equal(await page.locator('#zoneName').inputValue(), 'Área persistida');
        check('Edição sobre MJPEG real desenha a área persistida da zona sobre o frame da câmera');

        frame = await jpeg(720, 1280);
        await page.waitForFunction(() => document.getElementById('zoneFrame').naturalWidth === 720);
        await page.waitForFunction(() => document.getElementById('zoneAreaStatus').textContent.includes('Área atual da zona'));
        assert.deepEqual(await readRect(), [0.2, 0.15, 0.4, 0.3]);
        // Descarta frames ainda em decodificação na resolução anterior antes de redesenhar.
        await page.waitForTimeout(600);
        assert.deepEqual(await page.locator('#zoneFrame').evaluate(el => [el.naturalWidth, el.naturalHeight]), [720, 1280]);
        await draw();
        const redrawn = await readRect();
        assert.notDeepEqual(redrawn, [0.2, 0.15, 0.4, 0.3]);
        await page.locator('#saveZoneButton').click();
        await page.waitForFunction(() => !document.getElementById('zoneModal').classList.contains('active'));
        assert.equal(posts.length, 0);
        assert.equal(puts.length, 1);
        assert.equal(puts[0].method, 'PUT');
        assert.equal(puts[0].path, '/zonas/9');
        assert.deepEqual([puts[0].body.x, puts[0].body.y, puts[0].body.largura, puts[0].body.altura], redrawn);
        assert.equal(puts[0].body.id_camera, 1);
        assert.equal('id_epi' in puts[0].body, false);
        assert.deepEqual(errors, []);
        check('Troca de resolução preserva a área persistida e o redesenho envia PUT /zonas/{id} com a nova área normalizada');
        console.log(JSON.stringify({ passed: passed.length, pageErrors: errors, backend: 'simulado', transport: 'MJPEG multipart HTTP' }));
    } finally {
        await browser.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
