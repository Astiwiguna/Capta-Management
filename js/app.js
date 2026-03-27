// ═══════════════════════════════════════════════
//  CAPTA — Core JS
//  Database: Google Sheets via Apps Script API
// ═══════════════════════════════════════════════

// ── CONFIG — isi setelah setup Google Sheets ──
const CONFIG = {
  SCRIPT_URL: localStorage.getItem('capta_script_url') || '',
  APP_NAME: 'Capta',
  VERSION: '2.0',
};

// ── Auth ──────────────────────────────────────
const USERS = {
  'admin':    { pass: 'capta2026',  role: 'admin',   name: 'Admin',        initial: 'AD' },
  'owner':    { pass: 'capta.boss', role: 'owner',   name: 'Owner',        initial: 'OW' },
  'manajer':  { pass: 'mgmt2026',   role: 'manajer', name: 'Manajer',      initial: 'MG' },
  'desainer': { pass: 'dsn2026',    role: 'viewer',  name: 'Desainer',     initial: 'DS' },
  'gudang':   { pass: 'stok2026',   role: 'staff',   name: 'Tim Gudang',   initial: 'GD' },
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

// ── Local DB (localStorage fallback) ─────────
// Digunakan saat SCRIPT_URL belum dikonfigurasi
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
    if (i > -1) { data[i] = { ...data[i], ...changes, updated_at: new Date().toISOString() }; this.set(key, data); return data[i]; }
    return null;
  },
  delete(key, id) {
    const data = this.get(key).filter(x => x.id !== id);
    this.set(key, data);
  },
};

// ── Google Sheets API ─────────────────────────
const GS = {
  async call(action, payload = {}) {
    if (!CONFIG.SCRIPT_URL) return null;
    try {
      const res = await fetch(CONFIG.SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action, ...payload }),
      });
      return await res.json();
    } catch (e) { console.warn('GS error:', e); return null; }
  },
  async getAll(sheet) {
    const r = await this.call('getAll', { sheet });
    return r?.data || null;
  },
  async append(sheet, row) {
    return await this.call('append', { sheet, row });
  },
  async updateRow(sheet, id, row) {
    return await this.call('update', { sheet, id, row });
  },
  async deleteRow(sheet, id) {
    return await this.call('delete', { sheet, id });
  },
};

