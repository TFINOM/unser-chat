/* Unser Chat – Rückblick / Statistiken (wird auf dem Gerät berechnet) */
(function (UC) {
  "use strict";
  const { el, icon } = UC;
  let D, body, yearsBar, year = 0;
  const cache = new Map();
  const STOP = new Set("aber alle allem allen aller alles also als am an andere anderen auch auf aus bei beim bin bis bist bitte da dabei dadurch dafür dagegen daher damit dann dar darauf darf darum das dass dein deine deinen deiner dem den denn der des dich die dies diese diesem diesen dieser dieses dir doch dort du durch ein eine einem einen einer eines einfach er es etwas euch euer eure für gar gegen gehen geht gerade gern gerne ges gibt ging gut hab habe haben hast hat hatte hätte heute hier hin hinter ich ihm ihn ihr ihre im immer in ins ist ja jetzt kann kannst kein keine kommt können könnte mal man mehr mein meine meinen meiner mich mir mit muss musst nach nicht nichts noch nun nur ob oder ohne schon sehr sein seine sich sie sind so soll sollen sondern sonst über um und uns unser unsere unter viel vom von vor war waren warst was weil weiß wenn wer werde werden wie wieder wir wird wirst wo wohl würde zu zum zur zwar the and you that this for are ich's ok okay oh ah ach naja na ne nee jo joa haha hahaha xd lol mhm hm hmm achso eig eigentlich vllt dann denn bzw also schon mega echt grad gleich wann warum wieso weshalb wurde worden sein seid sei selbst sowie unsere euren ihnen ihrer ihres jemand jeder jede jedes kein keinen keiner etwa eben ganz heute morgen abend ganz okay".split(/\s+/));

  function compute(y) {
    const M = D.M;
    let a = 0, b = D.N;
    if (y) { a = D.idxAtOrAfter(UC.tsOf(y, 1, 1)); b = D.idxAtOrAfter(UC.tsOf(y + 1, 1, 1)); }
    const st = {
      n: b - a, from: a, to: b, by: [0, 0], kinds: {}, perYear: new Map(), perMonth: new Array(12).fill(0),
      perHour: new Array(24).fill(0), perWd: new Array(7).fill(0), emo: [new Map(), new Map()], words: new Map(),
      love: [0, 0], morning: [0, 0], night: [0, 0], days: 0, streak: 0, streakEnd: 0, busiest: -1, busiestN: 0,
      longest: -1, longestLen: 0, resp: [[], []], starter: [0, 0], voiceSec: 0,
    };
    const phrases = (D.cfg.lovePhrases || []).map((p) => p.toLowerCase());
    let lastDay = null, run = 0, prev = null;
    const wordRe = /[\p{L}][\p{L}\p{M}'’-]*/gu;
    for (let i = a; i < b; i++) {
      const m = M[i], s = m[D.S], k = m[D.K], t = m[D.T];
      const day = Math.floor(t / 86400);
      if (day !== lastDay) {
        st.days++;
        run = lastDay !== null && day === lastDay + 1 ? run + 1 : 1;
        if (run > st.streak) { st.streak = run; st.streakEnd = day; }
        if (s === 0 || s === 1) st.starter[s]++;
        lastDay = day;
        const info = D.dayInfo(day);
        if (info && info.count > st.busiestN) { st.busiestN = info.count; st.busiest = day; }
      }
      if (s === 2 || k === 11) { prev = null; continue; }
      st.by[s]++;
      st.kinds[k] = (st.kinds[k] || 0) + 1;
      const d = UC.D(t);
      const yy = d.getUTCFullYear();
      st.perYear.set(yy, (st.perYear.get(yy) || 0) + 1);
      st.perMonth[d.getUTCMonth()]++;
      st.perHour[d.getUTCHours()]++;
      st.perWd[(d.getUTCDay() + 6) % 7]++;
      if (prev && prev[D.S] !== s && t - prev[D.T] < 6 * 3600) st.resp[s].push(t - prev[D.T]);
      prev = m;
      if (k === 3) { const inf = UC.media.info(i); if (inf && inf.d) st.voiceSec += inf.d; }
      if (k !== 0) continue;
      const x = m[D.X] || "";
      if (x.length > st.longestLen) { st.longestLen = x.length; st.longest = i; }
      const low = x.toLowerCase();
      for (const p of phrases) if (low.indexOf(p) >= 0) { st.love[s]++; break; }
      if (/guten morgen|^morgen\b|^moin/.test(low)) st.morning[s]++;
      if (/gute nacht|schlaf gut|^nacht\b/.test(low)) st.night[s]++;
      for (const e of UC.emojis(x)) st.emo[s].set(e, (st.emo[s].get(e) || 0) + 1);
      const ws = low.match(wordRe);
      if (ws) for (const w0 of ws) {
        const w = w0.replace(/['’-]+$/, "");
        if (w.length < 3 || STOP.has(w) || w.indexOf("http") === 0) continue;
        st.words.set(w, (st.words.get(w) || 0) + 1);
      }
    }
    return st;
  }

  const median = (arr) => { if (!arr.length) return 0; const s = arr.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const top = (map, n) => Array.from(map.entries()).sort((x, y) => y[1] - x[1]).slice(0, n);
  function fmtSpan(sec) {
    if (sec < 90) return Math.round(sec) + " Sek.";
    if (sec < 5400) return Math.round(sec / 60) + " Min.";
    return (sec / 3600).toFixed(1).replace(".", ",") + " Std.";
  }

  // Säulendiagramm: eine Reihe, Wert beim Antippen, größter Wert beschriftet
  function bars(values, labels, tipFmt, color) {
    const max = Math.max(1, ...values);
    const maxI = values.indexOf(Math.max(...values));
    const wrap = el("div");
    const area = el("div", { class: "bars", role: "img", "aria-label": labels.map((l, i) => l + ": " + values[i]).join(", ") });
    const tip = el("div", { class: "bars-tip", text: "Tippe auf eine Säule für den Wert." });
    values.forEach((v, i) => {
      const col = el("button", { class: "b", "aria-label": tipFmt(i, v) });
      const h = Math.round(120 * v / max);
      col.appendChild(el("i", { style: { height: (v ? Math.max(2, h) : 0) + "px", background: color || "var(--accent)" } }));
      if (i === maxI && v) col.appendChild(el("span", { class: "val", text: UC.fmtNum(v) }));
      col.onclick = () => {
        UC.$$(".b", area).forEach((x) => x.classList.toggle("sel", x === col));
        tip.textContent = tipFmt(i, v);
      };
      area.appendChild(col);
    });
    const xs = el("div", { class: "bars-x" });
    labels.forEach((l) => xs.appendChild(el("span", { text: l })));
    wrap.append(area, xs, tip);
    return wrap;
  }
  function card(title, ...kids) { return el("div", { class: "card" }, el("h3", { text: title }), ...kids); }
  function tile(v, l) { return el("div", { class: "tile" }, el("div", { class: "v", text: v }), el("div", { class: "l", text: l })); }
  function rec(ico, title, sub, onclick) {
    const b = el(onclick ? "button" : "div", { class: "rec" }, el("span", { class: "ico", text: ico }),
      el("span", { class: "grow" }, title, el("small", { text: sub })), onclick ? icon("i-right", "chev") : null);
    if (onclick) b.onclick = onclick;
    return b;
  }
  function whoGrid(a, b, fmt) {
    return el("div", { class: "who" },
      el("div", null, el("div", { class: "n" }, el("i", { style: { background: "var(--her)" } }), D.name(0)), el("div", { class: "v", text: fmt(a) })),
      el("div", null, el("div", { class: "n" }, el("i", { style: { background: "var(--him)" } }), D.name(1)), el("div", { class: "v", text: fmt(b) })));
  }

  function render(st) {
    body.replaceChildren();
    const span = year ? "in " + year : "insgesamt";
    body.appendChild(el("div", { class: "hero" }, el("div", { class: "num", text: UC.fmtNum(st.by[0] + st.by[1]) }), el("div", { class: "lbl", text: "Nachrichten " + span })));
    const span0 = year ? Math.max(UC.tsOf(year, 1, 1), D.firstTs) : D.firstTs;
    const span1 = year ? Math.min(UC.tsOf(year + 1, 1, 1) - 1, D.lastTs) : D.lastTs;
    const totalDays = Math.max(1, UC.dayNum(span1) - UC.dayNum(span0) + 1);
    const k = st.kinds;
    body.appendChild(el("div", { class: "tiles" },
      tile(UC.fmtNum(st.days), "Tage mit Nachrichten (von " + UC.fmtNum(totalDays) + ")"),
      tile(UC.fmtNum(Math.round((st.by[0] + st.by[1]) / Math.max(1, totalDays))), "Nachrichten pro Tag im Schnitt"),
      tile(UC.fmtNum((k[1] || 0) + (k[2] || 0)), "Fotos & Videos"),
      tile(UC.fmtNum(k[3] || 0), "Sprachnachrichten" + (st.voiceSec ? " (" + Math.round(st.voiceSec / 60) + " Min.)" : "")),
      tile(UC.fmtNum(st.streak), "Tage am Stück geschrieben (Rekord)"),
      tile(UC.fmtNum(k[9] || 0), "Anrufe im Chat")));

    // Wer schreibt mehr
    const tot = Math.max(1, st.by[0] + st.by[1]);
    const p0 = Math.round(100 * st.by[0] / tot);
    body.appendChild(card("Wer schreibt mehr?",
      el("div", { class: "split", role: "img", "aria-label": D.name(0) + " " + p0 + " %, " + D.name(1) + " " + (100 - p0) + " %" },
        el("i", { style: { width: p0 + "%", background: "var(--her)" } }), el("i", { style: { width: (100 - p0) + "%", background: "var(--him)" } })),
      el("div", { class: "legend" },
        el("span", null, el("i", { style: { background: "var(--her)" } }), D.name(0) + ": " + UC.fmtNum(st.by[0]) + " (" + p0 + " %)"),
        el("span", null, el("i", { style: { background: "var(--him)" } }), D.name(1) + ": " + UC.fmtNum(st.by[1]) + " (" + (100 - p0) + " %)"))));

    if (!year) {
      const ys = D.years;
      body.appendChild(card("Nachrichten pro Jahr", bars(ys.map((y) => st.perYear.get(y) || 0), ys.map((y) => "’" + String(y).slice(2)),
        (i, v) => ys[i] + ": " + UC.fmtNum(v) + " Nachrichten")));
    } else {
      body.appendChild(card("Nachrichten pro Monat", bars(st.perMonth, ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
        (i, v) => UC.MON[i] + " " + year + ": " + UC.fmtNum(v) + " Nachrichten")));
    }
    const hMax = st.perHour.indexOf(Math.max(...st.perHour));
    const late = st.perHour.slice(0, 5).reduce((s, v) => s + v, 0) + st.perHour[23];
    body.appendChild(card("Tageszeit",
      el("div", { class: "sub", text: "Am meisten schreibt ihr um " + hMax + " Uhr. " + Math.round(100 * late / tot) + " % eurer Nachrichten entstehen zwischen 23 und 5 Uhr." }),
      bars(st.perHour, st.perHour.map((_, h) => (h % 6 === 0 ? String(h) : "")), (i, v) => i + ":00–" + i + ":59 Uhr: " + UC.fmtNum(v))));
    body.appendChild(card("Wochentag", bars(st.perWd, ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
      (i, v) => ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"][i] + ": " + UC.fmtNum(v))));

    // Emojis
    const emoRow = (s) => {
      const r = el("div", { class: "emoji-row" });
      for (const [e, n] of top(st.emo[s], 6)) r.appendChild(el("span", null, el("b", { text: e }), UC.fmtNum(n)));
      if (!r.childNodes.length) r.appendChild(el("span", { class: "muted", text: "–" }));
      return r;
    };
    body.appendChild(card("Lieblings-Emojis",
      el("div", { class: "legend", style: { marginTop: "8px" } }, el("span", null, el("i", { style: { background: "var(--her)" } }), D.name(0))), emoRow(0),
      el("div", { class: "legend", style: { marginTop: "12px" } }, el("span", null, el("i", { style: { background: "var(--him)" } }), D.name(1))), emoRow(1)));

    // Wörter
    const tw = top(st.words, 30);
    if (tw.length) {
      const maxW = tw[0][1];
      const w = el("div", { class: "words" });
      for (const [word, n] of tw) {
        const size = 13 + Math.round(13 * Math.sqrt(n / maxW));
        const b = el("button", { style: { fontSize: size + "px" } }, el("span", { text: word }), el("em", { text: UC.fmtNum(n) }));
        b.onclick = () => UC.app.searchFor(word);
        w.appendChild(b);
      }
      body.appendChild(card("Eure Wörter", el("div", { class: "sub", text: "Tippe auf ein Wort, um danach zu suchen." }), w));
    }

    // Liebe in Zahlen
    const phrases = (D.cfg.lovePhrases || []);
    if (phrases.length) {
      body.appendChild(card("Liebe in Zahlen",
        el("div", { class: "sub", text: "Nachrichten mit „" + phrases.join("“, „") + "“" }),
        whoGrid(st.love[0], st.love[1], UC.fmtNum),
        el("div", { class: "sub", style: { marginTop: "12px" }, text: "„Guten Morgen“ & „Gute Nacht“" }),
        whoGrid(st.morning[0] + st.night[0], st.morning[1] + st.night[1], UC.fmtNum)));
    }

    // Rekorde
    const recs = el("div");
    if (st.busiest >= 0) recs.appendChild(rec("🔥", "Aktivster Tag", UC.fmtDate(st.busiest * 86400, "wmed") + " · " + UC.fmtNum(st.busiestN) + " Nachrichten", () => UC.calendar.showDay(st.busiest)));
    if (st.longest >= 0) recs.appendChild(rec("📜", "Längste Nachricht", D.name(D.M[st.longest][D.S]) + " · " + UC.fmtNum(st.longestLen) + " Zeichen · " + UC.fmtDate(D.M[st.longest][D.T], "med"), () => UC.app.openInChat(st.longest, { flash: true })));
    if (st.streak > 1) recs.appendChild(rec("📆", "Längste Serie", UC.fmtNum(st.streak) + " Tage ohne Pause, bis " + UC.fmtDate(st.streakEnd * 86400, "med"), null));
    const r0 = median(st.resp[0]), r1 = median(st.resp[1]);
    if (r0 || r1) recs.appendChild(rec("⚡", "Typische Antwortzeit", D.name(0) + ": " + fmtSpan(r0) + " · " + D.name(1) + ": " + fmtSpan(r1), null));
    recs.appendChild(rec("🌅", "Wer schreibt zuerst am Tag?", D.name(0) + ": " + UC.fmtNum(st.starter[0]) + " Tage · " + D.name(1) + ": " + UC.fmtNum(st.starter[1]) + " Tage", null));
    body.appendChild(card("Rekorde", recs));
    body.appendChild(el("div", { style: { height: "30px" } }));
  }

  async function show() {
    const key = year || 0;
    let st = cache.get(key);
    if (!st) {
      body.replaceChildren(el("div", { class: "empty", text: "Wird berechnet …" }));
      await UC.sleep(30);
      st = compute(year);
      cache.set(key, st);
    }
    render(st);
  }
  function renderYears() {
    yearsBar.replaceChildren();
    const mk = (y, l) => {
      const b = el("button", { class: "chip" + (y === year ? " on" : ""), text: l });
      b.onclick = () => { year = y; renderYears(); body.scrollTop = 0; show(); };
      return b;
    };
    yearsBar.appendChild(mk(0, "Alle Jahre"));
    for (const y of D.years.slice().reverse()) yearsBar.appendChild(mk(y, String(y)));
  }
  let inited = false;
  function init() { D = UC.data; body = UC.$("#stats-body"); yearsBar = UC.$("#stats-years"); renderYears(); }
  function onShow() { if (!inited) { inited = true; show(); } }
  UC.stats = { init, onShow };
})(window.UC);
