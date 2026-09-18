-- ============================================================
-- PACOTES AVULSOS — schema do Supabase
-- Roda no MESMO projeto Supabase do Gestão de Sacas (mesma empresa,
-- mesmo ponto de retirada) — por isso as tabelas aqui usam o prefixo
-- "pa_" e não tocam nas tabelas do Sacas (motoristas/fila/registros).
-- A exceção é usuarios_sacas: ganha 2 políticas NOVAS (só isso, nada é
-- alterado ou removido) pra permitir que o Gestor do Pacotes Avulsos
-- libere/remova acesso real ao Sacas pela tela "Gerenciar Usuários" —
-- ver bloco no fim do arquivo.
-- Rode este arquivo inteiro em Supabase > SQL Editor > New query.
--
-- Se você já rodou uma versão anterior deste schema, rode só isso abaixo
-- em vez do arquivo inteiro:
--
--   create policy "gestor cria qualquer perfil" on pa_usuarios
--     for insert with check (
--       exists (select 1 from pa_usuarios g where g.id = auth.uid() and g.perfil = 'gestor')
--     );
--   create policy "gestor exclui qualquer perfil" on pa_usuarios
--     for delete using (
--       exists (select 1 from pa_usuarios g where g.id = auth.uid() and g.perfil = 'gestor')
--     );
--   -- essas são as que permitem o Gestor cadastrar/excluir usuário direto
--   -- pela tela "Gerenciar Usuários" do app, sem precisar abrir o Supabase.
--
--   update pa_usuarios set perfil = 'operador' where perfil = 'funcionario';
--   alter table pa_usuarios alter column perfil set default 'operador';
--   alter table pa_usuarios drop constraint if exists pa_usuarios_perfil_check;
--   alter table pa_usuarios add constraint pa_usuarios_perfil_check
--     check (perfil in ('operador', 'gestor'));
--   -- essa troca "funcionario" por "operador" (mesmo termo que o
--   -- Gestão de Sacas já usa em usuarios_sacas).
--
--   create policy "pa gestor libera acesso sacas" on usuarios_sacas
--     for insert with check (
--       exists (select 1 from pa_usuarios g where g.id = auth.uid() and g.perfil = 'gestor')
--     );
--   create policy "pa gestor libera acesso sacas upd" on usuarios_sacas
--     for update using (
--       exists (select 1 from pa_usuarios g where g.id = auth.uid() and g.perfil = 'gestor')
--     ) with check (
--       exists (select 1 from pa_usuarios g where g.id = auth.uid() and g.perfil = 'gestor')
--     );
--   create policy "pa gestor remove acesso sacas" on usuarios_sacas
--     for delete using (
--       exists (select 1 from pa_usuarios g where g.id = auth.uid() and g.perfil = 'gestor')
--     );
--   -- essas 3 são as únicas que tocam numa tabela do Sacas — só ADICIONAM
--   -- permissão nova (nada existente muda), pra ligar o checkbox "Gestão
--   -- de Sacas" da tela de usuários do Pacotes Avulsos a um acesso real.
--   -- ATENÇÃO: essas 3 políticas de usuarios_sacas foram DEPOIS trocadas
--   -- pela função pa_sync_acesso_sacas (RPC) — ver bloco bem no final
--   -- deste arquivo. Se estiver rodando isso do zero, pule direto pra lá.
--
--   alter table pa_pacotes drop constraint if exists pa_pacotes_status_check;
--   alter table pa_pacotes add constraint pa_pacotes_status_check
--     check (status in ('estoque', 'entregue', 'devolvido'));
--   alter table pa_pacotes add column if not exists devolvido_por text;
--   alter table pa_pacotes add column if not exists devolvido_em timestamptz;
--   -- status novo "devolvido" — pra quando um pacote vencido é devolvido
--   -- em vez de entregue ao cliente (aba "Vencidos").
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- usuários do Pacotes Avulsos (liga o login do Supabase Auth ao perfil) ----------
create table if not exists pa_usuarios (
  id              uuid primary key references auth.users(id) on delete cascade,
  nome            text not null,
  perfil          text not null default 'operador' check (perfil in ('operador', 'gestor')),
  modulo_pacotes  boolean not null default true,
  modulo_sacas    boolean not null default false,
  criado_em       timestamptz not null default now()
);

-- ---------- localizações (prateleiras/gavetas) ----------
create table if not exists pa_localizacoes (
  codigo     text primary key,
  cor        text not null default '#3f6d99',
  ativa      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- ---------- pacotes ----------
-- "local" referencia pa_localizacoes(codigo) com "on delete restrict" —
-- isso já garante no banco que não dá pra excluir uma localização com
-- pacote dentro (trava o delete, não precisa checar isso só no app).
create table if not exists pa_pacotes (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique check (codigo ~ '^[0-9]{11}$'),
  local           text not null references pa_localizacoes(codigo) on delete restrict,
  status          text not null default 'estoque' check (status in ('estoque', 'entregue', 'devolvido')),
  cadastrado_por  text not null,
  cadastrado_em   timestamptz not null default now(),
  entregue_por    text,
  entregue_em     timestamptz,
  devolvido_por   text,
  devolvido_em    timestamptz
);

create index if not exists pa_pacotes_status_idx on pa_pacotes (status);
create index if not exists pa_pacotes_local_idx on pa_pacotes (local);
create index if not exists pa_pacotes_cadastrado_em_idx on pa_pacotes (cadastrado_em);

-- ============================================================
-- RLS — mesmo padrão do Gestão de Sacas: login de verdade (Supabase
-- Auth), então cada tabela fica com política "usuário autenticado
-- pode tudo", exceto pa_usuarios (mais restrita: todo mundo
-- autenticado pode LER a lista, mas só o próprio dono ou um gestor
-- pode ATUALIZAR uma linha, e só o próprio dono pode criar a sua).
-- ============================================================
alter table pa_usuarios     enable row level security;
alter table pa_localizacoes enable row level security;
alter table pa_pacotes      enable row level security;

