/* Unser Chat – Intro mit Widmung */
(function (UC) {
  "use strict";
  const { el } = UC;

  function countUp(node, target, ms) {
    const t0 = performance.now();
    const step = (now) => {
      const f = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - f, 3);
      node.textContent = UC.fmtNum(Math.round(target * e));
      if (f < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function show(onDone) {
    const D = UC.data, cfg = D.cfg;
    let sinceTs = D.firstTs;
    if (cfg.since) { const [y, m, d] = cfg.since.split("-").map(Number); sinceTs = UC.tsOf(y, m, d); }
    const now = UC.nowTs();
    const [sy, sm, sd] = UC.ymd(sinceTs), [ny, nm, nd] = UC.ymd(now);
    let years = ny - sy - ((nm < sm || (nm === sm && nd < sd)) ? 1 : 0);
    const days = UC.dayNum(now) - UC.dayNum(sinceTs);
    const photos = UC.media.visualList().length || D.raw.m.reduce((s, r) => s + (r[3] === 1 ? 1 : 0), 0);
    const phrases = (cfg.lovePhrases || []).map((p) => p.toLowerCase());
    let love = 0;
    if (phrases.length) for (const r of D.M) if (r[3] === 0 && r[4]) { const t = r[4].toLowerCase(); for (const p of phrases) if (t.indexOf(p) >= 0) { love++; break; } }

    const hearts = el("div", { class: "hearts" });
    const em = ["❤️", "💕", "💖", "🤍", "💗"];
    for (let i = 0; i < 16; i++) {
      hearts.appendChild(el("span", { text: em[i % em.length], style: {
        left: Math.round(Math.random() * 100) + "%", fontSize: (14 + Math.random() * 18) + "px",
        animationDuration: (9 + Math.random() * 9) + "s", animationDelay: (Math.random() * 10) + "s" } }));
    }
    const steps = [];
    steps.push(el("div", { class: "step" },
      el("div", { class: "date", text: UC.fmtDate(sinceTs, "short") }),
      years >= 1 ? el("div", { class: "years" }, String(years), el("small", { text: years === 1 ? "Jahr" : "Jahre" }))
        : el("div", { class: "years" }, UC.fmtNum(days), el("small", { text: "Tage" })),
      el("div", { style: { fontSize: "20px", marginTop: "10px", opacity: .9 }, text: (cfg.me || "") + " & " + (cfg.partner || "") })));
    const c1 = el("b", { text: "0" }), c2 = el("b", { text: "0" }), c3 = el("b", { text: "0" }), c4 = el("b", { text: "0" });
    steps.push(el("div", { class: "step" },
      el("div", { class: "count" }, c1, el("span", { text: "Nachrichten" })),
      el("div", { class: "count" }, c2, el("span", { text: "gemeinsame Tage" })),
      photos ? el("div", { class: "count" }, c3, el("span", { text: "Fotos & Videos" })) : null,
      love ? el("div", { class: "count" }, c4, el("span", { text: "mal „" + (cfg.lovePhrases[0] || "Ich liebe dich") + "“ & Co." })) : null));
    if (cfg.dedication) {
      steps.push(el("div", { class: "step" },
        el("div", { class: "ded", text: cfg.dedication }),
        cfg.signature ? el("div", { class: "sig", text: cfg.signature }) : null));
    }
    const stage = el("div", { class: "stage" }, ...steps);
    const dots = el("div", { class: "dots" }, ...steps.map(() => el("i")));
    const nextBtn = el("button", { class: "btn" });
    const skipBtn = el("button", { class: "btn sec", text: "Überspringen" });
    const root = el("div", { class: "intro" }, hearts, dots, stage, el("div", { class: "next" }, skipBtn, nextBtn));
    document.getElementById("overlays").appendChild(root);
    let cur = -1;
    function go(n) {
      if (n >= steps.length) { finish(); return; }
      cur = n;
      steps.forEach((s, i) => s.classList.toggle("on", i === n));
      UC.$$("i", dots).forEach((d, i) => d.classList.toggle("on", i <= n));
      nextBtn.textContent = n === steps.length - 1 ? "Los geht’s ❤️" : "Weiter";
      skipBtn.hidden = n === steps.length - 1;
      if (n === 1) {
        countUp(c1, D.N, 2200); countUp(c2, days, 2200);
        if (photos) countUp(c3, photos, 2200);
        if (love) countUp(c4, love, 2200);
      }
    }
    function finish() {
      root.style.transition = "opacity .6s"; root.style.opacity = "0";
      setTimeout(() => root.remove(), 650);
      UC.prefs.set("introSeen", true);
      if (onDone) onDone();
    }
    nextBtn.onclick = () => go(cur + 1);
    skipBtn.onclick = finish;
    setTimeout(() => go(0), 80);
  }
  UC.intro = { show };
})(window.UC);
