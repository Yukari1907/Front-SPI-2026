// Prompt 5: endereço da câmera por perfil, acessibilidade dos modais e matriz de layout.
// Rede integralmente interceptada; nenhuma API real. Credenciais fictícias.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const shots = process.env.SPI_SCREENSHOT_DIR || '';
const passed = [], failures = [], pageErrors = [], writes = [], consoleLines = [];
const SECRET = /p5-user|p5-secret|cam-[ab]\.test/;
const MASK = '••••••••••••';
// Texto preexistente (Etapa 4), mantido sem alteração.
const HINT = 'Endereço oculto para proteger as credenciais da câmera.';
const baseCameras = () => [
    { id: 1, nome: 'Entrada', ip: 'rtsp://p5-user:p5-secret@cam-a.test/live', id_setor: 1, rotacao: 90, espelhar_horizontal: true, espelhar_vertical: false },
    { id: 2, nome: 'Saída', ip: 'rtsp://p5-user:p5-secret@cam-b.test/live', id_setor: 1, rotacao: 0, espelhar_horizontal: false, espelhar_vertical: false }
];
let cameras = baseCameras();
const zones = [{ id: 7, nome: 'Zona 7', id_camera: 1, poligono: [[.1, .1], [.4, .1], [.4, .4], [.1, .4]], permitido: true, epis_id: [5] }];
const epis = [{ id: 5, nome: 'Capacete', categoria: 'Cabeça', certificado: 'CA123', validade: '2030-01-01', estoque: 10, quantidade_min: 1, em_uso: 2 }];
const alerts = [1, 2].map(id => ({ id, evento: `Evento ${id}`, data: '2026-09-23 10:00:00', resolvido: false, severidade: 2, tipo_deteccao: 'epi', id_camera: 1, id_zona: 7 }));
const users = { admin: { id: 1, nome: 'Admin', perfil: 'admin', admin: true, ativo: true },
    supervisor: { id: 2, nome: 'Supervisor', perfil: 'supervisor', admin: false, ativo: true },
    operador: { id: 3, nome: 'Operador', perfil: 'operador', admin: false, ativo: true } };
