/** Durable v2 outbox. UI never waits for Firebase. Plain localhost/dev mode never uploads. */
(() => {
  const KEY = 'svart.outbox.v2', REJECTED = 'svart.outbox.v2.rejected';
  const TIMEOUT = 15000, inFlight = new Set();
  let timer, lastSuccessAt = null;
  const read = key => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  function enabled() {
    return !!window.CloudConfig?.CLOUD_ENABLED && !!window.CloudConfig?.FIREBASE_CONFIG?.projectId
      && new URLSearchParams(location.search).get('dev') !== '1' && !window._isFirebaseLocalDev();
  }
  function status() { return { enabled: enabled(), pending: read(KEY).length, rejected: read(REJECTED).length, legacyPending: read('svart.outbox').length, lastSuccessAt }; }
  function schedule(ms = 0) { clearTimeout(timer); timer = setTimeout(flush, ms); }
  function timeout(promise) {
    return new Promise((resolve, reject) => {
      const id = setTimeout(() => reject(new Error('upload timeout')), TIMEOUT);
      promise.then(value => { clearTimeout(id); resolve(value); }, error => { clearTimeout(id); reject(error); });
    });
  }
  function seat() {
    const query = new URLSearchParams(location.search).get('seat');
    let value = query;
    if (!value) { try { value = localStorage.getItem('svart.seat'); } catch {} }
    const n = Number(value); return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null;
  }
  function sendEar(result) {
    if (!enabled()) return null;
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const id = Array.from(crypto.getRandomValues(new Uint8Array(10)), n => alphabet[n % alphabet.length]).join('');
    const data = window.EarSchema.buildDoc({ ...result, lang: result.lang || window.GlobalState?.lang }, id, {
      storeNames: window.CloudConfig.STORE_NAMES, seat: seat(), app: window.CloudConfig.APP_VERSION
    });
    const queue = read(KEY);
    queue.push({ earId: id, doc: data, attempts: 0, nextAt: 0 });
    // If durable storage fails, tell the caller instead of pretending it was queued.
    write(KEY, queue);
    schedule();
    return id;
  }
  function remove(id) { write(KEY, read(KEY).filter(entry => entry.earId !== id)); }
  function retry(id) {
    const queue = read(KEY), item = queue.find(entry => entry.earId === id);
    if (!item) return;
    item.attempts++;
    item.nextAt = Date.now() + Math.min(60000, 5000 * 2 ** Math.min(item.attempts - 1, 5));
    write(KEY, queue);
  }
  async function upload(entry) {
    inFlight.add(entry.earId);
    try {
      const { db } = await timeout(window._initFirebase());
      const { doc, setDoc, getDoc, serverTimestamp } = await timeout(import(`${window.FIREBASE_BASE}/firebase-firestore.js`));
      const ref = doc(db, 'ears', entry.earId);
      try {
        await timeout(setDoc(ref, { ...entry.doc, createdAt: serverTimestamp() }));
      } catch (error) {
        if (error.code !== 'permission-denied') throw error;
        // A timed-out previous write may already have succeeded: never duplicate that ear.
        const existing = await timeout(getDoc(ref));
        if (!existing.exists()) {
          write(REJECTED, [...read(REJECTED), { ...entry, reason: error.code, rejectedAt: Date.now() }]);
          remove(entry.earId); return;
        }
        if (existing.data().earId !== entry.earId || existing.data().clientAt !== entry.doc.clientAt) throw error;
      }
      remove(entry.earId); lastSuccessAt = Date.now();
    } catch (error) {
      console.warn('[cloud] queued for retry:', entry.earId, error.code || '', error.message);
      retry(entry.earId);
    } finally { inFlight.delete(entry.earId); }
  }
  async function flush() {
    clearTimeout(timer);
    if (!enabled()) return;
    const ready = read(KEY).filter(entry => !inFlight.has(entry.earId) && entry.nextAt <= Date.now());
    await Promise.all(ready.map(upload));
    const pending = read(KEY).filter(entry => !inFlight.has(entry.earId));
    if (pending.length) schedule(Math.max(100, Math.min(...pending.map(entry => entry.nextAt - Date.now()))));
  }
  window.svartCloud = { sendEar, flush, status };
  window.addEventListener('online', () => schedule(100));
  schedule(2000);
})();
