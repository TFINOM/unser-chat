/* Unser Chat – Hilfsfunktionen */
window.UC = window.UC || {};
(function (UC) {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class") n.className = v;
        else if (k === "html") n.innerHTML = v;
        else if (k === "text") n.textContent = v;
        else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
        else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
        else if (k === "dataset") Object.assign(n.dataset, v);
        else n.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    }
    return n;
  }
  function icon(id, cls) {
    const ns = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    if (cls) s.setAttribute("class", cls);
    const u = document.createElementNS(ns, "use");
    u.setAttribute("href", "#" + id);
    s.appendChild(u);
    return s;
  }
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);

  // ---- Datum (Zeitstempel = Ortszeit, als UTC gespeichert) ----
  const WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const WD_S = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MON = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const MON_S = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
  const D = (ts) => new Date(ts * 1000);
  const pad = (n) => (n < 10 ? "0" : "") + n;
  const dayNum = (ts) => Math.floor(ts / 86400);
  function nowTs() {
    const n = new Date();
    return Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds()) / 1000);
  }
  function ymd(ts) { const d = D(ts); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; }
  function tsOf(y, m, d, h) { return Math.floor(Date.UTC(y, m - 1, d, h || 0) / 1000); }
  function fmtTime(ts) { const d = D(ts); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); }
  function fmtDate(ts, style) {
    const d = D(ts), y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate(), w = d.getUTCDay();
    switch (style) {
      case "short": return pad(dd) + "." + pad(m + 1) + "." + y;
      case "med": return dd + ". " + MON_S[m] + " " + y;
      case "wmed": return WD_S[w] + ", " + dd + ". " + MON_S[m] + " " + y;
      case "month": return MON[m] + " " + y;
      case "dm": return dd + ". " + MON[m];
      default: return WD[w] + ", " + dd + ". " + MON[m] + " " + y;
    }
  }
  function dayLabel(ts) {
    const today = dayNum(nowTs()), d = dayNum(ts);
    if (d === today) return "Heute";
    if (d === today - 1) return "Gestern";
    return fmtDate(ts);
  }
  // Datums-Chip wie in WhatsApp: Heute / Gestern / Wochentag / "Mo. 3. Aug." / "16. Okt. 2025"
  const MON_WA = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
  const WD_WA = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
  function dayChip(ts) {
    const nowT = nowTs(), today = dayNum(nowT), d = dayNum(ts);
    if (d === today) return "Heute";
    if (d === today - 1) return "Gestern";
    const dt = D(ts);
    if (d > today - 7 && d < today) return WD[dt.getUTCDay()];
    if (dt.getUTCFullYear() === D(nowT).getUTCFullYear()) return WD_WA[dt.getUTCDay()] + " " + dt.getUTCDate() + ". " + MON_WA[dt.getUTCMonth()];
    return dt.getUTCDate() + ". " + MON_WA[dt.getUTCMonth()] + " " + dt.getUTCFullYear();
  }
  const nf = new Intl.NumberFormat("de-DE");
  const fmtNum = (n) => nf.format(n);
  function fmtDur(sec) {
    sec = Math.round(sec || 0);
    return Math.floor(sec / 60) + ":" + pad(sec % 60);
  }
  function plural(n, one, many) { return fmtNum(n) + " " + (n === 1 ? one : many); }
  function yearsAgo(n) { return n === 1 ? "Vor einem Jahr" : "Vor " + n + " Jahren"; }

  // ---- Text ----
  function normalize(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
  }
  // Suchbegriff im (normalisierten) Text finden.
  // Normal: nur am Wortanfang („ich“ findet „ich“, aber nicht „dich“). exact (in Anführungszeichen): ganze Wörter.
  const WORDCH = /[\p{L}\p{N}]/u;
  function matchToken(text, tok) {
    const t = tok.t;
    if (!t) return true;
    const needStart = WORDCH.test(t[0]), needEnd = tok.exact && WORDCH.test(t[t.length - 1]);
    let i = text.indexOf(t);
    while (i >= 0) {
      const e = i + t.length;
      if ((!needStart || i === 0 || !WORDCH.test(text[i - 1])) && (!needEnd || e >= text.length || !WORDCH.test(text[e]))) return true;
      i = text.indexOf(t, i + 1);
    }
    return false;
  }
  const LOOSE = { a: "aàáâäãåæ", e: "eèéêë", i: "iìíîï", o: "oòóôöõøœ", u: "uùúûü", c: "cç", n: "nñ", y: "yýÿ" };
  function looseRegex(tokens) {
    const parts = tokens.filter((x) => x && x.t).map((tok) => {
      const t = tok.t;
      let out = "";
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (ch === "s" && t[i + 1] === "s") { out += "(?:ss|ß)"; i++; continue; }
        const set = LOOSE[ch];
        out += set ? "[" + set + set.toUpperCase() + "]" : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      return (WORDCH.test(t[0]) ? "(?<![\\p{L}\\p{N}])" : "") + out +
        (tok.exact && WORDCH.test(t[t.length - 1]) ? "(?![\\p{L}\\p{N}])" : "");
    });
    if (!parts.length) return null;
    parts.sort((a, b) => b.length - a.length);
    try { return new RegExp("(" + parts.join("|") + ")", "giu"); } catch (e) { return null; }
  }
  // Suchanfrage -> [{t: normalisierter Begriff, exact: in Anführungszeichen?}]
  function parseQuery(q) {
    const tokens = [];
    const re = /"([^"]+)"|„([^“”"]+)[“”"]|(\S+)/g;
    let m;
    while ((m = re.exec(q))) {
      const t = normalize((m[1] || m[2] || m[3]).trim());
      if (t) tokens.push({ t, exact: !m[3] });
    }
    return tokens;
  }
  const URL_RE = /\b(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
  function richText(text, hl) {
    // escaped + Links + Markierung
    let s = esc(text);
    s = s.replace(URL_RE, (u) => '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>");
    s = s.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|[.,!?])/g, "$1<b>$2</b>");
    s = s.replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,!?])/g, "$1<i>$2</i>");
    if (hl) s = highlightHtml(s, hl);
    return s;
  }
  function highlightHtml(html, re) {
    // nur Textteile markieren, nicht Tags
    return html.split(/(<[^>]+>)/).map((part) => (part.startsWith("<") ? part : part.replace(re, "<mark>$1</mark>"))).join("");
  }
  let seg = null;
  try { seg = new Intl.Segmenter("de", { granularity: "grapheme" }); } catch (e) { seg = null; }
  const PICT = /\p{Extended_Pictographic}/u;
  function graphemes(s) {
    if (seg) return Array.from(seg.segment(s), (x) => x.segment);
    return Array.from(s);
  }
  function emojiOnly(s) {
    if (!s || s.length > 40) return 0;
    const t = s.replace(/\s/g, "");
    if (!t) return 0;
    const g = graphemes(t);
    if (g.length > 3) return 0;
    for (const x of g) if (!PICT.test(x)) return 0;
    return g.length;
  }
  function emojis(s) {
    const out = [];
    if (!s || !PICT.test(s)) return out;
    for (const x of graphemes(s)) if (PICT.test(x)) out.push(x.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, ""));
    return out;
  }

  // ---- Einstellungen (lokal / native Brücke) ----
  const NATIVE = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ucstore;
  const nativeStore = window.__NATIVE_STORE__ || {};
  const prefs = {
    get(key, def) {
      try {
        if (NATIVE && key in nativeStore) return JSON.parse(nativeStore[key]);
        const v = localStorage.getItem("uc." + key);
        return v == null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(key, val) {
      const s = JSON.stringify(val);
      try { localStorage.setItem("uc." + key, s); } catch (e) { /* egal */ }
      if (NATIVE) { nativeStore[key] = s; try { NATIVE.postMessage({ key: key, value: s }); } catch (e) { /* egal */ } }
    },
  };

  // ---- UI ----
  let toastT = 0;
  function toast(msg, ms) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), ms || 2200);
  }
  function sheet(opts) {
    const root = $("#overlays");
    const bg = el("div", { class: "sheet-bg" });
    const closeBtn = el("button", { class: "icon-btn", "aria-label": "Schließen" }, icon("i-close"));
    const body = el("div", { class: "sb" });
    const sh = el("div", { class: "sheet", role: "dialog" },
      el("div", { class: "grab" }),
      el("div", { class: "sh" }, el("h2", { text: opts.title || "" }), closeBtn),
      body);
    if (opts.body) body.appendChild(opts.body);
    root.appendChild(bg); root.appendChild(sh);
    requestAnimationFrame(() => { bg.classList.add("show"); sh.classList.add("show"); });
    let closed = false;
    function close() {
      if (closed) return; closed = true;
      bg.classList.remove("show"); sh.classList.remove("show");
      setTimeout(() => { bg.remove(); sh.remove(); }, 320);
      if (opts.onClose) opts.onClose();
    }
    // Erst eine neue Berührung zählt: Das Loslassen nach langem Drücken erzeugt sonst einen
    // „Geister-Klick“, der das Menü sofort schließt oder eine Option auslöst.
    let armed = false;
    const arm = () => { armed = true; };
    [bg, sh].forEach((n) => {
      n.addEventListener("touchstart", arm, { passive: true });
      n.addEventListener("pointerdown", arm);
      n.addEventListener("mousedown", arm);
      n.addEventListener("click", (e) => { if (!armed) { e.preventDefault(); e.stopPropagation(); } }, true);
    });
    bg.addEventListener("click", close);
    closeBtn.addEventListener("click", close);
    // nach unten wischen schließt
    let y0 = null;
    sh.addEventListener("touchstart", (e) => { if (body.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
    sh.addEventListener("touchmove", (e) => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) sh.style.transform = "translateY(" + dy + "px)";
    }, { passive: true });
    sh.addEventListener("touchend", (e) => {
      if (y0 == null) return;
      const dy = (e.changedTouches[0].clientY - y0);
      sh.style.transform = "";
      y0 = null;
      if (dy > 90) close();
    });
    return { close, body, el: sh };
  }
  function confirmSheet(title, text, okLabel, danger) {
    return new Promise((resolve) => {
      let done = false;
      const body = el("div", { style: { padding: "4px 16px 8px" } },
        el("p", { text: text, style: { marginTop: 0, color: "var(--text-2)", lineHeight: 1.45 } }));
      const ok = el("button", { class: "btn block", style: danger ? { background: "#e5484d" } : null, text: okLabel || "OK" });
      const cancel = el("button", { class: "btn ghost block", style: { marginTop: "8px" }, text: "Abbrechen" });
      body.append(ok, cancel);
      const s = sheet({ title, body, onClose: () => { if (!done) resolve(false); } });
      ok.onclick = () => { done = true; resolve(true); s.close(); };
      cancel.onclick = () => { s.close(); };
    });
  }

  // Doppeltippen / langes Drücken auf Elementen innerhalb eines Containers
  function gestures(container, selector, onDouble, onLong) {
    let lastTap = 0, lastEl = null, timer = 0, sx = 0, sy = 0, longFired = false;
    container.addEventListener("touchstart", (e) => {
      const t = e.target.closest(selector);
      if (!t) return;
      longFired = false;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      clearTimeout(timer);
      timer = setTimeout(() => { longFired = true; onLong && onLong(t, e); }, 520);
    }, { passive: true });
    container.addEventListener("touchmove", (e) => {
      if (Math.abs(e.touches[0].clientX - sx) > 8 || Math.abs(e.touches[0].clientY - sy) > 8) clearTimeout(timer);
    }, { passive: true });
    container.addEventListener("touchend", (e) => {
      clearTimeout(timer);
      if (longFired) { e.preventDefault(); return; }
      const t = e.target.closest(selector);
      if (!t || e.target.closest("a,button,video,.audio,.mbox")) return;
      const now = Date.now();
      if (now - lastTap < 320 && lastEl === t) { lastTap = 0; onDouble && onDouble(t, e); e.preventDefault(); }
      else { lastTap = now; lastEl = t; }
    });
    container.addEventListener("contextmenu", (e) => {
      const t = e.target.closest(selector);
      if (t && onLong) { e.preventDefault(); onLong(t, e); }
    });
    container.addEventListener("dblclick", (e) => {
      const t = e.target.closest(selector);
      if (t && onDouble && !("ontouchstart" in window)) onDouble(t, e);
    });
  }

  function debounce(fn, ms) {
    let t = 0;
    return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); };
  }
  function nextFrame() { return new Promise((r) => requestAnimationFrame(() => r())); }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  Object.assign(UC, {
    $, $$, el, icon, esc, D, pad, dayNum, nowTs, ymd, tsOf, fmtTime, fmtDate, dayLabel, dayChip, fmtNum, fmtDur, plural, yearsAgo,
    WD, WD_S, MON, MON_S, normalize, looseRegex, parseQuery, richText, highlightHtml, emojiOnly, emojis, graphemes,
    prefs, toast, sheet, confirmSheet, gestures, debounce, nextFrame, sleep, matchToken,
  });
})(window.UC);
