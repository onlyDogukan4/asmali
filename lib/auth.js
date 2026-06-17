// lib/auth.js — JWT imzalama/doğrulama (native crypto, sıfır bağımlılık)
import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 saat

function getSecret() {
    const s = process.env.ADMIN_JWT_SECRET;
    if (!s || s.length < 16) {
        console.warn('⚠️ ADMIN_JWT_SECRET çok kısa veya tanımsız — geliştirme modu');
        return 'dev-only-secret-change-in-production';
    }
    return s;
}

/** Yeni admin oturumu için imzalı token üret */
export function signToken() {
    const payload = {
        role: 'admin',
        iat: Date.now(),
        exp: Date.now() + TOKEN_EXPIRY_MS,
    };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig  = createHmac('sha256', getSecret()).update(data).digest('base64url');
    return `${data}.${sig}`;
}

/** Token'ı doğrula. Geçerliyse payload döndürür, değilse null */
export function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 2) return null;

        const [data, sig] = parts;
        const expected = createHmac('sha256', getSecret()).update(data).digest('base64url');

        // Timing-safe karşılaştırma (brute-force'a karşı)
        const sigBuf = Buffer.from(sig);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length) return null;
        if (!timingSafeEqual(sigBuf, expBuf)) return null;

        const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
        if (!payload.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}

/** Request header'dan Bearer token'ı çıkar */
export function extractToken(req) {
    const auth = req.headers?.['authorization'] || req.headers?.['Authorization'] || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return null;
}

/**
 * Admin yetkisi gerektiren endpoint'lerde kullan.
 * Yetkisiz ise 401 döndürür ve false return eder.
 */
export function requireAdmin(req, res) {
    const token   = extractToken(req);
    const payload = verifyToken(token);
    if (!payload) {
        res.status(401).json({ error: 'Yetkisiz erişim — giriş yapın' });
        return false;
    }
    return true;
}
