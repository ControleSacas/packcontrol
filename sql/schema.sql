-- ============================================================
-- PACOTES AVULSOS — schema do Supabase
-- Roda no MESMO projeto Supabase do Gestão de Sacas (mesma empresa,
-- mesmo ponto de retirada) — por isso as tabelas aqui usam o prefixo
-- "pa_" e não tocam em nada de usuarios_sacas/motoristas/fila/registros.
-- Rode este arquivo inteiro em Supabase > SQL Editor > New query.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- usuários do Pacotes Avulsos (liga o login do Supabase Auth ao perfil) ----------
create table if not exists pa_usuarios (
  id              uuid primary key references auth.users(id) on delete cascade,
  nome            text not null,
  perfil          text not null default 'funcionario' check (perfil in ('funcionario', 'gestor')),
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
  status          text not null default 'estoque' check (status in ('estoque', 'entregue')),
  cadastrado_por  text not null,
  cadastrado_em   timestamptz not null default now(),
  entregue_por    text,
  entregue_em     timestamptz
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

create policy "dono atualiza o proprio perfil" on pa_usuarios
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "gestor atualiza qualquer perfil" on pa_usuarios
  for update using (
    exists (select 1 from pa_usuarios g where g.id = auth.uid() and g.perfil = 'gestor')
  ) with check (
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
--   ('cole-o-uuid-aqui', 'Marina',       'funcionario', true, true);
-- insert into pa_usuarios (id, nome, perfil, modulo_pacotes, modulo_sacas) values
--   ('cole-o-uuid-aqui', 'Eric Braian',  'funcionario', true, false);
-- insert into pa_usuarios (id, nome, perfil, modulo_pacotes, modulo_sacas) values
--   ('cole-o-uuid-aqui', 'Vitor Hugo',   'funcionario', true, false);
-- ============================================================
