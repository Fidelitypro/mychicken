// ===== CUSTOMIZE - Card Personalization =====
const Customize = {
  _listenersAttached: false,
  _stampImages: { stampEmpty: '', stampFilled: '', stampTierEmpty: '', stampTierFilled: '' },
  _logoImage: '',
  _bgImage: '',

  loadConfig() {
    const config = Store.getConfig();
    document.getElementById('cfg-shop-name').value = config.shopName;
    document.getElementById('cfg-primary-color').value = config.primaryColor;
    document.getElementById('cfg-secondary-color').value = config.secondaryColor;
    document.getElementById('cfg-bg-color').value = config.bgColor;
    document.getElementById('cfg-bg-color2').value = config.bgColor2;
    document.getElementById('cfg-points-per-euro').value = config.pointsPerEuro;
    document.getElementById('cfg-stamps-per-row').value = config.stampsPerRow || 5;
    document.getElementById('cfg-glow-color').value = config.glowColor || '#FFD700';
    document.getElementById('cfg-header-bg').value = config.headerBg || '#FFFFFF';
    document.getElementById('cfg-header-text').value = config.headerText || config.primaryColor || '#E63946';
    document.getElementById('cfg-pin').value = config.cashierPin;
    document.getElementById('cfg-pin-always').checked = config.pinAlways === true;

    const vs = config.visibleStats || { visits: true, spent: true, since: true };
    document.getElementById('cfg-stat-visits').checked = vs.visits !== false;
    document.getElementById('cfg-stat-spent').checked = vs.spent !== false;
    document.getElementById('cfg-stat-since').checked = vs.since !== false;

    // Load logo from IndexedDB
    this._logoImage = ImageStore.getLogo();
    this._refreshLogoPreview();

    // Load bg image from IndexedDB
    this._bgImage = ImageStore.getBgImage();
    this._refreshBgPreview();

    // Load stamp images from IndexedDB
    this._stampImages = ImageStore.getStampImages();
    this._refreshStampImagePreviews();

    this.setType(config.loyaltyType, false);
    this._renderRewardTiers('points', config.rewards);
    this._renderRewardTiers('stamps', config.stampsRewards);
    this.updatePreview();

    if (!this._listenersAttached) {
      this._listenersAttached = true;
      const inputs = ['cfg-shop-name', 'cfg-primary-color', 'cfg-secondary-color', 'cfg-bg-color', 'cfg-bg-color2', 'cfg-points-per-euro', 'cfg-stamps-per-row', 'cfg-glow-color', 'cfg-header-bg', 'cfg-header-text'];
      inputs.forEach(id => {
        document.getElementById(id).addEventListener('input', () => this.updatePreview());
      });
      ['cfg-stat-visits', 'cfg-stat-spent', 'cfg-stat-since'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => this.updatePreview());
      });
    }
  },

  // --- Image resize helper ---
  _resizeImage(dataUrl, maxSize) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/webp', 0.85));
      };
      img.src = dataUrl;
    });
  },

  // --- Logo ---
  handleLogoImage(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      this._logoImage = await this._resizeImage(e.target.result, 900);
      this._refreshLogoPreview();
      this.updatePreview();
    };
    reader.readAsDataURL(file);
  },

  clearLogoImage() {
    this._logoImage = '';
    const input = document.getElementById('cfg-logo-input');
    if (input) input.value = '';
    this._refreshLogoPreview();
    this.updatePreview();
  },

  _refreshLogoPreview() {
    const el = document.getElementById('cfg-logo-preview');
    if (!el) return;
    if (this._logoImage) {
      el.innerHTML = `<img src="${this._logoImage}" alt="Logo">`;
    } else {
      el.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    }
  },

  // --- Background Image ---
  handleBgImage(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      this._bgImage = await this._resizeImage(e.target.result, 2400);
      this._refreshBgPreview();
      this.updatePreview();
    };
    reader.readAsDataURL(file);
  },

  clearBgImage() {
    this._bgImage = '';
    const input = document.getElementById('cfg-bg-input');
    if (input) input.value = '';
    this._refreshBgPreview();
    this.updatePreview();
  },

  _refreshBgPreview() {
    const el = document.getElementById('cfg-bg-preview');
    if (!el) return;
    if (this._bgImage) {
      el.style.backgroundImage = `url(${this._bgImage})`;
      el.innerHTML = '';
    } else {
      el.style.backgroundImage = '';
      el.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    }
  },

  // --- Stamp Images ---
  handleStampImage(key, input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      this._stampImages[key] = await this._resizeImage(e.target.result, 150);
      this._refreshStampImagePreviews();
      this.updatePreview();
    };
    reader.readAsDataURL(file);
  },

  clearStampImage(key) {
    this._stampImages[key] = '';
    // Reset file input
    const inputMap = {
      stampEmpty: 'cfg-stamp-empty',
      stampFilled: 'cfg-stamp-filled',
      stampTierEmpty: 'cfg-stamp-tier-empty',
      stampTierFilled: 'cfg-stamp-tier-filled'
    };
    const input = document.getElementById(inputMap[key]);
    if (input) input.value = '';
    this._refreshStampImagePreviews();
    this.updatePreview();
  },

  _refreshStampImagePreviews() {
    const map = {
      stampEmpty: 'preview-stamp-empty',
      stampFilled: 'preview-stamp-filled',
      stampTierEmpty: 'preview-stamp-tier-empty',
      stampTierFilled: 'preview-stamp-tier-filled'
    };
    for (const [key, elId] of Object.entries(map)) {
      const el = document.getElementById(elId);
      if (!el) continue;
      if (this._stampImages[key]) {
        el.innerHTML = `<img src="${this._stampImages[key]}" alt="">`;
      } else {
        el.innerHTML = '<span class="stamp-image-placeholder">?</span>';
      }
    }
  },

  setType(type, updatePreview = true) {
    document.getElementById('cfg-type-points').classList.toggle('active', type === 'points');
    document.getElementById('cfg-type-stamps').classList.toggle('active', type === 'stamps');
    document.getElementById('cfg-points-options').style.display = type === 'points' ? 'block' : 'none';
    document.getElementById('cfg-stamps-options').style.display = type === 'stamps' ? 'block' : 'none';
    this._currentType = type;
    if (updatePreview) this.updatePreview();
  },

  // --- Reward Tiers ---
  _renderRewardTiers(type, tiers) {
    const containerId = type === 'points' ? 'cfg-rewards-list' : 'cfg-stamps-rewards-list';
    const container = document.getElementById(containerId);
    const unit = type === 'points' ? 'points' : 'tampons';

    container.innerHTML = tiers.map((tier, i) => `
      <div class="reward-tier-row" data-index="${i}">
        <input type="number" class="reward-tier-threshold" min="1" value="${tier.threshold}"
          placeholder="Seuil" oninput="Customize.updatePreview()">
        <span class="reward-tier-unit">${unit}</span>
        <input type="text" class="reward-tier-desc" value="${this._esc(tier.description)}"
          placeholder="Récompense à définir" oninput="Customize.updatePreview()">
        <button type="button" class="btn-icon reward-tier-delete" onclick="Customize.removeRewardTier('${type}', ${i})" title="Supprimer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');
  },

  addRewardTier(type) {
    const tiers = this._readTiersFromDOM(type);
    const lastThreshold = tiers.length > 0 ? tiers[tiers.length - 1].threshold : 0;
    const increment = type === 'points' ? 50 : 5;
    tiers.push({ threshold: lastThreshold + increment, description: 'Récompense à définir' });
    this._renderRewardTiers(type, tiers);
    this.updatePreview();
  },

  removeRewardTier(type, index) {
    const tiers = this._readTiersFromDOM(type);
    if (tiers.length <= 1) {
      App.toast('Il faut au moins un palier', 'error');
      return;
    }
    tiers.splice(index, 1);
    this._renderRewardTiers(type, tiers);
    this.updatePreview();
  },

  _readTiersFromDOM(type) {
    const containerId = type === 'points' ? 'cfg-rewards-list' : 'cfg-stamps-rewards-list';
    const rows = document.querySelectorAll(`#${containerId} .reward-tier-row`);
    return Array.from(rows).map(row => ({
      threshold: parseInt(row.querySelector('.reward-tier-threshold').value) || 1,
      description: row.querySelector('.reward-tier-desc').value.trim() || 'Récompense à définir'
    })).sort((a, b) => a.threshold - b.threshold);
  },

  updatePreview() {
    const shopName = document.getElementById('cfg-shop-name').value || 'Mon Commerce';
    const primary = document.getElementById('cfg-primary-color').value;
    const secondary = document.getElementById('cfg-secondary-color').value;
    const bg1 = document.getElementById('cfg-bg-color').value;
    const bg2 = document.getElementById('cfg-bg-color2').value;
    const type = this._currentType || 'points';

    const glowColor = document.getElementById('cfg-glow-color').value;
    document.documentElement.style.setProperty('--glow-color', glowColor);

    const headerBg = document.getElementById('cfg-header-bg').value;
    const headerText = document.getElementById('cfg-header-text').value;
    document.documentElement.style.setProperty('--header-bg', headerBg);
    document.documentElement.style.setProperty('--header-text', headerText);

    const card = document.getElementById('preview-card');
    card.style.background = `linear-gradient(135deg, ${primary}, ${secondary})`;

    const previewPanel = document.querySelector('.customize-preview');
    if (previewPanel) {
      if (this._bgImage) {
        previewPanel.style.background = `url(${this._bgImage}) center/cover no-repeat`;
      } else {
        previewPanel.style.background = `linear-gradient(135deg, ${bg1}, ${bg2})`;
      }
    }
    document.getElementById('preview-shop-name').textContent = shopName;

    // Sync preview card logo panel
    const previewSideLogo = document.getElementById('preview-side-logo');
    const previewLogoImg = document.getElementById('preview-card-logo-img');
    if (previewSideLogo && previewLogoImg) {
      if (this._logoImage) {
        previewLogoImg.src = this._logoImage;
        previewSideLogo.style.display = 'block';
      } else {
        previewSideLogo.style.display = 'none';
      }
    }

    const tiers = this._readTiersFromDOM(type);
    const previewPoints = 45;
    const previewStamps = 3;

    if (type === 'points') {
      document.getElementById('preview-points-section').style.display = 'flex';
      document.getElementById('preview-stamps-section').style.display = 'none';
      const nextTier = tiers.find(t => t.threshold > previewPoints) || tiers[tiers.length - 1];
      const pct = Math.min(100, (previewPoints / nextTier.threshold) * 100);
      document.getElementById('preview-progress').style.width = pct + '%';
      document.getElementById('preview-progress-text').textContent = `${previewPoints} / ${nextTier.threshold} points`;
    } else {
      document.getElementById('preview-points-section').style.display = 'none';
      document.getElementById('preview-stamps-section').style.display = 'block';
      const maxStamps = tiers.length > 0 ? tiers[tiers.length - 1].threshold : 10;
      const stampsPerRow = parseInt(document.getElementById('cfg-stamps-per-row').value) || 5;
      // Build a fake config for renderStamps
      const previewConfig = {
        stampsRewards: tiers,
        stampImages: this._stampImages,
        stampsPerRow
      };
      Client.renderStamps('preview-stamps-grid', previewStamps, maxStamps, previewConfig);
    }

    // Render rewards list on preview card
    this._renderCardRewardsList('preview-rewards-list', tiers, type,
      type === 'points' ? previewPoints : previewStamps, []);
  },

  _renderCardRewardsList(containerId, tiers, type, currentValue, claimedRewards, pendingRewards = [], cycle = 1) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const unit = type === 'points' ? 'pts' : 'tampons';
    const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);

    container.innerHTML = sorted.map(tier => {
      // Match with cycle-aware key (also accept old format without cycle for compat)
      const keyNew = `${type}_${tier.threshold}_c${cycle}`;
      const keyOld = `${type}_${tier.threshold}`;
      const claimed = claimedRewards.includes(keyNew) || claimedRewards.includes(keyOld);
      const pending = pendingRewards.some(r => r.key === keyNew || r.key === keyOld || r.threshold === tier.threshold);
      let statusClass = 'reward-locked';
      let icon = '🔒';
      if (claimed) {
        statusClass = 'reward-claimed';
        icon = '✅';
      } else if (pending) {
        statusClass = 'reward-pending';
        icon = '⏳';
      } else if (currentValue >= tier.threshold) {
        statusClass = 'reward-ready';
        icon = '🎁';
      }
      return `<div class="card-reward-item ${statusClass}">
        <span class="card-reward-icon">${icon}</span>
        <span class="card-reward-desc">${this._esc(tier.description)}</span>
        <span class="card-reward-threshold">${tier.threshold} ${unit}</span>
      </div>`;
    }).join('');
  },

  save() {
    const type = this._currentType || 'points';
    const config = {
      shopName: document.getElementById('cfg-shop-name').value.trim() || 'Mon Commerce',
      primaryColor: document.getElementById('cfg-primary-color').value,
      secondaryColor: document.getElementById('cfg-secondary-color').value,
      bgColor: document.getElementById('cfg-bg-color').value,
      bgColor2: document.getElementById('cfg-bg-color2').value,
      loyaltyType: type,
      pointsPerEuro: parseInt(document.getElementById('cfg-points-per-euro').value) || 1,
      rewards: this._readTiersFromDOM('points'),
      stampsRewards: this._readTiersFromDOM('stamps'),
      stampsPerRow: parseInt(document.getElementById('cfg-stamps-per-row').value) || 5,
      glowColor: document.getElementById('cfg-glow-color').value,
      headerBg: document.getElementById('cfg-header-bg').value,
      headerText: document.getElementById('cfg-header-text').value,
      visibleStats: {
        visits: document.getElementById('cfg-stat-visits').checked,
        spent: document.getElementById('cfg-stat-spent').checked,
        since: document.getElementById('cfg-stat-since').checked
      },
      cashierPin: document.getElementById('cfg-pin').value || '1234',
      pinAlways: document.getElementById('cfg-pin-always').checked
    };

    // Save images to IndexedDB (no localStorage quota issues)
    ImageStore.saveLogo(this._logoImage);
    ImageStore.saveBgImage(this._bgImage);
    ImageStore.saveImages(this._stampImages);

    Store.saveConfig(config);
    App.applyConfig();

    // Live-refresh the client card if one is currently shown
    Client.refreshCard();

    const msg = document.getElementById('cfg-saved-msg');
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2500);

    App.toast('Configuration sauvegardée !', 'success');
  },

  exportSettings() {
    const config = Store.getConfig();
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      config,
      images: {
        logo: ImageStore.getLogo(),
        bgImage: ImageStore.getBgImage(),
        stamps: ImageStore.getStampImages()
      }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const shopSlug = (config.shopName || 'config').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    a.href = url;
    a.download = `fidelite-${shopSlug}-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    App.toast('Paramètres exportés !', 'success');
  },

  importSettings(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.config) throw new Error('Fichier invalide');

        Store.saveConfig(data.config);

        if (data.images) {
          ImageStore.saveLogo(data.images.logo || '');
          ImageStore.saveBgImage(data.images.bgImage || '');
          if (data.images.stamps) ImageStore.saveImages(data.images.stamps);
        }

        App.applyConfig();
        Customize.loadConfig();
        App.toast('Paramètres importés avec succès !', 'success');
      } catch (err) {
        App.toast('Fichier invalide ou corrompu', 'error');
      }
      input.value = '';
    };
    reader.readAsText(file);
  },

  _esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
