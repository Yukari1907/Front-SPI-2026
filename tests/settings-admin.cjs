// Fixtures somente de teste; todas as requisições são interceptadas, sem backend real.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const passed = [], errors = [], calls = [];
const check = name => { passed.push(name); console.log('PASS', name); };
const fixture = [
    { id: 1, nome: 'Ana <b>', sobrenome: 'Souza', email: 'ana@example.test', perfil: 'admin', admin: true, ativo: true, unidade: 'Unidade A', telefone: null, acesso: 'Tue, 22 Sep 2026 08:00:00 GMT' },
    { id: 2, nome: 'Bruno', sobrenome: null, email: 'bruno@example.test', perfil: 'supervisor', admin: false, ativo: false, unidade: null, telefone: null, acesso: null },
    { id: 3, nome: 'Carla', sobrenome: 'Silva', email: 'carla@example.test', perfil: 'operador', admin: false, ativo: true, unidade: 'Unidade B', telefone: null, acesso: 'Mon, 21 Sep 2026 17:30:00 GMT' }
];
let role = 'admin', users = fixture, usersStatus = 200, toggleStatus = 200, signupStatus = 201;
let usersGate = null, toggleGate = null, signupGate = null, invalidToggle = false;
// Leituras de estado do contrato atual: GET /active-learning/status e GET /video/lote.
let alStatus = 200, alEnabled = false, alBody = null, alGate = null;
let batchStatus = 200, batchBody = { tamanho_lote: 4 };
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.SPI_CHROMIUM_EXECUTABLE || undefined });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (url.port === '5000') {
                calls.push({ path: url.pathname, method: request.method(), body: request.postDataJSON() });
                let data, status = 200;
                if (url.pathname === '/session') data = { authenticated: true, user: { id: 10, nome: 'Sessão', perfil: role, admin: role === 'admin', ativo: true } };
                else if (url.pathname === '/users') { data = users; status = usersStatus; if (usersGate) await usersGate.promise; }
                else if (url.pathname === '/active-learning/status') {
                    data = alBody === null ? { enabled: alEnabled } : alBody; status = alStatus;
                    if (alGate) await alGate.promise;
                }
                else if (url.pathname === '/video/lote') { data = batchBody; status = batchStatus; }
                else if (url.pathname === '/active-learning/toggle') {
                    data = { message: 'OK', enabled: request.postDataJSON().enabled }; status = toggleStatus;
                    if (toggleGate) await toggleGate.promise;
                    if (invalidToggle) return route.fulfill({ status: 200, contentType: 'application/json', body: '{invalid' });
                }
                else if (url.pathname === '/signup') { data = { message: signupStatus === 201 ? 'Signup successful' : 'Falha no cadastro' }; status = signupStatus; if (signupGate) await signupGate.promise; }
                else if (url.pathname === '/alertas') data = [];
                else throw Error('Endpoint inesperado: ' + url.pathname);
                if (status === 0) return route.abort('failed');
                return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
            }
            if (url.hostname === 'cdn.socket.io') return route.fulfill({ contentType: 'application/javascript', body: 'window.io=()=>({on:()=>{}});' });
            if (url.hostname !== 'localhost') return route.fulfill({ body: '', contentType: 'text/css' });
            const file = path.join(root, decodeURIComponent(url.pathname).slice(1));
            const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
            return route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || 'text/plain' });
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        const visit = async file => { await page.goto('http://localhost:8765/' + file + '.html'); await page.evaluate(() => window.sessionReady); };
        const waitUsers = () => page.waitForFunction(() => document.getElementById('usersTable').getAttribute('aria-busy') === 'false');
        const waitToggle = () => page.waitForFunction(() => document.getElementById('activeLearningActions').getAttribute('aria-busy') === 'false');
        const countCalls = endpoint => calls.filter(call => call.path === endpoint).length;
        const waitAL = text => page.waitForFunction(expected =>
            document.getElementById('activeLearningState').textContent === expected, text);
        const waitBatch = text => page.waitForFunction(expected =>
            document.getElementById('workerBatchState').textContent === expected, text);

        await visit('configuracao');
        await waitAL('Estado atual: desativado');
        await waitBatch('Valor atual: 4');
        assert.equal(await page.locator('#workerBatchSize').inputValue(), '4');
        assert.deepEqual(calls.filter(call => /active-learning|video\/lote/.test(call.path))
            .map(call => `${call.method} ${call.path}`), ['GET /active-learning/status', 'GET /video/lote']);
        check('Estado inicial vem das leituras reais do backend, sem POST automático');

        alEnabled = true; await visit('configuracao');
        await waitAL('Estado atual: ativado');
        assert.equal(await page.locator('#activeLearningFeedback').innerText(), '');
        alEnabled = false;
        check('GET inicial com Active Learning ativo reflete o valor real');

        let alReads = countCalls('/active-learning/status'), batchReads = countCalls('/video/lote');
        for (const currentRole of ['admin', 'supervisor', 'operador']) {
            role = currentRole; await visit('configuracao');
            if (role !== 'operador') await waitAL('Estado atual: desativado');
            assert.equal(countCalls('/active-learning/status'), alReads + (role === 'operador' ? 0 : 1));
            assert.equal(countCalls('/video/lote'), batchReads + (role === 'admin' ? 1 : 0));
            alReads = countCalls('/active-learning/status'); batchReads = countCalls('/video/lote');
            assert.equal(await page.locator('#enableActiveLearning').isDisabled(), role === 'operador');
            assert.equal(await page.locator('#disableActiveLearning').isDisabled(), role === 'operador');
            assert.equal(await page.evaluate(() => canPerform('vision:workers')), role === 'admin');
            assert(await page.locator('#applyWorkerBatch').isDisabled());
            if (role === 'operador') {
                const before = countCalls('/active-learning/toggle');
                await page.evaluate(() => setActiveLearning(true));
                assert.equal(countCalls('/active-learning/toggle'), before);
            } else {
                await page.locator('#enableActiveLearning').click(); await waitToggle();
                assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: ativado');
            }
            check('Permissões reais de leitura e alteração: ' + role);
        }
        role = 'admin'; await visit('configuracao');
        await waitAL('Estado atual: desativado');
        toggleGate = gate();
        await page.locator('#enableActiveLearning').click();
        await page.waitForFunction(() => document.getElementById('enableActiveLearning').disabled);
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: desativado');
        const pendingCalls = countCalls('/active-learning/toggle');
        await page.evaluate(() => setActiveLearning(false));
        assert.equal(countCalls('/active-learning/toggle'), pendingCalls);
        toggleGate.release(); toggleGate = null; await waitToggle();
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: ativado');
        assert.deepEqual(calls.filter(call => call.path === '/active-learning/toggle').at(-1).body, { enabled: true });
        check('Ativar só confirma após HTTP 200 e impede ações concorrentes');
        await page.locator('#disableActiveLearning').click(); await waitToggle();
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: desativado');
        assert.deepEqual(calls.filter(call => call.path === '/active-learning/toggle').at(-1).body, { enabled: false });
        check('Desativar envia boolean false e confirma a resposta real');
        for (const status of [500, 403, 0]) {
            toggleStatus = status; await page.locator('#enableActiveLearning').click(); await waitToggle();
            assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: desativado');
            assert.match(await page.locator('#activeLearningFeedback').innerText(), status === 403 ? /permissão/ : status === 0 ? /conectar/ : /Não foi possível/);
            assert(!await page.locator('#enableActiveLearning').isDisabled());
            check('Active Learning preserva estado e permite retry: ' + status);
        }
        toggleStatus = 200; invalidToggle = true;
        await page.locator('#enableActiveLearning').click(); await waitToggle();
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: desativado');
        invalidToggle = false;
        check('JSON inválido não confirma Active Learning');

        for (const [status, body, expected] of [
            [500, null, /consultar o estado atual/],
            [403, { message: 'Acesso negado' }, /permissão/],
            [0, null, /conectar/],
            [200, { enabled: 'sim' }, /consultar o estado atual/],
            [200, {}, /consultar o estado atual/]
        ]) {
            alStatus = status; alBody = body;
            await page.reload(); await page.evaluate(() => window.sessionReady);
            await page.waitForFunction(() => document.getElementById('activeLearningFeedback').textContent !== '');
            assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: indisponível');
            assert.match(await page.locator('#activeLearningFeedback').innerText(), expected);
            assert(!await page.locator('#enableActiveLearning').isDisabled());
            check('GET inicial sem resposta válida mantém estado desconhecido: ' + status + ' ' + JSON.stringify(body));
        }
        toggleStatus = 500; await page.locator('#enableActiveLearning').click(); await waitToggle();
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: indisponível');
        toggleStatus = 200; alStatus = 200; alBody = null;
        check('Falha na alteração após GET sem resposta válida preserva o estado desconhecido');

        // Corrida: enquanto a leitura inicial não responde, nenhuma alteração parte.
        alGate = gate();
        await page.reload(); await page.evaluate(() => window.sessionReady);
        await page.waitForFunction(() => document.getElementById('enableActiveLearning').disabled);
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: consultando...');
        const beforeToggle = countCalls('/active-learning/toggle');
        await page.evaluate(() => setActiveLearning(true));
        assert.equal(countCalls('/active-learning/toggle'), beforeToggle);
        alGate.release(); alGate = null;
        await waitAL('Estado atual: desativado');
        await page.locator('#enableActiveLearning').click(); await waitToggle();
        await waitAL('Estado atual: ativado');
        check('GET inicial em voo bloqueia a alteração e libera o toggle ao responder');

        // Corrida inversa: o GET responde "ativado" depois de um toggle já confirmado.
        alEnabled = true; alGate = gate();
        await page.reload(); await page.evaluate(() => window.sessionReady);
        await page.waitForFunction(() => document.getElementById('enableActiveLearning').disabled);
        await page.evaluate(() => {
            visionSettingsState.activeLearningLoading = false;
            setActiveLearning(false);
        });
        await waitToggle();
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: desativado');
        alGate.release(); alGate = null;
        await page.waitForTimeout(200);
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: desativado');
        alEnabled = false;
        check('Resposta atrasada do GET inicial não sobrescreve a alteração já confirmada');

        for (const [status, body, expected, expectedInput] of [
            [200, { tamanho_lote: 1 }, 'Valor atual: 1', '1'],
            [503, { message: 'Nenhum worker ativo no momento.' }, 'Valor atual: nenhum worker ativo no momento.', ''],
            [500, { message: 'Erro interno do servidor' }, 'Valor atual: indisponível', ''],
            [403, { message: 'Acesso negado' }, 'Valor atual: indisponível', ''],
            [0, null, 'Valor atual: servidor inacessível.', ''],
            [200, { tamanho_lote: 0 }, 'Valor atual: indisponível', ''],
            [200, { tamanho_lote: '2,5' }, 'Valor atual: indisponível', ''],
            [200, {}, 'Valor atual: indisponível', '']
        ]) {
            batchStatus = status; batchBody = body;
            await page.reload(); await page.evaluate(() => window.sessionReady);
            await waitBatch(expected);
            assert.equal(await page.locator('#workerBatchSize').inputValue(), expectedInput);
            assert(await page.locator('#applyWorkerBatch').isDisabled());
            assert(await page.locator('#workerBatchSize').isDisabled());
            check('Leitura do lote atual: ' + status + ' ' + JSON.stringify(body));
        }
        batchStatus = 200; batchBody = { tamanho_lote: 4 };
        await page.reload(); await page.evaluate(() => window.sessionReady);
        await waitAL('Estado atual: desativado');

        assert.equal(await page.locator('#workerBatchSize').getAttribute('min'), '1');
        assert.equal(await page.locator('#workerBatchSize').getAttribute('step'), '1');
        for (const value of ['', 'abc', 0, -2, 1.5, null, true]) {
            const result = await page.evaluate(value => apiSetWorkerBatch(value), value);
            assert.equal(result.ok, false); assert.equal(result.status, 400);
            check('Validação de lote inválido: ' + JSON.stringify(value));
        }
        assert.equal((await page.evaluate(() => apiSetWorkerBatch(2))).ok, false);
        await page.evaluate(() => {
            document.getElementById('workerBatchSize').disabled = false;
            document.getElementById('workerBatchSize').value = '2';
            document.getElementById('applyWorkerBatch').disabled = false;
            document.getElementById('workerBatchForm').requestSubmit();
        });
        assert.equal(calls.filter(call => call.path.startsWith('/video/lote') && call.method !== 'GET').length, 0);
        assert.match(await page.locator('#workerBatchFeedback').innerText(), /alteração do lote está indisponível nesta versão/);
        check('Alteração do lote bloqueada na API e no submit mesmo após habilitação manual do DOM');

        // Somente neste sandbox de teste: comprova o caminho futuro sem liberar a aplicação.
        const futureCalls = [];
        const sandbox = { window: {}, localStorage: {}, sessionStorage: {}, console, fetch: async (url, options) => {
            futureCalls.push({ url, options });
            return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({ message: 'OK', tamanho_lote: 2 }) };
        } };
        vm.createContext(sandbox);
        const apiSource = fs.readFileSync(path.join(root, 'js/api.js'), 'utf8');
        assert.match(apiSource, /workerBatchUpdate: false/);
        vm.runInContext(apiSource.replace('workerBatchUpdate: false', 'workerBatchUpdate: true'), sandbox);
        const futureResult = await sandbox.window.apiSetWorkerBatch(2);
        assert.equal(futureResult.ok, true);
        assert.equal(futureCalls[0].url, 'http://localhost:5000/video/lote/2');
        assert.equal(futureCalls[0].options.method, 'POST');
        assert.equal(futureCalls[0].options.credentials, 'include');
        assert.deepEqual(JSON.parse(futureCalls[0].options.body), { tamanho_lote: 2 });
        check('Contrato futuro de workers preparado, com POST e credentials include, isolado da aplicação');

        usersGate = gate(); await visit('administracao');
        assert.match(await page.locator('#usersTable').innerText(), /Carregando usuários/);
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['—', '—', '—', '—']);
        usersGate.release(); usersGate = null; await waitUsers();
        assert.equal(await page.locator('#usersTable tr').count(), 3);
        assert.match(await page.locator('#usersTable').innerText(), /Ana <b> Souza/);
        assert.equal(await page.locator('#usersTable b').count(), 0);
        // A quarta métrica sai de `acesso`, que GET /users de fato devolve: 2 dos 3.
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['3', '1', '3', '2']);
        assert.match(await page.locator('#usersTable').innerText(), /Inativo/);
        assert.equal(await page.locator('#usersTable button').count(), 0);
        assert.doesNotMatch(await page.locator('thead').innerText(), /Último acesso/);
        // A coluna "Ações" e o aviso permanente de gestão indisponível saíram da tela.
        assert.doesNotMatch(await page.locator('thead').innerText(), /Ações/);
        assert.doesNotMatch(await page.locator('#usersTable').innerText(), /Indisponíveis/);
        assert.doesNotMatch(await page.locator('body').innerText(), /aguardando atualização do servidor/);
        // Atualizar lista fica no cabeçalho do card, junto de Novo usuário.
        assert.equal(await page.locator('.table-head .header-actions #refreshUsers').count(), 1);
        assert.equal(await page.locator('.table-head .header-actions #openUserModal').count(), 1);
        check('GET /users: loading, campos reais, escape HTML, métricas reais e nenhuma gestão insegura na tela');

        // ETAPA 3 — Atualizar lista: loading visível, sem disparo duplicado e sem
        // nenhum controle de edição/exclusão de usuário na tela.
        const antesDoRefresh = countCalls('/users');
        usersGate = gate();
        await page.locator('#refreshUsers').click();
        await page.waitForFunction(() => document.getElementById('refreshUsers').disabled);
        assert.equal(await page.locator('#usersTable').getAttribute('aria-busy'), 'true');
        assert.match(await page.locator('#usersFeedback').innerText(), /Atualizando lista/);
        // Enquanto a leitura está em voo, novos cliques não disparam outra requisição.
        const duranteRefresh = countCalls('/users');
        await page.locator('#refreshUsers').click({ force: true });
        await page.locator('#refreshUsers').click({ force: true });
        assert.equal(countCalls('/users'), duranteRefresh);
        // A lista anterior continua na tela durante a atualização.
        assert.match(await page.locator('#usersTable').innerText(), /Ana/);
        usersGate.release(); usersGate = null; await waitUsers();
        assert.equal(countCalls('/users'), antesDoRefresh + 1);
        assert.equal(await page.locator('#refreshUsers').isDisabled(), false);
        assert.equal(await page.locator('#usersTable').getAttribute('aria-busy'), 'false');
        assert.equal(await page.locator('#usersFeedback').isVisible(), false);
        check('Atualizar lista: loading, lista preservada durante a leitura e nenhum disparo duplicado');

        // Nenhuma ação insegura de usuário é oferecida, nem mesmo desabilitada.
        assert.equal(await page.locator('#usersTable button, #usersTable a, #usersTable [role="button"]').count(), 0);
        assert.equal(await page.locator('[data-user-edit], [data-user-delete]').count(), 0);
        const escritasDeUsuario = calls.filter(call =>
            call.path.startsWith('/users') && call.method !== 'GET');
        assert.deepEqual(escritasDeUsuario, []);
        check('Administração não oferece edição/exclusão de usuário nem emite PUT/DELETE de usuários');
        await page.evaluate(() => localStorage.setItem('visaoepi_users', JSON.stringify([{ nome: 'Pessoa fictícia local' }])));
        users = []; await page.locator('#refreshUsers').click(); await waitUsers();
        assert.equal(await page.locator('#usersTable').innerText(), 'Nenhum usuário cadastrado.');
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['0', '0', '0', '0']);
        assert.doesNotMatch(await page.locator('body').innerText(), /Pessoa fictícia local/);
        check('200 + [] é vazio real, com zeros derivados e sem usuários do localStorage');
        // Com uma leitura real já na tela (0 usuários reais), a falha seguinte preserva
        // o que foi lido e avisa; nunca inventa uma lista nem finge vazio.
        for (const status of [500, 403, 0]) {
            usersStatus = status; await page.locator('#refreshUsers').click(); await waitUsers();
            assert.equal(await page.locator('#usersTable').innerText(), 'Nenhum usuário cadastrado.');
            assert.match(await page.locator('#usersFeedback').innerText(), /última leitura bem-sucedida/);
            check('Falha de atualização preserva a leitura anterior e avisa: ' + status);
        }
        usersStatus = 200; users = { users: fixture }; await page.locator('#refreshUsers').click(); await waitUsers();
        assert.match(await page.locator('#usersFeedback').innerText(), /última leitura bem-sucedida/);
        assert.doesNotMatch(await page.locator('#usersTable').innerText(), /Ana/);
        check('Formato incompatível de /users não vira lista vazia nem sobrescreve a leitura anterior');
        users = fixture; await page.locator('#refreshUsers').click(); await waitUsers();

        const fillSignup = async () => {
            await page.locator('#openUserModal').click();
            await page.locator('[name="name"]').fill('  Nova   Pessoa  ');
            await page.locator('[name="email"]').fill('NOVA@example.test');
            await page.locator('[name="role"]').selectOption('supervisor');
            await page.locator('[name="unit"]').fill(' Unidade C ');
            await page.locator('[name="password"]').fill('test-only-password');
        };
        await fillSignup();
        const beforeSignupGet = countCalls('/users');
        users = [...fixture, { id: 4, nome: 'Nova', sobrenome: 'Pessoa', email: 'nova@example.test', perfil: 'supervisor', admin: false, ativo: true, unidade: 'Unidade C' }];
        await page.locator('#userForm [type="submit"]').click();
        await page.waitForFunction(() => document.getElementById('adminUsersCount').textContent === '4');
        assert(countCalls('/users') > beforeSignupGet);
        assert.deepEqual(calls.filter(call => call.path === '/signup').at(-1).body, { nome: 'Nova', sobrenome: 'Pessoa', email: 'nova@example.test', perfil: 'supervisor', unidade: 'Unidade C', password: 'test-only-password' });
        check('Signup respeita DTO e recarrega usuários do servidor após sucesso');
        await fillSignup(); usersStatus = 500;
        await page.locator('#userForm [type="submit"]').click();
        await page.waitForFunction(() => document.getElementById('toastContainer').textContent.includes('listagem não pôde ser atualizada'));
        assert(!await page.locator('#userModal').evaluate(el => el.classList.contains('active')));
        // O signup deu certo; só a releitura falhou, então a lista anterior fica na tela.
        assert.match(await page.locator('#usersTable').innerText(), /Ana/);
        assert.match(await page.locator('#usersFeedback').innerText(), /última leitura bem-sucedida/);
        check('Falha do refresh mantém signup bem-sucedido, preserva a lista e informa a falha');
        usersStatus = 200;
        for (const status of [400, 403, 0]) {
            await fillSignup(); signupStatus = status;
            const before = countCalls('/users');
            await page.locator('#userForm [type="submit"]').click();
            await page.waitForFunction(() => !document.querySelector('#userForm [type="submit"]').disabled);
            assert(await page.locator('#userModal').evaluate(el => el.classList.contains('active')));
            assert.equal(countCalls('/users'), before);
            await page.locator('#cancelUserModal').click();
            check('Falha de signup preserva formulário e não recarrega como sucesso: ' + status);
        }
        signupStatus = 201;
        users = fixture; usersGate = gate(); await visit('administracao');
        await fillSignup(); users = fixture.slice(0, 1);
        const oldGate = usersGate; usersGate = null;
        await page.locator('#userForm [type="submit"]').click();
        await page.waitForFunction(() => document.getElementById('adminUsersCount').textContent === '1');
        oldGate.release();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.locator('#adminUsersCount').innerText(), '1');
        check('Resposta antiga não sobrescreve refresh posterior ao signup');

        users = fixture;
        for (const width of [1440, 768, 390]) for (const theme of ['light', 'dark']) {
            await page.setViewportSize({ width, height: 1000 });
            for (const file of ['configuracao', 'administracao']) {
                await visit(file); if (file === 'administracao') await waitUsers();
                await page.evaluate(theme => applyTheme(theme), theme);
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                if (file === 'configuracao') {
                    const box = await page.locator('.vision-settings').boundingBox();
                    assert(box.x >= 0 && box.x + box.width <= width + 1);
                    assert(await page.locator('#applyWorkerBatch').isDisabled());
                    assert(await page.locator('#enableActiveLearning').isVisible());
                } else {
                    await fillSignup();
                    const box = await page.locator('#userModal .modal-box').boundingBox();
                    assert(box.x >= 0 && box.x + box.width <= width + 1);
                    await page.locator('#cancelUserModal').click();
                }
            }
            check(`Configuração, tabela e cadastro responsivos: ${width}px / ${theme}`);
        }
        for (const currentRole of ['supervisor', 'operador']) {
            role = currentRole;
            const before = countCalls('/users'); await visit('administracao');
            assert.equal(countCalls('/users'), before);
            assert.equal(await page.evaluate(() => canPerform('users:create')), false);
            assert.equal(await page.evaluate(() => canPerform('users:list')), false);
            check('Administração não consulta /users sem permissão: ' + role);
        }
        role = 'admin'; await visit('configuracao');
        await waitAL('Estado atual: desativado');
        toggleStatus = 401;
        await page.locator('#enableActiveLearning').click(); await page.waitForURL('**/login.html');
        check('401 no Active Learning redireciona para login pela infraestrutura existente');
        assert.equal(calls.filter(call => call.path.startsWith('/video/lote') && call.method !== 'GET').length, 0);
        assert(calls.some(call => call.path === '/video/lote' && call.method === 'GET'));
        assert.equal(calls.filter(call => ['PUT', 'DELETE'].includes(call.method)).length, 0);
        assert.deepEqual(errors, []);
        check('Lote somente lido, nenhuma alteração, PUT/DELETE de usuários ou exceção JavaScript');
        console.log(JSON.stringify({ passed: passed.length, pageErrors: errors, backend: 'simulado' }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
