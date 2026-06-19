/* js/app.js — Ana sayfa ve sepet işlemleri */

const CART_KEY  = 'qrweb_cart';
const MIN_ORDER = parseInt(document.documentElement.dataset.minOrder || 500);
const FREE_SHIP = parseInt(document.documentElement.dataset.freeShipping || 1500);
const SHIP_FEE  = parseInt(document.documentElement.dataset.shipFee || 150);

// ── Sepet ────────────────────────────────────────────────────────────────────
function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch { return []; }
}
function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
}
function calcTotals(cart) {
    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const ship = sub >= FREE_SHIP ? 0 : SHIP_FEE;
    return { sub, ship, total: sub + ship };
}

// ── Ürünleri Yükle ──────────────────────────────────────────────────────────
async function loadProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    // Skeleton göster
    grid.innerHTML = '<div class="skeleton skeleton-card"></div>'.repeat(4);

    try {
        const res = await fetch('/api/products');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const products = await res.json();

        if (!products.length) {
            grid.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px">Ürün bulunamadı.</p>';
            return;
        }
        grid.innerHTML = '';
        products.forEach(p => grid.appendChild(buildCard(p)));
        syncCardButtons();
    } catch (e) {
        console.error('Ürün yükleme hatası:', e);
        grid.innerHTML = '<p style="text-align:center;color:#DC2626;padding:40px">⚠️ Ürünler yüklenemedi. Sayfayı yenileyin.</p>';
    }
}

// ── Ürün Kartı ───────────────────────────────────────────────────────────────
function buildCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.id = product.id;

    const badgeHtml = product.badge
        ? `<span class="product-badge${product.badge === 'ÖZEL BASKI' ? ' special' : ''}">${product.badge}</span>`
        : '';

    card.innerHTML = `
        <div class="product-img-wrap">
            <img src="${product.image}" alt="${product.name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23e5e7eb%22/><text x=%2250%22 y=%2254%22 text-anchor=%22middle%22 font-size=%2230%22>📦</text></svg>'">
            ${badgeHtml}
        </div>
        <div class="product-body">
            <div class="product-name">${escHtml(product.name)}</div>
            <div class="product-sub">${escHtml(product.subtitle || '')}</div>
            <div class="product-desc">${escHtml(product.description || '')}</div>
            <div class="product-price-row">
                <div>
                    <div class="product-price">${formatMoney(product.price)}</div>
                    <div class="product-price-unit">/ ${escHtml(product.unit || 'Adet')}</div>
                </div>
                <div class="qty-selector" data-id="${product.id}">
                    <button class="qty-btn qty-minus" data-id="${product.id}" aria-label="Azalt">−</button>
                    <span class="qty-num" id="qty-${product.id}">0</span>
                    <button class="qty-btn qty-plus" data-id="${product.id}" aria-label="Artır">+</button>
                </div>
            </div>
            <button class="btn-add-cart" id="btn-add-${product.id}" data-id="${product.id}" data-price="${product.price}" data-name="${escAttr(product.name)}" data-image="${escAttr(product.image)}" data-unit="${escAttr(product.unit || 'Koli')}">
                <span class="cart-icon">🛒</span> SEPETE EKLE
            </button>
        </div>`;
    return card;
}

// ── Kart Buton Olayları ──────────────────────────────────────────────────────
function syncCardButtons() {
    const cart = getCart();

    document.querySelectorAll('.qty-btn').forEach(btn => {
        btn.removeEventListener('click', qtyClickHandler);
        btn.addEventListener('click', qtyClickHandler);
    });
    document.querySelectorAll('.btn-add-cart').forEach(btn => {
        btn.removeEventListener('click', addCartHandler);
        btn.addEventListener('click', addCartHandler);
    });

    // Mevcut sepet adetlerini göster
    cart.forEach(item => {
        const el = document.getElementById('qty-' + item.id);
        if (el) el.textContent = item.qty;
        updateAddBtn(item.id, item.qty > 0);
    });
}

function qtyClickHandler(e) {
    const btn  = e.currentTarget;
    const id   = btn.dataset.id;
    const isPlus = btn.classList.contains('qty-plus');
    const qtyEl  = document.getElementById('qty-' + id);
    let current  = parseInt(qtyEl?.textContent || '0');
    if (isPlus) current++;
    else current = Math.max(0, current - 1);
    if (qtyEl) qtyEl.textContent = current;
}

function addCartHandler(e) {
    const btn   = e.currentTarget;
    const id    = btn.dataset.id;
    const name  = btn.dataset.name;
    const price = parseFloat(btn.dataset.price);
    const unit  = btn.dataset.unit;
    const image = btn.dataset.image;
    const qtyEl = document.getElementById('qty-' + id);
    const qty   = parseInt(qtyEl?.textContent || '1') || 1;

    const cart   = getCart();
    const exists = cart.findIndex(i => i.id === id);
    if (exists >= 0) {
        cart[exists].qty += qty;
    } else {
        cart.push({ id, name, price, unit, qty, image });
    }
    saveCart(cart);

    // Feedback
    updateAddBtn(id, true);
    showToast(`✓ ${qty} ${unit} "${name}" sepete eklendi`);
    updateCartBar();

    // Qty sıfırla
    if (qtyEl) qtyEl.textContent = 0;
}

function updateAddBtn(id, added) {
    const btn = document.getElementById('btn-add-' + id);
    if (!btn) return;
    if (added) {
        btn.innerHTML = '<span class="cart-icon">✓</span> SEPETE EKLENDİ';
        btn.classList.add('added');
        setTimeout(() => {
            btn.innerHTML = '<span class="cart-icon">🛒</span> DAHA FAZLA EKLE';
            btn.classList.remove('added');
        }, 2000);
    } else {
        btn.innerHTML = '<span class="cart-icon">🛒</span> SEPETE EKLE';
        btn.classList.remove('added');
    }
}

// ── Sepet Bar ─────────────────────────────────────────────────────────────────
function updateCartBar() {
    const cart  = getCart();
    const totals = calcTotals(cart);
    const bar   = document.getElementById('cart-bar');
    const countEl = document.getElementById('cart-count-text');
    const totalEl = document.getElementById('cart-total-text');

    if (!bar) return;
    const totalQty = cart.reduce((s, i) => s + i.qty, 0);

    if (totalQty === 0) {
        bar.style.display = 'none';
        document.body.style.paddingBottom = '0';
        return;
    }

    bar.style.display = 'flex';
    document.body.style.paddingBottom = 'calc(var(--cart-bar-h) + 16px)';
    if (countEl) countEl.textContent = `${totalQty} ürün · ${cart.length} kalem`;
    if (totalEl) totalEl.textContent = formatMoney(totals.total);

    const badge = document.getElementById('cart-badge');
    if (badge) badge.textContent = totalQty;
}

function proceedToCheckout() {
    const cart   = getCart();
    const totals = calcTotals(cart);
    if (totals.sub < MIN_ORDER) {
        showToast(`⚠️ Minimum sipariş tutarı ${formatMoney(MIN_ORDER)}`);
        return;
    }
    window.location.href = '/checkout.html';
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────
function formatMoney(n) {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n);
}
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s) {
    return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let toastTimer;
function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Sayfa Başlangıcı ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    updateCartBar();

    const checkoutBtn = document.getElementById('btn-checkout');
    if (checkoutBtn) checkoutBtn.addEventListener('click', proceedToCheckout);
});
