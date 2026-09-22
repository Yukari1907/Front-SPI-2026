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
    { id: 1, nome: 'Ana <b>', sobrenome: 'Souza', email: 'ana@example.test', perfil: 'admin', admin: true, ativo: true, unidade: 'Unidade A', telefone: null },
    { id: 2, nome: 'Bruno', sobrenome: null, email: 'bruno@example.test', perfil: 'supervisor', admin: false, ativo: false, unidade: null, telefone: null },
    { id: 3, nome: 'Carla', sobrenome: 'Silva', email: 'carla@example.test', perfil: 'operador', admin: false, ativo: true, unidade: 'Unidade B', telefone: null }
];
let role = 'admin', users = fixture, usersStatus = 200, toggleStatus = 200, signupStatus = 201;
let usersGate = null, toggleGate = null, signupGate = null, invalidToggle = false;
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
        await visit('configuracao');
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: indisponível');
        assert.equal(await page.locator('#workerBatchSize').inputValue(), '');
        assert.equal(calls.filter(call => /active-learning|video\/lote/.test(call.path)).length, 0);
        check('Estado inicial desconhecido: sem valor fictício, GET inventado ou POST automático');

        for (const currentRole of ['admin', 'supervisor', 'operador']) {
            role = currentRole; await visit('configuracao');
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
                assert.equal(await page.locator('#activeLearningState').innerText(), 'Ativado nesta sessão');
            }
            check('Permissões reais de Active Learning e workers: ' + role);
        }
        role = 'admin'; await visit('configuracao');
        toggleGate = gate();
        await page.locator('#enableActiveLearning').click();
        await page.waitForFunction(() => document.getElementById('enableActiveLearning').disabled);
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: indisponível');
        const pendingCalls = countCalls('/active-learning/toggle');
        await page.evaluate(() => setActiveLearning(false));
        assert.equal(countCalls('/active-learning/toggle'), pendingCalls);
        toggleGate.release(); toggleGate = null; await waitToggle();
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Ativado nesta sessão');
        assert.deepEqual(calls.filter(call => call.path === '/active-learning/toggle').at(-1).body, { enabled: true });
        check('Ativar só confirma após HTTP 200 e impede ações concorrentes');
        await page.locator('#disableActiveLearning').click(); await waitToggle();
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Desativado nesta sessão');
        assert.deepEqual(calls.filter(call => call.path === '/active-learning/toggle').at(-1).body, { enabled: false });
        check('Desativar envia boolean false e confirma a resposta real');
        for (const status of [500, 403, 0]) {
            toggleStatus = status; await page.locator('#enableActiveLearning').click(); await waitToggle();
            assert.equal(await page.locator('#activeLearningState').innerText(), 'Desativado nesta sessão');
            assert.match(await page.locator('#activeLearningFeedback').innerText(), status === 403 ? /permissão/ : status === 0 ? /conectar/ : /Não foi possível/);
            assert(!await page.locator('#enableActiveLearning').isDisabled());
            check('Active Learning preserva estado e permite retry: ' + status);
        }
        toggleStatus = 200; invalidToggle = true;
        await page.locator('#enableActiveLearning').click(); await waitToggle();
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Desativado nesta sessão');
        invalidToggle = false;
        check('JSON inválido não confirma Active Learning');
        await page.reload(); await page.evaluate(() => window.sessionReady);
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: indisponível');
        toggleStatus = 500; await page.locator('#enableActiveLearning').click(); await waitToggle();
        assert.equal(await page.locator('#activeLearningState').innerText(), 'Estado atual: indisponível');
        toggleStatus = 200;
        check('Reload descarta confirmação da sessão e erro inicial preserva estado desconhecido');

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
        assert.equal(calls.filter(call => call.path.startsWith('/video/lote')).length, 0);
        assert.match(await page.locator('#workerBatchFeedback').innerText(), /aguardando atualização/);
        check('Lote bloqueado na API e no submit mesmo após habilitação manual do DOM');

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
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['3', '1', '3', '—']);
        assert.match(await page.locator('#usersTable').innerText(), /Inativo/);
        assert.equal(await page.locator('#usersTable button').count(), 0);
        assert.doesNotMatch(await page.locator('thead').innerText(), /Último acesso/);
        check('GET /users: loading, campos reais, escape HTML, métricas derivadas e gestão indisponível');
        await page.evaluate(() => localStorage.setItem('visaoepi_users', JSON.stringify([{ nome: 'Pessoa fictícia local' }])));
        users = []; await page.locator('#refreshUsers').click(); await waitUsers();
        assert.equal(await page.locator('#usersTable').innerText(), 'Nenhum usuário cadastrado.');
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['0', '0', '0', '—']);
        assert.doesNotMatch(await page.locator('body').innerText(), /Pessoa fictícia local/);
        check('200 + [] é vazio real, com zeros derivados e sem usuários do localStorage');
        for (const status of [500, 403, 0]) {
            usersStatus = status; await page.locator('#refreshUsers').click(); await waitUsers();
            assert.equal(await page.locator('#usersTable').innerText(), 'Não foi possível carregar os usuários.');
            assert.deepEqual(await page.locator('.kpi strong').allTextContents(), ['—', '—', '—', '—']);
            check('Listagem distingue erro de vazio: ' + status);
        }
        usersStatus = 200; users = { users: fixture }; await page.locator('#refreshUsers').click(); await waitUsers();
        assert.match(await page.locator('#usersTable').innerText(), /Não foi possível/);
        check('Formato incompatível de /users não vira lista vazia');
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
        assert.match(await page.locator('#usersTable').innerText(), /Não foi possível/);
        check('Falha do refresh mantém signup bem-sucedido e informa listagem não atualizada');
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
        role = 'admin'; await visit('configuracao'); toggleStatus = 401;
        await page.locator('#enableActiveLearning').click(); await page.waitForURL('**/login.html');
        check('401 no Active Learning redireciona para login pela infraestrutura existente');
        assert.equal(calls.filter(call => call.path.startsWith('/video/lote')).length, 0);
        assert.equal(calls.filter(call => ['PUT', 'DELETE'].includes(call.method)).length, 0);
        assert.deepEqual(errors, []);
        check('Nenhuma chamada ao lote quebrado, PUT/DELETE de usuários ou exceção JavaScript');
        console.log(JSON.stringify({ passed: passed.length, pageErrors: errors, backend: 'simulado' }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
