/* Unser Chat – verschlüsseltes Datenpaket lesen und importieren */
(function (UC) {
  "use strict";
  const MAGIC = "UNSRCHT1";
  const DEFAULT_PASSWORD = "unser-chat::ohne-passwort"; // Paket ohne eigenes Passwort
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function slice(file, off, len) {
    return new Uint8Array(await file.slice(off, off + len).arrayBuffer());
  }
  async function gunzip(u8) {
    if (typeof DecompressionStream === "undefined") throw new Error("Dieses Gerät kann das Paket nicht entpacken (iOS zu alt).");
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readHead(file) {
    const first = await slice(file, 0, 12);
    const magic = String.fromCharCode.apply(null, first.slice(0, 8));
    if (magic !== MAGIC) throw new Error("Das ist keine Chat-Datei (.chatpaket).");
    const hl = new DataView(first.buffer).getUint32(8, false);
    const head = JSON.parse(new TextDecoder().decode(await slice(file, 12, hl)));
    return { head, base: 12 + hl };
  }

  async function deriveKey(password, head) {
    const enc = new TextEncoder();
    const raw = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: b64(head.kdf.salt), iterations: head.kdf.iter },
      raw, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }

  async function decrypt(key, iv, data) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: typeof iv === "string" ? b64(iv) : iv }, key, data));
  }

  async function openIndex(file, h, key) {
    const ix = h.head.index;
    let plain;
    try {
      plain = await decrypt(key, ix.iv, await slice(file, h.base + ix.off, ix.len));
    } catch (e) {
      const err = new Error("Falsches Passwort");
      err.wrongPassword = true;
      throw err;
    }
    if (ix.gz) plain = await gunzip(plain);
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function importAll(file, h, key, index, onProgress) {
    const entries = Object.entries(index.entries);
    const total = entries.reduce((s, e) => s + e[1][1], 0);
    let done = 0;
    // erst Mediendateien, zuletzt die Nachrichten (so ist ein abgebrochener Import erkennbar)
    await UC.idb.clear("files");
    await UC.idb.del("kv", "data");
    let dataJson = null;
    let batch = [], batchBytes = 0;
    const flush = async () => { if (batch.length) { await UC.idb.putMany("files", batch); batch = []; batchBytes = 0; } };
    for (const [name, [off, len, iv, mime]] of entries) {
      const plain = await decrypt(key, iv, await slice(file, h.base + off, len));
      if (name === "data.json.gz") {
        dataJson = new TextDecoder().decode(await gunzip(plain));
      } else {
        batch.push([name, new Blob([plain], { type: mime || "application/octet-stream" })]);
        batchBytes += plain.length;
        if (batch.length >= 40 || batchBytes > 24e6) await flush();
      }
      done += len;
      onProgress && onProgress(done / total, done, total);
    }
    await flush();
    if (!dataJson) throw new Error("Im Paket fehlen die Nachrichten.");
    JSON.parse(dataJson); // prüfen
    await UC.idb.put("kv", "data", dataJson);
    await UC.idb.put("kv", "meta", { imported: Date.now(), created: index.created || 0, size: file.size });
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* egal */ }
    return dataJson;
  }

  UC.paket = { readHead, deriveKey, openIndex, importAll, DEFAULT_PASSWORD };
})(window.UC);
