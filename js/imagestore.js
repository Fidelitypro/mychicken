// ===== IMAGE STORE - IndexedDB storage for images =====
const ImageStore = {
  _db: null,
  _cache: {
    logoImage: '',
    bgImage: '',
    stampEmpty: '',
    stampFilled: '',
    stampTierEmpty: '',
    stampTierFilled: ''
  },

  init() {
    return new Promise((resolve) => {
      const request = indexedDB.open('loyalty_images', 2);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
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
        console.error('IndexedDB open failed');
        resolve();
      };
    });
  },

  _loadAll() {
    return new Promise((resolve) => {
      if (!this._db) return resolve();
      const tx = this._db.transaction('images', 'readonly');
      const store = tx.objectStore('images');
      const keys = Object.keys(this._cache);
      let remaining = keys.length;
      keys.forEach(key => {
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result) this._cache[key] = req.result;
          if (--remaining === 0) resolve();
        };
        req.onerror = () => {
          if (--remaining === 0) resolve();
        };
      });
    });
  },

  // Migrate existing base64 images from localStorage config to IndexedDB (one-time)
  _migrateFromLocalStorage() {
    const raw = localStorage.getItem('loyalty_config');
    if (!raw) return;
    const config = JSON.parse(raw);
    let needsSave = false;
    const images = {};

    if (config.logoImage) {
      images.logoImage = config.logoImage;
      config.logoImage = '';
      needsSave = true;
    }
    if (config.stampImages) {
      for (const [k, v] of Object.entries(config.stampImages)) {
        if (v) {
          images[k] = v;
          needsSave = true;
        }
      }
      config.stampImages = { stampEmpty: '', stampFilled: '', stampTierEmpty: '', stampTierFilled: '' };
    }

    if (needsSave) {
      // Save images to IndexedDB
      this.saveImages(images);
      // Strip images from localStorage config
      localStorage.setItem('loyalty_config', JSON.stringify(config));
    }
  },

  getLogo() {
    return this._cache.logoImage || '';
  },

  getStampImages() {
    return {
      stampEmpty: this._cache.stampEmpty || '',
      stampFilled: this._cache.stampFilled || '',
      stampTierEmpty: this._cache.stampTierEmpty || '',
      stampTierFilled: this._cache.stampTierFilled || ''
    };
  },

  saveLogo(dataUrl) {
    this._cache.logoImage = dataUrl || '';
    this._put('logoImage', dataUrl);
  },

  getBgImage() {
    return this._cache.bgImage || '';
  },

  saveBgImage(dataUrl) {
    this._cache.bgImage = dataUrl || '';
    this._put('bgImage', dataUrl);
  },

  saveStampImage(key, dataUrl) {
    if (this._cache.hasOwnProperty(key)) {
      this._cache[key] = dataUrl || '';
      this._put(key, dataUrl);
    }
  },

  saveImages(images) {
    for (const [key, value] of Object.entries(images)) {
      if (this._cache.hasOwnProperty(key)) {
        this._cache[key] = value || '';
        this._put(key, value);
      }
    }
  },

  _put(key, value) {
    if (!this._db) return;
    const tx = this._db.transaction('images', 'readwrite');
    const store = tx.objectStore('images');
    if (value) {
      store.put(value, key);
    } else {
      store.delete(key);
    }
  },

  // --- Persistent settings (e.g. export directory handle) ---
  saveSetting(key, value) {
    return new Promise((resolve) => {
      if (!this._db) return resolve();
      const tx = this._db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },

  getSetting(key) {
    return new Promise((resolve) => {
      if (!this._db) return resolve(null);
      const tx = this._db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  },

  deleteSetting(key) {
    return new Promise((resolve) => {
      if (!this._db) return resolve();
      const tx = this._db.transaction('settings', 'readwrite');
      tx.objectStore('settings').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
};
