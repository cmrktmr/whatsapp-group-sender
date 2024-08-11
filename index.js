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

let sessionExpirationTime = null; // Oturumun sona ereceği zamanı tutacak değişken
const SESSION_DURATION = 4 * 24 * 60 * 60 * 1000; // 4 gün (milisaniye cinsinden)

client.on('authenticated', () => {
    isAuthenticated = true;
    sessionExpirationTime = Date.now() + SESSION_DURATION; // Geçerli zamana 4 gün ekleyin
    console.log('Kullanıcı doğrulandı, oturum süresi başlatıldı.');
});



app.get('/get-qr', (req, res) => {
    res.json({
        qrCodeData: qrCodeData,
        authenticated: isAuthenticated
    });
});

app.get('/', (req, res) => {
    res.render('index', { groups, isReady, qrCodeData, isAuthenticated, sessionExpirationTime });
});

app.get('/sync-groups', async (req, res) => {
    if (Date.now() > sessionExpirationTime) {
        isAuthenticated = false;
        return res.json({ success: false, message: 'Oturum süresi doldu, lütfen tekrar QR kodu taratın.' });
    }

    if (isReady && isAuthenticated) {
        groups = (await client.getChats()).filter(chat => chat.isGroup);
        res.json({ success: true, groups });
    } else {
        res.json({ success: false, message: 'Client is not ready yet or not authenticated.' });
    }
});


const sendMessageToGroup = async (groupChat, message) => {
    await groupChat.sendMessage(message);
};

app.post('/send', async (req, res) => {
    let selectedGroups = req.body.groups || [];
    const message = req.body.message;

    if (typeof selectedGroups === 'string') {
        selectedGroups = [selectedGroups];
    }

    const promises = [];
    for (const groupID of selectedGroups) {
        const groupChat = groups.find(g => g.id._serialized === groupID);
        if (groupChat) {
            promises.push(sendMessageToGroup(groupChat, message));
            if (promises.length >= 5) { // Aynı anda 5 grup işleyin
                await Promise.all(promises);
                promises.length = 0; // Dizi sıfırla
                await new Promise(resolve => setTimeout(resolve, 2000)); // 2 saniye bekletme
            }
        }
    }

    if (promises.length > 0) {
        await Promise.all(promises); // Kalan grupları işleyin
    }

    const htmlResponse = `
        <h2>Mesajlar gönderildi!</h2>
        <a href="/" class="btn btn-primary">TEKRAR MESAJ GÖNDER</a>
    `;
    res.send(htmlResponse);
});
app.get('/logout', (req, res) => {
    isAuthenticated = false;
    sessionExpirationTime = null;
    client.destroy(); // WhatsApp istemcisini kapat
    res.redirect('/'); // Ana sayfaya yönlendirin ve QR kodu yeniden taratın
});

client.initialize();

app.listen(port, () => {
    console.log(`Uygulama http://localhost:${port} adresinde çalışıyor`);
});
