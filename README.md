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
- Monitoramento: câmeras, setores, stream MJPEG e polling de detecções.
- Mapeamento: setores e câmeras.
- Dashboard: alertas recentes, alertas de hoje, estatísticas por categoria/dia e câmeras online.
- Administração: cadastro de usuário com `POST /signup`.

### Limitações tratadas sem dados de exemplo

- Administração: somente cadastro por `POST /signup`; listagem, edição, bloqueio e exclusão indisponíveis.
- Relatórios: alertas dos últimos 30 dias, resolução e distribuição por setor calculados a partir das APIs reais; conformidade e disponibilidade histórica indisponíveis.
- Controle de EPIs: estatísticas reais de alertas por categoria; colaboradores e conformidade indisponíveis.
- Mapeamento: planta ilustrativa, câmeras/setores/zonas reais, criação visual de zonas e contador online.
- Perfil: leitura de `/session`, sem edição local. Configurações: somente tema neste navegador.
- Login: cookie como fonte de autenticação; dados locais antigos não autorizam acesso.

Consulte [AUDITORIA_FINAL_INTEGRACAO.md](AUDITORIA_FINAL_INTEGRACAO.md) para contratos, problemas do backend e validações.

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
```

Os testes usam API simulada e não alteram o backend. `SPI_CHROMIUM_EXECUTABLE` permite indicar um navegador instalado; `NODE_PATH` pode apontar para um Playwright já existente fora do repositório. A suíte de mídia serve MJPEG multipart por HTTP local.
