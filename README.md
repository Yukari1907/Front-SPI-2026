# VisãoEPI Pro 3.1 — Frontend

Interface web do SPI construída com HTML, CSS e JavaScript. A integração com o backend Flask é centralizada em `js/api.js`.

## Como executar

1. Configure e inicie o PostgreSQL.
2. Inicie o backend Flask em `http://localhost:5000`.
3. Sirva esta pasta por HTTP; não use `file://`.

```bash
python -m http.server 8080
```

Acesse `http://localhost:8080/login.html`.

## Configuração da API

Defina `window.SPI_API_BASE_URL` antes de carregar `js/api.js` para outro ambiente. O padrão é `http://localhost:5000` e fornece `apiGet`, `apiPost`, `apiPut`, `apiDelete` e `apiVideoUrl`.

As chamadas usam `credentials: 'include'` para enviar o cookie de sessão Flask. Respostas `401` limpam a sessão local e redirecionam para o login quando apropriado.

## Estado da integração

### Integrado ao backend

- Login, validação de sessão e logout.
- Inventário de EPIs: listar, criar, editar e excluir.
- Alertas: listar e marcar como resolvido.
- Monitoramento: câmeras, setores, stream MJPEG, polling de detecções e edição de câmera
  (nome, IP, setor, rotação e espelhamento) para admin/supervisor.
- Monitoramento aberto: zonas reconsultadas a cada 15 segundos após a resposta, preservando
  o último overlay válido em falhas. Vídeo reconecta automaticamente com backoff de
  5/10/20/30 segundos; timers pausam em página oculta e são limpos ao trocar câmera/sair.
- Mapeamento: setores, câmeras, criação de zona com múltiplos EPIs obrigatórios e edição de nome/área/permissão.
- Configuração: CRUD de setores e cadastro/exclusão de câmeras; dados consultados pelo botão “Carregar setores e câmeras”.
- Alertas: filtros locais de tipo persistido e datas, além de busca, severidade, status e paginação de 50.
- Dashboard: alertas recentes, alertas de hoje, estatísticas por categoria/dia e câmeras online.
- Administração: listagem com `GET /users`, métricas derivadas e cadastro com `POST /signup`, seguido de atualização da lista.
- Configuração / Visão Computacional: Active Learning via `POST /active-learning/toggle`, para admin/supervisor, com confirmação somente após sucesso do servidor.

### Limitações tratadas sem dados de exemplo

- Administração: `/users` pode retornar 500 no backend atual; a interface informa erro e permite tentar novamente. Edição, bloqueio e exclusão permanecem indisponíveis.
- Workers: controle de lote preparado, mas bloqueado em todas as camadas do frontend porque a rota atual pode parar os workers antes de falhar. Active Learning e lote não têm GET de estado; nenhum valor inicial é presumido.
- Relatórios: alertas dos últimos 30 dias, resolução, distribuição por setor e conformidade média das APIs reais; evolução e disponibilidade histórica indisponíveis.
- Controle de EPIs: estatísticas reais de alertas por categoria e conformidade agregada por setor; colaboradores e conformidade individual indisponíveis.
- Mapeamento: planta ilustrativa, câmeras/setores/zonas reais, criação e edição visual de zonas e contador online.
- Zona: POST aceita `ids_epis: int[]`, inclusive lista vazia. PUT aceita substituir associações, mas os GETs
  só devolvem categorias; a edição omite a lista para preservar vínculos. Exclusão e transferência entre câmeras permanecem bloqueadas pelo contrato atual.
- Câmera: `GET /cameras` devolve rotação e espelhamento e o formulário usa esses valores reais.
  O POST persiste nome, IP e setor; ajustes de imagem são feitos depois pelo PUT em Monitoramento.
- Fonte da câmera: não há suporte a webcam configurável. O campo `ip` é a única fonte e o worker do
  servidor apenas faz um fallback automático para índices locais quando o RTSP falha.
- Perfil: leitura de `/session`, sem edição local. Configurações: tema neste navegador e ajustes globais de visão conforme disponibilidade do servidor.
- Login: cookie como fonte de autenticação; dados locais antigos não autorizam acesso.

## Páginas

Login, dashboard, monitoramento, alertas, inventário, controle de EPIs, mapeamento, relatórios, administração, configurações, perfil e sobre.

## Desenvolvimento local

- Se a API estiver indisponível, as áreas integradas exibem erro de conexão.
- Ajuste a URL do backend em `js/api.js` para outro ambiente.
- Não armazene senhas, tokens ou credenciais reais no frontend.

## Testes

Com Playwright e navegador já disponíveis (nenhuma instalação realizada nesta auditoria):

```sh
node tests/frontend-integration.cjs
node tests/zone-media.cjs
node tests/final-audit.cjs
node tests/settings-admin.cjs
node tests/crud-audit.cjs
node tests/monitoring-recovery.cjs
```

Os testes usam API simulada e não alteram o backend. `SPI_CHROMIUM_EXECUTABLE` permite indicar um navegador instalado; `NODE_PATH` pode apontar para um Playwright já existente fora do repositório. A suíte de mídia serve MJPEG multipart por HTTP local.

A suíte de recuperação usa relógio controlado e MJPEG HTTP local para cobrir falhas,
retomada, corridas de câmera, visibilidade, limpeza e os três tamanhos nos dois temas.
O registro desta entrega está em [ETAPA5_MONITORAMENTO.md](ETAPA5_MONITORAMENTO.md).

Os contratos atuais, as pendências e os requisitos para liberar os controles estão em [CONTRATOS_BACKEND.md](CONTRATOS_BACKEND.md).

A matriz CRUD, os limites da auditoria e a validação da etapa 3 estão em [AUDITORIA_CRUD_ETAPA3.md](AUDITORIA_CRUD_ETAPA3.md).