// ── Smart DB (GS + localStorage fallback) ─────
const SDB = {
  async get(key) {
    if (CONFIG.SCRIPT_URL) {
      const gsData = await GS.getAll(key);
      if (gsData) { DB.set(key, gsData); return gsData; }
    }
    return DB.get(key);
  },
  async push(key, item) {
    const saved = DB.push(key, item);
    if (CONFIG.SCRIPT_URL) await GS.append(key, saved);
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
    tanggal_rilis: '2026-05-01',
    status: 'produksi',
    konveksi: 'CV Maju Jaya',
    biaya_konveksi: 5200000,
    tanggal_produksi: '2026-03-15',
    estimasi_selesai: '2026-04-10',
    catatan: 'Batch pertama Capta',
    created_at: new Date().toISOString(),
  }]);

  DB.set('produk', [
    { id:'p1', rilis_id:'r1', kode:'CPT-001', nama:'Oversize Tee — Cotton Washed', kategori:'T-Shirt', modal_pcs:75000, harga_shopee:150000, harga_tokopedia:155000, harga_tiktok:145000 },
    { id:'p2', rilis_id:'r1', kode:'CPT-002', nama:'Crewneck Fleece Essential',    kategori:'Sweater', modal_pcs:120000, harga_shopee:235000, harga_tokopedia:240000, harga_tiktok:230000 },
    { id:'p3', rilis_id:'r1', kode:'CPT-003', nama:'Cargo Pants Ripstop',          kategori:'Celana',  modal_pcs:145000, harga_shopee:285000, harga_tokopedia:290000, harga_tiktok:280000 },
    { id:'p4', rilis_id:'r1', kode:'CPT-004', nama:'Bucket Hat Canvas',            kategori:'Aksesoris',modal_pcs:45000, harga_shopee:90000, harga_tokopedia:92000, harga_tiktok:88000 },
  ]);

  DB.set('stok', [
    { id:'s1', produk_id:'p1', kode:'CPT-001', ukuran:'S',  stok_awal:30, batas_min:5 },
    { id:'s2', produk_id:'p1', kode:'CPT-001', ukuran:'M',  stok_awal:40, batas_min:5 },
    { id:'s3', produk_id:'p1', kode:'CPT-001', ukuran:'L',  stok_awal:40, batas_min:5 },
    { id:'s4', produk_id:'p1', kode:'CPT-001', ukuran:'XL', stok_awal:20, batas_min:5 },
    { id:'s5', produk_id:'p2', kode:'CPT-002', ukuran:'S',  stok_awal:15, batas_min:5 },
    { id:'s6', produk_id:'p2', kode:'CPT-002', ukuran:'M',  stok_awal:20, batas_min:5 },
    { id:'s7', produk_id:'p2', kode:'CPT-002', ukuran:'L',  stok_awal:20, batas_min:5 },
    { id:'s8', produk_id:'p2', kode:'CPT-002', ukuran:'XL', stok_awal:10, batas_min:5 },
    { id:'s9', produk_id:'p3', kode:'CPT-003', ukuran:'S',  stok_awal:10, batas_min:5 },
    { id:'s10',produk_id:'p3', kode:'CPT-003', ukuran:'M',  stok_awal:15, batas_min:5 },
    { id:'s11',produk_id:'p3', kode:'CPT-003', ukuran:'L',  stok_awal:15, batas_min:5 },
    { id:'s12',produk_id:'p3', kode:'CPT-003', ukuran:'XL', stok_awal:10, batas_min:5 },
    { id:'s13',produk_id:'p4', kode:'CPT-004', ukuran:'Free Size', stok_awal:40, batas_min:8 },
  ]);

  DB.set('order', [
    { id:'o1', tanggal:'2026-03-20', nomor_order:'SPE-2026032001', platform:'Shopee',    kode:'CPT-001', ukuran:'M',  qty:1, harga:150000, status:'terkirim',  resi:'JNE001', biaya_admin_pct:0.025 },
    { id:'o2', tanggal:'2026-03-21', nomor_order:'TKP-2026032101', platform:'Tokopedia', kode:'CPT-002', ukuran:'L',  qty:1, harga:240000, status:'dikirim',   resi:'SiCepat002', biaya_admin_pct:0.020 },
    { id:'o3', tanggal:'2026-03-22', nomor_order:'TTK-2026032201', platform:'TikTok Shop',kode:'CPT-003',ukuran:'XL', qty:1, harga:280000, status:'dikemas',    resi:'', biaya_admin_pct:0.030 },
    { id:'o4', tanggal:'2026-03-22', nomor_order:'SPE-2026032202', platform:'Shopee',    kode:'CPT-004', ukuran:'Free Size', qty:2, harga:90000, status:'dikemas', resi:'', biaya_admin_pct:0.025 },
  ]);

  DB.set('keuangan', [
    { id:'k1', tanggal:'2026-03-15', kategori:'Produksi', jenis:'keluar', nominal:5200000, keterangan:'Bayar DP konveksi Koleksi 01', rilis_id:'r1' },
    { id:'k2', tanggal:'2026-03-20', kategori:'Marketing', jenis:'keluar', nominal:500000, keterangan:'Iklan Instagram Maret', rilis_id:'' },
    { id:'k3', tanggal:'2026-03-21', kategori:'Penjualan', jenis:'masuk', nominal:150000, keterangan:'Order SPE-2026032001', rilis_id:'r1' },
    { id:'k4', tanggal:'2026-03-22', kategori:'Penjualan', jenis:'masuk', nominal:240000, keterangan:'Order TKP-2026032101', rilis_id:'r1' },
  ]);
}

// ── Computed helpers ──────────────────────────
function getStokTerjual(kode, ukuran) {
  return DB.get('order').filter(o => o.kode === kode && o.ukuran === ukuran && o.status !== 'dibatalkan').reduce((a, o) => a + (o.qty || 0), 0);
}
function getStokSisa(stokItem) {
  return (stokItem.stok_awal || 0) - getStokTerjual(stokItem.kode, stokItem.ukuran);
}
function getStatusStok(stokItem) {
  const sisa = getStokSisa(stokItem);
  if (sisa <= 0) return 'Habis';
  if (sisa <= (stokItem.batas_min || 5)) return 'Menipis';
  return 'Tersedia';
}
function getProduk(kode) {
  return DB.get('produk').find(p => p.kode === kode) || {};
}
function getNama(kode) { return getProduk(kode).nama || kode; }
function getHarga(kode, platform) {
  const p = getProduk(kode);
  const map = { 'Shopee': p.harga_shopee, 'Tokopedia': p.harga_tokopedia, 'TikTok Shop': p.harga_tiktok };
  return map[platform] || p.harga_shopee || 0;
}

