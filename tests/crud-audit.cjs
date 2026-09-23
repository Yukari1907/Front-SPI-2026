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
// GET /estatisticas/conformes: soma histórica global, sem parâmetros de filtro.
let counts = { total_conformes: 1234, total_nao_conformes: 56 };
let countsStatus = 200;
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
                else if (url.pathname === '/estatisticas/conformes') { data = counts; code = countsStatus; }
                else if (url.pathname === '/active-learning/status') data = { enabled: false };
                else if (url.pathname === '/video/lote') data = { tamanho_lote: 6 };
                else if (url.pathname.startsWith('/alertas/estatisticas')) data = [];
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
        const inventoryIdle = () => page.waitForFunction(() => document.getElementById('inventoryTable').getAttribute('aria-busy') === 'false');
        const writes = () => calls.filter(call => call.method !== 'GET');
        // O Mapeamento carrega setores, câmeras e zonas ao abrir; a lista de setores
        // é o último passo visível do carregamento.
        const mappingIdle = () => page.waitForFunction(() => document.getElementById('sectorList').children.length > 0);
        const visitMapping = async () => { await visit('mapeamento'); await mappingIdle(); };
        const sectorsText = () => page.locator('#sectorList').innerText();

        // ETAPA 2 — Configuração volta a ser só configuração global: nenhum CRUD de
        // setores ou câmeras, e nenhuma leitura desses cadastros ao abrir a página.
        await visit('configuracao');
        for (const id of ['registryPanel', 'loadRegistries', 'sectorForm', 'cameraCreateForm', 'sectorsRegistry', 'camerasRegistry']) {
            assert.equal(await page.locator('#' + id).count(), 0, id);
        }
        assert.equal(await page.locator('[data-registry-delete], [data-sector-edit], [data-sector-delete]').count(), 0);
        assert.equal(calls.filter(call => call.path === '/setores' || call.path === '/cameras').length, 0);
        check('Configuração: CRUD de setores e câmeras removido, sem leitura desses cadastros');

        // O que legitimamente pertence à Configuração continua lá e continua lendo o
        // estado real. A alteração do lote permanece bloqueada (contrato do backend).
        await page.waitForFunction(() => !document.getElementById('workerBatchState').textContent.includes('consultando'));
        assert.equal(calls.filter(call => call.path === '/active-learning/status').length, 1);
        assert.equal(calls.filter(call => call.path === '/video/lote').length, 1);
        assert.match(await page.locator('#workerBatchState').innerText(), /Valor atual: 6/);
        assert.equal(await page.locator('#activeLearningState').count(), 1);
        assert(await page.locator('#applyWorkerBatch').isDisabled());
        assert(await page.locator('#workerBatchSize').isDisabled());
        assert.equal(writes().filter(call => /video\/lote/.test(call.path)).length, 0);
        check('Configuração: Active Learning e leitura do lote preservados, Aplicar lote segue bloqueado');

        // ETAPA 2 — os cadastros de setor e câmera passam a viver no Mapeamento.
        await visitMapping();
        assert.match(await sectorsText(), /Produção <b>/);
        assert.equal(await page.locator('#sectorList b').count(), 0);
        assert.doesNotMatch(await page.evaluate(() => document.querySelector('.main').innerHTML), /rtsp|secret/);
        assert.equal(await page.locator('#openSectorModal').isVisible(), true);
        assert.equal(await page.locator('#openCameraCreateModal').isVisible(), true);
        check('Mapeamento: Novo setor e Nova câmera disponíveis, nomes escapados e IP fora da tela');

        gate = makeGate();
        await page.locator('#openSectorModal').click();
        await page.locator('#sectorName').fill('Setor novo');
        await page.locator('#saveSector').click();
        await page.waitForFunction(() => document.getElementById('saveSector').disabled);
        const before = writes().length;
        await page.evaluate(() => document.getElementById('sectorForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
        assert.equal(writes().length, before);
        assert.doesNotMatch(await sectorsText(), /Setor novo/);
        gate.release(); gate = null;
        await page.waitForFunction(() => !document.getElementById('sectorModal').classList.contains('active'));
        assert.deepEqual(writes().at(-1), { path: '/setores/registrar', query: '', method: 'POST', body: { nome: 'Setor novo' } });
        assert.match(await sectorsText(), /Setor novo/);
        check('Setor: POST exato, loading, bloqueio de duplo envio e lista atualizada após HTTP');

        await page.locator('[data-sector-edit="2"]').click();
        assert.equal(await page.locator('#sectorName').inputValue(), 'Setor novo');
        assert.match(await page.locator('#saveSectorLabel').innerText(), /Salvar setor/);
        await page.locator('#sectorName').fill('Setor revisado');
        await page.locator('#saveSector').click();
        await page.waitForFunction(() => !document.getElementById('sectorModal').classList.contains('active'));
        assert.deepEqual(writes().at(-1).body, { nome: 'Setor revisado' });
        assert.equal(writes().at(-1).method, 'PUT');
        assert.equal(writes().at(-1).path, '/setores/2');
        // O cache curto foi invalidado: o que está guardado veio da releitura, não do valor antigo.
        const cachedSectors = await page.evaluate(() => JSON.parse(sessionStorage.getItem(apiCacheKey('/setores')) || 'null'));
        assert(cachedSectors.result.data.some(item => item.nome === 'Setor revisado'));
        check('Setor: edição carrega dado real, PUT atualiza lista e invalida cache');

        for (const code of [400, 403, 404, 409, 500, 0]) {
            status = code;
            page.once('dialog', dialog => { assert.match(dialog.message(), /Setor revisado.*ID 2/); dialog.accept(); });
            await page.locator('[data-sector-delete="2"]').click();
            await page.waitForFunction(() => !document.getElementById('sectorFeedback').textContent.includes('Excluindo'));
            assert.equal(await page.locator('[data-sector-edit="2"]').count(), 1);
            assert.doesNotMatch(await page.locator('#sectorFeedback').innerText(), /sucesso/);
            assert.notEqual(await page.locator('#sectorFeedback').innerText(), '');
            check(`Setor: DELETE ${code} identifica registro, preserva lista e informa falha`);
        }
        status = 200;
        const cancelBefore = writes().length;
        page.once('dialog', dialog => dialog.dismiss());
        await page.locator('[data-sector-delete="2"]').click();
        assert.equal(writes().length, cancelBefore);
        gate = makeGate();
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-sector-delete="2"]').click();
        await page.waitForFunction(() => document.querySelector('[data-sector-delete="2"]').disabled);
        const deleting = writes().length;
        await page.evaluate(() => { deleteSector(2); });
        assert.equal(writes().length, deleting);
        gate.release(); gate = null;
        await page.waitForFunction(() => !document.querySelector('[data-sector-edit="2"]'));
        check('Setor: cancelar não envia DELETE; confirmar impede duplicação e remove após resposta real');

        await page.locator('#openCameraCreateModal').click();
        await page.locator('#newCameraName').fill('Portão');
        await page.locator('#newCameraIp').fill('rtsp://camera.test/live');
        await page.locator('#newCameraSector').selectOption('1');
        await page.locator('#newCameraRotation').selectOption('270');
        await page.locator('#newCameraMirrorV').check();
        await page.locator('#saveNewCamera').click();
        await page.waitForFunction(() => !document.getElementById('cameraCreateModal').classList.contains('active'));
        // O POST atual persiste as transformações, então os três campos vão no corpo.
        assert.deepEqual(writes().at(-1).body, {
            nome: 'Portão', ip: 'rtsp://camera.test/live', id_setor: 1,
            rotacao: 270, espelhar_horizontal: false, espelhar_vertical: true
        });
        assert.equal(writes().at(-1).path, '/cameras/registrar');
        assert.match(await page.locator('#zoneCamera').innerText(), /Portão/);
        check('Câmera: criação no Mapeamento envia nome, IP, setor, rotação e espelhamentos reais');

        for (const code of [400, 403, 409, 500, 0]) {
            status = code;
            await page.locator('#openCameraCreateModal').click();
            await page.locator('#newCameraIp').fill('rtsp://camera.test/nova');
            await page.locator('#newCameraSector').selectOption('1');
            await page.locator('#saveNewCamera').click();
            await page.waitForFunction(() => !document.getElementById('cameraCreateError').hidden);
            // Falha mantém o formulário aberto e não inventa uma câmera local.
            assert(await page.locator('#cameraCreateModal').isVisible());
            assert.doesNotMatch(await page.locator('#zoneCamera').innerText(), /nova/);
            await page.locator('#cameraCreateModal [data-close-modal]').first().click();
            check(`Câmera: POST ${code} mantém o formulário aberto e não cria registro local`);
        }
        status = 200;

        // ETAPA 3 — Exclusão de câmera devolvida ao Mapeamento, junto da lista de
        // câmeras a que pertence. DELETE /cameras/{id} exige admin ou supervisor.
        const camerasAntesDaExclusao = cameras;
        await visitMapping();
        await page.waitForFunction(() => document.querySelectorAll('#cameraList .registry-row').length > 0);
        const camerasCriadas = await page.locator('#cameraList .registry-row').count();
        assert.equal(await page.locator('[data-camera-delete="1"]').count(), 1);
        // O endereço/IP nunca aparece na lista: ele pode carregar credencial de RTSP.
        assert.doesNotMatch(await page.locator('#cameraList').innerText(), /rtsp:|secret|camera\.test/);
        assert.match(await page.locator('#cameraList').innerText(), /Entrada[\s\S]*ID 1[\s\S]*Produção <b>/);
        assert.equal(await page.locator('#cameraList b').count(), 0);
        check('Câmeras: lista no Mapeamento traz nome, ID e setor reais, sem IP nem HTML injetado');

        // Cancelar a confirmação não envia DELETE algum.
        const cancelCamera = writes().length;
        let confirmacao = '';
        page.once('dialog', dialog => { confirmacao = dialog.message(); dialog.dismiss(); });
        await page.locator('[data-camera-delete="1"]').click();
        await page.waitForFunction(() => true);
        assert.equal(writes().length, cancelCamera);
        assert.match(confirmacao, /Entrada/);
        assert.match(confirmacao, /ID 1/);
        assert.match(confirmacao, /Produção <b>/);
        // Confirmação identifica a câmera sem expor IP, RTSP ou credencial.
        assert.doesNotMatch(confirmacao, /rtsp:|secret|camera\.test|@/);
        assert.equal(await page.locator('[data-camera-delete="1"]').count(), 1);
        check('Câmera: confirmação traz nome, ID e setor, sem IP/RTSP, e cancelar não envia DELETE');

        for (const code of [400, 403, 500, 0]) {
            status = code;
            page.once('dialog', dialog => dialog.accept());
            await page.locator('[data-camera-delete="1"]').click();
            await page.waitForFunction(() => !document.getElementById('cameraFeedback').textContent.includes('Excluindo'));
            assert.equal(writes().at(-1).method, 'DELETE');
            assert.equal(writes().at(-1).path, '/cameras/1');
            // Erro preserva a lista: nada de fingir exclusão.
            assert.equal(await page.locator('[data-camera-delete="1"]').count(), 1);
            assert.notEqual(await page.locator('#cameraFeedback').innerText(), '');
            assert.doesNotMatch(await page.locator('#cameraFeedback').innerText(), /sucesso/);
            check(`Câmera: DELETE ${code} preserva a lista e informa a falha`);
        }
        // 400 genérico do backend não permite distinguir "não encontrada" de "tem
        // vínculos": a mensagem fica segura e honesta (N3).
        status = 400;
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-camera-delete="1"]').click();
        await page.waitForFunction(() => !document.getElementById('cameraFeedback').textContent.includes('Excluindo'));
        assert.match(await page.locator('#cameraFeedback').innerText(), /alertas ou zonas vinculados, ou já ter sido removida/);
        check('Câmera: 400 genérico vira mensagem segura, sem adivinhar o motivo (N3)');

        status = 200;
        gate = makeGate();
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-camera-delete="1"]').click();
        await page.waitForFunction(() => document.querySelector('[data-camera-delete="1"]').disabled);
        const excluindo = writes().length;
        await page.evaluate(() => { deleteCamera(1); });
        assert.equal(writes().length, excluindo);
        gate.release(); gate = null;
        await page.waitForFunction(() => !document.querySelector('[data-camera-delete="1"]'));
        // Sucesso real atualiza lista, mapa, contadores e os selects dependentes.
        assert.equal(await page.locator('#cameraList .registry-row').count(), camerasCriadas - 1);
        assert.doesNotMatch(await page.locator('#zoneCamera').innerText(), /Entrada/);
        assert.doesNotMatch(await page.locator('#factoryMap').innerText(), /Entrada/);
        assert.equal(await page.locator('#factoryMap [title="Entrada"]').count(), 0);
        assert.match(await sectorsText(), /Produção/);
        // A releitura passa pelo backend: o cache curto de /cameras foi invalidado.
        assert.equal(calls.filter(call => call.path === '/cameras' && call.method === 'GET').length > 0, true);
        check('Câmera: exclusão confirmada não duplica, e só após o 200 atualiza lista, mapa, setores e selects');

        // Sem permissão de escrita o controle nem aparece; a lista continua visível.
        role = 'operador';
        await visitMapping();
        await page.waitForFunction(() => document.getElementById('cameraList').children.length > 0);
        assert.equal(await page.locator('[data-camera-delete]').count(), 0);
        assert.equal(await page.locator('#openCameraCreateModal').isVisible(), false);
        assert.match(await page.locator('#cameraList').innerText(), /Portão|Câmera/);
        role = 'admin';
        check('Câmera: operador não recebe o controle de exclusão, mas continua vendo a lista');
        // Devolve o cadastro ao estado anterior para os testes seguintes.
        cameras = camerasAntesDaExclusao;

        for (const code of [500, 403, 0]) {
            // O cache curto de /setores e /cameras precisa sair da frente para a
            // falha de leitura chegar de fato a esta carga.
            await page.evaluate(() => { apiClearCached('/setores'); apiClearCached('/cameras'); });
            readStatus = code; await visit('mapeamento');
            await page.waitForFunction(() => document.getElementById('sectorList').textContent.trim().length > 0);
            assert.match(await sectorsText(), /Não foi possível carregar os setores|Erro ao carregar/);
            assert.doesNotMatch(await page.locator('body').innerText(), /backend/i);
            await page.locator('#openCameraCreateModal').click();
            assert(await page.locator('#saveNewCamera').isDisabled());
            assert.match(await page.locator('#cameraCreateError').innerText(), /Cadastre um setor antes/);
            await page.locator('#cameraCreateModal [data-close-modal]').first().click();
            check(`Cadastros: leitura ${code} não vira vazio e bloqueia câmera sem setores confiáveis`);
        }
        readStatus = 200;
        const savedSectors = sectors; sectors = [];
        await page.evaluate(() => { apiClearCached('/setores'); apiClearCached('/cameras'); });
        await visit('mapeamento');
        await page.waitForFunction(() => document.getElementById('sectorList').textContent.includes('Nenhum setor'));
        assert.match(await sectorsText(), /Nenhum setor/);
        await page.locator('#openCameraCreateModal').click();
        assert(await page.locator('#saveNewCamera').isDisabled());
        await page.locator('#cameraCreateModal [data-close-modal]').first().click();
        sectors = savedSectors;
        await page.evaluate(() => { apiClearCached('/setores'); apiClearCached('/cameras'); });
        await visitMapping();
        check('Cadastros: lista vazia real difere de falha e recupera pela releitura');

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
        assert.match(await page.locator('#zoneEpiUnavailable').innerText(), /ficam como estão ao salvar/);
        check('Zona: DELETE preparado sem handler perigoso e associações preservadas na edição');

        // ETAPA 3 — F1 continua SEM correção pelo frontend. POST /zonas/registrar,
        // PUT /zonas/{id} e DELETE /zonas/{id} usam apenas @login_required no backend,
        // e a política histórica do frontend permite zona para operador. Nada aqui
        // inventa admin/supervisor, e a exclusão continua sem executar DELETE.
        role = 'operador';
        await visitMapping();
        await page.locator('[data-edit-zone="7"]').waitFor();
        assert.equal(await page.locator('#openZoneModal').isVisible(), true);
        assert.equal(await page.locator('#openZoneModal').isDisabled(), false);
        assert.equal(await page.locator('#openZoneModal[data-permission]').count(), 0);
        assert.equal(await page.locator('[data-edit-zone="7"]').isDisabled(), false);
        const excluirZonaOperador = page.getByRole('button', { name: 'Excluir zona', exact: true });
        assert(await excluirZonaOperador.isDisabled());
        const antesDeZona = writes().length;
        await excluirZonaOperador.evaluate(button => { button.disabled = false; button.click(); });
        assert.equal(writes().filter(call => call.method === 'DELETE' && call.path.startsWith('/zonas')).length, 0);
        assert.equal(writes().length, antesDeZona);
        role = 'admin';
        check('F1 não corrigido no frontend: zona segue liberada a operador e a exclusão nunca emite DELETE');

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
            await visitMapping();
            assert.equal(await page.locator('#openSectorModal').isVisible(), profile !== 'operador');
            assert.equal(await page.locator('#openCameraCreateModal').isVisible(), profile !== 'operador');
            assert.equal(await page.locator('[data-sector-edit]').count() > 0, profile !== 'operador');
            assert.equal(await page.locator('[data-sector-delete]').count() > 0, profile !== 'operador');
            if (profile === 'operador') {
                const priorSectors = writes().length;
                await page.evaluate(() => { openSectorModal({ id: 1, nome: 'x' }); deleteSector(1); });
                assert.equal(writes().length, priorSectors);
                assert(await page.locator('#sectorModal').isHidden());
            }
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

        // F1 - POLITICA DE ZONAS. O backend protege POST /zonas/registrar, PUT /zonas/{id}
        // e DELETE /zonas/{id} apenas com @login_required. A politica ja estabelecida no
        // frontend espelha exatamente isso (AUDITORIA_CRUD_ETAPA3, secao 5: "a regra de
        // zonas e a observada no backend, nao uma permissao inventada"): nao existe acao
        // `zones:*` no mapa de permissoes. A Etapa 2 nao altera essa politica em nenhuma
        // direcao e, sobretudo, NAO concede nenhum controle novo de mutacao de zona.
        // Isto e politica de UI, nao seguranca: a autorizacao real e do backend e a
        // divergencia continua classificada como BACKEND PENDENTE.
        const zoneWritesBefore = writes().filter(call => /^\/zonas/.test(call.path)).length;
        for (const profile of ['admin', 'supervisor', 'operador']) {
            role = profile;
            await visitMapping();
            await page.waitForSelector('[data-edit-zone]');
            assert.equal(await page.evaluate(() =>
                getRolePermissions().actions.some(action => action.startsWith('zones:'))), false);
            // Controles de mutacao de zona identicos para todos os perfis, como antes da Etapa 2.
            assert.equal(await page.locator('#openZoneModal').count(), 1);
            assert.equal(await page.locator('[data-edit-zone]').count(), 1);
            // Exclusao de zona segue desabilitada para todos - adiada para a Etapa 3.
            const zoneDelete = page.locator('#riskZonesList button', { hasText: 'Excluir zona' });
            assert.equal(await zoneDelete.count(), 1);
            assert(await zoneDelete.first().isDisabled());
            assert.match(await page.locator('#zoneDeleteUnavailable').innerText(), /indisponível/);
            check(`F1: ${profile} nao recebe controle novo de mutacao de zona; exclusao segue desabilitada (politica de UI, nao autorizacao do backend)`);
        }
        assert.equal(writes().filter(call => /^\/zonas/.test(call.path)).length, zoneWritesBefore);
        check('F1: nenhuma mutacao de zona foi disparada pela reorganizacao das paginas');

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
        assert.deepEqual(await page.evaluate(() => ['compliantCount', 'compliantState', 'nonCompliantCount', 'nonCompliantState']
            .map(id => document.getElementById(id).textContent)), ['1.234', 'Total acumulado', '56', 'Total acumulado']);
        assert(calls.filter(call => call.path === '/estatisticas/conformes').every(call => call.query === ''));
        check('Conformes e não conformes vêm de GET /estatisticas/conformes, sem parâmetros inventados');

        // ETAPA 3 — Total avaliado e taxa saem do mesmo conjunto acumulado.
        assert.deepEqual(await page.evaluate(() => ['evaluatedCount', 'complianceRate', 'complianceRateState']
            .map(id => document.getElementById(id).textContent)),
            ['1.290', '95,7%', 'Conformes sobre o total acumulado']);
        // "Total acumulado" e "não pessoas": a semântica da rota fica explícita na tela.
        assert.match(await page.locator('#evaluatedState').innerText(), /não pessoas/);
        assert.doesNotMatch(await page.locator('body').innerText(), /Hoje|Últimas 24|Este mês/);
        check('Conformidade: total avaliado e percentual do mesmo conjunto acumulado, sem recorte temporal inventado');

        counts = { total_conformes: 0, total_nao_conformes: 0 };
        await visit('controle-de-epis');
        await page.waitForFunction(() => document.getElementById('compliantState').textContent === 'Total acumulado');
        assert.deepEqual(await page.evaluate(() => ['compliantCount', 'nonCompliantCount', 'evaluatedCount']
            .map(id => document.getElementById(id).textContent)), ['0', '0', '0']);
        // Denominador zero não vira 100%.
        assert.equal(await page.locator('#complianceRate').innerText(), '—');
        assert.match(await page.locator('#complianceRateState').innerText(), /Sem observações registradas/);
        check('Zero real de conformes e não conformes aparece como 0, e a taxa sem denominador não vira 100%');

        for (const [status, body, expected] of [
            [500, { message: 'Erro interno do servidor' }, 'Dados indisponíveis'],
            [403, { message: 'Acesso negado' }, 'Seu perfil não possui permissão para esta consulta.'],
            [200, { total_conformes: null, total_nao_conformes: 3 }, 'Dados indisponíveis'],
            [200, { total_nao_conformes: 3 }, 'Dados indisponíveis'],
            [200, { total_conformes: -1, total_nao_conformes: 3 }, 'Dados indisponíveis']
        ]) {
            countsStatus = status; counts = body;
            await visit('controle-de-epis');
            await page.waitForFunction(text => document.getElementById('compliantState').textContent === text, expected);
            assert.deepEqual(await page.evaluate(() => ['compliantCount', 'nonCompliantCount', 'evaluatedCount', 'complianceRate']
                .map(id => document.getElementById(id).textContent)), ['—', '—', '—', '—']);
            assert.equal(await page.locator('#nonCompliantState').innerText(), expected);
            check('Conformes: erro e resposta fora do contrato não viram zero: ' + status + ' ' + JSON.stringify(body));
        }
        countsStatus = 200; counts = { total_conformes: 1234, total_nao_conformes: 56 };
        stats = { total_deteccoes: 0, total_conformes: 0, total_nao_conformes: 0, conformidade_media: null };
        await visit('relatorios');
        await page.waitForFunction(() => document.getElementById('reportComplianceState').textContent.includes('Sem observações'));
        assert.equal(await page.locator('#reportComplianceAverage').innerText(), '—');
        statStatus = 500; await visit('relatorios');
        await page.waitForFunction(() => document.getElementById('reportComplianceState').textContent.includes('indisponíveis'));
        assert.equal(await page.locator('#reportComplianceAverage').innerText(), '—');
        check('Estatísticas: ausência de observações e erro não se transformam em 0%');

        // ETAPA 3 — DASHBOARD. Cada card sai de um contrato real; carregando, zero
        // real, vazio e erro são estados distintos e nenhuma falha vira zero.
        statStatus = 200;
        const hoje = new Date();
        const diaLocal = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        // O Flask serializa datetime em HTTP-date (RFC 1123), não em ISO 8601, e o
        // carimbo gravado é `datetime.now()` (local ingênuo) apenas rotulado "GMT".
        // O fixture reproduz isso: componentes locais + sufixo GMT, sem conversão.
        const SEMANA = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const pad = value => String(value).padStart(2, '0');
        const httpDate = date => `${SEMANA[date.getDay()]}, ${pad(date.getDate())} ${MESES[date.getMonth()]} `
            + `${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} GMT`;
        const ontem = new Date(hoje.getTime() - 86400000);
        const alertasOriginais = alerts.slice();
        alerts.length = 0;
        alerts.push(
            { id: 10, evento: 'Antigo', data: httpDate(new Date(hoje.getFullYear() - 1, 0, 2, 8, 0, 0)), severidade: 1, resolvido: true, id_camera: 1 },
            { id: 11, evento: 'Ontem', data: httpDate(new Date(ontem.getFullYear(), ontem.getMonth(), ontem.getDate(), 9, 30, 0)), severidade: 2, resolvido: false, id_camera: 1 },
            { id: 12, evento: 'Hoje cedo', data: httpDate(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 7, 15, 0)), severidade: 1, resolvido: false, id_camera: 1 },
            { id: 13, evento: 'Hoje agora', data: httpDate(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 18, 45, 0)), severidade: 3, resolvido: false, id_camera: 1 }
        );
        counts = { total_conformes: 30, total_nao_conformes: 10 };
        await visit('dashboard');
        await page.waitForFunction(() => document.getElementById('dashboardAlertsToday').textContent !== '—');
        // Datas em HTTP-date são lidas de fato: dois alertas de hoje, não zero.
        assert.equal(await page.locator('#dashboardAlertsToday').innerText(), '2');
        assert.equal(await page.locator('#dashboardAlertsTodayState').innerText(), 'Registros de hoje');
        // Os 3 mais recentes, ordenados pelo carimbo real e não pelo texto bruto.
        assert.deepEqual(await page.locator('#dashboardEvents tr td:nth-child(4)').allInnerTexts(),
            ['Hoje agora', 'Hoje cedo', 'Ontem']);
        assert.equal(await page.locator('#dashboardEvents tr td:nth-child(1)').first().innerText(), '18:45');
        assert.deepEqual(await page.evaluate(() => ['dashboardEvaluated', 'dashboardCompliance']
            .map(id => document.getElementById(id).textContent)), ['40', '75,0%']);
        assert.equal(await page.locator('#dashboardCamerasOnline').innerText(),
            `${cameras.length}/${cameras.length}`);
        assert.equal(diaLocal(hoje).length, 10);
        check('Dashboard: alertas de hoje, ordenação e hora saem da data real do backend (HTTP-date)');

        // Zero real: base sem conformidade alguma e sem alerta de hoje.
        counts = { total_conformes: 0, total_nao_conformes: 0 };
        alerts.length = 0;
        alerts.push({ id: 14, evento: 'Antigo', data: httpDate(new Date(hoje.getFullYear() - 1, 0, 2, 8, 0, 0)), severidade: 1, resolvido: true, id_camera: 1 });
        await visit('dashboard');
        await page.waitForFunction(() => document.getElementById('dashboardEvaluated').textContent === '0');
        assert.equal(await page.locator('#dashboardAlertsToday').innerText(), '0');
        assert.equal(await page.locator('#dashboardEvaluated').innerText(), '0');
        // Sem denominador não se inventa 100%.
        assert.equal(await page.locator('#dashboardCompliance').innerText(), '—');
        assert.match(await page.locator('#dashboardComplianceState').innerText(), /Sem observações registradas/);
        check('Dashboard: zero real aparece como zero e taxa sem denominador não vira 100%');

        // Erro nunca vira zero, em cada card, de forma independente.
        for (const [status, expected] of [
            [500, 'O servidor não respondeu a esta consulta.'],
            [403, 'Seu perfil não possui permissão para esta consulta.'],
            [0, 'Não foi possível conectar ao servidor.']
        ]) {
            countsStatus = status;
            await visit('dashboard');
            await page.waitForFunction(text => document.getElementById('dashboardEvaluatedState').textContent === text, expected);
            assert.deepEqual(await page.evaluate(() => ['dashboardEvaluated', 'dashboardCompliance']
                .map(id => document.getElementById(id).textContent)), ['—', '—']);
            // Falha parcial: os outros cards continuam com o dado real deles.
            await page.waitForFunction(() => document.getElementById('dashboardCamerasOnline').textContent !== '—');
            assert.notEqual(await page.locator('#dashboardAlertsToday').innerText(), '—');
            check(`Dashboard: /estatisticas/conformes ${status} não vira zero e não derruba os demais cards`);
        }
        countsStatus = 200; counts = { total_conformes: 1234, total_nao_conformes: 56 };
        alerts.length = 0; alerts.push(...alertasOriginais);
        check('Dashboard: nenhum card exibe array mockado em produção — todos vieram das rotas interceptadas');
        // Devolve a falha de estatística setorial que o próximo teste exercita.
        statStatus = 500;
        await visit('controle-de-epis');
        await page.waitForFunction(() => document.getElementById('sectorChartState')?.textContent.includes('indisponíveis'));
        assert.equal(await page.evaluate(() => Boolean(charts.sectorChart)), false);
        check('Controle de EPIs: falha de estatística setorial não gera gráfico com zeros');
        statStatus = 200;

        for (const width of [1440, 768, 390]) for (const theme of ['light', 'dark']) {
            await page.setViewportSize({ width, height: 1000 });
            await page.evaluate(value => localStorage.setItem('visaoepi_theme', value), theme);
            for (const name of ['configuracao', 'mapeamento', 'inventario', 'alertas', 'relatorios', 'dashboard', 'controle-de-epis', 'administracao']) {
                await visit(name);
                if (name === 'mapeamento') {
                    await mappingIdle();
                    // Os dois modais novos precisam caber na viewport nos dois temas.
                    for (const opener of ['#openSectorModal', '#openCameraCreateModal']) {
                        await page.locator(opener).click();
                        const modal = opener === '#openSectorModal' ? '#sectorModal' : '#cameraCreateModal';
                        const box = await page.locator(`${modal} .modal-box`).boundingBox();
                        assert(box.x >= 0 && box.x + box.width <= width, `${modal}: ${width}/${theme}`);
                        if (opener === '#openSectorModal') await page.locator('#sectorModal [data-close-modal]').first().click();
                    }
                    await page.locator('#cameraCreateModal [data-close-modal]').first().click();
                    // A seleção de EPIs precisa caber e continuar clicável no toque.
                    await page.locator('#openZoneModal').click();
                    await page.waitForFunction(() =>
                        document.getElementById('zoneEpiOptions').getAttribute('aria-busy') === 'false');
                    const picker = await page.locator('#zoneEpiOptions').boundingBox();
                    assert(picker.x >= 0 && picker.x + picker.width <= width, `zoneEpiOptions: ${width}/${theme}`);
                    const alvo = await page.locator('#zoneEpiOptions .epi-option').first().boundingBox();
                    assert(alvo.height >= 40, `alvo de toque pequeno: ${width}/${theme} ${alvo.height}`);
                    await page.locator('#cancelZoneModal').click();
                }
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
                await visitMapping();
                await page.screenshot({ path: path.join(require('node:os').tmpdir(), `spi-stage3-${width}-${theme}.png`), fullPage: true });
            }
        }

        // 401 precisa redirecionar em cada família de ação destrutiva.
        for (const resource of ['sectors', 'epis']) {
            status = 401;
            if (resource === 'epis') { await visit('inventario'); await inventoryIdle(); } else await visitMapping();
            page.once('dialog', dialog => dialog.accept());
            await page.locator(resource === 'epis' ? '[data-delete-epi="5"]' : '[data-sector-delete="1"]').click();
            await page.waitForURL('**/login.html');
            check(`${resource}: DELETE 401 limpa sessão e redireciona ao login`);
        }
        // A criação de câmera substitui a exclusão como ação de escrita de câmera na UI:
        // a exclusão saiu junto com o painel de Configuração e segue para a Etapa 3.
        status = 401;
        await visitMapping();
        await page.locator('#openCameraCreateModal').click();
        await page.locator('#newCameraIp').fill('rtsp://camera.test/401');
        await page.locator('#newCameraSector').selectOption('1');
        await page.locator('#saveNewCamera').click();
        await page.waitForURL('**/login.html');
        check('cameras: POST 401 limpa sessão e redireciona ao login');
        assert.equal(writes().filter(call => /video\/lote|users\//.test(call.path)).length, 0);
        assert.deepEqual(errors, []);
        check('Nenhum POST de lote, escrita insegura de usuários, dado fictício em produção ou exceção JavaScript');
        console.log(JSON.stringify({ passed: passed.length, pageErrors: errors, backend: 'simulado' }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
