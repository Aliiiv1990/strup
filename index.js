const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

if (!fs.existsSync('./downloads')){
    fs.mkdirSync('./downloads');
}

// One-time cleanup of old session data
const sessionCleanupDoneMarker = './.session_cleanup_done';
if (!fs.existsSync(sessionCleanupDoneMarker)) {
    console.log('Performing one-time session cleanup...');
    try {
        if (fs.existsSync('./auth_info_baileys')) {
            fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
            console.log('Old session data cleared successfully.');
        }
        // Create a marker file to prevent this from running again
        fs.writeFileSync(sessionCleanupDoneMarker, 'done');
    } catch (error) {
        console.error('Failed to clear old session data:', error);
    }
}

const logger = pino({
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
});

const baileysLogger = pino({ level: 'warn' });

const getContactInfo = (jid, sock) => {
    const contact = sock.contacts && sock.contacts[jid];
    const name = contact?.name || contact?.notify || jid.split('@')[0];
    const phone = jid.split('@')[0];
    return { name, phone };
};

const sanitizeFilename = (str, maxLength = 50) => {
    if (!str) return '';
    // Remove invalid Windows filename characters and replace whitespace with underscores
    const sanitized = str.replace(/[\/\\?%*:|"<>]/g, '').replace(/\s+/g, '_');
    return sanitized.substring(0, maxLength);
};

async function connectToWhatsApp() {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage, Browsers } = await import('baileys');

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: baileysLogger,
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
            logger.info({ shouldReconnect }, 'Connection closed, reconnecting');
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            logger.info('WhatsApp connection opened successfully.');
            logger.info('Waiting for history sync to get all active statuses...');
        }
    });

    sock.ev.on('error', (err) => {
        if (err.code === 'ECONNRESET') {
            logger.warn('Connection was reset, attempting to reconnect in 5 seconds...');
            setTimeout(connectToWhatsApp, 5000);
        } else {
            logger.error({ err }, 'An unhandled error occurred');
        }
    });

    const processMessage = (m) => processStatusMessage(m, sock, downloadContentFromMessage);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const m of messages) {
            try {
                if (m.key.remoteJid === 'status@broadcast') {
                    await processMessage(m);
                }
            } catch (err) {
                logger.error({ err, msgId: m.key.id }, 'Failed to process incoming message');
            }
        }
    });

    sock.ev.on('messaging-history.set', async ({ messages }) => {
        logger.info({ count: messages.length }, 'Received messages from history sync.');
        for (const m of messages) {
            try {
                if (m.key.remoteJid === 'status@broadcast') {
                    // Use a small delay to prevent rate limiting or overwhelming the file system
                    await new Promise(resolve => setTimeout(resolve, 200));
                    await processMessage(m);
                }
            } catch (err) {
                logger.error({ err, msgId: m.key.id }, 'Failed to process historical message');
            }
        }
        logger.info('Finished processing history sync.');
    });
}

async function processStatusMessage(m, sock, downloadContentFromMessage) {
    try {
        // Handle both live and historical status updates
        const senderJid = m.participant || m.key.participant;
        if (!senderJid) {
            // This case should ideally not happen for a status, but as a safeguard:
            logger.warn({ msgId: m.key.id }, 'Could not determine sender for status update, skipping.');
            return;
        }

        const { name, phone } = getContactInfo(senderJid, sock);
        const shortId = m.key.id.substring(0, 8);
        logger.info({ name, phone, msgId: shortId }, 'Processing status');

        let filename;
        let buffer;

        if (m.message?.imageMessage) {
            logger.info('Status is an image.');
            const caption = m.message.imageMessage.caption || '';
            const sanitizedCaption = sanitizeFilename(caption);
            const sanitizedName = sanitizeFilename(name);
            filename = `downloads/${sanitizedName}_${shortId}_${sanitizedCaption}.jpg`;

            const stream = await downloadContentFromMessage(m.message.imageMessage, 'image');
            buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
        } else if (m.message?.videoMessage) {
            logger.info('Status is a video, skipping as requested.');
            return;
        } else if (m.message?.extendedTextMessage?.text) {
            logger.info('Status is text-only.');
            const text = m.message.extendedTextMessage.text;
            const sanitizedName = sanitizeFilename(name);
            filename = `downloads/${sanitizedName}_${shortId}.txt`;

            fs.writeFileSync(filename, text);
            logger.info({ name, filename }, 'Successfully saved text status');
            return; // End processing for text
        }
        else {
            logger.warn('Status is not an image or text, skipping.');
            return;
        }

        if (buffer && filename) {
            fs.writeFileSync(filename, buffer);
            logger.info({ name, filename }, 'Successfully downloaded status');
        }
    } catch (error) {
        logger.error({ msgId: m.key.id, err: error.message }, 'Failed to process status');
    }
}

connectToWhatsApp();
