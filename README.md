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

`js/api.js` usa por padrão `http://localhost:5000` e fornece `apiGet`, `apiPost`, `apiPut`, `apiDelete` e `apiVideoUrl`.

As chamadas usam `credentials: 'include'` para enviar o cookie de sessão Flask. Respostas `401` limpam a sessão local e redirecionam para o login quando apropriado.

## Estado da integração

### Integrado ao backend

- Login, validação de sessão e logout.
- Inventário de EPIs: listar, criar, editar e excluir.
- Alertas: listar e marcar como resolvido.
- Monitoramento: câmeras, setores, stream MJPEG e polling de detecções.
- Mapeamento: setores e câmeras.
- Dashboard: alertas recentes.
- Administração: cadastro de usuário com `POST /signup`.

### Parcialmente integrado

- Administração: cadastro é real; listar, editar, bloquear e excluir continuam locais porque faltam endpoints.
- Mapeamento: posições são distribuídas no frontend porque a API não retorna coordenadas X/Y.
- Dashboard: utiliza os campos disponíveis nos alertas.

### Ainda mockado/local

- Controle de EPIs por colaborador.
- Relatórios e séries históricas.
- Edição, bloqueio e exclusão de usuários.
- Preferências de interface e dados auxiliares em `localStorage`.

## Páginas

Login, dashboard, monitoramento, alertas, inventário, controle de EPIs, mapeamento, relatórios, administração, configurações, perfil e sobre.

## Desenvolvimento local

- Se a API estiver indisponível, as áreas integradas exibem erro de conexão.
- Ajuste a URL do backend em `js/api.js` para outro ambiente.
- Não armazene senhas, tokens ou credenciais reais no frontend.
