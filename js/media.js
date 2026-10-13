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
  function setUi(ui, playing) {
    if (!ui || !ui.isConnected) return;
    const b = ui.querySelector(".pbtn");
    b.replaceChildren(icon(playing ? "i-pause" : "i-play"));
  }
  media.audioUi = function (i) {
    const info = media.info(i);
    const dur = info && info.d ? UC.fmtDur(info.d) : "";
    const ui = el("div", { class: "audio" },
      el("button", { class: "pbtn", "aria-label": "Abspielen" }, icon("i-play")),
      el("div", { class: "bar" }, el("i")),
      el("span", { class: "dur", text: dur }));
    ui.dataset.path = info && info.f ? info.f : "";
    ui.dataset.d = dur;
    ui.querySelector(".pbtn").addEventListener("click", (e) => { e.stopPropagation(); media.toggleAudio(ui); });
    if (curPath && ui.dataset.path === curPath) { curUi = ui; setUi(ui, !player().paused); }
    return ui;
  };
  media.toggleAudio = async function (ui) {
    const p = player();
    const path = ui.dataset.path;
    if (!path) { UC.toast("Sprachnachricht nicht vorhanden"); return; }
    if (curPath === path) {
      curUi = ui;
      if (p.paused) { p.play(); setUi(ui, true); } else { p.pause(); setUi(ui, false); }
      return;
    }
    if (curUi) setUi(curUi, false);
    curPath = path; curUi = ui;
    const u = await media.url(path);
    if (!u) { UC.toast("Sprachnachricht nicht vorhanden"); return; }
    p.src = u;
    try { await p.play(); setUi(ui, true); } catch (e) { UC.toast("Konnte nicht abgespielt werden"); }
  };
  document.addEventListener("DOMContentLoaded", () => {
    const p = player();
    p.addEventListener("timeupdate", () => {
      if (!curUi || !curUi.isConnected) {
        // nach Neuaufbau des Chats das passende Element wiederfinden
        curUi = Array.from(document.querySelectorAll(".audio")).find((x) => x.dataset.path === curPath) || null;
        if (!curUi) return;
      }
      const f = p.duration ? p.currentTime / p.duration : 0;
      curUi.querySelector(".bar i").style.width = (f * 100).toFixed(1) + "%";
      curUi.querySelector(".dur").textContent = UC.fmtDur(p.currentTime);
    });
    p.addEventListener("ended", () => {
      if (curUi && curUi.isConnected) {
        setUi(curUi, false);
        curUi.querySelector(".bar i").style.width = "0%";
        const info = (curUi.dataset.d);
        curUi.querySelector(".dur").textContent = info || "";
      }
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
        node.src = await media.url(info.f);
      } else {
        node = el("img", { alt: "" });
        const u = await media.url(info.f || info.th);
        if (u) node.src = u;
        if (m[D.K] === 2) stage.appendChild(el("div", { class: "badge", style: { position: "absolute", bottom: "10px" }, text: "Nur Vorschaubild" }));
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
