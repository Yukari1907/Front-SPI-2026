const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const passed = [], errors = [], mutations = [], calls = [];
const check = name => { passed.push(name); console.log('PASS', name); };
const today = new Date();
const day = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
let sessionStatus = 200, logoutStatus = 200, apiStatus = 200, chartAvailable = true;
let user = { id: 7, nome: 'Pessoa', sobrenome: 'Real', email: 'pessoa@example.test', telefone: '123', unidade: null, perfil: 'admin', admin: true, ativo: true };
let alerts = [{ id: 1, data: day+' 10:00:00', resolvido: true, severidade: 2, evento: 'EPI', id_camera: 1 }, { id: 2, data: day+' 11:00:00', resolvido: false, severidade: 3, evento: 'Queda', id_camera: 2 }, { id: 3, data: '2000-01-01 00:00:00', resolvido: true }];
let epis = [{ id: 4, nome: 'Protetor', categoria: 'Auditiva', certificado: 'CA real', validade: day, estoque: 10, quantidade_min: 2, em_uso: 3 }];
let stats = [{ categoria: 'Auditiva', total: 7 }, { categoria: 'Sem Categoria', total: 2 }];
(async () => {
    const browser = await chromium.launch({headless:true, executablePath:process.env.SPI_CHROMIUM_EXECUTABLE || undefined});
    try {
        const context = await browser.newContext({viewport:{width:1440,height:1000}, acceptDownloads:true});
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if(url.port === '5000') {
                calls.push(url.pathname);
                let status = apiStatus, data = [];
                if(url.pathname === '/session') { status = sessionStatus; data = {authenticated:true,user}; }
                else if(url.pathname === '/logout') { status = logoutStatus; data = {message:'OK'}; }
                else if(url.pathname === '/login') { status = 200; data = {user}; }
                else if(url.pathname === '/signup') { status = 201; data = {message:'Signup successful'}; }
                else if(url.pathname === '/alertas') data = alerts;
                else if(url.pathname === '/alertas/estatisticas/epi') data = stats;
                else if(url.pathname === '/alertas/estatisticas/periodo') data = [{dia:day,total:2}];
                else if(url.pathname === '/cameras' || url.pathname === '/cameras/status') data = [{id:1,nome:'Entrada',id_setor:1,status:'Ativo',ip:'rtsp://secret:secret@10.0.0.1/video'}];
                else if(url.pathname === '/setores') data = [{id:1,nome:'Área real'}];
                else if(url.pathname === '/zonas') data = [];
                else if(url.pathname === '/epis') data = epis;
                else if(url.pathname.startsWith('/epis/')) data = epis[0];
                else if(url.pathname.startsWith('/detections/')) data = {connected:true,detections:[],class_count:{}};
                else if(url.pathname.startsWith('/zonas/')) data = [];
                else if(url.pathname.startsWith('/video/')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"/>'});
                else throw Error('Endpoint inesperado: '+url.pathname);
                if(!['GET','OPTIONS'].includes(route.request().method())) mutations.push({url:url.pathname,body:route.request().postDataJSON()});
                return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
            }
            if(url.hostname === 'cdn.socket.io') return route.fulfill({contentType:'application/javascript',body:'window.io=()=>({on:()=>{}});'});
            if(url.hostname === 'cdn.jsdelivr.net') return route.fulfill({contentType:'application/javascript',body:chartAvailable ? 'window.charts={};window.Chart=class {static defaults={};constructor(el,config){this.data=config.data;window.charts[el.id]=config;}update(){}};' : ''});
            if(url.hostname !== 'localhost') return route.fulfill({body:'',contentType:'text/css'});
            const file=path.join(root,decodeURIComponent(url.pathname).slice(1));
            if(!fs.existsSync(file)) return route.fulfill({status:404,body:''});
            const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'};
            return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'text/plain'});
        });
        const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
        const visit=async file=>{await page.goto('http://localhost:8765/'+file+'.html');if(file!=='login') await page.evaluate(()=>window.sessionReady);};
        await visit('dashboard');
        await page.waitForFunction(()=>document.getElementById('dashboardAlertsToday').textContent==='2');
        await page.waitForFunction(()=>window.charts?.dashboardPpeChart);
        assert.deepEqual(await page.evaluate(()=>charts.dashboardPpeChart.data.labels),['Auditiva','Sem Categoria']);
        assert.deepEqual(await page.evaluate(()=>charts.dashboardPpeChart.data.datasets[0].data),[7,2]);
        assert.match(await page.locator('#userChip').innerText(),/Pessoa Real/);
        check('Cookie válido sem armazenamento local recupera sessão; Dashboard usa categorias e totais reais');
        apiStatus=500;await visit('dashboard');
        await page.waitForSelector('#dashboardPpeChartState');
        assert.match(await page.locator('#dashboardPpeChartState').innerText(),/indisponíveis/);
        assert.equal(await page.locator('#dashboardCamerasOnline').innerText(),'—');
        assert.equal(await page.locator('#dashboardAlertsToday').innerText(),'—');
        assert.equal(await page.evaluate(()=>Object.keys(window.charts||{}).length),0);
        check('Falha das estatísticas não produz exemplos, categorias ou contagens falsas');
        apiStatus=200;await visit('relatorios');
        await page.waitForFunction(()=>document.getElementById('reportTotal').textContent==='2');
        assert.equal(await page.locator('#reportResolved').innerText(),'1');
        assert.match(await page.locator('#reportRate').innerText(),/50.0%/);
        assert.deepEqual(await page.evaluate(()=>reportSectors),[['Área real',1],['Setor indisponível',1]]);
        const downloadPromise=page.waitForEvent('download');await page.locator('#exportReport').click();const download=await downloadPromise;
        const stream=await download.createReadStream();let csv='';for await(const chunk of stream) csv+=chunk.toString('utf8');
        assert.match(csv,/50.0%/);assert.match(csv,/Dados indisponíveis/);assert.doesNotMatch(csv,/94%|98%|Janeiro/);
        check('Relatório e CSV usam período real, resolução calculada e setor ausente explícito');
        apiStatus=500;await visit('relatorios');await page.waitForSelector('#reportAlertsState');
        assert(await page.locator('#exportReport').isDisabled());assert.equal(await page.locator('#reportTotal').innerText(),'—');
        apiStatus=200;const savedAlerts=alerts;alerts=[];await visit('relatorios');await page.waitForFunction(()=>document.getElementById('reportTotal').textContent==='0');
        assert.match(await page.locator('#reportRate').innerText(),/—/);alerts=savedAlerts;
        check('Relatórios distinguem erro de lista vazia e não dividem por zero');
        await visit('controle-de-epis');await page.waitForSelector('#ppeIssueChart');
        await page.waitForFunction(()=>window.charts?.ppeIssueChart);
        assert.match(await page.locator('#workersTable').innerText(),/indisponíveis/);
        assert.deepEqual(await page.locator('.kpi strong').allTextContents(),['—','—','—','—']);
        assert.deepEqual(await page.evaluate(()=>charts.ppeIssueChart.data.datasets[0].data),[7,2]);
        check('Conformidade não inventa trabalhadores nem percentuais; gráfico representa alertas de EPI');
        await page.evaluate(()=>{localStorage.setItem('visaoepi_users',JSON.stringify([{name:'Falso'}]));localStorage.setItem('visaoepi_profile',JSON.stringify({name:'Falso',role:'admin'}));});
        await visit('administracao');assert.match(await page.locator('#usersTable').innerText(),/indisponível/);
        assert.doesNotMatch(await page.locator('body').innerText(),/Falso/);
        await page.locator('#openUserModal').click();await page.locator('[name="name"]').fill('Novo Teste');await page.locator('[name="email"]').fill('novo@example.test');await page.locator('[name="password"]').fill('test-only-password');await page.locator('[name="role"]').selectOption('supervisor');await page.locator('#userForm [type="submit"]').click();
        await page.waitForFunction(()=>!document.getElementById('userModal').classList.contains('active'));
        assert.equal(mutations.at(-1).url,'/signup');assert.equal(mutations.at(-1).body.perfil,'supervisor');assert.equal(await page.locator('#adminUsersCount').innerText(),'—');
        check('Administração ignora usuários locais; signup envia perfil suportado sem fabricar registro/ID');
        await visit('perfil');assert.equal(await page.locator('[name="phone"]').inputValue(),'123');assert.equal(await page.locator('[name="unit"]').inputValue(),'');assert(await page.locator('#saveProfile').isDisabled());
        assert.equal(await page.locator('#profileNameDisplay').innerText(),'Pessoa Real');
        await visit('configuracao');assert(await page.locator('#model').isDisabled());assert(await page.locator('#notifyEmailCheckbox').isDisabled());assert.equal(await page.locator('#confidence').inputValue(),'Dados indisponíveis');
        check('Perfil e configurações não apresentam gravações locais como alterações do backend');
        await visit('inventario');await page.waitForFunction(()=>document.getElementById('invTotal').textContent==='10');
        assert.equal(await page.locator('#invUse').innerText(),'3');assert.match(await page.locator('#inventoryTable').innerText(),/Disponível/);assert.equal(await page.locator('#invExpiry').innerText(),'1');
        assert.deepEqual(await page.locator('#inventoryCategory option').allTextContents(),['Todas','Auditiva']);
        assert.match(await page.locator('#movementList').innerText(),/indisponível/);
        await page.evaluate(()=>editInventoryItem(4));assert.equal(await page.locator('[name="category"]').inputValue(),'Auditiva');assert(await page.locator('[name="location"]').isDisabled());assert(await page.locator('[name="code"]').isDisabled());await page.locator('#inventoryForm button:not([type="button"])').click();
        await page.waitForFunction(()=>!document.getElementById('inventoryModal').classList.contains('active'));
        assert.equal(mutations.at(-1).url,'/epis/4');assert.equal(mutations.at(-1).body.validade,day);assert(!('location' in mutations.at(-1).body));
        apiStatus=500;await page.evaluate(()=>loadInventoryFromApi());assert.equal(await page.locator('#invTotal').innerText(),'—');assert.match(await page.locator('#inventoryTable').innerText(),/indisponíveis/);assert(await page.locator('#exportInventory').isDisabled());
        apiStatus=200;epis=[];await page.evaluate(()=>loadInventoryFromApi());assert.equal(await page.locator('#invTotal').innerText(),'0');assert.match(await page.locator('#inventoryTable').innerText(),/Nenhum/);
        check('Inventário: categoria real, validade de hoje, PUT suportado, erro sem zeros e lista vazia');
        await visit('monitoramento');await page.waitForFunction(()=>document.getElementById('cameraConnectionStatus').textContent==='Conectada');assert.equal(await page.locator('#performanceFps').innerText(),'—');assert.equal(await page.locator('#performanceLatency').innerText(),'—');
        check('Métricas ausentes em detecções não viram FPS/latência fictícios');
        await visit('alertas');await page.waitForFunction(()=>alerts.length>0);await page.evaluate(()=>{alerts[0].dateTime=null;renderAlerts();});assert.equal(await page.locator('#alertsTable tr').first().locator('td').first().innerText(),'—');
        check('Alerta sem data não recebe horário atual');
        user={...user,perfil:'supervisor',admin:false};await visit('inventario');assert(await page.evaluate(()=>canPerform('inventory:delete')));assert(!await page.evaluate(()=>canPerform('users:create')));
        user={...user,perfil:'operador'};await visit('inventario');assert(!await page.evaluate(()=>canPerform('inventory:edit')));assert(await page.locator('#openInventoryModal').isHidden());
        check('Perfis canônicos supervisor/operador seguem permissões reais de escrita');
        user={...user,perfil:'admin',admin:true};
        for(const width of [1440,768,390]) for(const theme of ['light','dark']) {
            await page.setViewportSize({width,height:1000});
            for(const file of ['dashboard','relatorios','controle-de-epis','inventario','administracao','perfil','configuracao']) {
                await visit(file);await page.evaluate(t=>applyTheme(t),theme);
                assert(await page.locator('h1').isVisible(),file);
                assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${file} ${width}: overflow horizontal`);
            }
            check(`Telas auditadas sem overflow em ${width}px / ${theme}`);
        }
        chartAvailable=false;for(const file of ['dashboard','inventario','relatorios','controle-de-epis']) { await visit(file); await page.waitForLoadState('networkidle'); }
        chartAvailable=true;check('Falha da biblioteca de gráficos não impede as páginas');
        await visit('dashboard');await page.waitForLoadState('networkidle');
        await page.route('**/epis',route=>route.fulfill({status:200,contentType:'application/json',body:'{invalid'}));
        assert.equal(await page.evaluate(async()=>(await apiGet('/epis')).ok),false);
        await page.unroute('**/epis');
        apiStatus=403;const denied=await page.evaluate(()=>apiGet('/epis'));assert.equal(denied.status,403);assert.equal(denied.ok,false);assert.match(page.url(),/dashboard.html/);apiStatus=200;
        const credentials=await page.evaluate(async()=>{const original=window.fetch;let credentials;window.fetch=(url,options)=>{credentials=options.credentials;return original(url,options);};await apiGet('/epis');window.fetch=original;return credentials;});assert.equal(credentials,'include');
        check('API rejeita JSON inválido, preserva 403 sem logout e envia credentials include');
        sessionStatus=500;const before=calls.length;await visit('dashboard');assert.match(await page.locator('h1').innerText(),/Sessão indisponível/);assert.deepEqual(calls.slice(before),['/session']);
        check('Falha de sessão não autoriza pelo localStorage nem redireciona como expiração');
        sessionStatus=200;await visit('dashboard');logoutStatus=500;await page.evaluate(()=>logout());assert.match(page.url(),/dashboard.html/);logoutStatus=200;await page.evaluate(()=>logout());await page.waitForURL('**/login.html');assert.equal(await page.evaluate(()=>localStorage.getItem('visaoepi_profile')),null);
        check('Logout só informa encerramento após sucesso e limpa perfil/cache');
        sessionStatus=401;await page.goto('http://localhost:8765/dashboard.html');await page.waitForURL('**/login.html');
        check('401 em sessão redireciona ao login');
        sessionStatus=200;await visit('login');
        assert.equal(await page.locator('[name="email"]').inputValue(),'');assert.equal(await page.locator('#loginPassword').inputValue(),'');assert.equal(await page.locator('.demo-box').count(),0);
        await page.locator('[name="email"]').fill('pessoa@example.test');await page.locator('#loginPassword').fill('test-only-password');await page.locator('[type="submit"]').click();await page.waitForURL('**/dashboard.html');
        assert.equal(mutations.at(-1).url,'/login');assert.equal(await page.evaluate(()=>localStorage.getItem('visaoepi_session')),null);
        check('Login sem credenciais de exemplo autentica via API, sem guardar senha ou identidade local');
        assert.deepEqual(errors,[]);check('Ausência de exceções JavaScript nas regressões da auditoria');
        console.log(JSON.stringify({passed:passed.length,errors},null,2));
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
