// Regressões da Etapa 4. Rede integralmente interceptada; nenhuma API real.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const passed = [], failures = [], pageErrors = [], writes = [];
const camera = { id: 1, nome: 'Entrada', ip: 'rtsp://audit-user:audit-password@camera.test/live', id_setor: 1, rotacao: 90, espelhar_horizontal: true, espelhar_vertical: false };
const zones = [7, 8].map((id, index) => ({ id, nome: `Zona ${id}`, id_camera: 1, x: .1, y: .1, largura: .3, altura: .3, permitido: true, epis_id: [5 + index] }));
const epis = [5, 6].map(id => ({ id, nome: `EPI ${id}`, categoria: 'Cabeça', certificado: 'CA123', validade: '2030-01-01', estoque: 10, quantidade_min: 1, em_uso: 2 }));
const alerts = [1, 2].map(id => ({ id, evento: `Evento ${id}`, data: '2026-09-23 10:00:00', resolvido: false, severidade: 2, tipo_deteccao: 'epi', id_camera: 1, id_zona: 7 }));

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.SPI_CHROMIUM_EXECUTABLE || undefined });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (url.port === '5000') {
                let data;
                if (request.method() !== 'GET') {
                    writes.push({ path: url.pathname, method: request.method(), body: request.postDataJSON() });
                    if (/^\/cameras\/\d+$/.test(url.pathname)) data = { ...camera, ...request.postDataJSON() };
                    else if (url.pathname === '/cameras/registrar') data = { ...request.postDataJSON(), id: 2 };
                    else if (/^\/zonas\/\d+$/.test(url.pathname)) data = { ...request.postDataJSON(), id: 8 };
                    else if (/\/resolvido$/.test(url.pathname)) data = { message: 'OK' };
                    else if (url.pathname === '/epis') data = { ...request.postDataJSON(), id: 9 };
                    else if (/^\/epis\/\d+$/.test(url.pathname)) data = { ...request.postDataJSON(), id: Number(url.pathname.split('/').pop()) };
                    else throw Error('Mutação inesperada: ' + url.pathname);
                } else if (url.pathname === '/session') data = { authenticated: true, user: { id: 1, nome: 'Auditoria', perfil: 'admin', admin: true, ativo: true } };
                else if (url.pathname === '/cameras') data = [camera];
                else if (url.pathname === '/cameras/status') data = [{ ...camera, status: 'Ativo' }];
                else if (url.pathname === '/setores') data = [{ id: 1, nome: 'Setor real' }];
                else if (url.pathname === '/zonas' || url.pathname.startsWith('/zonas/camera/')) data = zones;
                else if (url.pathname === '/epis') data = epis;
                else if (url.pathname === '/alertas') data = alerts;
                else if (url.pathname.startsWith('/alertas/estatisticas')) data = [];
                else if (url.pathname.startsWith('/estatisticas/')) data = { total_conformes: 8, total_nao_conformes: 2, total_deteccoes: 10, conformidade_media: '80.0' };
                else if (url.pathname === '/users') data = [];
                else if (url.pathname === '/active-learning/status') data = { enabled: false };
                else if (url.pathname === '/video/lote') return route.fulfill({ status: 500, contentType: 'text/html', body: 'Falha simulada de atributo do worker' });
                else if (url.pathname.startsWith('/detections/')) data = { connected: true, detections: [], class_count: {}, fps: 0, latencia_ms: null };
                else if (url.pathname.startsWith('/video/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"/>' });
                else throw Error('GET inesperado: ' + url.pathname);
                return route.fulfill({ status: url.pathname === '/cameras/registrar' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(data) });
            }
            if (url.hostname === 'cdn.socket.io') return route.fulfill({ contentType: 'application/javascript', body: 'window.io=()=>({on(){}});' });
            if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'application/javascript', body: 'window.Chart=class {static defaults={};constructor(el,c){this.data=c.data;}update(){}};' });
            if (url.hostname !== 'localhost') return route.fulfill({ body: '' });
            const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
            if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
        });
        const page = await context.newPage();
        page.on('pageerror', e => pageErrors.push(e.message));
        const visit = async name => {
            await page.goto(`http://localhost:8765/${name}.html`);
            await page.evaluate(() => window.sessionReady);
            await page.waitForLoadState('networkidle');
        };
        const check = async (name, run) => {
            try { await run(); passed.push(name); console.log('PASS', name); }
            catch (error) { failures.push({ name, error: error.message }); console.error('FAIL', name, error.message); }
        };

        await check('Credenciais de câmera não persistem em storage; cache legado é removido e PUT preserva a origem', async () => {
            await visit('perfil');
            await page.evaluate(camera => sessionStorage.setItem('visaoepi_cache:http://old.test:99:/cameras', JSON.stringify({ savedAt: Date.now(), result: { ok: true, data: [camera] } })), camera);
            await visit('monitoramento');
            assert.doesNotMatch(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage })), /audit-password|audit-user|camera\.test/);
            await page.locator('#openCameraModal').click();
            assert.equal(await page.locator('#cameraIp').inputValue(), camera.ip);
            await page.locator('#cameraName').fill('Entrada revisada');
            await page.locator('#saveCameraButton').click();
            await page.waitForFunction(() => !document.getElementById('cameraModal').classList.contains('active'));
            assert.equal(writes.at(-1).body.ip, camera.ip);
            assert.deepEqual(Object.keys(writes.at(-1).body).sort(), ['espelhar_horizontal', 'espelhar_vertical', 'id_setor', 'ip', 'nome', 'rotacao']);
            assert.doesNotMatch(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage })), /audit-password|audit-user|camera\.test/);
        });
        await check('Origem da câmera fica mascarada e sai do formulário ao fechar', async () => {
            await visit('monitoramento');
            await page.locator('#openCameraModal').click();
            assert.equal(await page.locator('#cameraIp').getAttribute('type'), 'password');
            await page.locator('#cancelCameraModal').click();
            assert.equal(await page.locator('#cameraIp').inputValue(), '');
            await visit('mapeamento');
            await page.locator('#openCameraCreateModal').click();
            assert.equal(await page.locator('#newCameraIp').getAttribute('type'), 'password');
            await page.locator('#newCameraIp').fill(camera.ip);
            await page.locator('#cameraCreateModal [data-close-modal]').first().click();
            assert.equal(await page.locator('#newCameraIp').inputValue(), '');
        });
        await check('Cache de câmeras mantém TTL em memória, invalidação e limpeza de sessão', async () => {
            await visit('perfil');
            const result = await page.evaluate(async () => {
                apiClearCached('/cameras');
                const original = window.fetch; let reads = 0;
                window.fetch = (...args) => { if (String(args[0]).endsWith('/cameras')) reads++; return original(...args); };
                await apiGetCached('/cameras', 45000); await apiGetCached('/cameras', 45000);
                const first = reads;
                apiClearCached('/cameras'); await apiGetCached('/cameras', 45000);
                const invalidated = reads;
                clearApiSession(); await apiGetCached('/cameras', 45000);
                window.fetch = original;
                return { first, invalidated, cleared: reads };
            });
            assert.deepEqual(result, { first: 1, invalidated: 2, cleared: 3 });
        });
        await check('Resposta antiga de EPIs não troca seleção de outra zona nem o payload do PUT', async () => {
            await visit('mapeamento');
            await page.evaluate(() => {
                const original = apiGet;
                window.epiPending = [];
                window.apiGet = path => path === '/epis' ? new Promise(resolve => epiPending.push(resolve)) : original(path);
                openZoneModal(mappingZones[0]);
                openZoneModal(mappingZones[1]);
            });
            await page.evaluate(data => epiPending[1]({ ok: true, status: 200, data }), epis);
            await page.waitForFunction(() => zoneEpisReady);
            await page.evaluate(data => epiPending[0]({ ok: true, status: 200, data }), epis);
            assert.deepEqual(await page.locator('#zoneEpiOptions input:checked').evaluateAll(es => es.map(e => Number(e.value))), [6]);
            await page.waitForFunction(() => zoneAreaEditor.ready);
            await page.locator('#saveZoneButton').click();
            await page.waitForFunction(() => !document.getElementById('zoneModal').classList.contains('active'));
            assert.equal(writes.at(-1).path, '/zonas/8');
            assert.deepEqual(writes.at(-1).body.ids_epis, [6]);
        });
        await check('Resposta antiga de EPIs com erro não apaga a seleção válida atual', async () => {
            await visit('mapeamento');
            const selected = await page.evaluate(async data => {
                const original = apiGet; let resolveOld;
                window.apiGet = path => path === '/epis' ? new Promise(resolve => { resolveOld = resolve; }) : original(path);
                openZoneModal(mappingZones[0]);
                window.apiGet = original;
                openZoneModal(mappingZones[1]);
                while (!zoneEpisReady) await new Promise(resolve => setTimeout(resolve, 10));
                resolveOld({ ok: false, status: 500, data: null });
                await new Promise(resolve => setTimeout(resolve, 0));
                return [...document.querySelectorAll('#zoneEpiOptions input:checked')].map(e => Number(e.value));
            }, epis);
            assert.deepEqual(selected, [6]);
        });
        await check('Resolver alerta fixa o ID, bloqueia duplicação e preserva outro modal aberto', async () => {
            await visit('alertas');
            await page.evaluate(() => {
                window.resolveCalls = [];
                window.resolvePending = [];
                window.apiPut = path => { resolveCalls.push(path); return new Promise(resolve => resolvePending.push(resolve)); };
                viewAlert(1); window.firstResolve = resolveCurrentAlert();
                resolveCurrentAlert();
                closeAlertModal(); viewAlert(2);
                resolvePending.forEach(resolve => resolve({ ok: true, status: 200, data: { message: 'OK' } }));
            });
            await page.evaluate(() => firstResolve);
            assert.deepEqual(await page.evaluate(() => resolveCalls), ['/alertas/1/resolvido']);
            assert.deepEqual(await page.evaluate(() => alerts.map(a => a.resolvido)), [true, false]);
            assert(await page.locator('#alertDetailsModal').isVisible());
            assert.equal(await page.locator('#alertDetailTitle').innerText(), 'Evento 2');
        });
        await check('Falha na resolução mantém dados e libera retry', async () => {
            await visit('alertas');
            await page.evaluate(async () => { window.apiPut = async () => ({ ok: false, status: 500 }); viewAlert(1); await resolveCurrentAlert(); });
            assert.deepEqual(await page.evaluate(() => alerts.map(a => a.resolvido)), [false, false]);
            assert(await page.locator('#resolveAlertButton').isEnabled());
            assert(await page.locator('#alertDetailsModal').isVisible());
        });
        await check('Textos finais não prometem entregas ou estado de alerta inexistente', async () => {
            await visit('alertas');
            assert.deepEqual(await page.locator('#alertStatus option').allTextContents(), ['Todos', 'Pendente', 'Resolvido']);
            await page.locator('#globalSearch').fill('conformidade');
            assert.doesNotMatch(await page.locator('.search-results').innerText(), /Colaboradores|entregas/);
            await visit('configuracao');
            assert.doesNotMatch(await page.locator('main').innerText(), /aguardando atualização do servidor|backend|endpoint/i);
            assert.match(await page.locator('#workerBatchState').innerText(), /indisponível/);
            assert(await page.locator('#applyWorkerBatch').isDisabled());
        });
        await check('Datas atuais e HTTP-date preservam dia/hora em todos os consumidores de alertas', async () => {
            await visit('alertas');
            assert.equal(await page.evaluate(() => formatDateTime('2026-09-23 00:15:00')), '23/09/2026, 00:15');
            assert.equal(await page.evaluate(() => formatDateTime('Wed, 23 Sep 2026 00:15:00 GMT')), '23/09/2026, 00:15');
            await visit('dashboard');
            assert.equal(await page.evaluate(() => formatTime('2026-09-23 00:15:00')), '00:15');
            await visit('relatorios');
            assert.equal(await page.evaluate(() => backendDayKey('2026-09-23 00:15:00')), '2026-09-23');
        });
        await check('Cadastro de EPI atualiza categorias e preserva o filtro ativo da tabela', async () => {
            await visit('inventario');
            await page.locator('#inventoryCategory').selectOption('Cabeça');
            await page.locator('#openInventoryModal').click();
            for (const [name, value] of Object.entries({ name: 'Luva', category: 'Mãos', certificate: 'CA456', expiration: '2031-01-01', quantity: '4', minimumQuantity: '1', inUse: '0' })) {
                await page.locator(`#inventoryForm [name="${name}"]`).fill(value);
            }
            await page.locator('#inventoryForm [type="submit"]').click();
            await page.waitForFunction(() => !document.getElementById('inventoryModal').classList.contains('active'));
            assert.deepEqual(await page.locator('#inventoryCategory option').allTextContents(), ['Todas', 'Mãos', 'Cabeça']);
            assert.equal(await page.locator('#inventoryCategory').inputValue(), 'Cabeça');
            assert.doesNotMatch(await page.locator('#inventoryTable').innerText(), /Luva/);
            await page.locator('#inventoryCategory').selectOption('Mãos');
            assert.match(await page.locator('#inventoryTable').innerText(), /Luva/);
        });
        await check('Edição da última categoria atualiza o select e reaplica busca/status', async () => {
            await visit('inventario');
            await page.locator('#inventorySearch').fill('EPI 5');
            await page.evaluate(() => editInventoryItem(5));
            await page.locator('#inventoryForm [name="category"]').fill('Auditiva');
            await page.locator('#inventoryForm [type="submit"]').click();
            await page.waitForFunction(() => !document.getElementById('inventoryModal').classList.contains('active'));
            assert.deepEqual(await page.locator('#inventoryCategory option').allTextContents(), ['Todas', 'Auditiva', 'Cabeça']);
            assert.match(await page.locator('#inventoryTable').innerText(), /EPI 5/);
            assert.doesNotMatch(await page.locator('#inventoryTable').innerText(), /EPI 6/);
        });
        for (const name of ['inventario', 'relatorios']) await check(`CSV de ${name} neutraliza fórmulas, preservando números e aspas`, async () => {
            await visit(name);
            await page.evaluate(name => {
                if (name === 'inventario') {
                    inventoryItems[0].name = '=1+1'; inventoryItems[0].category = '+SUM(1)';
                    inventoryItems[0].certificate = 'CA"123'; filterInventory();
                } else { reportSummary = { total: 2, resolved: 1, rate: '50.0%' }; reportSectors = [['=1+1', 2], ['+SUM(1)', 0], ['CA"123', 1]]; }
            }, name);
            const pending = page.waitForEvent('download');
            await page.locator(name === 'inventario' ? '#exportInventory' : '#exportReport').click();
            const stream = await (await pending).createReadStream(); let csv = '';
            for await (const chunk of stream) csv += chunk.toString('utf8');
            assert(csv.includes('"\'=1+1"')); assert(csv.includes('"\'+SUM(1)"'));
            assert(csv.includes('"CA""123"')); assert(csv.includes(name === 'inventario' ? '"10"' : '"2"'));
            assert.deepEqual(await page.evaluate(() => ['-1+2', '@SUM(1)', '\t=1', ' =1', 'Normal', 0].map(csvEscape)),
                ['"\'-1+2"', '"\'@SUM(1)"', '"\'\t=1"', '"\' =1"', '"Normal"', '"0"']);
        });
        await check('Ausência de exceções JavaScript e de mutações proibidas', async () => {
            assert.deepEqual(pageErrors, []);
            assert(!writes.some(w => /\/video\/lote|\/active-learning|\/users/.test(w.path)));
        });
        console.log(JSON.stringify({ passed: passed.length, failures, pageErrors, backend: 'simulado' }, null, 2));
        if (failures.length) process.exitCode = 1;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
