/* Unser Chat – Volltextsuche */
(function (UC) {
  "use strict";
  const { el, icon } = UC;
  let D, input, clearBtn, filters, out;
  let state = { sender: -1, type: "all", year: 0, newest: true };
  let results = [], shown = 0, re = null, seq = 0;
  const TYPES = [
    ["all", "Alles"], ["text", "Text"], ["foto", "Fotos"], ["audio", "Sprachnachrichten"], ["video", "Videos"],
    ["link", "Links"], ["fav", "Favoriten"],
  ];

  function typeOk(i) {
    const m = D.M[i], k = m[D.K];
    switch (state.type) {
      case "text": return k === 0;
      case "foto": return k === 1;
      case "audio": return k === 3;
      case "video": return k === 2 || k === 5;
      case "link": return k === 0 && /https?:\/\//i.test(m[D.X]);
      case "fav": return D.isFav(i);
      default: return true;
    }
  }

  function renderFilters() {
    filters.replaceChildren();
    const mk = (label, on, fn) => { const b = el("button", { class: "chip" + (on ? " on" : ""), text: label }); b.onclick = fn; return b; };
    filters.append(
      mk("Beide", state.sender === -1, () => { state.sender = -1; renderFilters(); run(); }),
      mk(D.name(0), state.sender === 0, () => { state.sender = 0; renderFilters(); run(); }),
      mk(D.name(1), state.sender === 1, () => { state.sender = 1; renderFilters(); run(); }),
      mk("Art: " + TYPES.find((t) => t[0] === state.type)[1] + " ▾", state.type !== "all", pickType),
      mk(state.newest ? "Neueste zuerst ↓" : "Älteste zuerst ↑", false, () => { state.newest = !state.newest; renderFilters(); show(true); }),
    );
  }
  function pickType() {
    const body = el("div");
    const s = UC.sheet({ title: "Art der Nachricht", body });
    for (const [v, l] of TYPES) {
      const b = el("button", { class: "opt" }, el("span", { text: l }), el("span", { class: "check" + (state.type === v ? " on" : "") }));
      b.onclick = () => { state.type = v; s.close(); renderFilters(); run(); };
      body.appendChild(b);
    }
  }

  function snippet(text) {
    if (!re || text.length < 160) return UC.richText(text, re);
    re.lastIndex = 0;
    const m = re.exec(text);
    re.lastIndex = 0;
    if (!m) return UC.richText(text.slice(0, 160) + "…", re);
    const a = Math.max(0, m.index - 50);
    const b = Math.min(text.length, m.index + 130);
    return (a > 0 ? "…" : "") + UC.richText(text.slice(a, b), re) + (b < text.length ? "…" : "");
  }
  function resultItem(i) {
    const m = D.M[i];
    const s = m[D.S];
    const k = m[D.K];
    let txt = m[D.X] || "";
    if (k !== 0 && k !== 11) txt = (D.KIND_ICON[k] || "") + " " + (D.KIND_LABEL[k] || "") + (txt ? " · " + txt : "");
    const b = el("button", { class: "result" },
      el("div", { class: "rh" },
        el("b", null, el("i", { style: { background: s === 0 ? "var(--her)" : s === 1 ? "var(--him)" : "var(--text-3)" } }), D.name(s)),
        el("span", { text: UC.fmtDate(m[D.T], "wmed") + " · " + UC.fmtTime(m[D.T]) })),
      el("div", { class: "rt", html: snippet(txt) }));
    b.onclick = () => UC.app.openInChat(i, { flash: true, hl: re });
    return b;
  }

  function histogram(all) {
    const counts = new Map();
    for (const i of all) { const y = UC.D(D.M[i][D.T]).getUTCFullYear(); counts.set(y, (counts.get(y) || 0) + 1); }
    const years = D.years;
    const max = Math.max(1, ...years.map((y) => counts.get(y) || 0));
    const wrap = el("div");
    const bars = el("div", { class: "year-hist", role: "group", "aria-label": "Treffer pro Jahr" });
    const labels = el("div", { class: "year-hist-labels" });
    for (const y of years) {
      const c = counts.get(y) || 0;
      const b = el("button", { class: state.year === y ? "on" : "", "aria-label": y + ": " + c + " Treffer", title: y + ": " + c });
      b.appendChild(el("i", { style: { height: (c ? Math.max(3, Math.round(40 * c / max)) : 0) + "px" } }));
      b.onclick = () => { state.year = state.year === y ? 0 : y; show(true); };
      bars.appendChild(b);
      labels.appendChild(el("span", { text: years.length > 8 ? "’" + String(y).slice(2) : String(y) }));
    }
    wrap.append(bars, labels);
    return wrap;
  }

  function show(reset) {
    let list = results;
    if (state.year) list = list.filter((i) => UC.D(D.M[i][D.T]).getUTCFullYear() === state.year);
    if (!state.newest) list = list.slice().reverse();
    out.replaceChildren();
    out.scrollTop = 0;
    const head = el("div", { class: "result-count" },
      el("span", { text: UC.plural(list.length, "Treffer", "Treffer") + (state.year ? " in " + state.year : "") }),
      state.year ? el("button", { text: "Alle Jahre", onclick: () => { state.year = 0; show(true); } }) : null);
    out.append(histogram(results), head);
    const box = el("div");
    out.appendChild(box);
    shown = 0;
    const more = () => {
      const f = document.createDocumentFragment();
      const end = Math.min(list.length, shown + 60);
      for (; shown < end; shown++) f.appendChild(resultItem(list[shown]));
      box.appendChild(f);
    };
    more();
    out.onscroll = () => { if (shown < list.length && out.scrollTop + out.clientHeight > out.scrollHeight - 800) more(); };
    if (!list.length) box.appendChild(el("div", { class: "empty", text: "Nichts gefunden." }));
  }

  function emptyState() {
    out.onscroll = null;
    const rec = UC.prefs.get("recent", []);
    const tips = el("div", { class: "empty", style: { textAlign: "left" } },
      el("p", { html: "<b>So funktioniert die Suche</b>" }),
      el("p", { text: "• Mehrere Wörter finden Nachrichten, die alle Wörter enthalten." }),
      el("p", { text: "• „In Anführungszeichen“ sucht genau diesen Satz." }),
      el("p", { text: "• Groß-/Kleinschreibung und Umlaute sind egal: „schon“ findet auch „schön“." }),
      el("p", { text: "• Über „Art“ findest du alle Fotos, Sprachnachrichten oder Links – auch ohne Suchwort." }));
    out.replaceChildren();
    if (rec.length) {
      out.appendChild(el("div", { class: "section-title", text: "Zuletzt gesucht" }));
      const c = el("div", { class: "special" });
      for (const q of rec) c.appendChild(el("button", { class: "chip", text: q, onclick: () => { input.value = q; run(); } }));
      out.appendChild(c);
    }
    out.appendChild(tips);
  }

  async function run() {
    const q = input.value.trim();
    clearBtn.hidden = !q;
    const tokens = UC.parseQuery(q);
    const my = ++seq;
    if (!tokens.length && state.type === "all" && state.sender === -1) { results = []; emptyState(); return; }
    if (!D.norm) {
      out.replaceChildren(el("div", { class: "empty", text: "Suche wird vorbereitet …" }));
      await D.ensureNorm();
      if (my !== seq) return;
    }
    const norm = D.norm, M = D.M, res = [];
    for (let i = D.N - 1; i >= 0; i--) {
      const m = M[i];
      if (state.sender >= 0 && m[D.S] !== state.sender) continue;
      if (state.type !== "all" && !typeOk(i)) continue;
      if (tokens.length) {
        const t = norm[i];
        if (!t) continue;
        let ok = true;
        for (let j = 0; j < tokens.length; j++) if (t.indexOf(tokens[j]) < 0) { ok = false; break; }
        if (!ok) continue;
      } else if (state.type === "all" && m[D.K] === 11) continue;
      res.push(i);
    }
    if (my !== seq) return;
    results = res;
    re = UC.looseRegex(tokens);
    if (state.year && !res.some((i) => UC.D(M[i][D.T]).getUTCFullYear() === state.year)) state.year = 0;
    show(true);
  }
  function remember() {
    const q = input.value.trim();
    if (q.length < 2) return;
    const rec = UC.prefs.get("recent", []).filter((x) => x !== q);
    rec.unshift(q);
    UC.prefs.set("recent", rec.slice(0, 8));
  }

  function init() {
    D = UC.data;
    input = UC.$("#q");
    clearBtn = UC.$("#q-clear");
    filters = UC.$("#search-filters");
    out = UC.$("#search-results");
    renderFilters();
    emptyState();
    const deb = UC.debounce(run, 220);
    input.addEventListener("input", deb);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { input.blur(); remember(); run(); } });
    input.addEventListener("change", remember);
    clearBtn.onclick = () => { input.value = ""; run(); input.focus(); };
    out.addEventListener("touchstart", () => input.blur(), { passive: true });
  }
  function focus() { setTimeout(() => { if (!input.value) input.focus(); }, 60); D.ensureNorm(); }
  function searchFor(q) { input.value = q; run(); }

  UC.search = { init, focus, searchFor };
})(window.UC);
