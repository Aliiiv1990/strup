const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');
const qrcode = require('qrcode-terminal');

const app = express();
const PORT = process.env.PORT || 3000;

const DOWNLOAD_DIR = './downloads';
if (!fs.existsSync(DOWNLOAD_DIR)){
    fs.mkdirSync(DOWNLOAD_DIR);
}

const logger = pino({ level: 'silent' });

// --- Baileys WhatsApp Client Logic ---

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

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: logger,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: true,
    });

    sock.ev.on('contacts.upsert', (contacts) => {
        sock.contacts = sock.contacts || {};
        for (const contact of contacts) {
            sock.contacts[contact.id] = contact;
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('QR code generated. Scan with WhatsApp.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp connection opened.');
        }
    });

    const processStatusMessage = async (m) => {
        try {
            const senderJid = m.participant || m.key.participant;
            if (!senderJid) return;

            const { name } = getContactInfo(senderJid, sock);
            const shortId = m.key.id.substring(0, 8);
            console.log(`Processing status from: ${name} (ID: ${shortId})`);

            let filename;
            let buffer;

            if (m.message?.imageMessage) {
                const caption = m.message.imageMessage.caption || '';
                const sanitizedCaption = sanitizeFilename(caption);
                const sanitizedName = sanitizeFilename(name);
                filename = `${sanitizedName}_${shortId}_${sanitizedCaption}.jpg`;

                const stream = await downloadContentFromMessage(m.message.imageMessage, 'image');
                buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
            } else if (m.message?.extendedTextMessage?.text) {
                const text = m.message.extendedTextMessage.text;
                const sanitizedName = sanitizeFilename(name);
                filename = `${sanitizedName}_${shortId}.txt`;
                fs.writeFileSync(path.join(DOWNLOAD_DIR, filename), text);
                console.log(`Saved text status to ${filename}`);
                return;
            } else {
                return; // Skip videos or other types
            }

            if (buffer && filename) {
                fs.writeFileSync(path.join(DOWNLOAD_DIR, filename), buffer);
                console.log(`Downloaded status to ${filename}`);
            }
        } catch (error) {
            console.error(`Failed to process status with ID ${m.key.id}. Error: ${error.message}`);
        }
    };

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const m of messages) {
            if (m.key.remoteJid === 'status@broadcast') {
                await processStatusMessage(m);
            }
        }
    });

    sock.ev.on('messaging-history.set', async ({ messages }) => {
        console.log(`Received ${messages.length} messages from history sync.`);
        for (const m of messages) {
            if (m.key.remoteJid === 'status@broadcast') {
                await new Promise(resolve => setTimeout(resolve, 200));
                await processStatusMessage(m);
            }
        }
        console.log('Finished processing history sync.');
    });
}

// --- Express Server API and Frontend Serving ---

// API endpoint to get the list of downloaded statuses
app.get('/api/statuses', (req, res) => {
    fs.readdir(DOWNLOAD_DIR, (err, files) => {
        if (err) {
            console.error("Failed to read downloads directory:", err);
            return res.status(500).json({ error: 'Failed to read statuses' });
        }
        res.json(files.filter(file => file !== '.gitkeep')); // Exclude placeholder
    });
});

// API endpoint to serve a specific downloaded file
app.get('/files/:filename', (req, res) => {
    const { filename } = req.params;
    const sanitizedFilename = path.basename(filename); // Prevent directory traversal
    const filePath = path.join(DOWNLOAD_DIR, sanitizedFilename);

    res.sendFile(filePath, { root: __dirname }, (err) => {
        if (err) {
            console.log(`Error serving file ${sanitizedFilename}:`, err);
            res.status(404).send('File not found');
        }
    });
});

// Serve the static frontend from the 'frontend/dist' directory
const frontendDistPath = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(frontendDistPath));

// For any other request, serve the index.html of the frontend app
app.get('*', (req, res) => {
    const indexPath = path.join(frontendDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(
            `Frontend not built. Please run 'npm run build' in the 'frontend' directory.`
        );
    }
});

// Start the server and the WhatsApp client
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log('Starting WhatsApp client...');
    connectToWhatsApp().catch(err => console.error("Failed to connect to WhatsApp:", err));
});
