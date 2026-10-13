/**
 * chat-attachments.js
 * Image and attachment sending management (documents, archives, etc.)
 */

var stagedImageFile = null;
var stagedFile = null;

function initAttachmentEvents() {
    // Attach image button
    document.getElementById('btnAttachImage')?.addEventListener('click', function () {
        if (!currentConversationId) {
            if (typeof showToast === 'function') {
                showToast('Please select a conversation before sending an image.', 'warning');
            }
            return;
        }
        document.getElementById('imageInput')?.click();
    });

    // Image file input changed -> stage image
    document.getElementById('imageInput')?.addEventListener('change', function () {
        if (this.files && this.files[0]) {
            stageImageFile(this.files[0]);
        }
    });

    // Cancel staged image
    document.getElementById('btnCancelStagedImage')?.addEventListener('click', function () {
        clearStagedImage();
    });

    // Confirm and send staged image
    document.getElementById('btnSendStagedImage')?.addEventListener('click', function () {
        confirmAndSendStagedImage();
    });

    // Attach file button
    document.getElementById('btnAttachFile')?.addEventListener('click', function () {
        if (!currentConversationId) {
            if (typeof showToast === 'function') {
                showToast('Please select a conversation before sending a file.', 'warning');
            }
            return;
        }
        document.getElementById('fileInput')?.click();
    });

    // File input changed -> stage file
    document.getElementById('fileInput')?.addEventListener('change', function () {
        if (this.files && this.files[0]) {
            stageFile(this.files[0]);
        }
    });

    // Cancel staged file
    document.getElementById('btnCancelStagedFile')?.addEventListener('click', function () {
        clearStagedFile();
    });

    // Confirm and send staged file
    document.getElementById('btnSendStagedFile')?.addEventListener('click', function () {
        confirmAndSendStagedFile();
    });
}

// ==========================================
// 1. IMAGE ATTACHMENTS
// ==========================================

function stageImageFile(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        if (typeof showToast === 'function') {
            showToast('Please select a valid image file (PNG, JPG, WEBP, GIF).', 'warning');
        }
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        if (typeof showToast === 'function') {
            showToast('Image file size exceeds the allowed limit (max 10MB).', 'warning');
        }
        return;
    }

    stagedImageFile = file;

    const thumb = document.getElementById('imageStagingThumb');
    const nameEl = document.getElementById('imageStagingName');
    const sizeEl = document.getElementById('imageStagingSize');
    const bar = document.getElementById('imageStagingBar');

    if (thumb) thumb.src = URL.createObjectURL(file);
    if (nameEl) nameEl.innerText = file.name;
    if (sizeEl) sizeEl.innerText = (file.size / 1024).toFixed(1) + ' KB';

    if (bar) {
        bar.classList.remove('d-none');
        bar.classList.add('d-flex');
    }
}

function clearStagedImage() {
    stagedImageFile = null;
    const input = document.getElementById('imageInput');
    if (input) input.value = '';

    const bar = document.getElementById('imageStagingBar');
    if (bar) {
        bar.classList.add('d-none');
        bar.classList.remove('d-flex');
    }
}

function confirmAndSendStagedImage() {
    if (!stagedImageFile || !currentConversationId) return;
    const fileToSend = stagedImageFile;
    clearStagedImage();
    sendImageOptimistically(fileToSend, currentConversationId);
}

