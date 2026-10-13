/* Unser Chat – Start, Import, Sperre, Tabs, Einstellungen */
(function (UC) {
  "use strict";
  const { el, icon } = UC;
  const app = {};
  let current = "chat";
  const inited = {};
  let hiddenAt = 0;

  // ---------- Darstellung ----------
  function applyTheme() {
    const t = UC.prefs.get("theme", "auto");
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    const s = UC.prefs.get("size", "normal");
    if (s === "large") document.documentElement.setAttribute("data-size", "large");
    else document.documentElement.removeAttribute("data-size");
  }

  // ---------- Tabs ----------
  function showTab(name) {
    current = name;
    UC.$$(".screen").forEach((s) => s.classList.toggle("active", s.id === "tab-" + name));
    const FILLED = { chat: ["i-chat", "i-chat-fill"], moments: ["i-heart", "i-heart-fill"] };
    UC.$$("#tabbar button").forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle("on", on);
      const f = FILLED[b.dataset.tab];
      if (f) b.querySelector("use").setAttribute("href", "#" + f[on ? 1 : 0]);
    });
    if (name === "cal" && !inited.cal) { inited.cal = true; UC.calendar.init(); }
    if (name === "moments") { if (!inited.moments) { inited.moments = true; UC.moments.init(); } else UC.moments.onShow(); }
    if (name === "stats") { if (!inited.stats) { inited.stats = true; UC.stats.init(); } UC.stats.onShow(); }
    if (name === "search") UC.data.ensureNorm();
  }
  app.showTab = showTab;
  app.openInChat = (i, opts) => {
    UC.$$("#overlays .sheet, #overlays .sheet-bg").forEach((n) => n.remove());
    showTab("chat");
    requestAnimationFrame(() => UC.chat.jumpToIndex(i, opts || { flash: true }));
  };
  app.showDay = (day) => { if (!inited.cal) { inited.cal = true; UC.calendar.init(); } UC.calendar.showDay(day); };
  app.searchFor = (q) => { showTab("search"); UC.search.searchFor(q); };

  // ---------- Einstellungen ----------
  app.openSettings = function () {
    const D = UC.data;
    const body = el("div");
    const s = UC.sheet({ title: "Einstellungen", body });
    const section = (t) => body.appendChild(el("div", { class: "section-title", text: t }));
    const choice = (opts, cur, onPick) => {
      for (const [v, l] of opts) {
        const b = el("button", { class: "opt" }, el("span", { text: l }), el("span", { class: "check" + (cur === v ? " on" : "") }));
        b.onclick = () => { onPick(v); UC.$$(".check", b.parentNode).forEach(() => 0); s.close(); app.openSettings(); };
        body.appendChild(b);
      }
    };
    if (D.chats.length > 1) {
      section("Angezeigte Chats");
      D.chats.forEach((c, ci) => {
        const b = el("button", { class: "opt" },
          el("span", null, c.name, el("div", { class: "muted small", text: UC.fmtDate(c.first, "med") + " – " + UC.fmtDate(c.last, "med") + " · " + UC.fmtNum(c.n) })),
          el("span", { class: "check" + (D.chatOn[ci] ? " on" : "") }));
        b.onclick = () => {
          const arr = D.chatOn.slice();
          arr[ci] = !arr[ci];
          if (!arr.some(Boolean)) { UC.toast("Mindestens ein Chat muss sichtbar sein"); return; }
          D.setChatOn(arr);
          b.querySelector(".check").classList.toggle("on", arr[ci]);
          UC.chat.refresh();
        };
        body.appendChild(b);
      });
    }
    section("Darstellung");
    choice([["auto", "Automatisch (wie iPhone)"], ["light", "Hell"], ["dark", "Dunkel"]], UC.prefs.get("theme", "auto"), (v) => { UC.prefs.set("theme", v); applyTheme(); });
    section("Schriftgröße");
    choice([["normal", "Normal"], ["large", "Groß"]], UC.prefs.get("size", "normal"), (v) => { UC.prefs.set("size", v); applyTheme(); UC.chat.refresh(); });
    section("Mehr");
    const intro = el("button", { class: "opt", text: "Intro noch einmal ansehen" });
    intro.onclick = () => { s.close(); UC.intro.show(); };
    body.appendChild(intro);
    if (UC.media.mode === "idb") {
      const imp = el("button", { class: "opt", text: "Neue Chat-Datei importieren" });
      imp.onclick = () => { s.close(); showImport(); };
      const del = el("button", { class: "opt danger", text: "Alle Daten von diesem iPhone löschen" });
      del.onclick = async () => {
        if (!(await UC.confirmSheet("Wirklich löschen?", "Alle Nachrichten, Fotos und Favoriten werden von diesem iPhone entfernt. Die App bleibt, du kannst die Datei später erneut importieren.", "Löschen", true))) return;
        await UC.idb.wipe();
        location.reload();
      };
      body.append(imp, del);
    }
    const built = D.raw.built ? UC.fmtDate(Math.floor(D.raw.built), "short") : "";
    body.appendChild(el("div", { class: "empty small", style: { padding: "18px 16px" },
      text: UC.fmtNum(D.N) + " Nachrichten · " + UC.fmtNum(D.media.length) + " Medien" + (built ? " · Stand " + built : "") + " · 100 % offline" }));
  };

  // ---------- Tor (Import / Sperre) ----------
  function gate(...kids) {
    const g = UC.$("#gate");
    g.replaceChildren(...kids);
    g.hidden = false;
    return g;
  }
  function closeGate() { UC.$("#gate").hidden = true; UC.$("#gate").replaceChildren(); }
  const logo = () => el("img", { class: "logo", src: "icons/icon-192.png", alt: "" });

  function showImport() {
    const file = el("input", { type: "file", hidden: true });
    const pick = el("button", { class: "btn", text: "Datei auswählen" });
    const err = el("div", { class: "err" });
    gate(logo(), el("h1", { text: "Unser Chat" }),
      el("p", { text: "Wähle die Datei „unser-chat.chatpaket“ aus (z. B. per AirDrop empfangen und in „Dateien“ gesichert). Eure Nachrichten werden nur auf diesem iPhone gespeichert." }),
      pick, file, err);
    pick.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        const h = await UC.paket.readHead(f);
        pick.disabled = true; pick.textContent = "Wird geöffnet …";
        // Paket ohne eigenes Passwort: direkt öffnen, sonst Passwort abfragen
        try {
          const key = await UC.paket.deriveKey(UC.paket.DEFAULT_PASSWORD, h.head);
          const index = await UC.paket.openIndex(f, h, key);
          runImport(f, h, key, index);
        } catch (e) {
          if (!e.wrongPassword) throw e;
          askPassword(f, h);
        }
      } catch (e) {
        pick.disabled = false; pick.textContent = "Datei auswählen";
        err.textContent = e.message || "Datei konnte nicht gelesen werden.";
      }
    };
  }
  function askPassword(f, h) {
    const pw = el("input", { type: "password", placeholder: "Passwort", autocomplete: "off", enterkeyhint: "go" });
    const ok = el("button", { class: "btn", text: "Öffnen" });
    const err = el("div", { class: "err" });
    gate(logo(), el("h1", { text: "Fast geschafft" }),
      h.head.hint ? el("div", { class: "hint", text: "Hinweis: " + h.head.hint }) : el("p", { text: "Bitte gib das Passwort ein." }),
      pw, ok, err);
    setTimeout(() => pw.focus(), 200);
    const go = async () => {
      if (!pw.value) return;
      ok.disabled = true; ok.textContent = "Prüfe …"; err.textContent = "";
      try {
        const key = await UC.paket.deriveKey(pw.value, h.head);
        const index = await UC.paket.openIndex(f, h, key);
        runImport(f, h, key, index);
      } catch (e) {
        ok.disabled = false; ok.textContent = "Öffnen";
        err.textContent = e.wrongPassword ? "Das Passwort stimmt leider nicht." : (e.message || "Fehler beim Öffnen.");
        pw.select();
      }
    };
    ok.onclick = go;
    pw.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }
  async function runImport(f, h, key, index) {
    const bar = el("i");
    const lbl = el("div", { class: "hint", text: "0 %" });
    gate(logo(), el("h1", { text: "Eure Geschichte wird geladen …" }),
      el("p", { text: "Bitte die App geöffnet lassen, das kann ein paar Minuten dauern." }),
      el("div", { class: "prog" }, bar), lbl);
    let lock = null;
    try { if (navigator.wakeLock) lock = await navigator.wakeLock.request("screen"); } catch (e) { lock = null; }
    try {
      const json = await UC.paket.importAll(f, h, key, index, (p, done, total) => {
        bar.style.width = (p * 100).toFixed(1) + "%";
        lbl.textContent = Math.floor(p * 100) + " % · " + (done / 1e6).toFixed(0) + " von " + (total / 1e6).toFixed(0) + " MB";
      });
      UC.prefs.set("introSeen", false);
      start(JSON.parse(json), "idb");
    } catch (e) {
      gate(logo(), el("h1", { text: "Das hat nicht geklappt" }),
        el("p", { text: (e && e.message) || "Unbekannter Fehler" }),
        el("p", { text: "Tipp: Ist genug Speicherplatz frei? Dann einfach noch einmal versuchen." }),
        el("button", { class: "btn", text: "Erneut versuchen", onclick: showImport }));
    } finally {
      try { if (lock) lock.release(); } catch (e) { /* egal */ }
    }
  }

  async function sha256hex(s) {
    if (window.crypto && crypto.subtle) {
      try {
        const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
        return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
      } catch (e) { /* weiter mit Ersatz */ }
    }
    return sha256js(s);
  }
  // kleine SHA-256-Implementierung als Ersatz, falls WebCrypto fehlt
  function sha256js(str) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = Array.from(new TextEncoder().encode(str));
    const l = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(Math.floor(l / Math.pow(2, i * 8)) & 255);
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < bytes.length; o += 64) {
      const w = new Array(64);
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }
  function showLock(lock, onOk) {
    let code = "";
    const dots = el("div", { class: "pin-dots" });
    const drawDots = () => {
      dots.replaceChildren();
      for (let i = 0; i < Math.max(4, code.length); i++) dots.appendChild(el("i", { class: i < code.length ? "on" : "" }));
    };
    drawDots();
    const pad = el("div", { class: "keypad" });
    const press = async (k) => {
      if (k === "del") code = code.slice(0, -1);
      else if (code.length < 8) code += k;
      drawDots();
      if (code.length >= 4) {
        const h = await sha256hex(lock.salt + code);
        if (h === lock.hash) { closeGate(); onOk(); return; }
        if (code.length >= 8) { dots.classList.add("shake"); setTimeout(() => { dots.classList.remove("shake"); code = ""; drawDots(); }, 450); }
      }
    };
    for (const k of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"]) {
      if (!k) { pad.appendChild(el("span")); continue; }
      const b = el("button", { class: k === "del" ? "txt" : "", text: k === "del" ? "Löschen" : k });
      b.onclick = () => press(k);
      pad.appendChild(b);
    }
    gate(el("div", { style: { marginBottom: "8px" } }, icon("i-lock")), el("h1", { text: "Code eingeben" }), dots, pad);
  }

  // ---------- Start ----------
  function start(raw, mode) {
    UC.media.mode = mode;
    UC.data.init(raw);
    const go = () => {
      closeGate();
      UC.$("#app").hidden = false;
      if (!inited.base) {
        inited.base = true;
        UC.chat.init();
        UC.search.init();
        UC.$("#tabbar").addEventListener("click", (e) => {
          const b = e.target.closest("button[data-tab]");
          if (!b) return;
          if (b.dataset.tab === current && current === "chat") UC.chat.jumpToEnd();
          showTab(b.dataset.tab);
        });
        UC.$("#chat-menu-btn").onclick = app.openSettings;
        UC.$("#chat-avatar").onclick = app.openSettings;
        UC.$("#chat-title-btn").onclick = () => showTab("stats");
        UC.$("#chat-cal-btn").onclick = () => showTab("cal");
      } else {
        UC.chat.updateHeader();
        UC.chat.jumpToEnd();
      }
      if (!UC.prefs.get("introSeen", false)) UC.intro.show();
      setTimeout(() => UC.data.ensureNorm(), 1500);
    };
    const lock = UC.data.cfg.lock;
    if (lock && lock.hash) showLock(lock, go); else go();
  }

  // Externe Links: in der iOS-Hülle über Safari öffnen, sonst neuer Tab
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!/^(https?:|mailto:|tel:)/i.test(href)) return;
    e.preventDefault();
    const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ucopen;
    if (h) h.postMessage(href); else window.open(href, "_blank", "noopener");
  }, true);

  async function boot() {
    applyTheme();
    if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("sw.js").catch(() => { /* egal */ });
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      const lock = UC.data && UC.data.cfg && UC.data.cfg.lock;
      if (lock && lock.hash && hiddenAt && Date.now() - hiddenAt > 120000 && UC.$("#gate").hidden) showLock(lock, () => {});
    });
    if (window.__CHAT_DATA__) {
      const raw = typeof window.__CHAT_DATA__ === "string" ? JSON.parse(window.__CHAT_DATA__) : window.__CHAT_DATA__;
      window.__CHAT_DATA__ = null;
      start(raw, "bundle");
      return;
    }
    let json = null;
    try { json = await UC.idb.get("kv", "data"); } catch (e) { json = null; }
    if (json) start(JSON.parse(json), "idb");
    else showImport();
  }
  UC.app = app;
  app._sha256js = sha256js;
  document.addEventListener("DOMContentLoaded", boot);
})(window.UC);