// ── Formatters ────────────────────────────────
function rp(n) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Math.round(+n);
  if (Math.abs(num) >= 1000000) return 'Rp ' + (num/1000000).toFixed(1).replace('.0','') + 'jt';
  if (Math.abs(num) >= 1000) return 'Rp ' + num.toLocaleString('id-ID');
  return 'Rp ' + num;
}
function rpFull(n) {
  if (!n && n !== 0) return '—';
  return 'Rp ' + Math.round(+n).toLocaleString('id-ID');
}
function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDateShort(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('id-ID', { day:'2-digit', month:'short' });
}
function pct(n) { return (n === null || n === undefined) ? '—' : (+n * 100).toFixed(1) + '%'; }
function relativeTime(str) {
  if (!str) return '';
  const diff = Date.now() - new Date(str);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return m + ' menit lalu';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' jam lalu';
  return Math.floor(h / 24) + ' hari lalu';
}

// ── Toast ─────────────────────────────────────
function toast(msg, type = 'success') {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toast-wrap'; document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Modal helpers ─────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
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
      const pane = wrap.querySelector(`[data-pane="${target}"]`);
      if (pane) pane.classList.add('active');
    });
  });
}

// ── Sidebar ───────────────────────────────────
const NAV = [
  { id:'dashboard',  icon:'◈', label:'Dashboard',        href:'dashboard.html' },
  { id:'rilis',      icon:'◇', label:'Rilis & Produksi', href:'rilis.html' },
  { id:'stok',       icon:'⬡', label:'Manajemen Stok',   href:'stok.html' },
  { id:'order',      icon:'◎', label:'Penjualan & Order', href:'order.html' },
  { id:'pengiriman', icon:'▷', label:'Pengiriman',        href:'pengiriman.html' },
  { id:'platform',   icon:'◉', label:'Biaya Platform',    href:'platform.html' },
  { id:'keuangan',   icon:'◈', label:'Keuangan',          href:'keuangan.html' },
  { id:'hpp',        icon:'◆', label:'Kalkulator HPP',    href:'hpp.html' },
];

function buildSidebar(activePage) {
  const user = getUser();
  const navHTML = NAV.map(n => `
    <a class="nav-item ${n.id === activePage ? 'active' : ''}" href="${n.href}">
      <span class="nav-icon">${n.icon}</span>
      <span>${n.label}</span>
    </a>
  `).join('');

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
          <div class="user-role">${user?.role || ''}</div>
        </div>
      </div>
      <button class="btn-logout" onclick="logout()">Keluar</button>
    </div>
  `;
}

function initSidebar(activePage) {
  const el = document.querySelector('.sidebar');
  if (el) el.innerHTML = buildSidebar(activePage);
}

function initHamburger() {
  const ham = document.getElementById('hamburger');
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
function initPage(activePage, title, sub) {
  const user = authGuard();
  if (!user) return false;
  seedIfEmpty();
  initSidebar(activePage);
  initHamburger();
  const titleEl = document.querySelector('.topbar-title');
  const subEl = document.querySelector('.topbar-sub');
  if (titleEl && title) titleEl.textContent = title;
  if (subEl && sub) subEl.textContent = sub;
  const chip = document.querySelector('.chip');
  if (chip) chip.textContent = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
  return true;
}

// ── Status badge helper ───────────────────────
const STATUS_ORDER = {
  'menunggu':  { label:'Menunggu',  cls:'badge-gray'  },
  'dikemas':   { label:'Dikemas',   cls:'badge-amber' },
  'dikirim':   { label:'Dikirim',   cls:'badge-blue'  },
  'terkirim':  { label:'Terkirim',  cls:'badge-teal'  },
  'dibatalkan':{ label:'Dibatalkan',cls:'badge-red'   },
};
const STATUS_PRODUKSI = {
  'perencanaan': { label:'Perencanaan', cls:'badge-gray'  },
  'produksi':    { label:'Produksi',    cls:'badge-blue'  },
  'selesai':     { label:'Selesai',     cls:'badge-teal'  },
  'tunda':       { label:'Ditunda',     cls:'badge-red'   },
};
const STATUS_STOK = {
  'Tersedia': { cls:'badge-teal'  },
  'Menipis':  { cls:'badge-amber' },
  'Habis':    { cls:'badge-red'   },
};

function badgeOrder(status) {
  const s = STATUS_ORDER[status] || { label: status, cls:'badge-gray' };
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}
function badgeProduksi(status) {
  const s = STATUS_PRODUKSI[status] || { label: status, cls:'badge-gray' };
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}
function badgeStok(status) {
  const s = STATUS_STOK[status] || { cls:'badge-gray' };
  return `<span class="badge ${s.cls}">${status}</span>`;
}
