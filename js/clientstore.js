// ===== CLIENT STORE - IndexedDB storage for client data =====
const ClientStore = {
  _db: null,
  _cache: [],

  init() {
    return new Promise((resolve) => {
      const request = indexedDB.open('loyalty_clients', 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('clients')) {
          db.createObjectStore('clients', { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        this._db = e.target.result;
        this._loadAll().then(() => {
          this._migrateFromLocalStorage();
          resolve();
        });
      };
      request.onerror = () => {
        console.error('ClientStore IndexedDB open failed — falling back to localStorage');
        // Populate cache from localStorage as fallback
        const raw = localStorage.getItem('loyalty_clients');
        this._cache = raw ? JSON.parse(raw) : [];
        resolve();
      };
    });
  },

  _loadAll() {
    return new Promise((resolve) => {
      if (!this._db) return resolve();
      const tx = this._db.transaction('clients', 'readonly');
      const req = tx.objectStore('clients').getAll();
      req.onsuccess = () => {
        this._cache = req.result || [];
        resolve();
      };
      req.onerror = () => resolve();
    });
  },

  // One-time migration from localStorage to IndexedDB
  _migrateFromLocalStorage() {
    if (this._cache.length > 0) return; // IndexedDB already has data
    const raw = localStorage.getItem('loyalty_clients');
    if (!raw) return;
    const clients = JSON.parse(raw);
    if (clients.length === 0) return;
    this._cache = clients;
    this._persistAll();
    localStorage.removeItem('loyalty_clients');
  },

  _persistAll() {
    if (!this._db) return;
    const tx = this._db.transaction('clients', 'readwrite');
    const store = tx.objectStore('clients');
    store.clear();
    for (const client of this._cache) {
      store.put(client);
    }
  },

  getClients() {
    return [...this._cache];
  },

  saveClients(clients) {
    this._cache = clients;
    this._persistAll();
  }
};