async function sendImageOptimistically(file, convId) {
    if (!convId || !file) return;

    if (!file.type.startsWith('image/')) {
        if (typeof showToast === 'function') {
            showToast('Please select a valid image file (PNG, JPG, WEBP, GIF).', 'warning');
        }
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        if (typeof showToast === 'function') {
            showToast('Image file size exceeds the allowed limit (max 10MB).', 'warning');
        }
        return;
    }

    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const localBlobUrl = URL.createObjectURL(file);
    const now = new Date().toISOString();

    const optimisticMsg = {
        id: tempId,
        conversationId: convId,
        senderId: currentUserId,
        senderName: 'You',
        content: localBlobUrl,
        messageType: 2,
        sentAt: now,
        isTemp: true,
        tempType: 'image',
        status: 'pending'
    };

    appendMessage(optimisticMsg);

    // Instantly update sidebar preview
    const conv = cachedConversations.find(c => c.id.toLowerCase() === convId.toLowerCase());
    if (conv) {
        conv.lastUpdatedAt = now;
        conv.previewMessage = conv.type === 2 ? `You: [Image]` : `[Image]`;
        cachedConversations = [conv, ...cachedConversations.filter(c => c.id.toLowerCase() !== conv.id.toLowerCase())];
        renderConversations(cachedConversations);
    }

    // Background upload to server
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE_URL}/conversation/${convId}/images`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            markOptimisticImageSuccess(tempId, data);
        } else {
            const errData = await response.json().catch(() => ({}));
            markOptimisticImageError(tempId, errData.message || 'Failed to send image.');
        }
    } catch (err) {
        console.error('Background image upload error:', err);
        markOptimisticImageError(tempId, 'Server connection error.');
    }
}

function markOptimisticImageSuccess(tempId, message) {
    const bubbleEl = (tempId ? document.querySelector(`[data-temp-id="${tempId}"]`) : null)
                  || (message.id ? document.querySelector(`[data-msg-id="${message.id}"]`) : null);
    if (bubbleEl) {
        bubbleEl.dataset.tempId = '';
        bubbleEl.dataset.msgId = message.id;
        bubbleEl.dataset.tempStatus = 'sent';

        const img = bubbleEl.querySelector('img');
        if (img) {
            img.src = message.content;
            img.style.opacity = '1';
            img.onclick = () => openImageModal(message.content);
        }

        const pendingBadge = bubbleEl.querySelector('.upload-pending-badge');
        if (pendingBadge) pendingBadge.remove();

        if (typeof attachRecallMenu === 'function') {
            attachRecallMenu(bubbleEl, message.id, message.sentAt);
        }
    }
}

function markOptimisticImageError(tempId, errorMsg) {
    const bubbleEl = document.querySelector(`[data-temp-id="${tempId}"]`);
    if (bubbleEl) {
        bubbleEl.dataset.tempStatus = 'error';

        const pendingBadge = bubbleEl.querySelector('.upload-pending-badge');
        if (pendingBadge) {
            pendingBadge.className = 'position-absolute bottom-0 end-0 m-2 px-2 py-1 rounded-pill bg-danger text-white d-flex align-items-center gap-1 shadow-sm';
            pendingBadge.innerHTML = `<span>✕ Save error</span>`;
        }

        const timeContainer = bubbleEl.querySelector('.time-container');
        if (timeContainer && !bubbleEl.querySelector('.error-label')) {
            const errLabel = document.createElement('div');
            errLabel.className = 'error-label text-danger small mt-1';
            errLabel.style.fontSize = '0.72rem';
            errLabel.innerHTML = `<span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" class="me-1" viewBox="0 0 16 16"><path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.146.146 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.163.163 0 0 1-.054.06.176.176 0 0 1-.066.018H1.146a.178.178 0 0 1-.066-.018.163.163 0 0 1-.054-.06c-.033-.059-.034-.123.002-.183L7.884 2.073a.147.147 0 0 1 .054-.057zm1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566z"/><path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z"/></svg>Send failed</span>`;
            timeContainer.appendChild(errLabel);
        }

        if (typeof showToast === 'function') {
            showToast('Unable to send image: ' + errorMsg, 'error');
        }
    }
}

