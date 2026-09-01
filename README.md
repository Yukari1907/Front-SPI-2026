# VisãoEPI Pro 3.1 — Front-End

## Como executar

1. Extraia o projeto.
2. Abra a pasta no VS Code.
3. Instale a extensão **Live Server**.
4. Clique com o botão direito em `login.html`.
5. Selecione **Open with Live Server**.

## Login

Adminsitrador
- E-mail: `admin@visaoepi.com`
- Senha: `123456`

Supervisor
- E-mail: `ana@empresa.com`
- Senha: `123456`

Operador
- E-mail: `carlos@empresa.com`
- Senha: `123456`

Tecnico de Segurança
- E-mail: `mariana@empresa.com`
- Senha: `123456`

## Páginas

- Login
- Dashboard
- Monitoramento
- Alertas
- Inventário
- Controle de EPIs
- Mapeamento
- Relatórios
- Administração
- Configurações
- Perfil
- Sobre

## Recursos

- Tema claro e escuro
- Login e sessão
- Perfil de usuário
- Menu de notificações
- Gráficos Chart.js
- Inventário com CRUD
- Filtros e paginação
- Exportação CSV
- Layout responsivo
- Dados persistidos em localStorage

## Atualização 3.1.1

- Perfil compacto e alinhado na topbar.
- Pesquisa global funcional com navegação por teclado.
- Cadastro, edição, bloqueio e exclusão de usuários.
- Dados de usuários persistidos no localStorage.


## Administração e último acesso

A versão atualizada registra automaticamente:

- data e hora do último login;
- quantidade total de acessos;
- histórico dos 10 últimos logins;
- data de criação do usuário;
- usuário responsável pelo cadastro;
- bloqueio de login para contas inativas;
- login utilizando os usuários cadastrados em Administração.

Na tabela **Usuários e Permissões**, clique no ícone de olho para consultar o histórico.

## Perfis e permissões

### Administrador
- Acesso a todas as páginas.
- Cadastra, edita, bloqueia e exclui usuários.
- Gerencia inventário, EPIs, alertas e configurações.

### Supervisor
- Acesso a Dashboard, Monitoramento, Alertas, Inventário, Controle de EPIs,
  Mapeamento, Relatórios, Perfil e Sobre.
- Cadastra e edita itens do inventário.
- Gerencia alertas e Controle de EPIs.
- Não acessa Administração nem Configurações.
- Não cadastra, edita, bloqueia ou exclui usuários.

### Técnico de Segurança
- Acesso a Dashboard, Monitoramento, Alertas, Controle de EPIs, Mapeamento,
  Relatórios, Perfil e Sobre.
- Pode gerenciar alertas e Controle de EPIs.
- Não acessa Inventário, Administração ou Configurações.

### Operador
- Acesso somente a Dashboard, Monitoramento, Alertas, Perfil e Sobre.
- Possui acesso de consulta.
- Não pode cadastrar, editar ou excluir dados administrativos.
