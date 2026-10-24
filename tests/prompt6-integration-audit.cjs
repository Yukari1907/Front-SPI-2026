// Prompt 6: caracterização do comportamento atual da exclusão de zona (Mapeamento).
// Rede integralmente interceptada; nenhuma API real; dados fictícios.
// Estes cenários descrevem o fluxo recebido de 7bed786 — NÃO aprovam a política
// de perfis (quem pode excluir continua decisão de produto pendente, F1).
// Contrato lido (backend fcad97e, controller/zonas_routes.py deletar_zona):
//   DELETE /zonas/{id}  @login_required  -> 200 {message} | 400 {message} (falha ou inexistente)
//   401/403 vêm de core/auth.py (sem sessão / usuário inativo). 404, 409 e 500 não são
//   emitidos pela rota atual; aparecem aqui só como respostas defensivas.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const passed = [], failures = [], pageErrors = [], writes = [];
const users = { admin: { id: 1, nome: 'Admin', perfil: 'admin', admin: true, ativo: true },
    supervisor: { id: 2, nome: 'Supervisor', perfil: 'supervisor', admin: false, ativo: true },
    operador: { id: 3, nome: 'Operador', perfil: 'operador', admin: false, ativo: true } };
const cameras = [{ id: 1, nome: 'Entrada', ip: 'rtsp://p6-user:p6-secret@cam.test/live', id_setor: 1, rotacao: 0, espelhar_horizontal: false, espelhar_vertical: false }];
const baseZones = () => [
    { id: 7, nome: 'Zona Prensa', id_camera: 1, poligono: [[.1, .1], [.4, .1], [.4, .4], [.1, .4]], permitido: false, epis_id: [5] },
    { id: 8, nome: 'Zona Doca', id_camera: 1, poligono: [[.5, .5], [.9, .5], [.9, .9]], permitido: true, epis_id: [] }
];
let zones = baseZones();
let sessionUser = users.admin;
// Resposta do próximo DELETE: { status, message | body, contentType } ou 'abort'. `hold` segura a resposta.
let deleteReply = { status: 200 };
let hold = null;
let zoneGets = 0;

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.SPI_CHROMIUM_EXECUTABLE || undefined });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (url.port === '5000') {
                let data, status = 200;
                if (request.method() === 'DELETE' && /^\/zonas\/\d+$/.test(url.pathname)) {
                    writes.push({ path: url.pathname, method: 'DELETE' });
                    if (hold) await hold.promise;
                    const reply = deleteReply;
                    if (reply === 'abort') return route.abort('failed');
                    if (reply.status === 200) zones = zones.filter(zone => `/zonas/${zone.id}` !== url.pathname);
                    return route.fulfill({ status: reply.status, contentType: reply.contentType || 'application/json',
                        body: reply.body ?? JSON.stringify(reply.status === 200 ? { message: 'Zona deletada com sucesso' } : { message: reply.message }) });
                }
                if (request.method() !== 'GET') {
                    writes.push({ path: url.pathname, method: request.method() });
                    data = { message: 'OK' };
                } else if (url.pathname === '/session') data = { authenticated: true, user: sessionUser };
                else if (url.pathname === '/cameras') data = cameras;
                else if (url.pathname === '/setores') data = [{ id: 1, nome: 'Produção' }];
                else if (url.pathname === '/zonas') { zoneGets++; data = zones; }
                else if (url.pathname.startsWith('/zonas/camera/')) data = zones;
                else if (url.pathname === '/epis') data = [{ id: 5, nome: 'Capacete', categoria: 'Cabeça' }];
                else if (url.pathname === '/alertas' || url.pathname.startsWith('/alertas/estatisticas')) data = [];
                else { status = 404; data = { message: 'Rota não simulada' }; }
                return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
            }
            if (url.hostname === 'cdn.socket.io') return route.fulfill({ contentType: 'application/javascript', body: 'window.io=()=>({on(){}});' });
            if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'application/javascript', body: 'window.Chart=class {static defaults={};constructor(){}update(){}destroy(){}};' });
            if (url.hostname !== 'localhost') return route.fulfill({ body: '' });
            const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
            if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
        });
        const page = await context.newPage();
        page.on('pageerror', e => pageErrors.push(e.message));
        // Decisão do confirm() nativo controlada por cenário; padrão = cancelar.
        let acceptConfirm = false;
        const dialogs = [];
        page.on('dialog', dialog => {
            dialogs.push(dialog.message());
            (acceptConfirm ? dialog.accept() : dialog.dismiss()).catch(() => {});
        });
        const visit = async (user = users.admin) => {
            sessionUser = user;
            zones = baseZones();
            deleteReply = { status: 200 };
            hold = null;
            acceptConfirm = false;
            dialogs.length = 0;
            await page.goto('http://localhost:8765/mapeamento.html');
            await page.evaluate(() => window.sessionReady);
            await page.waitForLoadState('networkidle');
            await page.locator('#riskZonesList [data-delete-zone]').first().waitFor();
            // Registra todo toast (texto + tipo pela cor) sem depender do timeout de 3 s.
            await page.evaluate(() => {
                window.__toasts = [];
                new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(node =>
                    window.__toasts.push({ text: node.textContent, danger: node.style.borderLeftColor.includes('danger') }))))
                    .observe(document.getElementById('toastContainer'), { childList: true });
            });
        };
        const check = async (name, run) => {
            try { await run(); passed.push(name); console.log('PASS', name); }
            catch (error) { failures.push({ name, error: error.message }); console.log('FAIL', name, error.message); }
        };
        const deletes = () => writes.filter(call => call.method === 'DELETE');
        const toasts = () => page.evaluate(() => window.__toasts);
        // O toast de sucesso sai antes da releitura terminar: espera a lista sair de "Carregando".
        const listed = async () => {
            await page.waitForFunction(() => !document.getElementById('riskZonesList').textContent.includes('Carregando'));
            return page.locator('#riskZonesList strong').allInnerTexts();
        };
        const deleteButton = id => page.locator(`#riskZonesList [data-delete-zone="${id}"]`);
        const deferred = () => { let release; const promise = new Promise(r => { release = r; }); return { promise, release }; };
        const P = 'Caracterização do comportamento atual — ';

        await check(`${P}cancelar a confirmação não envia DELETE nem altera a lista`, async () => {
            await visit();
            const before = deletes().length;
            await deleteButton(7).click();
            await page.waitForTimeout(150);
            assert.equal(dialogs.length, 1);
            assert.match(dialogs[0], /"Zona Prensa"/);
            assert.equal(deletes().length, before);
            assert.deepEqual(await listed(), ['Zona Prensa', 'Zona Doca']);
            assert.deepEqual(await toasts(), []);
        });

        await check(`${P}confirmar envia um DELETE /zonas/{id} da zona clicada; a lista só muda após o 200`, async () => {
            await visit();
            acceptConfirm = true;
            hold = deferred();
            const before = deletes().length, getsBefore = zoneGets;
            await deleteButton(7).click();
            await page.waitForTimeout(150);
            assert.deepEqual(deletes().slice(before), [{ path: '/zonas/7', method: 'DELETE' }]);
            // Resposta ainda pendente: nada muda e nenhum sucesso é anunciado.
            assert.deepEqual(await listed(), ['Zona Prensa', 'Zona Doca']);
            assert.deepEqual(await toasts(), []);
            assert.equal(zoneGets, getsBefore);
            hold.release();
            await page.waitForFunction(() => window.__toasts.length > 0);
            await page.waitForLoadState('networkidle');
            assert.deepEqual(await toasts(), [{ text: 'Zona excluída com sucesso.', danger: false }]);
            assert.equal(zoneGets, getsBefore + 1, 'lista relida do servidor após o 200');
            assert.deepEqual(await listed(), ['Zona Doca']);
        });

        const failuresMatrix = [
            { label: '400 do contrato atual (falha ou zona inexistente)', reply: { status: 400, message: 'Não foi possível excluir a zona ou zona não encontrada.' }, toast: 'Não foi possível excluir a zona ou zona não encontrada.' },
            { label: '403 (usuário inativo, core/auth.py)', reply: { status: 403, message: 'Usuário inativo' }, toast: 'Usuário inativo' },
            { label: '404 (defensivo; não emitido pela rota atual)', reply: { status: 404, message: 'Zona não encontrada' }, toast: 'Zona não encontrada' },
            { label: '409 (defensivo; não emitido pela rota atual)', reply: { status: 409, message: 'Zona com vínculos' }, toast: 'Zona com vínculos' },
            { label: '500 sem JSON (defensivo)', reply: { status: 500, contentType: 'text/html', body: '<h1>Internal Server Error</h1>' }, toast: 'Não foi possível excluir a zona.' },
            { label: 'falha de rede', reply: 'abort', toast: 'Não foi possível conectar ao servidor. Tente novamente.' }
        ];
        for (const item of failuresMatrix) {
            await check(`${P}${item.label}: zona preservada, erro exibido, sem sucesso fictício, nova tentativa possível`, async () => {
                await visit();
                acceptConfirm = true;
                deleteReply = item.reply;
                const before = deletes().length, getsBefore = zoneGets;
                await deleteButton(7).click();
                await page.waitForFunction(() => window.__toasts.length > 0);
                assert.deepEqual(await toasts(), [{ text: item.toast, danger: true }]);
                assert.deepEqual(await listed(), ['Zona Prensa', 'Zona Doca']);
                assert.equal(zoneGets, getsBefore, 'sem releitura que simule exclusão');
                assert.equal(deletes().length, before + 1);
                // O envio terminou: o botão volta a funcionar e uma nova tentativa sai normalmente.
                assert.equal(await deleteButton(7).isDisabled(), false);
                deleteReply = { status: 200 };
                await deleteButton(7).click();
                await page.waitForFunction(() => window.__toasts.some(t => !t.danger));
                await page.waitForLoadState('networkidle');
                assert.equal(deletes().length, before + 2);
                assert.deepEqual(await listed(), ['Zona Doca']);
            });
        }

        await check(`${P}401 redireciona ao login; zona não é removida no servidor simulado`, async () => {
            await visit();
            acceptConfirm = true;
            deleteReply = { status: 401, message: 'Não autenticado' };
            const before = deletes().length;
            await deleteButton(7).click();
            await page.waitForURL(/login\.html/);
            assert.equal(deletes().length, before + 1);
            assert.deepEqual(zones.map(zone => zone.id), [7, 8]);
        });

        await check(`${P}cliques repetidos durante o envio não produzem DELETE duplicado`, async () => {
            await visit();
            acceptConfirm = true;
            hold = deferred();
            const before = deletes().length;
            await deleteButton(7).click();
            await page.waitForTimeout(100);
            // Segundo clique na mesma zona e clique em outra zona com a primeira pendente.
            await deleteButton(7).click({ force: true });
            await deleteButton(8).click({ force: true });
            await page.waitForTimeout(150);
            assert.deepEqual(deletes().slice(before), [{ path: '/zonas/7', method: 'DELETE' }]);
            hold.release();
            await page.waitForFunction(() => window.__toasts.length > 0);
            await page.waitForLoadState('networkidle');
            assert.deepEqual(deletes().slice(before), [{ path: '/zonas/7', method: 'DELETE' }]);
            assert.deepEqual(await toasts(), [{ text: 'Zona excluída com sucesso.', danger: false }]);
            assert.deepEqual(await listed(), ['Zona Doca']);
            assert.equal(await deleteButton(8).isDisabled(), false, 'envio encerrado libera as demais zonas');
        });

        await check(`${P}o ID enviado é o da zona confirmada, mesmo com a lista relida durante o envio`, async () => {
            await visit();
            acceptConfirm = true;
            hold = deferred();
            const before = deletes().length;
            await deleteButton(8).click();
            await page.waitForTimeout(100);
            assert.match(dialogs.at(-1), /"Zona Doca"/);
            // Outra releitura da lista (ex.: após editar zona) enquanto o DELETE está pendente.
            await page.evaluate(() => loadRiskZones());
            hold.release();
            await page.waitForFunction(() => window.__toasts.length > 0);
            await page.waitForLoadState('networkidle');
            assert.deepEqual(deletes().slice(before), [{ path: '/zonas/8', method: 'DELETE' }]);
            assert.deepEqual(await listed(), ['Zona Prensa']);
        });

        // Registro factual da política recebida; não é aprovação (F1 pendente de decisão).
        for (const profile of ['admin', 'supervisor', 'operador']) {
            await check(`${P}${profile}: botão "Excluir zona" presente e habilitado (estado recebido de 7bed786, política não aprovada)`, async () => {
                await visit(users[profile]);
                assert.equal(await page.locator('#riskZonesList [data-delete-zone]').count(), 2);
                assert.equal(await deleteButton(7).isDisabled(), false);
            });
        }

        await check('Nenhuma mutação além dos DELETE de zona simulados e sem exceção JavaScript', async () => {
            assert.deepEqual(writes.filter(call => call.method !== 'DELETE'), []);
            assert(writes.every(call => /^\/zonas\/\d+$/.test(call.path)));
            assert.deepEqual(pageErrors, []);
        });
    } finally {
        await browser.close();
        console.log(JSON.stringify({ passed: passed.length, failures, pageErrors, backend: 'simulado' }));
        if (failures.length) process.exitCode = 1;
    }
})();