function openImageModal(url) {
    if (!url) return;
    if (typeof pauseAllMedia === 'function') {
        pauseAllMedia(null);
    }
    const previewImg = document.getElementById('imageModalPreview');
    const previewVid = document.getElementById('videoModalPreview');
    const downloadBtn = document.getElementById('btnDownloadImage');
    const titleEl = document.getElementById('mediaModalTitle');

    if (previewVid) {
        try { previewVid.pause(); } catch {}
        previewVid.removeAttribute('src');
        previewVid.load();
        previewVid.classList.add('d-none');
    }
    if (previewImg) {
        previewImg.src = url;
        previewImg.classList.remove('d-none');
    }
    if (downloadBtn) {
        downloadBtn.href = url;
        downloadBtn.setAttribute('download', 'image.png');
    }
    if (titleEl) titleEl.innerText = 'Image Preview';

    const modalEl = document.getElementById('imageModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
}
window.openImageModal = openImageModal;

function openVideoModal(url) {
    if (!url) return;
    if (typeof pauseAllMedia === 'function') {
        pauseAllMedia(null);
    }
    const previewImg = document.getElementById('imageModalPreview');
    const previewVid = document.getElementById('videoModalPreview');
    const downloadBtn = document.getElementById('btnDownloadImage');
    const titleEl = document.getElementById('mediaModalTitle');

    if (previewImg) {
        previewImg.src = '';
        previewImg.classList.add('d-none');
    }
    if (previewVid) {
        previewVid.src = url;
        previewVid.classList.remove('d-none');
        previewVid.currentTime = 0;
        previewVid.play().catch(() => {});
    }
    if (downloadBtn) {
        downloadBtn.href = url;
        downloadBtn.setAttribute('download', 'video.mp4');
    }
    if (titleEl) titleEl.innerText = 'Video Preview';

    const modalEl = document.getElementById('imageModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
}
window.openVideoModal = openVideoModal;

document.addEventListener("DOMContentLoaded", function () {
    const imgModal = document.getElementById('imageModal');
    if (imgModal) {
        imgModal.addEventListener('hide.bs.modal', function () {
            const previewVid = document.getElementById('videoModalPreview');
            if (previewVid) {
                try { previewVid.pause(); } catch {}
                previewVid.removeAttribute('src');
                previewVid.load();
                previewVid.classList.add('d-none');
            }
        });
    }
});

// ==========================================
// 2. FILE ATTACHMENTS
// ==========================================

function stageFile(file) {
    if (!file) return;

    const blocked = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.dll', '.vbs', '.scr', '.com', '.pif'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (blocked.includes(ext)) {
        if (typeof showToast === 'function') {
            showToast(`File format '${ext}' is blocked for security reasons.`, 'error');
        }
        return;
    }
    if (file.size > 25 * 1024 * 1024) {
        if (typeof showToast === 'function') {
            showToast('File size exceeds the limit (max 25MB).', 'warning');
        }
        return;
    }

    stagedFile = file;

    const nameEl = document.getElementById('fileStagingName');
    const sizeEl = document.getElementById('fileStagingSize');
    const iconBox = document.getElementById('fileStagingIconBox');
    const bar = document.getElementById('fileStagingBar');

    if (nameEl) nameEl.innerText = file.name;
    if (sizeEl) sizeEl.innerText = formatFileSize(file.size);

    if (iconBox) {
        iconBox.className = 'file-icon-box ' + getFileIconClass(ext.replace('.', ''));
    }

    if (bar) {
        bar.classList.remove('d-none');
        bar.classList.add('d-flex');
    }
}

function clearStagedFile() {
    stagedFile = null;
    const input = document.getElementById('fileInput');
    if (input) input.value = '';

    const bar = document.getElementById('fileStagingBar');
    if (bar) {
        bar.classList.add('d-none');
        bar.classList.remove('d-flex');
    }
}

function confirmAndSendStagedFile() {
    if (!stagedFile || !currentConversationId) return;
    const fileToSend = stagedFile;
    clearStagedFile();
    sendAttachmentOptimistically(fileToSend, currentConversationId);
}

async function sendAttachmentOptimistically(file, convId) {
    if (!convId || !file) return;

    const tempId = 'temp-file-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const localBlobUrl = URL.createObjectURL(file);
    const now = new Date().toISOString();

    const optimisticPayload = {
        url: localBlobUrl,
        fileName: file.name,
        fileSize: file.size,
        extension: '.' + file.name.split('.').pop().toLowerCase()
    };

    const optimisticMsg = {
        id: tempId,
        conversationId: convId,
        senderId: currentUserId,
        senderName: 'You',
        content: JSON.stringify(optimisticPayload),
        messageType: 3,
        sentAt: now,
        isTemp: true,
        tempType: 'file',
        status: 'pending'
    };

    appendMessage(optimisticMsg);

    // Instantly update sidebar preview
    const conv = cachedConversations.find(c => c.id.toLowerCase() === convId.toLowerCase());
    if (conv) {
        conv.lastUpdatedAt = now;
        conv.previewMessage = conv.type === 2 ? `You: [File: ${file.name}]` : `[File: ${file.name}]`;
        cachedConversations = [conv, ...cachedConversations.filter(c => c.id.toLowerCase() !== conv.id.toLowerCase())];
        renderConversations(cachedConversations);
    }

    // Background upload to server
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE_URL}/conversation/${convId}/files`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            markOptimisticFileSuccess(tempId, data);
        } else {
            const errData = await response.json().catch(() => ({}));
            markOptimisticFileError(tempId, errData.message || 'Failed to send file.');
        }
    } catch (err) {
        console.error('Background file upload error:', err);
        markOptimisticFileError(tempId, 'Server connection error.');
    }
}

function markOptimisticFileSuccess(tempId, data) {
    const bubbleEl = (tempId ? document.querySelector(`[data-temp-id="${tempId}"]`) : null)
                  || (data.id ? document.querySelector(`[data-msg-id="${data.id}"]`) : null);
    if (bubbleEl) {
        bubbleEl.dataset.tempId = '';
        bubbleEl.dataset.msgId = data.id;
        bubbleEl.dataset.tempStatus = 'sent';

        let parsed = null;
        try {
            parsed = typeof data.content === 'object' ? data.content : JSON.parse(data.content);
        } catch {}

        const fileUrl = parsed?.url || parsed?.Url;
        if (fileUrl) {
            const link = bubbleEl.querySelector('a.file-message-card');
            if (link) {
                link.href = fileUrl;
            }
        }

        const pendingBadge = bubbleEl.querySelector('.upload-pending-badge');
        if (pendingBadge) pendingBadge.remove();

        if (typeof attachRecallMenu === 'function') {
            attachRecallMenu(bubbleEl, data.id, data.sentAt);
        }
    }
}

function markOptimisticFileError(tempId, errorMsg) {
    const bubbleEl = document.querySelector(`[data-temp-id="${tempId}"]`);
    if (bubbleEl) {
        bubbleEl.dataset.tempStatus = 'error';

        const pendingBadge = bubbleEl.querySelector('.upload-pending-badge');
        if (pendingBadge) {
            pendingBadge.className = 'position-absolute bottom-0 end-0 m-1 px-2 py-0 rounded-pill bg-danger text-white d-flex align-items-center gap-1 shadow-sm';
            pendingBadge.innerHTML = `<span>✕ ${escapeHtml(errorMsg)}</span>`;
        }
    }
}

function getFileIconClass(ext) {
    if (['pdf'].includes(ext)) return 'file-icon-pdf';
    if (['doc', 'docx'].includes(ext)) return 'file-icon-word';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'file-icon-excel';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'file-icon-zip';
    if (['js', 'ts', 'html', 'css', 'json', 'cs', 'py', 'java', 'sql', 'xml'].includes(ext)) return 'file-icon-code';
    return 'file-icon-general';
}

function renderFileBubble(message, isMe, isPending) {
    let fileData = null;
    try {
        fileData = typeof message.content === 'object' ? message.content : JSON.parse(message.content);
    } catch {
        fileData = { url: message.content, fileName: 'Attachment', fileSize: 0 };
    }

    const fileName = fileData.fileName || fileData.FileName || 'Attachment';
    const fileSizeStr = formatFileSize(fileData.fileSize ?? fileData.FileSize ?? 0);
    const fileUrl = fileData.url || fileData.Url || '#';
    const ext = (fileData.extension || fileData.Extension || fileName.split('.').pop() || '').toLowerCase().replace('.', '');
    
    let iconClass = 'file-icon-general';
    let iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" class="bi bi-file-earmark" viewBox="0 0 16 16"><path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/></svg>';

    if (['pdf'].includes(ext)) {
        iconClass = 'file-icon-pdf';
        iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" class="bi bi-file-earmark-pdf" viewBox="0 0 16 16"><path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/><path d="M4.603 14.087a.81.81 0 0 1-.438-.42c-.195-.388-.13-.776.08-1.103.18-.28.453-.546.782-.765.344-.23.73-.414 1.135-.548-.124-.35-.23-.715-.315-1.09a15.753 15.753 0 0 1-.295-1.748c-.02-.19-.033-.38-.04-.572-.047-.798.13-1.46.54-1.874.22-.224.496-.34.8-.337.387.004.708.204.887.545.178.34.195.772.05 1.228-.15.474-.43 1.01-.817 1.564.19.467.42.92.68 1.344.383.626.83 1.196 1.32 1.69.49.495 1.02.88 1.567 1.136.425.2.82.28 1.17.234.34-.044.608-.236.757-.54.148-.302.138-.69-.03-1.077-.14-.326-.38-.667-.71-1.002a11.19 11.19 0 0 0-1.89-1.41 12.394 12.394 0 0 0-1.99-.887 18.04 18.04 0 0 0-1.636-.454c.2-.5.35-1.01.44-1.51.09-.49.1-.96.02-1.39-.08-.43-.3-.76-.64-.93-.34-.17-.74-.15-1.1.05-.36.2-.6.54-.7 1-.1.46-.06 1.01.12 1.61.18.6.47 1.25.84 1.91-.45.2-.88.42-1.28.66-.4.24-.75.52-1.02.82-.28.31-.44.66-.48 1.03-.04.38.07.75.31 1.05.24.3.61.49 1.05.54.44.05.91-.04 1.37-.25z"/></svg>';
    } else if (['doc', 'docx'].includes(ext)) {
        iconClass = 'file-icon-word';
        iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" class="bi bi-file-earmark-word" viewBox="0 0 16 16"><path d="M5.485 6.879l1.002 4.043 1.144-4.043h1.07l1.152 4.043 1.002-4.043h1.164l-1.574 5.501H9.33l-1.12-3.874-1.12 3.874H5.975L4.4 6.879h1.085z"/><path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/></svg>';
    } else if (['xls', 'xlsx', 'csv'].includes(ext)) {
        iconClass = 'file-icon-excel';
        iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" class="bi bi-file-earmark-excel" viewBox="0 0 16 16"><path d="M5.884 6.68 8 9.219l2.116-2.54h1.448L8.856 9.94l2.84 3.44H10.22L8 10.659l-2.22 2.721H4.304l2.87-3.46L4.416 6.68h1.468z"/><path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/></svg>';
    } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
        iconClass = 'file-icon-zip';
        iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" class="bi bi-file-earmark-zip" viewBox="0 0 16 16"><path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/><path d="M7.5 7.5h1v-1h-1v1zm1 1h-1v1h1v-1zm-1 1h1v1h-1v-1zm1 1h-1v1h1v-1z"/></svg>';
    } else if (['js', 'ts', 'html', 'css', 'json', 'cs', 'py', 'java', 'sql', 'xml'].includes(ext)) {
        iconClass = 'file-icon-code';
        iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" class="bi bi-file-earmark-code" viewBox="0 0 16 16"><path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/><path d="M8.646 6.646a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708-.708L10.293 9 8.646 7.354a.5.5 0 0 1 0-.708zm-1.292 0a.5.5 0 0 0-.708 0l-2 2a.5.5 0 0 0 0 .708l2 2a.5.5 0 0 0 .708-.708L5.707 9l1.647-1.646a.5.5 0 0 0 0-.708z"/></svg>';
    }

    const bgStyle = isMe 
        ? 'background: linear-gradient(135deg, var(--primary), var(--violet)); color: #fff;' 
        : 'background: var(--msg-in-bg); color: var(--msg-in-text); border: 1px solid var(--msg-in-border);';

    return `
        <div class="chat-bubble ${isMe ? 'sent' : 'received'} d-inline-block shadow-sm position-relative" style="${bgStyle} border-radius: 16px; border-bottom-${isMe ? 'right' : 'left'}-radius: 4px; max-width: 85%;">
            <a href="${escapeHtml(fileUrl)}" target="_blank" download="${escapeHtml(fileName)}" class="file-message-card text-decoration-none" style="color: inherit;">
                <div class="file-icon-box ${iconClass}">
                    ${iconSvg}
                </div>
                <div class="overflow-hidden flex-grow-1" style="min-width: 140px; max-width: 220px;">
                    <div class="fw-semibold text-truncate small" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</div>
                    <div class="small opacity-75" style="font-size: 0.72rem;">${fileSizeStr}</div>
                </div>
                <div class="p-1 rounded-circle bg-black bg-opacity-25 d-flex align-items-center justify-content-center text-white" style="width: 28px; height: 28px;" title="Download">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-download" viewBox="0 0 16 16">
                        <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                        <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                    </svg>
                </div>
            </a>
            ${isPending ? `
                <div class="upload-pending-badge position-absolute bottom-0 end-0 m-1 px-2 py-0 rounded-pill bg-black bg-opacity-75 text-white d-flex align-items-center gap-1 shadow-sm" style="font-size: 0.65rem; backdrop-filter: blur(4px);">
                    <span class="spinner-border spinner-border-sm" style="width: 10px; height: 10px; border-width: 1.5px;" role="status"></span>
                    <span>Sending file...</span>
                </div>
            ` : ''}
        </div>
    `;
}
