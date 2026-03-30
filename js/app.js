// ═══════════════════════════════════════════════
//  CAPTA — Core JS v2.2
//  Fix: sync tidak menimpa data lokal jika Sheets kosong
// ═══════════════════════════════════════════════

const CONFIG = {
  get SCRIPT_URL() { return localStorage.getItem('capta_script_url') || ''; },
};

// ── Auth ──────────────────────────────────────
const USERS = {
  'admin':    { pass: 'capta2026',  role: 'admin',   name: 'Admin',      initial: 'AD' },
  'owner':    { pass: 'capta.boss', role: 'owner',   name: 'Owner',      initial: 'OW' },
  'manajer':  { pass: 'mgmt2026',   role: 'manajer', name: 'Manajer',    initial: 'MG' },
  'desainer': { pass: 'dsn2026',    role: 'viewer',  name: 'Desainer',   initial: 'DS' },
  'gudang':   { pass: 'stok2026',   role: 'staff',   name: 'Tim Gudang', initial: 'GD' },
};

function getUser() {
  const raw = sessionStorage.getItem('capta_user');
  return raw ? JSON.parse(raw) : null;
}
function authGuard() {
  const u = getUser();
  if (!u) { window.location.href = '../index.html'; return null; }
  return u;
}
function logout() {
  sessionStorage.removeItem('capta_user');
  window.location.href = '../index.html';
}

// ── Local DB ──────────────────────────────────
const DB = {
  get(key) {
    try { return JSON.parse(localStorage.getItem('capta_' + key) || '[]'); }
    catch { return []; }
  },
  set(key, val) { localStorage.setItem('capta_' + key, JSON.stringify(val)); },
  genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); },
  push(key, item) {
    const data = this.get(key);
    item.id = item.id || this.genId();
    item.created_at = new Date().toISOString();
    item.created_by = getUser()?.username || '';
    data.unshift(item);
    this.set(key, data);
    return item;
  },
  update(key, id, changes) {
    const data = this.get(key);
    const i = data.findIndex(x => x.id === id);
    if (i > -1) {
      data[i] = { ...data[i], ...changes, updated_at: new Date().toISOString() };
      this.set(key, data);
      return data[i];
    }
    return null;
  },
  delete(key, id) {
    this.set(key, this.get(key).filter(x => x.id !== id));
  },
};

// ── Google Sheets API via GET ─────────────────
const GS = {
  async call(params) {
    if (!CONFIG.SCRIPT_URL) return null;
    try {
      const url = CONFIG.SCRIPT_URL + '?' + new URLSearchParams(params).toString();
      const res  = await fetch(url, { redirect: 'follow' });
      const text = await res.text();
      return JSON.parse(text);
    } catch(e) {
      console.warn('GS error:', e);
      return null;
    }
  },
  async getAll(sheet) {
    const r = await this.call({ action: 'getAll', sheet });
    return r?.data ?? null;
  },
  async append(sheet, row) {
    return await this.call({ action: 'append', sheet, row: JSON.stringify(row) });
  },
  async updateRow(sheet, id, row) {
    return await this.call({ action: 'update', sheet, id, row: JSON.stringify(row) });
  },
  async deleteRow(sheet, id) {
    return await this.call({ action: 'delete', sheet, id });
  },

  // ── Smart sync: Sheets → lokal HANYA jika Sheets punya data lebih banyak
  //    Jika Sheets kosong tapi lokal ada data, upload lokal ke Sheets
  async smartSync(sheet) {
    const gsData   = await this.getAll(sheet);
    const localData = DB.get(sheet);

    if (gsData === null) {
      // Gagal fetch, pakai lokal
      return false;
    }

    if (gsData.length === 0 && localData.length > 0) {
      // Sheets kosong tapi lokal ada data → upload lokal ke Sheets
      for (const row of [...localData].reverse()) {
        await this.append(sheet, row);
      }
      return true;
    }

    if (gsData.length > 0) {
      // Sheets punya data → pakai data Sheets (single source of truth)
      DB.set(sheet, gsData);
      return true;
    }

    return true;
  },

  async syncAll() {
    if (!CONFIG.SCRIPT_URL) return false;
    const sheets = ['rilis', 'produk', 'stok', 'order', 'keuangan'];
    for (const s of sheets) {
      await this.smartSync(s);
    }
    return true;
  }
};

// ── Smart DB: tulis lokal dulu, lalu kirim ke GS ─
const SDB = {
  async push(key, item) {
    const saved = DB.push(key, item);
    if (CONFIG.SCRIPT_URL) {
      const r = await GS.append(key, saved);
      if (!r?.ok) console.warn('GS append failed:', key, r);
      else console.log('GS append ok:', key, saved.id);
    }
    return saved;
  },
  async update(key, id, changes) {
    const updated = DB.update(key, id, changes);
    if (CONFIG.SCRIPT_URL && updated) await GS.updateRow(key, id, updated);
    return updated;
  },
  async delete(key, id) {
    DB.delete(key, id);
    if (CONFIG.SCRIPT_URL) await GS.deleteRow(key, id);
  },
};

