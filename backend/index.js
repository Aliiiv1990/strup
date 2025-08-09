const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const logger = pino({ level: 'silent' });

function startWhatsAppClient(config) {
    const { authDir, downloadDir } = config;

    if (!fs.existsSync(downloadDir)){
        fs.mkdirSync(downloadDir, { recursive: true });
    }

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
        const { state, saveCreds } = await useMultiFileAuthState(authDir);

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
                console.log(`[WhatsApp] Processing status from: ${name} (ID: ${shortId})`);

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
                    fs.writeFileSync(path.join(downloadDir, filename), text);
                    console.log(`[WhatsApp] Saved text status to ${filename}`);
                    return;
                } else {
                    return;
                }

                if (buffer && filename) {
                    fs.writeFileSync(path.join(downloadDir, filename), buffer);
                    console.log(`[WhatsApp] Downloaded status to ${filename}`);
                }
            } catch (error) {
                console.error(`[WhatsApp] Failed to process status with ID ${m.key.id}. Error: ${error.message}`);
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
            console.log(`[WhatsApp] Received ${messages.length} messages from history sync.`);
            for (const m of messages) {
                if (m.key.remoteJid === 'status@broadcast') {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    await processStatusMessage(m);
                }
            }
            console.log('[WhatsApp] Finished processing history sync.');
        });
    }

    connectToWhatsApp().catch(err => console.error("[WhatsApp] Critical connection error:", err));
}

module.exports = { startWhatsAppClient };
