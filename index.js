const express = require('express');
const { Client } = require('whatsapp-web.js');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');

const app = express();
const port = 3000;
// Önbelleği devre dışı bırak
app.set('etag', false);
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

const client = new Client();

let groups = [];
let qrCodeData = '';  // QR kodunu saklayacağımız değişken
let isReady = false;
let isAuthenticated = false;

client.on('qr', async qr => {
    // QR kodunu base64 formatına dönüştürme
    qrCodeData = await QRCode.toDataURL(qr);
});


client.on('ready', async () => {
    console.log('WhatsApp ile bağlantı kuruldu!');
    groups = (await client.getChats()).filter(chat => chat.isGroup);
    isReady = true;
});



app.get('/groups-status', (req, res) => {
    if (groups && groups.length > 0) {
        res.json({ hasGroups: true });
    } else {
        res.json({ hasGroups: false });
    }
});


client.on('authenticated', () => {
    isAuthenticated = true;  // Kullanıcının doğrulandığını belirt
});


app.get('/get-qr', (req, res) => {
    res.json({
        qrCodeData: qrCodeData,
        authenticated: isAuthenticated
    });
});

app.get('/', (req, res) => {
    res.render('index', { groups, isReady, qrCodeData, isAuthenticated });
});

app.post('/send', async (req, res) => {
    let selectedGroups = req.body.groups || [];
    const message = req.body.message;

    if (typeof selectedGroups === 'string') {
        selectedGroups = [selectedGroups];
    }

    for (const groupID of selectedGroups) {
        const groupChat = groups.find(g => g.id._serialized === groupID);
        if (groupChat) {
            await groupChat.sendMessage(message);
            await new Promise(resolve => setTimeout(resolve, 2000));  // 2 saniye bekletme
        }
    }

    const htmlResponse = `
        <h2>Mesajlar gönderildi!</h2>
        <a href="/" class="btn btn-primary">TEKRAR MESAJ GÖNDER</a>
    `;

    res.send(htmlResponse);
});

client.initialize();

app.listen(port, () => {
    console.log(`Uygulama http://localhost:${port} adresinde çalışıyor`);
});