create policy "equipe autenticada le todo mundo" on pa_usuarios
  for select using (auth.role() = 'authenticated');

create policy "cada um cria o proprio perfil" on pa_usuarios
  for insert with check (auth.uid() = id);

create policy "gestor cria qualquer perfil" on pa_usuarios
  for insert with check (
    exists (select 1 from pa_usuarios g where g.id = auth.uid() and g.perfil = 'gestor')
  );

create policy "dono atualiza o proprio perfil" on pa_usuarios
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "gestor atualiza qualquer perfil" on pa_usuarios
  for update using (
    exists (select 1 from pa_usuarios g where g.id = auth.uid() and g.perfil = 'gestor')
  ) with check (
    exists (select 1 from pa_usuarios g where g.id = auth.uid() and g.perfil = 'gestor')
  );

create policy "gestor exclui qualquer perfil" on pa_usuarios
  for delete using (
    exists (select 1 from pa_usuarios g where g.id = auth.uid() and g.perfil = 'gestor')
  );

create policy "equipe autenticada - acesso total" on pa_localizacoes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "equipe autenticada - acesso total" on pa_pacotes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- Localizações iniciais (as mesmas 8 prateleiras do protótipo —
-- pode editar os códigos/cores ou simplesmente apagar essas linhas
-- e cadastrar as de verdade pela tela "Localizações").
-- ============================================================
insert into pa_localizacoes (codigo, cor) values
  ('1A', '#c1584a'), ('2B', '#c1852f'), ('3C', '#4f7a53'), ('4D', '#3f6d99'),
  ('5E', '#7d5aa6'), ('6F', '#a3555f'), ('7G', '#5c6b3f'), ('8H', '#8a6a3a')
on conflict (codigo) do nothing;

-- ============================================================
-- Criar os logins — é o MESMO projeto Supabase do Gestão de Sacas, e o
-- app usa o MESMO domínio de e-mail (@gestaosacas.local) de propósito.
--
-- Se a pessoa JÁ TEM login no Sacas: não crie conta nova. Só ache o User
-- UID dela em Authentication > Users (e-mail usuario@gestaosacas.local)
-- e pule direto pro insert abaixo — ela entra no Pacotes Avulsos com o
-- mesmo usuário/senha de sempre.
--
-- Se a pessoa NÃO TEM login em nenhum dos dois ainda:
-- 1. Authentication > Users > Add user — e-mail no formato
--    usuario@gestaosacas.local (troque "usuario" pelo login da
--    pessoa), defina uma senha e MARQUE "Auto Confirm User".
-- 2. Copie o "User UID" que aparece na lista.
-- 3. Rode um insert por pessoa, trocando o UUID (isso aqui é uma tabela
--    separada, pa_usuarios, não mexe em usuarios_sacas):
--
-- insert into pa_usuarios (id, nome, perfil, modulo_pacotes, modulo_sacas) values
--   ('cole-o-uuid-aqui', 'Sr. Lima',     'gestor',      true, true);
-- insert into pa_usuarios (id, nome, perfil, modulo_pacotes, modulo_sacas) values
--   ('cole-o-uuid-aqui', 'Marina',       'operador', true, true);
-- insert into pa_usuarios (id, nome, perfil, modulo_pacotes, modulo_sacas) values
--   ('cole-o-uuid-aqui', 'Eric Braian',  'operador', true, false);
-- insert into pa_usuarios (id, nome, perfil, modulo_pacotes, modulo_sacas) values
--   ('cole-o-uuid-aqui', 'Vitor Hugo',   'operador', true, false);
-- ============================================================

-- ============================================================
-- Acesso real ao Gestão de Sacas via checkbox do Pacotes Avulsos.
--
-- Isso NÃO funciona como política simples de RLS em usuarios_sacas
-- checando pa_usuarios (testado e confirmado que falha de forma
-- inconsistente pela API REST, mesmo com a política tecnicamente
-- correta — ver memória "feedback_rls_cross_tabela_via_rpc"). A solução
-- que funciona é uma função RPC security definer, que verifica a
-- permissão ela mesma e escreve direto, ignorando RLS pra essa escrita
-- específica.
-- ============================================================
create or replace function pa_is_gestor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from pa_usuarios g where g.id = auth.uid() and g.perfil = 'gestor'
  );
$$;

create or replace function pa_sync_acesso_sacas(alvo_id uuid, alvo_nome text, alvo_perfil text, ligar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pa_is_gestor() then
    raise exception 'Só o gestor pode alterar acesso ao Sacas.';
  end if;

  if ligar then
    insert into usuarios_sacas (id, nome, perfil)
    values (alvo_id, alvo_nome, case when alvo_perfil = 'gestor' then 'gestor' else 'operador' end)
    on conflict (id) do update set nome = excluded.nome, perfil = excluded.perfil;
  else
    delete from usuarios_sacas where id = alvo_id;
  end if;
end;
$$;

grant execute on function pa_sync_acesso_sacas(uuid, text, text, boolean) to authenticated;
-- ============================================================
