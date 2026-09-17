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
    var r = await sb.from("pa_localizacoes").select("*").order("codigo");
    if (r.error) throw r.error;
    return r.data;
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
    return fetchAll(function (a, b) {
      return sb.from("pa_pacotes").select("*").eq("status", "estoque").range(a, b);
    });
  }
  async function listarHistorico(filtroCodigo) {
    var q = sb.from("pa_pacotes").select("*").eq("status", "entregue").order("entregue_em", { ascending: false }).limit(500);
    if (filtroCodigo) q = q.ilike("codigo", "%" + filtroCodigo + "%");
    var r = await q;
    if (r.error) throw r.error;
    return r.data;
  }
  async function cadastrarPacote(codigo, local, cadastradoPor) {
    var r = await sb.from("pa_pacotes").insert({ codigo: codigo, local: local, cadastrado_por: cadastradoPor }).select().single();
    if (r.error) {
      if (r.error.code === "23505") throw new Error("Já existe um pacote cadastrado com esse código.");
      throw r.error;
    }
    return r.data;
  }
  async function cadastrarEmMassaComLocais(linhas, cadastradoPor) {
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
  async function entregarPacote(id, entreguePor) {
    var r = await sb.from("pa_pacotes").update({ status: "entregue", entregue_por: entreguePor, entregue_em: new Date().toISOString() }).eq("id", id);
    if (r.error) throw r.error;
  }
  async function transferirPacote(id, novoLocal) {
    var r = await sb.from("pa_pacotes").update({ local: novoLocal }).eq("id", id);
    if (r.error) throw r.error;
  }
  async function buscarPorCodigo(q) {
    var r = await sb.from("pa_pacotes").select("*").eq("status", "estoque").ilike("codigo", "%" + q + "%").order("cadastrado_em", { ascending: false }).limit(8);
    if (r.error) throw r.error;
    return r.data;
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
  // mesmo usuário/senha assim que essa linha existir.
  async function atualizarModuloSacas(id, nome, perfil, ligar) {
    var r = await sb.from("pa_usuarios").update({ modulo_sacas: ligar }).eq("id", id);
    if (r.error) throw r.error;
    if (ligar) {
      var up = await sb.from("usuarios_sacas").upsert({ id: id, nome: nome, perfil: perfil === "gestor" ? "gestor" : "operador" });
      if (up.error) throw new Error("Módulo salvo, mas não consegui liberar o acesso real no Sacas: " + up.error.message);
    } else {
      var del = await sb.from("usuarios_sacas").delete().eq("id", id);
      if (del.error) throw new Error("Módulo salvo, mas não consegui remover o acesso real no Sacas: " + del.error.message);
    }
  }
  // tira a pessoa dos dois sistemas (pa_usuarios + usuarios_sacas). A conta de
  // login em si (Supabase Auth) continua existindo — sem ela não fica logada
  // em nada, mas pra apagar o login de verdade ainda é manual no Supabase
  // (Authentication > Users > excluir), não dá pra fazer isso com a chave
  // anon do navegador.
  async function excluirUsuario(id) {
    await sb.from("usuarios_sacas").delete().eq("id", id);
    var r = await sb.from("pa_usuarios").delete().eq("id", id);
    if (r.error) throw r.error;
  }

  window.PA = {
    SHELF_COLORS: SHELF_COLORS,
    login: login, logout: logout, getSessaoAtual: getSessaoAtual,
    listarLocalizacoes: listarLocalizacoes, criarLocalizacao: criarLocalizacao,
    alternarLocalizacao: alternarLocalizacao, excluirLocalizacao: excluirLocalizacao,
    listarEstoque: listarEstoque, listarHistorico: listarHistorico,
    cadastrarPacote: cadastrarPacote, cadastrarEmMassaComLocais: cadastrarEmMassaComLocais,
    entregarPacote: entregarPacote, transferirPacote: transferirPacote, buscarPorCodigo: buscarPorCodigo,
    listarUsuarios: listarUsuarios, atualizarUsuario: atualizarUsuario, criarUsuarioLogin: criarUsuarioLogin,
    atualizarModuloSacas: atualizarModuloSacas, excluirUsuario: excluirUsuario
  };
})();
