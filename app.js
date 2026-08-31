/**
 * JSW Plant Electrical Department - Digital Inventory Management System
 * Enterprise Industrial Engine (SAP / Oracle Architecture)
 * Progressive Web App (PWA), Role-Based Landing Gateway, Admin Dashboard & Self-Checkout,
 * Employee Mobile Experience, and Background Offline Synchronization
 */

(function () {
  'use strict';

  // =========================================================================
  // Database Collections Defaults (Clean Slate - No Fake Demo Data)
  // =========================================================================
  const DEFAULT_USERS = [];
  const DEFAULT_INVENTORY = [];
  const DEFAULT_TRANSACTIONS = [];

  // =========================================================================
  // Robust RFC-4180 CSV Parser & Formatter Utility
  // =========================================================================
  const CsvUtil = {
    // Parse CSV text into array of string arrays (handles quotes, commas, multiline cells)
    parse(text) {
      if (!text || typeof text !== 'string') return [];
      const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (!cleanText.trim()) return [];

      const rows = [];
      let currentRow = [];
      let currentCell = '';
      let inQuotes = false;

      for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        const nextChar = cleanText[i + 1];

        if (inQuotes) {
          if (char === '"') {
            if (nextChar === '"') {
              currentCell += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            currentCell += char;
          }
        } else {
          if (char === '"') {
            inQuotes = true;
          } else if (char === ',') {
            currentRow.push(currentCell.trim());
            currentCell = '';
          } else if (char === '\n') {
            currentRow.push(currentCell.trim());
            if (currentRow.some(c => c.length > 0)) {
              rows.push(currentRow);
            }
            currentRow = [];
            currentCell = '';
          } else {
            currentCell += char;
          }
        }
      }

      if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) {
          rows.push(currentRow);
        }
      }

      return rows;
    },

    // Map raw parsed rows to Inventory objects
    parseInventoryRows(rawRows) {
      if (!rawRows || rawRows.length === 0) return { valid: [], invalid: [], totalRows: 0 };

      let startIndex = 0;
      let idIdx = 0;
      let nameIdx = 1;
      let stockIdx = 2;
      let binIdx = -1;

      const firstRow = rawRows[0].map(c => c.toLowerCase().replace(/[\s_-]+/g, ''));
      const hasHeader = firstRow.some(c => 
        c.includes('itemid') || c.includes('item') || c.includes('sku') || 
        c.includes('name') || c.includes('stock') || c.includes('qty') || c.includes('quantity') ||
        c.includes('bin') || c.includes('location')
      );

      if (hasHeader) {
        startIndex = 1;
        firstRow.forEach((col, idx) => {
          if (col === 'itemid' || col === 'id' || col === 'sku' || col === 'code' || col === 'materialid' || col === 'materialcode') idIdx = idx;
          else if (col === 'itemname' || col === 'name' || col === 'description' || col === 'materialname' || col === 'itemdescription') nameIdx = idx;
          else if (col.includes('stock') || col.includes('qty') || col.includes('quantity') || col.includes('level')) stockIdx = idx;
          else if (col.includes('bin') || col.includes('location') || col.includes('rack') || col.includes('shelf')) binIdx = idx;
        });
      }

      const valid = [];
      const invalid = [];

      for (let i = startIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (row.length === 0 || (row.length === 1 && !row[0])) continue;

        const rawId = (row[idIdx] || '').trim();
        const rawName = (row[nameIdx] || (idIdx !== 0 && row[0]) || '').trim();
        const rawStock = (row[stockIdx] !== undefined ? row[stockIdx] : '0').trim();
        const rawBin = (binIdx !== -1 && row[binIdx] !== undefined ? row[binIdx] : '').trim();

        const parsedStock = parseInt(rawStock, 10);
        const stock = isNaN(parsedStock) ? 0 : parsedStock;
        const binningLocation = rawBin || '-';

        if (rawId && rawName) {
          valid.push({
            Item_ID: rawId,
            Item_Name: rawName,
            Current_Stock_Level: stock,
            binningLocation: binningLocation
          });
        } else {
          invalid.push({
            rowNumber: i + 1,
            raw: row.join(', '),
            reason: !rawId ? 'Missing Item ID' : 'Missing Item Name'
          });
        }
      }

      return { valid, invalid, totalRows: rawRows.length - (hasHeader ? 1 : 0) };
    },

    // Map raw parsed rows to Employee objects
    parseEmployeeRows(rawRows) {
      if (!rawRows || rawRows.length === 0) return { valid: [], invalid: [], totalRows: 0 };

      let startIndex = 0;
      let idIdx = 0;
      let nameIdx = 1;

      const firstRow = rawRows[0].map(c => c.toLowerCase().replace(/[\s_-]+/g, ''));
      const hasHeader = firstRow.some(c => 
        c.includes('empid') || c.includes('employeeid') || c.includes('emp') || 
        c.includes('name') || c.includes('badge') || c.includes('staff')
      );

      if (hasHeader) {
        startIndex = 1;
        firstRow.forEach((col, idx) => {
          if (col === 'employeeid' || col === 'empid' || col === 'id' || col === 'badge' || col === 'badgeid') idIdx = idx;
          else if (col === 'fullname' || col === 'name' || col === 'employeename' || col === 'staffname') nameIdx = idx;
        });
      }

      const valid = [];
      const invalid = [];

      for (let i = startIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (row.length === 0 || (row.length === 1 && !row[0])) continue;

        const rawId = (row[idIdx] || '').trim();
        const rawName = (row[nameIdx] || (idIdx !== 0 && row[0]) || '').trim();

        if (rawId && rawName) {
          valid.push({
            Employee_ID: rawId,
            Full_Name: rawName
          });
        } else {
          invalid.push({
            rowNumber: i + 1,
            raw: row.join(', '),
            reason: !rawId ? 'Missing Employee ID' : 'Missing Full Name'
          });
        }
      }

      return { valid, invalid, totalRows: rawRows.length - (hasHeader ? 1 : 0) };
    }
  };

  // Admin Profile Identity
  const ADMIN_PROFILE = {
    Employee_ID: "1027548",
    Full_Name: "Basheer"
  };

  // =========================================================================
  // Progressive Web App (PWA) & Service Worker Registration
  // =========================================================================
  const PwaManager = {
    deferredPrompt: null,
    isIos: false,
    isStandalone: false,

    init() {
      // 1. Register Service Worker
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./sw.js')
            .then(reg => {
              console.log('[PWA] Service Worker registered in scope:', reg.scope);
            })
            .catch(err => {
              console.error('[PWA] Service Worker registration failed:', err);
            });
        });
      }

      // 2. Check if already running in standalone mode
      this.isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                          window.navigator.standalone === true;

      // 3. Detect iOS Safari
      const ua = window.navigator.userAgent.toLowerCase();
      this.isIos = /iphone|ipad|ipod/.test(ua) && !window.MSStream;

      // 4. Listen for Chrome/Android Install Prompt
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this.deferredPrompt = e;
        this.showInstallPromotion();
      });

      // 5. Listen for completed installation
      window.addEventListener('appinstalled', () => {
        this.deferredPrompt = null;
        this.hideInstallPromotion();
        App.showToast('Zap Track successfully installed on your device.', 'success');
      });

      this.bindPwaEvents();

      // Show iOS guide or general promotion on mobile browsers
      if (!this.isStandalone) {
        setTimeout(() => {
          if (this.isIos || this.deferredPrompt) {
            this.showInstallPromotion();
          }
        }, 1200);
      }
    },

    showInstallPromotion() {
      if (this.isStandalone) return;
      if (sessionStorage.getItem('jindal_pwa_dismissed')) return;

      const banner = document.getElementById('pwaInstallBanner');
      const headerBtn = document.getElementById('globalInstallAppHeaderBtn');
      const installBtn = document.getElementById('pwaInstallActionBtn');
      const iosBtn = document.getElementById('pwaIosGuideBtn');

      if (banner) banner.classList.remove('hidden');
      if (headerBtn) headerBtn.classList.remove('hidden');

      if (this.isIos) {
        installBtn?.classList.add('hidden');
        iosBtn?.classList.remove('hidden');
      } else {
        installBtn?.classList.remove('hidden');
        iosBtn?.classList.add('hidden');
      }
    },

    hideInstallPromotion() {
      const banner = document.getElementById('pwaInstallBanner');
      if (banner) banner.classList.add('hidden');
    },

    triggerInstall() {
      if (this.deferredPrompt) {
        this.deferredPrompt.prompt();
        this.deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('[PWA] User accepted installation prompt');
          } else {
            console.log('[PWA] User dismissed installation prompt');
          }
          this.deferredPrompt = null;
          this.hideInstallPromotion();
        });
      } else if (this.isIos) {
        App.openModal('pwaIosModal');
      } else {
        App.showToast('To install: Open browser menu (⋮) and tap "Install App" or "Add to Home screen".', 'info');
      }
    },

    bindPwaEvents() {
      document.getElementById('pwaInstallActionBtn')?.addEventListener('click', () => this.triggerInstall());
      document.getElementById('pwaIosGuideBtn')?.addEventListener('click', () => App.openModal('pwaIosModal'));
      document.getElementById('globalInstallAppHeaderBtn')?.addEventListener('click', () => this.triggerInstall());
      document.getElementById('landingInstallPwaBtn')?.addEventListener('click', () => this.triggerInstall());
      
      document.getElementById('pwaDismissBtn')?.addEventListener('click', () => {
        sessionStorage.setItem('jindal_pwa_dismissed', 'true');
        this.hideInstallPromotion();
      });
    }
  };

  // =========================================================================
  // Local Storage State Manager (PRD Section 4.3 Local Caching)
  // =========================================================================
  const Storage = {
    KEYS: {
      USERS: 'jindal_db_users',
      INVENTORY: 'jindal_db_inventory',
      TRANSACTIONS: 'jindal_db_transactions',
      PENDING_QUEUE: 'jindal_pending_transactions',
      SESSION: 'jindal_active_session',
      ADMIN_SESSION: 'jindal_admin_session',
      NETWORK_MODE: 'jindal_sim_network_mode',
      CLEAN_VERSION: 'jindal_db_clean_version'
    },

    init() {
      // Force clean session purge so the UI is completely un-frozen and interactive
      const cleanVer = localStorage.getItem(this.KEYS.CLEAN_VERSION);
      if (cleanVer !== 'v4_unfrozen_clean') {
        localStorage.removeItem(this.KEYS.SESSION);
        localStorage.removeItem(this.KEYS.ADMIN_SESSION);
        localStorage.setItem(this.KEYS.CLEAN_VERSION, 'v4_unfrozen_clean');
      }

      if (this.get(this.KEYS.USERS) === null) {
        this.save(this.KEYS.USERS, []);
      }
      if (this.get(this.KEYS.INVENTORY) === null) {
        this.save(this.KEYS.INVENTORY, []);
      }
      if (this.get(this.KEYS.TRANSACTIONS) === null) {
        this.save(this.KEYS.TRANSACTIONS, []);
      }
      if (this.get(this.KEYS.PENDING_QUEUE) === null) {
        this.save(this.KEYS.PENDING_QUEUE, []);
      }
    },

    get(key) {
      try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        console.error('Storage get error:', e);
        return null;
      }
    },

    save(key, data) {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (e) {
        console.error('Storage save error:', e);
      }
    },

    remove(key) {
      localStorage.removeItem(key);
    },

    resetAll() {
      localStorage.removeItem(this.KEYS.USERS);
      localStorage.removeItem(this.KEYS.INVENTORY);
      localStorage.removeItem(this.KEYS.TRANSACTIONS);
      localStorage.removeItem(this.KEYS.PENDING_QUEUE);
      localStorage.removeItem(this.KEYS.SESSION);
      localStorage.removeItem(this.KEYS.ADMIN_SESSION);
      this.init();
    }
  };

  // =========================================================================
  // Offline & Background Synchronization Manager (PRD Section 4.3)
  // =========================================================================
  const OfflineManager = {
    isOnline: true,
    isManualDeadZone: false,

    init() {
      const savedNet = localStorage.getItem(Storage.KEYS.NETWORK_MODE);
      if (savedNet === 'deadzone') {
        this.isManualDeadZone = true;
        this.isOnline = false;
      } else {
        this.isOnline = navigator.onLine !== undefined ? navigator.onLine : true;
      }

      window.addEventListener('online', () => {
        if (!this.isManualDeadZone) {
          this.setOnlineState(true, 'Connection restored');
        }
      });

      window.addEventListener('offline', () => {
        this.setOnlineState(false, 'Network disconnected');
      });

      this.updateNetworkUI();
      
      if (this.isOnline) {
        setTimeout(() => this.syncPendingTransactions(true), 800);
      }
    },

    toggleNetworkMode() {
      if (this.isOnline) {
        this.isManualDeadZone = true;
        localStorage.setItem(Storage.KEYS.NETWORK_MODE, 'deadzone');
        this.setOnlineState(false, 'Switched to Dead Zone Storage (Offline)');
      } else {
        this.isManualDeadZone = false;
        localStorage.setItem(Storage.KEYS.NETWORK_MODE, 'online');
        this.setOnlineState(true, 'Connected to Central Server');
      }
    },

    setOnlineState(online, reason = '') {
      const wasOffline = !this.isOnline;
      this.isOnline = online;
      this.updateNetworkUI();

      if (online) {
        App.showToast(`Network Online: ${reason || 'Connected'}`, 'success');
        if (wasOffline) {
          this.syncPendingTransactions();
        }
      } else {
        App.showToast(`Dead Zone Active: Checkouts queued locally.`, 'warning');
      }
    },

    getPendingQueue() {
      return Storage.get(Storage.KEYS.PENDING_QUEUE) || [];
    },

    savePendingQueue(queue) {
      Storage.save(Storage.KEYS.PENDING_QUEUE, queue);
      this.updateQueueBadge();
    },

    queueOfflineTransaction(txn) {
      const queue = this.getPendingQueue();
      txn.Sync_Status = false;
      queue.push(txn);
      this.savePendingQueue(queue);

      App.transactions.unshift(txn);
      App.saveTransactions();

      this.updateQueueBadge();
    },

    syncPendingTransactions(silent = false) {
      if (!this.isOnline) {
        App.showToast('Cannot sync: Device is currently offline in a dead zone.', 'warning');
        return;
      }

      const queue = this.getPendingQueue();
      if (queue.length === 0) {
        if (!silent) {
          App.showToast('All transactions are synchronized to the central database.', 'info');
        }
        return;
      }

      const count = queue.length;

      queue.forEach(pendingTxn => {
        const existing = App.transactions.find(t => t.Transaction_ID === pendingTxn.Transaction_ID);
        if (existing) {
          existing.Sync_Status = true;
        } else {
          pendingTxn.Sync_Status = true;
          App.transactions.unshift(pendingTxn);
        }
      });

      this.savePendingQueue([]);
      App.saveTransactions();
      App.renderAll();

      App.showToast(`Background Sync: Pushed ${count} offline checkout(s) to central database.`, 'success');
    },

    updateNetworkUI() {
      const netToggleBtn = document.getElementById('globalNetworkToggleBtn');
      const netStatusText = document.getElementById('globalNetStatusText');

      if (netToggleBtn && netStatusText) {
        if (this.isOnline) {
          netToggleBtn.className = 'btn-network-toggle online';
          const cloudReady = typeof CloudDB !== 'undefined' && CloudDB.isReady();
          netStatusText.innerHTML = cloudReady 
            ? `Network: <strong>Online (Cloud Firestore)</strong>` 
            : `Network: <strong>Online (Central DB)</strong>`;
          netToggleBtn.title = 'Click to simulate Storage Dead Zone (Offline Mode)';
        } else {
          netToggleBtn.className = 'btn-network-toggle offline';
          netStatusText.innerHTML = `Network: <strong>Dead Zone (Offline)</strong>`;
          netToggleBtn.title = 'Click to reconnect and sync offline queue';
        }
      }

      const adminServerPill = document.getElementById('adminServerStatusPill');
      const adminServerText = document.getElementById('adminServerStatusText');
      if (adminServerPill && adminServerText) {
        if (this.isOnline) {
          adminServerPill.className = 'plant-status-pill';
          const cloudReady = typeof CloudDB !== 'undefined' && CloudDB.isReady();
          adminServerText.innerHTML = cloudReady
            ? `Central Server: <strong>Online (Cloud Firestore)</strong>`
            : `Central Server: <strong>Online</strong>`;
        } else {
          adminServerPill.className = 'plant-status-pill offline';
          adminServerText.innerHTML = `Central Server: <strong>Offline</strong>`;
        }
      }

      const mNetBadge = document.getElementById('mobileNetworkStatusBtn');
      const mNetText = document.getElementById('mobileNetBadgeText');
      if (mNetBadge && mNetText) {
        if (this.isOnline) {
          mNetBadge.className = 'network-badge online';
          mNetText.textContent = 'Online';
        } else {
          mNetBadge.className = 'network-badge offline';
          mNetText.textContent = 'Dead Zone';
        }
      }

      const mNotice = document.getElementById('mobileOfflineNotice');
      const mNoticeText = document.getElementById('mobileOfflineNoticeText');
      const mSyncBtn = document.getElementById('mobileSyncNowBtn');
      const queue = this.getPendingQueue();

      if (mNotice) {
        if (!this.isOnline) {
          mNotice.classList.remove('hidden');
          if (mNoticeText) mNoticeText.textContent = `Dead Zone Active: ${queue.length} checkout(s) stored in local offline queue.`;
          mSyncBtn?.classList.add('hidden');
        } else if (queue.length > 0) {
          mNotice.classList.remove('hidden');
          if (mNoticeText) mNoticeText.textContent = `Connection restored: ${queue.length} checkout(s) ready to sync.`;
          mSyncBtn?.classList.remove('hidden');
        } else {
          mNotice.classList.add('hidden');
        }
      }

      const checkoutStateBadge = document.getElementById('checkoutNetworkStateBadge');
      if (checkoutStateBadge) {
        if (this.isOnline) {
          checkoutStateBadge.innerHTML = `<span style="color: var(--jindal-green); font-weight: 700;">🟢 Online (Instant Sync)</span>`;
        } else {
          checkoutStateBadge.innerHTML = `<span style="color: var(--state-warning); font-weight: 700;">🔴 Dead Zone (Queued Locally)</span>`;
        }
      }

      this.updateQueueBadge();
    },

    updateQueueBadge() {
      const queue = this.getPendingQueue();
      const badge = document.getElementById('globalPendingQueueBadge');
      const countEl = document.getElementById('globalPendingQueueCount');

      if (badge && countEl) {
        countEl.textContent = queue.length;
        if (queue.length > 0) {
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    }
  };

  // =========================================================================
  // Cloud Database Backend Manager (Google Firebase Firestore)
  // Real-Time Multi-Device Synchronization across all 27 employees & Admin
  // =========================================================================
  const CloudDB = {
    isReady() {
      return typeof window !== 'undefined' && 
             typeof window.isFirebaseConfigured === 'function' && 
             window.isFirebaseConfigured() && 
             Boolean(window.db);
    },

    initRealtimeListeners(app) {
      if (!this.isReady()) {
        console.log('[CloudDB] Offline/Local mode active. Firebase keys not yet configured.');
        return;
      }

      console.log('[CloudDB] Attaching real-time multi-device listeners...');

      // 1. Real-time Inventory Listener
      window.db.collection('inventory').onSnapshot((snapshot) => {
        if (snapshot.empty) {
          // If Firestore is completely empty on initial launch, seed with local inventory
          if (app.inventory && app.inventory.length > 0) {
            this.bulkUploadInventory(app.inventory, 'append');
          }
          return;
        }

        const cloudItems = [];
        snapshot.forEach((doc) => {
          cloudItems.push(doc.data());
        });

        if (cloudItems.length > 0) {
          app.inventory = cloudItems;
          Storage.save(Storage.KEYS.INVENTORY, cloudItems);
          app.renderInventoryTable();
          app.renderMobileCatalog();
          app.updateDashboardStats();
        }
      }, (err) => {
        console.warn('[CloudDB] Inventory real-time listener note:', err);
      });

      // 2. Real-time Users / Employees Listener
      window.db.collection('users').onSnapshot((snapshot) => {
        if (snapshot.empty) {
          if (app.users && app.users.length > 0) {
            this.bulkUploadEmployees(app.users, 'append');
          }
          return;
        }

        const cloudUsers = [];
        snapshot.forEach((doc) => {
          cloudUsers.push(doc.data());
        });

        if (cloudUsers.length > 0) {
          app.users = cloudUsers;
          Storage.save(Storage.KEYS.USERS, cloudUsers);
          app.renderEmployeesTable();
          app.updateDashboardStats();
        }
      }, (err) => {
        console.warn('[CloudDB] Users real-time listener note:', err);
      });

      // 3. Real-time Transactions Ledger Listener
      window.db.collection('transactions').onSnapshot((snapshot) => {
        const cloudTxns = [];
        snapshot.forEach((doc) => {
          cloudTxns.push(doc.data());
        });

        cloudTxns.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
        app.transactions = cloudTxns;
        Storage.save(Storage.KEYS.TRANSACTIONS, cloudTxns);
        app.renderLedgerTable();
        app.updateDashboardStats();
      }, (err) => {
        console.warn('[CloudDB] Transactions real-time listener note:', err);
      });

      // Update UI to show Cloud Connected
      OfflineManager.updateNetworkUI();
    },

    saveItem(item) {
      if (!this.isReady() || !item || !item.Item_ID) return;
      window.db.collection('inventory').doc(item.Item_ID).set(item, { merge: true }).catch((err) => {
        console.error('[CloudDB] Error saving item to Firestore:', err);
      });
    },

    deleteItem(itemId) {
      if (!this.isReady() || !itemId) return;
      window.db.collection('inventory').doc(itemId).delete().catch((err) => {
        console.error('[CloudDB] Error deleting item from Firestore:', err);
      });
    },

    saveUser(user) {
      if (!this.isReady() || !user || !user.Employee_ID) return;
      window.db.collection('users').doc(user.Employee_ID).set(user, { merge: true }).catch((err) => {
        console.error('[CloudDB] Error saving user to Firestore:', err);
      });
    },

    deleteUser(empId) {
      if (!this.isReady() || !empId) return;
      window.db.collection('users').doc(empId).delete().catch((err) => {
        console.error('[CloudDB] Error deleting user from Firestore:', err);
      });
    },

    saveTransaction(txn) {
      if (!this.isReady() || !txn || !txn.Transaction_ID) return;
      window.db.collection('transactions').doc(txn.Transaction_ID).set(txn).catch((err) => {
        console.error('[CloudDB] Error recording transaction to Firestore:', err);
      });
    },

    bulkUploadInventory(items, mode = 'append') {
      if (!this.isReady() || !Array.isArray(items) || items.length === 0) return;
      
      if (mode === 'replace') {
        window.db.collection('inventory').get().then((snapshot) => {
          const deleteBatch = window.db.batch();
          snapshot.forEach((doc) => deleteBatch.delete(doc.ref));
          return deleteBatch.commit();
        }).then(() => {
          const insertBatch = window.db.batch();
          items.forEach((item) => {
            const ref = window.db.collection('inventory').doc(item.Item_ID);
            insertBatch.set(ref, item);
          });
          return insertBatch.commit();
        }).catch((err) => console.error('[CloudDB] Bulk replace inventory error:', err));
      } else {
        const batch = window.db.batch();
        items.forEach((item) => {
          const ref = window.db.collection('inventory').doc(item.Item_ID);
          batch.set(ref, item, { merge: true });
        });
        batch.commit().catch((err) => console.error('[CloudDB] Bulk append inventory error:', err));
      }
    },

    bulkUploadEmployees(employees, mode = 'append') {
      if (!this.isReady() || !Array.isArray(employees) || employees.length === 0) return;

      if (mode === 'replace') {
        window.db.collection('users').get().then((snapshot) => {
          const deleteBatch = window.db.batch();
          snapshot.forEach((doc) => deleteBatch.delete(doc.ref));
          return deleteBatch.commit();
        }).then(() => {
          const insertBatch = window.db.batch();
          employees.forEach((emp) => {
            const ref = window.db.collection('users').doc(emp.Employee_ID);
            insertBatch.set(ref, emp);
          });
          return insertBatch.commit();
        }).catch((err) => console.error('[CloudDB] Bulk replace users error:', err));
      } else {
        const batch = window.db.batch();
        employees.forEach((emp) => {
          const ref = window.db.collection('users').doc(emp.Employee_ID);
          batch.set(ref, emp, { merge: true });
        });
        batch.commit().catch((err) => console.error('[CloudDB] Bulk append users error:', err));
      }
    }
  };

  // =========================================================================
  // Main Application Controller
  // =========================================================================
  const App = {
    users: [],
    inventory: [],
    transactions: [],
    currentRole: null,
    currentUser: null,
    adminUser: null,
    deviceFrameActive: false,

    // Admin filters
    inventoryFilter: 'all',
    inventorySearch: '',
    ledgerSearch: '',
    ledgerDatePreset: 'this-month',
    ledgerCustomFrom: null,
    ledgerCustomTo: null,
    employeeSearch: '',
    editingItemId: null,

    // Mobile catalog state
    mobileSearch: '',
    mobileFilter: 'all',
    selectedCheckoutItem: null,
    checkoutQuantity: 1,

    // Unified Landing Gateway State
    gatewaySelectedRole: 'employee',

    // CSV Upload & Bulk Persistence State
    pendingUploadedInventory: [],
    pendingUploadedEmployees: [],

    init() {
      Storage.init();
      this.loadData();
      OfflineManager.init();
      PwaManager.init();
      CloudDB.initRealtimeListeners(this);
      this.initClock();
      this.bindEvents();
      this.initSession();
      this.renderAll();
    },

    loadData() {
      this.users = Storage.get(Storage.KEYS.USERS) || DEFAULT_USERS;
      this.inventory = Storage.get(Storage.KEYS.INVENTORY) || DEFAULT_INVENTORY;
      this.transactions = Storage.get(Storage.KEYS.TRANSACTIONS) || DEFAULT_TRANSACTIONS;
    },

    saveInventory() {
      Storage.save(Storage.KEYS.INVENTORY, this.inventory);
      if (CloudDB.isReady()) {
        CloudDB.bulkUploadInventory(this.inventory, 'append');
      }
    },

    saveUsers() {
      Storage.save(Storage.KEYS.USERS, this.users);
      if (CloudDB.isReady()) {
        CloudDB.bulkUploadEmployees(this.users, 'append');
      }
    },

    saveTransactions() {
      Storage.save(Storage.KEYS.TRANSACTIONS, this.transactions);
    },

    // =======================================================================
    // Unified Landing Login Gateway (Toggle between Employee & Administrator)
    // =======================================================================
    setGatewayRole(role) {
      this.gatewaySelectedRole = role || 'employee';

      const empBtn = document.getElementById('segmentEmployeeBtn');
      const adminBtn = document.getElementById('segmentAdminBtn');
      const submitBtn = document.getElementById('gatewaySubmitBtn');
      const submitText = document.getElementById('gatewaySubmitBtnText');
      const submitIcon = document.getElementById('gatewaySubmitBtnIcon');
      const errBox = document.getElementById('gatewayErrorMessage');

      if (empBtn) {
        empBtn.classList.toggle('active', this.gatewaySelectedRole === 'employee');
        empBtn.setAttribute('aria-selected', this.gatewaySelectedRole === 'employee');
      }
      if (adminBtn) {
        adminBtn.classList.toggle('active', this.gatewaySelectedRole === 'admin');
        adminBtn.setAttribute('aria-selected', this.gatewaySelectedRole === 'admin');
      }

      if (this.gatewaySelectedRole === 'admin') {
        if (submitText) submitText.textContent = 'Log In as Admin';
        if (submitBtn) {
          submitBtn.className = 'btn btn-primary btn-block gateway-submit-btn';
        }
        if (submitIcon) {
          submitIcon.className = 'fa-solid fa-user-shield';
        }
      } else {
        if (submitText) submitText.textContent = 'Log In';
        if (submitBtn) {
          submitBtn.className = 'btn btn-warning btn-block gateway-submit-btn';
        }
        if (submitIcon) {
          submitIcon.className = 'fa-solid fa-right-to-bracket';
        }
      }

      if (errBox) errBox.classList.add('hidden');
    },

    handleGatewayLoginSubmit() {
      const nameInput = document.getElementById('gatewayInputName');
      const idInput = document.getElementById('gatewayInputEmpId');
      const errBox = document.getElementById('gatewayErrorMessage');
      const errText = document.getElementById('gatewayErrorText');

      const name = (nameInput?.value || '').trim();
      const empId = (idInput?.value || '').trim();

      if (!name || !empId) {
        if (errText) errText.textContent = 'Please enter both your Name and Employee ID.';
        if (errBox) errBox.classList.remove('hidden');
        return;
      }

      if (this.gatewaySelectedRole === 'admin') {
        const isMatch = (name.toLowerCase() === 'basheer' && empId === '1027548');
        if (isMatch) {
          this.adminUser = {
            Employee_ID: '1027548',
            Full_Name: 'Basheer',
            role: 'Administrator',
            name: 'Basheer'
          };
          Storage.save(Storage.KEYS.ADMIN_SESSION, this.adminUser);
          this.currentUser = null;
          Storage.remove(Storage.KEYS.SESSION);

          if (errBox) errBox.classList.add('hidden');
          if (nameInput) nameInput.value = '';
          if (idInput) idInput.value = '';

          this.routeTo('admin');
          this.renderAll();
          this.showToast('Administrator authenticated. Welcome, Basheer.', 'success');
        } else {
          if (errText) errText.textContent = 'Access Denied: Admin privileges required.';
          if (errBox) errBox.classList.remove('hidden');
        }
      } else {
        // Employee Role
        if (name.toLowerCase() === 'basheer' && empId === '1027548') {
          if (errText) errText.textContent = 'Access Denied: Admins must use the Administrator Portal.';
          if (errBox) errBox.classList.remove('hidden');
          return;
        }

        const cleanIdUpper = empId.toUpperCase();
        const matchedUser = this.users.find(u => 
          u.Employee_ID.toUpperCase() === cleanIdUpper && 
          u.Full_Name.trim().toLowerCase() === name.toLowerCase()
        );

        if (!matchedUser) {
          if (errText) errText.textContent = `Authorization failed: No authorized staff matches "${name}" (${empId}).`;
          if (errBox) errBox.classList.remove('hidden');
          return;
        }

        this.currentUser = matchedUser;
        Storage.save(Storage.KEYS.SESSION, matchedUser);
        this.adminUser = null;
        Storage.remove(Storage.KEYS.ADMIN_SESSION);

        if (errBox) errBox.classList.add('hidden');
        if (nameInput) nameInput.value = '';
        if (idInput) idInput.value = '';

        this.routeTo('employee');
        this.showToast(`Logged in as ${matchedUser.Full_Name}.`, 'success');
      }
    },

    // =======================================================================
    // Authentication & Navigation Router
    // =======================================================================
    initSession() {
      const adminSession = Storage.get(Storage.KEYS.ADMIN_SESSION);
      const empSession = Storage.get(Storage.KEYS.SESSION);

      if (adminSession && adminSession.Full_Name && adminSession.Full_Name.toLowerCase() === 'basheer' && String(adminSession.Employee_ID) === '1027548') {
        this.adminUser = adminSession;
        this.routeTo('admin');
      } else if (empSession && empSession.Employee_ID) {
        this.currentUser = empSession;
        this.routeTo('employee');
      } else {
        this.routeTo('landing');
      }
    },

    routeTo(role) {
      this.currentRole = role || 'landing';

      const landingView = document.getElementById('landingGatewayView');
      const adminView = document.getElementById('adminViewContainer');
      const mobileView = document.getElementById('mobileViewContainer');
      const activeSessionPill = document.getElementById('activeSessionPill');
      const sessionRoleLabel = document.getElementById('sessionRoleLabel');
      const sessionRoleIcon = document.getElementById('sessionRoleIcon');
      const deviceToggleBtn = document.getElementById('toggleDeviceFrameBtn');

      if (landingView) landingView.classList.remove('active');
      if (adminView) adminView.classList.remove('active');
      if (mobileView) mobileView.classList.remove('active');

      if (this.currentRole === 'admin') {
        if (adminView) adminView.classList.add('active');
        if (activeSessionPill) activeSessionPill.classList.remove('hidden');
        if (deviceToggleBtn) deviceToggleBtn.classList.add('hidden');
        if (sessionRoleLabel) sessionRoleLabel.textContent = 'Administrator Portal (Basheer)';
        if (sessionRoleIcon) sessionRoleIcon.innerHTML = '<i class="fa-solid fa-user-shield"></i>';
      } else if (this.currentRole === 'employee') {
        if (mobileView) mobileView.classList.add('active');
        if (activeSessionPill) activeSessionPill.classList.remove('hidden');
        if (deviceToggleBtn) deviceToggleBtn.classList.remove('hidden');
        if (sessionRoleLabel) sessionRoleLabel.textContent = this.currentUser ? this.currentUser.Full_Name : 'Employee Mobile';
        if (sessionRoleIcon) sessionRoleIcon.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i>';
        
        if (this.currentUser) {
          this.renderMobileUserHeader();
          this.renderMobileCatalog();
          this.showMobileSubView('mobileCatalogScreen');
        } else {
          this.showMobileSubView('mobileLoginScreen');
        }
      } else {
        this.currentRole = 'landing';
        if (landingView) landingView.classList.add('active');
        if (activeSessionPill) activeSessionPill.classList.add('hidden');
        if (deviceToggleBtn) deviceToggleBtn.classList.add('hidden');
        document.getElementById('gatewayErrorMessage')?.classList.add('hidden');
        const nInput = document.getElementById('gatewayInputName');
        const idInput = document.getElementById('gatewayInputEmpId');
        if (nInput) nInput.value = '';
        if (idInput) idInput.value = '';
      }

      OfflineManager.updateNetworkUI();
    },

    openAdminAuthModal() {
      const uInput = document.getElementById('adminUsernameInput');
      const pInput = document.getElementById('adminPasswordInput');
      if (uInput) uInput.value = '';
      if (pInput) pInput.value = '';
      document.getElementById('adminAuthErrorMessage')?.classList.add('hidden');
      this.openModal('adminAuthModal');
    },

    loginAdmin(name, employeeId) {
      const u = (name || '').trim();
      const p = (employeeId || '').trim();

      const isMatch = (u.toLowerCase() === 'basheer' && p === '1027548');

      if (isMatch) {
        this.adminUser = {
          Employee_ID: '1027548',
          Full_Name: 'Basheer',
          role: 'Administrator',
          name: 'Basheer'
        };
        Storage.save(Storage.KEYS.ADMIN_SESSION, this.adminUser);

        document.getElementById('adminAuthErrorMessage')?.classList.add('hidden');
        this.closeModal('adminAuthModal');
        this.routeTo('admin');
        this.renderAll();
        this.showToast('Administrator authenticated. Welcome, Basheer.', 'success');
        return true;
      } else {
        const errEl = document.getElementById('adminAuthErrorMessage');
        const errTxt = document.getElementById('adminAuthErrorText');
        if (errEl && errTxt) {
          errTxt.textContent = 'Access Denied: Admin privileges required.';
          errEl.classList.remove('hidden');
        }
        return false;
      }
    },

    logoutAdmin() {
      this.adminUser = null;
      Storage.remove(Storage.KEYS.ADMIN_SESSION);
      this.routeTo('landing');
      this.showToast('Administrator signed out.', 'info');
    },

    loginEmployee(fullName, employeeId) {
      const cleanName = (fullName || '').trim().toLowerCase();
      const cleanId = (employeeId || '').trim();

      // Strict Rule: Block Admin credentials from Employee portal
      if (cleanName === 'basheer' && cleanId === '1027548') {
        const errEl = document.getElementById('loginErrorMessage');
        const errTxt = document.getElementById('loginErrorText');
        if (errEl && errTxt) {
          errTxt.textContent = 'Access Denied: Admins must use the Administrator Portal.';
          errEl.classList.remove('hidden');
        }
        return false;
      }

      const cleanIdUpper = cleanId.toUpperCase();
      const matchedUser = this.users.find(u => 
        u.Employee_ID.toUpperCase() === cleanIdUpper && 
        u.Full_Name.trim().toLowerCase() === cleanName
      );

      if (!matchedUser) {
        const errEl = document.getElementById('loginErrorMessage');
        const errTxt = document.getElementById('loginErrorText');
        if (errEl && errTxt) {
          errTxt.textContent = `Authorization failed: No authorized staff matches "${fullName}" (${employeeId}).`;
          errEl.classList.remove('hidden');
        }
        return false;
      }

      this.currentUser = matchedUser;
      Storage.save(Storage.KEYS.SESSION, matchedUser);

      this.adminUser = null;
      Storage.remove(Storage.KEYS.ADMIN_SESSION);

      document.getElementById('loginErrorMessage')?.classList.add('hidden');

      this.routeTo('employee');
      this.showToast(`Logged in as ${matchedUser.Full_Name}.`, 'success');
      return true;
    },

    logoutEmployee() {
      this.currentUser = null;
      Storage.remove(Storage.KEYS.SESSION);
      this.routeTo('landing');
      this.showToast('Employee signed out.', 'info');
    },

    showMobileSubView(subviewId) {
      document.querySelectorAll('.mobile-subview').forEach(v => {
        v.classList.remove('active');
        v.classList.add('hidden');
      });
      const target = document.getElementById(subviewId);
      if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
      }
    },

    toggleDeviceFrame() {
      this.deviceFrameActive = !this.deviceFrameActive;
      const body = document.body;
      const toggleBtn = document.getElementById('toggleDeviceFrameBtn');

      if (this.deviceFrameActive) {
        body.classList.add('device-frame-mode');
        toggleBtn?.classList.add('active');
      } else {
        body.classList.remove('device-frame-mode');
        toggleBtn?.classList.remove('active');
      }
    },

    // =======================================================================
    // Admin Material Self-Checkout
    // =======================================================================
    openAdminSelfCheckoutModal(preselectItemId = null) {
      const select = document.getElementById('adminSelfItemSelect');
      const qtyInput = document.getElementById('adminSelfQuantity');
      const purposeInput = document.getElementById('adminSelfPurpose');

      if (qtyInput) qtyInput.value = '1';
      if (purposeInput) purposeInput.value = '';

      if (select) {
        select.innerHTML = this.inventory.map(item => {
          const isSel = preselectItemId ? item.Item_ID === preselectItemId : false;
          return `<option value="${this.escapeHtml(item.Item_ID)}" ${isSel ? 'selected' : ''}>${this.escapeHtml(item.Item_ID)} - ${this.escapeHtml(item.Item_Name)} (Stock: ${item.Current_Stock_Level})</option>`;
        }).join('');
      }

      this.updateAdminSelfCalculation();
      this.openModal('adminSelfCheckoutModal');
    },

    updateAdminSelfCalculation() {
      const select = document.getElementById('adminSelfItemSelect');
      const qtyInput = document.getElementById('adminSelfQuantity');
      const currentStockBadge = document.getElementById('adminSelfCurrentStockBadge');
      const preview = document.getElementById('adminSelfRemainingPreview');

      if (!select || !preview) return;

      const itemId = select.value;
      const item = this.inventory.find(i => i.Item_ID === itemId);
      const currentStock = item ? item.Current_Stock_Level : 0;
      const pullQty = parseInt(qtyInput?.value, 10) || 1;
      const remaining = currentStock - pullQty;

      if (currentStockBadge) currentStockBadge.textContent = `${currentStock} units`;
      
      if (remaining < 0) {
        preview.innerHTML = `<span style="color: var(--state-danger); font-weight: 700;">${remaining} units (Negative Balance Alert)</span>`;
      } else {
        preview.textContent = `${remaining} units`;
      }
    },

    handleAdminSelfCheckout() {
      const select = document.getElementById('adminSelfItemSelect');
      const qtyInput = document.getElementById('adminSelfQuantity');
      const purposeInput = document.getElementById('adminSelfPurpose');

      const itemId = select?.value;
      const qty = parseInt(qtyInput?.value, 10);
      const purpose = purposeInput?.value.trim();

      if (!itemId || isNaN(qty) || qty <= 0) {
        this.showToast('Please enter a valid quantity of 1 or more', 'warning');
        return;
      }

      const item = this.inventory.find(i => i.Item_ID === itemId);
      if (!item) return;

      item.Current_Stock_Level -= qty;
      this.saveInventory();
      CloudDB.saveItem(item);

      const now = new Date();
      const newTxn = {
        Transaction_ID: `TXN-ADM-${now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`,
        Employee_ID: ADMIN_PROFILE.Employee_ID,
        Item_ID: item.Item_ID,
        Quantity_Taken: qty,
        Timestamp: now.toISOString(),
        Sync_Status: true
      };

      this.transactions.unshift(newTxn);
      this.saveTransactions();
      CloudDB.saveTransaction(newTxn);

      this.closeModal('adminSelfCheckoutModal');
      this.renderAll();

      const note = purpose ? ` for "${purpose}"` : '';
      this.showToast(`Admin Checkout: Took ${qty}x ${item.Item_Name}${note}.`, 'success');
    },

    // =======================================================================
    // Admin Process Material Return (PRD Section 4.4)
    // =======================================================================
    openAdminReturnModal(preselectItemId = null) {
      const select = document.getElementById('adminReturnItemSelect');
      const qtyInput = document.getElementById('adminReturnQuantity');
      const empInput = document.getElementById('adminReturnEmployeeInput');

      if (qtyInput) qtyInput.value = '1';
      if (empInput) empInput.value = '';

      if (select) {
        select.innerHTML = this.inventory.map(item => {
          const isSel = preselectItemId ? item.Item_ID === preselectItemId : false;
          return `<option value="${this.escapeHtml(item.Item_ID)}" ${isSel ? 'selected' : ''}>${this.escapeHtml(item.Item_ID)} - ${this.escapeHtml(item.Item_Name)} (Stock: ${item.Current_Stock_Level})</option>`;
        }).join('');
      }

      this.updateAdminReturnCalculation();
      this.openModal('adminReturnModal');
    },

    updateAdminReturnCalculation() {
      const select = document.getElementById('adminReturnItemSelect');
      const qtyInput = document.getElementById('adminReturnQuantity');
      const currentStockBadge = document.getElementById('adminReturnCurrentStockBadge');
      const preview = document.getElementById('adminReturnNewStockPreview');

      if (!select || !preview) return;

      const itemId = select.value;
      const item = this.inventory.find(i => i.Item_ID === itemId);
      const currentStock = item ? item.Current_Stock_Level : 0;
      const returnQty = parseInt(qtyInput?.value, 10) || 1;
      const newStock = currentStock + returnQty;

      if (currentStockBadge) currentStockBadge.textContent = `${currentStock} units`;
      if (preview) preview.textContent = `${newStock} units`;
    },

    handleAdminReturnSubmit() {
      const select = document.getElementById('adminReturnItemSelect');
      const qtyInput = document.getElementById('adminReturnQuantity');
      const empInput = document.getElementById('adminReturnEmployeeInput');

      const itemId = select?.value;
      const qty = parseInt(qtyInput?.value, 10);
      const returnedBy = empInput?.value.trim();

      if (!itemId || isNaN(qty) || qty <= 0) {
        this.showToast('Please enter a valid quantity of 1 or more', 'warning');
        return;
      }

      const item = this.inventory.find(i => i.Item_ID === itemId);
      if (!item) return;

      item.Current_Stock_Level += qty;
      this.saveInventory();
      CloudDB.saveItem(item);

      const now = new Date();
      const newTxn = {
        Transaction_ID: `RET-ADM-${now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`,
        Employee_ID: ADMIN_PROFILE.Employee_ID,
        Returned_By: returnedBy || 'Admin Processed Return',
        Item_ID: item.Item_ID,
        Quantity_Taken: qty,
        Transaction_Type: 'RETURN',
        Timestamp: now.toISOString(),
        Sync_Status: true
      };

      this.transactions.unshift(newTxn);
      this.saveTransactions();
      CloudDB.saveTransaction(newTxn);

      this.closeModal('adminReturnModal');
      this.renderAll();

      const staffNote = returnedBy ? ` (Returned by: ${returnedBy})` : '';
      this.showToast(`Admin Processed Return: Restocked ${qty}x "${item.Item_Name}"${staffNote}.`, 'success');
    },

    // =======================================================================
    // Mobile Consumables Catalog
    // =======================================================================
    renderMobileUserHeader() {
      if (!this.currentUser) return;

      const nameEl = document.getElementById('mobileUserName');
      const idEl = document.getElementById('mobileUserEmpId');

      if (nameEl) nameEl.textContent = this.currentUser.Full_Name;
      if (idEl) idEl.textContent = this.currentUser.Employee_ID;
    },

    renderMobileCatalog() {
      const listContainer = document.getElementById('mobileCatalogList');
      const countText = document.getElementById('mobileCatalogCountText');
      if (!listContainer) return;

      let filtered = this.inventory.filter(item => {
        if (this.mobileSearch) {
          const q = this.mobileSearch.toLowerCase();
          const matchId = item.Item_ID.toLowerCase().includes(q);
          const matchName = item.Item_Name.toLowerCase().includes(q);
          if (!matchId && !matchName) return false;
        }

        if (this.mobileFilter === 'wire') {
          return item.Item_Name.toLowerCase().includes('wire') || item.Item_Name.toLowerCase().includes('cable');
        } else if (this.mobileFilter === 'mcb') {
          return item.Item_Name.toLowerCase().includes('mcb') || item.Item_Name.toLowerCase().includes('fuse');
        } else if (this.mobileFilter === 'instock') {
          return item.Current_Stock_Level > 0;
        } else if (this.mobileFilter === 'low') {
          return item.Current_Stock_Level <= 15;
        }
        return true;
      });

      if (countText) countText.textContent = `${filtered.length} cached items`;

      if (this.inventory.length === 0) {
        listContainer.innerHTML = `
          <div class="table-empty-state">
            <i class="fa-solid fa-boxes-stacked"></i>
            <h4>Consumables Catalog is Empty</h4>
            <p>No electrical materials are loaded in the database. Please sign in as an Administrator to upload inventory CSV.</p>
          </div>
        `;
        return;
      }

      if (filtered.length === 0) {
        listContainer.innerHTML = `
          <div class="table-empty-state">
            <i class="fa-solid fa-magnifying-glass"></i>
            <h4>No matching consumables</h4>
            <p>Try searching for Wire, MCB, Tape, or reset filters.</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = filtered.map(item => {
        const isNeg = item.Current_Stock_Level < 0;
        const isLow = item.Current_Stock_Level >= 0 && item.Current_Stock_Level <= 15;
        
        let stockClass = 'healthy';
        let stockBadge = `<span class="status-pill status-healthy"><span class="indicator-dot green"></span> In Stock</span>`;

        if (isNeg) {
          stockClass = 'negative';
          stockBadge = `<span class="status-pill status-negative"><span class="indicator-dot red"></span> Depleted</span>`;
        } else if (isLow) {
          stockClass = 'low';
          stockBadge = `<span class="status-pill status-low"><span class="indicator-dot yellow"></span> Low Stock</span>`;
        }

        const binLoc = (item.binningLocation || item.Binning_Location || '').trim() || '-';

        return `
          <div class="m-item-card" data-mobile-item-id="${this.escapeHtml(item.Item_ID)}">
            <div class="m-item-top">
              <div>
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                  <span class="item-id-pill">${this.escapeHtml(item.Item_ID)}</span>
                  <span class="m-bin-badge"><i class="fa-solid fa-location-dot"></i> ${this.escapeHtml(binLoc)}</span>
                </div>
                <h4 class="m-item-title">${this.escapeHtml(item.Item_Name)}</h4>
                <div class="m-bin-location-row">
                  <span class="m-bin-label">Bin Location:</span>
                  <strong class="m-bin-value">${this.escapeHtml(binLoc)}</strong>
                </div>
              </div>
              <div>${stockBadge}</div>
            </div>
            <div class="m-item-bottom">
              <div class="m-stock-wrap">
                <span class="m-stock-label">Stock Level</span>
                <span class="m-stock-count ${stockClass}">${item.Current_Stock_Level} units</span>
              </div>
              <div class="m-card-actions">
                <button type="button" class="m-return-btn" data-action="return-item" data-id="${this.escapeHtml(item.Item_ID)}" title="Return unused parts back to storage shelf">
                  <i class="fa-solid fa-arrow-rotate-left"></i> Return Item
                </button>
                <button type="button" class="m-take-btn" data-action="quick-checkout" data-id="${this.escapeHtml(item.Item_ID)}">
                  <i class="fa-solid fa-cart-arrow-down"></i> Take Item
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    },

    // =======================================================================
    // Quick Checkout Bottom Sheet Modal
    // =======================================================================
    openMobileCheckoutModal(itemId) {
      const item = this.inventory.find(i => i.Item_ID === itemId);
      if (!item) return;

      this.selectedCheckoutItem = item;
      this.checkoutQuantity = 1;

      document.getElementById('checkoutModalItemId').textContent = item.Item_ID;
      document.getElementById('checkoutModalItemName').textContent = item.Item_Name;
      document.getElementById('checkoutModalStock').textContent = `${item.Current_Stock_Level} units in storage`;
      document.getElementById('checkoutQtyInput').value = this.checkoutQuantity;

      const empSummary = this.currentUser 
        ? `${this.currentUser.Full_Name} (${this.currentUser.Employee_ID})`
        : 'Authorized Employee';
      document.getElementById('checkoutSummaryEmployee').textContent = empSummary;

      this.updateCheckoutRemainingPreview();
      OfflineManager.updateNetworkUI();
      this.openModal('mobileCheckoutModal');
    },

    updateCheckoutRemainingPreview() {
      if (!this.selectedCheckoutItem) return;
      const previewEl = document.getElementById('checkoutRemainingPreview');
      const inputEl = document.getElementById('checkoutQtyInput');
      
      let qty = parseInt(inputEl?.value, 10);
      if (isNaN(qty) || qty < 1) qty = 1;
      this.checkoutQuantity = qty;

      const remaining = this.selectedCheckoutItem.Current_Stock_Level - qty;
      if (previewEl) {
        if (remaining < 0) {
          previewEl.innerHTML = `<span style="color: var(--state-danger); font-weight: 700;">${remaining} units (Negative Shelf: Allowed per PRD Appendix)</span>`;
        } else {
          previewEl.textContent = `${remaining} units`;
        }
      }
    },

    handleConfirmMobileCheckout() {
      if (!this.selectedCheckoutItem) return;
      if (!this.currentUser) {
        this.showToast('Please sign in with authorized employee badge first', 'danger');
        return;
      }

      const qty = this.checkoutQuantity;
      if (qty < 1) {
        this.showToast('Please enter a valid quantity of 1 or more', 'warning');
        return;
      }

      const item = this.selectedCheckoutItem;
      const emp = this.currentUser;
      const isOnline = OfflineManager.isOnline;

      item.Current_Stock_Level -= qty;
      this.saveInventory();
      CloudDB.saveItem(item);

      const now = new Date();
      const newTxn = {
        Transaction_ID: `TXN-${now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`,
        Employee_ID: emp.Employee_ID,
        Item_ID: item.Item_ID,
        Quantity_Taken: qty,
        Timestamp: now.toISOString(),
        Sync_Status: isOnline
      };

      if (!isOnline) {
        OfflineManager.queueOfflineTransaction(newTxn);
        this.showToast(`Offline Checkout Recorded: Queued locally.`, 'warning');
      } else {
        this.transactions.unshift(newTxn);
        this.saveTransactions();
        CloudDB.saveTransaction(newTxn);
      }

      this.closeModal('mobileCheckoutModal');
      this.displayGatekeeperPass(newTxn, emp, item, isOnline);
      this.renderAll();
    },

    // =======================================================================
    // Return Unused Material Modal (PRD Employee Return Feature)
    // =======================================================================
    openMobileReturnModal(itemId) {
      const item = this.inventory.find(i => i.Item_ID === itemId);
      if (!item) return;

      this.selectedReturnItem = item;
      this.returnQuantity = 1;

      document.getElementById('returnModalItemId').textContent = item.Item_ID;
      document.getElementById('returnModalItemName').textContent = item.Item_Name;
      document.getElementById('returnModalStock').textContent = `${item.Current_Stock_Level} units`;
      document.getElementById('returnQtyInput').value = this.returnQuantity;

      const empSummary = this.currentUser 
        ? `${this.currentUser.Full_Name} (${this.currentUser.Employee_ID})`
        : 'Authorized Staff';
      document.getElementById('returnSummaryEmployee').textContent = empSummary;
      document.getElementById('returnSummaryBinLocation').textContent = (item.binningLocation || item.Binning_Location || '').trim() || '-';

      this.updateReturnNewStockPreview();
      this.openModal('mobileReturnModal');
    },

    updateReturnNewStockPreview() {
      if (!this.selectedReturnItem) return;
      const previewEl = document.getElementById('returnNewStockPreview');
      const inputEl = document.getElementById('returnQtyInput');
      
      let qty = parseInt(inputEl?.value, 10);
      if (isNaN(qty) || qty < 1) qty = 1;
      this.returnQuantity = qty;

      const newStock = this.selectedReturnItem.Current_Stock_Level + qty;
      if (previewEl) {
        previewEl.textContent = `${newStock} units`;
      }
    },

    handleConfirmMobileReturn() {
      if (!this.selectedReturnItem) return;
      if (!this.currentUser) {
        this.showToast('Please sign in with authorized employee badge first', 'danger');
        return;
      }

      const qty = this.returnQuantity;
      if (qty < 1) {
        this.showToast('Please enter a valid return quantity of 1 or more', 'warning');
        return;
      }

      const item = this.selectedReturnItem;
      const emp = this.currentUser;
      const isOnline = OfflineManager.isOnline;

      // Increment the current stock of this specific item
      item.Current_Stock_Level += qty;
      this.saveInventory();
      CloudDB.saveItem(item);

      const now = new Date();
      const newTxn = {
        Transaction_ID: `RET-${now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`,
        Employee_ID: emp.Employee_ID,
        Item_ID: item.Item_ID,
        Quantity_Taken: qty,
        Transaction_Type: 'RETURN',
        Timestamp: now.toISOString(),
        Sync_Status: isOnline
      };

      if (!isOnline) {
        OfflineManager.queueOfflineTransaction(newTxn);
        this.showToast(`Offline Return Logged: Queued locally for sync.`, 'info');
      } else {
        this.transactions.unshift(newTxn);
        this.saveTransactions();
        CloudDB.saveTransaction(newTxn);
      }

      this.closeModal('mobileReturnModal');
      this.renderAll();
      this.showToast(`Successfully returned ${qty}x "${item.Item_Name}" to shelf stock!`, 'success');
    },

    // =======================================================================
    // Gatekeeper / Watchman Verification Screen
    // =======================================================================
    displayGatekeeperPass(txn, employee, item, isOnline = true) {
      const passModal = document.getElementById('gatekeeperPassModal');
      if (!passModal) return;

      document.getElementById('passEmployeeName').textContent = employee.Full_Name;
      document.getElementById('passEmployeeId').textContent = employee.Employee_ID;
      document.getElementById('passItemName').textContent = item.Item_Name;
      document.getElementById('passQuantityTaken').textContent = txn.Quantity_Taken;
      document.getElementById('passTransactionId').textContent = txn.Transaction_ID;

      const d = new Date(txn.Timestamp);
      const dateFormatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeFormatted = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      document.getElementById('passExactTimestamp').textContent = `${dateFormatted} at ${timeFormatted}`;

      const passSyncBadge = document.getElementById('passSyncStatusBadge');
      if (passSyncBadge) {
        if (isOnline) {
          passSyncBadge.className = 'pass-sync-tag online';
          passSyncBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Verified & Synced`;
        } else {
          passSyncBadge.className = 'pass-sync-tag offline';
          passSyncBadge.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Queued (Dead Zone)`;
        }
      }

      passModal.classList.remove('hidden');
    },

    closeGatekeeperPass() {
      const passModal = document.getElementById('gatekeeperPassModal');
      if (passModal) passModal.classList.add('hidden');
      this.renderMobileCatalog();
    },

    // =======================================================================
    // Admin Dashboard Views (Section 4.4)
    // =======================================================================
    renderAll() {
      this.renderKPIs();
      this.renderNegativeStockAlert();
      this.renderInventoryTable();
      this.renderLedgerTable();
      this.renderEmployeesTable();
      this.updateSimulationSelects();
      this.renderMobileCatalog();
      OfflineManager.updateNetworkUI();
    },

    renderKPIs() {
      const totalItemsEl = document.getElementById('statTotalItems');
      if (totalItemsEl) totalItemsEl.textContent = this.inventory.length;

      const lowStockItems = this.inventory.filter(item => item.Current_Stock_Level <= 15);
      const negativeStockItems = this.inventory.filter(item => item.Current_Stock_Level < 0);
      
      const lowStockEl = document.getElementById('statLowStockCount');
      const lowStockTrendEl = document.getElementById('statLowStockTrend');
      if (lowStockEl) lowStockEl.textContent = lowStockItems.length;
      if (lowStockTrendEl) {
        if (negativeStockItems.length > 0) {
          lowStockTrendEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${negativeStockItems.length} Negative (&lt; 0)`;
          lowStockTrendEl.className = 'stat-trend danger';
        } else if (lowStockItems.length > 0) {
          lowStockTrendEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${lowStockItems.length} Low stock (&le; 15)`;
          lowStockTrendEl.className = 'stat-trend warning';
        } else {
          lowStockTrendEl.innerHTML = `<i class="fa-solid fa-check"></i> Stock levels healthy`;
          lowStockTrendEl.className = 'stat-trend positive';
        }
      }

      const totalTxnEl = document.getElementById('statTotalTransactions');
      if (totalTxnEl) totalTxnEl.textContent = this.transactions.length;

      const todayStr = new Date().toISOString().slice(0, 10);
      const todayCount = this.transactions.filter(t => t.Timestamp && t.Timestamp.slice(0, 10) === todayStr).length;
      const todayTrendEl = document.getElementById('statTodayTransactions');
      if (todayTrendEl) {
        todayTrendEl.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> ${todayCount} today`;
      }

      const totalEmpEl = document.getElementById('statTotalEmployees');
      if (totalEmpEl) totalEmpEl.textContent = this.users.length;

      const invBadge = document.getElementById('inventoryCountBadge');
      if (invBadge) invBadge.textContent = this.inventory.length;

      const ledBadge = document.getElementById('ledgerCountBadge');
      if (ledBadge) ledBadge.textContent = this.transactions.length;

      const empBadge = document.getElementById('employeesCountBadge');
      if (empBadge) empBadge.textContent = this.users.length;

      const exportBadge = document.getElementById('exportBadgeCount');
      if (exportBadge) exportBadge.textContent = this.transactions.length;
    },

    renderNegativeStockAlert() {
      const banner = document.getElementById('negativeStockBanner');
      const message = document.getElementById('negativeStockMessage');
      const negativeItems = this.inventory.filter(i => i.Current_Stock_Level < 0);

      if (!banner) return;

      if (negativeItems.length > 0) {
        banner.classList.remove('hidden');
        const itemNames = negativeItems.map(i => `${i.Item_Name} (${i.Current_Stock_Level})`).join(', ');
        message.innerHTML = `<strong>${negativeItems.length} item(s) below zero:</strong> ${itemNames}. Per PRD Appendix, physical shelf is depleted due to offline checkouts. Restock immediately.`;
      } else {
        banner.classList.add('hidden');
      }
    },

    renderInventoryTable() {
      const tbody = document.getElementById('inventoryTableBody');
      if (!tbody) return;

      const countAll = this.inventory.length;
      const countLow = this.inventory.filter(i => i.Current_Stock_Level >= 0 && i.Current_Stock_Level <= 15).length;
      const countNeg = this.inventory.filter(i => i.Current_Stock_Level < 0).length;
      const countHealthy = this.inventory.filter(i => i.Current_Stock_Level > 15).length;

      const fAll = document.getElementById('countFilterAll');
      const fLow = document.getElementById('countFilterLow');
      const fNeg = document.getElementById('countFilterNegative');
      const fHl = document.getElementById('countFilterHealthy');

      if (fAll) fAll.textContent = countAll;
      if (fLow) fLow.textContent = countLow;
      if (fNeg) fNeg.textContent = countNeg;
      if (fHl) fHl.textContent = countHealthy;

      let filtered = this.inventory.filter(item => {
        if (this.inventorySearch) {
          const q = this.inventorySearch.toLowerCase();
          const matchId = item.Item_ID.toLowerCase().includes(q);
          const matchName = item.Item_Name.toLowerCase().includes(q);
          if (!matchId && !matchName) return false;
        }

        if (this.inventoryFilter === 'low') {
          return item.Current_Stock_Level >= 0 && item.Current_Stock_Level <= 15;
        } else if (this.inventoryFilter === 'negative') {
          return item.Current_Stock_Level < 0;
        } else if (this.inventoryFilter === 'healthy') {
          return item.Current_Stock_Level > 15;
        }
        return true;
      });

      const showText = document.getElementById('inventoryShowingText');
      if (showText) showText.textContent = `Showing ${filtered.length} of ${this.inventory.length} items`;

      if (this.inventory.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="table-empty-state">
              <i class="fa-solid fa-boxes-stacked"></i>
              <h4>Master Inventory is currently empty</h4>
              <p>Upload your electrical materials catalog using a CSV file or add items manually.</p>
              <button type="button" class="btn btn-warning btn-sm btn-empty-action" id="emptyUploadInventoryBtn">
                <i class="fa-solid fa-file-arrow-up"></i> Upload Inventory CSV
              </button>
            </td>
          </tr>
        `;
        document.getElementById('emptyUploadInventoryBtn')?.addEventListener('click', () => this.openUploadInventoryModal());
        return;
      }

      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="table-empty-state">
              <i class="fa-solid fa-box-open"></i>
              <h4>No matching inventory items found</h4>
              <p>Try adjusting your search query or filter chips.</p>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = filtered.map(item => {
        const isNegative = item.Current_Stock_Level < 0;
        const isLow = item.Current_Stock_Level >= 0 && item.Current_Stock_Level <= 15;

        let rowClass = '';
        let stockClass = 'healthy';
        let statusBadge = '';

        if (isNegative) {
          rowClass = 'row-negative-alert';
          stockClass = 'negative';
          statusBadge = `<span class="status-pill status-negative"><span class="indicator-dot red"></span> Negative (${item.Current_Stock_Level})</span>`;
        } else if (isLow) {
          rowClass = 'row-low-stock';
          stockClass = 'low';
          statusBadge = `<span class="status-pill status-low"><span class="indicator-dot yellow"></span> Low Stock</span>`;
        } else {
          statusBadge = `<span class="status-pill status-healthy"><span class="indicator-dot green"></span> In Stock</span>`;
        }

        const binLocation = (item.binningLocation || item.Binning_Location || '').trim() || '-';

        return `
          <tr class="${rowClass}">
            <td><span class="item-id-pill">${this.escapeHtml(item.Item_ID)}</span></td>
            <td class="item-name-cell">${this.escapeHtml(item.Item_Name)}</td>
            <td class="bin-location-cell"><span class="bin-location-pill">${this.escapeHtml(binLocation)}</span></td>
            <td class="text-right stock-value-cell ${stockClass}">
              ${item.Current_Stock_Level}
            </td>
            <td>${statusBadge}</td>
            <td class="text-center">
              <div class="action-buttons-cell">
                <button class="btn-table-action take-admin" data-action="take-admin" data-id="${this.escapeHtml(item.Item_ID)}" title="Take Material for Admin Use">
                  <i class="fa-solid fa-cart-arrow-down"></i> Take
                </button>
                <button class="btn-table-action return-admin" data-action="return-admin" data-id="${this.escapeHtml(item.Item_ID)}" title="Process Material Return to Stock">
                  <i class="fa-solid fa-arrow-rotate-left"></i> Return
                </button>
                <button class="btn-table-action edit" data-action="edit-item" data-id="${this.escapeHtml(item.Item_ID)}" title="Edit Item Details">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn-table-action delete" data-action="delete-item" data-id="${this.escapeHtml(item.Item_ID)}" title="Delete Item">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    },

    renderLedgerTable() {
      const tbody = document.getElementById('ledgerTableBody');
      if (!tbody) return;

      const filtered = this.getFilteredTransactions();
      const showText = document.getElementById('ledgerShowingText');
      if (showText) showText.textContent = `Showing ${filtered.length} of ${this.transactions.length} transactions`;

      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="table-empty-state">
              <i class="fa-solid fa-receipt"></i>
              <h4>No transactions found in this date range</h4>
              <p>Adjust the date filter or record a checkout simulation.</p>
            </td>
          </tr>
        `;
        return;
      }

      const sorted = [...filtered].sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

      tbody.innerHTML = sorted.map(txn => {
        const isAdmin = txn.Employee_ID === ADMIN_PROFILE.Employee_ID;
        let empName = 'Unknown Staff';
        let empInitials = 'ST';
        let avatarClass = '';

        if (isAdmin) {
          if (isReturn && txn.Returned_By) {
            empName = `${ADMIN_PROFILE.Full_Name} (Ret: ${txn.Returned_By})`;
          } else if (isReturn) {
            empName = `${ADMIN_PROFILE.Full_Name} (Admin Return)`;
          } else {
            empName = ADMIN_PROFILE.Full_Name;
          }
          empInitials = 'ADM';
          avatarClass = 'admin-avatar';
        } else {
          const emp = this.users.find(u => u.Employee_ID === txn.Employee_ID);
          if (emp) {
            empName = emp.Full_Name;
            empInitials = empName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
          }
        }

        const item = this.inventory.find(i => i.Item_ID === txn.Item_ID);
        const itemName = item ? item.Item_Name : 'Unknown Material';

        const dateObj = new Date(txn.Timestamp);
        const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        const syncBadge = txn.Sync_Status 
          ? `<span class="sync-pill synced"><i class="fa-solid fa-circle-check"></i> Synced</span>`
          : `<span class="sync-pill offline"><i class="fa-solid fa-cloud-arrow-up"></i> Queued</span>`;

        let qtyDisplay = '';
        let typeBadge = '';

        if (isReturn) {
          qtyDisplay = `<span style="color: #0284c7; font-weight: 700;">+${txn.Quantity_Taken} (Returned)</span>`;
          const badgeText = isAdmin ? 'Admin Processed Return' : 'Returned Material';
          typeBadge = `<span class="badge-txn-type return" style="margin-left: 6px;"><i class="fa-solid fa-arrow-rotate-left"></i> ${badgeText}</span>`;
        } else {
          qtyDisplay = `<span style="color: var(--text-primary); font-weight: 700;">-${txn.Quantity_Taken}</span>`;
        }

        return `
          <tr class="${isReturn ? 'row-return-txn' : ''}">
            <td><span class="item-id-pill">${this.escapeHtml(txn.Transaction_ID)}</span></td>
            <td class="timestamp-cell">
              <div>${formattedDate}</div>
              <div style="font-size: 10px; color: var(--text-muted);">${formattedTime}</div>
            </td>
            <td>
              <div class="user-cell">
                <div class="user-avatar-mini ${avatarClass}">${empInitials}</div>
                <div class="user-text-wrap">
                  <span class="user-fullname">${this.escapeHtml(empName)}</span>
                  <span class="user-empid">${this.escapeHtml(txn.Employee_ID)}</span>
                </div>
              </div>
            </td>
            <td>
              <div class="item-ledger-cell">
                <div>
                  <span class="item-name-bold">${this.escapeHtml(itemName)}</span>
                  ${typeBadge}
                </div>
                <span class="item-id-sub">${this.escapeHtml(txn.Item_ID)}</span>
              </div>
            </td>
            <td class="text-right stock-value-cell">
              ${qtyDisplay}
            </td>
            <td class="text-center">
              ${syncBadge}
            </td>
          </tr>
        `;
      }).join('');
    },

    getFilteredTransactions(customOption = null) {
      const preset = customOption || this.ledgerDatePreset;
      const now = new Date();

      return this.transactions.filter(txn => {
        if (this.ledgerSearch && !customOption) {
          const q = this.ledgerSearch.toLowerCase();
          const isAdmin = txn.Employee_ID === ADMIN_PROFILE.Employee_ID;
          const emp = this.users.find(u => u.Employee_ID === txn.Employee_ID);
          const empName = isAdmin ? ADMIN_PROFILE.Full_Name.toLowerCase() : (emp ? emp.Full_Name.toLowerCase() : '');
          const item = this.inventory.find(i => i.Item_ID === txn.Item_ID);
          const itemName = item ? item.Item_Name.toLowerCase() : '';
          
          const matchTxn = txn.Transaction_ID.toLowerCase().includes(q);
          const matchEmpId = txn.Employee_ID.toLowerCase().includes(q);
          const matchEmpName = empName.includes(q);
          const matchItemId = txn.Item_ID.toLowerCase().includes(q);
          const matchItemName = itemName.includes(q);

          if (!matchTxn && !matchEmpId && !matchEmpName && !matchItemId && !matchItemName) {
            return false;
          }
        }

        if (!txn.Timestamp) return true;
        const txnDate = new Date(txn.Timestamp);

        if (preset === 'today') {
          return txnDate.toDateString() === now.toDateString();
        } else if (preset === 'this-week') {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          return txnDate >= startOfWeek;
        } else if (preset === 'this-month') {
          return txnDate.getFullYear() === now.getFullYear() && txnDate.getMonth() === now.getMonth();
        } else if (preset === 'last-30') {
          const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
          return txnDate >= thirtyDaysAgo;
        } else if (preset === 'custom') {
          const from = this.ledgerCustomFrom ? new Date(this.ledgerCustomFrom) : null;
          const to = this.ledgerCustomTo ? new Date(this.ledgerCustomTo) : null;
          if (from) from.setHours(0, 0, 0, 0);
          if (to) to.setHours(23, 59, 59, 999);

          if (from && txnDate < from) return false;
          if (to && txnDate > to) return false;
          return true;
        }

        return true;
      });
    },

    renderEmployeesTable() {
      const tbody = document.getElementById('employeesTableBody');
      if (!tbody) return;

      let filtered = this.users.filter(u => {
        if (this.employeeSearch) {
          const q = this.employeeSearch.toLowerCase();
          return u.Employee_ID.toLowerCase().includes(q) || u.Full_Name.toLowerCase().includes(q);
        }
        return true;
      });

      if (this.users.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="table-empty-state">
              <i class="fa-solid fa-users-gear"></i>
              <h4>No authorized employees loaded</h4>
              <p>Upload your plant staff roster using a CSV file or add individual employees manually.</p>
              <button type="button" class="btn btn-warning btn-sm btn-empty-action" id="emptyUploadEmployeesBtn">
                <i class="fa-solid fa-file-arrow-up"></i> Upload Employees CSV
              </button>
            </td>
          </tr>
        `;
        document.getElementById('emptyUploadEmployeesBtn')?.addEventListener('click', () => this.openUploadEmployeesModal());
        return;
      }

      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="table-empty-state">
              <i class="fa-solid fa-users"></i>
              <h4>No matching employees found</h4>
              <p>Try adjusting your search query.</p>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = filtered.map(emp => {
        const checkoutCount = this.transactions.filter(t => t.Employee_ID === emp.Employee_ID).length;
        const initials = emp.Full_Name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

        return `
          <tr>
            <td><span class="item-id-pill">${this.escapeHtml(emp.Employee_ID)}</span></td>
            <td>
              <div class="user-cell">
                <div class="user-avatar-mini">${initials}</div>
                <span class="user-fullname">${this.escapeHtml(emp.Full_Name)}</span>
              </div>
            </td>
            <td class="text-right stock-value-cell" style="color: var(--text-muted); font-size: 12px;">
              ${checkoutCount} checkouts
            </td>
            <td class="text-center">
              <span class="status-pill status-healthy"><i class="fa-solid fa-shield-check"></i> Authorized</span>
            </td>
            <td class="text-center">
              <button class="btn-table-action delete" data-action="delete-employee" data-id="${this.escapeHtml(emp.Employee_ID)}" title="Revoke Access">
                <i class="fa-solid fa-user-xmark"></i> Revoke
              </button>
            </td>
          </tr>
        `;
      }).join('');
    },

    // =======================================================================
    // Date-Range Export to CSV / Excel (PRD Section 4.4)
    // =======================================================================
    exportLedgerToCsv(option = 'this-month', customFrom = null, customTo = null) {
      let exportTxns = [];
      const now = new Date();

      if (option === 'this-month') {
        exportTxns = this.transactions.filter(t => {
          const d = new Date(t.Timestamp);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });
      } else if (option === 'last-30') {
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        exportTxns = this.transactions.filter(t => new Date(t.Timestamp) >= thirtyDaysAgo);
      } else if (option === 'all') {
        exportTxns = [...this.transactions];
      } else if (option === 'custom') {
        const from = customFrom ? new Date(customFrom) : null;
        const to = customTo ? new Date(customTo) : null;
        if (from) from.setHours(0, 0, 0, 0);
        if (to) to.setHours(23, 59, 59, 999);

        exportTxns = this.transactions.filter(t => {
          const d = new Date(t.Timestamp);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        });
      }

      if (exportTxns.length === 0) {
        this.showToast('No transaction records found for the selected date range to export.', 'warning');
        return;
      }

      exportTxns.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

      const headers = [
        'Transaction_ID',
        'Timestamp_ISO',
        'Date_Formatted',
        'Time_Formatted',
        'Transaction_Type',
        'Employee_ID',
        'Employee_Full_Name',
        'Item_ID',
        'Item_Name',
        'Quantity',
        'Net_Stock_Impact',
        'Sync_Status'
      ];

      const csvRows = [headers.join(',')];

      exportTxns.forEach(txn => {
        const isAdmin = txn.Employee_ID === ADMIN_PROFILE.Employee_ID;
        const emp = this.users.find(u => u.Employee_ID === txn.Employee_ID);
        const isReturn = txn.Transaction_Type === 'RETURN';

        let empName = 'Unknown Staff';
        if (isAdmin) {
          if (isReturn && txn.Returned_By) {
            empName = `${ADMIN_PROFILE.Full_Name} (Ret: ${txn.Returned_By})`;
          } else if (isReturn) {
            empName = `${ADMIN_PROFILE.Full_Name} (Admin Processed Return)`;
          } else {
            empName = ADMIN_PROFILE.Full_Name;
          }
        } else {
          empName = emp ? emp.Full_Name : 'Unknown Staff';
        }

        const item = this.inventory.find(i => i.Item_ID === txn.Item_ID);
        const itemName = item ? item.Item_Name : 'Unknown Material';

        const d = new Date(txn.Timestamp);
        const dateStr = d.toLocaleDateString('en-GB');
        const timeStr = d.toLocaleTimeString('en-US');

        const row = [
          this.escapeCsvField(txn.Transaction_ID),
          this.escapeCsvField(txn.Timestamp),
          this.escapeCsvField(dateStr),
          this.escapeCsvField(timeStr),
          isReturn ? 'RETURN' : 'CHECKOUT',
          this.escapeCsvField(txn.Employee_ID),
          this.escapeCsvField(empName),
          this.escapeCsvField(txn.Item_ID),
          this.escapeCsvField(itemName),
          txn.Quantity_Taken,
          isReturn ? `+${txn.Quantity_Taken}` : `-${txn.Quantity_Taken}`,
          txn.Sync_Status ? 'Synced' : 'Queued (Offline)'
        ];

        csvRows.push(row.join(','));
      });

      const csvString = '\uFEFF' + csvRows.join('\r\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const currentMonthStr = `${monthNames[now.getMonth()]}_${now.getFullYear()}`;
      const fileName = `JSW_Electrical_Dept_Ledger_${option === 'this-month' ? currentMonthStr : option}_${new Date().toISOString().slice(0, 10)}.csv`;

      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.showToast(`Exported ${exportTxns.length} records to ${fileName}`, 'success');
      this.closeModal('exportModal');
    },

    escapeCsvField(val) {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    },

    // =======================================================================
    // Event Listeners & Binding
    // =======================================================================
    bindEvents() {
      // Unified Landing Gateway Role Toggle & Form Submit
      document.getElementById('segmentEmployeeBtn')?.addEventListener('click', () => this.setGatewayRole('employee'));
      document.getElementById('segmentAdminBtn')?.addEventListener('click', () => this.setGatewayRole('admin'));
      document.getElementById('gatewayLoginForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleGatewayLoginSubmit();
      });

      // Global & Header Sign Out Buttons
      document.getElementById('globalLogoutBtn')?.addEventListener('click', () => {
        if (this.currentRole === 'admin') this.logoutAdmin();
        else this.logoutEmployee();
      });
      document.getElementById('adminLogoutBtn')?.addEventListener('click', () => this.logoutAdmin());
      document.getElementById('mobileLogoutBtn')?.addEventListener('click', () => this.logoutEmployee());

      // Top bar Device Frame Toggle
      document.getElementById('toggleDeviceFrameBtn')?.addEventListener('click', () => this.toggleDeviceFrame());

      // Admin Auth Form
      document.getElementById('adminAuthForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('adminUsernameInput')?.value || '';
        const password = document.getElementById('adminPasswordInput')?.value || '';
        this.loginAdmin(username, password);
      });

      // Admin Self-Checkout Trigger Buttons
      document.getElementById('adminHeaderSelfCheckoutBtn')?.addEventListener('click', () => this.openAdminSelfCheckoutModal());
      document.getElementById('openAdminSelfCheckoutBtn')?.addEventListener('click', () => this.openAdminSelfCheckoutModal());

      // Admin Self-Checkout Form Submit
      document.getElementById('adminSelfCheckoutForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleAdminSelfCheckout();
      });

      // Admin Self-Checkout Select & Stepper events
      document.getElementById('adminSelfItemSelect')?.addEventListener('change', () => this.updateAdminSelfCalculation());
      document.getElementById('adminSelfQuantity')?.addEventListener('input', () => this.updateAdminSelfCalculation());

      // Network Toggles & Sync (PRD Section 4.3)
      document.getElementById('globalNetworkToggleBtn')?.addEventListener('click', () => OfflineManager.toggleNetworkMode());
      document.getElementById('mobileNetworkStatusBtn')?.addEventListener('click', () => OfflineManager.toggleNetworkMode());
      document.getElementById('triggerSyncNowBtn')?.addEventListener('click', () => OfflineManager.syncPendingTransactions());
      document.getElementById('mobileSyncNowBtn')?.addEventListener('click', () => OfflineManager.syncPendingTransactions());
      document.getElementById('globalPendingQueueBadge')?.addEventListener('click', () => OfflineManager.syncPendingTransactions());

      // Mobile Login Form (Section 4.1)
      document.getElementById('mobileLoginForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('loginInputName')?.value || '';
        const id = document.getElementById('loginInputEmpId')?.value || '';
        this.loginEmployee(name, id);
      });

      // Mobile Catalog Search & Filters (Section 4.2)
      const mSearch = document.getElementById('mobileSearchInput');
      const clearMSearch = document.getElementById('clearMobileSearch');
      mSearch?.addEventListener('input', (e) => {
        this.mobileSearch = e.target.value;
        clearMSearch?.classList.toggle('hidden', !this.mobileSearch);
        this.renderMobileCatalog();
      });
      clearMSearch?.addEventListener('click', () => {
        mSearch.value = '';
        this.mobileSearch = '';
        clearMSearch.classList.add('hidden');
        this.renderMobileCatalog();
      });

      document.querySelectorAll('.m-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          document.querySelectorAll('.m-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this.mobileFilter = chip.getAttribute('data-mfilter');
          this.renderMobileCatalog();
        });
      });

      // Mobile Catalog Item Tap -> Open Quick Checkout or Return
      document.getElementById('mobileCatalogList')?.addEventListener('click', (e) => {
        const returnBtn = e.target.closest('[data-action="return-item"]');
        if (returnBtn) {
          e.stopPropagation();
          const itemId = returnBtn.getAttribute('data-id');
          this.openMobileReturnModal(itemId);
          return;
        }

        const checkoutBtn = e.target.closest('[data-action="quick-checkout"]');
        if (checkoutBtn) {
          e.stopPropagation();
          const itemId = checkoutBtn.getAttribute('data-id');
          this.openMobileCheckoutModal(itemId);
          return;
        }

        const card = e.target.closest('.m-item-card');
        if (!card) return;
        const itemId = card.getAttribute('data-mobile-item-id');
        this.openMobileCheckoutModal(itemId);
      });

      // Quick Checkout Modal Steppers
      document.getElementById('qtyMinusBtn')?.addEventListener('click', () => {
        const input = document.getElementById('checkoutQtyInput');
        let val = parseInt(input.value, 10) || 1;
        if (val > 1) {
          input.value = val - 1;
          this.updateCheckoutRemainingPreview();
        }
      });

      document.getElementById('qtyPlusBtn')?.addEventListener('click', () => {
        const input = document.getElementById('checkoutQtyInput');
        let val = parseInt(input.value, 10) || 1;
        input.value = val + 1;
        this.updateCheckoutRemainingPreview();
      });

      document.getElementById('checkoutQtyInput')?.addEventListener('input', () => {
        this.updateCheckoutRemainingPreview();
      });

      // Confirm Checkout Button
      document.getElementById('confirmMobileCheckoutBtn')?.addEventListener('click', () => {
        this.handleConfirmMobileCheckout();
      });

      // Return Unused Material Modal Steppers & Confirm
      document.getElementById('returnQtyMinusBtn')?.addEventListener('click', () => {
        const input = document.getElementById('returnQtyInput');
        let val = parseInt(input.value, 10) || 1;
        if (val > 1) {
          input.value = val - 1;
          this.updateReturnNewStockPreview();
        }
      });

      document.getElementById('returnQtyPlusBtn')?.addEventListener('click', () => {
        const input = document.getElementById('returnQtyInput');
        let val = parseInt(input.value, 10) || 1;
        input.value = val + 1;
        this.updateReturnNewStockPreview();
      });

      document.getElementById('returnQtyInput')?.addEventListener('input', () => {
        this.updateReturnNewStockPreview();
      });

      document.getElementById('confirmMobileReturnBtn')?.addEventListener('click', () => {
        this.handleConfirmMobileReturn();
      });

      // Gatekeeper Verification Screen "Done" Button
      document.getElementById('gatekeeperDoneBtn')?.addEventListener('click', () => {
        this.closeGatekeeperPass();
      });

      // Admin Tab Switching
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tabTarget = btn.getAttribute('data-tab');
          this.switchAdminTab(tabTarget, btn);
        });
      });

      // Modal Close buttons
      document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
          const modalId = btn.getAttribute('data-close-modal');
          this.closeModal(modalId);
        });
      });

      // Quick Export & Ledger Export
      document.getElementById('quickExportBtn')?.addEventListener('click', () => this.openExportModal());
      document.getElementById('openExportModalBtn')?.addEventListener('click', () => this.openExportModal());
      document.getElementById('triggerDownloadCsvBtn')?.addEventListener('click', () => {
        const selectedRadio = document.querySelector('input[name="exportDateOption"]:checked')?.value || 'this-month';
        const customFrom = document.getElementById('exportDateFrom')?.value;
        const customTo = document.getElementById('exportDateTo')?.value;
        this.exportLedgerToCsv(selectedRadio, customFrom, customTo);
      });

      document.querySelectorAll('input[name="exportDateOption"]').forEach(radio => {
        radio.addEventListener('change', () => this.updateExportPreviewCount());
      });
      document.getElementById('exportDateFrom')?.addEventListener('change', () => this.updateExportPreviewCount());
      document.getElementById('exportDateTo')?.addEventListener('change', () => this.updateExportPreviewCount());

      // Master Inventory Table Actions
      document.getElementById('openAddItemBtn')?.addEventListener('click', () => this.openAddItemModal());
      document.getElementById('refreshInventoryBtn')?.addEventListener('click', () => {
        this.loadData();
        this.renderAll();
        this.showToast('Inventory reloaded from storage', 'success');
      });

      const invSearch = document.getElementById('inventorySearchInput');
      const clearInvSearch = document.getElementById('clearInventorySearch');
      invSearch?.addEventListener('input', (e) => {
        this.inventorySearch = e.target.value;
        clearInvSearch?.classList.toggle('hidden', !this.inventorySearch);
        this.renderInventoryTable();
      });
      clearInvSearch?.addEventListener('click', () => {
        invSearch.value = '';
        this.inventorySearch = '';
        clearInvSearch.classList.add('hidden');
        this.renderInventoryTable();
      });

      document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this.inventoryFilter = chip.getAttribute('data-filter');
          this.renderInventoryTable();
        });
      });

      document.getElementById('inventoryTableBody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');

        if (action === 'take-admin') {
          this.openAdminSelfCheckoutModal(id);
        } else if (action === 'return-admin') {
          this.openAdminReturnModal(id);
        } else if (action === 'edit-item') {
          this.openEditItemModal(id);
        } else if (action === 'delete-item') {
          this.deleteItem(id);
        }
      });

      // Admin Return Modal Steppers and Submit
      document.getElementById('adminReturnItemSelect')?.addEventListener('change', () => {
        this.updateAdminReturnCalculation();
      });

      document.getElementById('adminReturnQtyMinusBtn')?.addEventListener('click', () => {
        const input = document.getElementById('adminReturnQuantity');
        let val = parseInt(input.value, 10) || 1;
        if (val > 1) {
          input.value = val - 1;
          this.updateAdminReturnCalculation();
        }
      });

      document.getElementById('adminReturnQtyPlusBtn')?.addEventListener('click', () => {
        const input = document.getElementById('adminReturnQuantity');
        let val = parseInt(input.value, 10) || 1;
        input.value = val + 1;
        this.updateAdminReturnCalculation();
      });

      document.getElementById('adminReturnQuantity')?.addEventListener('input', () => {
        this.updateAdminReturnCalculation();
      });

      document.getElementById('adminReturnForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleAdminReturnSubmit();
      });

      document.getElementById('itemForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSaveItem();
      });

      // Ledger Events
      const ledSearch = document.getElementById('ledgerSearchInput');
      const clearLedSearch = document.getElementById('clearLedgerSearch');
      ledSearch?.addEventListener('input', (e) => {
        this.ledgerSearch = e.target.value;
        clearLedSearch?.classList.toggle('hidden', !this.ledgerSearch);
        this.renderLedgerTable();
      });
      clearLedSearch?.addEventListener('click', () => {
        ledSearch.value = '';
        this.ledgerSearch = '';
        clearLedSearch.classList.add('hidden');
        this.renderLedgerTable();
      });

      const datePresetSelect = document.getElementById('datePresetSelect');
      const customBox = document.getElementById('customDateRangeBox');
      datePresetSelect?.addEventListener('change', (e) => {
        this.ledgerDatePreset = e.target.value;
        if (this.ledgerDatePreset === 'custom') {
          customBox?.classList.remove('hidden');
        } else {
          customBox?.classList.add('hidden');
          this.renderLedgerTable();
        }
      });

      document.getElementById('applyCustomDateBtn')?.addEventListener('click', () => {
        this.ledgerCustomFrom = document.getElementById('customDateFrom')?.value;
        this.ledgerCustomTo = document.getElementById('customDateTo')?.value;
        this.renderLedgerTable();
      });

      document.getElementById('refreshLedgerBtn')?.addEventListener('click', () => {
        this.loadData();
        this.renderAll();
        this.showToast('Ledger refreshed', 'success');
      });

      document.getElementById('simulateCheckoutBtn')?.addEventListener('click', () => this.openSimulateModal());
      document.getElementById('simulateForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSimulateCheckout();
      });

      document.getElementById('openAddEmployeeBtn')?.addEventListener('click', () => this.openAddEmployeeModal());
      document.getElementById('employeeForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSaveEmployee();
      });

      document.getElementById('employeesTableBody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="delete-employee"]');
        if (!btn) return;
        const empId = btn.getAttribute('data-id');
        this.deleteEmployee(empId);
      });

      const empSearch = document.getElementById('employeeSearchInput');
      const clearEmpSearch = document.getElementById('clearEmployeeSearch');
      empSearch?.addEventListener('input', (e) => {
        this.employeeSearch = e.target.value;
        clearEmpSearch?.classList.toggle('hidden', !this.employeeSearch);
        this.renderEmployeesTable();
      });
      clearEmpSearch?.addEventListener('click', () => {
        empSearch.value = '';
        this.employeeSearch = '';
        clearEmpSearch.classList.add('hidden');
        this.renderEmployeesTable();
      });

      // Upload Buttons (Header & Tabs)
      document.getElementById('adminHeaderUploadInventoryBtn')?.addEventListener('click', () => this.openUploadInventoryModal());
      document.getElementById('openUploadInventoryBtn')?.addEventListener('click', () => this.openUploadInventoryModal());
      document.getElementById('adminHeaderUploadEmployeesBtn')?.addEventListener('click', () => this.openUploadEmployeesModal());
      document.getElementById('openUploadEmployeesBtn')?.addEventListener('click', () => this.openUploadEmployeesModal());

      // Inventory Upload Modal Events
      document.getElementById('downloadInventoryTemplateBtn')?.addEventListener('click', () => this.downloadInventoryTemplate());
      
      const invFileInput = document.getElementById('inventoryCsvFileInput');
      invFileInput?.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleInventoryFileSelected(e.target.files[0]);
        }
      });

      const invDropzone = document.getElementById('inventoryDropzone');
      if (invDropzone) {
        ['dragenter', 'dragover'].forEach(eventName => {
          invDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            invDropzone.classList.add('dragover');
          }, false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
          invDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            invDropzone.classList.remove('dragover');
          }, false);
        });
        invDropzone.addEventListener('drop', (e) => {
          const dt = e.dataTransfer;
          const files = dt.files;
          if (files && files[0]) {
            this.handleInventoryFileSelected(files[0]);
          }
        }, false);
      }

      document.getElementById('removeInventoryFileBtn')?.addEventListener('click', () => this.removeInventoryFile());
      document.getElementById('inventoryCsvTextarea')?.addEventListener('input', (e) => {
        this.processInventoryCsv(e.target.value);
      });
      document.getElementById('saveUploadedInventoryBtn')?.addEventListener('click', () => this.handleSaveUploadedInventory());

      // Employees Upload Modal Events
      document.getElementById('downloadEmployeesTemplateBtn')?.addEventListener('click', () => this.downloadEmployeesTemplate());

      const empFileInput = document.getElementById('employeesCsvFileInput');
      empFileInput?.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleEmployeesFileSelected(e.target.files[0]);
        }
      });

      const empDropzone = document.getElementById('employeesDropzone');
      if (empDropzone) {
        ['dragenter', 'dragover'].forEach(eventName => {
          empDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            empDropzone.classList.add('dragover');
          }, false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
          empDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            empDropzone.classList.remove('dragover');
          }, false);
        });
        empDropzone.addEventListener('drop', (e) => {
          const dt = e.dataTransfer;
          const files = dt.files;
          if (files && files[0]) {
            this.handleEmployeesFileSelected(files[0]);
          }
        }, false);
      }

      document.getElementById('removeEmployeesFileBtn')?.addEventListener('click', () => this.removeEmployeesFile());
      document.getElementById('employeesCsvTextarea')?.addEventListener('input', (e) => {
        this.processEmployeesCsv(e.target.value);
      });
      document.getElementById('saveUploadedEmployeesBtn')?.addEventListener('click', () => this.handleSaveUploadedEmployees());

      document.getElementById('resetDataBtn')?.addEventListener('click', () => {
        if (confirm('Clear and reset all local database collections? Database will be empty and ready for fresh CSV uploads.')) {
          Storage.resetAll();
          this.loadData();
          this.currentUser = null;
          this.adminUser = null;
          OfflineManager.setOnlineState(true);
          this.renderAll();
          this.routeTo('landing');
          this.showToast('Database reset to clean empty state', 'success');
        }
      });
    },

    switchAdminTab(tabId, activeBtn) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      activeBtn.classList.add('active');
      const targetEl = document.getElementById(tabId);
      if (targetEl) targetEl.classList.add('active');
    },

    openModal(modalId) {
      const el = document.getElementById(modalId);
      if (el) el.classList.remove('hidden');
    },

    closeModal(modalId) {
      const el = document.getElementById(modalId);
      if (el) el.classList.add('hidden');
    },

    openAddItemModal() {
      this.editingItemId = null;
      document.getElementById('itemModalTitle').textContent = 'Add New Inventory Item';
      const idInput = document.getElementById('itemInputId');
      idInput.readOnly = false;
      idInput.value = this.generateNextItemId();
      document.getElementById('itemInputName').value = '';
      document.getElementById('itemInputStock').value = '0';
      const binInput = document.getElementById('itemInputBinLocation');
      if (binInput) binInput.value = '';
      this.openModal('itemModal');
    },

    openEditItemModal(itemId) {
      const item = this.inventory.find(i => i.Item_ID === itemId);
      if (!item) return;

      this.editingItemId = itemId;
      document.getElementById('itemModalTitle').textContent = `Edit Item (${itemId})`;
      const idInput = document.getElementById('itemInputId');
      idInput.value = item.Item_ID;
      idInput.readOnly = true;
      document.getElementById('itemInputName').value = item.Item_Name;
      document.getElementById('itemInputStock').value = item.Current_Stock_Level;
      const binInput = document.getElementById('itemInputBinLocation');
      if (binInput) binInput.value = (item.binningLocation || item.Binning_Location || '').trim();
      this.openModal('itemModal');
    },

    handleSaveItem() {
      const id = document.getElementById('itemInputId').value.trim();
      const name = document.getElementById('itemInputName').value.trim();
      const stock = parseInt(document.getElementById('itemInputStock').value, 10) || 0;
      const binningLocation = (document.getElementById('itemInputBinLocation')?.value || '').trim() || '-';

      if (!id || !name) {
        this.showToast('Please enter both Item ID and Item Name', 'warning');
        return;
      }

      if (this.editingItemId) {
        const item = this.inventory.find(i => i.Item_ID === this.editingItemId);
        if (item) {
          item.Item_Name = name;
          item.Current_Stock_Level = stock;
          item.binningLocation = binningLocation;
          this.saveInventory();
          CloudDB.saveItem(item);
          this.showToast(`Updated "${name}" successfully`, 'success');
        }
      } else {
        if (this.inventory.some(i => i.Item_ID.toLowerCase() === id.toLowerCase())) {
          this.showToast(`Item ID "${id}" already exists in inventory`, 'danger');
          return;
        }

        const newItem = {
          Item_ID: id,
          Item_Name: name,
          Current_Stock_Level: stock,
          binningLocation: binningLocation
        };
        this.inventory.push(newItem);
        this.saveInventory();
        CloudDB.saveItem(newItem);
        this.showToast(`Added "${name}" to Master Inventory`, 'success');
      }

      this.closeModal('itemModal');
      this.renderAll();
    },

    deleteItem(itemId) {
      const item = this.inventory.find(i => i.Item_ID === itemId);
      if (!item) return;

      if (confirm(`Are you sure you want to delete "${item.Item_Name}" (${itemId}) from Master Inventory?`)) {
        this.inventory = this.inventory.filter(i => i.Item_ID !== itemId);
        this.saveInventory();
        CloudDB.deleteItem(itemId);
        this.renderAll();
        this.showToast(`Deleted "${item.Item_Name}" from inventory`, 'warning');
      }
    },

    openExportModal() {
      const now = new Date();
      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const currentMonthText = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
      
      const monthEl = document.getElementById('exportMonthName');
      if (monthEl) monthEl.textContent = currentMonthText;

      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const today = now.toISOString().slice(0, 10);
      
      const fromInput = document.getElementById('exportDateFrom');
      const toInput = document.getElementById('exportDateTo');
      if (fromInput && !fromInput.value) fromInput.value = firstDay;
      if (toInput && !toInput.value) toInput.value = today;

      this.updateExportPreviewCount();
      this.openModal('exportModal');
    },

    updateExportPreviewCount() {
      const selectedOption = document.querySelector('input[name="exportDateOption"]:checked')?.value || 'this-month';
      const customFrom = document.getElementById('exportDateFrom')?.value;
      const customTo = document.getElementById('exportDateTo')?.value;
      const countEl = document.getElementById('exportRecordCount');
      
      const txns = this.getFilteredTransactionsForExport(selectedOption, customFrom, customTo);
      if (countEl) countEl.textContent = txns.length;
    },

    getFilteredTransactionsForExport(option, customFrom, customTo) {
      const now = new Date();
      return this.transactions.filter(t => {
        const d = new Date(t.Timestamp);
        if (option === 'this-month') {
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        } else if (option === 'last-30') {
          const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
          return d >= thirtyDaysAgo;
        } else if (option === 'all') {
          return true;
        } else if (option === 'custom') {
          const from = customFrom ? new Date(customFrom) : null;
          const to = customTo ? new Date(customTo) : null;
          if (from) from.setHours(0, 0, 0, 0);
          if (to) to.setHours(23, 59, 59, 999);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        }
        return true;
      });
    },

    openSimulateModal() {
      this.updateSimulationSelects();
      this.openModal('simulateModal');
    },

    updateSimulationSelects() {
      const empSelect = document.getElementById('simEmployeeSelect');
      const itemSelect = document.getElementById('simItemSelect');

      if (empSelect) {
        empSelect.innerHTML = this.users.map(u => 
          `<option value="${this.escapeHtml(u.Employee_ID)}">${this.escapeHtml(u.Full_Name)} (${this.escapeHtml(u.Employee_ID)})</option>`
        ).join('');
      }

      if (itemSelect) {
        itemSelect.innerHTML = this.inventory.map(i => 
          `<option value="${this.escapeHtml(i.Item_ID)}">${this.escapeHtml(i.Item_Name)} (Stock: ${i.Current_Stock_Level})</option>`
        ).join('');
      }
    },

    handleSimulateCheckout() {
      const empId = document.getElementById('simEmployeeSelect').value;
      const itemId = document.getElementById('simItemSelect').value;
      const qty = parseInt(document.getElementById('simQuantity').value, 10) || 1;
      const isOnline = document.getElementById('simSyncStatus').value === 'true';

      const item = this.inventory.find(i => i.Item_ID === itemId);
      const emp = this.users.find(u => u.Employee_ID === empId);

      if (!item || !emp) return;

      item.Current_Stock_Level -= qty;
      this.saveInventory();

      const newTxn = {
        Transaction_ID: `TXN-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`,
        Employee_ID: empId,
        Item_ID: itemId,
        Quantity_Taken: qty,
        Timestamp: new Date().toISOString(),
        Sync_Status: isOnline
      };

      if (!isOnline) {
        OfflineManager.queueOfflineTransaction(newTxn);
      } else {
        this.transactions.unshift(newTxn);
        this.saveTransactions();
      }

      this.closeModal('simulateModal');
      this.renderAll();

      if (item.Current_Stock_Level < 0) {
        this.showToast(`Checkout logged: Stock for "${item.Item_Name}" is NEGATIVE (${item.Current_Stock_Level}).`, 'danger');
      } else {
        this.showToast(`Checkout recorded for ${emp.Full_Name} (${qty}x ${item.Item_Name})`, 'success');
      }
    },

    openAddEmployeeModal() {
      document.getElementById('empInputId').value = this.generateNextEmpId();
      document.getElementById('empInputName').value = '';
      this.openModal('employeeModal');
    },

    handleSaveEmployee() {
      const empId = document.getElementById('empInputId').value.trim();
      const name = document.getElementById('empInputName').value.trim();

      if (!empId || !name) {
        this.showToast('Please enter both Employee ID and Full Name', 'warning');
        return;
      }

      if (this.users.some(u => u.Employee_ID.toLowerCase() === empId.toLowerCase())) {
        this.showToast(`Employee ID "${empId}" is already provisioned`, 'danger');
        return;
      }

      const newUser = {
        Employee_ID: empId,
        Full_Name: name
      };
      this.users.push(newUser);
      this.saveUsers();
      CloudDB.saveUser(newUser);
      this.closeModal('employeeModal');
      this.renderAll();
      this.showToast(`Provisioned access for ${name} (${empId})`, 'success');
    },

    deleteEmployee(empId) {
      const emp = this.users.find(u => u.Employee_ID === empId);
      if (!emp) return;

      if (confirm(`Revoke mobile application access for ${emp.Full_Name} (${empId})?`)) {
        this.users = this.users.filter(u => u.Employee_ID !== empId);
        this.saveUsers();
        CloudDB.deleteUser(empId);
        this.renderAll();
        this.showToast(`Revoked access for ${emp.Full_Name}`, 'warning');
      }
    },

    // =======================================================================
    // CSV Upload & Bulk Persistence Workflows (Inventory & Employees)
    // =======================================================================
    openUploadInventoryModal() {
      this.pendingUploadedInventory = [];
      const fileInput = document.getElementById('inventoryCsvFileInput');
      const textarea = document.getElementById('inventoryCsvTextarea');
      const previewCont = document.getElementById('inventoryCsvPreviewContainer');
      const attachedCard = document.getElementById('inventoryAttachedFileCard');
      const saveBtn = document.getElementById('saveUploadedInventoryBtn');
      const dropzone = document.getElementById('inventoryDropzone');

      if (fileInput) fileInput.value = '';
      if (textarea) textarea.value = '';
      if (previewCont) previewCont.classList.add('hidden');
      if (attachedCard) attachedCard.classList.add('hidden');
      if (dropzone) dropzone.classList.remove('hidden');
      if (saveBtn) saveBtn.disabled = true;

      const defaultMode = this.inventory.length > 0 ? 'append' : 'replace';
      const radio = document.querySelector(`input[name="inventoryImportMode"][value="${defaultMode}"]`);
      if (radio) radio.checked = true;

      this.openModal('uploadInventoryModal');
    },

    openUploadEmployeesModal() {
      this.pendingUploadedEmployees = [];
      const fileInput = document.getElementById('employeesCsvFileInput');
      const textarea = document.getElementById('employeesCsvTextarea');
      const previewCont = document.getElementById('employeesCsvPreviewContainer');
      const attachedCard = document.getElementById('employeesAttachedFileCard');
      const saveBtn = document.getElementById('saveUploadedEmployeesBtn');
      const dropzone = document.getElementById('employeesDropzone');

      if (fileInput) fileInput.value = '';
      if (textarea) textarea.value = '';
      if (previewCont) previewCont.classList.add('hidden');
      if (attachedCard) attachedCard.classList.add('hidden');
      if (dropzone) dropzone.classList.remove('hidden');
      if (saveBtn) saveBtn.disabled = true;

      const defaultMode = this.users.length > 0 ? 'append' : 'replace';
      const radio = document.querySelector(`input[name="employeesImportMode"][value="${defaultMode}"]`);
      if (radio) radio.checked = true;

      this.openModal('uploadEmployeesModal');
    },

    handleInventoryFileSelected(file) {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.csv') && file.type && !file.type.includes('csv') && !file.type.includes('text')) {
        this.showToast('Please select a valid .csv file', 'warning');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        
        const attachedCard = document.getElementById('inventoryAttachedFileCard');
        const fileNameEl = document.getElementById('inventoryAttachedFileName');
        const fileSizeEl = document.getElementById('inventoryAttachedFileSize');
        const dropzone = document.getElementById('inventoryDropzone');
        const textarea = document.getElementById('inventoryCsvTextarea');

        if (attachedCard) attachedCard.classList.remove('hidden');
        if (fileNameEl) fileNameEl.textContent = file.name;
        if (fileSizeEl) fileSizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;
        if (dropzone) dropzone.classList.add('hidden');
        if (textarea) textarea.value = text;

        this.processInventoryCsv(text);
      };
      reader.onerror = () => {
        this.showToast('Error reading uploaded CSV file', 'danger');
      };
      reader.readAsText(file, 'UTF-8');
    },

    handleEmployeesFileSelected(file) {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.csv') && file.type && !file.type.includes('csv') && !file.type.includes('text')) {
        this.showToast('Please select a valid .csv file', 'warning');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        
        const attachedCard = document.getElementById('employeesAttachedFileCard');
        const fileNameEl = document.getElementById('employeesAttachedFileName');
        const fileSizeEl = document.getElementById('employeesAttachedFileSize');
        const dropzone = document.getElementById('employeesDropzone');
        const textarea = document.getElementById('employeesCsvTextarea');

        if (attachedCard) attachedCard.classList.remove('hidden');
        if (fileNameEl) fileNameEl.textContent = file.name;
        if (fileSizeEl) fileSizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;
        if (dropzone) dropzone.classList.add('hidden');
        if (textarea) textarea.value = text;

        this.processEmployeesCsv(text);
      };
      reader.onerror = () => {
        this.showToast('Error reading uploaded CSV file', 'danger');
      };
      reader.readAsText(file, 'UTF-8');
    },

    removeInventoryFile() {
      const fileInput = document.getElementById('inventoryCsvFileInput');
      const textarea = document.getElementById('inventoryCsvTextarea');
      const attachedCard = document.getElementById('inventoryAttachedFileCard');
      const dropzone = document.getElementById('inventoryDropzone');
      const previewCont = document.getElementById('inventoryCsvPreviewContainer');
      const saveBtn = document.getElementById('saveUploadedInventoryBtn');

      if (fileInput) fileInput.value = '';
      if (textarea) textarea.value = '';
      if (attachedCard) attachedCard.classList.add('hidden');
      if (dropzone) dropzone.classList.remove('hidden');
      if (previewCont) previewCont.classList.add('hidden');
      if (saveBtn) saveBtn.disabled = true;
      this.pendingUploadedInventory = [];
    },

    removeEmployeesFile() {
      const fileInput = document.getElementById('employeesCsvFileInput');
      const textarea = document.getElementById('employeesCsvTextarea');
      const attachedCard = document.getElementById('employeesAttachedFileCard');
      const dropzone = document.getElementById('employeesDropzone');
      const previewCont = document.getElementById('employeesCsvPreviewContainer');
      const saveBtn = document.getElementById('saveUploadedEmployeesBtn');

      if (fileInput) fileInput.value = '';
      if (textarea) textarea.value = '';
      if (attachedCard) attachedCard.classList.add('hidden');
      if (dropzone) dropzone.classList.remove('hidden');
      if (previewCont) previewCont.classList.add('hidden');
      if (saveBtn) saveBtn.disabled = true;
      this.pendingUploadedEmployees = [];
    },

    processInventoryCsv(text) {
      const rawRows = CsvUtil.parse(text);
      const result = CsvUtil.parseInventoryRows(rawRows);

      this.pendingUploadedInventory = result.valid;

      const previewCont = document.getElementById('inventoryCsvPreviewContainer');
      const validCountEl = document.getElementById('inventoryPreviewValidCount');
      const invalidCountEl = document.getElementById('inventoryPreviewInvalidCount');
      const tbody = document.getElementById('inventoryPreviewTableBody');
      const saveBtn = document.getElementById('saveUploadedInventoryBtn');

      if (result.valid.length === 0 && result.invalid.length === 0) {
        if (previewCont) previewCont.classList.add('hidden');
        if (saveBtn) saveBtn.disabled = true;
        return;
      }

      if (previewCont) previewCont.classList.remove('hidden');
      if (validCountEl) validCountEl.textContent = `${result.valid.length} Valid Items`;
      
      if (invalidCountEl) {
        if (result.invalid.length > 0) {
          invalidCountEl.textContent = `${result.invalid.length} Invalid Skipped`;
          invalidCountEl.classList.remove('hidden');
        } else {
          invalidCountEl.classList.add('hidden');
        }
      }

      if (tbody) {
        let html = result.valid.slice(0, 50).map(item => `
          <tr>
            <td><span class="item-id-pill">${this.escapeHtml(item.Item_ID)}</span></td>
            <td>${this.escapeHtml(item.Item_Name)}</td>
            <td><span class="bin-location-pill">${this.escapeHtml(item.binningLocation || '-')}</span></td>
            <td class="text-right stock-value-cell">${item.Current_Stock_Level}</td>
            <td class="text-center"><span class="status-pill status-healthy"><i class="fa-solid fa-check"></i> Valid</span></td>
          </tr>
        `).join('');

        if (result.valid.length > 50) {
          html += `
            <tr>
              <td colspan="5" style="text-align:center; font-style:italic; color:var(--text-muted); padding:6px;">
                ... and ${result.valid.length - 50} more items ready to save.
              </td>
            </tr>
          `;
        }

        if (result.invalid.length > 0) {
          html += result.invalid.slice(0, 5).map(inv => `
            <tr class="row-invalid">
              <td colspan="4"><span style="font-size:10px;">Row ${inv.rowNumber}: ${this.escapeHtml(inv.raw)}</span></td>
              <td class="text-center"><span class="status-pill status-negative">${this.escapeHtml(inv.reason)}</span></td>
            </tr>
          `).join('');
        }

        tbody.innerHTML = html;
      }

      if (saveBtn) {
        saveBtn.disabled = result.valid.length === 0;
      }
    },

    processEmployeesCsv(text) {
      const rawRows = CsvUtil.parse(text);
      const result = CsvUtil.parseEmployeeRows(rawRows);

      this.pendingUploadedEmployees = result.valid;

      const previewCont = document.getElementById('employeesCsvPreviewContainer');
      const validCountEl = document.getElementById('employeesPreviewValidCount');
      const invalidCountEl = document.getElementById('employeesPreviewInvalidCount');
      const tbody = document.getElementById('employeesPreviewTableBody');
      const saveBtn = document.getElementById('saveUploadedEmployeesBtn');

      if (result.valid.length === 0 && result.invalid.length === 0) {
        if (previewCont) previewCont.classList.add('hidden');
        if (saveBtn) saveBtn.disabled = true;
        return;
      }

      if (previewCont) previewCont.classList.remove('hidden');
      if (validCountEl) validCountEl.textContent = `${result.valid.length} Valid Staff`;
      
      if (invalidCountEl) {
        if (result.invalid.length > 0) {
          invalidCountEl.textContent = `${result.invalid.length} Invalid Skipped`;
          invalidCountEl.classList.remove('hidden');
        } else {
          invalidCountEl.classList.add('hidden');
        }
      }

      if (tbody) {
        let html = result.valid.slice(0, 50).map(emp => `
          <tr>
            <td><span class="item-id-pill">${this.escapeHtml(emp.Employee_ID)}</span></td>
            <td>${this.escapeHtml(emp.Full_Name)}</td>
            <td class="text-center"><span class="status-pill status-healthy"><i class="fa-solid fa-check"></i> Valid</span></td>
          </tr>
        `).join('');

        if (result.valid.length > 50) {
          html += `
            <tr>
              <td colspan="3" style="text-align:center; font-style:italic; color:var(--text-muted); padding:6px;">
                ... and ${result.valid.length - 50} more employees ready to save.
              </td>
            </tr>
          `;
        }

        if (result.invalid.length > 0) {
          html += result.invalid.slice(0, 5).map(inv => `
            <tr class="row-invalid">
              <td colspan="2"><span style="font-size:10px;">Row ${inv.rowNumber}: ${this.escapeHtml(inv.raw)}</span></td>
              <td class="text-center"><span class="status-pill status-negative">${this.escapeHtml(inv.reason)}</span></td>
            </tr>
          `).join('');
        }

        tbody.innerHTML = html;
      }

      if (saveBtn) {
        saveBtn.disabled = result.valid.length === 0;
      }
    },

    handleSaveUploadedInventory() {
      if (!this.pendingUploadedInventory || this.pendingUploadedInventory.length === 0) {
        this.showToast('No valid inventory items to import', 'warning');
        return;
      }

      const mode = document.querySelector('input[name="inventoryImportMode"]:checked')?.value || 'append';
      let addedCount = 0;
      let updatedCount = 0;

      if (mode === 'replace') {
        this.inventory = [...this.pendingUploadedInventory];
        addedCount = this.inventory.length;
      } else {
        this.pendingUploadedInventory.forEach(newItem => {
          const existing = this.inventory.find(i => i.Item_ID.toLowerCase() === newItem.Item_ID.toLowerCase());
          if (existing) {
            existing.Item_Name = newItem.Item_Name;
            existing.Current_Stock_Level = newItem.Current_Stock_Level;
            updatedCount++;
          } else {
            this.inventory.push(newItem);
            addedCount++;
          }
        });
      }

      this.saveInventory();
      if (CloudDB.isReady()) {
        CloudDB.bulkUploadInventory(this.inventory, mode);
      }
      this.closeModal('uploadInventoryModal');
      this.renderAll();

      const msg = mode === 'replace'
        ? `Database updated: Loaded ${addedCount} inventory items (Clean replace).`
        : `Database updated: Added ${addedCount} new, updated ${updatedCount} existing item(s).`;
      this.showToast(msg, 'success');
    },

    handleSaveUploadedEmployees() {
      if (!this.pendingUploadedEmployees || this.pendingUploadedEmployees.length === 0) {
        this.showToast('No valid employees to import', 'warning');
        return;
      }

      const mode = document.querySelector('input[name="employeesImportMode"]:checked')?.value || 'append';
      let addedCount = 0;
      let updatedCount = 0;

      if (mode === 'replace') {
        this.users = [...this.pendingUploadedEmployees];
        addedCount = this.users.length;
      } else {
        this.pendingUploadedEmployees.forEach(newEmp => {
          const existing = this.users.find(u => u.Employee_ID.toLowerCase() === newEmp.Employee_ID.toLowerCase());
          if (existing) {
            existing.Full_Name = newEmp.Full_Name;
            updatedCount++;
          } else {
            this.users.push(newEmp);
            addedCount++;
          }
        });
      }

      this.saveUsers();
      if (CloudDB.isReady()) {
        CloudDB.bulkUploadEmployees(this.users, mode);
      }
      this.closeModal('uploadEmployeesModal');
      this.renderAll();

      const msg = mode === 'replace'
        ? `Database updated: Loaded ${addedCount} authorized employees (Clean replace).`
        : `Database updated: Added ${addedCount} new, updated ${updatedCount} existing employee(s).`;
      this.showToast(msg, 'success');
    },

    downloadInventoryTemplate() {
      const headers = ['Item_ID', 'Item_Name', 'Current_Stock_Level', 'Binning_Location'];
      const rows = [
        ['ITM-001', 'PVC Insulation Tape (Black - 10m)', 120, 'Rack A-01'],
        ['ITM-002', '2.5 sq mm Copper Wire Roll (Red - 90m)', 18, 'Rack B-03'],
        ['ITM-003', '16A Single Pole MCB (Schneider C-Curve)', 35, 'Shelf C-12'],
        ['ITM-004', 'Cable Ties 200mm (Pack of 100)', 50, '-']
      ];

      const csvContent = '\uFEFF' + [
        headers.join(','),
        ...rows.map(r => `${r[0]},"${r[1]}",${r[2]},"${r[3]}"`)
      ].join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'jsw_inventory_template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.showToast('Downloaded inventory template CSV', 'info');
    },

    downloadEmployeesTemplate() {
      const headers = ['Employee_ID', 'Full_Name'];
      const rows = [
        ['EMP-1001', 'Rajesh Kumar'],
        ['EMP-1002', 'Amit Sharma'],
        ['EMP-1003', 'Vikram Singh'],
        ['EMP-1004', 'Suresh Patel']
      ];

      const csvContent = '\uFEFF' + [
        headers.join(','),
        ...rows.map(r => `${r[0]},"${r[1]}"`)
      ].join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'jsw_employees_template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.showToast('Downloaded employees template CSV', 'info');
    },

    generateNextItemId() {
      const count = this.inventory.length + 1;
      return `ITM-${String(count).padStart(3, '0')}`;
    },

    generateNextEmpId() {
      const count = 1000 + this.users.length + 1;
      return `EMP-${count}`;
    },

    initClock() {
      const update = () => {
        const now = new Date();
        const str = now.toLocaleTimeString('en-US', { hour12: false });
        const timeStr12 = now.toLocaleTimeString('en-US', { hour12: true });

        const el = document.getElementById('clockDisplay');
        if (el) el.textContent = str;

        const passClockEl = document.getElementById('passLiveClock');
        if (passClockEl) passClockEl.textContent = timeStr12;
      };
      update();
      setInterval(update, 1000);
    },

    showToast(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      
      let icon = 'fa-info-circle';
      if (type === 'success') icon = 'fa-circle-check';
      if (type === 'warning') icon = 'fa-triangle-exclamation';
      if (type === 'danger') icon = 'fa-circle-exclamation';

      toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${this.escapeHtml(message)}</span>
      `;

      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        toast.style.transition = 'all 0.2s ease';
        setTimeout(() => toast.remove(), 200);
      }, 3500);
    },

    escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  };

  document.addEventListener('DOMContentLoaded', () => App.init());
})();
