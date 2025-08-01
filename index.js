const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const readline = require('readline');

// Helper function for interactive prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query, defaultValue) => {
    return new Promise(resolve => rl.question(`${query} (default: ${defaultValue}): `, answer => {
        resolve(answer.trim() || defaultValue);
    }));
};


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
    // Remove invalid Windows filename characters and replace whitespace with underscores
    const sanitized = str.replace(/[\/\\?%*:|"<>]/g, '').replace(/\s+/g, '_');
    return sanitized.substring(0, maxLength);
};

async function connectToWhatsApp(config) {
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
        console.log(`Received ${messages.length} messages from history sync. Starting batched processing...`);

        const statuses = messages.filter(m => m.key.remoteJid === 'status@broadcast');
        console.log(`Found ${statuses.length} total statuses in history.`);

        for (let i = 0; i < statuses.length; i++) {
            const m = statuses[i];

            // Process the status
            await processStatusMessage(m, sock);

            // Check if it's time for a batch delay
            if ((i + 1) % config.batchSize === 0 && (i + 1) < statuses.length) {
                console.log(`--- Finished batch ${Math.ceil((i + 1) / config.batchSize)}. Pausing for ${config.batchDelay / 1000} seconds... ---`);
                await new Promise(resolve => setTimeout(resolve, config.batchDelay));
            } else {
                // Apply the randomized inter-status delay
                const delay = Math.floor(Math.random() * (config.maxDelay - config.minDelay + 1)) + config.minDelay;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        console.log('Finished processing all history sync statuses.');
    });
}

async function processStatusMessage(m, sock) {
    try {
        // Handle both live and historical status updates
        const senderJid = m.participant || m.key.participant;
        if (!senderJid) {
            console.log(`Could not determine sender for status update with ID: ${m.key.id}, skipping.`);
            return;
        }

        const { name, phone } = getContactInfo(senderJid, sock);
        const shortId = m.key.id.substring(0, 8);
        const sanitizedName = sanitizeFilename(name);

        // Determine the potential filename to check for existence
        let filename;
        if (m.message?.imageMessage) {
            const caption = m.message.imageMessage.caption || '';
            const sanitizedCaption = sanitizeFilename(caption);
            filename = `downloads/${sanitizedName}_${shortId}_${sanitizedCaption}.jpg`;
        } else if (m.message?.extendedTextMessage?.text) {
            filename = `downloads/${sanitizedName}_${shortId}.txt`;
        } else if (m.message?.videoMessage) {
            // This is a video, which we are skipping. No filename needed.
            console.log(`Processing status from: ${name} (${phone}) - ID: ${shortId}`);
            console.log('Status is a video, skipping as requested.');
            return;
        } else {
            // This is some other type of status we don't handle.
            console.log(`Processing status from: ${name} (${phone}) - ID: ${shortId}`);
            console.log('Status is not an image or text, skipping.');
            return;
        }

        // Check if the file already exists
        if (fs.existsSync(filename)) {
            console.log(`Status ${shortId} from ${name} already downloaded, skipping.`);
            return;
        }

        console.log(`Processing status from: ${name} (${phone}) - ID: ${shortId}`);

        // Now, perform the download/write operation
        if (m.message?.imageMessage) {
            console.log('Status is an image.');
            const stream = await downloadContentFromMessage(m.message.imageMessage, 'image');
            const buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            fs.writeFileSync(filename, buffer);
            console.log(`Successfully downloaded status from ${name} to ${filename}`);
        } else if (m.message?.extendedTextMessage?.text) {
            console.log('Status is text-only.');
            const text = m.message.extendedTextMessage.text;
            fs.writeFileSync(filename, text);
            console.log(`Successfully saved text status from ${name} to ${filename}`);
        }
    } catch (error) {
        console.error(`Failed to process status with ID ${m.key.id}. Error: ${error.message}`);
    }
}

async function getInteractiveSettings() {
    console.log('--- Configure Download Delays (for safety) ---');
    const minDelay = await askQuestion('Minimum delay between downloads (seconds)', '1');
    const maxDelay = await askQuestion('Maximum delay between downloads (seconds)', '3');
    const batchSize = await askQuestion('Number of statuses to process per batch', '50');
    const batchDelay = await askQuestion('Delay between batches (seconds)', '30');

    rl.close();

    return {
        minDelay: parseInt(minDelay) * 1000,
        maxDelay: parseInt(maxDelay) * 1000,
        batchSize: parseInt(batchSize),
        batchDelay: parseInt(batchDelay) * 1000,
    };
}

async function start() {
    const config = await getInteractiveSettings();
    connectToWhatsApp(config);
}

start();
