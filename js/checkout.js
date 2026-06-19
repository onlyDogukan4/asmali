/* js/checkout.js — Ödeme sayfası mantığı */

const CART_KEY  = 'qrweb_cart';
const FREE_SHIP = 1500;
const SHIP_FEE  = 150;
const IBAN_DISC = 0.02; // %2 indirim

function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch { return []; }
}
function formatMoney(n) {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n);
}
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function calcTotals(cart, method) {
    const sub  = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const disc = method === 'iban' ? sub * IBAN_DISC : 0;
    const after = sub - disc;
    const ship = after >= FREE_SHIP ? 0 : SHIP_FEE;
    return { sub, disc, after, ship, total: after + ship };
}

let selectedMethod = 'paytr';
let cart = [];

// ── Sayfa Başlangıcı ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    cart = getCart();

    if (cart.length === 0) {
        window.location.href = '/';
        return;
    }

    renderSummary();
    setupPaymentToggle();
    setupForm();
});

function renderSummary() {
    const t = calcTotals(cart, selectedMethod);

    // Ürün listesi
    const listEl = document.getElementById('summary-items');
    if (listEl) {
        listEl.innerHTML = cart.map(i => `
            <div class="summary-item" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
                <img src="${i.image || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23e5e7eb%22/><text x=%2250%22 y=%2254%22 text-anchor=%22middle%22 font-size=%2230%22>📦</text></svg>'}" class="summary-item-img" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1.5px solid var(--border);flex-shrink:0;">
                <div class="summary-item-info" style="flex:1;">
                    <div class="summary-item-name" style="font-weight:700;color:var(--text);">${escHtml(i.name)}</div>
                    <div class="summary-item-sub" style="font-size:12px;color:var(--text-muted);">${i.qty} ${escHtml(i.unit || 'Adet')} x ${formatMoney(i.price)}</div>
                </div>
            </div>`).join('');
    }

    // Toplamlar
    const totEl = document.getElementById('summary-totals');
    const stickyTotalEl = document.getElementById('checkout-bottom-total-price');
    if (totEl) {
        const base = t.after / 1.20;
        const kdv = t.after - base;

        const discRow = t.disc > 0
            ? `<div class="total-row" style="color:var(--primary-light)">
                   <span>IBAN/Havale İndirimi (%2)</span>
                   <span>−${formatMoney(t.disc)}</span>
               </div>` : '';
        const shipRow = t.ship === 0
            ? `<div class="total-row free"><span>Kargo</span><span>ÜCRETSİZ</span></div>`
            : `<div class="total-row"><span>Kargo</span><span>${formatMoney(t.ship)}</span></div>`;
        totEl.innerHTML = `
            <div class="total-row"><span>Ara Toplam:</span><span>${formatMoney(base)}</span></div>
            <div class="total-row"><span>KDV (%20):</span><span>${formatMoney(kdv)}</span></div>
            ${discRow}${shipRow}
            <div class="total-row grand"><span>TOPLAM ÖDENECEK</span><span>${formatMoney(t.total)}</span></div>`;
    }
    if (stickyTotalEl) {
        stickyTotalEl.textContent = formatMoney(t.total);
    }
}

// ── Ödeme Yöntemi ─────────────────────────────────────────────────────────────
function setupPaymentToggle() {
    document.querySelectorAll('.payment-option').forEach(opt => {
        opt.addEventListener('click', () => {
            selectedMethod = opt.dataset.method;
            document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            renderSummary();

            const ibanBox = document.getElementById('iban-info-box');
            if (ibanBox) ibanBox.classList.toggle('show', selectedMethod === 'iban');
        });
    });
}

// ── Form Validasyon ───────────────────────────────────────────────────────────
const REQUIRED = ['customerName','customerPhone','customerAddress'];

function validateForm() {
    let ok = true;
    REQUIRED.forEach(id => {
        const el  = document.getElementById(id);
        const err = document.getElementById(id + '-err');
        if (!el?.value.trim()) {
            el?.classList.add('error');
            if (err) { err.textContent = 'Bu alan gerekli'; err.classList.add('show'); }
            ok = false;
        } else {
            el?.classList.remove('error');
            if (err) err.classList.remove('show');
        }
    });
    // Telefon formatı
    const phoneEl = document.getElementById('customerPhone');
    if (phoneEl?.value.trim()) {
        const digits = phoneEl.value.replace(/\D/g, '');
        if (digits.length < 11) {
            phoneEl.classList.add('error');
            const err = document.getElementById('customerPhone-err');
            if (err) { err.textContent = 'Geçerli bir telefon girin (05xx ...)'; err.classList.add('show'); }
            ok = false;
        }
    }
    return ok;
}

