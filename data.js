// Camada de dados compartilhada pelo index.html (desktop) e mobile.html —
// os dois carregam este arquivo e enxergam o MESMO banco (mesmo projeto
// Supabase do Gestão de Sacas, tabelas pa_*). Nada de estado em memória
// aqui: cada função lê/escreve direto no Supabase.
(function () {
  "use strict";
  var CFG = window.PACOTES_AVULSOS_CONFIG;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  var AUTH_DOMAIN = CFG.authDomain || "@pontoretirada.local";
  var SHELF_COLORS = ["#c1584a", "#c1852f", "#4f7a53", "#3f6d99", "#7d5aa6", "#a3555f", "#5c6b3f", "#8a6a3a", "#4a5d8a", "#9c6b2d"];

  function toAuthEmail(usuario) {
    var clean = usuario.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.\-_]/g, "");
    return clean + AUTH_DOMAIN;
  }

  async function fetchAll(build) {
    var all = [], from = 0, pageSize = 1000;
    while (true) {
      var res = await build(from, from + pageSize - 1);
      if (res.error) throw res.error;
      if (!res.data || !res.data.length) break;
      all = all.concat(res.data);
      if (res.data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  /* ============================================================
     OFFLINE: cache local (último snapshot lido) + fila de ações
     pendentes (cadastrar/entregar/devolver/transferir feitos sem
     internet). Combinado só funciona bem com UMA pessoa offline por
     vez — se duas pessoas cadastrarem/mexerem no mesmo pacote offline
     ao mesmo tempo, a sincronização não tenta resolver esse conflito.
     ============================================================ */
  function lsGet(key, def) {
    try { var v = localStorage.getItem("pa_" + key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem("pa_" + key, JSON.stringify(val)); } catch (e) {}
  }
  function estaOffline() { return typeof navigator !== "undefined" && navigator.onLine === false; }

  function filaGet() { return lsGet("fila_pendente", []); }
  function filaSet(f) { lsSet("fila_pendente", f); }
  function filaAdd(tipo, payload) {
    var f = filaGet();
    var acao = { id: "q" + Date.now() + "_" + Math.random().toString(36).slice(2), tipo: tipo, payload: payload, criadoEm: new Date().toISOString() };
    f.push(acao);
    filaSet(f);
    return acao;
  }
  function contarPendentes() { return filaGet().length; }

  function cacheEstoqueGet() { return lsGet("cache_estoque", []); }
  function cacheEstoqueSet(l) { lsSet("cache_estoque", l); }
  function cacheLocaisGet() { return lsGet("cache_locais", []); }
  function cacheLocaisSet(l) { lsSet("cache_locais", l); }

  // aplica as ações ainda não sincronizadas em cima do último snapshot
  // conhecido, pra tela offline mostrar o estado real (com o que já foi
  // feito localmente, mesmo sem ainda ter ido pro banco).
  function estoqueComFila() {
    var lista = cacheEstoqueGet().slice();
    filaGet().forEach(function (a) {
      if (a.tipo === "cadastrar") {
        lista.push({
          id: "pendente_" + a.id, codigo: a.payload.codigo, local: a.payload.local, status: "estoque",
          cadastrado_por: a.payload.cadastradoPor, cadastrado_em: a.criadoEm,
          entregue_por: null, entregue_em: null, devolvido_por: null, devolvido_em: null, _pendente: true
        });
      } else if (a.tipo === "entregar" || a.tipo === "devolver") {
        lista = lista.filter(function (p) { return p.id !== a.payload.id; });
      } else if (a.tipo === "transferir") {
        lista = lista.map(function (p) { return p.id === a.payload.id ? Object.assign({}, p, { local: a.payload.novoLocal }) : p; });
      }
    });
    return lista;
  }

  function isNetworkError(e) {
    return estaOffline() || (e && (e.name === "TypeError" || /fetch|network|failed to fetch/i.test(String(e.message || ""))));
  }

  // roda a fila pendente contra o Supabase de verdade, em ordem — chamada
  // automaticamente quando a conexão volta, ou manualmente pela tela.
  var sincronizando = false;
  async function sincronizarFila() {
    if (sincronizando || estaOffline()) return { ok: 0, falhou: 0 };
    sincronizando = true;
    var fila = filaGet();
    var restante = [];
    var ok = 0, falhou = 0;
    for (var i = 0; i < fila.length; i++) {
      var a = fila[i];
      try {
        if (a.tipo === "cadastrar") await cadastrarPacoteOnline(a.payload.codigo, a.payload.local, a.payload.cadastradoPor);
        else if (a.tipo === "entregar") await entregarPacoteOnline(a.payload.id, a.payload.entreguePor);
        else if (a.tipo === "devolver") await devolverPacoteOnline(a.payload.id, a.payload.devolvidoPor);
        else if (a.tipo === "transferir") await transferirPacoteOnline(a.payload.id, a.payload.novoLocal);
        ok++;
      } catch (e) {
        a.erro = (e && e.message) || "Falhou ao sincronizar";
        restante.push(a);
        falhou++;
      }
    }
    filaSet(restante);
    if (ok > 0) { try { cacheEstoqueSet(await fetchAll(function (a2, b2) { return sb.from("pa_pacotes").select("*").eq("status", "estoque").range(a2, b2); })); } catch (e) {} }
    sincronizando = false;
    return { ok: ok, falhou: falhou };
  }

  async function carregarPerfil(authUser) {
    var r = await sb.from("pa_usuarios").select("*").eq("id", authUser.id).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) throw new Error("Esse login ainda não tem perfil liberado no Pacotes Avulsos. Fale com o gestor.");
    return { authUser: authUser, perfil: r.data };
  }

  async function login(usuario, senha) {
    var email = toAuthEmail(usuario);
    var r = await sb.auth.signInWithPassword({ email: email, password: senha });
    if (r.error || !r.data.user) throw new Error("Usuário ou senha inválidos.");
    return await carregarPerfil(r.data.user);
  }

  async function logout() { await sb.auth.signOut(); }

  async function getSessaoAtual() {
    var r = await sb.auth.getSession();
    if (!r.data.session) return null;
    return await carregarPerfil(r.data.session.user);
  }

  /* ---------- localizações ---------- */
  async function listarLocalizacoes() {
    if (estaOffline()) return cacheLocaisGet();
    try {
      var r = await sb.from("pa_localizacoes").select("*").order("codigo");
      if (r.error) throw r.error;
      cacheLocaisSet(r.data);
      return r.data;
    } catch (e) {
      if (isNetworkError(e)) return cacheLocaisGet();
      throw e;
    }
  }
  async function criarLocalizacao(codigo, cor) {
    var r = await sb.from("pa_localizacoes").insert({ codigo: codigo, cor: cor }).select().single();
    if (r.error) {
      if (r.error.code === "23505") throw new Error("Já existe uma localização com esse código.");
      throw r.error;
    }
    return r.data;
  }
  async function alternarLocalizacao(codigo, ativa) {
    var r = await sb.from("pa_localizacoes").update({ ativa: ativa }).eq("codigo", codigo);
    if (r.error) throw r.error;
  }
  async function excluirLocalizacao(codigo) {
    var r = await sb.from("pa_localizacoes").delete().eq("codigo", codigo);
    if (r.error) {
      if (r.error.code === "23503") throw new Error("Só dá pra excluir localizações sem pacotes.");
      throw r.error;
    }
  }

  /* ---------- pacotes ---------- */
  async function listarEstoque() {
    if (estaOffline()) return estoqueComFila();
    try {
      var dados = await fetchAll(function (a, b) {
        return sb.from("pa_pacotes").select("*").eq("status", "estoque").range(a, b);
      });
      cacheEstoqueSet(dados);
      return filaGet().length ? estoqueComFila() : dados;
    } catch (e) {
      if (isNetworkError(e)) return estoqueComFila();
      throw e;
    }
  }
  async function listarHistorico(filtroCodigo, statusFiltro) {
    var status = statusFiltro || "entregue";
    var campoData = status === "devolvido" ? "devolvido_em" : "entregue_em";
    var q = sb.from("pa_pacotes").select("*").eq("status", status).order(campoData, { ascending: false }).limit(500);
    if (filtroCodigo) q = q.ilike("codigo", "%" + filtroCodigo + "%");
    var r = await q;
    if (r.error) throw r.error;
    return r.data;
  }
  async function cadastrarPacoteOnline(codigo, local, cadastradoPor) {
    var r = await sb.from("pa_pacotes").insert({ codigo: codigo, local: local, cadastrado_por: cadastradoPor }).select().single();
    if (r.error) {
      if (r.error.code === "23505") throw new Error("Já existe um pacote cadastrado com esse código.");
      throw r.error;
    }
    return r.data;
  }
  function codigoJaExisteLocal(codigo) {
    return estoqueComFila().some(function (p) { return p.codigo === codigo; });
  }
  async function cadastrarPacote(codigo, local, cadastradoPor) {
    if (estaOffline()) {
      if (codigoJaExisteLocal(codigo)) throw new Error("Já existe um pacote cadastrado com esse código.");
      filaAdd("cadastrar", { codigo: codigo, local: local, cadastradoPor: cadastradoPor });
      return { codigo: codigo, local: local, _pendente: true };
    }
    try {
      return await cadastrarPacoteOnline(codigo, local, cadastradoPor);
    } catch (e) {
      if (isNetworkError(e)) {
        if (codigoJaExisteLocal(codigo)) throw new Error("Já existe um pacote cadastrado com esse código.");
        filaAdd("cadastrar", { codigo: codigo, local: local, cadastradoPor: cadastradoPor });
        return { codigo: codigo, local: local, _pendente: true };
      }
      throw e;
    }
  }
  async function cadastrarEmMassaComLocais(linhas, cadastradoPor) {
    if (estaOffline()) throw new Error("Cadastro em massa (planilha) precisa de internet.");
    var existentes = await listarLocalizacoes();
    var jaTem = {};
    existentes.forEach(function (l) { jaTem[l.codigo.toLowerCase()] = true; });
    var novasLocs = [];
    linhas.forEach(function (l) {
      var k = l.local.toLowerCase();
      if (!jaTem[k]) { jaTem[k] = true; novasLocs.push(l.local); }
    });
    for (var i = 0; i < novasLocs.length; i++) {
      await criarLocalizacao(novasLocs[i], SHELF_COLORS[(existentes.length + i) % SHELF_COLORS.length]);
    }
    var inseridos = 0, duplicados = 0;
    for (var j = 0; j < linhas.length; j++) {
      try { await cadastrarPacote(linhas[j].codigo, linhas[j].local, cadastradoPor); inseridos++; }
      catch (e) { duplicados++; }
    }
    return { inseridos: inseridos, novasLocs: novasLocs.length, duplicados: duplicados };
  }
  async function entregarPacoteOnline(id, entreguePor) {
    var r = await sb.from("pa_pacotes").update({ status: "entregue", entregue_por: entreguePor, entregue_em: new Date().toISOString() }).eq("id", id);
    if (r.error) throw r.error;
  }
  async function entregarPacote(id, entreguePor) {
    if (String(id).indexOf("pendente_") === 0) throw new Error("Esse pacote ainda não terminou de sincronizar — tenta de novo em instantes.");
    if (estaOffline()) { filaAdd("entregar", { id: id, entreguePor: entreguePor }); return { _pendente: true }; }
    try { await entregarPacoteOnline(id, entreguePor); return { _pendente: false }; }
    catch (e) {
      if (isNetworkError(e)) { filaAdd("entregar", { id: id, entreguePor: entreguePor }); return { _pendente: true }; }
      throw e;
    }
  }
  async function devolverPacoteOnline(id, devolvidoPor) {
    var r = await sb.from("pa_pacotes").update({ status: "devolvido", devolvido_por: devolvidoPor, devolvido_em: new Date().toISOString() }).eq("id", id);
    if (r.error) throw r.error;
  }
  async function devolverPacote(id, devolvidoPor) {
    if (String(id).indexOf("pendente_") === 0) throw new Error("Esse pacote ainda não terminou de sincronizar — tenta de novo em instantes.");
    if (estaOffline()) { filaAdd("devolver", { id: id, devolvidoPor: devolvidoPor }); return { _pendente: true }; }
    try { await devolverPacoteOnline(id, devolvidoPor); return { _pendente: false }; }
    catch (e) {
      if (isNetworkError(e)) { filaAdd("devolver", { id: id, devolvidoPor: devolvidoPor }); return { _pendente: true }; }
      throw e;
    }
  }
  async function transferirPacoteOnline(id, novoLocal) {
    var r = await sb.from("pa_pacotes").update({ local: novoLocal }).eq("id", id);
    if (r.error) throw r.error;
  }
  async function transferirPacote(id, novoLocal) {
    if (String(id).indexOf("pendente_") === 0) throw new Error("Esse pacote ainda não terminou de sincronizar — tenta de novo em instantes.");
    if (estaOffline()) { filaAdd("transferir", { id: id, novoLocal: novoLocal }); return { _pendente: true }; }
    try { await transferirPacoteOnline(id, novoLocal); return { _pendente: false }; }
    catch (e) {
      if (isNetworkError(e)) { filaAdd("transferir", { id: id, novoLocal: novoLocal }); return { _pendente: true }; }
      throw e;
    }
  }
  async function buscarPorCodigo(q) {
    if (estaOffline()) return estoqueComFila().filter(function (p) { return p.codigo.indexOf(q) !== -1; }).slice(0, 8);
    try {
      var r = await sb.from("pa_pacotes").select("*").eq("status", "estoque").ilike("codigo", "%" + q + "%").order("cadastrado_em", { ascending: false }).limit(8);
      if (r.error) throw r.error;
      return r.data;
    } catch (e) {
      if (isNetworkError(e)) return estoqueComFila().filter(function (p) { return p.codigo.indexOf(q) !== -1; }).slice(0, 8);
      throw e;
    }
  }

  /* ---------- relatório ---------- */
  // inicioISO/fimISOExclusivo: strings ISO; fim é exclusivo (ex.: "2026-10-01T00:00:00" pra pegar até 30/09).
  async function relatorioPeriodo(inicioISO, fimISOExclusivo) {
    var recebidos = await sb.from("pa_pacotes").select("id", { count: "exact", head: true })
      .gte("cadastrado_em", inicioISO).lt("cadastrado_em", fimISOExclusivo);
    if (recebidos.error) throw recebidos.error;
    var despachados = await sb.from("pa_pacotes").select("id", { count: "exact", head: true })
      .eq("status", "entregue").gte("entregue_em", inicioISO).lt("entregue_em", fimISOExclusivo);
    if (despachados.error) throw despachados.error;
    return { recebidos: recebidos.count || 0, despachados: despachados.count || 0 };
  }

  /* ---------- usuários ---------- */
  async function criarUsuarioLogin(usuario, senha, nome, perfil, moduloPacotes, moduloSacas) {
    if (!usuario || !usuario.trim()) throw new Error("Informe o usuário (login).");
    if (!senha || senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    if (!nome || !nome.trim()) throw new Error("Informe o nome.");
    var email = toAuthEmail(usuario);
    // client à parte, sem salvar sessão — pra não trocar o login de quem está
    // criando o usuário (o gestor) pelo login da conta recém-criada. Precisa de
    // um storageKey PRÓPRIO (diferente do client principal): mesmo com
    // persistSession:false, o supabase-js ainda sincroniza sessão entre
    // instâncias que compartilham a mesma storageKey via BroadcastChannel —
    // sem isso, criar um usuário "logava" o navegador como a pessoa nova.
    var tempClient = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "pa-temp-admin-" + Date.now() + "-" + Math.random().toString(36).slice(2) }
    });
    var r = await tempClient.auth.signUp({ email: email, password: senha });
    if (r.error) {
      var msg = String(r.error.message || "").toLowerCase();
      if (msg.indexOf("already registered") !== -1 || msg.indexOf("already exists") !== -1) {
        throw new Error("Já existe uma conta com esse usuário.");
      }
      throw r.error;
    }
    if (!r.data.user) throw new Error("Não consegui criar o login — tenta de novo.");
    var precisaConfirmar = !r.data.session;
    var ins = await sb.from("pa_usuarios").insert({
      id: r.data.user.id, nome: nome, perfil: perfil,
      modulo_pacotes: moduloPacotes, modulo_sacas: moduloSacas
    });
    if (ins.error) throw ins.error;
    return { id: r.data.user.id, precisaConfirmar: precisaConfirmar };
  }

  async function listarUsuarios() {
    var r = await sb.from("pa_usuarios").select("*").order("criado_em");
    if (r.error) throw r.error;
    return r.data;
  }
  async function atualizarUsuario(id, campos) {
    var r = await sb.from("pa_usuarios").update(campos).eq("id", id);
    if (r.error) throw r.error;
  }
  // liga/desliga o acesso DE VERDADE ao Gestão de Sacas (tabela usuarios_sacas
  // dele, não só o flag local) — mesma conta de login, então funciona com o
  // mesmo usuário/senha assim que essa linha existir. A escrita em si roda
  // dentro da função pa_sync_acesso_sacas (RPC) em vez de um insert/delete
  // direto na tabela — evita depender de RLS avaliar uma subconsulta contra
  // outra tabela pela API REST.
  async function atualizarModuloSacas(id, nome, perfil, ligar) {
    var r = await sb.from("pa_usuarios").update({ modulo_sacas: ligar }).eq("id", id);
    if (r.error) throw r.error;
    var rpc = await sb.rpc("pa_sync_acesso_sacas", { alvo_id: id, alvo_nome: nome, alvo_perfil: perfil, ligar: ligar });
    if (rpc.error) throw new Error("Módulo salvo, mas não consegui " + (ligar ? "liberar" : "remover") + " o acesso real no Sacas: " + rpc.error.message);
  }
  // tira a pessoa dos dois sistemas (pa_usuarios + usuarios_sacas). A conta de
  // login em si (Supabase Auth) continua existindo — sem ela não fica logada
  // em nada, mas pra apagar o login de verdade ainda é manual no Supabase
  // (Authentication > Users > excluir), não dá pra fazer isso com a chave
  // anon do navegador.
  async function excluirUsuario(id) {
    await sb.rpc("pa_sync_acesso_sacas", { alvo_id: id, alvo_nome: "", alvo_perfil: "operador", ligar: false });
    var r = await sb.from("pa_usuarios").delete().eq("id", id);
    if (r.error) throw r.error;
  }

  // sincroniza sozinho assim que a conexão volta, e avisa a tela (evento
  // "pa:sync") pra atualizar as listas e mostrar quantas ações foram
  // sincronizadas.
  if (typeof window !== "undefined") {
    window.addEventListener("online", function () {
      sincronizarFila().then(function (res) {
        window.dispatchEvent(new CustomEvent("pa:sync", { detail: res }));
      });
    });
  }

  window.PA = {
    SHELF_COLORS: SHELF_COLORS,
    login: login, logout: logout, getSessaoAtual: getSessaoAtual,
    listarLocalizacoes: listarLocalizacoes, criarLocalizacao: criarLocalizacao,
    alternarLocalizacao: alternarLocalizacao, excluirLocalizacao: excluirLocalizacao,
    listarEstoque: listarEstoque, listarHistorico: listarHistorico,
    cadastrarPacote: cadastrarPacote, cadastrarEmMassaComLocais: cadastrarEmMassaComLocais,
    entregarPacote: entregarPacote, devolverPacote: devolverPacote, transferirPacote: transferirPacote, buscarPorCodigo: buscarPorCodigo,
    relatorioPeriodo: relatorioPeriodo,
    listarUsuarios: listarUsuarios, atualizarUsuario: atualizarUsuario, criarUsuarioLogin: criarUsuarioLogin,
    atualizarModuloSacas: atualizarModuloSacas, excluirUsuario: excluirUsuario,
    estaOffline: estaOffline, contarPendentes: contarPendentes, sincronizarFila: sincronizarFila
  };
})();
