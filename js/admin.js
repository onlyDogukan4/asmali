/* js/admin.js — Admin paneli */

const TOKEN_KEY = 'qrweb_admin_token';
let knownOrderIds = new Set();
let pollTimer;

// ── Auth ─────────────────────────────────────────────────────────────────────
function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
function setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); }
function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

function authHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
}

async function doLogin() {
    const pwdEl = document.getElementById('admin-password');
    const errEl = document.getElementById('admin-error');
    const btn   = document.getElementById('btn-login');

    const pwd = pwdEl?.value?.trim();
    if (!pwd) { showErr('Şifre girin.'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Giriş yapılıyor...';

    try {
        const res  = await fetch('/api/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pwd }),
        });
        const data = await res.json();

        if (res.status === 429) { showErr('Çok fazla deneme. 15 dakika bekleyin.'); return; }
        if (!res.ok || !data.token) { showErr(data.error || 'Hatalı şifre'); return; }

        setToken(data.token);
        showAdminPanel();
    } catch (e) {
        showErr('Bağlantı hatası: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Giriş Yap';
    }
}

function showErr(msg) {
    const el = document.getElementById('admin-error');
    if (el) { el.textContent = msg; el.classList.add('show'); }
}

function logout() {
    clearToken();
    clearInterval(pollTimer);
    document.getElementById('admin-main').style.display = 'none';
    document.getElementById('admin-login').style.display = 'flex';
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function showAdminPanel() {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-main').style.display  = 'block';
    loadOrders();
    // Poll her 10 saniyede
    pollTimer = setInterval(pollNewOrders, 10000);
}

// ── Siparişler ────────────────────────────────────────────────────────────────
let allOrders = [];
let activeFilter = 'all';

async function loadOrders() {
    try {
        const res = await fetch('/api/orders', { headers: authHeaders() });
        if (res.status === 401) { logout(); return; }
        const orders = await res.json();
        allOrders = orders;
        renderOrders(orders);
        updateStats(orders);
    } catch (e) {
        console.error('Sipariş yükleme hatası:', e);
    }
}

async function pollNewOrders() {
    try {
        const res = await fetch('/api/orders', { headers: authHeaders() });
        if (!res.ok) return;
        const orders = await res.json();

        const newOnes = orders.filter(o => !knownOrderIds.has(o.orderId));
        if (newOnes.length > 0 && knownOrderIds.size > 0) {
            showNewOrderPulse(newOnes.length);
        }

        allOrders = orders;
        renderOrders(orders);
        updateStats(orders);
    } catch {}
}

function showNewOrderPulse(count) {
    const el = document.getElementById('new-order-pulse');
    if (!el) return;
    el.textContent = `🔔 ${count} Yeni Sipariş!`;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 5000);
}

const FILTER_MAP = {
    all:              o => true,
    'odeme-bekleniyor': o => o.status === 'odeme-bekleniyor',
    'onay-bekliyor':    o => o.status === 'onay-bekliyor',
    kargoda:            o => o.status === 'kargoda',
    done:               o => ['teslim-edildi','iptal'].includes(o.status),
};

function setFilter(f) {
    activeFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === f);
    });
    renderOrders(allOrders);
}

function renderOrders(orders) {
    // Güncelle bilinen ID'ler
    orders.forEach(o => knownOrderIds.add(o.orderId));

    const filtered = orders.filter(FILTER_MAP[activeFilter] || FILTER_MAP.all);
    const container = document.getElementById('admin-orders');
    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <div class="empty-icon">📭</div>
            <p>Bu kategoride sipariş yok.</p>
        </div>`;
        return;
    }

    container.innerHTML = filtered.map(order => buildOrderCard(order)).join('');

    // Durum butonları
    container.querySelectorAll('.btn-status').forEach(btn => {
        btn.addEventListener('click', () => {
            updateStatus(btn.dataset.order, btn.dataset.status);
        });
    });

    // Silme butonları
    container.querySelectorAll('.btn-delete-order').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteOrder(btn.dataset.order);
        });
    });
}

function updateStats(orders) {
    const newCount = orders.filter(o => ['odeme-bekleniyor','onay-bekliyor'].includes(o.status)).length;
    const shipCount= orders.filter(o => o.status === 'kargoda').length;
    const todayRevenue = orders
        .filter(o => {
            const d = new Date(o.createdAt);
            const n = new Date();
            return d.toDateString() === n.toDateString() &&
                   ['onay-bekliyor','hazirlaniyor','kargoda','teslim-edildi'].includes(o.status);
        })
        .reduce((s, o) => s + parseFloat(o.totalPrice || 0), 0);

    setStatEl('stat-new',  newCount);
    setStatEl('stat-ship', shipCount);
    setStatEl('stat-today', formatMoney(todayRevenue));
}
function setStatEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

const STATUS_LABELS = {
    'odeme-bekleniyor': 'Ödeme Bekleniyor',
    'onay-bekliyor':    'Onay Bekleniyor',
    'hazirlaniyor':     'Hazırlanıyor',
    'kargoda':          'Kargoya Verildi',
    'teslim-edildi':    'Teslim Edildi',
    'iptal':            'İptal Edildi',
};

async function deleteOrder(orderId) {
    if (!confirm('Bu siparişi silmek istediğinize emin misiniz?')) return;

    try {
        const res = await fetch(`/api/orders?orderId=${orderId}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        if (!res.ok) {
            const d = await res.json();
            alert('Hata: ' + (d.error || 'Silme işlemi başarısız'));
            return;
        }
        await loadOrders();
    } catch (e) {
        alert('Bağlantı hatası: ' + e.message);
    }
}

