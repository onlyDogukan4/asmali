// api/paytr.js — PayTR ödeme sistemi (token, callback, installments)
import { createHmac } from 'crypto';
// action=token        → PayTR iframe token üret
// action=callback     → PayTR ödeme sonucu bildirimi (server-to-server)
// action=installments → Taksit tablosu

import { readData, writeData, setCorsHeaders } from '../lib/db.js';
import {
    getPaytrConfig, getSiteUrl,
    amountToKurus, buildUserBasket, buildPaytrTokenHash,
    extractClientIp, verifyCallbackHash, validateCallbackAmount,
    isPaytrMockEnabled, createMockPaytrToken, generateOrderId,
} from '../lib/paytr.js';

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    const action = req.query?.action;

    // ── Token: PayTR iframe için token al ─────────────────────────────────────
    if (action === 'token') {
        if (req.method !== 'POST') return res.status(405).json({ error: 'POST gerekli' });

        const { cart, user, totalAmount } = req.body || {};
        if (!cart?.length || !user || !totalAmount)
            return res.status(400).json({ error: 'cart, user ve totalAmount gerekli' });

        const config    = getPaytrConfig();
        const SITE_URL  = getSiteUrl();
        const orderId   = generateOrderId();

        const user_basket       = buildUserBasket(cart);
        const payment_amount    = amountToKurus(totalAmount);
        const user_ip           = extractClientIp(req);

        const email         = (user.email || 'musteri@asmalambalaj.com').trim();
        const no_installment  = '0';
        const max_installment = '12';
        const currency        = 'TL';
        const test_mode       = config.testMode;

        // Ödeme girişimini kaydet (callback'te kullanmak için)
        const attemptData = {
            orderId,
            customerName:    (user.name    || '').trim(),
            customerPhone:   (user.phone   || '').trim(),
            customerEmail:   email,
            customerAddress: (user.address || '').trim(),
            customerNote:    (user.note    || '').trim(),
            items:           cart.map(i => ({
                id: String(i.id), name: String(i.name),
                quantity: parseInt(i.quantity) || 1,
                price: parseFloat(i.price) || 0,
            })),
            itemsSummary:    cart.map(i => `${i.quantity}× ${i.name}`).join(', '),
            totalPrice:      parseFloat(totalAmount),
            paymentMethod:   'paytr',
            createdAt:       new Date().toISOString(),
        };
        const existing = await readData('payment_attempts', []);
        await writeData('payment_attempts', [...existing.filter(a => a.orderId !== orderId), attemptData]);

        // Mock mod (geliştirme)
        if (isPaytrMockEnabled()) {
            return res.status(200).json({
                token:   createMockPaytrToken(orderId),
                orderId,
                mock:    true,
            });
        }

        const paytr_token = buildPaytrTokenHash({
            merchantId: config.merchantId,
            userIp: user_ip, merchantOid: orderId,
            email, paymentAmountKurus: payment_amount,
            userBasket: user_basket,
            noInstallment: no_installment,
            maxInstallment: max_installment,
            currency, testMode: test_mode,
            merchantKey:  config.merchantKey,
            merchantSalt: config.merchantSalt,
        });

        const params = new URLSearchParams({
            merchant_id:      config.merchantId,
            user_ip, merchant_oid: orderId,
            email, payment_amount: String(payment_amount),
            paytr_token, user_basket,
            debug_on:         '1',
            no_installment,   max_installment,
            user_name:        user.name    || '',
            user_address:     user.address || '',
            user_phone:       user.phone   || '',
            merchant_ok_url:  `${SITE_URL}/order-success.html`,
            merchant_fail_url:`${SITE_URL}/order-fail.html`,
            timeout_limit:    '30',
            currency, test_mode, lang: 'tr',
        });

        const paytrRes = await fetch('https://www.paytr.com/odeme/api/get-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
        const data = await paytrRes.json();

        if (data.status === 'success') {
            return res.status(200).json({ token: data.token, orderId });
        }
        console.error('PayTR token hatası:', data);
        return res.status(400).json({ error: data.reason || 'PayTR token alınamadı', detail: data });
    }

    // ── Callback: PayTR ödeme bildirimi (server-to-server POST) ──────────────
    if (action === 'callback') {
        if (req.method !== 'POST') return res.status(405).end();

        const { merchant_oid, status, total_amount, hash, payment_type, installment_count } = req.body || {};

        if (!merchant_oid || !status || !total_amount || !hash) {
            console.error('PayTR callback: eksik parametre', req.body);
            res.status(400).send('MISSING_PARAMS');
            return;
        }

        const config = getPaytrConfig();
        const hashValid = verifyCallbackHash({
            merchantOid: merchant_oid, status, totalAmount: total_amount,
            hash, merchantKey: config.merchantKey, merchantSalt: config.merchantSalt,
        });

        if (!hashValid) {
            console.error('PayTR callback: HASH UYUŞMAZLIĞI — olası sahte istek!', { merchant_oid });
            res.status(400).send('HASH_MISMATCH');
            return;
        }

        const attempts = await readData('payment_attempts', []);
        const attempt  = attempts.find(a => a.orderId === merchant_oid);

        if (status === 'success') {
            const amountCheck = validateCallbackAmount(total_amount, attempt?.totalPrice);
            if (!amountCheck.valid) {
                console.error('PayTR callback: TUTAR UYUŞMAZLIĞI', {
                    merchant_oid,
                    expected: amountCheck.expectedKurus,
                    received: amountCheck.receivedKurus,
                });
                res.status(200).send('OK');
                return;
            }

            const orders  = await readData('orders', []);
            const already = orders.find(o => o.orderId === merchant_oid);
            if (!already) {
                const newOrder = {
                    orderId:          merchant_oid,
                    customerName:     attempt?.customerName    || 'Bilinmiyor',
                    customerPhone:    attempt?.customerPhone   || '',
                    customerEmail:    attempt?.customerEmail   || '',
                    customerAddress:  attempt?.customerAddress || '',
                    customerNote:     attempt?.customerNote    || '',
                    items:            attempt?.items           || [],
                    itemsSummary:     attempt?.itemsSummary    || '',
                    totalPrice:       attempt?.totalPrice      || (parseInt(total_amount) / 100),
                    paymentMethod:    'paytr',
                    paymentType:      payment_type      || '',
                    installments:     installment_count || '1',
                    status:           'onay-bekliyor',
                    createdAt:        attempt?.createdAt  || new Date().toISOString(),
                    lastUpdate:       new Date().toISOString(),
                    paymentReceivedAt: new Date().toISOString(),
                    estimatedDelivery: '1-3 iş günü',
                };
                await writeData('orders', [...orders, newOrder]);
            }

            // Ödeme girişimini temizle
            await writeData('payment_attempts', attempts.filter(a => a.orderId !== merchant_oid));
        } else {
            console.log(`PayTR: ${merchant_oid} başarısız/iptal — orders'a yazılmadı`);
        }

        res.status(200).send('OK');
        return;
    }

    // ── Installments: Taksit tablosu ─────────────────────────────────────────
    if (action === 'installments') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'GET gerekli' });
        const amount = parseFloat(req.query?.amount || 0);
        if (!amount) return res.status(400).json({ error: 'amount gerekli' });

        const config = getPaytrConfig();

        if (isPaytrMockEnabled() || !config.merchantId) {
            return res.status(200).json({
                plans: [
                    {
                        label: 'Vakıfbank',
                        options: [
                            { count: 3, monthly: (amount / 3).toFixed(2), total: amount.toFixed(2) },
                            { count: 6, monthly: (amount / 6).toFixed(2), total: amount.toFixed(2) },
                        ],
                    },
                ],
            });
        }

        try {
            const kurus = amountToKurus(amount);
            const hashStr = config.merchantId + kurus + config.merchantSalt;
            const hash = createHmac('sha256', config.merchantKey).update(hashStr).digest('base64');

            const params = new URLSearchParams({
                merchant_id: config.merchantId,
                amount: String(kurus),
                hash,
            });
            const r = await fetch('https://www.paytr.com/odeme/taksit-bilgi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
            });
            const data = await r.json();
            return res.status(200).json({ plans: data.plans || [] });
        } catch (e) {
            return res.status(200).json({ plans: [], error: e.message });
        }
    }

    res.status(404).json({ error: 'Bilinmeyen action: ' + action });
}
