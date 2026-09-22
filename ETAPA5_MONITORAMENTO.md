# Etapa 5 — atualização de zonas e recuperação MJPEG

Data: 22/09/2026. Escopo restrito ao Front-SPI-2026, sem commit ou push.
Backend somente leitura; nenhum POST/PUT/DELETE real. Não foram implementados
histórico contextual de alertas, setores por responsável ou soluções para esconder
os P0/P1 do servidor. Nenhuma dependência foi instalada.

## 1. Atualização automática de zonas

- Reutiliza `GET /zonas/camera/{id}` na seleção e a cada **15 segundos após a resposta**.
- Uma consulta por contexto fica em andamento; chamadas adicionais e retomada de
  visibilidade reutilizam a espera, sem iniciar outra consulta para esse contexto.
- Respostas válidas atualizam somente os grupos SVG alterados. Imagem, seleção,
  grupos inalterados e polling de detecções são preservados. IDs repetidos não
  criam grupos duplicados; zonas removidas da lista deixam de ser desenhadas.
- Erro HTTP, rede ou formato inválido preserva o último overlay válido. A próxima
  consulta pode recuperar. Uma lista vazia válida limpa as zonas normalmente.
- Consultas já em trânsito de contextos antigos podem terminar, mas suas respostas
  não atualizam a tela nem agendam timers. Não se alterou a camada compartilhada de API.

## 2. Recuperação do MJPEG

- Mantém `<img>` e SVG no DOM. Em falha, oculta essas camadas e mostra
  “Stream de vídeo indisponível. Tentando reconectar automaticamente.”
- Reatribui a fonte da mesma imagem, com `retry` exclusivo de reconexão,
  preservando parâmetros existentes. A rota Flask consultada não usa essa query.
- Backoff de **5, 10, 20 e 30 segundos**, limitado a 30 segundos. Primeiro frame
  válido restaura imagem/overlay, remove o aviso e reinicia o backoff.
- Não usa fetch de frames. Uma leitura local de `naturalWidth`/`naturalHeight`
  permite recuperar MJPEG multipart que já apresenta frames sem emitir `load`.
- Verificação local também detecta perda das dimensões após interrupção HTTP:
  o Chromium pode perder a imagem sem emitir `error`.
- Vídeo e detecções têm estados independentes. Sucesso de `/detections` não
  remove erro de vídeo; erro de detecções não interrompe um vídeo válido.

## 3. Troca de câmera, visibilidade e timers

Cada renderização possui um objeto de contexto exclusivo, validado antes de
aplicar resposta/callback. Isso protege inclusive a sequência A → B → A.
Trocar câmera encerra a fonte anterior, remove handlers e cancela timers de zonas,
retry e observação da imagem. A nova câmera abre seu stream e consulta zonas e
detecções. O polling de detecções mantém a proteção por versão já existente.

| Trabalho | Intervalo | Condição |
|---|---|---|
| GET de zonas | 15 s após resposta | Uma chamada em andamento por contexto |
| Retry de vídeo | 5/10/20/30 s | Somente após falha |
| Primeiro frame: leitura local da imagem | 500 ms, limite de 30 s | Somente enquanto aguarda imagem |
| Imagem já disponível: leitura local das dimensões | 5 s | Sem chamada HTTP adicional |
| GET de detecções | 3 s após resposta | Intervalo anterior preservado |

`visibilitychange` pausa timers e detecções enquanto oculta. Ao voltar, revalida
zonas, retoma as detecções e a observação da imagem; vídeo em falha respeita seu
backoff. Um vídeo válido permanece na mesma conexão. `pagehide`/`beforeunload`
encerram o contexto; `pageshow` com `persisted` restaura a câmera selecionada.

Limite: uma conexão que permanece aberta mantendo o último frame e suas dimensões
não permite inferir congelamento só pela API de `<img>`. Não se usa a detecção
como prova de vídeo funcionando ou parado. A validação desta etapa cobre falhas
HTTP/rede, ausência do primeiro frame e perda da imagem após interrupção.

## 4. Testes e validações

As cinco suítes anteriores foram executadas para confirmar a referência de
**191 cenários aprovados**. Nenhum cenário foi removido. A expectativa anterior
que exigia destruir o SVG no erro foi atualizada para exigir um único SVG oculto
e uma única imagem preservada.

| Suíte | Antes | Final |
|---|---:|---:|
| `tests/frontend-integration.cjs` | 61 | 61 |
| `tests/zone-media.cjs` | 8 | 8 |
| `tests/final-audit.cjs` | 24 | 24 |
| `tests/settings-admin.cjs` | 42 | 42 |
| `tests/crud-audit.cjs` | 56 | 56 |
| `tests/monitoring-recovery.cjs` | — | 36 |
| **Total** | **191** | **227** |

