// lib/paytr.js — PayTR ödeme sistemi yardımcıları
import { createHmac, timingSafeEqual } from 'crypto';

export function getPaytrConfig() {
    return {
        merchantId:   process.env.PAYTR_MERCHANT_ID   || '',
        merchantKey:  process.env.PAYTR_MERCHANT_KEY   || '',
        merchantSalt: process.env.PAYTR_MERCHANT_SALT  || '',
        testMode:     process.env.PAYTR_TEST_MODE      || '1',
    };
}

export function getSiteUrl() {
    return (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/** Tutarı kuruşa çevir */
export function amountToKurus(amount) {
    return Math.round(parseFloat(amount) * 100);
}

/** PayTR user_basket parametresini oluştur */
export function buildUserBasket(cart) {
    const items = (cart || []).map(item => [
        String(item.name || 'Ürün').substring(0, 100),
        parseFloat(item.price || 0).toFixed(2),
        Math.max(1, parseInt(item.quantity || 1)),
    ]);
    return Buffer.from(JSON.stringify(items)).toString('base64');
}

/** İstemci IP'sini çıkar (proxy farkında) */
export function extractClientIp(req) {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress || '127.0.0.1';
}

/** PayTR token hash'i oluştur (SHA256 HMAC) */
export function buildPaytrTokenHash({
    merchantId, userIp, merchantOid, email,
    paymentAmountKurus, userBasket,
    noInstallment, maxInstallment, currency, testMode,
    merchantKey, merchantSalt,
}) {
    const hashStr = [
        merchantId, userIp, merchantOid, email,
        paymentAmountKurus, userBasket,
        noInstallment, maxInstallment, currency, testMode,
        merchantKey,
    ].join('');
    return createHmac('sha256', merchantSalt).update(hashStr).digest('base64');
}

/** PayTR callback hash doğrulama — tutar manipülasyonunu engeller */
export function verifyCallbackHash({ merchantOid, status, totalAmount, hash, merchantKey, merchantSalt }) {
    const hashStr  = merchantKey + merchantOid + status + merchantSalt;
    const expected = createHmac('sha256', merchantSalt).update(hashStr).digest('base64');
    if (!hash || hash.length !== expected.length) return false;
    try {
        return timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
    } catch {
        return hash === expected;
    }
}

/** Callback tutarını doğrula (1 kuruş tolerans) */
export function validateCallbackAmount(receivedKurus, expectedTL) {
    const expectedKurus  = amountToKurus(expectedTL || 0);
    const receivedKurusI = parseInt(receivedKurus || 0, 10);
    const valid          = Math.abs(receivedKurusI - expectedKurus) <= 1;
    return { valid, expectedKurus, receivedKurus: receivedKurusI };
}

export function isPaytrMockEnabled() {
    return process.env.PAYTR_MOCK === 'true';
}

export function createMockPaytrToken(orderId) {
    return 'mock_' + orderId + '_' + Date.now();
}

/** Sipariş numarası üret */
export function generateOrderId() {
    const now  = new Date();
    const yy   = String(now.getFullYear()).slice(2);
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const dd   = String(now.getDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `SIP${yy}${mm}${dd}-${rand}`;
}
