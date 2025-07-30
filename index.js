const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

if (!fs.existsSync('./downloads')){
    fs.mkdirSync('./downloads');
}

const logger = pino({ level: 'silent' });

const getContactInfo = (jid, sock) => {
    const contact = sock.contacts && sock.contacts[jid];
    // Use saved name, push name, or just the phone number
    const name = contact?.name || contact?.notify || jid.split('@')[0];
    const phone = jid.split('@')[0];
    return { name, phone };
};

const sanitizeFilename = (str, maxLength = 50) => {
    if (!str) return '';
    // Remove invalid characters for Windows filenames, replace spaces with underscores
    const sanitized = str.replace(/[\/\\?%*:|"<>]/g, '').replace(/\s+/g, '_');
    // Keep only English alphanumeric, numbers, and underscores
    const final = sanitized.replace(/[^a-zA-Z0-9_]/g, '');
    return final.substring(0, maxLength);
};

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        // The printQRInTerminal option is removed as it's deprecated.
        logger: logger,
    });

    // Store contacts
    sock.ev.on('contacts.upsert', (contacts) => {
        sock.contacts = sock.contacts || {};
        for (const contact of contacts) {
            sock.contacts[contact.id] = contact;
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true }); // This line now prints the QR code
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
            // Fetching all active statuses on startup
            console.log('Fetching active statuses...');
            await sock.sendReadReceipt('status@broadcast', undefined, []);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const m of messages) {
            // Process any incoming status message
            if (m.key.remoteJid === 'status@broadcast') {
                await processStatusMessage(m, sock);
            }
        }
    });
}

async function processStatusMessage(m, sock) {
    // Correctly get the sender's JID for statuses
    const senderJid = m.participant;
    if (!senderJid) {
        console.log('Could not determine sender for status update, skipping.');
        return;
    }

    const { name, phone } = getContactInfo(senderJid, sock);
    console.log(`Processing status from: ${name} (${phone})`);

    let filename;
    let buffer;

    if (m.message?.imageMessage) {
        console.log('Status is an image.');
        const caption = m.message.imageMessage.caption || '';
        const sanitizedCaption = sanitizeFilename(caption);
        filename = `downloads/${name}_${phone}_${sanitizedCaption}.jpg`;

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
        filename = `downloads/${name}_${phone}_${m.messageTimestamp}.txt`;

        fs.writeFile(filename, text, (err) => {
            if (err) {
                console.error('Failed to save text status:', err);
            } else {
                console.log(`Successfully saved text status from ${name} to ${filename}`);
            }
        });
        return; // End processing for text messages here
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
