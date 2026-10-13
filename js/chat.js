/* Unser Chat – Chatverlauf (virtualisiert: nur ein Ausschnitt ist im DOM) */
(function (UC) {
  "use strict";
  const { el, icon } = UC;
  const CH = 90;          // Nachrichten pro Nachladeschritt
  const MAXR = 650;       // max. gleichzeitig gerenderte Nachrichten
  const EDGE = 1800;      // Pixel-Vorrat oben/unten
  let D, list, inner, pill, toBottom, scrub, banner;
  let lo = 0, hi = 0, raf = 0, idleT = 0, pillT = 0, scrubT = 0;
  let hlIndex = -1, hlRe = null;
  let lazyRoot;           // undefined = Chatliste
  const root = () => (lazyRoot === undefined ? list : lazyRoot);

  // ---------- Nachrichten bauen ----------
  const ticks = () => icon("i-ticks", "ticks");
  function metaEl(i) {
    const m = D.M[i];
    const meta = el("span", { class: "meta" });
    if (D.chatTag[m[D.C]] && D.chats.length > 1) meta.appendChild(el("span", { class: "chat-tag", text: D.chats[m[D.C]].name }));
    if (m[D.F] & 1) meta.appendChild(el("span", { class: "edited", text: "Bearbeitet" }));
    if (D.isFav(i)) meta.appendChild(icon("i-heart-fill", "fav"));
    meta.appendChild(document.createTextNode(UC.fmtTime(m[D.T])));
    if (m[D.S] === 0) meta.appendChild(ticks());
    return meta;
  }
  function placeholder(i) {
    const m = D.M[i], k = m[D.K];
    return el("div", { class: "placeholder" },
      el("span", { class: "ico", text: D.KIND_ICON[k] || "📎" }),
      el("span", { text: (D.KIND_LABEL[k] || "Anhang") + (k === 6 && m[D.X] ? ": " + m[D.X] : "") }));
  }
  function setText(node, text, i) {
    node.innerHTML = UC.richText(text, i === hlIndex ? hlRe : null);
    return node;
  }
  function callEl(i) {
    const m = D.M[i], text = m[D.X] || "";
    const parts = text.split(/\s*,\s*/);
    const title = parts[0] || "Anruf";
    const sub = parts.slice(1).join(" · ") || "";
    const missed = /verpasst|missed|abgelehnt|declined/i.test(title);
    const video = /video/i.test(title);
    const ci = el("span", { class: "ci" }, icon(video ? "i-video" : "i-phone"));
    if (!video) ci.appendChild(icon(m[D.S] === 0 ? "i-arrow-out" : "i-arrow-in", "arr"));
    return el("div", { class: "call" + (missed ? " missed" : "") }, ci,
      el("span", { class: "ct" }, el("b", { text: title }), sub ? el("span", { text: sub }) : null));
  }
  function bubble(i) {
    const m = D.M[i], k = m[D.K], text = m[D.X] || "";
    const b = el("div", { class: "bubble" });
    b.dataset.i = i;
    const meta = metaEl(i);
    const info = UC.media.info(i);
    if ((k === 1 || k === 2 || k === 5) && info && (info.th || info.f)) {
      b.classList.add("media");
      const w0 = info.w || 4, h0 = info.h || 3;
      const W = Math.round(Math.min(290, (window.innerWidth || 375) * 0.7));
      const H = Math.round(Math.max(130, Math.min(W * h0 / w0, 380)));
      const box = el("button", { class: "mbox", style: { width: W + "px", height: H + "px" }, "aria-label": D.KIND_LABEL[k] });
      const img = el("img", { alt: "", decoding: "async" });
      UC.media.lazy(img, info.th || info.f, root());
      box.appendChild(img);
      if (k !== 1) {
        box.appendChild(el("div", { class: "play" }, el("span", null, icon("i-play"))));
        box.appendChild(el("div", { class: "badge" }, k === 5 ? "GIF" : icon("i-video"), k === 5 ? null : (info.d ? UC.fmtDur(info.d) : "")));
      }
      box.addEventListener("click", (e) => { e.stopPropagation(); UC.media.view(i); });
      b.appendChild(box);
      if (text) { b.appendChild(setText(el("div", { class: "cap txt" }), text, i)); b.appendChild(meta); }
      else { meta.classList.add("over"); b.appendChild(meta); }
      return b;
    }
    switch (k) {
      case 0: {
        if (UC.emojiOnly(text)) b.classList.add("big-emoji");
        b.append(setText(el("span", { class: "txt" }), text, i), meta);
        break;
      }
      case 3:
        if (info && info.f) { b.classList.add("voice-b"); b.append(UC.media.voiceUi(i, ticks), meta); }
        else b.append(placeholder(i), meta);
        break;
      case 4:
        if (info && info.f) {
          b.classList.add("sticker-b");
          const img = el("img", { class: "sticker", alt: "Sticker" });
          UC.media.lazy(img, info.f, root());
          b.append(img, meta);
        } else b.append(placeholder(i), meta);
        break;
      case 10:
        b.append(el("span", { class: "note", text: "🚫 " + (m[D.S] === 0 ? "Du hast diese Nachricht gelöscht." : "Diese Nachricht wurde gelöscht.") }), meta);
        break;
      case 9:
        b.append(callEl(i), meta);
        break;
      case 8: {
        const url = (text.match(/https?:\/\/\S+/) || [])[0];
        const a = url ? el("a", { href: url, target: "_blank", rel: "noopener", text: "Auf Karte öffnen" }) : null;
        b.append(el("div", { class: "placeholder" }, el("span", { class: "ico" }, icon("i-pin")),
          el("span", null, text.toLowerCase().indexOf("live") >= 0 ? "Live-Standort" : "Standort", a ? el("br") : null, a)), meta);
        break;
      }
      case 7:
        b.append(el("div", { class: "placeholder" }, el("span", { class: "ico", text: "👤" }), el("span", { text: text || "Kontakt" })), meta);
        break;
      case 6:
        b.append(el("div", { class: "placeholder" }, el("span", { class: "ico" }, icon("i-doc")), el("span", { text: text || "Dokument" })), meta);
        break;
      case 12:
        b.append(setText(el("span", { class: "txt" }), "📊 " + text.replace(/^UMFRAGE:\s*/i, ""), i), meta);
        break;
      case 13:
        b.append(el("span", { class: "note", text: "① Einmalansicht" }), meta);
        break;
      default:
        if (k === 1 || k === 2 || k === 5) {
          b.append(placeholder(i));
          if (text) b.append(setText(el("div", { class: "txt", style: { marginTop: "4px" } }), text, i));
          b.append(meta);
        } else b.append(setText(el("span", { class: "txt" }), text, i), meta);
    }
    return b;
  }
  function sysChip(i) {
    const m = D.M[i];
    const c = el("div", { class: "sys-chip", text: m[D.X] || "" });
    c.dataset.i = i;
    if (/verschlüsselt|encrypted/i.test(m[D.X] || "")) c.textContent = "🔒 " + c.textContent;
    return c;
  }
  const isSys = (m) => m[D.S] === 2 || m[D.K] === 11;
  // gehören zwei aufeinanderfolgende Nachrichten zur selben Gruppe?
  function sameGroup(a, b) {
    if (!a || !b || isSys(a) || isSys(b)) return false;
    if (a[D.S] !== b[D.S]) return false;
    if (Math.floor(a[D.T] / 86400) !== Math.floor(b[D.T] / 86400)) return false;
    return b[D.T] - a[D.T] <= 3600;
  }
  function rowClass(m, pm, nm) {
    const sys = isSys(m);
    let c = "row " + (sys ? "sys" : m[D.S] === 0 ? "me" : "them");
    if (!sys && !sameGroup(pm, m)) c += " grp-start";
    if (!sys && !sameGroup(m, nm)) c += " grp-end";
    return c;
  }
  function rowFor(p) {
    const V = D.V, M = D.M;
    const i = V[p], m = M[i];
    const pm = p > 0 ? M[V[p - 1]] : null;
    const nm = p < V.length - 1 ? M[V[p + 1]] : null;
    const newDay = !pm || Math.floor(pm[D.T] / 86400) !== Math.floor(m[D.T] / 86400);
    const row = el("div", { class: rowClass(m, pm, nm) });
    row.dataset.p = p;
    if (newDay) row.appendChild(el("div", { class: "day", text: UC.dayChip(m[D.T]) }));
    row.appendChild(isSys(m) ? sysChip(i) : bubble(i));
    return row;
  }
  // kleine Chat-Vorschau (Erinnerungen, Tagesansicht)
  function miniRows(indices, scrollRoot) {
    const prev = lazyRoot;
    lazyRoot = scrollRoot || null;
    const f = document.createDocumentFragment();
    for (let j = 0; j < indices.length; j++) {
      const i = indices[j], m = D.M[i];
      const pm = j > 0 ? D.M[indices[j - 1]] : null;
      const nm = j < indices.length - 1 ? D.M[indices[j + 1]] : null;
      const row = el("div", { class: rowClass(m, pm, nm) });
      row.appendChild(isSys(m) ? sysChip(i) : bubble(i));
      f.appendChild(row);
    }
    lazyRoot = prev;
    return f;
  }
  function build(a, b) {
    const f = document.createDocumentFragment();
    for (let p = a; p < b; p++) f.appendChild(rowFor(p));
    return f;
  }

  // ---------- Scrollen / Nachladen ----------
  function append() {
    const b = Math.min(D.V.length, hi + CH);
    if (b <= hi) return;
    inner.appendChild(build(hi, b));
    hi = b;
  }
  function prepend() {
    if (lo <= 0) return;
    const a = Math.max(0, lo - CH);
    const h0 = list.scrollHeight, s0 = list.scrollTop;
    inner.insertBefore(build(a, lo), inner.firstChild);
    lo = a;
    list.scrollTop = s0 + (list.scrollHeight - h0);
    if (hi - lo > MAXR) trimBottom();
  }
  function trimTop() {
    let n = (hi - lo) - MAXR + CH;
    if (n <= 0) return;
    const s0 = list.scrollTop, h0 = list.scrollHeight;
    let removed = 0;
    while (removed < n) {
      const r = inner.firstElementChild;
      if (!r || r.offsetTop + r.offsetHeight > s0 - EDGE) break;
      r.remove(); removed++; lo++;
    }
    if (removed) {
      // der jetzt erste Eintrag braucht ggf. seinen Datums-Chip (bleibt korrekt, da aus V berechnet)
      list.scrollTop = s0 - (h0 - list.scrollHeight);
    }
  }
  function trimBottom() {
    let n = (hi - lo) - MAXR + CH;
    const limit = list.scrollTop + list.clientHeight + EDGE;
    while (n-- > 0) {
      const r = inner.lastElementChild;
      if (!r || r.offsetTop < limit) break;
      r.remove(); hi--;
    }
  }
  function tick() {
    raf = 0;
    const st = list.scrollTop, ch = list.clientHeight, sh = list.scrollHeight;
    if (sh - st - ch < EDGE && hi < D.V.length) append();
    if (st < 500 && lo > 0) prepend();
    updatePill();
    updateFab();
    updateScrub();
  }
  function onIdle() {
    if (list.scrollTop < EDGE && lo > 0) prepend();
    if (hi - lo > MAXR) trimTop();
    clearTimeout(pillT);
    pillT = setTimeout(() => pill.classList.remove("show"), 1100);
    clearTimeout(scrubT);
    scrubT = setTimeout(() => { if (!scrub.classList.contains("drag")) scrub.classList.remove("show"); }, 1600);
  }
  function onScroll() {
    if (!raf) raf = requestAnimationFrame(tick);
    clearTimeout(idleT);
    idleT = setTimeout(onIdle, 150);
  }
  function topRow() {
    const r = list.getBoundingClientRect();
    for (const dy of [34, 60, 90, 130]) {
      const n = document.elementFromPoint(r.left + r.width / 2, r.top + dy);
      const row = n && n.closest && n.closest(".row");
      if (row && row.parentNode === inner) return row;
    }
    return null;
  }
  function currentTs() {
    const row = topRow();
    if (!row) return null;
    return D.M[D.V[+row.dataset.p]][D.T];
  }
  function updatePill() {
    const ts = currentTs();
    if (ts == null) return;
    pill.textContent = UC.dayChip(ts);
    pill.classList.add("show");
    scrub.classList.add("show");
  }
  function updateFab() {
    const far = hi < D.V.length || list.scrollHeight - list.scrollTop - list.clientHeight > 1200;
    toBottom.classList.toggle("hide", !far);
  }

  // ---------- Springen ----------
  function scrollToRow(p, align) {
    const row = inner.querySelector('[data-p="' + p + '"]');
    if (!row) return;
    let y;
    if (align === "center") y = row.offsetTop - (list.clientHeight / 2 - row.offsetHeight / 2);
    else y = row.offsetTop - 64;
    list.scrollTop = Math.max(0, y);
  }
  function renderAround(p, align) {
    const n = D.V.length;
    if (!n) { inner.replaceChildren(el("div", { class: "empty", text: "Keine Nachrichten." })); lo = hi = 0; return; }
    p = Math.max(0, Math.min(n - 1, p));
    lo = Math.max(0, p - 40);
    hi = Math.min(n, p + 80);
    inner.replaceChildren(build(lo, hi));
    // genug Inhalt ober- und unterhalb sicherstellen
    scrollToRow(p, align);
    let guard = 0;
    while (list.scrollTop < EDGE && lo > 0 && guard++ < 8) prepend();
    guard = 0;
    while (list.scrollHeight - list.scrollTop - list.clientHeight < EDGE && hi < n && guard++ < 8) append();
    scrollToRow(p, align);
    updateFab();
  }
  function jumpToEnd() {
    const n = D.V.length;
    lo = Math.max(0, n - 120);
    hi = n;
    inner.replaceChildren(build(lo, hi));
    list.scrollTop = list.scrollHeight;
    let guard = 0;
    while (list.scrollTop < EDGE && lo > 0 && guard++ < 6) prepend();
    list.scrollTop = list.scrollHeight;
    updateFab();
  }
  function jumpToIndex(i, opts) {
    opts = opts || {};
    hlIndex = opts.hl ? i : -1;
    hlRe = opts.hl || null;
    let p = D.viewPos(i);
    if (D.V[p] !== i && D.filtered) {
      // Nachricht ist durch den Chat-Filter ausgeblendet -> Filter aufheben
      D.setChatOn(D.chats.map(() => true));
      updateBanner();
      p = D.viewPos(i);
    }
    renderAround(p, opts.align || "center");
    if (opts.flash) {
      const b = inner.querySelector('[data-i="' + i + '"]');
      if (b) { b.classList.remove("flash"); void b.offsetWidth; b.classList.add("flash"); }
    }
    updatePill();
    onIdle();
  }
  function jumpToTs(ts, opts) {
    const i = D.idxAtOrAfter(ts);
    if (i >= D.N) { jumpToEnd(); return; }
    jumpToIndex(i, Object.assign({ align: "top" }, opts || {}));
  }

  // ---------- Zeitleiste rechts ----------
  function updateScrub() {
    const ts = currentTs();
    if (ts == null || D.lastTs <= D.firstTs) return;
    const f = (ts - D.firstTs) / (D.lastTs - D.firstTs);
    const H = scrub.clientHeight - 36;
    scrub.querySelector(".thumb").style.top = Math.round(f * H) + "px";
  }
  function initScrub() {
    const thumb = scrub.querySelector(".thumb"), bub = scrub.querySelector(".bubble");
    let dragTs = null;
    function at(y) {
      const r = scrub.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (y - r.top - 18) / (r.height - 36)));
      dragTs = D.firstTs + f * (D.lastTs - D.firstTs);
      thumb.style.top = Math.round(f * (r.height - 36)) + "px";
      bub.style.top = Math.round(f * (r.height - 36) + 18) + "px";
      bub.textContent = UC.fmtDate(dragTs, "month");
    }
    scrub.addEventListener("pointerdown", (e) => {
      if (D.lastTs <= D.firstTs) return;
      scrub.setPointerCapture(e.pointerId);
      scrub.classList.add("drag", "show");
      at(e.clientY);
      e.preventDefault();
    });
    scrub.addEventListener("pointermove", (e) => { if (scrub.classList.contains("drag")) at(e.clientY); });
    const end = () => {
      if (!scrub.classList.contains("drag")) return;
      scrub.classList.remove("drag");
      if (dragTs != null) {
        const d = UC.D(dragTs);
        jumpToTs(UC.tsOf(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
        dragTs = null;
      }
    };
    scrub.addEventListener("pointerup", end);
    scrub.addEventListener("pointercancel", end);
  }

  // ---------- Kopf / Filter ----------
  function updateHeader() {
    const cfg = D.cfg;
    const av = UC.$("#chat-avatar");
    const avPath = cfg.avatars && cfg.avatars[1];
    if (avPath) {
      const img = el("img", { alt: "" });
      UC.media.url(avPath).then((u) => { if (u) img.src = u; });
      av.replaceChildren(img);
    } else av.textContent = (cfg.partner || "?").trim().charAt(0).toUpperCase();
    UC.$("#chat-name").textContent = cfg.partner || "Unser Chat";
    const since = cfg.since ? UC.tsOf.apply(null, cfg.since.split("-").map(Number)) : D.firstTs;
    UC.$("#chat-sub").textContent = "seit " + UC.fmtDate(since, "med") + " · " + UC.fmtNum(D.V.length) + " Nachrichten";
  }
  function updateBanner() {
    if (D.filtered) {
      const names = D.chats.filter((_, i) => D.chatOn[i]).map((c) => c.name).join(", ");
      banner.textContent = "Nur: " + names;
      banner.hidden = false;
    } else banner.hidden = true;
    updateHeader();
  }
  function refresh() {
    const ts = currentTs();
    updateBanner();
    if (ts != null) jumpToTs(ts); else jumpToEnd();
  }

  // ---------- Aktionen auf Nachrichten ----------
  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
    const ta = el("textarea", { style: { position: "fixed", opacity: "0" } });
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* egal */ }
    ta.remove();
    return Promise.resolve();
  }
  function refreshBubble(i) {
    const b = inner.querySelector('[data-i="' + i + '"]');
    if (!b) return;
    const old = b.querySelector(".meta");
    const nm = metaEl(i);
    if (old) { if (old.classList.contains("over")) nm.classList.add("over"); old.replaceWith(nm); }
  }
  function toggleFav(i) {
    const on = D.toggleFav(i);
    refreshBubble(i);
    UC.toast(on ? "❤️ Zu Favoriten hinzugefügt" : "Aus Favoriten entfernt", 1400);
  }
  function actions(i) {
    const m = D.M[i];
    const body = el("div");
    const info = el("div", { class: "opt", style: { display: "block" } },
      el("div", { text: D.name(m[D.S]) + " · " + UC.fmtDate(m[D.T]) + ", " + UC.fmtTime(m[D.T]) }),
      D.chats.length > 1 ? el("div", { class: "muted small", text: "Chat: " + D.chats[m[D.C]].name }) : null);
    const fav = el("button", { class: "opt", text: D.isFav(i) ? "💔  Aus Favoriten entfernen" : "❤️  Als Favorit merken" });
    const cp = el("button", { class: "opt", text: "📋  Text kopieren" });
    const day = el("button", { class: "opt", text: "📅  Diesen Tag im Kalender" });
    body.append(info, fav, m[D.X] ? cp : null, day);
    const s = UC.sheet({ title: "Nachricht", body });
    fav.onclick = () => { toggleFav(i); s.close(); };
    cp.onclick = () => { copyText(m[D.X] || ""); UC.toast("Kopiert"); s.close(); };
    day.onclick = () => { s.close(); UC.app.showDay(Math.floor(m[D.T] / 86400)); };
  }

  function init() {
    D = UC.data;
    list = UC.$("#chat-list");
    inner = UC.$("#chat-inner");
    pill = UC.$("#date-pill");
    toBottom = UC.$("#to-bottom");
    scrub = UC.$("#scrubber");
    banner = UC.$("#filter-banner");
    list.addEventListener("scroll", onScroll, { passive: true });
    toBottom.addEventListener("click", jumpToEnd);
    banner.addEventListener("click", () => UC.app.openSettings());
    initScrub();
    UC.gestures(inner, ".bubble, .sys-chip", (b) => toggleFav(+b.dataset.i), (b) => actions(+b.dataset.i));
    updateBanner();
    jumpToEnd();
  }

  UC.chat = { init, jumpToEnd, jumpToIndex, jumpToTs, refresh, updateHeader, miniRows, currentTs };
})(window.UC);
