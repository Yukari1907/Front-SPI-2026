// Fixtures restritas aos testes. Todas as rotas são interceptadas: nenhum backend real.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const passed = [], errors = [], calls = [];
const check = name => { passed.push(name); console.log('PASS', name); };
let role = 'admin', status = 200, readStatus = 200, gate = null;
let sectors = [{ id: 1, nome: 'Produção <b>' }];
let cameras = [{ id: 1, nome: 'Entrada', ip: 'rtsp://secret@camera.test/live', id_setor: 1, rotacao: 180, espelhar_horizontal: true, espelhar_vertical: false }];
let epis = [{ id: 5, nome: 'Capacete real', categoria: 'Cabeça', certificado: 'CA123', validade: '2030-01-01', estoque: 10, quantidade_min: 2, em_uso: 3 }];
let stats = { total_deteccoes: 10, total_conformes: 8, total_nao_conformes: 2, conformidade_media: '80.0' };
let statStatus = 200;
const alerts = [
    { id: 1, evento: 'Queda', tipo_deteccao: 'queda', data: '2026-09-01 10:00:00', resolvido: false, severidade: 3 },
    { id: 2, evento: 'Postura', tipo_deteccao: 'postura_tronco', data: '2026-09-02 10:00:00', resolvido: false, severidade: 2 },
    { id: 3, evento: 'EPI', tipo_deteccao: 'epi', data: '2026-09-03 10:00:00', resolvido: true, severidade: 1 },
    { id: 4, evento: 'Anterior', tipo_deteccao: null, data: '2026-09-04 10:00:00', resolvido: false, severidade: 1 }
];
const makeGate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.SPI_CHROMIUM_EXECUTABLE || undefined });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url()), method = request.method();
            if (url.port === '5000') {
                const body = request.postDataJSON();
                calls.push({ path: url.pathname, query: url.search, method, body });
                let data, code = 200;
                const write = method !== 'GET';
                if (url.pathname === '/session') data = { authenticated: true, user: { id: 1, nome: 'Teste', perfil: role, admin: role === 'admin', ativo: true } };
                else if (url.pathname === '/alertas') data = alerts;
                else if (url.pathname === '/estatisticas/conformidade') { data = stats; code = statStatus; }
                else if (url.pathname.startsWith('/estatisticas/setor/')) { data = stats; code = statStatus; }
                else if (url.pathname === '/alertas/estatisticas/epi') data = [];
                else if (url.pathname === '/zonas' || /^\/zonas\/camera\//.test(url.pathname)) data = [{ id: 7, nome: 'Zona real', id_camera: 1, x: .1, y: .1, largura: .2, altura: .2, permitido: false, epis_categoria: ['Cabeça'] }];
                else if (url.pathname === '/cameras/status') data = cameras.map(item => ({ ...item, status: 'Ativo' }));
                else if (url.pathname.startsWith('/detections/')) data = { connected: true, detections: [], class_count: {} };
                else if (url.pathname.startsWith('/video/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"/>' });
                else if (['/setores', '/cameras', '/epis'].includes(url.pathname) && !write) {
                    code = readStatus;
                    data = url.pathname === '/setores' ? sectors : url.pathname === '/cameras' ? cameras : epis;
                } else if (write && /^\/(setores|cameras|epis)(\/|$)/.test(url.pathname)) {
                    code = status;
                    if (gate) await gate.promise;
                    if (code === 200 || code === 201 || code === 204) {
                        const kind = url.pathname.split('/')[1], id = Number(url.pathname.split('/').pop());
                        let items = kind === 'setores' ? sectors : kind === 'cameras' ? cameras : epis;
                        if (method === 'DELETE') { items = items.filter(item => item.id !== id); data = { message: 'Excluído' }; }
                        else if (method === 'PUT') { data = { ...items.find(item => item.id === id), ...body, id }; items = items.map(item => item.id === id ? data : item); }
                        else { data = { ...body, id: Math.max(0, ...items.map(item => item.id)) + 1 }; items = [...items, data]; code = 201; }
                        if (kind === 'setores') sectors = items;
                        else if (kind === 'cameras') cameras = items;
                        else epis = items;
                    } else data = { message: 'Falha solicitada pelo teste' };
                } else if (url.pathname === '/users') { code = 500; data = { message: 'Indisponível' }; }
                else throw Error('Endpoint inesperado: ' + method + ' ' + url.pathname);
                if (code === 0) return route.abort('failed');
                if (code === 204) return route.fulfill({ status: 204, body: '' });
                return route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(data) });
            }
            if (url.hostname === 'cdn.socket.io') return route.fulfill({ contentType: 'application/javascript', body: 'window.io=()=>({on:()=>{}});' });
            if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'application/javascript', body: 'window.charts={};window.Chart=class {static defaults={};constructor(el,config){this.data=config.data;window.charts[el.id]=config;}update(){}};' });
            if (url.hostname !== 'localhost') return route.fulfill({ body: '', contentType: 'text/css' });
            const file = path.join(root, decodeURIComponent(url.pathname).slice(1));
            if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'text/plain' });
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        const visit = async name => { await page.goto(`http://localhost:8765/${name}.html`); await page.evaluate(() => window.sessionReady); };
        const registryIdle = () => page.waitForFunction(() => document.getElementById('registryPanel').getAttribute('aria-busy') === 'false');
        const inventoryIdle = () => page.waitForFunction(() => document.getElementById('inventoryTable').getAttribute('aria-busy') === 'false');
        const writes = () => calls.filter(call => call.method !== 'GET');
        const load = async () => { await page.locator('#loadRegistries').click(); await registryIdle(); };

        await visit('configuracao');
        assert.equal(calls.filter(call => call.path === '/setores').length, 0);
        await load();
        assert.match(await page.locator('#sectorsRegistry').innerText(), /Produção <b>/);
        assert.equal(await page.locator('#sectorsRegistry b').count(), 0);
        assert.doesNotMatch(await page.locator('#camerasRegistry').innerText(), /rtsp|secret/);
        check('Cadastros consultados sob demanda, nomes escapados e IP restrito ao formulário administrativo');

        gate = makeGate();
        await page.locator('#sectorName').fill('Setor novo');
        await page.locator('#saveSector').click();
        await page.waitForFunction(() => document.getElementById('registryPanel').getAttribute('aria-busy') === 'true');
        const before = writes().length;
        await page.evaluate(() => document.getElementById('sectorForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
        assert.equal(writes().length, before);
        assert(await page.locator('#saveSector').isDisabled());
        assert.doesNotMatch(await page.locator('#sectorsRegistry').innerText(), /Setor novo/);
        gate.release(); gate = null;
        await registryIdle();
        assert.deepEqual(writes().at(-1), { path: '/setores/registrar', query: '', method: 'POST', body: { nome: 'Setor novo' } });
        assert.match(await page.locator('#sectorsRegistry').innerText(), /Setor novo/);
        check('Setor: POST exato, loading, bloqueio de duplo envio e lista atualizada após HTTP');

        await page.locator('[data-sector-edit="2"]').click();
        assert.equal(await page.locator('#sectorName').inputValue(), 'Setor novo');
        await page.locator('#sectorName').fill('Setor revisado');
        await page.locator('#saveSector').click(); await registryIdle();
        assert.deepEqual(writes().at(-1).body, { nome: 'Setor revisado' });
        assert.equal(writes().at(-1).method, 'PUT');
        assert.equal(await page.evaluate(() => sessionStorage.getItem(apiCacheKey('/setores'))), null);
        check('Setor: edição carrega dado real, PUT atualiza lista e invalida cache');

        for (const code of [400, 403, 404, 409, 500, 0]) {
            status = code;
            page.once('dialog', dialog => { assert.match(dialog.message(), /Setor revisado.*ID 2/); dialog.accept(); });
            await page.locator('[data-kind="sectors"][data-registry-delete="2"]').click(); await registryIdle();
            assert.equal(await page.locator('[data-sector-edit="2"]').count(), 1);
            assert.doesNotMatch(await page.locator('#registryFeedback').innerText(), /sucesso/);
            check(`Setor: DELETE ${code} identifica registro, preserva lista e informa falha`);
        }
        status = 200;
        const cancelBefore = writes().length;
        page.once('dialog', dialog => dialog.dismiss());
        await page.locator('[data-kind="sectors"][data-registry-delete="2"]').click();
        assert.equal(writes().length, cancelBefore);
        gate = makeGate();
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-kind="sectors"][data-registry-delete="2"]').click();
        assert(await page.locator('[data-kind="sectors"][data-registry-delete="2"]').isDisabled());
        const deleting = writes().length;
        await page.evaluate(() => { deleteRegistry('sectors', 2); });
        assert.equal(writes().length, deleting);
        gate.release(); gate = null; await registryIdle();
        assert.equal(await page.locator('[data-sector-edit="2"]').count(), 0);
        check('Setor: cancelar não envia DELETE; confirmar impede duplicação e remove após resposta real');

        await page.locator('#newCameraName').fill('Portão');
        await page.locator('#newCameraIp').fill('rtsp://camera.test/live');
        await page.locator('#newCameraSector').selectOption('1');
        await page.locator('#saveNewCamera').click(); await registryIdle();
        assert.deepEqual(writes().at(-1).body, { nome: 'Portão', ip: 'rtsp://camera.test/live', id_setor: 1 });
        assert.equal(writes().at(-1).path, '/cameras/registrar');
        assert.match(await page.locator('#camerasRegistry').innerText(), /Portão/);
        check('Câmera: criação persiste apenas nome, IP e setor; nenhum ajuste ignorado é enviado');

        for (const code of [403, 404, 409, 500, 0]) {
            status = code;
            page.once('dialog', dialog => { assert.match(dialog.message(), /Portão.*ID 2/); dialog.accept(); });
            await page.locator('[data-kind="cameras"][data-registry-delete="2"]').click(); await registryIdle();
            assert.match(await page.locator('#camerasRegistry').innerText(), /Portão/);
            check(`Câmera: DELETE ${code} preserva registro e oferece recuperação`);
        }
        status = 204;
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-kind="cameras"][data-registry-delete="2"]').click(); await registryIdle();
        assert.doesNotMatch(await page.locator('#camerasRegistry').innerText(), /Portão/);
        check('Câmera: DELETE 204 confirma exclusão e recarrega lista');
        status = 200;

        for (const code of [500, 403, 0]) {
            readStatus = code; await load();
            assert.match(await page.locator('#sectorsRegistry').innerText(), /possível carregar|Sem permissão/);
            assert.match(await page.locator('#camerasRegistry').innerText(), /possível carregar|Sem permissão/);
            assert(await page.locator('#saveNewCamera').isDisabled());
            check(`Cadastros: leitura ${code} não vira vazio e bloqueia câmera sem setores confiáveis`);
        }
        readStatus = 200;
        const savedSectors = sectors; sectors = []; await load();
        assert.match(await page.locator('#sectorsRegistry').innerText(), /Nenhum setor/);
        assert(await page.locator('#saveNewCamera').isDisabled());
        sectors = savedSectors; await load();
        check('Cadastros: lista vazia real difere de falha e recupera pela consulta');

        await visit('monitoramento');
        await page.waitForFunction(() => !document.getElementById('openCameraModal').disabled);
        await page.locator('#openCameraModal').click();
        assert.equal(await page.locator('#cameraRotation').inputValue(), '180');
        assert(await page.locator('#cameraMirrorH').isChecked());
        assert.equal(await page.locator('#cameraMirrorV').isChecked(), false);
        assert.equal(await page.locator('#cameraIp').inputValue(), cameras[0].ip);
        check('Câmera: edição lê rotação e espelhamentos persistidos pelo GET');

        await visit('mapeamento');
        await page.locator('[data-edit-zone="7"]').waitFor();
        const deleteZone = page.getByRole('button', { name: 'Excluir zona', exact: true });
        assert(await deleteZone.isDisabled());
        await deleteZone.evaluate(button => { button.disabled = false; button.click(); });
        assert.equal(writes().filter(call => call.path.startsWith('/zonas/')).length, 0);
        await page.locator('[data-edit-zone="7"]').click();
        assert(await page.locator('#zoneEpiGroup').isHidden());
        assert(await page.locator('#zoneCamera').isDisabled());
        assert.match(await page.locator('#zoneEpiUnavailable').innerText(), /preservadas/);
        check('Zona: DELETE preparado sem handler perigoso e associações preservadas na edição');

        await visit('inventario'); await inventoryIdle();
        await page.locator('#openInventoryModal').click();
        for (const [name, value] of Object.entries({ name: 'Luva nova', category: 'Mãos', certificate: 'CA456', expiration: '2031-01-02', quantity: '12', minimumQuantity: '3', inUse: '2' })) await page.locator(`#inventoryForm [name="${name}"]`).fill(value);
        const invSubmit = page.locator('#inventoryForm [type="submit"]');
        const invalidBefore = writes().length;
        await page.locator('#inventoryForm [name="quantity"]').fill('-1');
        await invSubmit.click(); assert.equal(writes().length, invalidBefore);
        await page.locator('#inventoryForm [name="quantity"]').fill('12');
        gate = makeGate(); await invSubmit.click();
        await page.waitForFunction(() => document.getElementById('inventoryForm').getAttribute('aria-busy') === 'true');
        const saving = writes().length;
        await page.evaluate(() => document.getElementById('inventoryForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
        assert.equal(writes().length, saving);
        assert(await invSubmit.isDisabled());
        gate.release(); gate = null;
        await page.waitForFunction(() => !document.getElementById('inventoryModal').classList.contains('active'));
        assert.deepEqual(writes().at(-1).body, { nome: 'Luva nova', categoria: 'Mãos', certificado: 'CA456', validade: '2031-01-02', estoque: 12, quantidade_min: 3, em_uso: 2 });
        assert.match(await page.locator('#inventoryTable').innerText(), /Luva nova/);
        check('EPI: CREATE real, sete campos exatos, quantidades válidas e proteção de duplo envio');

        await page.evaluate(() => editInventoryItem(6));
        assert.equal(await page.locator('#inventoryForm [name="code"]').isDisabled(), true);
        assert.equal(await page.locator('#inventoryForm [name="location"]').isDisabled(), true);
        assert.equal(await page.locator('#inventoryForm [name="inUse"]').inputValue(), '2');
        await page.locator('#inventoryForm [name="name"]').fill('Luva revisada');
        await invSubmit.click();
        await page.waitForFunction(() => !document.getElementById('inventoryModal').classList.contains('active'));
        assert.equal(writes().at(-1).method, 'PUT');
        assert.equal(writes().at(-1).path, '/epis/6');
        assert.match(await page.locator('#inventoryTable').innerText(), /Luva revisada/);
        check('EPI: READ/UPDATE preservam campos reais; código e localização indisponíveis, status derivado');

        for (const code of [400, 403, 404, 409, 500, 0]) {
            status = code;
            await page.evaluate(() => editInventoryItem(6));
            await page.locator('#inventoryForm [name="name"]').fill('Não confirmado');
            await invSubmit.click();
            await page.waitForFunction(() => document.getElementById('inventoryForm').getAttribute('aria-busy') === 'false');
            assert(await page.locator('#inventoryModal').isVisible());
            assert.match(await page.locator('#inventoryTable').innerText(), /Luva revisada/);
            assert.doesNotMatch(await page.locator('#inventoryTable').innerText(), /Não confirmado/);
            await page.locator('#cancelInventoryModal').click();
            check(`EPI: PUT ${code} mantém formulário e não simula persistência`);
        }

        for (const code of [400, 403, 404, 409, 500, 0]) {
            status = code;
            page.once('dialog', dialog => { assert.match(dialog.message(), /Luva revisada.*ID 6/); dialog.accept(); });
            await page.locator('[data-delete-epi="6"]').click();
            await page.waitForFunction(() => !document.querySelector('[data-delete-epi="6"]').disabled);
            assert.match(await page.locator('#inventoryTable').innerText(), /Luva revisada/);
            assert(await page.locator('#toastContainer').innerText());
            check(`EPI: DELETE ${code} preserva registro e informa erro sem sucesso fictício`);
        }
        status = 200; gate = makeGate();
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-delete-epi="6"]').click();
        assert(await page.locator('[data-delete-epi="6"]').isDisabled());
        const epiDeleting = writes().length;
        await page.evaluate(() => { deleteInventoryItem(6); });
        assert.equal(writes().length, epiDeleting);
        gate.release(); gate = null;
        await page.waitForFunction(() => !document.querySelector('[data-delete-epi="6"]'));
        check('EPI: DELETE com loading e envio único atualiza lista somente após resposta real');

        for (const profile of ['admin', 'supervisor', 'operador']) {
            role = profile;
            await visit('configuracao'); await load();
            assert.equal(await page.locator('#sectorForm').isVisible(), profile !== 'operador');
            assert.equal(await page.locator('#cameraCreateForm').isVisible(), profile !== 'operador');
            assert.equal(await page.locator('[data-registry-delete]').count() > 0, profile !== 'operador');
            await visit('inventario'); await inventoryIdle();
            assert.equal(await page.locator('[data-inventory-write="inventory:edit"]').first().isVisible(), profile !== 'operador');
            assert.equal(await page.locator('[data-delete-epi="5"]').isVisible(), profile !== 'operador');
            if (profile === 'operador') {
                const prior = writes().length;
                await page.evaluate(() => { deleteInventoryItem(5); editInventoryItem(5); });
                assert.equal(writes().length, prior);
                assert(await page.locator('#inventoryModal').isHidden());
            }
            check(`Permissões: ${profile}, visibilidade CSS efetiva e barreiras nos handlers`);
        }

        role = 'admin';
        await visit('alertas');
        await page.waitForFunction(() => document.querySelectorAll('#alertsTable tr').length === 4);
        await page.locator('#alertType').selectOption('postura');
        assert.equal(await page.locator('#alertsTable tr').count(), 2);
        await page.locator('#alertStartDate').fill('2026-09-02');
        assert.equal(await page.locator('#alertsTable tr').count(), 1);
        assert.match(await page.locator('#alertsTable').innerText(), /Postura/);
        await page.locator('#alertEndDate').fill('2026-09-01');
        assert.match(await page.locator('#alertsTable').innerText(), /Nenhum alerta/);
        await page.locator('#alertStartDate').fill(''); await page.locator('#alertEndDate').fill('');
        await page.locator('#alertType').selectOption('legado');
        assert.match(await page.locator('#alertsTable').innerText(), /Anterior/);
        assert(calls.filter(call => call.path === '/alertas').every(call => call.query === ''));
        check('Alertas: tipo persistido, agrupamento postura e datas locais inclusivas sem parâmetros inventados');

        await visit('relatorios');
        await page.waitForFunction(() => document.getElementById('reportComplianceAverage').textContent === '80.0%');
        const query = new URLSearchParams(calls.findLast(call => call.path === '/estatisticas/conformidade').query);
        assert.match(query.get('data_inicio'), /^\d{4}-\d{2}-\d{2} 00:00:00$/);
        assert.match(query.get('data_fim'), /^\d{4}-\d{2}-\d{2} 23:59:59$/);
        check('Estatísticas: conformidade real, decimal serializado e parâmetros de data do contrato');
        await visit('controle-de-epis');
        await page.waitForFunction(() => window.charts?.sectorChart);
        assert.deepEqual(await page.evaluate(() => charts.sectorChart.data.datasets[0].data), [80]);
        assert.deepEqual(await page.evaluate(() => charts.sectorChart.data.labels), ['Produção <b>']);
        check('Controle de EPIs: conformidade agregada por setor vem do contrato real, sem trabalhadores fictícios');
        stats = { total_deteccoes: 0, total_conformes: 0, total_nao_conformes: 0, conformidade_media: null };
        await visit('relatorios');
        await page.waitForFunction(() => document.getElementById('reportComplianceState').textContent.includes('Sem observações'));
        assert.equal(await page.locator('#reportComplianceAverage').innerText(), '—');
        statStatus = 500; await visit('relatorios');
        await page.waitForFunction(() => document.getElementById('reportComplianceState').textContent.includes('indisponíveis'));
        assert.equal(await page.locator('#reportComplianceAverage').innerText(), '—');
        check('Estatísticas: ausência de observações e erro não se transformam em 0%');
        await visit('controle-de-epis');
        await page.waitForFunction(() => document.getElementById('sectorChartState')?.textContent.includes('indisponíveis'));
        assert.equal(await page.evaluate(() => Boolean(charts.sectorChart)), false);
        check('Controle de EPIs: falha de estatística setorial não gera gráfico com zeros');
        statStatus = 200;

        for (const width of [1440, 768, 390]) for (const theme of ['light', 'dark']) {
            await page.setViewportSize({ width, height: 1000 });
            await page.evaluate(value => localStorage.setItem('visaoepi_theme', value), theme);
            for (const name of ['configuracao', 'inventario', 'alertas', 'relatorios']) {
                await visit(name);
                if (name === 'configuracao') await load();
                if (name === 'inventario') { await inventoryIdle(); await page.locator('#openInventoryModal').click(); }
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: ${width}/${theme}`);
                const hidden = await page.evaluate(() => ['btn', 'icon-btn', 'form-group'].map(className => {
                    const el = document.createElement('div'); el.className = className; el.hidden = true;
                    el.style.display = 'inline-flex'; document.body.appendChild(el);
                    const value = getComputedStyle(el).display; el.remove(); return value;
                }));
                assert.deepEqual(hidden, ['none', 'none', 'none']);
            }
            check(`Responsividade e [hidden] com display inline: ${width}px / ${theme}`);
            if (width === 390 || width === 1440) {
                await visit('configuracao'); await load();
                await page.screenshot({ path: path.join(require('node:os').tmpdir(), `spi-stage3-${width}-${theme}.png`), fullPage: true });
            }
        }

        // 401 precisa redirecionar em cada família de ação destrutiva.
        for (const resource of ['sectors', 'cameras', 'epis']) {
            status = 401;
            await visit(resource === 'epis' ? 'inventario' : 'configuracao');
            if (resource === 'epis') await inventoryIdle(); else await load();
            page.once('dialog', dialog => dialog.accept());
            await page.locator(resource === 'epis' ? '[data-delete-epi="5"]' : `[data-kind="${resource}"][data-registry-delete="1"]`).click();
            await page.waitForURL('**/login.html');
            check(`${resource}: DELETE 401 limpa sessão e redireciona ao login`);
        }
        assert.equal(writes().filter(call => /video\/lote|users\//.test(call.path)).length, 0);
        assert.deepEqual(errors, []);
        check('Nenhum POST de lote, escrita insegura de usuários, dado fictício em produção ou exceção JavaScript');
        console.log(JSON.stringify({ passed: passed.length, pageErrors: errors, backend: 'simulado' }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
