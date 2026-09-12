# Relatório de ajustes do frontend — 2026-09-11

## Tarefa 1 — Integração com o backend

Implementação feita em `Front-SPI-2026`, na branch existente
`integration/frontend-backend`, sem commit ou push. O backend não foi alterado.
`CONTRATO_INTEGRACAO.md` foi substituído pela cópia integral da revisão de
2026-09-10 do backend, branch `ajustes/integracao-backend-v2`, incluindo Classificação.

### Correções entregues

| Área | Resultado |
| --- | --- |
| Detecções | `js/monitoramento.js` lê `data.detections`, `class_count` e `connected`. A contagem do frame aparece mesmo quando não há detecções associadas a zonas. Confiança zero também é exibida. |
| Disponibilidade | A câmera selecionada recebe status real; as demais começam como “Não verificado”. Dados antigos são limpos ao trocar câmera, desconectar, receber 503 ou falhar a rede. Respostas da seleção anterior são ignoradas. |
| Polling | Consulta imediata e nova consulta três segundos após cada resposta, evitando sobreposição. Continua após indisponibilidade e é cancelado ao sair da página. |
| Desempenho | FPS e latência são atualizados junto das detecções. Barra de FPS: `min(100, fps / 30 * 100)`. Barra de latência: `min(100, latencia_ms / 200 * 100)`, com indicação de que menor latência é melhor. São escalas visuais, não limites garantidos da câmera. `null` aparece como `—` com barra vazia. |
| Severidade | Alertas, eventos recentes e painel usam 1 = Baixo/success, 2 = Médio/warning, 3 = Crítico/danger. Valor desconhecido recebe “Não informada”, sem inferência pelo texto. Resolver um evento não muda sua severidade. |
| Cards de alertas | Contagens reais a partir da listagem completa `GET /alertas`, pois contrato e rotas atuais não oferecem agregado por severidade. Contam todo o histórico, independentemente dos filtros visuais. Resolvidos também contam em sua severidade; o card Resolvidos conta `resolvido === true` e atualiza após resolução. |
| Estados vazios/erro | 404 na listagem significa vazio e contagens zero. Falha de API mostra `—`, sem apresentar zero como medição real. |
| Dashboard | Câmeras Online usa `GET /cameras/status`: quantidade de `status === "Ativo"` / tamanho do array. `[]` resulta em `0/0`; falhas em `—`. Eventos recentes são ordenados pela data REST antes da seleção dos três mais recentes. |
| Notificações | Painel e toast exibem evento, câmera, setor e zona disponíveis, com fallback para IDs. Postura/queda sem zona e nomes nulos são aceitos. Textos são escapados no painel. |
| Mapa | O indicador existente foi testado com payload de queda contendo os novos campos. `mapeamento.js` não foi alterado. |

Os cards refletem a carga REST atual da página e, em alertas, a resolução feita na
própria tela. Não foi acrescentado polling global para esses cards nem substituído
o polling de detecções por WebSocket.

Nenhuma tela ou seção de Classificação foi criada. A instrução expressa do usuário
de usar o painel existente prevalece sobre os trechos do contrato que sugerem
telas separadas. O histórico continua na listagem geral, sem reinterpretar `legado`.

### Pendências confirmadas com o usuário

1. **Paginação em blocos de 50:** o contrato e o backend não definem nem implementam
   os parâmetros. Anterior/Próximo foram preparados com os estilos existentes e
   permanecem desabilitados. A listagem continua completa; não há carregamento em
   blocos nem paginação local disfarçada de paginação da API. A próxima etapa precisa
   definir parâmetros, ordenação, indicação de fim/total e interação com filtros.
   Ao paginar no backend, a estratégia de contagem global também deverá ser revista.
2. **Trabalhadores Ativos e Conformidade EPI:** aguardam definição e implementação
   do backend, conforme resposta do usuário. Exibem `—` e “Dados indisponíveis”,
   sem fórmulas inventadas ou valores de demonstração.
3. **Alertas Hoje:** adiado pela orientação posterior de integrar somente Câmeras
   Online entre os KPIs do dashboard nesta entrega. O valor demonstrativo foi
   substituído por `—`; não foi acrescentada consulta ou fórmula para esse indicador.

### Validação executada

- `node --check` nos cinco arquivos JavaScript alterados: aprovado.
- `git diff --check`: aprovado.
- `tests/frontend-integration.cjs`: **10 grupos de verificações aprovados** no
  Chromium real, com HTTP, sessão, evento Socket.IO e bibliotecas externas simulados.
  Não houve exceções JavaScript de página. Cobertura:
  - objeto de detecções, contagem independente e confiança zero;
  - barras, saturação em 100%, latência nula e captura sem resultado;
  - desconexão, 503, falha de rede e recuperação pelo polling;
  - resposta atrasada de outra câmera;
  - notificação de queda sem zona, fallback e escape de HTML;
  - severidade numérica, filtro, contagens globais, resolução e botões desabilitados;
  - listagem vazia versus erro de API;
  - dashboard, ordenação recente e online/total, incluindo vazio e erro;
  - compatibilidade do mapa original;
  - ausência de parâmetros inventados e de consulta adicional para Alertas Hoje.

Para repetir a suíte, disponibilize `playwright` e seu Chromium no ambiente Node
e execute `node tests/frontend-integration.cjs`. Nesta sessão foram reutilizados
pacote e navegador já presentes no cache local, via `NODE_PATH`; nenhum pacote foi
instalado no projeto. `SPI_CHROMIUM_EXECUTABLE` permite indicar outro executável
compatível. O teste intercepta as requisições e não escreve no banco real.

### Limites dos testes

- O contrato registra a migração de Classificação **já aplicada** com backup e
  validação do backend. Ela não foi reaplicada nem revalidada no banco nesta sessão.
- Tentativas HTTP locais na porta 5000 falharam. Não houve teste de ponta a ponta
  com API/PostgreSQL, Socket.IO por Redis, câmera física, MJPEG real, MQTT ou e-mail.
- O gráfico `/alertas/estatisticas/epi` exclui postura/queda/legado no backend:
  queda das contagens ou retorno vazio são esperados. Não houve compensação com
  outros tipos. Os gráficos preexistentes, inclusive seus fallbacks demonstrativos
  em falha de API, ficaram fora dos ajustes desta entrega.
- A suíte simula Chart.js e o cliente Socket.IO; não comprova entrega real de eventos
  entre processos ou renderização dos gráficos pela biblioteca externa.

## Tarefa 2 — Link Revisão de Dataset

Adicionado em `monitoramento.html`, junto ao seletor de câmera, o link
**Revisão de Dataset** usando `btn secondary`, `href="http://localhost:5001"`,
`target="_blank"` e `rel="noopener noreferrer"`.

Esta segunda tarefa acrescentou somente a âncora à página já ajustada na tarefa 1.
Não há integração JavaScript, fetch/XMLHttpRequest para o Reviewer, conteúdo
incorporado ou nova tela.

O clique foi validado no Chromium com **destino simulado**: abriu outra aba no
endereço previsto, manteve o monitoramento aberto, apresentou `window.opener === null`
e não gerou erros de console. A única requisição à porta 5001 foi navegação de
documento para `/`. O layout do link também foi inspecionado em captura de tela.

**Pendente:** repetir o clique com o Active Learning Reviewer real em execução.
A porta 5001 não respondeu às tentativas locais e o código do Reviewer não foi
encontrado nos repositórios consultados. O teste simulado não comprova o funcionamento
da aplicação Reviewer nem a ausência de erros no console dela.
