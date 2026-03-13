// ===== APP - Router & Navigation =====
const App = {
  cashierAuthenticated: false,

  async init() {
    await Promise.all([ImageStore.init(), ClientStore.init()]);
    // Précharger le handle du dossier d'export en mémoire (évite un await pendant l'export)
    Cashier._exportDirHandle = await ImageStore.getSetting('exportDirHandle');
    this.applyConfig();
    // Enter key on login
    document.getElementById('login-phone').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') Client.handleLogin();
    });
    document.getElementById('login-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') Client.handleLogin();
    });
    // Enter key on PIN
    document.getElementById('cashier-pin-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') App.validatePin();
    });
    // Enter key on amount modal
    document.getElementById('amount-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') Client.confirmAmount();
    });

    this._checkDailyBackup();
  },

  _checkDailyBackup() {
    const clients = Store.getClients();
    if (clients.length === 0) return;
    const today = new Date().toISOString().split('T')[0];
    const lastBackup = localStorage.getItem('loyalty_last_backup');
    if (lastBackup === today) return;
    document.getElementById('backup-banner').style.display = 'block';
  },

  async confirmDailyBackup() {
    const ok = await Cashier.exportClients();
    if (ok) {
      localStorage.setItem('loyalty_last_backup', new Date().toISOString().split('T')[0]);
      document.getElementById('backup-banner').style.display = 'none';
    }
  },

  skipDailyBackup() {
    localStorage.setItem('loyalty_last_backup', new Date().toISOString().split('T')[0]);
    document.getElementById('backup-banner').style.display = 'none';
  },

  applyConfig() {
    const config = Store.getConfig();
    document.documentElement.style.setProperty('--primary', config.primaryColor);
    document.documentElement.style.setProperty('--secondary', config.secondaryColor);
    document.documentElement.style.setProperty('--bg', config.bgColor);
    document.documentElement.style.setProperty('--bg2', config.bgColor2);
    document.documentElement.style.setProperty('--glow-color', config.glowColor || '#FFD700');
    document.documentElement.style.setProperty('--header-bg', config.headerBg || '#FFFFFF');
    document.documentElement.style.setProperty('--header-text', config.headerText || config.primaryColor);
    document.getElementById('header-shop-name').textContent = config.shopName;
    document.getElementById('login-shop-title').textContent = config.shopName;

    // Apply logo to login page
    const logoImage = ImageStore.getLogo();
    const loginImg = document.getElementById('login-logo-img');
    const loginSvg = document.getElementById('login-logo-svg');
    if (loginImg && loginSvg) {
      if (logoImage) {
        loginImg.src = logoImage;
        loginImg.style.display = 'block';
        loginSvg.style.display = 'none';
      } else {
        loginImg.style.display = 'none';
        loginSvg.style.display = '';
      }
    }

    // Apply logo to loyalty card panel
    const cardSideLogo = document.getElementById('card-side-logo');
    const cardImg = document.getElementById('card-logo-img');
    if (cardSideLogo && cardImg) {
      if (logoImage) {
        cardImg.src = logoImage;
        cardSideLogo.style.display = 'block';
      } else {
        cardSideLogo.style.display = 'none';
      }
    }

    // Apply background image (or fall back to gradient colors)
    const bgImage = ImageStore.getBgImage();
    const tabClient = document.getElementById('tab-client');
    if (tabClient) {
      if (bgImage) {
        tabClient.style.background = `url(${bgImage}) center/cover no-repeat`;
      } else {
        tabClient.style.background = '';
      }
    }
  },

  switchTab(tab) {
    if (tab === 'cashier') {
      const config = Store.getConfig();
      const justValidated = this._pinJustValidated;
      this._pinJustValidated = false;
      if (!this.cashierAuthenticated || (config.pinAlways && !justValidated)) {
        this.showPinModal();
        return;
      }
    }
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`btn-tab-${tab}`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');

    if (tab === 'cashier') {
      Cashier.refreshClientList();
      Customize.loadConfig();

      // If a client is currently logged in, open their profile automatically
      if (Client.currentClient) {
        const client = Store.getClientById(Client.currentClient.id);
        if (client) {
          Cashier.editClient(client.id);
          const cfg = Store.getConfig();
          if (client.pendingRewards && client.pendingRewards.length > 0) {
            Cashier.switchProfileTab('rewards');
          } else if (cfg.loyaltyType === 'points') {
            Cashier.switchProfileTab('add');
          }
        }
      }
    }
  },

  showPinModal() {
    document.getElementById('cashier-pin-modal').style.display = 'flex';
    document.getElementById('cashier-pin-input').value = '';
    document.getElementById('pin-error').style.display = 'none';
    setTimeout(() => document.getElementById('cashier-pin-input').focus(), 100);
  },

  closePinModal() {
    document.getElementById('cashier-pin-modal').style.display = 'none';
  },

  validatePin() {
    const pin = document.getElementById('cashier-pin-input').value;
    const config = Store.getConfig();
    if (pin === config.cashierPin) {
      this.cashierAuthenticated = true;
      this._pinJustValidated = true;
      this.closePinModal();
      this.switchTab('cashier');
    } else {
      document.getElementById('pin-error').style.display = 'block';
      document.getElementById('cashier-pin-input').value = '';
      document.getElementById('cashier-pin-input').focus();
    }
  },

  toast(message, type = '') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast' + (type ? ' ' + type : '');
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.display = 'none'; }, 2500);
  }
};

// Init on load
document.addEventListener('DOMContentLoaded', () => App.init());
