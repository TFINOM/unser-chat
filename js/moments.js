/* Unser Chat – Momente: Heute vor X Jahren, Zufall, Erste Male, Fotos, Favoriten */
(function (UC) {
  "use strict";
  const { el, icon } = UC;
  let D, body, seg, mode = "mem";

  function previewIdx(day, n) {
    const all = D.msgsOfDay(day).filter((i) => D.M[i][D.S] !== 2);
    if (all.length <= n) return all;
    // Ausschnitt mit möglichst vielen Textnachrichten aus der aktivsten Stunde
    let best = 0, bestScore = -1;
    for (let s = 0; s + n <= all.length; s += Math.max(1, Math.floor(n / 2))) {
      let score = 0;
      for (let j = s; j < s + n; j++) { const m = D.M[all[j]]; if (m[D.K] === 0 && (m[D.X] || "").length > 12) score += 2; if (m[D.K] === 1) score += 1; }
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return all.slice(best, best + n);
  }
  function memoryCard(day, title) {
    const ts = day * 86400;
    const info = D.dayInfo(day);
    const card = el("div", { class: "card memory" });
    card.appendChild(el("div", { class: "when" }, el("b", { text: title }), el("span", { class: "muted small", text: info ? UC.plural(info.count, "Nachricht", "Nachrichten") : "" })));
    card.appendChild(el("div", { class: "sub", text: UC.fmtDate(ts) }));
    const sp = UC.calendar.specialFor.apply(null, UC.ymd(ts));
    if (sp) card.appendChild(el("div", { class: "chip on", style: { display: "inline-block", marginTop: "6px" }, text: (sp.emoji || "⭐") + " " + sp.titel }));
    if (info) {
      const mini = el("div", { class: "mini" });
      mini.appendChild(UC.chat.miniRows(previewIdx(day, 6), body));
      mini.addEventListener("click", (e) => {
        if (e.target.closest("a,button")) return;
        const b = e.target.closest("[data-i]");
        if (b) UC.app.openInChat(+b.dataset.i, { flash: true });
      });
      card.appendChild(mini);
      const a1 = el("button", { class: "btn ghost", text: "Ganzer Tag" });
      a1.onclick = () => UC.app.showDay(day);
      const a2 = el("button", { class: "btn", text: "Im Chat öffnen" });
      a2.onclick = () => UC.app.openInChat(info.first, { align: "top" });
      card.appendChild(el("div", { class: "actions" }, a1, a2));
    }
    return card;
  }

  function onThisDay() {
    const now = UC.nowTs();
    const [cy, cm, cd] = UC.ymd(now);
    const out = [];
    for (let y = cy - 1; y >= D.years[0]; y--) {
      if (cm === 2 && cd === 29 && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1) continue;
      const day = Math.floor(UC.tsOf(y, cm, cd) / 86400);
      if (D.dayInfo(day)) out.push({ day, ago: cy - y });
    }
    return out;
  }
  function randomDay() {
    const cand = [];
    for (let j = 0; j < D.days.length; j++) if (D.dayCount[j] >= 15) cand.push(D.days[j]);
    const pool = cand.length ? cand : Array.from(D.days);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function firsts() {
    const M = D.M, items = [];
    const add = (ico, title, i, extra) => { if (i >= 0 && i < D.N) items.push({ ico, title, i, extra }); };
    let f0 = 0;
    while (f0 < D.N - 1 && M[f0][D.S] === 2) f0++;
    add("✨", "Eure erste Nachricht", f0, D.name(M[f0][D.S]));
    const phrases = (D.cfg.lovePhrases || []).map((p) => ({ p, tok: { t: UC.normalize(p), exact: true } }));
    if (phrases.length) {
      for (const s of [0, 1]) {
        for (let i = 0; i < D.N; i++) {
          const m = M[i];
          if (m[D.S] !== s || m[D.K] !== 0) continue;
          const t = UC.normalize(m[D.X] || "");
          const ph = phrases.find((x) => UC.matchToken(t, x.tok));
          if (ph) { add("❤️", "Das erste „" + ph.p.charAt(0).toUpperCase() + ph.p.slice(1) + "“ von " + D.name(s), i); break; }
        }
      }
    }
    // Kosenamen: das erste Mal
    const nick = D.cfg.nicknames || {};
    for (const n of (nick.me || []).concat(nick.partner || [])) {
      const tok = { t: UC.normalize(n), exact: false };
      for (let i = 0; i < D.N; i++) {
        const m = M[i];
        if (m[D.S] === 2 || !m[D.X] || m[D.K] === 9) continue;
        if (UC.matchToken(D.norm ? D.norm[i] : UC.normalize(m[D.X]), tok)) { add("💕", "Das erste „" + n + "“", i, D.name(m[D.S])); break; }
      }
    }
    const firstOf = (k) => { for (let i = 0; i < D.N; i++) if (M[i][D.K] === k) return i; return -1; };
    add("📷", "Das erste Foto", firstOf(1));
    add("🎤", "Die erste Sprachnachricht", firstOf(3));
    add("📞", "Der erste Anruf", firstOf(9));
    for (const n of [1000, 10000, 50000, 100000, 250000, 500000]) if (n <= D.N) add("🏁", "Nachricht Nr. " + UC.fmtNum(n), n - 1);
    items.sort((a, b) => a.i - b.i);
    const wrap = el("div", { class: "card firsts", style: { padding: "4px 0" } });
    for (const it of items) {
      const m = M[it.i];
      const b = el("button", { class: "list-item" },
        el("span", { class: "ico", text: it.ico }),
        el("span", { class: "grow" }, el("div", { text: it.title }),
          el("div", { class: "muted small", text: UC.fmtDate(m[D.T], "med") + (it.extra ? " · " + it.extra : "") })));
      b.onclick = () => UC.app.openInChat(it.i, { flash: true });
      wrap.appendChild(b);
    }
    if (wrap.lastChild) wrap.lastChild.style.borderBottom = "0";
    return wrap;
  }

  function renderMem() {
    body.replaceChildren();
    const cfg = D.cfg;
    if (cfg.since) {
      const [y, m, d] = cfg.since.split("-").map(Number);
      const days = UC.dayNum(UC.nowTs()) - Math.floor(UC.tsOf(y, m, d) / 86400);
      if (days > 0) body.appendChild(el("div", { class: "card", style: { textAlign: "center" } },
        el("div", { class: "muted small", text: "Zusammen seit " + UC.fmtDate(UC.tsOf(y, m, d), "med") }),
        el("div", { style: { fontSize: "34px", fontWeight: 700, margin: "4px 0" }, text: UC.fmtNum(days) + " Tage" }),
        el("div", { class: "muted small", text: "❤️" })));
    }
    body.appendChild(el("div", { class: "section-title", text: "Heute vor …" }));
    const list = onThisDay();
    if (list.length) for (const x of list) body.appendChild(memoryCard(x.day, UC.yearsAgo(x.ago)));
    else body.appendChild(el("div", { class: "card" }, el("div", { class: "sub", text: "An diesem Datum habt ihr in den letzten Jahren nicht geschrieben. Wie wäre es mit einer zufälligen Erinnerung?" })));
    body.appendChild(el("div", { class: "section-title", text: "Zufällige Erinnerung" }));
    const rndBox = el("div");
    const rndBtn = el("button", { class: "btn ghost", style: { margin: "4px 16px" } }, icon("i-dice"), "Würfeln");
    const roll = () => {
      const day = randomDay();
      const [y] = UC.ymd(day * 86400);
      rndBox.replaceChildren(memoryCard(day, String(y)));
    };
    rndBtn.onclick = roll;
    body.append(rndBtn, rndBox);
    roll();
    body.appendChild(el("div", { class: "section-title", text: "Erste Male & Meilensteine" }));
    body.appendChild(firsts());
    body.appendChild(el("div", { style: { height: "30px" } }));
  }

  function renderPhotos() {
    body.replaceChildren();
    const list = UC.media.visualList().slice().reverse();
    if (!list.length) { body.appendChild(el("div", { class: "empty", text: "Keine Fotos oder Videos in den Daten enthalten." })); return; }
    let shown = 0, curYear = null, grid = null;
    const more = () => {
      const end = Math.min(list.length, shown + 240);
      for (; shown < end; shown++) {
        const i = list[shown];
        const y = UC.D(D.M[i][D.T]).getUTCFullYear();
        if (y !== curYear) {
          curYear = y;
          let cnt = 0;
          for (let j = shown; j < list.length && UC.D(D.M[list[j]][D.T]).getUTCFullYear() === y; j++) cnt++;
          body.appendChild(el("div", { class: "photo-year" }, String(y), el("span", { text: UC.plural(cnt, "Foto/Video", "Fotos/Videos") })));
          grid = el("div", { class: "pgrid" });
          body.appendChild(grid);
        }
        const info = UC.media.info(i);
        const b = el("button", { "aria-label": "Foto vom " + UC.fmtDate(D.M[i][D.T], "short") });
        const img = el("img", { alt: "", decoding: "async" });
        UC.media.lazy(img, info.th || info.f, body);
        b.appendChild(img);
        if (D.M[i][D.K] !== 1) b.appendChild(icon("i-play", "vb"));
        b.onclick = () => UC.media.view(i);
        grid.appendChild(b);
      }
    };
    more();
    body.onscroll = () => { if (mode === "photos" && shown < list.length && body.scrollTop + body.clientHeight > body.scrollHeight - 1200) more(); };
  }

  function renderFav() {
    body.replaceChildren();
    const fav = D.favIndices().slice().reverse();
    if (!fav.length) {
      body.appendChild(el("div", { class: "empty", html: "Noch keine Favoriten.<br><br>Tippe im Chat <b>zweimal</b> auf eine Nachricht (oder halte sie gedrückt), um sie hier zu sammeln ❤️" }));
      return;
    }
    body.appendChild(el("div", { class: "result-count", text: UC.plural(fav.length, "Favorit", "Favoriten") }));
    for (const i of fav) {
      const card = el("div", { class: "card", style: { padding: "10px 10px 6px" } });
      card.appendChild(el("div", { class: "muted small", style: { padding: "0 4px" }, text: UC.fmtDate(D.M[i][D.T], "wmed") + " · " + UC.fmtTime(D.M[i][D.T]) }));
      const mini = el("div", { class: "mini" });
      mini.appendChild(UC.chat.miniRows([i], body));
      card.appendChild(mini);
      card.addEventListener("click", (e) => { if (!e.target.closest("a,button,.audio")) UC.app.openInChat(i, { flash: true }); });
      body.appendChild(card);
    }
  }

  function render() {
    body.onscroll = null;
    body.scrollTop = 0;
    if (mode === "photos") renderPhotos();
    else if (mode === "fav") renderFav();
    else renderMem();
  }
  function init() {
    D = UC.data;
    body = UC.$("#moments-body");
    seg = UC.$("#moments-seg");
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      mode = b.dataset.v;
      UC.$$("button", seg).forEach((x) => x.classList.toggle("on", x === b));
      render();
    });
    render();
  }
  function onShow() { if (mode === "fav") render(); }
  UC.moments = { init, onShow, render };
})(window.UC);
