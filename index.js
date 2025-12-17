const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadContentFromMessage,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

const logger = pino({
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
});

const baileysLogger = pino({ level: 'silent' });
const downloadsDir = './downloads';
const authDir = './auth_info_baileys';

// A simple in-memory store for contact information
let contactStore = {};

// Ensure downloads directory exists
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
}

// Function to sanitize filenames
const sanitizeFilename = (str, maxLength = 50) => {
    if (!str) return '';
    return str.replace(/[\\/\\?%*:|"<>]/g, '').replace(/\s+/g, '_').substring(0, maxLength);
};

// Main function to connect to WhatsApp
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    // prime the contact store with existing contacts
    contactStore = state.creds.contacts || {};

    const sock = makeWASocket({
        auth: state,
        logger: baileysLogger,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
    });

    // Handle connection updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            logger.info('QR code received, printing to terminal.');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            logger.warn({ reason: lastDisconnect.error }, 'Connection closed. Reconnecting...');
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            logger.info('WhatsApp connection opened successfully.');
            fetchAllStatuses(sock);
        }
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // A general error handler
    sock.ev.on('error', (err) => {
        logger.error({ err }, 'An unexpected error occurred.');
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (msg.key.remoteJid === 'status@broadcast') {
                logger.info({ sender: msg.key.participant }, 'Received new status update.');
                await new Promise(resolve => setTimeout(resolve, 500));
                await processStatusMessage(msg);
            }
        }
    });

    // Function to process a single status message
    async function processStatusMessage(msg) {
        try {
            const senderJid = msg.key.participant;
            if (!senderJid) return;

            const shortId = msg.key.id.substring(0, 8);
            const phoneNumber = senderJid.split('@')[0];

            let filePath;

            if (msg.message?.imageMessage) {
                const caption = msg.message.imageMessage.caption || '';
                const sanitizedCaption = sanitizeFilename(caption, 100);

                // Construct filename and ensure it's a safe length
                let filename = `${phoneNumber}_${sanitizedCaption}_${shortId}.jpg`;
                if (filename.length > 200) {
                    filename = `${phoneNumber}_${sanitizedCaption.substring(0, 100)}_${shortId}.jpg`;
                }

                filePath = `${downloadsDir}/${filename}`;

                try {
                    logger.info({ phone: phoneNumber, id: shortId }, 'Downloading image status...');
                    const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    fs.writeFileSync(filePath, buffer);
                    logger.info({ phone: phoneNumber, path: filePath }, 'Image status downloaded.');
                } catch (error) {
                    logger.error({ error, msgId: msg.key.id }, 'Failed to download image status.');
                }

            } else if (msg.message?.extendedTextMessage) {
                const text = msg.message.extendedTextMessage.text;
                const filename = `${phoneNumber}_${shortId}.txt`;
                filePath = `${downloadsDir}/${filename}`;

                fs.writeFileSync(filePath, text);
                logger.info({ phone: phoneNumber, path: filePath }, 'Text status saved.');

            } else if (msg.message?.videoMessage) {
                logger.info({ phone: phoneNumber, id: shortId }, 'Skipping video status as requested.');
            }

        } catch (error) {
            logger.error({ error, msgId: msg.key.id }, 'Failed to process status message.');
        }
    }

    // Function to fetch all contacts' statuses
    async function fetchAllStatuses(sock) {
        logger.info('Fetching all statuses...');
        try {
            const jids = Object.keys(contactStore);
            for (const jid of jids) {
                if (jid.endsWith('@s.whatsapp.net')) {
                    const status = await sock.fetchStatus(jid);
                    if (status) {
                        for (const msg of status) {
                            await processStatusMessage(msg);
                        }
                    }
                }
            }
        } catch (error) {
            logger.error({ error }, 'Failed to fetch statuses.');
        }
        logger.info('Finished fetching all statuses.');
    }
}

// Global crash protector
process.on('uncaughtException', (err, origin) => {
    logger.fatal({ err, origin }, 'Uncaught exception. This is a critical error, but the application will not crash.');
});

// Start the application
connectToWhatsApp();
