document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const statusText = document.getElementById('status-text');
    const qrContainer = document.getElementById('qr-container');
    const qrImage = document.getElementById('qr-image');
    const gallery = document.getElementById('gallery');
    const statusesContainer = document.getElementById('statuses-container');

    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('status', (message) => {
        statusText.textContent = message;
        if (message === 'Connected') {
            qrContainer.style.display = 'none';
            gallery.style.display = 'block';
        } else if (message === 'QR Code') {
            qrContainer.style.display = 'block';
            gallery.style.display = 'none';
        }
    });

    socket.on('qr', (qrDataUrl) => {
        qrImage.src = qrDataUrl;
        console.log('QR code received and displayed');
    });

    socket.on('new_status', (status) => {
        addStatusToGallery(status);
    });

    function addStatusToGallery(status) {
        const item = document.createElement('div');
        item.className = 'status-item';

        if (status.type === 'image') {
            const img = document.createElement('img');
            img.src = status.path;
            item.appendChild(img);
            const caption = document.createElement('div');
            caption.className = 'caption';
            caption.textContent = status.name;
            item.appendChild(caption);
        } else if (status.type === 'text') {
            const textDiv = document.createElement('div');
            textDiv.className = 'text-status';
            textDiv.textContent = status.content;
            item.appendChild(textDiv);
            const caption = document.createElement('div');
            caption.className = 'caption';
            caption.textContent = status.name;
            item.appendChild(caption);
        }
        statusesContainer.prepend(item);
    }

    // Fetch initial statuses
    fetch('/statuses')
        .then(response => response.json())
        .then(statuses => {
            statuses.forEach(addStatusToGallery);
        });
});
