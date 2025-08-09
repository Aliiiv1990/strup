const express = require('express');
const fs = require('fs');
const path = require('path');
const { startWhatsAppClient } = require('./backend/index.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Define directories
const ROOT_DIR = __dirname;
const DOWNLOAD_DIR = path.join(ROOT_DIR, 'downloads');
const AUTH_DIR = path.join(ROOT_DIR, 'backend_auth_info');
const FRONTEND_DIST_PATH = path.join(ROOT_DIR, 'frontend', 'dist');

// Create necessary directories if they don't exist
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// --- API Endpoints ---

// API to get the list of downloaded statuses
app.get('/api/statuses', (req, res) => {
    fs.readdir(DOWNLOAD_DIR, (err, files) => {
        if (err) {
            console.error("Failed to read downloads directory:", err);
            return res.status(500).json({ error: 'Failed to read statuses' });
        }
        // Filter out any hidden files like .gitkeep
        res.json(files.filter(file => !file.startsWith('.')));
    });
});

// API to serve a specific downloaded file
app.get('/files/:filename', (req, res) => {
    const { filename } = req.params;
    // Security: Prevent directory traversal attacks
    const sanitizedFilename = path.basename(filename);
    const filePath = path.join(DOWNLOAD_DIR, sanitizedFilename);

    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`Error serving file ${sanitizedFilename}:`, err);
            res.status(404).send('File not found');
        }
    });
});

// --- Frontend Serving ---

// Serve the static frontend files
app.use(express.static(FRONTEND_DIST_PATH));

// For any other request, fall back to the frontend's index.html
app.get('*', (req, res) => {
    const indexPath = path.join(FRONTEND_DIST_PATH, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(
            `<h1>Frontend not built</h1>
             <p>Please run the frontend build command:</p>
             <pre><code>npm run build:frontend</code></pre>`
        );
    }
});

// --- Server and WhatsApp Client Startup ---
app.listen(PORT, () => {
    console.log(`[Server] Express server running at http://localhost:${PORT}`);
    console.log(`[Server] Serving frontend from: ${FRONTEND_DIST_PATH}`);
    console.log('[Server] Starting WhatsApp client...');

    // Start the WhatsApp client with the correct paths
    startWhatsAppClient({
        authDir: AUTH_DIR,
        downloadDir: DOWNLOAD_DIR
    });
});
