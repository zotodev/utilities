// ── IndexedDB helper ──────────────────────────────────────────────────────────
const DB_NAME = 'quicknotes';
const STORE   = 'notes';
const DB_VER  = 1;

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Unified storage adapter ───────────────────────────────────────────────────
const Storage = {
  // Returns 'idb' | 'ls'
  getMode() {
    return localStorage.getItem('qn_storage_mode') || 'idb';
  },
  setMode(mode) {
    localStorage.setItem('qn_storage_mode', mode);
  },

  // ── LocalStorage backend ──────────────────────────────────────────────────
  _lsGetAll() {
    try {
      return JSON.parse(localStorage.getItem('qn_notes') || '[]');
    } catch { return []; }
  },
  _lsSave(notes) {
    localStorage.setItem('qn_notes', JSON.stringify(notes));
  },

  // ── Public API ─────────────────────────────────────────────────────────────
  async getAll() {
    if (this.getMode() === 'ls') {
      return this._lsGetAll().sort((a, b) => b.updatedAt - a.updatedAt);
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('updatedAt').getAll();
      req.onsuccess = () => resolve((req.result || []).reverse());
      req.onerror   = e => reject(e.target.error);
    });
  },

  async get(id) {
    if (this.getMode() === 'ls') {
      return this._lsGetAll().find(n => n.id === id) || null;
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = e => reject(e.target.error);
    });
  },

  async save(note) {
    if (this.getMode() === 'ls') {
      const notes = this._lsGetAll();
      const idx   = notes.findIndex(n => n.id === note.id);
      if (idx >= 0) notes[idx] = note; else notes.unshift(note);
      this._lsSave(notes);
      return note;
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(note);
      req.onsuccess = () => resolve(note);
      req.onerror   = e => reject(e.target.error);
    });
  },

  async delete(id) {
    if (this.getMode() === 'ls') {
      this._lsSave(this._lsGetAll().filter(n => n.id !== id));
      return;
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  },

  async count() {
    if (this.getMode() === 'ls') return this._lsGetAll().length;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  // Migrate all notes from one backend to the other
  async migrate(toMode) {
    const notes = await this.getAll();
    const from  = this.getMode();
    this.setMode(toMode);
    for (const n of notes) await this.save(n);
    // Clear old backend
    if (from === 'ls') {
      localStorage.removeItem('qn_notes');
    } else {
      const db = await openDB();
      await new Promise((res, rej) => {
        const req = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
        req.onsuccess = res; req.onerror = e => rej(e.target.error);
      });
    }
  }
};
