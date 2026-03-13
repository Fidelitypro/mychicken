// ===== CLIENT - Login & Card View =====
const Client = {
  currentClient: null,
  step: 'phone', // 'phone' or 'register'

  handleLogin() {
    const phone = document.getElementById('login-phone').value.trim();
    const msgEl = document.getElementById('login-message');

    if (!phone || phone.replace(/\s/g, '').length < 10) {
      msgEl.textContent = 'Veuillez entrer un numéro de téléphone valide';
      msgEl.className = 'login-msg error';
      return;
    }

    if (this.step === 'phone') {
      const client = Store.findClientByPhone(phone);
      if (client) {
        this.currentClient = client;
        this._onClientReady();
      } else {
        this.step = 'register';
        document.getElementById('login-name-group').style.display = 'block';
        document.getElementById('btn-login').textContent = 'Créer mon compte';
        msgEl.textContent = 'Bienvenue ! Entrez votre nom pour créer votre carte.';
        msgEl.className = 'login-msg info';
        document.getElementById('login-name').focus();
      }
    } else {
      const name = document.getElementById('login-name').value.trim();
      if (!name) {
        msgEl.textContent = 'Veuillez entrer votre nom';
        msgEl.className = 'login-msg error';
        return;
      }
      const client = Store.createClient(name, phone);
      this.currentClient = client;
      App.toast('Compte créé avec succès !', 'success');
      this._onClientReady();
    }
  },

  _onClientReady() {
    const config = Store.getConfig();

    if (config.loyaltyType === 'stamps') {
      this.currentClient = Store.addTransaction(this.currentClient.id, 'stamps', 1, 'Visite');
      const tx = this.currentClient.history[0];
      this.showCard();
      if (!tx || !tx.rewardClaimed) {
        App.toast('+1 tampon ajouté !', 'success');
      }
    } else {
      this.showCard();
    }
  },

  _showAmountModal() {
    const config = Store.getConfig();
    document.getElementById('amount-modal').style.display = 'flex';
    document.getElementById('amount-client-name').textContent = this.currentClient.name;
    document.getElementById('amount-ratio').textContent =
      `${config.pointsPerEuro} point${config.pointsPerEuro > 1 ? 's' : ''} par euro dépensé`;
    document.getElementById('amount-input').value = '';
    document.getElementById('amount-calc').textContent = '';
    setTimeout(() => document.getElementById('amount-input').focus(), 100);
  },

  handleAmountInput() {
    const config = Store.getConfig();
    const val = parseFloat(document.getElementById('amount-input').value) || 0;
    const pts = Math.floor(val * config.pointsPerEuro);
    document.getElementById('amount-calc').textContent =
      pts > 0 ? `= ${pts} point${pts > 1 ? 's' : ''}` : '';
  },

  confirmAmount() {
    const amount = parseFloat(document.getElementById('amount-input').value);
    if (!amount || amount <= 0) {
      App.toast('Entrez un montant valide', 'error');
      return;
    }
    const config = Store.getConfig();
    const earned = Math.floor(amount * config.pointsPerEuro);

    this.currentClient = Store.addTransaction(this.currentClient.id, 'points', amount, `Achat de ${amount}€`);
    document.getElementById('amount-modal').style.display = 'none';

    const tx = this.currentClient.history[0];
    this.showCard();
    if (!tx || !tx.rewardClaimed) {
      App.toast(`+${earned} point${earned > 1 ? 's' : ''} ajouté${earned > 1 ? 's' : ''} !`, 'success');
    }
  },

  skipAmount() {
    document.getElementById('amount-modal').style.display = 'none';
    this.showCard();
  },

  _showRewardBanner(rewardsEarned) {
    const descriptions = (rewardsEarned || []).map(r => r.description).join(' + ');
    document.getElementById('reward-banner-text').textContent = descriptions || 'Récompense obtenue !';
    document.getElementById('reward-banner').style.display = 'flex';
    clearTimeout(this._rewardTimer);
    this._rewardTimer = setTimeout(() => {
      document.getElementById('reward-banner').style.display = 'none';
    }, 5000);
  },

  closeRewardBanner() {
    document.getElementById('reward-banner').style.display = 'none';
    clearTimeout(this._rewardTimer);
  },

  showCard() {
    const client = this.currentClient;
    const config = Store.getConfig();
    const tiers = config.loyaltyType === 'points' ? config.rewards : config.stampsRewards;
    const currentValue = config.loyaltyType === 'points' ? client.points : client.stamps;

    document.getElementById('client-login').classList.remove('active');
    document.getElementById('client-card').classList.add('active');

    document.querySelector('#loyalty-card .card-shop-name').textContent = config.shopName;
    document.getElementById('card-client-name').textContent = client.name;

    const card = document.getElementById('loyalty-card');
    card.style.background = `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})`;

    const cycle = client.cycle || 1;
    const cycleComplete = client.pendingCycleReset && client.pendingCycleReset[config.loyaltyType];

    if (config.loyaltyType === 'points') {
      document.getElementById('card-points-section').style.display = 'flex';
      document.getElementById('card-stamps-section').style.display = 'none';
      document.getElementById('card-points-value').textContent = client.points;

      if (cycleComplete) {
        // Card complete — show full bar, wait for next visit to reset
        document.getElementById('card-progress-bar').style.width = '100%';
        document.getElementById('card-progress-text').textContent = 'Carte complète ! 🎉 Prochain cycle en route…';
      } else {
        const nextTier = Store.getNextReward(client, 'points', tiers);
        const target = nextTier ? nextTier.threshold : (tiers.length > 0 ? tiers[tiers.length - 1].threshold : 100);
        const pct = Math.min(100, (client.points / target) * 100);
        document.getElementById('card-progress-bar').style.width = pct + '%';
        document.getElementById('card-progress-text').textContent =
          `${client.points} / ${target} points`;
      }
    } else {
      document.getElementById('card-points-section').style.display = 'none';
      document.getElementById('card-stamps-section').style.display = 'block';
      const maxStamps = tiers.length > 0
        ? Math.max(...tiers.map(t => t.threshold))
        : 10;
      // If cycle reset pending, show stamps at max so the card appears fully stamped
      const stampsToShow = cycleComplete ? maxStamps : client.stamps;
      this.renderStamps('card-stamps-grid', stampsToShow, maxStamps, config);
    }

    // Render rewards list on card (cycle-aware)
    Customize._renderCardRewardsList(
      'card-rewards-list', tiers, config.loyaltyType,
      currentValue, client.claimedRewards || [], client.pendingRewards || [], cycle
    );

    // Pending rewards banner
    const pending = (client.pendingRewards || []).length;
    const banner = document.getElementById('pending-rewards-banner');
    if (pending > 0) {
      const label = pending === 1
        ? 'Vous avez une récompense !'
        : `Vous avez ${pending} récompenses !`;
      document.getElementById('pending-rewards-title').textContent = label;
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }

    // Stats
    const vs = config.visibleStats || { visits: true, spent: true, since: true };
    document.getElementById('stat-orders').textContent = client.totalOrders;
    document.getElementById('stat-spent').textContent = client.totalSpent.toFixed(0) + '€';
    const d = new Date(client.createdAt);
    document.getElementById('stat-since').textContent = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    document.getElementById('stat-orders-item').style.display = vs.visits ? '' : 'none';
    document.getElementById('stat-spent-item').style.display =
      (!vs.spent || config.loyaltyType === 'stamps') ? 'none' : '';
    document.getElementById('stat-since-item').style.display = vs.since ? '' : 'none';
  },

  renderStamps(containerId, filled, total, config) {
    const grid = document.getElementById(containerId);
    grid.innerHTML = '';

    const stampsPerRow = (config && config.stampsPerRow) || 5;
    grid.style.gridTemplateColumns = `repeat(${stampsPerRow}, 1fr)`;

    const configImgs = (config && config.stampImages) || {};
    const hasConfigImgs = Object.values(configImgs).some(v => v);
    const imgs = hasConfigImgs ? configImgs : ImageStore.getStampImages();
    // Determine which positions are tier thresholds
    const tierThresholds = config
      ? (config.stampsRewards || []).map(t => t.threshold)
      : [];

    for (let i = 0; i < total; i++) {
      const pos = i + 1; // 1-based position
      const isFilled = i < filled;
      const isTier = tierThresholds.includes(pos);

      const stamp = document.createElement('div');
      stamp.className = 'stamp' + (isFilled ? ' filled' : '') + (isTier ? ' tier' : '');

      // Pick the right image
      let imgSrc = '';
      if (isTier) {
        imgSrc = isFilled ? imgs.stampTierFilled : imgs.stampTierEmpty;
      } else {
        imgSrc = isFilled ? imgs.stampFilled : imgs.stampEmpty;
      }

      if (imgSrc) {
        stamp.innerHTML = `<img src="${imgSrc}" alt="" class="stamp-custom-img">`;
      } else {
        // Default SVG fallback
        if (isFilled) {
          stamp.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        } else if (isTier) {
          stamp.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
        }
      }

      grid.appendChild(stamp);
    }
  },

  // Refresh the displayed card with fresh data from store (no re-login needed)
  refreshCard() {
    if (!this.currentClient) return;
    const fresh = Store.getClientById(this.currentClient.id);
    if (!fresh) {
      // Client was deleted — go back to login screen
      this.logout();
      return;
    }
    this.currentClient = fresh;
    if (document.getElementById('client-card').classList.contains('active')) {
      this.showCard();
    }
  },

  logout() {
    this.currentClient = null;
    this.step = 'phone';
    document.getElementById('client-card').classList.remove('active');
    document.getElementById('client-login').classList.add('active');
    document.getElementById('login-phone').value = '';
    document.getElementById('login-name').value = '';
    document.getElementById('login-name-group').style.display = 'none';
    document.getElementById('btn-login').textContent = 'Se connecter';
    document.getElementById('login-message').textContent = '';
    document.getElementById('reward-banner').style.display = 'none';
  }
};
