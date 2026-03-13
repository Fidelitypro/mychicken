// ===== CASHIER - Client Management & Points =====
const Cashier = {
  sortField: 'name',
  sortDir: 'asc',
  editingClientId: null,
  _exportDirHandle: null,  // in-memory cache for session

  switchSection(section) {
    document.querySelectorAll('.cashier-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.cashier-nav-btn[data-section="${section}"]`).classList.add('active');
    document.querySelectorAll('.cashier-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`cashier-${section}`).classList.add('active');

    if (section === 'clients') this.refreshClientList();
    if (section === 'customize') Customize.loadConfig();
  },

  // --- Client List ---
  refreshClientList() {
    const clients = Store.getClients();
    const config = Store.getConfig();
    const tbody = document.getElementById('clients-tbody');
    const noClients = document.getElementById('no-clients');
    const search = (document.getElementById('client-search').value || '').toLowerCase();

    let filtered = clients;
    if (search) {
      filtered = clients.filter(c =>
        c.name.toLowerCase().includes(search) ||
        c.phone.includes(search)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let va = a[this.sortField];
      let vb = b[this.sortField];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      if (va < vb) return this.sortDir === 'asc' ? -1 : 1;
      if (va > vb) return this.sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    // Update sort arrows
    document.querySelectorAll('#clients-table th').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.sort === this.sortField) {
        th.classList.add(this.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      noClients.style.display = 'block';
      return;
    }
    noClients.style.display = 'none';

    // Show/hide stamps or points column
    const stampsHeader = document.querySelector('th[data-sort="stamps"]');
    const pointsHeader = document.querySelector('th[data-sort="points"]');
    if (config.loyaltyType === 'stamps') {
      stampsHeader.style.display = '';
      pointsHeader.style.display = 'none';
    } else {
      stampsHeader.style.display = 'none';
      pointsHeader.style.display = '';
    }

    tbody.innerHTML = filtered.map(c => {
      const pending = (c.pendingRewards || []).length;
      const badge = pending > 0
        ? ` <span class="pending-badge">${pending}</span>`
        : '';
      return `<tr class="client-row" onclick="Cashier.editClient('${c.id}')">
        <td><strong>${this._esc(c.name)}</strong>${badge}</td>
        <td>${this._formatPhone(c.phone)}</td>
        <td style="${config.loyaltyType !== 'points' ? 'display:none' : ''}">${c.points}</td>
        <td style="${config.loyaltyType !== 'stamps' ? 'display:none' : ''}">${c.stamps}</td>
        <td>${c.totalOrders}</td>
        <td>${c.lastVisit || '-'}</td>
      </tr>`;
    }).join('');
  },

  filterClients() {
    this.refreshClientList();
  },

  sortBy(field) {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'asc';
    }
    this.refreshClientList();
  },

  // --- Profile Modal ---
  editClient(id) {
    const client = Store.getClientById(id);
    if (!client) return;
    Store._migrateClient(client);
    this.editingClientId = id;

    const config = Store.getConfig();
    const type = config.loyaltyType;

    document.getElementById('edit-client-id').value = id;
    document.getElementById('profile-title').textContent = client.name;

    // Stats row
    const value = type === 'points' ? client.points : client.stamps;
    document.getElementById('profile-points').textContent = value;
    document.getElementById('profile-points-label').textContent = type === 'points' ? 'Points' : 'Tampons';
    document.getElementById('profile-orders').textContent = client.totalOrders;
    document.getElementById('profile-spent').textContent = (client.totalSpent || 0).toFixed(0) + '€';

    // Edit fields
    document.getElementById('edit-name').value = client.name;
    document.getElementById('edit-phone').value = client.phone;
    document.getElementById('edit-points').value = client.points;
    document.getElementById('edit-stamps').value = client.stamps;

    // Meta
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const d = new Date(client.createdAt);
    document.getElementById('profile-meta').textContent =
      `Membre depuis ${months[d.getMonth()]} ${d.getFullYear()}`;

    // Render tabs content
    this._renderProfileRewards(client, config);
    this._renderProfileHistory(client);
    this._renderProfileAdd(client, config);

    // Start on info tab
    this.switchProfileTab('info');
    document.getElementById('client-edit-modal').style.display = 'flex';
  },

  switchProfileTab(tab) {
    document.querySelectorAll('.profile-tab').forEach(b => b.classList.remove('active'));
    document.querySelector(`.profile-tab[data-ptab="${tab}"]`).classList.add('active');
    document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`ptab-${tab}`).classList.add('active');
  },

  _renderProfileRewards(client, config) {
    const type = config.loyaltyType;
    const tiers = type === 'points' ? config.rewards : config.stampsRewards;
    const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
    const cycle = client.cycle || 1;
    const unit = type === 'points' ? 'pts' : 'tampons';
    const list = document.getElementById('profile-rewards-list');
    const noRewards = document.getElementById('profile-no-rewards');

    if (sorted.length === 0) {
      list.innerHTML = '';
      noRewards.style.display = 'block';
      return;
    }
    noRewards.style.display = 'none';

    const items = sorted.map(tier => {
      // Match any pending reward for this threshold (regardless of cycle)
      // There is always at most one pending per threshold due to the superseding logic in _checkRewards
      const pendingReward = (client.pendingRewards || []).find(r => r.threshold === tier.threshold);
      const isPending = !!pendingReward;

      // Claimed means validated in the CURRENT cycle
      const keyNew = `${type}_${tier.threshold}_c${cycle}`;
      const keyOld = `${type}_${tier.threshold}`;
      const isClaimed = (client.claimedRewards || []).includes(keyNew) ||
                        (client.claimedRewards || []).includes(keyOld);

      let itemClass = 'reward-locked';
      let icon = '🔒';
      let statusHTML = `<span class="reward-status-text muted">${tier.threshold} ${unit}</span>`;

      if (isPending) {
        itemClass = 'reward-pending';
        icon = '🎁';
        const dateStr = pendingReward.date
          ? new Date(pendingReward.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
          : '';
        const keyToValidate = pendingReward.key;
        const pendingCycle = pendingReward.cycle || 1;
        const isCarryOver = pendingCycle < cycle;
        const metaText = isCarryOver
          ? `Report cycle ${pendingCycle}${dateStr ? ' — le ' + dateStr : ''} — à valider avant palier atteint`
          : `Obtenu${dateStr ? ' le ' + dateStr : ''} — en attente de validation`;
        statusHTML = `<button class="btn-validate" onclick="Cashier.validateReward('${client.id}', '${keyToValidate}')">✓ Valider</button>`;
        return `<div class="profile-reward-item ${itemClass}${isCarryOver ? ' reward-carryover' : ''}">
          <span class="profile-reward-icon">${isCarryOver ? '🔁' : icon}</span>
          <div class="profile-reward-info">
            <div class="profile-reward-desc">${this._esc(tier.description)}</div>
            <div class="profile-reward-meta">${metaText}</div>
          </div>
          ${statusHTML}
        </div>`;
      } else if (isClaimed) {
        itemClass = 'reward-claimed';
        icon = '✅';
        statusHTML = `<span class="reward-status-text success">Validé</span>`;
      }

      return `<div class="profile-reward-item ${itemClass}">
        <span class="profile-reward-icon">${icon}</span>
        <div class="profile-reward-info">
          <div class="profile-reward-desc">${this._esc(tier.description)}</div>
          <div class="profile-reward-meta">${tier.threshold} ${unit}</div>
        </div>
        ${statusHTML}
      </div>`;
    }).join('');

    list.innerHTML = items;
  },

  _renderProfileHistory(client) {
    const list = document.getElementById('profile-history-list');
    const history = client.history || [];

    if (history.length === 0) {
      list.innerHTML = '<li class="history-empty">Aucun historique</li>';
      return;
    }

    const typeIcons = { points: '💰', stamps: '🔵', reward_validated: '✅' };

    list.innerHTML = history.map(tx => {
      const d = new Date(tx.date);
      const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const icon = typeIcons[tx.type] || '📝';
      return `<li class="profile-history-item">
        <span class="history-type-icon">${icon}</span>
        <span class="history-desc">${this._esc(tx.description || tx.type)}</span>
        <span class="history-date">${dateStr}</span>
      </li>`;
    }).join('');
  },

  validateReward(clientId, rewardKey) {
    const client = Store.validateReward(clientId, rewardKey);
    if (!client) return;

    const config = Store.getConfig();
    // Refresh rewards and history in modal
    this._renderProfileRewards(client, config);
    this._renderProfileHistory(client);

    // Update stats row
    const type = config.loyaltyType;
    const value = type === 'points' ? client.points : client.stamps;
    document.getElementById('profile-points').textContent = value;

    this.refreshClientList();
    this._liveRefreshClientTab(clientId);
    App.toast('Récompense validée ! 🎉', 'success');
  },

  saveClient() {
    const id = document.getElementById('edit-client-id').value;
    Store.updateClient(id, {
      name: document.getElementById('edit-name').value.trim(),
      phone: document.getElementById('edit-phone').value.replace(/\s/g, ''),
      points: parseInt(document.getElementById('edit-points').value) || 0,
      stamps: parseInt(document.getElementById('edit-stamps').value) || 0
    });
    this.closeEditModal();
    this.refreshClientList();
    this._liveRefreshClientTab(id);
    App.toast('Client mis à jour', 'success');
  },

  deleteClient() {
    if (!confirm('Supprimer ce client ? Cette action est irréversible.')) return;
    const id = document.getElementById('edit-client-id').value;
    Store.deleteClient(id);
    this.closeEditModal();
    this.refreshClientList();
    this._liveRefreshClientTab(id); // will auto-logout if this client is displayed
    App.toast('Client supprimé');
  },

  closeEditModal() {
    document.getElementById('client-edit-modal').style.display = 'none';
    this.editingClientId = null;
  },

  // --- Profile Add Tab ---
  _renderProfileAdd(client, config) {
    const container = document.getElementById('profile-add-container');
    if (!container) return;
    const type = config.loyaltyType;

    if (type === 'points') {
      container.innerHTML = `
        <div class="profile-add-section">
          <div class="profile-add-current">
            <span class="profile-add-label">Solde actuel</span>
            <span class="profile-add-value">${client.points} points</span>
          </div>
          <div class="form-group">
            <label for="profile-ap-amount">Montant de l'achat (€)</label>
            <div class="amount-input-wrap">
              <input type="number" id="profile-ap-amount" min="0" step="0.01" placeholder="0.00"
                oninput="Cashier.calcProfilePoints()">
              <span class="amount-currency">€</span>
            </div>
          </div>
          <p class="ap-calc" id="profile-ap-calc"></p>
          <button class="btn btn-primary btn-large profile-add-btn" onclick="Cashier.addPointsFromProfile()">
            + Ajouter les points
          </button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="profile-add-section">
          <div class="profile-add-current">
            <span class="profile-add-label">Solde actuel</span>
            <span class="profile-add-value">${client.stamps} tampons</span>
          </div>
          <div class="form-group">
            <label>Nombre de tampons à ajouter</label>
            <div class="stamps-add-btns">
              <button class="btn btn-outline" onclick="Cashier.addStampsFromProfile(1)">+1</button>
              <button class="btn btn-outline" onclick="Cashier.addStampsFromProfile(2)">+2</button>
              <button class="btn btn-outline" onclick="Cashier.addStampsFromProfile(3)">+3</button>
              <button class="btn btn-primary" onclick="Cashier.addStampsFromProfile(5)">+5</button>
            </div>
          </div>
          <div class="form-group">
            <label>Retirer un tampon</label>
            <div class="stamps-add-btns">
              <button class="btn btn-danger" onclick="Cashier.removeStampsFromProfile(1)">−1</button>
            </div>
          </div>
        </div>
      `;
    }
  },

  calcProfilePoints() {
    const config = Store.getConfig();
    const val = parseFloat(document.getElementById('profile-ap-amount').value) || 0;
    const pts = Math.floor(val * config.pointsPerEuro);
    const calc = document.getElementById('profile-ap-calc');
    if (calc) calc.textContent = pts > 0 ? `= ${pts} point${pts > 1 ? 's' : ''}` : '';
  },

  addPointsFromProfile() {
    const id = this.editingClientId;
    if (!id) return;
    const amount = parseFloat(document.getElementById('profile-ap-amount').value);
    if (!amount || amount <= 0) {
      App.toast('Entrez un montant valide', 'error');
      return;
    }
    const config = Store.getConfig();
    const earned = Math.floor(amount * config.pointsPerEuro);
    const client = Store.addTransaction(id, 'points', amount, `Achat de ${amount}€`);
    if (client) {
      this._refreshProfileAfterAdd(client, config);
      const tx = client.history[0];
      const msg = tx && tx.rewardClaimed
        ? `+${earned} pts — 🎁 Récompense à valider !`
        : `+${earned} point${earned > 1 ? 's' : ''} ajouté${earned > 1 ? 's' : ''}`;
      App.toast(msg, 'success');
      this._liveRefreshClientTab(id);
    }
  },

  addStampsFromProfile(count) {
    const id = this.editingClientId;
    if (!id) return;
    const client = Store.addTransaction(id, 'stamps', count, `+${count} tampon${count > 1 ? 's' : ''}`);
    if (client) {
      const config = Store.getConfig();
      this._refreshProfileAfterAdd(client, config);
      const tx = client.history[0];
      const msg = tx && tx.rewardClaimed
        ? `+${count} tampon${count > 1 ? 's' : ''} — 🎁 Récompense à valider !`
        : `+${count} tampon${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''}`;
      App.toast(msg, 'success');
      this._liveRefreshClientTab(id);
    }
  },

  removeStampsFromProfile(count) {
    const id = this.editingClientId;
    if (!id) return;
    const client = Store.getClientById(id);
    if (!client) return;
    if (client.stamps <= 0) {
      App.toast('Le client n\'a aucun tampon à retirer', 'error');
      return;
    }
    const updated = Store.removeStamps(id, count);
    const config = Store.getConfig();
    this._refreshProfileAfterAdd(updated, config);
    App.toast(`−${count} tampon retiré`, 'success');
    this._liveRefreshClientTab(id);
  },

  _refreshProfileAfterAdd(client, config) {
    const type = config.loyaltyType;
    const value = type === 'points' ? client.points : client.stamps;
    // Update stats row
    document.getElementById('profile-points').textContent = value;
    document.getElementById('profile-orders').textContent = client.totalOrders;
    document.getElementById('profile-spent').textContent = (client.totalSpent || 0).toFixed(0) + '€';
    // Refresh all tabs
    this._renderProfileRewards(client, config);
    this._renderProfileHistory(client);
    this._renderProfileAdd(client, config);
    this.refreshClientList();
  },

  // Refresh the client tab live if the given client is currently displayed
  _liveRefreshClientTab(clientId) {
    if (Client.currentClient && Client.currentClient.id === clientId) {
      Client.refreshCard();
    }
  },

  // --- CSV Export / Import ---
  async exportClients() {
    const clients = Store.getClients();
    if (clients.length === 0) {
      App.toast('Aucun client à exporter', 'error');
      return false;
    }

    const headers = ['Nom', 'Téléphone', 'Points', 'Tampons', 'Commandes', 'Dépensé (€)', 'Dernière visite', 'Membre depuis'];
    const rows = clients.map(c => [
      this._csvEsc(c.name),
      `="${c.phone}"`,  // force Excel to treat as text → préserve le 0 initial
      c.points,
      c.stamps,
      c.totalOrders,
      (c.totalSpent || 0).toFixed(2),
      c.lastVisit || '',
      c.createdAt || ''
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const filename = `clients_${new Date().toISOString().split('T')[0]}.csv`;
    const label = `${clients.length} client${clients.length > 1 ? 's' : ''} exporté${clients.length > 1 ? 's' : ''}`;

    // --- File System Access API : sauvegarde directe dans le dossier ---
    if ('showDirectoryPicker' in window) {
      try {
        let dirHandle = this._exportDirHandle; // handle déjà en mémoire (chargé à l'init)

        if (dirHandle) {
          // requestPermission nécessite un geste utilisateur — on est dans un clic, ça fonctionne
          const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
          if (perm !== 'granted') dirHandle = null;
        }

        if (!dirHandle) {
          App.toast('Sélectionnez le dossier "Informations Clients"', '');
          dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'desktop' });
          this._exportDirHandle = dirHandle;
          await ImageStore.saveSetting('exportDirHandle', dirHandle);
        }

        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        App.toast(label, 'success');
        return true;

      } catch (e) {
        if (e.name === 'AbortError') return false; // Utilisateur a annulé le sélecteur
        console.warn('Export dossier échoué, retour au téléchargement:', e);
        // Ne pas supprimer le handle — il pourra être réutilisé à la prochaine session
      }
    }

    // --- Fallback : téléchargement navigateur classique ---
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    App.toast(label, 'success');
    return true;
  },

  importClients(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result.replace(/^\uFEFF/, ''); // strip BOM
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) {
          App.toast('Fichier CSV vide ou invalide', 'error');
          input.value = '';
          return;
        }

        const rawHeaders = this._csvParseLine(lines[0]);
        const headers = rawHeaders.map(h => h.trim().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
        );

        // Map header names to internal field keys
        const fieldMap = {
          'nom': 'name', 'name': 'name',
          'telephone': 'phone', 'phone': 'phone',
          'points': 'points',
          'tampons': 'stamps', 'stamps': 'stamps',
          'commandes': 'totalOrders', 'totalorders': 'totalOrders',
          'depense (e)': 'totalSpent', 'depense': 'totalSpent', 'totalspent': 'totalSpent',
          'derniere visite': 'lastVisit', 'lastvisit': 'lastVisit',
          'membre depuis': 'createdAt', 'createdat': 'createdAt',
          'cycle': 'cycle'
        };

        const rows = lines.slice(1).map(line => {
          const cols = this._csvParseLine(line);
          const obj = {};
          headers.forEach((h, i) => {
            const field = fieldMap[h];
            if (field) obj[field] = (cols[i] || '').trim();
          });
          return obj;
        }).filter(r => r.name && r.phone);

        if (rows.length === 0) {
          App.toast('Aucun client valide trouvé (colonnes Nom + Téléphone requis)', 'error');
          input.value = '';
          return;
        }

        const { created, updated, skipped } = Store.bulkImportClients(rows);
        this.refreshClientList();
        const parts = [];
        if (created > 0) parts.push(`${created} créé${created > 1 ? 's' : ''}`);
        if (updated > 0) parts.push(`${updated} mis à jour`);
        if (skipped > 0) parts.push(`${skipped} ignoré${skipped > 1 ? 's' : ''}`);
        App.toast(parts.join(', '), 'success');
      } catch (err) {
        App.toast('Erreur lors de la lecture du CSV', 'error');
      }
      input.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  },

  _csvEsc(str) {
    str = String(str || '');
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  },

  _csvParseLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  },

  // --- Utils ---
  _esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  _formatPhone(phone) {
    const clean = phone.replace(/\s/g, '');
    if (clean.length === 10) {
      return clean.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
    }
    return clean;
  }
};
