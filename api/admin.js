// api/admin.js — Admin girişi ve JWT token üretimi
import { timingSafeEqual } from 'crypto';
import { signToken } from '../lib/auth.js';
import { setCorsHeaders } from '../lib/db.js';

// Basit IP bazlı rate limiter (Vercel warm instance başına geçerli)
const attempts = new Map();

function isRateLimited(ip) {
    const now = Date.now();
    const rec = attempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
    if (now > rec.resetAt) {
        attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
        return false;
    }
    if (rec.count >= 5) return true;
    attempts.set(ip, { ...rec, count: rec.count + 1 });
    return false;
}

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '127.0.0.1';

    if (isRateLimited(clientIp)) {
        return res.status(429).json({
            error: 'Çok fazla hatalı deneme. 15 dakika bekleyip tekrar deneyin.',
        });
    }

    const { password } = req.body || {};
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (!ADMIN_PASSWORD) {
        console.error('ADMIN_PASSWORD ortam değişkeni tanımlanmamış!');
        return res.status(500).json({ error: 'Sunucu yapılandırma hatası' });
    }

    if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'Şifre gerekli' });
    }

    // Timing-safe string karşılaştırma
    const pwdBuf  = Buffer.from(password);
    const expBuf  = Buffer.from(ADMIN_PASSWORD);
    const isValid = pwdBuf.length === expBuf.length && timingSafeEqual(pwdBuf, expBuf);

    if (!isValid) {
        return res.status(401).json({ error: 'Hatalı şifre' });
    }

    const token = signToken();
    return res.status(200).json({ token });
}