let sessionUser = users.admin;
let putStatus = 200;

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.SPI_CHROMIUM_EXECUTABLE || undefined });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        // Conta listeners de teclado no document para detectar duplicação após reaberturas.
        await context.addInitScript(() => {
            window.__keydownAdds = 0;
            const original = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, ...rest) {
                if (type === 'keydown' && this === document) window.__keydownAdds++;
                return original.call(this, type, ...rest);
            };
        });
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (url.port === '5000') {
                let data, status = 200;
                if (request.method() !== 'GET') {
                    const body = request.postDataJSON();
                    writes.push({ path: url.pathname, method: request.method(), body });
                    if (/^\/cameras\/\d+$/.test(url.pathname)) {
                        if (putStatus === 0) return route.abort('failed');
                        status = putStatus;
                        data = status === 200 ? { id: Number(url.pathname.split('/').pop()), ...body } : { message: status === 403 ? 'Acesso negado: você não tem permissão para acessar este recurso.' : 'Falha ao atualizar a câmera' };
                    } else data = { message: 'OK', id: 99 };
                } else if (url.pathname === '/session') data = { authenticated: true, user: sessionUser };
                else if (url.pathname === '/cameras') data = cameras;
                else if (url.pathname === '/cameras/status') data = cameras.map(camera => ({ ...camera, status: 'Ativo' }));
                else if (url.pathname === '/setores') data = [{ id: 1, nome: 'Produção' }, { id: 2, nome: 'Expedição' }];
                else if (url.pathname === '/zonas' || url.pathname.startsWith('/zonas/camera/')) data = zones;
                else if (url.pathname === '/epis') data = epis;
                else if (url.pathname === '/alertas') data = alerts;
                else if (url.pathname.startsWith('/alertas/estatisticas')) data = [];
                else if (url.pathname.startsWith('/estatisticas/')) data = { total_conformes: 8, total_nao_conformes: 2, total_deteccoes: 10, conformidade_media: '80.0' };
                else if (url.pathname === '/users') data = [];
                else if (url.pathname === '/active-learning/status') data = { enabled: false };
                else if (url.pathname === '/video/lote') data = { tamanho_lote: 4 };
                else if (url.pathname.startsWith('/detections/')) data = { connected: true, detections: [], class_count: {}, fps: 12, latencia_ms: 40 };
                else if (url.pathname.startsWith('/video/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#306090"/></svg>' });
                else { status = 404; data = { message: 'Rota não simulada' }; }
                return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
            }
            if (url.hostname === 'cdn.socket.io') return route.fulfill({ contentType: 'application/javascript', body: 'window.io=()=>({on(){}});' });
            if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'application/javascript', body: 'window.Chart=class {static defaults={};constructor(el,c){this.data=c&&c.data;}update(){}destroy(){}};' });
            if (url.hostname !== 'localhost') return route.fulfill({ body: '' });
            const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
            if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
        });
        const page = await context.newPage();
        page.on('pageerror', e => pageErrors.push(e.message));
        page.on('console', message => consoleLines.push(message.text()));
        // Toda confirmação nativa é cancelada: nenhum DELETE sai destes testes.
        page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
        const visit = async (name, user = sessionUser) => {
            sessionUser = user;
            await page.goto(`http://localhost:8765/${name}.html`);
            await page.evaluate(() => window.sessionReady);
            await page.waitForLoadState('networkidle');
        };
        const check = async (name, run) => {
            try { await run(); passed.push(name); console.log('PASS', name); }
            catch (error) { failures.push({ name, error: error.message }); console.log('FAIL', name, error.message); }
        };
        const camerasPuts = () => writes.filter(call => /^\/cameras\/\d+$/.test(call.path));
        const openCamera = async (user, cameraId = 1) => {
            await visit('monitoramento', user);
            if (cameraId !== 1) {
                await page.locator('#cameraSelect').selectOption(String(cameraId));
                await page.waitForFunction(id => currentCameraId === id, cameraId);
            }
            await page.locator('#openCameraModal').click();
            await page.locator('#cameraModal.active').waitFor();
        };
        const ip = page.locator('#cameraIp');
        const modalMarkup = () => page.locator('#cameraModal').evaluate(el => el.outerHTML);
        const formValues = () => page.locator('#cameraModal').evaluate(el =>
            [...el.querySelectorAll('input, select')].map(field => field.value).join(' '));

        // ── Endereço por perfil ─────────────────────────────────────────────
        await check('Admin vê o endereço fictício em texto, sem a mensagem de ocultação, e pode alterá-lo', async () => {
            await openCamera(users.admin);
            assert.equal(await ip.getAttribute('type'), 'text');
            assert.equal(await ip.isDisabled(), false);
            assert.equal(await ip.inputValue(), cameras[0].ip);
            assert.equal(await page.locator('#cameraIpHint').isVisible(), false);
            assert.doesNotMatch(await page.locator('#cameraModal').innerText(), /Endereço oculto/);
            await ip.fill('rtsp://p5-user:p5-secret@cam-a.test/novo');
            const before = camerasPuts().length;
            await page.locator('#saveCameraButton').click();
            await page.waitForFunction(() => !document.getElementById('cameraModal').classList.contains('active'));
            assert.equal(camerasPuts().length, before + 1);
            assert.deepEqual(camerasPuts().at(-1), { path: '/cameras/1', method: 'PUT', body: {
                nome: 'Entrada', ip: 'rtsp://p5-user:p5-secret@cam-a.test/novo', id_setor: 1, rotacao: 90,
                espelhar_horizontal: true, espelhar_vertical: false } });
        });

        await check('Supervisor vê máscara fixa e a mensagem exata, com campo desabilitado e sem o segredo no DOM', async () => {
            await openCamera(users.supervisor);
            assert.equal(await ip.getAttribute('type'), 'password');
            assert(await ip.isDisabled());
            assert.equal(await ip.inputValue(), MASK);
            assert.equal(await page.locator('#cameraIpHint').innerText(), HINT);
            assert(await page.locator('#cameraIpHint').isVisible());
            assert.doesNotMatch(await modalMarkup(), SECRET);
            assert.doesNotMatch(await formValues(), SECRET);
            assert.doesNotMatch(await page.locator('body').innerText(), SECRET);
            // Nenhum controle de revelar: só fechar, cancelar e salvar.
            assert.deepEqual(await page.locator('#cameraModal button').evaluateAll(buttons => buttons.map(b => b.id)),
                ['closeCameraModal', 'cancelCameraModal', 'saveCameraButton']);
        });

        await check('Supervisor: forçar disabled=false e alterar o DOM não muda o ip enviado; outros campos salvam com o endereço original', async () => {
            await openCamera(users.supervisor);
            await ip.evaluate(el => { el.disabled = false; el.type = 'text'; });
            await ip.fill('rtsp://invasor.test/stream');
            await page.locator('#cameraName').fill('Entrada revisada');
            await page.locator('#cameraSector').selectOption('2');
            await page.locator('#saveCameraButton').click();
            await page.waitForFunction(() => !document.getElementById('cameraModal').classList.contains('active'));
            const body = camerasPuts().at(-1).body;
            assert.equal(body.ip, cameras[0].ip);
            assert.equal(body.nome, 'Entrada revisada');
            assert.equal(body.id_setor, 2);
            assert(camerasPuts().every(call => call.body.ip !== MASK && call.body.ip !== ''));
        });

        await check('Supervisor sem endereço original válido: salvamento bloqueado, sem PUT e sem sobrescrita', async () => {
            for (const missing of [undefined, '', '   ', MASK]) {
                cameras = baseCameras();
                if (missing === undefined) delete cameras[0].ip; else cameras[0].ip = missing;
                await openCamera(users.supervisor);
                assert.match(await page.locator('#cameraFormError').innerText(), /não foi carregado/);
                const before = camerasPuts().length;
                await page.locator('#saveCameraButton').click();
                await page.waitForTimeout(150);
                assert.equal(camerasPuts().length, before);
                assert(await page.locator('#cameraModal').isVisible());
            }
            cameras = baseCameras();
        });

        await check('Fechar/reabrir não deixa segredo no formulário e alternar câmeras não mistura endereços', async () => {
            await openCamera(users.admin, 1);
            assert.equal(await ip.inputValue(), cameras[0].ip);
            await page.keyboard.press('Escape');
            assert.equal(await ip.inputValue(), '');
            assert.equal(await ip.getAttribute('type'), 'password');
            assert.doesNotMatch(await formValues(), SECRET);
            await page.locator('#cameraSelect').selectOption('2');
            await page.waitForFunction(() => currentCameraId === 2);
            await page.locator('#openCameraModal').click();
            assert.equal(await ip.inputValue(), cameras[1].ip);
            await page.locator('#cancelCameraModal').click();
            // Supervisor na câmera 2 envia o endereço da câmera 2, não o da 1.
            await openCamera(users.supervisor, 2);
            await page.locator('#saveCameraButton').click();
            await page.waitForFunction(() => !document.getElementById('cameraModal').classList.contains('active'));
            assert.deepEqual([camerasPuts().at(-1).path, camerasPuts().at(-1).body.ip], ['/cameras/2', cameras[1].ip]);
        });

        await check('403, 400 e erro de rede mantêm o modal com erro e não geram sucesso fictício', async () => {
            for (const [status, expected] of [[403, /Acesso negado/], [400, /Falha ao atualizar/], [0, /conectar ao servidor/]]) {
                putStatus = status;
                await openCamera(users.supervisor);
                await page.locator('#saveCameraButton').click();
                await page.waitForFunction(() => !document.getElementById('cameraFormError').hidden
                    && /negado|Falha|conectar/.test(document.getElementById('cameraFormError').textContent));
                assert.match(await page.locator('#cameraFormError').innerText(), expected);
                assert(await page.locator('#cameraModal').isVisible());
                assert.doesNotMatch(await page.locator('#toastContainer').innerText(), /sucesso/);
                assert.equal(await ip.inputValue(), MASK);
            }
            putStatus = 200;
        });

        await check('401 no PUT limpa a sessão e redireciona ao login sem sucesso', async () => {
            putStatus = 401;
            await openCamera(users.admin);
            await page.locator('#saveCameraButton').click();
            await page.waitForURL('**/login.html');
            putStatus = 200;
        });

        await check('Operador não ganha o modal nem a permissão do endereço; clique forçado não abre', async () => {
            await visit('monitoramento', users.operador);
            assert.equal(await page.evaluate(() => [canPerform('cameras:edit'), canPerform('cameras:edit-address')].join()), 'false,false');
            assert.equal(await page.locator('#openCameraModal').isVisible(), false);
            await page.locator('#openCameraModal').evaluate(button => { button.disabled = false; button.click(); });
            assert.equal(await page.locator('#cameraModal').isVisible(), false);
            assert.doesNotMatch(await modalMarkup(), SECRET);
            assert.equal(await ip.inputValue(), '');
            await visit('mapeamento', users.operador);
            assert.equal(await page.locator('#openCameraCreateModal').isVisible(), false);
            assert.equal(await page.evaluate(() => canPerform('cameras:create')), false);
        });

        await check('Permissão do endereço só vem da sessão validada (admin=true conta); storage e supervisor não concedem', async () => {
            await visit('monitoramento', { ...users.supervisor, admin: true });
            assert.equal(await page.evaluate(() => canPerform('cameras:edit-address')), true);
            await visit('monitoramento', users.supervisor);
            assert.equal(await page.evaluate(() => [canPerform('cameras:edit'), canPerform('cameras:edit-address')].join()), 'true,false');
            await page.evaluate(() => localStorage.setItem('visaoepi_session', JSON.stringify({ role: 'admin', admin: true })));
            await visit('monitoramento', users.supervisor);
            assert.equal(await page.evaluate(() => canPerform('cameras:edit-address')), false);
            await page.evaluate(() => localStorage.removeItem('visaoepi_session'));
        });

        await check('Storage, logs, lista, select, tooltips e confirmação de exclusão sem credenciais', async () => {
            await openCamera(users.admin);
            await page.keyboard.press('Escape');
            assert.doesNotMatch(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage })), SECRET);
            assert.doesNotMatch(await page.locator('#cameraList').innerHTML(), SECRET);
            assert.doesNotMatch(await page.locator('#cameraSelect').innerHTML(), SECRET);
            assert.doesNotMatch(await page.locator('#toastContainer').innerText(), SECRET);
            const titles = await page.locator('[title], [aria-label], [placeholder]').evaluateAll(els =>
                els.map(el => [el.title, el.getAttribute('aria-label'), el.placeholder].join(' ')).join(' '));
            assert.doesNotMatch(titles, SECRET);
            await visit('mapeamento', users.admin);
            let message = '';
            page.once('dialog', dialog => { message = dialog.message(); });
            await page.locator('[data-camera-delete="1"]').click();
            await page.waitForTimeout(100);
            assert(message.length > 0);
            assert.doesNotMatch(message, SECRET);
            assert.doesNotMatch(consoleLines.join('\n'), SECRET);
            assert.equal(writes.filter(call => call.method === 'DELETE').length, 0);
        });

        await check('Criação: admin digita o endereço em texto; supervisor em campo mascarado; limpo ao fechar', async () => {
            for (const [user, type] of [[users.admin, 'text'], [users.supervisor, 'password']]) {
                await visit('mapeamento', user);
                await page.locator('#openCameraCreateModal').click();
                assert.equal(await page.locator('#newCameraIp').getAttribute('type'), type);
                await page.locator('#newCameraIp').fill('rtsp://p5-user:p5-secret@cam-a.test/criar');
                await page.keyboard.press('Escape');
                assert.equal(await page.locator('#newCameraIp').inputValue(), '');
            }
        });

        // ── Acessibilidade dos modais ───────────────────────────────────────
        const dialogs = [
            { page: 'inventario', modal: 'inventoryModal', opener: '#openInventoryModal' },
            { page: 'administracao', modal: 'userModal', opener: '#openUserModal' },
            { page: 'alertas', modal: 'alertDetailsModal', opener: '#alertsTable button' },
            { page: 'monitoramento', modal: 'cameraModal', opener: '#openCameraModal' },
            { page: 'mapeamento', modal: 'zoneModal', opener: '#openZoneModal' },
            { page: 'mapeamento', modal: 'sectorModal', opener: '#openSectorModal' },
            { page: 'mapeamento', modal: 'cameraCreateModal', opener: '#openCameraCreateModal' }
        ];
        for (const dialog of dialogs) {
            await check(`Modal ${dialog.modal}: semântica, foco inicial, Tab/Shift+Tab contidos, Esc, retorno do foco e sem listeners duplicados`, async () => {
                await visit(dialog.page, users.admin);
                const modal = page.locator('#' + dialog.modal);
                const opener = page.locator(dialog.opener).first();
                await opener.waitFor();
                const semantics = await modal.evaluate(el => {
                    const ref = id => id && document.getElementById(id);
                    const fields = [...el.querySelectorAll('input:not([type=hidden]), select, textarea')];
                    return {
                        role: el.getAttribute('role'), modal: el.getAttribute('aria-modal'),
                        name: ref(el.getAttribute('aria-labelledby'))?.textContent.trim() || '',
                        described: el.hasAttribute('aria-describedby') ? Boolean(ref(el.getAttribute('aria-describedby'))) : true,
                        close: el.querySelector('.modal-close')?.getAttribute('aria-label'),
                        unlabeled: fields.filter(f => !f.labels?.length && !f.getAttribute('aria-label') && !f.getAttribute('aria-labelledby')).map(f => f.id || f.name)
                    };
                });
                assert(semantics.name.length > 0, 'nome acessível vazio');
                assert.deepEqual(semantics, { role: 'dialog', modal: 'true', name: semantics.name, described: true, close: 'Fechar', unlabeled: [] });
                assert.equal(await modal.isVisible(), false);
                const listenersBefore = await page.evaluate(() => window.__keydownAdds);
                for (let round = 0; round < 3; round++) {
                    await opener.click();
                    await modal.locator('.modal-box').waitFor();
                    assert(await modal.evaluate(el => el.contains(document.activeElement)), 'foco inicial dentro do modal');
                    const count = await modal.evaluate(el => [...el.querySelectorAll("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])")]
                        .filter(e => !e.disabled && e.getClientRects().length).length);
                    for (const key of ['Tab', 'Shift+Tab']) {
                        for (let index = 0; index < count + 2; index++) {
                            await page.keyboard.press(key);
                            assert(await modal.evaluate(el => el.contains(document.activeElement)), `${key} escapou do modal`);
                        }
                    }
                    await page.keyboard.press('Escape');
                    assert.equal(await modal.isVisible(), false);
                    assert.equal(await modal.evaluate(el => el.contains(document.activeElement)), false);
                    assert(await opener.evaluate(el => el === document.activeElement), 'foco volta ao acionador');
                }
                assert.equal(await page.evaluate(() => window.__keydownAdds), listenersBefore);
            });
        }

        await check('Esc respeita envio em curso no Inventário e na Administração; senha não fica no formulário fechado', async () => {
            await visit('inventario', users.admin);
            await page.locator('#openInventoryModal').click();
            await page.evaluate(() => { inventorySaving = true; });
            await page.keyboard.press('Escape');
            assert(await page.locator('#inventoryModal').isVisible());
            await page.evaluate(() => { inventorySaving = false; });
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#inventoryModal').isVisible(), false);
            await visit('administracao', users.admin);
            await page.locator('#openUserModal').click();
            await page.locator('#signupPassword').fill('senha-ficticia');
            await page.evaluate(() => { signupPending = true; });
            await page.keyboard.press('Escape');
            assert(await page.locator('#userModal').isVisible());
            await page.evaluate(() => { signupPending = false; });
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#userModal').isVisible(), false);
            assert.equal(await page.locator('#signupPassword').inputValue(), '');
        });

        await check('Edição de zona foca o nome (câmera desabilitada) e o toast é região live', async () => {
            await visit('mapeamento', users.admin);
            await page.locator('[data-edit-zone="7"]').click();
            assert.equal(await page.evaluate(() => document.activeElement.id), 'zoneName');
            await page.keyboard.press('Escape');
            await page.evaluate(() => showToast('Teste'));
            assert.equal(await page.locator('#toastContainer').getAttribute('role'), 'status');
        });

        // ── Matriz de layout: páginas e modais em 1440/768/390, temas claro e escuro ──
        const pages = ['dashboard', 'monitoramento', 'alertas', 'inventario', 'controle-de-epis', 'mapeamento', 'relatorios', 'administracao', 'configuracao', 'login', 'perfil', 'sobre'];
        const sizes = [[1440, 900], [768, 1024], [390, 844]];
        // Mecanismo real (theme.js); espera a transição de 0,25s do body antes de medir/capturar.
        const setTheme = async theme => {
            await page.evaluate(theme => applyTheme(theme), theme);
            await page.waitForTimeout(350);
        };
        for (const [width, height] of sizes) {
            await page.setViewportSize({ width, height });
            for (const theme of ['light', 'dark']) {
                await check(`Layout ${width}x${height} (${theme}): 12 páginas sem overflow horizontal; 7 modais dentro da tela com rodapé alcançável`, async () => {
                    for (const name of pages) {
                        await visit(name, users.admin);
                        await setTheme(theme);
                        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
                        assert(overflow <= 0, `${name}: overflow horizontal de ${overflow}px`);
                        if (shots) await page.screenshot({ path: path.join(shots, `p5-${name}-${width}-${theme}.png`) });
                    }
                    for (const dialog of dialogs) {
                        await visit(dialog.page, dialog.modal === 'cameraModal' ? users.supervisor : users.admin);
                        await setTheme(theme);
                        await page.locator(dialog.opener).first().click();
                        const box = await page.locator(`#${dialog.modal} .modal-box`).boundingBox();
                        assert(box.x >= 0 && box.x + box.width <= width + 0.5, `${dialog.modal}: modal fora da largura`);
                        assert(box.y >= 0 && box.y + box.height <= height + 0.5, `${dialog.modal}: modal maior que a tela`);
                        const footer = page.locator(`#${dialog.modal} .modal-footer button`).last();
                        await footer.scrollIntoViewIfNeeded();
                        const button = await footer.boundingBox();
                        assert(button && button.y >= 0 && button.y + button.height <= height && button.x + button.width <= width + 0.5, `${dialog.modal}: rodapé inacessível`);
                        if (shots) await page.screenshot({ path: path.join(shots, `p5-modal-${dialog.modal}-${width}-${theme}.png`) });
                        await page.keyboard.press('Escape');
                    }
                });
            }
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() => applyTheme('light'));

        await check('Sem DELETE, sem mutação fora das câmeras simuladas, máscara nunca enviada e sem exceção JavaScript', async () => {
            assert.equal(writes.filter(call => call.method === 'DELETE').length, 0);
            assert(writes.every(call => /^\/cameras\/\d+$/.test(call.path)), JSON.stringify(writes.map(w => w.path)));
            assert(writes.every(call => call.body?.ip !== MASK));
            assert.deepEqual(pageErrors, []);
        });
    } finally {
        await browser.close();
    }
    console.log(JSON.stringify({ passed: passed.length, failures, pageErrors, backend: 'simulado' }, null, 2));
    if (failures.length || pageErrors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
