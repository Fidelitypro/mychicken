// ===== STORE - Couche données localStorage =====
const Store = {
  // --- Config ---
  getConfig() {
    const raw = localStorage.getItem('loyalty_config');
    if (raw) {
      const config = JSON.parse(raw);
      if (!config.rewards) {
        config.rewards = [{
          threshold: config.rewardThreshold || 100,
          description: config.rewardDescription || 'Récompense à définir'
        }];
      }
      if (!config.stampsRewards) {
        config.stampsRewards = [{
          threshold: config.stampsTotal || 10,
          description: config.stampsReward || 'Récompense à définir'
        }];
      }
      if (!config.stampImages) {
        config.stampImages = { stampEmpty: '', stampFilled: '', stampTierEmpty: '', stampTierFilled: '' };
      }
      if (config.logoImage === undefined) config.logoImage = '';
      if (!config.bgColor2) config.bgColor2 = config.bgColor;
      if (!config.stampsPerRow) config.stampsPerRow = 5;
      if (!config.glowColor) config.glowColor = '#FFD700';
      if (!config.headerBg) config.headerBg = '#FFFFFF';
      if (!config.headerText) config.headerText = config.primaryColor || '#E63946';
      if (!config.visibleStats) config.visibleStats = { visits: true, spent: true, since: true };
      if (config.pinAlways === undefined) config.pinAlways = false;
      return config;
    }
    return {
      shopName: 'Mon Commerce',
      primaryColor: '#E63946',
      secondaryColor: '#457B9D',
      bgColor: '#F1FAEE',
      bgColor2: '#F1FAEE',
      loyaltyType: 'points',
      pointsPerEuro: 1,
      rewards: [
        { threshold: 50, description: 'Récompense à définir' },
        { threshold: 100, description: 'Récompense à définir' },
        { threshold: 200, description: 'Récompense à définir' }
      ],
      stampsRewards: [
        { threshold: 5, description: 'Récompense à définir' },
        { threshold: 10, description: 'Récompense à définir' }
      ],
      stampImages: {
        stampEmpty: '',
        stampFilled: '',
        stampTierEmpty: '',
        stampTierFilled: ''
      },
      stampsPerRow: 5,
      glowColor: '#FFD700',
      headerBg: '#FFFFFF',
      headerText: '#E63946',
      visibleStats: { visits: true, spent: true, since: true },
      cashierPin: '1234',
      pinAlways: false,
      logoImage: ''
    };
  },

  saveConfig(config) {
    try {
      localStorage.setItem('loyalty_config', JSON.stringify(config));
    } catch (e) {
      throw new Error('localStorage quota exceeded');
    }
  },

  // --- Clients ---
  getClients() {
    return ClientStore.getClients();
  },

  saveClients(clients) {
    ClientStore.saveClients(clients);
  },

  findClientByPhone(phone) {
    const normalized = phone.replace(/\s/g, '');
    return this.getClients().find(c => c.phone.replace(/\s/g, '') === normalized);
  },

  createClient(name, phone) {
    const clients = this.getClients();
    const client = {
      id: this._uuid(),
      name: name.trim(),
      phone: phone.replace(/\s/g, ''),
      points: 0,
      stamps: 0,
      totalOrders: 0,
      totalSpent: 0,
      lastVisit: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString().split('T')[0],
      history: [],
      claimedRewards: [],      // keys: "type_threshold_cN" e.g. "stamps_5_c1"
      pendingRewards: [],      // rewards earned but not yet validated by merchant
      pendingCycleReset: {},   // {points: {maxThreshold:200}, stamps: {maxThreshold:10}} if reset pending
      cycle: 1
    };
    clients.push(client);
    this.saveClients(clients);
    return client;
  },

  updateClient(id, updates) {
    const clients = this.getClients();
    const idx = clients.findIndex(c => c.id === id);
    if (idx === -1) return null;
    Object.assign(clients[idx], updates);
    this.saveClients(clients);
    return clients[idx];
  },

  removeStamps(clientId, count) {
    const clients = this.getClients();
    const client = clients.find(c => c.id === clientId);
    if (!client) return null;
    this._migrateClient(client);

    const newStamps = Math.max(0, client.stamps - count);
    client.stamps = newStamps;

    // Remove pending rewards whose threshold the client no longer meets
    client.pendingRewards = (client.pendingRewards || []).filter(r => {
      if (!r.key.startsWith('stamps_')) return true;
      return newStamps >= r.threshold;
    });

    // Cancel deferred cycle reset if stamps no longer reach the max threshold
    if (client.pendingCycleReset && client.pendingCycleReset.stamps) {
      if (newStamps < client.pendingCycleReset.stamps.maxThreshold) {
        delete client.pendingCycleReset.stamps;
      }
    }

    this.saveClients(clients);
    return client;
  },

  deleteClient(id) {
    const clients = this.getClients().filter(c => c.id !== id);
    this.saveClients(clients);
  },

  _migrateClient(client) {
    if (!client.claimedRewards) client.claimedRewards = [];
    if (!client.pendingRewards) client.pendingRewards = [];
    if (!client.cycle) client.cycle = 1;
    if (!client.pendingCycleReset) client.pendingCycleReset = {};

    // Migrate old key format "type_threshold" → "type_threshold_c1"
    const migrateKey = k => /^(points|stamps)_\d+$/.test(k) ? k + '_c1' : k;
    client.claimedRewards = client.claimedRewards.map(migrateKey);
    client.pendingRewards = client.pendingRewards.map(r => ({
      ...r,
      key: migrateKey(r.key)
    }));
  },

  // Build the cycle-aware reward key
  _rKey(type, threshold, cycle) {
    return `${type}_${threshold}_c${cycle}`;
  },

  addTransaction(clientId, type, amount, description) {
    const clients = this.getClients();
    const client = clients.find(c => c.id === clientId);
    if (!client) return null;
    this._migrateClient(client);

    const config = this.getConfig();
    const rewardTiers = type === 'points' ? config.rewards : config.stampsRewards;

    // === STEP 1: Apply deferred cycle reset from previous session ===
    if (client.pendingCycleReset[type]) {
      const { maxThreshold } = client.pendingCycleReset[type];
      const currentValue = type === 'points' ? client.points : client.stamps;
      const overflow = Math.max(0, currentValue - maxThreshold);

      if (type === 'points') client.points = overflow;
      else client.stamps = overflow;

      client.cycle = (client.cycle || 1) + 1;
      delete client.pendingCycleReset[type];

      // Log cycle start in history
      client.history.unshift({
        date: new Date().toISOString(),
        type: 'cycle_start',
        description: `Nouveau cycle #${client.cycle} démarré`
      });

      // If overflow already triggers rewards in the new cycle, register them
      if (overflow > 0) {
        this._checkRewards(client, type, rewardTiers);
      }
    }

    // === STEP 2: Create transaction and add to history ===
    const tx = {
      date: new Date().toISOString(),
      type,
      amount,
      description
    };
    client.history.unshift(tx);
    if (client.history.length > 50) client.history = client.history.slice(0, 50);

    // === STEP 3: Apply points/stamps ===
    if (type === 'points') {
      const earned = Math.floor(amount * config.pointsPerEuro);
      client.points += earned;
      client.totalSpent += amount;
      client.totalOrders++;
      tx.earned = earned;

      const newRewards = this._checkRewards(client, 'points', config.rewards);
      if (newRewards.length > 0) {
        tx.rewardClaimed = true;
        tx.rewardsEarned = newRewards;
        tx.description = (description || '') + ' | ' + newRewards.map(r => r.description).join(', ');
      }
      this._checkCycleReset(client, 'points', config.rewards);

      // Immediate cycle carry-over: apply reset now instead of deferring to next transaction
      while (client.pendingCycleReset['points']) {
        const { maxThreshold } = client.pendingCycleReset['points'];
        const overflow = Math.max(0, client.points - maxThreshold);
        client.points = overflow;
        client.cycle = (client.cycle || 1) + 1;
        delete client.pendingCycleReset['points'];
        client.history.unshift({
          date: new Date().toISOString(),
          type: 'cycle_start',
          description: `Nouveau cycle #${client.cycle} démarré`
        });
        if (overflow > 0) {
          this._checkRewards(client, 'points', config.rewards);
        }
        this._checkCycleReset(client, 'points', config.rewards);
      }

    } else if (type === 'stamps') {
      client.stamps += amount;
      client.totalOrders++;

      const newRewards = this._checkRewards(client, 'stamps', config.stampsRewards);
      if (newRewards.length > 0) {
        tx.rewardClaimed = true;
        tx.rewardsEarned = newRewards;
        tx.description = (description || '') + ' | ' + newRewards.map(r => r.description).join(', ');
      }
      this._checkCycleReset(client, 'stamps', config.stampsRewards);
    }

    client.lastVisit = new Date().toISOString().split('T')[0];
    this.saveClients(clients);
    return client;
  },

  // Check which tiers the client just reached → add to pendingRewards (cycle-aware keys)
  _checkRewards(client, type, rewardTiers) {
    const value = type === 'points' ? client.points : client.stamps;
    const cycle = client.cycle || 1;
    const earned = [];
    const sorted = [...rewardTiers].sort((a, b) => a.threshold - b.threshold);

    for (const tier of sorted) {
      const key = this._rKey(type, tier.threshold, cycle);

      // Already pending for this exact cycle — skip
      if (client.pendingRewards.some(r => r.key === key)) continue;
      // Already claimed this cycle — skip
      if (client.claimedRewards.includes(key)) continue;

      if (value >= tier.threshold) {
        // Replace any carry-over pending from a previous cycle for this same threshold
        // (the new cycle's reward supersedes the old one)
        client.pendingRewards = client.pendingRewards.filter(
          r => r.threshold !== tier.threshold
        );

        client.pendingRewards.push({
          key,
          threshold: tier.threshold,
          description: tier.description,
          date: new Date().toISOString(),
          cycle
        });
        earned.push(tier);
      }
    }
    return earned;
  },

  // When all tiers of the current cycle are reached (claimed or pending),
  // schedule a deferred cycle reset: the actual reset happens on the next transaction (STEP 1).
  // This lets the client see the completed card until their next visit.
  _checkCycleReset(client, type, rewardTiers) {
    const sorted = [...rewardTiers].sort((a, b) => a.threshold - b.threshold);
    const maxTier = sorted[sorted.length - 1];
    if (!maxTier) return;

    // Already scheduled
    if (client.pendingCycleReset[type]) return;

    const cycle = client.cycle || 1;
    const allReached = sorted.every(tier => {
      const key = this._rKey(type, tier.threshold, cycle);
      return client.claimedRewards.includes(key) ||
             client.pendingRewards.some(r => r.key === key);
    });

    if (!allReached) return;

    // Schedule deferred reset — applied at the start of the next transaction
    client.pendingCycleReset[type] = { maxThreshold: maxTier.threshold };
  },

  // Merchant validates a pending reward → moves to claimedRewards
  validateReward(clientId, rewardKey) {
    const clients = this.getClients();
    const client = clients.find(c => c.id === clientId);
    if (!client) return null;
    this._migrateClient(client);

    const idx = client.pendingRewards.findIndex(r => r.key === rewardKey);
    if (idx === -1) return client;

    const reward = client.pendingRewards.splice(idx, 1)[0];
    client.claimedRewards.push(reward.key);

    client.history.unshift({
      date: new Date().toISOString(),
      type: 'reward_validated',
      description: 'Récompense validée : ' + reward.description
    });
    if (client.history.length > 50) client.history = client.history.slice(0, 50);

    this.saveClients(clients);
    return client;
  },

  // Get next unclaimed/non-pending tier for progress display (current cycle)
  getNextReward(client, type, rewardTiers) {
    if (!client.claimedRewards) client.claimedRewards = [];
    if (!client.pendingRewards) client.pendingRewards = [];
    const cycle = client.cycle || 1;
    const sorted = [...rewardTiers].sort((a, b) => a.threshold - b.threshold);

    for (const tier of sorted) {
      const key = this._rKey(type, tier.threshold, cycle);
      if (!client.claimedRewards.includes(key) &&
          !client.pendingRewards.some(r => r.key === key)) {
        return tier;
      }
    }
    // All tiers reached for this cycle → return first tier (for next cycle display)
    return sorted[0] || null;
  },

  getClientById(id) {
    return this.getClients().find(c => c.id === id);
  },

  // Bulk import from CSV rows — creates new clients or updates existing ones (matched by phone)
  bulkImportClients(rows) {
    const clients = this.getClients();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Normalize a phone number: strip spaces, handle ="..." Excel formula,
    // and restore leading zero stripped by Excel (9-digit French numbers → 10 digits)
    const normalizePhone = p => {
      let n = (p || '').replace(/\s/g, '');
      const fm = n.match(/^="(.*)"$/);
      if (fm) n = fm[1];
      if (/^\d{9}$/.test(n)) n = '0' + n;
      return n;
    };

    for (const row of rows) {
      const phone = normalizePhone(row.phone);
      const name = (row.name || '').trim();
      if (!phone || !name) { skipped++; continue; }

      const existing = clients.find(c => normalizePhone(c.phone) === phone);

      if (existing) {
        // Update editable fields — preserve internal reward/history state
        if (name) existing.name = name;
        if (row.points !== undefined && row.points !== '') existing.points = parseInt(row.points) || 0;
        if (row.stamps !== undefined && row.stamps !== '') existing.stamps = parseInt(row.stamps) || 0;
        if (row.totalOrders !== undefined && row.totalOrders !== '') existing.totalOrders = parseInt(row.totalOrders) || 0;
        if (row.totalSpent !== undefined && row.totalSpent !== '') existing.totalSpent = parseFloat(row.totalSpent) || 0;
        if (row.lastVisit) existing.lastVisit = row.lastVisit;
        if (row.cycle) existing.cycle = parseInt(row.cycle) || 1;
        updated++;
      } else {
        clients.push({
          id: this._uuid(),
          name,
          phone,
          points: parseInt(row.points) || 0,
          stamps: parseInt(row.stamps) || 0,
          totalOrders: parseInt(row.totalOrders) || 0,
          totalSpent: parseFloat(row.totalSpent) || 0,
          lastVisit: row.lastVisit || new Date().toISOString().split('T')[0],
          createdAt: row.createdAt || new Date().toISOString().split('T')[0],
          history: [],
          claimedRewards: [],
          pendingRewards: [],
          pendingCycleReset: {},
          cycle: parseInt(row.cycle) || 1
        });
        created++;
      }
    }

    if (created > 0 || updated > 0) this.saveClients(clients);
    return { created, updated, skipped };
  },

  _uuid() {
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
      Math.floor(Math.random() * 16).toString(16)
    );
  }
};