function setupForm() {
    REQUIRED.forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('input', () => {
            el.classList.remove('error');
            const err = document.getElementById(id + '-err');
            if (err) err.classList.remove('show');
        });
    });

    // Telefon Maskesi
    const phoneEl = document.getElementById('customerPhone');
    if (phoneEl) {
        phoneEl.addEventListener('input', (e) => {
            let val = phoneEl.value.replace(/\D/g, '');
            if (val.length > 0 && val[0] !== '0') {
                val = '0' + val;
            }
            let formatted = '';
            if (val.length > 0) {
                formatted += val.substring(0, 1); // "0"
            }
            if (val.length > 1) {
                formatted += ' (' + val.substring(1, 4); // "0 (5xx"
            }
            if (val.length > 4) {
                formatted += ') ' + val.substring(4, 7); // "0 (5xx) xxx"
            }
            if (val.length > 7) {
                formatted += ' ' + val.substring(7, 9); // "0 (5xx) xxx xx"
            }
            if (val.length > 9) {
                formatted += ' ' + val.substring(9, 11); // "0 (5xx) xxx xx xx"
            }
            phoneEl.value = formatted;
        });
    }

    const submitBtn = document.getElementById('btn-submit');
    if (submitBtn) submitBtn.addEventListener('click', handleSubmit);

    const stickyBtn = document.getElementById('btn-checkout-sticky');
    if (stickyBtn) stickyBtn.addEventListener('click', handleSubmit);
}

function getUserData() {
    return {
        name:    document.getElementById('customerName')?.value.trim()    || '',
        phone:   document.getElementById('customerPhone')?.value.trim()   || '',
        email:   document.getElementById('customerEmail')?.value.trim()   || '',
        address: document.getElementById('customerAddress')?.value.trim() || '',
        note:    document.getElementById('customerNote')?.value.trim()    || '',
    };
}

async function handleSubmit() {
    if (!validateForm()) {
        document.querySelector('.form-input.error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    const t = calcTotals(cart, selectedMethod);
    const user = getUserData();

    if (selectedMethod === 'paytr') {
        await payWithPaytr(user, t.total);
    } else {
        await payWithIban(user, t.total);
    }
}

// ── PayTR ─────────────────────────────────────────────────────────────────────
async function payWithPaytr(user, total) {
    setSubmitLoading(true);

    try {
        const res  = await fetch('/api/paytr-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cart: cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.qty })),
                user, totalAmount: total,
            }),
        });
        const data = await res.json();

        if (!data.token) {
            alert('Ödeme başlatılamadı: ' + (data.error || 'Bilinmeyen hata'));
            return;
        }

        // Sipariş ID'yi kaydet (success sayfasında gösterilir)
        localStorage.setItem('last_order_id', data.orderId);

        if (data.mock) {
            alert('🧪 TEST MODU: PayTR mock token. Gerçek deploy\'da iframe açılacak.\nSipariş ID: ' + data.orderId);
            window.location.href = '/order-success.html?method=paytr';
            return;
        }

        showPaytrModal(data.token);
    } catch (e) {
        console.error('PayTR hatası:', e);
        alert('Ödeme sistemine bağlanılamadı. Lütfen tekrar deneyin.');
    } finally {
        setSubmitLoading(false);
    }
}

function showPaytrModal(token) {
    const modal = document.createElement('div');
    modal.className = 'paytr-modal';
    modal.id = 'paytr-modal';
    modal.innerHTML = `
        <div class="paytr-sheet">
            <div class="paytr-sheet-head">
                <div class="paytr-sheet-title">🔒 Güvenli Ödeme</div>
                <button class="paytr-close-btn" id="paytr-close">×</button>
            </div>
            <iframe class="paytr-iframe" src="https://www.paytr.com/odeme/guvenli/${token}" title="PayTR Ödeme" allow="payment"></iframe>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('paytr-close').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ── IBAN ─────────────────────────────────────────────────────────────────────
async function payWithIban(user, total) {
    setSubmitLoading(true);

    try {
        const res  = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customerName:    user.name,
                customerPhone:   user.phone,
                customerEmail:   user.email,
                customerAddress: user.address,
                customerNote:    user.note,
                items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.qty })),
                totalAmount:     total,
                paymentMethod:   'iban',
            }),
        });
        const data = await res.json();

        if (!data.success) {
            alert('Sipariş oluşturulamadı: ' + (data.error || 'Bilinmeyen hata'));
            return;
        }

        localStorage.setItem('last_order_id', data.orderId);
        localStorage.setItem('last_iban_info', JSON.stringify(data.ibanInfo));
        localStorage.removeItem(CART_KEY);

        window.location.href = '/order-success.html?method=iban';
    } catch (e) {
        console.error('IBAN sipariş hatası:', e);
        alert('Sipariş oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
        setSubmitLoading(false);
    }
}

function setSubmitLoading(loading) {
    const submitBtn = document.getElementById('btn-submit');
    const stickyBtn = document.getElementById('btn-checkout-sticky');

    const update = (b) => {
        if (!b) return;
        b.disabled = loading;
        if (loading) {
            b.innerHTML = '<span class="spinner"></span> İşleniyor...';
        } else {
            if (b === stickyBtn) {
                b.innerHTML = 'ÖDE ➔';
            } else {
                b.innerHTML = '<span class="icon">🛡️</span> [ ÖDEMEYİ TAMAMLA ]';
            }
        }
    };

    update(submitBtn);
    update(stickyBtn);
}
