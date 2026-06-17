// api/products.js — Ürün listesi API (GET: herkese açık, PUT: admin)
import { readData, writeData, setCorsHeaders } from '../lib/db.js';
import { requireAdmin } from '../lib/auth.js';

const DEFAULT_PRODUCTS = [
    {
        id: '1',
        name: 'Karton Bardak 8.5 oz',
        subtitle: '1000 Adet / Koli',
        price: 1250,
        unit: 'Koli',
        image: '/images/bardak-karton.jpg',
        description: 'Gıdayla temas onaylı çift katlı beyaz karton bardak. FSC sertifikalı.',
        badge: 'EN ÇOK SATAN',
        status: 'active',
        sortOrder: 1,
    },
    {
        id: '2',
        name: 'PET Plastik Bardak',
        subtitle: '1000 Adet / Koli',
        price: 890,
        unit: 'Koli',
        image: '/images/bardak-plastik.jpg',
        description: 'Soğuk içecekler için kristal berraklığında şeffaf PET bardak.',
        badge: null,
        status: 'active',
        sortOrder: 2,
    },
    {
        id: '3',
        name: 'Ahşap Kahve Karıştırıcı',
        subtitle: '1000 Adet / Paket',
        price: 450,
        unit: 'Paket',
        image: '/images/kasik-ahsap.jpg',
        description: 'Doğal huş ağacından üretilmiş, gıdayla temas onaylı karıştırıcı.',
        badge: null,
        status: 'active',
        sortOrder: 3,
    },
    {
        id: '4',
        name: 'Logolu Karton Bardak',
        subtitle: '500 Adet / Koli — Özel Baskı',
        price: 1850,
        unit: 'Koli',
        image: '/images/bardak-logolu.jpg',
        description: 'Firmanızın logosuyla özel baskı. Logo dosyanızı (AI/PDF/PNG) sipariş notuna ekleyin.',
        badge: 'ÖZEL BASKI',
        status: 'active',
        sortOrder: 4,
    },
];

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    if (req.method === 'GET') {
        let products = await readData('products', []);
        if (!products || products.length === 0) {
            await writeData('products', DEFAULT_PRODUCTS);
            products = DEFAULT_PRODUCTS;
        }
        const active = products
            .filter(p => p.status !== 'deleted')
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        return res.status(200).json(active);
    }

    if (req.method === 'PUT') {
        if (!requireAdmin(req, res)) return;
        const body = req.body;
        if (!Array.isArray(body)) return res.status(400).json({ error: 'Geçersiz veri — dizi bekleniyor' });
        await writeData('products', body);
        return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method Not Allowed' });
}