// ── Seed data ─────────────────────────────────
function seedIfEmpty() {
  if (DB.get('produk').length > 0) return;
  DB.set('rilis', [{
    id: 'r1', nama: 'Koleksi 01 — Foundational',
    tanggal_rilis: '2026-05-01', status: 'produksi',
    konveksi: 'CV Maju Jaya', biaya_konveksi: 5200000,
    tanggal_produksi: '2026-03-15', estimasi_selesai: '2026-04-10',
    catatan: 'Batch pertama Capta', created_at: new Date().toISOString(),
  }]);
  DB.set('produk', [
    { id:'p1', rilis_id:'r1', kode:'CPT-001', nama:'Oversize Tee — Cotton Washed', kategori:'T-Shirt',  modal_pcs:75000,  harga_shopee:150000, harga_tokopedia:155000, harga_tiktok:145000 },
    { id:'p2', rilis_id:'r1', kode:'CPT-002', nama:'Crewneck Fleece Essential',    kategori:'Sweater',  modal_pcs:120000, harga_shopee:235000, harga_tokopedia:240000, harga_tiktok:230000 },
  ]);
  DB.set('stok', [
    { id:'s1', kode:'CPT-001', ukuran:'S',  stok_awal:30, batas_min:5 },
    { id:'s2', kode:'CPT-001', ukuran:'M',  stok_awal:40, batas_min:5 },
    { id:'s3', kode:'CPT-001', ukuran:'L',  stok_awal:40, batas_min:5 },
    { id:'s4', kode:'CPT-001', ukuran:'XL', stok_awal:20, batas_min:5 },
    { id:'s5', kode:'CPT-002', ukuran:'S',  stok_awal:15, batas_min:5 },
    { id:'s6', kode:'CPT-002', ukuran:'M',  stok_awal:20, batas_min:5 },
    { id:'s7', kode:'CPT-002', ukuran:'L',  stok_awal:20, batas_min:5 },
    { id:'s8', kode:'CPT-002', ukuran:'XL', stok_awal:10, batas_min:5 },
  ]);
  DB.set('order', []);
  DB.set('keuangan', []);
}

// ── Computed helpers ──────────────────────────
function getStokTerjual(kode, ukuran) {
  return DB.get('order')
    .filter(o => o.kode === kode && o.ukuran === ukuran && o.status !== 'dibatalkan')
    .reduce((a, o) => a + (o.qty || 0), 0);
}
function getStokSisa(s) { return (s.stok_awal || 0) - getStokTerjual(s.kode, s.ukuran); }
function getStatusStok(s) {
  const sisa = getStokSisa(s);
  if (sisa <= 0) return 'Habis';
  if (sisa <= (s.batas_min || 5)) return 'Menipis';
  return 'Tersedia';
}
function getProduk(kode) { return DB.get('produk').find(p => p.kode === kode) || {}; }
function getNama(kode)   { return getProduk(kode).nama || kode; }
function getHarga(kode, platform) {
  const p = getProduk(kode);
  return ({ Shopee: p.harga_shopee, Tokopedia: p.harga_tokopedia, 'TikTok Shop': p.harga_tiktok })[platform]
    || p.harga_shopee || 0;
}

// ── Formatters ────────────────────────────────
function rp(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Math.round(+n);
  if (Math.abs(num) >= 1000000) return 'Rp ' + (num / 1000000).toFixed(1).replace('.0', '') + 'jt';
  if (Math.abs(num) >= 1000)    return 'Rp ' + num.toLocaleString('id-ID');
  return 'Rp ' + num;
}
function rpFull(n) {
  if (!n && n !== 0) return '—';
  return 'Rp ' + Math.round(+n).toLocaleString('id-ID');
}
function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateShort(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

// ── Toast ─────────────────────────────────────
function toast(msg, type = 'success') {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Modal helpers ─────────────────────────────
function openModal(id)    { document.getElementById(id)?.classList.add('open'); }
function closeModal(id)   { document.getElementById(id)?.classList.remove('open'); }
function closeAllModals() { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });

// ── Tabs ──────────────────────────────────────
function initTabs(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      wrap.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      wrap.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      wrap.querySelector(`[data-pane="${target}"]`)?.classList.add('active');
    });
  });
}

