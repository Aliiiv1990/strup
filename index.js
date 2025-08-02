const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const qrcode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

if (!fs.existsSync('./downloads')){
    fs.mkdirSync('./downloads');
}

const logger = pino({ level: 'silent' });

// Store the latest connection state
let connectionState = {
    status: 'Initializing...',
    qr: null,
};

io.on('connection', (socket) => {
    console.log('A user connected');
    // Immediately send the current state to the new client
    socket.emit('status', connectionState.status);
    if (connectionState.qr) {
        socket.emit('qr', connectionState.qr);
    }

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

app.get('/statuses', (req, res) => {
    fs.readdir('./downloads', (err, files) => {
        if (err) {
            return res.status(500).send('Error reading statuses directory');
        }
        const statuses = files.map(file => {
            const filePath = path.join(__dirname, 'downloads', file);
            if (file.endsWith('.txt')) {
                const content = fs.readFileSync(filePath, 'utf-8');
                return { type: 'text', content: content, name: path.basename(file, '.txt').replace(/_/g, ' ') };
            } else {
                return { type: 'image', path: `/downloads/${file}`, name: path.basename(file, '.jpg').replace(/_/g, ' ') };
            }
        }).reverse(); // Show newest first
        res.json(statuses);
    });
});

const getContactInfo = (jid, sock) => {
    const contact = sock.contacts && sock.contacts[jid];
    const name = contact?.name || contact?.notify || jid.split('@')[0];
    const phone = jid.split('@')[0];
    return { name, phone };
};

const sanitizeFilename = (str, maxLength = 50) => {
    if (!str) return '';
    const sanitized = str.replace(/[\/\\?%*:|"<>]/g, '').replace(/\s+/g, '_');
    return sanitized.substring(0, maxLength);
};

async function connectToWhatsApp(io_instance) {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: logger,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            connectionState.status = 'QR Code';
            connectionState.qr = await qrcode.toDataURL(qr);
            io_instance.emit('status', connectionState.status);
            io_instance.emit('qr', connectionState.qr);
            console.log('QR code updated and sent to clients.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            connectionState.status = `Connection closed. Reconnecting: ${shouldReconnect}`;
            io_instance.emit('status', connectionState.status);
            console.log('Connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp(io_instance);
            }
        } else if (connection === 'open') {
            connectionState.status = 'Connected';
            connectionState.qr = null; // QR is no longer needed
            io_instance.emit('status', connectionState.status);
            console.log('WhatsApp connection opened successfully.');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const m of messages) {
            if (m.key.remoteJid === 'status@broadcast') {
                await processStatusMessage(m, sock, io_instance);
            }
        }
    });

    sock.ev.on('messaging-history.set', async ({ messages }) => {
        console.log(`Received ${messages.length} messages from history sync.`);
        for (const m of messages) {
            if (m.key.remoteJid === 'status@broadcast') {
                await new Promise(resolve => setTimeout(resolve, 200));
                await processStatusMessage(m, sock, io_instance);
            }
        }
        console.log('Finished processing history sync.');
    });
}

async function processStatusMessage(m, sock, io_instance) {
    try {
        const senderJid = m.participant || m.key.participant;
        if (!senderJid) return;

        const { name } = getContactInfo(senderJid, sock);
        const shortId = m.key.id.substring(0, 8);

        let newStatus = null;

        if (m.message?.imageMessage) {
            const caption = m.message.imageMessage.caption || '';
            const sanitizedCaption = sanitizeFilename(caption);
            const sanitizedName = sanitizeFilename(name);
            const filename = `${sanitizedName}_${shortId}_${sanitizedCaption}.jpg`;
            const filepath = path.join(__dirname, 'downloads', filename);

            const stream = await downloadContentFromMessage(m.message.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            fs.writeFileSync(filepath, buffer);
            console.log(`Downloaded image from ${name} to ${filename}`);
            newStatus = { type: 'image', path: `/downloads/${filename}`, name: `${name} - ${caption}` };
        } else if (m.message?.extendedTextMessage?.text) {
            const text = m.message.extendedTextMessage.text;
            const sanitizedName = sanitizeFilename(name);
            const filename = `${sanitizedName}_${shortId}.txt`;
            const filepath = path.join(__dirname, 'downloads', filename);

            fs.writeFileSync(filepath, text);
            console.log(`Saved text status from ${name} to ${filename}`);
            newStatus = { type: 'text', content: text, name: `${name}` };
        }

        if (newStatus) {
            io_instance.emit('new_status', newStatus);
        }
    } catch (error) {
        console.error(`Failed to process status with ID ${m.key.id}. Error: ${error.message}`);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    // Start the WhatsApp connection process immediately
    connectToWhatsApp(io);
});
