const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

if (!fs.existsSync('./downloads')){
    fs.mkdirSync('./downloads');
}

const logger = pino({ level: 'silent' });

const getContactInfo = (jid, sock) => {
    const contact = sock.contacts && sock.contacts[jid];
    const name = contact?.name || contact?.notify || jid.split('@')[0];
    const phone = jid.split('@')[0];
    return { name, phone };
};

const sanitizeFilename = (str, maxLength = 50) => {
    if (!str) return '';
    const sanitized = str.replace(/[\/\\?%*:|"<>]/g, '').replace(/\s+/g, '_');
    const final = sanitized.replace(/[^a-zA-Z0-9_]/g, '');
    return final.substring(0, maxLength);
};

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: logger,
        // Implement the full history sync
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
            console.log('QR code generated. Please scan it with your WhatsApp mobile app.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp connection opened successfully.');
            console.log('Waiting for history sync to get all active statuses...');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const m of messages) {
            if (m.key.remoteJid === 'status@broadcast') {
                await processStatusMessage(m, sock);
            }
        }
    });

    sock.ev.on('messaging-history.set', async ({ messages }) => {
        console.log(`Received ${messages.length} messages from history sync.`);
        for (const m of messages) {
            if (m.key.remoteJid === 'status@broadcast') {
                // Use a small delay to prevent rate limiting or overwhelming the file system
                await new Promise(resolve => setTimeout(resolve, 200));
                await processStatusMessage(m, sock);
            }
        }
        console.log('Finished processing history sync.');
    });
}

async function processStatusMessage(m, sock) {
    // Handle both live and historical status updates
    const senderJid = m.participant || m.key.participant;
    if (!senderJid) {
        console.log('Could not determine sender for status update, skipping.');
        return;
    }

    const { name, phone } = getContactInfo(senderJid, sock);
    const shortId = m.key.id.substring(0, 8);
    console.log(`Processing status from: ${name} (${phone}) - ID: ${shortId}`);

    let filename;
    let buffer;

    if (m.message?.imageMessage) {
        console.log('Status is an image.');
        const caption = m.message.imageMessage.caption || '';
        const sanitizedCaption = sanitizeFilename(caption);
        filename = `downloads/${name}_${phone}_${shortId}_${sanitizedCaption}.jpg`;

        const stream = await downloadContentFromMessage(m.message.imageMessage, 'image');
        buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
    } else if (m.message?.videoMessage) {
        console.log('Status is a video, skipping as requested.');
        return;
    } else if (m.message?.extendedTextMessage?.text) {
        console.log('Status is text-only.');
        const text = m.message.extendedTextMessage.text;
        filename = `downloads/${name}_${phone}_${shortId}.txt`;

        try {
            fs.writeFileSync(filename, text);
            console.log(`Successfully saved text status from ${name} to ${filename}`);
        } catch (err) {
            console.error('Failed to save text status:', err);
        }
        return;
    }
    else {
        console.log('Status is not an image or text, skipping.');
        return;
    }

    if (buffer && filename) {
        fs.writeFile(filename, buffer, (err) => {
            if (err) {
                console.error('Failed to save status media:', err);
            } else {
                console.log(`Successfully downloaded status from ${name} to ${filename}`);
            }
        });
    }
}

connectToWhatsApp();
