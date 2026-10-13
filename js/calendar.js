/* Unser Chat – Kalender mit Aktivität pro Tag, besondere Tage, Sprung zu Datum */
(function (UC) {
  "use strict";
  const { el } = UC;
  let D, body, year = 0, levels = null;

  function computeLevels() {
    const c = Array.from(D.dayCount).sort((a, b) => a - b);
    const q = (f) => c.length ? c[Math.min(c.length - 1, Math.floor(f * c.length))] : 0;
    levels = [q(0.4), q(0.7), q(0.9)];
  }
  function level(n) {
    if (!n) return 0;
    if (n <= levels[0]) return 1;
    if (n <= levels[1]) return 2;
    if (n <= levels[2]) return 3;
    return 4;
  }
  function specialMap() {
    const map = new Map(); // "MM-DD" oder "YYYY-MM-DD" -> eintrag
    for (const s of D.cfg.specialDays || []) if (s && s.datum) map.set(s.datum, s);
    return map;
  }
  function specialFor(y, m, d) {
    const sm = specialMap();
    const mm = UC.pad(m), dd = UC.pad(d);
    return sm.get(y + "-" + mm + "-" + dd) || sm.get(mm + "-" + dd) || null;
  }

  // ---------- Tagesansicht ----------
  function showDay(day) {
    const ts = day * 86400;
    const idx = D.msgsOfDay(day);
    const content = el("div", { style: { padding: "0 12px" } });
    const [y, m, d] = UC.ymd(ts);
    const sp = specialFor(y, m, d);
    const sub = el("div", { class: "muted small", style: { padding: "0 4px 6px" } });
    if (idx.length) {
      const me = idx.filter((i) => D.M[i][D.S] === 0).length;
      sub.textContent = UC.plural(idx.length, "Nachricht", "Nachrichten") + " · " + D.name(0) + " " + me + ", " + D.name(1) + " " + (idx.length - me) +
        " · " + UC.fmtTime(D.M[idx[0]][D.T]) + "–" + UC.fmtTime(D.M[idx[idx.length - 1]][D.T]);
    } else sub.textContent = "An diesem Tag habt ihr nicht geschrieben.";
    if (sp) content.appendChild(el("div", { class: "chip on", style: { display: "inline-block", margin: "0 4px 6px" }, text: (sp.emoji || "⭐") + " " + sp.titel }));
    content.appendChild(sub);
    const open = el("button", { class: "btn block", text: "Im Chat öffnen" });
    if (idx.length) {
      const mini = el("div", { class: "mini" });
      const shownIdx = idx.slice(0, 80);
      content.append(open, mini);
      const s = UC.sheet({ title: UC.fmtDate(ts), body: content });
      mini.appendChild(UC.chat.miniRows(shownIdx, s.body));
      if (idx.length > 80) mini.appendChild(el("div", { class: "muted small", style: { textAlign: "center", padding: "8px" }, text: "… und " + (idx.length - 80) + " weitere" }));
      mini.addEventListener("click", (e) => {
        if (e.target.closest("a,button")) return;
        const b = e.target.closest("[data-i]");
        if (b) { s.close(); UC.app.openInChat(+b.dataset.i, { flash: true }); }
      });
      open.onclick = () => { s.close(); UC.app.openInChat(idx[0], { align: "top" }); };
    } else {
      // nächster Tag mit Nachrichten
      const nextI = D.idxAtOrAfter(ts);
      if (nextI < D.N) {
        open.textContent = "Nächster Tag mit Nachrichten: " + UC.fmtDate(D.M[nextI][D.T], "med");
        content.appendChild(open);
      }
      const s = UC.sheet({ title: UC.fmtDate(ts), body: content });
      open.onclick = () => { s.close(); UC.app.openInChat(nextI, { align: "top" }); };
    }
  }

  // ---------- besondere Tage ----------
  function specialSheet(sp) {
    const body = el("div");
    const s = UC.sheet({ title: (sp.emoji || "⭐") + " " + sp.titel, body });
    const [mm, dd] = sp.datum.split("-").map(Number);
    for (let y = D.years[D.years.length - 1]; y >= D.years[0]; y--) {
      const ts = UC.tsOf(y, mm, dd);
      const day = Math.floor(ts / 86400);
      const info = D.dayInfo(day);
      const b = el("button", { class: "opt" },
        el("span", null, el("b", { text: String(y) }), el("span", { class: "muted", text: "  " + UC.WD[UC.D(ts).getUTCDay()] })),
        el("span", { class: "r", text: info ? UC.plural(info.count, "Nachricht", "Nachrichten") : "–" }));
      b.onclick = () => { s.close(); showDay(day); };
      if (ts > D.lastTs + 86400 || ts < D.firstTs - 86400) b.disabled = true, b.style.opacity = ".4";
      body.appendChild(b);
    }
  }
  function specials() {
    const wrap = el("div", { class: "special" });
    const first = el("button", { class: "chip", text: "✨ Erste Nachricht" });
    first.onclick = () => UC.app.openInChat(0, { align: "top" });
    wrap.appendChild(first);
    for (const sp of D.cfg.specialDays || []) {
      if (!sp || !sp.datum) continue;
      const b = el("button", { class: "chip", text: (sp.emoji || "⭐") + " " + sp.titel });
      const parts = sp.datum.split("-");
      if (parts.length === 2) b.onclick = () => specialSheet(sp);
      else b.onclick = () => showDay(Math.floor(UC.tsOf(+parts[0], +parts[1], +parts[2]) / 86400));
      wrap.appendChild(b);
    }
    return wrap;
  }

  // ---------- Jahreskalender ----------
  function monthEl(y, m) {
    const first = UC.tsOf(y, m + 1, 1);
    const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const startWd = (UC.D(first).getUTCDay() + 6) % 7; // Montag = 0
    const today = UC.dayNum(UC.nowTs());
    let total = 0;
    const grid = el("div", { class: "mgrid" });
    for (const w of ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]) grid.appendChild(el("div", { class: "wd", text: w }));
    for (let i = 0; i < startWd; i++) grid.appendChild(el("div", { class: "d empty" }));
    for (let d = 1; d <= daysIn; d++) {
      const day = Math.floor(first / 86400) + d - 1;
      const info = D.dayInfo(day);
      const n = info ? info.count : 0;
      total += n;
      const cell = el("button", { class: "d l" + level(n), text: String(d), "aria-label": d + ". " + UC.MON[m] + ": " + n + " Nachrichten" });
      if (specialFor(y, m + 1, d)) cell.classList.add("special");
      if (day === today) cell.classList.add("today");
      cell.dataset.day = day;
      grid.appendChild(cell);
    }
    return el("div", { class: "month" }, el("h4", null, UC.MON[m], el("span", { text: total ? UC.fmtNum(total) : "" })), grid);
  }
  function renderYear() {
    const months = el("div", { class: "months" });
    for (let m = 0; m < 12; m++) months.appendChild(monthEl(year, m));
    months.addEventListener("click", (e) => {
      const c = e.target.closest("[data-day]");
      if (c) showDay(+c.dataset.day);
    });
    return months;
  }
  function render() {
    body.replaceChildren();
    const inp = el("input", { type: "date", "aria-label": "Datum wählen" });
    const fmt = (ts) => { const [y, m, d] = UC.ymd(ts); return y + "-" + UC.pad(m) + "-" + UC.pad(d); };
    inp.min = fmt(D.firstTs); inp.max = fmt(D.lastTs);
    inp.value = fmt(D.lastTs);
    const go = el("button", { class: "btn", text: "Springen" });
    const doGo = () => {
      if (!inp.value) return;
      const [y, m, d] = inp.value.split("-").map(Number);
      showDay(Math.floor(UC.tsOf(y, m, d) / 86400));
    };
    go.onclick = doGo;
    inp.addEventListener("change", doGo);
    body.append(el("div", { class: "section-title", text: "Zu einem Datum springen" }), el("div", { class: "goto" }, inp, go));
    body.append(el("div", { class: "section-title", text: "Besondere Tage" }), specials());
    const yrs = el("div", { class: "chips" });
    for (const y of D.years.slice().reverse()) {
      const b = el("button", { class: "chip" + (y === year ? " on" : ""), text: String(y) });
      b.onclick = () => { year = y; render(); };
      yrs.appendChild(b);
    }
    const legend = el("div", { class: "legend-heat" }, "weniger ",
      el("i", { style: { background: "var(--heat-0)" } }), el("i", { style: { background: "var(--heat-1)" } }),
      el("i", { style: { background: "var(--heat-2)" } }), el("i", { style: { background: "var(--heat-3)" } }),
      el("i", { style: { background: "var(--heat-4)" } }), " mehr Nachrichten");
    body.append(el("div", { class: "section-title", text: "Jahr" }), yrs, legend, renderYear());
  }
  function init() {
    D = UC.data;
    body = UC.$("#cal-body");
    year = D.years[D.years.length - 1];
    computeLevels();
    render();
  }
  UC.calendar = { init, showDay, specialFor };
})(window.UC);
