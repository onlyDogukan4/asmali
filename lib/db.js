// lib/db.js — MongoDB bağlantı yönetimi (Vercel serverless uyumlu)
import { MongoClient } from 'mongodb';

let cachedClient = null;
let cachedDb    = null;

export async function connectDb() {
    if (cachedDb) return cachedDb;

    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI ortam değişkeni tanımlanmamış');

    cachedClient = new MongoClient(uri);
    await cachedClient.connect();
    cachedDb = cachedClient.db('qrweb_db');
    return cachedDb;
}

export async function getCollection(name) {
    const db = await connectDb();
    return db.collection(name);
}

/** Koleksiyondaki tüm belgeleri _id olmadan döndürür */
export async function readData(collection, fallback = []) {
    try {
        const col = await getCollection(collection);
        const docs = await col.find({}, { projection: { _id: 0 } }).toArray();
        return docs.length ? docs : fallback;
    } catch (e) {
        console.error(`readData(${collection}) hata:`, e.message);
        return fallback;
    }
}

/** Koleksiyonu tamamen siler ve yeniden yazar */
export async function writeData(collection, data) {
    try {
        const col = await getCollection(collection);
        await col.deleteMany({});
        if (Array.isArray(data) && data.length > 0) {
            await col.insertMany(data);
        } else if (data && !Array.isArray(data)) {
            await col.insertOne(data);
        }
        return true;
    } catch (e) {
        console.error(`writeData(${collection}) hata:`, e.message);
        return false;
    }
}

/** Tek bir belge ekler veya günceller (orderId'ye göre) */
export async function upsertOrder(orderId, orderData) {
    try {
        const col = await getCollection('orders');
        await col.updateOne(
            { orderId },
            { $set: orderData },
            { upsert: true }
        );
        return true;
    } catch (e) {
        console.error('upsertOrder hata:', e.message);
        return false;
    }
}

export function setCorsHeaders(res) {
    const origin = process.env.SITE_URL || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