function buildOrderCard(o) {
    const badgeClass = 'badge-' + o.status;
    const date = new Date(o.createdAt).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    const payLabel = o.paymentMethod === 'paytr' ? '💳 Kredi Kartı' : '🏛️ IBAN';

    const nextStatuses = getNextStatuses(o.status);
    const actionsHtml = nextStatuses.map((s, i) =>
        `<button class="btn-status${i===0?' primary-action':''}" data-order="${o.orderId}" data-status="${s}">${STATUS_LABELS[s]}</button>`
    ).join('');

    const itemsText = o.itemsSummary || o.items?.map?.(i => `${i.quantity}x ${i.name}`)?.join(', ') || '—';

    return `
    <div class="order-card" id="oc-${o.orderId}">
        <div class="order-card-head">
            <div>
                <div class="order-id">${escHtml(o.orderId)}</div>
                <div class="order-time">${date}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="order-status-badge ${badgeClass}">${STATUS_LABELS[o.status] || o.status}</span>
                <button class="btn-delete-order" data-order="${o.orderId}" title="Siparişi Sil" style="background:transparent;border:none;font-size:16px;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;transition:transform 0.2s;">🗑️</button>
            </div>
        </div>
        <div class="order-card-body">
            <div class="order-meta">
                <div class="order-meta-item">
                    <div class="order-meta-label">MÜŞTERI</div>
                    <div class="order-meta-value name">${escHtml(o.customerName)}</div>
                    <div class="order-meta-value phone"><a href="tel:${escHtml(o.customerPhone)}">${escHtml(o.customerPhone)}</a></div>
                </div>
                <div class="order-meta-item">
                    <div class="order-meta-label">TUTAR & ÖDEME</div>
                    <div class="order-meta-value price">${formatMoney(o.totalPrice)}</div>
                    <div class="order-meta-value payment-method">${payLabel}</div>
                </div>
            </div>
            <div class="order-address-section">
                <div class="order-meta-label">TESLİMAT ADRESİ</div>
                <div class="order-meta-value address">📍 ${escHtml(o.customerAddress || '—')}</div>
                ${o.customerNote ? `<div class="order-meta-value note">📝 Not: ${escHtml(o.customerNote)}</div>` : ''}
            </div>
            <div class="order-items-accordion">
                <span class="accordion-title">💼 ${escHtml(itemsText)}</span>
                <span class="accordion-arrow">➔</span>
            </div>
        </div>
        ${actionsHtml ? `<div class="order-actions">${actionsHtml}</div>` : ''}
    </div>`;
}

function getNextStatuses(current) {
    const flow = {
        'odeme-bekleniyor': ['onay-bekliyor', 'iptal'],
        'onay-bekliyor':    ['hazirlaniyor', 'iptal'],
        'hazirlaniyor':     ['kargoda'],
        'kargoda':          ['teslim-edildi'],
        'teslim-edildi':    [],
        'iptal':            [],
    };
    return flow[current] || [];
}

async function updateStatus(orderId, status) {
    const btn = document.querySelector(`[data-order="${orderId}"][data-status="${status}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

    try {
        const res = await fetch('/api/orders', {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ orderId, status }),
        });
        if (!res.ok) {
            const d = await res.json();
            alert('Hata: ' + (d.error || 'Güncelleme başarısız'));
            if (btn) { btn.disabled = false; btn.textContent = STATUS_LABELS[status]; }
            return;
        }
        await loadOrders();
    } catch (e) {
        alert('Bağlantı hatası: ' + e.message);
        if (btn) { btn.disabled = false; }
    }
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────
function formatMoney(n) {
    return new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY', maximumFractionDigits:2 }).format(n);
}
function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Başlangıç ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('btn-login');
    const pwdInput = document.getElementById('admin-password');

    if (loginBtn) loginBtn.addEventListener('click', doLogin);
    if (pwdInput) pwdInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    const newPulse = document.getElementById('new-order-pulse');
    if (newPulse) newPulse.addEventListener('click', () => { newPulse.classList.remove('show'); loadOrders(); });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    });

    // Token varsa direkt panel aç
    if (getToken()) showAdminPanel();
});
