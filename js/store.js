/* Unser Chat – IndexedDB (nur Web-App-Variante) */
(function (UC) {
  "use strict";
  const DB = "unserchat", VER = 1;
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB, VER); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("blocked"));
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let res;
      const r = fn(s);
      if (r && "onsuccess" in r) r.onsuccess = () => { res = r.result; };
      t.oncomplete = () => resolve(res);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("abort"));
    }));
  }
  UC.idb = {
    open,
    get: (store, key) => tx(store, "readonly", (s) => s.get(key)),
    put: (store, key, val) => tx(store, "readwrite", (s) => s.put(val, key)),
    del: (store, key) => tx(store, "readwrite", (s) => s.delete(key)),
    clear: (store) => tx(store, "readwrite", (s) => s.clear()),
    putMany(store, items) { // [[key, val], ...]
      return tx(store, "readwrite", (s) => { for (const [k, v] of items) s.put(v, k); });
    },
    async wipe() {
      await UC.idb.clear("files");
      await UC.idb.clear("kv");
    },
  };
})(window.UC);
