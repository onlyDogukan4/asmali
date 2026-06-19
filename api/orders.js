// api/orders.js — Sipariş yönetimi
// GET  /api/orders                → admin: tüm siparişler
// GET  /api/order-track?id=xxx    → herkese açık: sipariş takibi
// POST /api/orders                → IBAN siparişi oluştur (herkese açık)
// PUT  /api/orders                → admin: sipariş durumu güncelle

import { readData, writeData, setCorsHeaders } from '../lib/db.js';
import { requireAdmin } from '../lib/auth.js';
import { generateOrderId } from '../lib/paytr.js';

const STATUS_LABELS = {
    'odeme-bekleniyor': 'Ödeme Bekleniyor',
    'onay-bekliyor':    'Onay Bekleniyor',
    'hazirlaniyor':     'Hazırlanıyor',
    'kargoda':          'Kargoya Verildi',
    'teslim-edildi':    'Teslim Edildi',
    'iptal':            'İptal Edildi',
};

const VALID_STATUSES = Object.keys(STATUS_LABELS);

function validateBody(body) {
    const errors = [];
    if (!body.customerName?.trim())  errors.push('Ad Soyad / Firma gerekli');
    if (!body.customerPhone?.trim()) errors.push('Telefon numarası gerekli');
    if (!body.customerAddress?.trim()) errors.push('Teslimat adresi gerekli');
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0)
        errors.push('Sepet boş');
    if (!body.totalAmount || parseFloat(body.totalAmount) <= 0)
        errors.push('Geçersiz tutar');
    return errors;
}

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    // ── GET: Sipariş sorgula ───────────────────────────────────────────────────
    if (req.method === 'GET') {
        const action  = req.query?.action;
        const orderId = req.query?.id || req.query?.orderId;

        // Herkese açık: sipariş takibi
        if (action === 'track') {
            if (!orderId) return res.status(400).json({ error: 'Sipariş kodu gerekli' });
            const orders = await readData('orders', []);
            const order  = orders.find(o => o.orderId === orderId);
            if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });
            return res.status(200).json({
                orderId:          order.orderId,
                status:           order.status,
                statusLabel:      STATUS_LABELS[order.status] || order.status,
                estimatedDelivery: order.estimatedDelivery || 'Bilgi bekleniyor',
                createdAt:        order.createdAt,
                paymentMethod:    order.paymentMethod,
            });
        }

        // Admin: tüm siparişler
        if (!requireAdmin(req, res)) return;
        const orders = await readData('orders', []);
        return res.status(200).json(
            orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        );
    }

    // ── POST: IBAN siparişi oluştur ───────────────────────────────────────────
    if (req.method === 'POST') {
        const body   = req.body || {};
        const errors = validateBody(body);
        if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });
        if (body.paymentMethod !== 'iban')
            return res.status(400).json({ error: 'Bu endpoint sadece IBAN siparişleri içindir' });

        const orderId  = generateOrderId();
        const newOrder = {
            orderId,
            customerName:    body.customerName.trim(),
            customerPhone:   body.customerPhone.trim(),
            customerEmail:   (body.customerEmail || '').trim(),
            customerAddress: body.customerAddress.trim(),
            customerNote:    (body.customerNote || '').trim(),
            items:           body.items.map(i => ({
                id:       String(i.id),
                name:     String(i.name),
                quantity: parseInt(i.quantity) || 1,
                price:    parseFloat(i.price)  || 0,
            })),
            itemsSummary:    body.items.map(i => `${i.quantity}× ${i.name}`).join(', '),
            totalPrice:      parseFloat(body.totalAmount),
            paymentMethod:   'iban',
            status:          'odeme-bekleniyor',
            createdAt:       new Date().toISOString(),
            lastUpdate:      new Date().toISOString(),
            estimatedDelivery: 'Ödeme onayından sonra bildirilecek',
        };

        const existing = await readData('orders', []);
        await writeData('orders', [...existing, newOrder]);

        const ibanInfo = {
            iban:        process.env.IBAN_NUMBER      || '—',
            bank:        process.env.IBAN_BANK        || '—',
            accountName: process.env.IBAN_ACCOUNT_NAME || '—',
            amount:      newOrder.totalPrice,
            description: orderId,
        };

        return res.status(201).json({ success: true, orderId, ibanInfo });
    }

    // ── PUT: Sipariş durumu güncelle (admin) ──────────────────────────────────
    if (req.method === 'PUT') {
        if (!requireAdmin(req, res)) return;
        const { orderId, status, estimatedDelivery } = req.body || {};

        if (!orderId || !status) return res.status(400).json({ error: 'orderId ve status gerekli' });
        if (!VALID_STATUSES.includes(status))
            return res.status(400).json({ error: 'Geçersiz durum: ' + status });

        const orders  = await readData('orders', []);
        const updated = orders.map(o =>
            o.orderId === orderId
                ? { ...o, status, estimatedDelivery: estimatedDelivery || o.estimatedDelivery, lastUpdate: new Date().toISOString() }
                : o
        );
        await writeData('orders', updated);
        return res.status(200).json({ success: true });
    }

    // ── DELETE: Sipariş sil (admin) ───────────────────────────────────────────
    if (req.method === 'DELETE') {
        if (!requireAdmin(req, res)) return;
        const orderId = req.body?.orderId || req.query?.orderId || req.query?.id;
        
        if (!orderId) return res.status(400).json({ error: 'orderId gerekli' });

        const orders = await readData('orders', []);
        const filtered = orders.filter(o => o.orderId !== orderId);

        if (orders.length === filtered.length) {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        await writeData('orders', filtered);
        return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method Not Allowed' });
}