Os **36 cenários adicionados** cobrem: periodicidade e atualização de zonas;
reuso/remoção de grupos; duplicatas; erro HTTP/rede/formato; recuperação; resposta
lenta sem concorrência; A → B → A; 503 inicial; backoff/cache-busting; recuperação
sem duplicar elementos/handlers; independência de detecções; retry de câmera
antiga; pausa/retomada oculta; vídeo saudável após visibilidade; query existente;
seis combinações de largura/tema; MJPEG multipart real; interrupção durante o
stream; ausência de primeiro frame; resposta após saída; limpeza em saída e
retorno pelo cache de navegação; ausência de mutações e exceções.

- **1440, 768 e 390 px**, temas **claro e escuro**: indisponibilidade e recuperação,
  geometria alinhada, contraste do aviso >= 4,5:1 e ausência de overflow horizontal.
- **Zero exceções JavaScript** (`pageerror`) nas seis suítes. Erros HTTP/rede
  deliberados são entradas de teste, tratados pela interface.
- **`node --check`: 24 arquivos JS/CJS aprovados.**
- **`git diff --check`: aprovado.**
- API simulada nas suítes; MJPEG multipart servido por HTTP local. Nenhuma chamada
  de escrita real ao backend e nenhuma homologação de câmera/worker de produção.
- Playwright 1.62.1 e Chromium já instalados. Execução com `NODE_PATH` apontando
  para o cache npm existente e `SPI_CHROMIUM_EXECUTABLE` para o Chromium instalado.
- Logs em `%TEMP%/spi-stage5-baseline-*.log` e `%TEMP%/spi-stage5-final-*.log`.
  Doze capturas em `%TEMP%/spi-stage5-{largura}-{tema}-{failed|ready}.png`;
  inspeção visual adicional de 390/escuro indisponível e 1440/claro recuperado.

## 5. Arquivos desta etapa versus alterações anteriores

Alterados **nesta etapa**, todos já modificados anteriormente:

- `js/monitoramento.js`: consulta periódica, recuperação, contextos e ciclo de vida.
- `tests/frontend-integration.cjs`: expectativa de estrutura preservada no erro.
- `README.md`: comportamento implementado, nova suíte e link deste registro.

Criados **nesta etapa**:

- `tests/monitoring-recovery.cjs`.
- `ETAPA5_MONITORAMENTO.md`.

Os demais arquivos que já estavam modificados/novos foram preservados. A
comparação SHA-256 contra o início encontrou mudanças apenas nos três arquivos
preexistentes listados acima. Um `git diff` contra HEAD também inclui as etapas
anteriores e, portanto, não representa isoladamente esta entrega.

## 6. Estado inicial registrado antes da edição

Frontend: branch `integration/frontend-backend`, HEAD
`6f5fb432ce20214fae909ba418a8b9a7530a7c96`.

`git status --short`: **21 modificados e 5 novos**, sem alterações staged:

```text
 M .gitignore
 M README.md
 M administracao.html
 M alertas.html
 M configuracao.html
 M css/components.css
 M inventario.html
 M js/administracao.js
 M js/alertas.js
 M js/api.js
 M js/common.js
 M js/configuracao.js
 M js/controle.js
 M js/inventario.js
 M js/mapeamento.js
 M js/monitoramento.js
 M js/relatorios.js
 M mapeamento.html
 M relatorios.html
 M tests/final-audit.cjs
 M tests/frontend-integration.cjs
?? AUDITORIA_CRUD_ETAPA3.md
?? css/configuracao.css
?? js/cadastros.js
?? tests/crud-audit.cjs
?? tests/settings-admin.cjs
```

Backend: branch `ajustes/integracao-backend-v2`, HEAD
`a4a04449d588bea9e9be0275f160eccf280c47a5`; `git status --short` vazio.
Não foi exigido backend limpo nem executado restore.

## 7. Estado final

Frontend: mesma branch e HEAD; **21 arquivos modificados e 7 novos**, sem staged.
O status final é o inicial acrescido de `ETAPA5_MONITORAMENTO.md` e
`tests/monitoring-recovery.cjs`. Alterações anteriores preservadas; sem commit/push.

Backend: mesma branch `ajustes/integracao-backend-v2` e HEAD
`a4a04449d588bea9e9be0275f160eccf280c47a5`; status continua vazio.
Nenhuma mudança externa de HEAD observada nas reconsultas. SHA-256 dos arquivos
versionados/não ignorados comparados com o início: **zero alterações**.
