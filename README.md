# VisãoEPI Pro 3.1 — Frontend

Interface web do SPI construída com HTML, CSS e JavaScript. A integração com o backend Flask é centralizada em `js/api.js`.

**Grupo:** Liora 
**Challenge 2026 - FIAP & Metaindustria**  
**Disciplina:** Engenharia de Software / Engenharia da Computação — 3º Ano / 2º Semestre  

## 📌 Sobre o Projeto

### O Problema
No ambiente fabril e de manufatura avançada, o modelo tradicional de gestão de segurança do trabalho é predominantemente reativo. Inspeções periódicas e checagens manuais criam uma falsa sensação de controle, permitindo que pequenos desvios ocorram sem detecção imediata, elevando o risco de acidentes.

### A Solução
O **VisãoEPI Pro** é uma aplicação web voltada ao monitoramento proativo de segurança e gestão de EPIs, desenvolvida para o Open Lab **Metaindústria** (ABDI & SPI Integração). A solução utiliza visão computacional e comunicação em tempo real para detectar não conformidades em feeds de câmeras e emitir alertas instantâneos, transformando a gestão de segurança.

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
- Mapeamento: setores, câmeras, criação de zona com EPI obrigatório e edição de zona.
- Dashboard: alertas recentes, alertas de hoje, estatísticas por categoria/dia e câmeras online.
- Administração: cadastro de usuário com `POST /signup`.

### Limitações tratadas sem dados de exemplo

- Administração: somente cadastro por `POST /signup`; listagem, edição, bloqueio e exclusão indisponíveis.
- Relatórios: alertas dos últimos 30 dias, resolução e distribuição por setor calculados a partir das APIs reais; conformidade e disponibilidade histórica indisponíveis.
- Controle de EPIs: estatísticas reais de alertas por categoria; colaboradores e conformidade indisponíveis.
- Mapeamento: planta ilustrativa, câmeras/setores/zonas reais, criação e edição visual de zonas e contador online.
- Zona: o backend aceita um único `id_epi` e apenas na criação; nenhum GET de zona devolve o EPI
  associado e `PUT /zonas/{id}` não altera essa associação, por isso o campo não aparece na edição.
- Câmera: `GET /cameras` não devolve rotação nem espelhamento; o formulário só reapresenta os valores
  que o próprio backend confirmou em um PUT desta sessão e avisa que o envio substitui o gravado.
- Fonte da câmera: não há suporte a webcam configurável. O campo `ip` é a única fonte e o worker do
  servidor apenas faz um fallback automático para índices locais quando o RTSP falha.
- Perfil: leitura de `/session`, sem edição local. Configurações: somente tema neste navegador.
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
```

Os testes usam API simulada e não alteram o backend. `SPI_CHROMIUM_EXECUTABLE` permite indicar um navegador instalado; `NODE_PATH` pode apontar para um Playwright já existente fora do repositório. A suíte de mídia serve MJPEG multipart por HTTP local.


## 👥 Integrantes do Grupo
- **Bruno Takaya** - RM: 554986 (3ECA)
- **Iury Cardoso Araujo** - RM: 558850 (3ECA)
- **Kethely Ester da Silva** - RM: 559187 (3ECA)
- **Raissa Yukari Senoi** - RM:558120 (3ECR) 
- **Vanessa Iris Nobre Ribas** - RM: 559211 (3ECA)

---

## 🔗 Links Oficiais do Projeto (Sprint 3)
- 📋 **Board no Trello (Scrum):** [Acessar Board Trello](https://trello.com/invite/b/6a7c642a1869ee56e6b87721/ATTIa96dcd45666a92d8945f433a8e43dbddDCF772C5/liora-2026)
- 📝 **Artefatos e Cerimônias Scrum:** [Acessar CERIMONIAS.md](./CERIMONIAS.md)
- 💻 **Repositório Back-end:** [Acessar Repositório do Back-end](https://github.com/iurycar/backend-SPI)
- 🌐 **Aplicação Funcional / Protótipo:** [Acessar Aplicação](COLE_AQUI_O_LINK_DO_SITE_OU_VERCEL)

---

## 🚀 Evolução do Projeto e Justificativas da Sprint 3

Conforme a evolução do projeto e direcionamentos pedagógicos em sala, a Sprint 3 concentrou-se na maturação dos módulos essenciais e na transição do protótipo para a aplicação real:

1. **Evolução do Protótipo para Aplicação Funcional:** Alinhado com a orientação do professor, a equipe evoluiu a interface diretamente do Figma inicial para o front-end web funcional e integrado, permitindo a validação de fluxos reais de uso no sistema.
2. **Atualização da Paleta de Cores e UX:** A interface passou por um refinamento visual e ajuste na paleta de cores para aumentar o contraste dos alertas de risco, garantindo acessibilidade, clareza e rápida leitura das notificações pelos operadores no ambiente industrial.
3. **Treinamento de Visão Computacional:** Evolução nos modelos de visão computacional (Treinamento Visão 4 e 5) para classificação precisa de imagens e detecção de comportamentos ou ausência de EPIs em câmeras IP.
4. **Comunicação em Tempo Real via WebSocket:** Implementação e refinamento dos barramentos de alertas sonoros e visuais instantâneos, com redução no delay de integração entre Back-end e Front-end.
5. **Gestão Ágil no Trello:** Reestruturação do board do grupo seguindo as etapas oficiais do Scrum (*Product Backlog*, *Sprint Backlog*, *Em andamento*, *Em revisão* e *Concluído*) com responsável atribuído em cada card.

---

## 🏗️ Arquitetura Técnica e Tecnologias

A solução adota uma arquitetura orientada a eventos para garantir baixa latência na emissão de alertas:

* **Front-end:** Interface web construída para exibição de dashboards de monitoramento por zonas, controle de acessos por cargo e exibição em tempo real do feed de câmeras.
* **Back-end:** API responsável pela regra de negócio, gerenciamento de permissões, logs de auditoria e servidor WebSocket para o disparo de alertas em tempo real.
* **Módulo de Visão Computacional:** Pipeline de processamento de imagem treinado para reconhecimento de padrões de EPIs e áreas restritas.
* **Banco de Dados:** Estrutura relacional para registro de histórico de incidentes, colaboradores e relatórios de conformidade.