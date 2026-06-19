import fs from 'fs';
import path from 'path';

const url = 'https://qrweb-coral.vercel.app';
const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(url)}`;

async function downloadQR() {
    console.log(`Generating QR code for: ${url}...`);
    try {
        const response = await fetch(qrApiUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const buffer = await response.arrayBuffer();
        
        // Save in root directory of workspace
        const destPath = path.join('c:/Users/Dogukan/Desktop/qr_web', 'qr_code.png');
        fs.writeFileSync(destPath, Buffer.from(buffer));
        console.log(`✅ QR Code saved successfully to: ${destPath}`);
    } catch (error) {
        console.error('❌ Failed to download QR Code:', error);
    }
}

downloadQR();
