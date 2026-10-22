/* Unser Chat – Medien: Adressen, Nachladen, Sprachnachrichten, Bildbetrachter */
(function (UC) {
  "use strict";
  const { el, icon } = UC;
  const media = {
    mode: "bundle",
    urls: new Map(),
    order: [],
    observers: new Map(),
    async url(path) {
      if (!path) return null;
      if (this.mode === "bundle") return "data/" + path;
      const have = this.urls.get(path);
      if (have) return have;
      let blob = null;
      try { blob = await UC.idb.get("files", path); } catch (e) { blob = null; }
      if (!blob) return null;
      const u = URL.createObjectURL(blob);
      this.urls.set(path, u);
      this.order.push(path);
      if (this.order.length > 500) {
        const old = this.order.shift();
        const ou = this.urls.get(old);
        this.urls.delete(old);
        setTimeout(() => URL.revokeObjectURL(ou), 30000);
      }
      return u;
    },
    // Bild erst laden, wenn es in die Nähe des sichtbaren Bereichs kommt
    lazy(img, path, root) {
      img.dataset.path = path;
      const key = root || document.body;
      let ob = this.observers.get(key);
      if (!ob) {
        ob = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const t = e.target;
            ob.unobserve(t);
            media.url(t.dataset.path).then((u) => { if (u) t.src = u; });
          }
        }, { root: root || null, rootMargin: "900px 0px" });
        this.observers.set(key, ob);
      }
      ob.observe(img);
    },
    info(i) {
      const m = UC.data.M[i];
      const mid = m[UC.data.MI];
      return mid >= 0 ? UC.data.media[mid] : null;
    },
    // Liste aller Fotos/Videos (für Galerie und Wischen im Betrachter)
    visualList() {
      if (this._vis) return this._vis;
      const D = UC.data, out = [];
      for (let i = 0; i < D.N; i++) {
        const m = D.M[i], k = m[D.K];
        if ((k === 1 || k === 2 || k === 5) && m[D.MI] >= 0) out.push(i);
      }
      this._vis = out;
      return out;
    },
  };

  // ---------------- Sprachnachrichten ----------------
  const player = () => document.getElementById("player");
  let curPath = null, curUi = null;
  const NBARS = 42;
  function setUi(ui, playing) {
    if (!ui || !ui.isConnected) return;
    const b = ui.querySelector(".pbtn");
    b.replaceChildren(icon(playing ? "i-pause" : "i-play"));
  }
  function setProgress(ui, f, cur) {
    if (!ui || !ui.isConnected) return;
    const bars = ui.querySelectorAll(".bars i");
    const n = Math.round(f * bars.length);
    bars.forEach((b, k) => b.classList.toggle("on", k < n));
    const dot = ui.querySelector(".dot");
    if (dot) dot.style.left = (f * 100).toFixed(2) + "%";
    const dur = ui.querySelector(".dur");
    if (dur) dur.textContent = cur == null ? (ui.dataset.d || "") : UC.fmtDur(cur);
  }
  // Wellenform: echte Werte aus den Daten (0–9 je Balken), sonst gleichmäßiges Muster
  function waveValues(info, seed) {
    const wv = info && info.wv;
    const out = [];
    if (wv && wv.length) {
      for (let k = 0; k < NBARS; k++) out.push(+wv[Math.floor(k * wv.length / NBARS)] || 0);
    } else {
      let x = seed || 7;
      for (let k = 0; k < NBARS; k++) { x = (x * 9301 + 49297) % 233280; out.push(2 + Math.floor(6 * x / 233280)); }
    }
    return out;
  }
  function avatarEl(s) {
    const D = UC.data;
    const box = el("div", { class: "img" });
    const path = D.cfg.avatars && D.cfg.avatars[s];
    if (path) {
      const img = el("img", { alt: "" });
      media.url(path).then((u) => { if (u) img.src = u; });
      box.appendChild(img);
    } else box.textContent = (D.name(s) || "?").trim().charAt(0).toUpperCase();
    return box;
  }
  media.avatarEl = avatarEl;
  media.voiceUi = function (i, ticksFn) {
    const D = UC.data, m = D.M[i];
    const info = media.info(i);
    const dur = info && info.d ? UC.fmtDur(info.d) : "";
    const bars = el("div", { class: "bars" });
    for (const v of waveValues(info, i)) bars.appendChild(el("i", { style: { height: Math.max(3, Math.round(3 + v * 2.5)) + "px" } }));
    bars.appendChild(el("span", { class: "dot" }));
    const t = el("span", { class: "t" }, UC.fmtTime(m[D.T]));
    if (D.chats.length > 1) t.insertBefore(el("i", { class: "chat-dot c" + (m[D.C] % 6), title: D.chats[m[D.C]].name }), t.firstChild);
    if (m[D.S] === 0 && ticksFn) t.appendChild(ticksFn());
    if (D.isFav(i)) t.insertBefore(icon("i-heart-fill", "fav"), t.firstChild);
    const ui = el("div", { class: "voice" },
      el("div", { class: "av" }, avatarEl(m[D.S]), icon("i-mic", "mic")),
      el("button", { class: "pbtn", "aria-label": "Abspielen" }, icon("i-play")),
      el("div", { class: "wv" }, bars, el("div", { class: "info" }, el("span", { class: "dur", text: dur }), t)));
    ui.dataset.path = info && info.f ? info.f : "";
    ui.dataset.d = dur;
    ui.querySelector(".pbtn").addEventListener("click", (e) => { e.stopPropagation(); media.toggleAudio(ui); });
    // Antippen der Wellenform springt an die Stelle
    bars.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = bars.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      media.toggleAudio(ui, f);
    });
    if (curPath && ui.dataset.path === curPath) { curUi = ui; setUi(ui, !player().paused); }
    return ui;
  };
  media.audioUi = media.voiceUi;
  media.toggleAudio = async function (ui, seekFrac) {
    const p = player();
    const path = ui.dataset.path;
    if (!path) { UC.toast("Sprachnachricht nicht vorhanden"); return; }
    if (curPath === path) {
      curUi = ui;
      if (seekFrac != null && p.duration) { p.currentTime = seekFrac * p.duration; if (p.paused) { p.play(); setUi(ui, true); } return; }
      if (p.paused) { p.play(); setUi(ui, true); } else { p.pause(); setUi(ui, false); }
      return;
    }
    if (curUi) { setUi(curUi, false); setProgress(curUi, 0, null); }
    curPath = path; curUi = ui;
    const u = await media.url(path);
    if (!u) { UC.toast("Sprachnachricht nicht vorhanden"); return; }
    p.src = u;
    if (seekFrac != null) p.addEventListener("loadedmetadata", () => { if (p.duration) p.currentTime = seekFrac * p.duration; }, { once: true });
    try { await p.play(); setUi(ui, true); } catch (e) { UC.toast("Konnte nicht abgespielt werden"); }
  };
  document.addEventListener("DOMContentLoaded", () => {
    const p = player();
    p.addEventListener("timeupdate", () => {
      if (!curUi || !curUi.isConnected) {
        // nach Neuaufbau des Chats das passende Element wiederfinden
        curUi = Array.from(document.querySelectorAll(".voice")).find((x) => x.dataset.path === curPath) || null;
        if (!curUi) return;
        setUi(curUi, !p.paused);
      }
      const f = p.duration ? p.currentTime / p.duration : 0;
      setProgress(curUi, f, p.currentTime);
    });
    p.addEventListener("ended", () => {
      if (curUi && curUi.isConnected) { setUi(curUi, false); setProgress(curUi, 0, null); }
      curPath = null;
    });
  });

  // ---------------- Betrachter ----------------
  media.view = function (i) {
    const D = UC.data;
    const list = media.visualList();
    let pos = list.indexOf(i);
    const stage = el("div", { class: "stage" });
    const title = el("div", { class: "grow" });
    const cap = el("div", { class: "cap" });
    const closeBtn = el("button", { class: "icon-btn", "aria-label": "Schließen" }, icon("i-close"));
    const prev = el("button", { class: "icon-btn", "aria-label": "Vorheriges" }, icon("i-left"));
    const next = el("button", { class: "icon-btn", "aria-label": "Nächstes" }, icon("i-right"));
    const toChat = el("button", { class: "btn", text: "Im Chat zeigen" });
    const v = el("div", { class: "viewer" },
      el("div", { class: "vt" }, closeBtn, title),
      stage, cap,
      el("div", { class: "vb" }, prev, toChat, next));
    document.getElementById("overlays").appendChild(v);
    let scale = 1, tx = 0, ty = 0, node = null;
    function apply() { if (node) node.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")"; }
    async function show(idx) {
      i = idx;
      const m = D.M[i];
      const info = media.info(i) || {};
      title.replaceChildren(el("b", { text: D.name(m[D.S]) }), el("small", { text: UC.fmtDate(m[D.T]) + ", " + UC.fmtTime(m[D.T]) }));
      cap.textContent = m[D.X] || "";
      scale = 1; tx = 0; ty = 0;
      stage.replaceChildren();
      if ((m[D.K] === 2 || m[D.K] === 5) && info.f) {
        node = el("video", { controls: true, playsinline: true, autoplay: true, loop: m[D.K] === 5 });
        node.setAttribute("playsinline", "");
        const poster = await media.url(info.th);
        if (poster) node.poster = poster;
        node.addEventListener("error", () => {
          const code = node.error ? node.error.code : "?";
          stage.appendChild(el("div", { class: "novideo", text: "Das Video konnte nicht abgespielt werden (Fehler " + code + ")." }));
        });
        node.src = await media.url(info.f);
        try { const p = node.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* Antippen startet */ }
      } else {
        node = el("img", { alt: "" });
        const u = await media.url(info.f || info.th);
        if (u) node.src = u;
        if (m[D.K] === 2 || m[D.K] === 5) stage.appendChild(el("div", { class: "novideo",
          text: "Dieses Video ist in der importierten Chat-Datei nicht enthalten (nur Vorschaubild). Neue Datei importieren: ⋯ → „Neue Chat-Datei importieren“." }));
      }
      stage.appendChild(node);
      prev.style.visibility = pos > 0 ? "visible" : "hidden";
      next.style.visibility = pos >= 0 && pos < list.length - 1 ? "visible" : "hidden";
    }
    function go(d) {
      if (pos < 0) return;
      const np = pos + d;
      if (np < 0 || np >= list.length) return;
      pos = np;
      show(list[pos]);
    }
    function close() { v.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); }
    document.addEventListener("keydown", onKey);
    closeBtn.onclick = close;
    prev.onclick = () => go(-1);
    next.onclick = () => go(1);
    toChat.onclick = () => { close(); UC.app.openInChat(i, { flash: true }); };
    // Gesten: Wischen (links/rechts/unten), Zwei-Finger-Zoom, Doppeltippen
    let t0 = null, pinch0 = null, lastTap = 0;
    stage.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        const [a, b] = e.touches;
        pinch0 = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s: scale };
        t0 = null;
      } else if (e.touches.length === 1) {
        t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty, time: Date.now() };
      }
    }, { passive: true });
    stage.addEventListener("touchmove", (e) => {
      if (node && node.tagName === "VIDEO") return;
      if (pinch0 && e.touches.length === 2) {
        const [a, b] = e.touches;
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        scale = Math.max(1, Math.min(5, pinch0.s * d / pinch0.d));
        apply(); e.preventDefault();
      } else if (t0 && e.touches.length === 1) {
        const dx = e.touches[0].clientX - t0.x, dy = e.touches[0].clientY - t0.y;
        if (scale > 1) { tx = t0.tx + dx; ty = t0.ty + dy; apply(); e.preventDefault(); }
        else if (dy > 0 && Math.abs(dy) > Math.abs(dx)) { node.style.transform = "translateY(" + dy + "px)"; v.style.background = "rgba(0,0,0," + Math.max(0.3, 1 - dy / 400) + ")"; }
      }
    }, { passive: false });
    stage.addEventListener("touchend", (e) => {
      if (pinch0 && e.touches.length < 2) { pinch0 = null; if (scale <= 1.02) { scale = 1; tx = ty = 0; apply(); } return; }
      if (!t0) return;
      const dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y;
      const now = Date.now();
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        if (now - lastTap < 300 && node && node.tagName === "IMG") { scale = scale > 1 ? 1 : 2.5; tx = ty = 0; apply(); lastTap = 0; }
        else lastTap = now;
      } else if (scale <= 1) {
        if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
        v.style.background = "";
        if (node) node.style.transform = "";
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      }
      t0 = null;
    });
    show(i);
  };

  UC.media = media;
})(window.UC);
