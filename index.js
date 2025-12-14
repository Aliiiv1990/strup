const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadContentFromMessage,
    Browsers
} = require('baileys');
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

// Ensure downloads directory exists
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
}

// Function to sanitize filenames
const sanitizeFilename = (str, maxLength = 50) => {
    if (!str) return '';
    return str.replace(/[\\/\\?%*:|"<>]/g, '').replace(/\\s+/g, '_').substring(0, maxLength);
};

// Main function to connect to WhatsApp
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
        auth: state,
        logger: baileysLogger,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: true,
        printQRInTerminal: true,
    });

    // Handle connection updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            logger.info('QR code generated. Scan with your phone.');
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

    // Handle incoming messages, specifically for status updates
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (msg.key.remoteJid === 'status@broadcast') {
                logger.info({ sender: msg.key.participant }, 'Received new status update.');
                await processStatusMessage(sock, msg);
            }
        }
    });
}

// Function to fetch all contacts' statuses
async function fetchAllStatuses(sock) {
    logger.info('Fetching all statuses...');
    try {
        const statusJids = await sock.fetchStatusJids();
        logger.info(`Found ${statusJids.length} contacts with statuses.`);
        for (const jid of statusJids) {
            const statuses = await sock.fetchStatus(jid);
            logger.info({ jid, count: statuses.length }, 'Processing statuses for contact.');
            for (const status of statuses) {
                await processStatusMessage(sock, status);
            }
        }
    } catch (error) {
        logger.error({ error }, 'Failed to fetch statuses.');
    }
    logger.info('Finished fetching all statuses.');
}

// Function to process a single status message
async function processStatusMessage(sock, msg) {
    try {
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const shortId = msg.key.id.substring(0, 8);
        const contact = await sock.getContact(senderJid);
        const name = contact?.name || contact?.notify || senderJid.split('@')[0];

        // Create a directory for the contact if it doesn't exist
        const contactDir = `${downloadsDir}/${sanitizeFilename(name)}`;
        if (!fs.existsSync(contactDir)) {
            fs.mkdirSync(contactDir);
        }

        let filePath;

        if (msg.message?.imageMessage) {
            const caption = msg.message.imageMessage.caption || '';
            filePath = `${contactDir}/${shortId}.jpg`;
            if (fs.existsSync(filePath)) {
                logger.info({ name, id: shortId }, 'Image status already downloaded.');
                return;
            }
            logger.info({ name, id: shortId }, 'Downloading image status...');
            const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            fs.writeFileSync(filePath, buffer);
            logger.info({ name, path: filePath }, 'Image status downloaded.');

            // Save the caption if it exists
            if (caption) {
                const captionPath = `${contactDir}/${shortId}.txt`;
                fs.writeFileSync(captionPath, caption);
                logger.info({ name, path: captionPath }, 'Saved image caption.');
            }

        } else if (msg.message?.videoMessage) {
            logger.info({ name, id: shortId }, 'Skipping video status as requested.');
            return;

        } else if (msg.message?.extendedTextMessage) {
            const text = msg.message.extendedTextMessage.text;
            filePath = `${contactDir}/${shortId}.txt`;
            if (fs.existsSync(filePath)) {
                logger.info({ name, id: shortId }, 'Text status already saved.');
                return;
            }
            fs.writeFileSync(filePath, text);
            logger.info({ name, path: filePath }, 'Text status saved.');
        } else {
            logger.warn({ name, id: shortId }, 'Status is not an image, video, or text. Skipping.');
        }
    } catch (error) {
        logger.error({ error, msgId: msg.key.id }, 'Failed to process status message.');
    }
}

// Start the application
connectToWhatsApp();