// ── Sidebar ───────────────────────────────────
const NAV = [
  { id: 'dashboard',  icon: '◈', label: 'Dashboard',         href: 'dashboard.html'  },
  { id: 'rilis',      icon: '◇', label: 'Rilis & Produksi',  href: 'rilis.html'      },
  { id: 'stok',       icon: '⬡', label: 'Manajemen Stok',    href: 'stok.html'       },
  { id: 'order',      icon: '◎', label: 'Penjualan & Order', href: 'order.html'      },
  { id: 'pengiriman', icon: '▷', label: 'Pengiriman',         href: 'pengiriman.html' },
  { id: 'platform',   icon: '◉', label: 'Biaya Platform',    href: 'platform.html'   },
  { id: 'keuangan',   icon: '◈', label: 'Keuangan',           href: 'keuangan.html'   },
  { id: 'hpp',        icon: '◆', label: 'Kalkulator HPP',    href: 'hpp.html'        },
];

function buildSidebar(activePage) {
  const user = getUser();
  const gsLabel = CONFIG.SCRIPT_URL
    ? '<span style="color:var(--teal);font-size:10px">● Sheets terhubung</span>'
    : '<span style="color:var(--text3);font-size:10px">○ Mode lokal</span>';
  const navHTML = NAV.map(n => `
    <a class="nav-item ${n.id === activePage ? 'active' : ''}" href="${n.href}">
      <span class="nav-icon">${n.icon}</span>
      <span>${n.label}</span>
    </a>`).join('');
  return `
    <div class="sidebar-brand">
      <div class="brand-name">Capta</div>
      <div class="brand-tag">Brand Management</div>
    </div>
    <div class="nav-sect">
      <div class="nav-lbl">Menu</div>
      ${navHTML}
    </div>
    <div class="sidebar-foot">
      <div class="user-row">
        <div class="avatar">${user?.initial || '??'}</div>
        <div>
          <div class="user-name">${user?.name || 'User'}</div>
          <div class="user-role">${gsLabel}</div>
        </div>
      </div>
      <button class="btn-logout" onclick="logout()">Keluar</button>
    </div>`;
}

function initSidebar(activePage) {
  const el = document.querySelector('.sidebar');
  if (el) el.innerHTML = buildSidebar(activePage);
}

function initHamburger() {
  const ham     = document.getElementById('hamburger');
  const overlay = document.getElementById('overlay');
  const sidebar = document.querySelector('.sidebar');
  if (!ham || !sidebar) return;
  ham.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay?.classList.toggle('open');
  });
  overlay?.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay?.classList.remove('open');
  });
}

// ── Page init ─────────────────────────────────
async function initPage(activePage, title, sub) {
  const user = authGuard();
  if (!user) return false;

  // Seed hanya jika benar-benar kosong
  seedIfEmpty();

  // Sync dengan Sheets (smart: tidak menimpa data lokal jika Sheets kosong)
  if (CONFIG.SCRIPT_URL) {
    GS.syncAll().then(ok => {
      if (ok) {
        // Render ulang halaman setelah sync selesai (non-blocking)
        if (typeof renderPage === 'function') renderPage();
        if (typeof render === 'function') render();
      }
    });
  }

  initSidebar(activePage);
  initHamburger();

  const titleEl = document.querySelector('.topbar-title');
  const subEl   = document.querySelector('.topbar-sub');
  if (titleEl && title) titleEl.textContent = title;
  if (subEl   && sub)   subEl.textContent   = sub;

  const chip = document.querySelector('.chip');
  if (chip) chip.textContent = new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return true;
}

// ── Status badge helpers ──────────────────────
const STATUS_ORDER = {
  menunggu:   { label: 'Menunggu',   cls: 'badge-gray'  },
  dikemas:    { label: 'Dikemas',    cls: 'badge-amber' },
  dikirim:    { label: 'Dikirim',    cls: 'badge-blue'  },
  terkirim:   { label: 'Terkirim',   cls: 'badge-teal'  },
  dibatalkan: { label: 'Dibatalkan', cls: 'badge-red'   },
};
const STATUS_PRODUKSI = {
  perencanaan: { label: 'Perencanaan', cls: 'badge-gray' },
  produksi:    { label: 'Produksi',    cls: 'badge-blue' },
  selesai:     { label: 'Selesai',     cls: 'badge-teal' },
  tunda:       { label: 'Ditunda',     cls: 'badge-red'  },
};
const STATUS_STOK = {
  Tersedia: { cls: 'badge-teal'  },
  Menipis:  { cls: 'badge-amber' },
  Habis:    { cls: 'badge-red'   },
};

function badgeOrder(s)    { const x = STATUS_ORDER[s]    || { label: s, cls: 'badge-gray' }; return `<span class="badge ${x.cls}">${x.label}</span>`; }
function badgeProduksi(s) { const x = STATUS_PRODUKSI[s] || { label: s, cls: 'badge-gray' }; return `<span class="badge ${x.cls}">${x.label}</span>`; }
function badgeStok(s)     { const x = STATUS_STOK[s]     || { cls: 'badge-gray' };            return `<span class="badge ${x.cls}">${s}</span>`; }
