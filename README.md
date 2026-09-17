# Pacotes Avulsos

Sistema para o ponto de retirada: cadastro de pacotes avulsos (código de 11
dígitos) e a prateleira onde cada um foi guardado, busca por código na hora
de entregar pro cliente, transferência entre prateleiras, e histórico de
quem cadastrou/quem entregou. Duas versões de tela, **mesmo banco**:

- `index.html` — versão desktop (menu lateral, tabelas).
- `mobile.html` — versão mobile (abas embaixo, cartões).

Abrindo qualquer uma das duas, os dados são os mesmos na hora — é o mesmo
projeto Supabase do [Gestão de Sacas](../gestao-sacas), mesma empresa/ponto
de retirada. As tabelas novas usam prefixo `pa_` e não tocam em nada do
Sacas (`usuarios_sacas`, `motoristas`, `fila`, `registros`).

Stack: HTML/CSS/JS puro (sem build) + [Supabase](https://supabase.com)
(banco + login) + deploy estático (ex.: [Vercel](https://vercel.com)).

## Arquivos

- `index.html` / `mobile.html` — as duas telas.
- `data.js` — toda a lógica de acesso ao banco (login, pacotes, localizações,
  usuários), compartilhada pelas duas.
- `config.js` — aponta pro mesmo projeto Supabase do Gestão de Sacas.
- `sql/schema.sql` — cria as tabelas `pa_usuarios`, `pa_localizacoes` e
  `pa_pacotes`, com RLS e 8 localizações iniciais (1A...8H).

## 1. Rodar o schema no Supabase

Não precisa criar um projeto novo — é o mesmo do Gestão de Sacas
(`ksorakxlpibgunsjxeev`, já configurado em `config.js`). Só falta rodar as
tabelas novas: **SQL Editor > New query**, cola o conteúdo de
`sql/schema.sql` e roda.

## 2. Criar os logins

O Supabase Auth exige e-mail, mas a tela só pede um **usuário**; o app
completa com `@gestaosacas.local` (constante `authDomain` em `config.js`)
antes de mandar pro Supabase — **de propósito o MESMO domínio que o
Gestão de Sacas usa**, porque é o mesmo projeto Supabase por trás dos dois.

**Depois que existir o primeiro gestor**, ele mesmo cria os próximos logins
direto pela tela **Gerenciar Usuários** do app (formulário "Novo usuário" —
nome, usuário, senha, perfil). Não precisa mais abrir o Supabase pra isso.

⚠️ **Antes de usar essa tela, desative a confirmação de e-mail do projeto**
(**Authentication > Providers > Email > "Confirm email"**, desliga) — sem
isso, a conta é criada mas fica esperando um e-mail de confirmação que
nunca chega (o domínio `@gestaosacas.local` não existe de verdade), e a
pessoa não consegue entrar. É seguro desligar: o app nunca manda e-mail
real, só usa esse domínio como formalidade técnica do Supabase Auth.

**O primeiro gestor** (pra existir alguém que possa criar os outros) precisa
ser criado manualmente, uma única vez:

- **Se a pessoa já tem login no Gestão de Sacas**: não crie conta nova — vá
  em **Authentication > Users**, ache a linha dela (e-mail
  `usuario@gestaosacas.local`), copie o **User UID** e rode:

  ```sql
  insert into pa_usuarios (id, nome, perfil, modulo_pacotes, modulo_sacas) values
    ('cole-o-uuid-aqui', 'Nome da pessoa', 'gestor', true, true);
  ```

- **Se não tem login em nenhum dos dois ainda**: **Authentication > Users >
  Add user**, e-mail `usuario@gestaosacas.local`, defina uma senha e
  **marque "Auto Confirm User"**, copie o UID e rode o mesmo insert acima.

Depois disso, esse gestor já cria e libera todo mundo pela tela.

## 3. Testar localmente

```bash
npx serve .
```

Abre `http://localhost:3000/index.html` (desktop) ou `/mobile.html`
(celular/emulador). Abrir `index.html` direto no navegador também funciona.

## 4. Deploy

Mesmo fluxo do Gestão de Sacas: sobe pro GitHub e importa na Vercel
(**Add New > Project**, framework **Other**, sem build command). A URL da
Vercel serve as duas páginas — `/index.html` e `/mobile.html`.

## Limites conhecidos

- Sem tempo real — cada tela recarrega os dados da view atual ao entrar
  nela; não fica escutando mudanças de outro aparelho em segundo plano.
- Criar um novo login ainda é manual (painel do Supabase), igual ao Sacas —
  a tela "Gerenciar Usuários" só libera módulo/perfil pra quem já tem conta.
- O card "Gestão de Sacas" dentro do Portal só decide **quem pode acessar**
  o Sacas (mostra pro usuário que ele tem permissão) — ele ainda abre o
  Sacas como outro site/login separado, não migra pra dentro deste.
