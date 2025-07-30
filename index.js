const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

// Create a directory for downloads if it doesn't exist
if (!fs.existsSync('./downloads')){
    fs.mkdirSync('./downloads');
}

const logger = pino({ level: 'silent' });

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: logger,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
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
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const m of messages) {
            if (m.key.remoteJid === 'status@broadcast') {
                console.log(`Status update detected from: ${m.key.participant || m.key.remoteJid}`);

                const sender = m.key.participant || m.key.remoteJid;
                let stream;
                let ext;

                if (m.message?.imageMessage) {
                    console.log('Status is an image.');
                    stream = await downloadContentFromMessage(m.message.imageMessage, 'image');
                    ext = 'jpg';
                } else if (m.message?.videoMessage) {
                    console.log('Status is a video.');
                    stream = await downloadContentFromMessage(m.message.videoMessage, 'video');
                    ext = 'mp4';
                } else {
                    console.log('Status is text-only, skipping download.');
                    continue;
                }

                if (stream) {
                    const filename = `downloads/${sender.split('@')[0]}_${m.messageTimestamp}.${ext}`;
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }

                    fs.writeFile(filename, buffer, (err) => {
                        if (err) {
                            console.error('Failed to save status media:', err);
                        } else {
                            console.log(`Successfully downloaded status from ${sender.split('@')[0]} to ${filename}`);
                        }
                    });
                }
            }
        }
    });
}

connectToWhatsApp();
