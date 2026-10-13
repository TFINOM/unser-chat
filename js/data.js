/* Unser Chat – Datenmodell */
(function (UC) {
  "use strict";
  // Spalten einer Nachricht
  const T = 0, S = 1, C = 2, K = 3, X = 4, MI = 5, F = 6;
  const KIND = { TEXT: 0, IMAGE: 1, VIDEO: 2, AUDIO: 3, STICKER: 4, GIF: 5, DOC: 6, CONTACT: 7, LOC: 8, CALL: 9, DEL: 10, SYS: 11, POLL: 12, ONCE: 13 };
  const KIND_LABEL = { 1: "Foto", 2: "Video", 3: "Sprachnachricht", 4: "Sticker", 5: "GIF", 6: "Dokument", 7: "Kontakt", 8: "Standort", 9: "Anruf", 13: "Einmalansicht" };
  const KIND_ICON = { 1: "📷", 2: "🎬", 3: "🎤", 4: "🙂", 5: "🎞️", 6: "📄", 7: "👤", 8: "📍", 9: "📞", 10: "🚫", 12: "📊", 13: "①" };

  const data = {
    T, S, C, K, X, MI, F, KIND, KIND_LABEL, KIND_ICON,
    init(raw) {
      this.raw = raw;
      const M = (this.M = raw.m || []);
      this.cfg = raw.cfg || {};
      this.chats = raw.chats || [];
      this.media = raw.media || [];
      this.N = M.length;
      // Antworten: Index -> Index der zitierten Nachricht
      this.Q = new Map();
      for (const pair of raw.rp || []) this.Q.set(pair[0], pair[1]);
      // Tage
      const days = [], first = [], count = [];
      let prev = -2147483648;
      for (let i = 0; i < M.length; i++) {
        const d = Math.floor(M[i][T] / 86400);
        if (d !== prev) { days.push(d); first.push(i); count.push(1); prev = d; } else count[count.length - 1]++;
      }
      this.days = Int32Array.from(days);
      this.dayFirst = Int32Array.from(first);
      this.dayCount = Int32Array.from(count);
      this.dayPos = new Map();
      for (let j = 0; j < days.length; j++) this.dayPos.set(days[j], j);
      // Jahre
      this.firstTs = M.length ? M[0][T] : 0;
      this.lastTs = M.length ? M[M.length - 1][T] : 0;
      const y0 = M.length ? UC.D(this.firstTs).getUTCFullYear() : new Date().getFullYear();
      const y1 = M.length ? UC.D(this.lastTs).getUTCFullYear() : y0;
      this.years = [];
      for (let y = y0; y <= y1; y++) this.years.push(y);
      // Chats, die sich zeitlich mit einem größeren überschneiden, bekommen ein Etikett
      this.chatTag = this.chats.map((c, ci) => this.chats.some((o, oi) => oi !== ci && o.n > c.n &&
        Math.min(o.last, c.last) - Math.max(o.first, c.first) > 30 * 86400));
      // Ansicht (Filter nach Chat)
      const on = UC.prefs.get("chatsOn", null);
      this.chatOn = this.chats.map((_, i) => !on || on[i] !== false);
      this.buildView();
      this.norm = null;
      const storedFavs = UC.prefs.get("favs", null);
      if (storedFavs === null) {
        // beim ersten Start: in WhatsApp mit Stern markierte Nachrichten als Favoriten übernehmen
        this.favs = new Set();
        for (let i = 0; i < M.length; i++) if (M[i][F] & 2) this.favs.add(this.favKey(i));
      } else this.favs = new Set(storedFavs);
      this._favIdx = null;
    },
    buildView() {
      const all = this.chatOn.every(Boolean);
      if (all) {
        const v = new Int32Array(this.N);
        for (let i = 0; i < this.N; i++) v[i] = i;
        this.V = v;
      } else {
        const out = [];
        for (let i = 0; i < this.N; i++) if (this.chatOn[this.M[i][C]]) out.push(i);
        this.V = Int32Array.from(out);
      }
      this.filtered = !all;
    },
    setChatOn(arr) {
      this.chatOn = arr;
      UC.prefs.set("chatsOn", arr);
      this.buildView();
    },
    name(s) { return s === 0 ? (this.cfg.me || "Ich") : s === 1 ? (this.cfg.partner || "Du") : "WhatsApp"; },
    // erster Index mit t >= ts (global)
    idxAtOrAfter(ts) {
      const M = this.M;
      let lo = 0, hi = M.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (M[mid][T] < ts) lo = mid + 1; else hi = mid; }
      return lo;
    },
    // Position in der Ansicht V für globalen Index i (oder die nächste danach)
    viewPos(i) {
      const V = this.V;
      let lo = 0, hi = V.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (V[mid] < i) lo = mid + 1; else hi = mid; }
      return Math.min(lo, V.length - 1);
    },
    viewPosAtTs(ts) { return this.viewPos(this.idxAtOrAfter(ts)); },
    dayInfo(day) {
      const j = this.dayPos.get(day);
      return j == null ? null : { first: this.dayFirst[j], count: this.dayCount[j] };
    },
    msgsOfDay(day) {
      const info = this.dayInfo(day);
      if (!info) return [];
      const out = [];
      for (let i = info.first; i < info.first + info.count; i++) out.push(i);
      return out;
    },
    // ---- Suche: normalisierte Texte (einmalig, in Etappen) ----
    ensureNorm(onProgress) {
      if (this.norm) return Promise.resolve(this.norm);
      if (this._normP) return this._normP;
      const M = this.M, n = this.N, out = new Array(n);
      this._normP = new Promise((resolve) => {
        let i = 0;
        const step = () => {
          const end = Math.min(n, i + 15000);
          for (; i < end; i++) {
            const x = M[i][X];
            out[i] = x ? UC.normalize(x) : "";
          }
          if (onProgress) onProgress(i / n);
          if (i < n) setTimeout(step, 0);
          else { this.norm = out; resolve(out); }
        };
        step();
      });
      return this._normP;
    },
    // ---- Favoriten ----
    favKey(i) { const m = this.M[i]; return m[T] + ":" + m[S] + ":" + m[C] + ":" + (m[X] || "").length + ":" + m[K]; },
    isFav(i) { return this.favs.has(this.favKey(i)); },
    toggleFav(i) {
      const k = this.favKey(i);
      if (this.favs.has(k)) this.favs.delete(k); else this.favs.add(k);
      UC.prefs.set("favs", Array.from(this.favs));
      this._favIdx = null;
      return this.favs.has(k);
    },
    favIndices() {
      if (this._favIdx) return this._favIdx;
      const out = [];
      if (this.favs.size) for (let i = 0; i < this.N; i++) if (this.favs.has(this.favKey(i))) out.push(i);
      this._favIdx = out;
      return out;
    },
    // Text für Vorschau / Suche
    preview(i) {
      const m = this.M[i];
      const k = m[K];
      if (k === KIND.TEXT || k === KIND.SYS || k === KIND.POLL || k === KIND.LOC || k === KIND.CALL) return m[X];
      if (k === KIND.DEL) return "Nachricht gelöscht";
      const lbl = (KIND_ICON[k] || "") + " " + (KIND_LABEL[k] || "");
      return m[X] ? lbl + " · " + m[X] : lbl;
    },
  };
  UC.data = data;
})(window.UC);
