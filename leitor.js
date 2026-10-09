/* Campos de código: botão de apagar (borracha) + alternância Leitor/Câmera.
   Usado pelas duas telas (index.html e mobile.html). Não depende do resto do
   app: só enxerga os campos pelos ids e entrega o resultado como um evento
   "input" normal — então o cadastro/busca reagem igual a um leitor sem fio. */
(function () {
  "use strict";

  var IDS = ["in-codigo", "in-busca", "in-busca-hist"];
  var KEY = "pa_modo_leitor";
  var LIB = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";

  var ICON_ERASER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>';
  var ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  var ICON_PLUG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6"/><path d="M15 2v6"/><path d="M12 17v5"/><path d="M5 8h14v3a7 7 0 0 1-14 0z"/></svg>';

  function lerModo() {
    try { return localStorage.getItem(KEY) === "camera" ? "camera" : "leitor"; } catch (e) { return "leitor"; }
  }
  var modo = lerModo();

  /* ---------- estilos (usa as mesmas variáveis de cor das duas telas) ---------- */
  var css = document.createElement("style");
  css.textContent =
    ".pa-codebox{position:relative; display:block}" +
    ".pa-codebox input.pa-code{padding-right:48px}" +
    ".pa-codebox.pa-cam input.pa-code{padding-right:88px}" +
    ".pa-codebox input[type=search]::-webkit-search-cancel-button{-webkit-appearance:none; display:none}" +
    ".pa-btns{position:absolute; right:5px; top:50%; transform:translateY(-50%); display:flex; gap:2px; z-index:2}" +
    ".pa-ibtn{all:unset; box-sizing:border-box; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--ink-soft); -webkit-tap-highlight-color:transparent}" +
    ".pa-ibtn:hover,.pa-ibtn:active{background:var(--surface-2); color:var(--ink)}" +
    ".pa-ibtn svg,.pa-codebox .pa-ibtn svg{position:static!important; transform:none!important; width:18px!important; height:18px!important; stroke:currentColor!important}" +
    ".pa-ibtn.pa-erase{display:none; color:var(--danger)}" +
    ".pa-codebox.pa-has .pa-ibtn.pa-erase{display:flex}" +
    ".pa-ibtn.pa-camb{display:none; color:var(--accent)}" +
    ".pa-codebox.pa-cam .pa-ibtn.pa-camb{display:flex}" +
    ".pa-pill{all:unset; box-sizing:border-box; position:fixed; right:14px; bottom:calc(16px + env(safe-area-inset-bottom,0px)); z-index:45; display:none; align-items:center; gap:8px;" +
    " padding:9px 14px 9px 11px; border-radius:999px; font:600 13px/1 'IBM Plex Sans',system-ui,sans-serif; cursor:pointer;" +
    " background:var(--surface); color:var(--ink); border:1px solid var(--line-strong); box-shadow:var(--shadow); -webkit-tap-highlight-color:transparent}" +
    ".pa-pill.show{display:inline-flex}" +
    ".pa-pill svg{width:17px; height:17px}" +
    ".pa-pill.on{background:var(--accent); color:var(--accent-ink); border-color:transparent}" +
    ".pa-pill .pa-sw{font-size:11px; letter-spacing:.04em; opacity:.85; text-transform:uppercase}" +
    "body.pa-has-tabbar .pa-pill{bottom:calc(66px + env(safe-area-inset-bottom,0px))}" +
    ".pa-cam-ov{position:fixed; inset:0; z-index:300; background:rgba(10,9,7,.88); display:flex; align-items:center; justify-content:center; padding:14px}" +
    ".pa-cam-ov[hidden]{display:none}" +
    ".pa-cam-card{background:var(--surface); color:var(--ink); border-radius:16px; width:min(100%,460px); padding:14px; box-shadow:var(--shadow)}" +
    ".pa-cam-card h3{margin:2px 2px 10px; font-size:15px; font-family:inherit}" +
    "#pa-cam-reader{width:100%; min-height:220px; border-radius:10px; overflow:hidden; background:#000}" +
    ".pa-cam-msg{min-height:20px; margin:10px 2px 2px; font-size:12.5px; color:var(--ink-soft)}" +
    ".pa-cam-msg.err{color:var(--danger)}" +
    ".pa-cam-close{all:unset; box-sizing:border-box; width:100%; margin-top:10px; text-align:center; padding:12px; border-radius:10px; cursor:pointer;" +
    " font:600 14px/1 'IBM Plex Sans',system-ui,sans-serif; background:var(--surface-2); color:var(--ink); border:1px solid var(--line-strong)}";
  document.head.appendChild(css);

  /* ---------- borracha + câmera em cada campo ---------- */
  var boxes = [];

  function dispararInput(inp) { inp.dispatchEvent(new Event("input", { bubbles: true })); }

  function montar(inp) {
    if (!inp || inp._paMontado) return;
    inp._paMontado = true;
    inp.classList.add("pa-code");

    var box = document.createElement("div");
    box.className = "pa-codebox";
    inp.parentNode.insertBefore(box, inp);
    box.appendChild(inp);

    var btns = document.createElement("div");
    btns.className = "pa-btns";

    var cam = document.createElement("button");
    cam.type = "button"; cam.className = "pa-ibtn pa-camb";
    cam.setAttribute("aria-label", "Ler com a câmera"); cam.title = "Ler com a câmera";
    cam.innerHTML = ICON_CAM;
    cam.addEventListener("click", function () { abrirCamera(inp); });

    var er = document.createElement("button");
    er.type = "button"; er.className = "pa-ibtn pa-erase";
    er.setAttribute("aria-label", "Apagar o código"); er.title = "Apagar tudo";
    er.innerHTML = ICON_ERASER;
    // mousedown segura o foco no campo (não fecha o teclado/leitor no meio do gesto)
    er.addEventListener("mousedown", function (e) { e.preventDefault(); });
    er.addEventListener("click", function () {
      inp.value = "";
      dispararInput(inp);
      atualizar();
      if (modo === "leitor") { try { inp.focus(); } catch (e) {} }
    });

    btns.appendChild(cam); btns.appendChild(er);
    box.appendChild(btns);

    // Leitor "digita" os caracteres quase de uma vez (poucos ms entre um e outro);
    // gente digitando leva bem mais. Se o campo já tinha um número sobrando e chega
    // uma rajada rápida, é leitura nova: descarta o que sobrou, senão os dígitos se
    // misturam e o código sai errado. Fica na fase de captura do box pra rodar ANTES
    // dos handlers do app (que cortam em 11 dígitos e enviam sozinhos).
    var rajada = { t: 0, n: 0, base: "" };
    box.addEventListener("input", function (e) {
      if (e.target !== inp) return;
      var agora = (window.performance && performance.now) ? performance.now() : Date.now();
      var gap = agora - rajada.t; rajada.t = agora;
      var dado = e.data || "";
      if (e.inputType !== "insertText" || !dado) { rajada.n = 0; return; }
      var cur = inp.value;
      if (gap >= 70) {
        rajada.n = 1;
        rajada.base = cur.slice(-dado.length) === dado ? cur.slice(0, cur.length - dado.length) : "";
      } else {
        rajada.n++;
      }
      if (rajada.n === 2 && rajada.base && cur.indexOf(rajada.base) === 0) {
        inp.value = cur.slice(rajada.base.length);
      }
    }, true);
    inp.addEventListener("input", atualizar);
    inp.addEventListener("change", atualizar);

    // no modo câmera, o app não deve puxar o foco sozinho (abriria o teclado);
    // toque do usuário no campo continua funcionando normalmente.
    var focoOriginal = inp.focus;
    inp.focus = function () {
      if (modo === "camera") return;
      return focoOriginal.apply(inp, arguments);
    };

    boxes.push({ inp: inp, box: box });
  }

  function atualizar() {
    var algumVisivel = false;
    boxes.forEach(function (b) {
      b.box.classList.toggle("pa-has", b.inp.value.length > 0);
      b.box.classList.toggle("pa-cam", modo === "camera");
      if (b.inp.offsetParent !== null) algumVisivel = true;
    });
    // aparece em qualquer tela depois do login (não só onde tem campo de código)
    var app = document.getElementById("view-app");
    if (app && !app.hidden) algumVisivel = true;
    pill.classList.toggle("show", algumVisivel);
  }

  /* ---------- botão liga/desliga do leitor ---------- */
  var pill = document.createElement("button");
  pill.type = "button"; pill.className = "pa-pill";
  function desenharPill() {
    var leitor = modo === "leitor";
    pill.classList.toggle("on", leitor);
    pill.innerHTML = (leitor ? ICON_PLUG : ICON_CAM) +
      "<span>" + (leitor ? "Leitor" : "Câmera") + "</span>" +
      '<span class="pa-sw">' + (leitor ? "ON" : "OFF") + "</span>";
    pill.setAttribute("aria-label", leitor
      ? "Leitor ligado. Toque pra desligar e usar a câmera."
      : "Leitor desligado, usando a câmera. Toque pra ligar o leitor.");
  }
  pill.addEventListener("click", function () {
    modo = modo === "leitor" ? "camera" : "leitor";
    try { localStorage.setItem(KEY, modo); } catch (e) {}
    desenharPill();
    atualizar();
  });
  desenharPill();

  /* ---------- câmera ---------- */
  var ov = document.createElement("div");
  ov.className = "pa-cam-ov"; ov.hidden = true;
  ov.innerHTML =
    '<div class="pa-cam-card">' +
      "<h3>Aponte a câmera pro código</h3>" +
      '<div id="pa-cam-reader"></div>' +
      '<div class="pa-cam-msg" id="pa-cam-msg"></div>' +
      '<button type="button" class="pa-cam-close" id="pa-cam-close">Fechar</button>' +
    "</div>";

  var scanner = null, alvo = null, libPromise = null, aberta = false;

  function carregarLib() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (libPromise) return libPromise;
    libPromise = new Promise(function (ok, erro) {
      var s = document.createElement("script");
      s.src = LIB; s.onload = ok;
      s.onerror = function () { libPromise = null; erro(new Error("lib")); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  function msg(texto, erro) {
    var m = document.getElementById("pa-cam-msg");
    m.textContent = texto || "";
    m.className = "pa-cam-msg" + (erro ? " err" : "");
  }

  function fecharCamera() {
    aberta = false;
    var s = scanner; scanner = null;
    ov.hidden = true;
    if (s) {
      var limpar = function () { try { s.clear(); } catch (e) {} };
      try { s.stop().then(limpar, limpar); } catch (e) { limpar(); }
    }
  }

  var ultimoAviso = 0;
  function aoLer(texto) {
    var m = String(texto || "").match(/\d{11}/);
    if (!m) {
      if (Date.now() - ultimoAviso > 1500) { ultimoAviso = Date.now(); msg("Li um código, mas não tem 11 dígitos. Tente de novo.", true); }
      return;
    }
    var inp = alvo;
    fecharCamera();
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
    if (inp) { inp.value = m[0]; dispararInput(inp); atualizar(); }
  }

  function abrirCamera(inp) {
    if (aberta) return;
    aberta = true; alvo = inp;
    document.body.appendChild(ov);
    ov.hidden = false;
    msg("Abrindo a câmera…");
    carregarLib().then(function () {
      if (!aberta) return;
      var F = window.Html5QrcodeSupportedFormats;
      scanner = new window.Html5Qrcode("pa-cam-reader", {
        verbose: false,
        formatsToSupport: [F.QR_CODE, F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8, F.UPC_A, F.ITF, F.CODABAR, F.DATA_MATRIX],
        experimentalFeatures: { useBarCodeDetector: true }
      });
      return scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: function (w, h) { return { width: Math.floor(w * 0.88), height: Math.floor(Math.min(h, w) * 0.6) }; }
        },
        aoLer,
        function () { /* frame sem código: normal, ignora */ }
      ).then(function () { msg("Procurando o código…"); });
    }).catch(function (e) {
      var txt = String((e && (e.message || e)) || "");
      if (txt === "lib") msg("Não consegui carregar o leitor de câmera. Confira a internet.", true);
      else msg("Não consegui abrir a câmera. Libere a permissão de câmera no navegador e tente de novo.", true);
    });
  }

  ov.addEventListener("click", function (e) { if (e.target === ov) fecharCamera(); });
  ov.querySelector("#pa-cam-close").addEventListener("click", fecharCamera);

  /* ---------- aviso com "Desfazer" (usado depois de cadastrar um pacote) ---------- */
  var undoCss = document.createElement("style");
  undoCss.textContent =
    ".pa-undo{position:fixed; left:50%; transform:translateX(-50%); z-index:62; display:none; align-items:center; gap:12px;" +
    " max-width:90vw; padding:7px 7px 7px 16px; border-radius:99px; background:var(--ink); color:var(--bg);" +
    " font:500 12.5px/1.3 'IBM Plex Sans',system-ui,sans-serif; box-shadow:var(--shadow)}" +
    ".pa-undo.show{display:flex}" +
    ".pa-undo button{all:unset; box-sizing:border-box; cursor:pointer; flex-shrink:0; padding:8px 14px; border-radius:99px;" +
    " background:var(--accent); color:var(--accent-ink); font:700 12.5px/1 'IBM Plex Sans',system-ui,sans-serif}";
  document.head.appendChild(undoCss);

  var undoEl = document.createElement("div");
  undoEl.className = "pa-undo";
  undoEl.innerHTML = '<span class="pa-undo-t"></span><button type="button">Desfazer</button>';
  var undoTimer = null, undoFn = null;

  function esconderUndo() { clearTimeout(undoTimer); undoFn = null; undoEl.classList.remove("show"); }
  undoEl.querySelector("button").addEventListener("click", function () {
    var fn = undoFn;
    esconderUndo();
    if (fn) fn();
  });

  // Mostra a mensagem com o botão Desfazer na mesma posição do aviso normal do app.
  // Só o último cadastro fica desfazível (um novo bipe substitui o anterior).
  window.PA_UI = {
    desfazer: function (texto, aoDesfazer, ms) {
      var t = document.getElementById("toast");
      undoEl.style.bottom = t ? getComputedStyle(t).bottom : "78px";
      undoEl.querySelector(".pa-undo-t").textContent = texto;
      undoFn = aoDesfazer;
      undoEl.classList.add("show");
      clearTimeout(undoTimer);
      undoTimer = setTimeout(esconderUndo, ms || 7000);
    }
  };

  /* ---------- start ---------- */
  document.body.appendChild(undoEl);
  IDS.forEach(function (id) { montar(document.getElementById(id)); });
  if (document.getElementById("tabbar")) document.body.classList.add("pa-has-tabbar");
  document.body.appendChild(pill);
  atualizar();
  setInterval(atualizar, 300); // pega limpezas feitas por código (form.reset etc.) e troca de tela
})();
