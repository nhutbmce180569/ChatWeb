/**
 * chat-video.js
 * Video sending management (max 1 minute) & Live camera recording
 */

var stagedVideoFile = null;
var stagedVideoDuration = 0;

var videoRecorder = null;
var videoChunks = [];
var videoRecordTimer = null;
var videoRecordSeconds = 0;
var videoMediaStream = null;
var recordedVideoBlob = null;
var recordedVideoDuration = 0;
var isRecordingCancelled = false;

function initVideoEvents() {
    // 1. Attach video file from device
    document.getElementById('btnAttachVideo')?.addEventListener('click', function () {
        if (!currentConversationId) {
            if (typeof showToast === 'function') {
                showToast('Please select a conversation before sending video.', 'warning');
            }
            return;
        }
        document.getElementById('videoInput')?.click();
    });

    // File input video changed -> stage video
    document.getElementById('videoInput')?.addEventListener('change', function () {
        if (this.files && this.files[0]) {
            stageVideoFile(this.files[0]);
        }
    });

    // Cancel staged video
    document.getElementById('btnCancelStagedVideo')?.addEventListener('click', function () {
        clearStagedVideo();
    });

    // Confirm and send staged video
    document.getElementById('btnSendStagedVideo')?.addEventListener('click', function () {
        confirmAndSendStagedVideo();
    });

    // 2. Open live camera recording modal
    document.getElementById('btnRecordVideo')?.addEventListener('click', function () {
        if (!currentConversationId) {
            if (typeof showToast === 'function') {
                showToast('Please select a conversation before recording video.', 'warning');
            }
            return;
        }
        openVideoRecordModal();
    });

    // Live camera modal events
    document.getElementById('btnStartCamRecord')?.addEventListener('click', function () {
        startCameraRecording();
    });

    document.getElementById('btnStopCamRecord')?.addEventListener('click', function () {
        stopCameraRecording();
    });

    document.getElementById('btnRetakeCamRecord')?.addEventListener('click', function () {
        retakeCameraRecording();
    });

    document.getElementById('btnSendCamRecord')?.addEventListener('click', function () {
        sendRecordedCameraVideo();
    });

    // When modal is closing -> cancel recording, cleanup camera stream, and stop playback audio
    const modalEl = document.getElementById('videoRecordModal');
    if (modalEl) {
        // Stop active recording (if running) and immediately stop playback when closing or clicking X
        modalEl.addEventListener('hide.bs.modal', function () {
            cancelActiveRecording();
            stopPlaybackVideo();
        });

        // When modal is fully hidden -> cleanup camera stream and reset UI
        modalEl.addEventListener('hidden.bs.modal', function () {
            cleanupCameraStream();
            resetCameraRecordUI();
        });
    }

    // Handle direct close button click to immediately cancel
    document.querySelector('#videoRecordModal .btn-close')?.addEventListener('click', function () {
        cancelActiveRecording();
        stopPlaybackVideo();
    });
}

// ==========================================
// 1. VIDEO FILE ATTACHMENT (STAGE & SEND)
// ==========================================

function stageVideoFile(file) {
    if (!file) return;

    if (!file.type.startsWith('video/')) {
        if (typeof showToast === 'function') {
            showToast('Please select a valid video file (MP4, WebM, MOV, etc.).', 'warning');
        }
        return;
    }

    if (file.size > 50 * 1024 * 1024) {
        if (typeof showToast === 'function') {
            showToast('Video file size exceeds the allowed limit (max 50MB).', 'warning');
        }
        return;
    }

    // Check video duration with temporary video element before uploading
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    const tempUrl = URL.createObjectURL(file);
    tempVideo.src = tempUrl;

    tempVideo.onloadedmetadata = function () {
        URL.revokeObjectURL(tempUrl);
        const durationSec = tempVideo.duration;

        if (isFinite(durationSec) && durationSec > 60.5) {
            if (typeof showToast === 'function') {
                showToast(`Video duration of ${formatAudioDuration(Math.round(durationSec))} exceeds the maximum limit (max 1 minute). Please choose a shorter video.`, 'error');
            }
            clearStagedVideo();
            return;
        }

        stagedVideoFile = file;
        stagedVideoDuration = isFinite(durationSec) ? Math.round(durationSec) : 0;

        const nameEl = document.getElementById('videoStagingName');
        const sizeEl = document.getElementById('videoStagingSize');
        const bar = document.getElementById('videoStagingBar');

        if (nameEl) nameEl.innerText = file.name;
        if (sizeEl) sizeEl.innerText = `${formatFileSize(file.size)} • ${formatAudioDuration(stagedVideoDuration)}`;

        if (bar) {
            bar.classList.remove('d-none');
            bar.classList.add('d-flex');
        }
    };

    tempVideo.onerror = function () {
        URL.revokeObjectURL(tempUrl);
        if (typeof showToast === 'function') {
            showToast('Cannot read video data. Please verify file format.', 'error');
        }
        clearStagedVideo();
    };
}

function clearStagedVideo() {
    stagedVideoFile = null;
    stagedVideoDuration = 0;
    const input = document.getElementById('videoInput');
    if (input) input.value = '';

    const bar = document.getElementById('videoStagingBar');
    if (bar) {
        bar.classList.add('d-none');
        bar.classList.remove('d-flex');
    }
}

function confirmAndSendStagedVideo() {
    if (!stagedVideoFile || !currentConversationId) return;
    const fileToSend = stagedVideoFile;
    const durToSend = stagedVideoDuration;
    clearStagedVideo();
    sendVideoOptimistically(fileToSend, durToSend, currentConversationId);
}

// ==========================================
// 2. LIVE CAMERA VIDEO RECORDING MODAL
// ==========================================

async function openVideoRecordModal() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof showToast === 'function') {
            showToast('Your browser does not support camera or video recording.', 'error');
        }
        return;
    }

    if (typeof pauseAllMedia === 'function') {
        pauseAllMedia(null);
    }

    const modalEl = document.getElementById('videoRecordModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }

    resetCameraRecordUI();

    try {
        videoMediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: true
        });

        const liveVideo = document.getElementById('cameraLiveView');
        if (liveVideo) {
            liveVideo.srcObject = videoMediaStream;
            liveVideo.classList.remove('d-none');
            liveVideo.play().catch(() => {});
        }
    } catch (err) {
        console.error('Camera access error:', err);
        if (typeof showToast === 'function') {
            showToast('Unable to access Camera/Microphone: ' + (err.message || 'Permission denied'), 'error');
        }
        bootstrap.Modal.getInstance(modalEl)?.hide();
    }
}

function cancelActiveRecording() {
    isRecordingCancelled = true;
    clearInterval(videoRecordTimer);
    videoRecordTimer = null;

    if (videoRecorder) {
        try {
            videoRecorder.onstop = null; // Remove onstop handler immediately to avoid triggering showCameraPlayback
            videoRecorder.ondataavailable = null;
            if (videoRecorder.state !== 'inactive') {
                videoRecorder.stop();
            }
        } catch (e) {
            console.error('Error stopping recorder on cancel:', e);
        }
        videoRecorder = null;
    }
    videoChunks = [];
}

function stopPlaybackVideo() {
    const playVideo = document.getElementById('cameraPlaybackView');
    if (playVideo) {
        try {
            playVideo.pause();
            playVideo.currentTime = 0;
            if (playVideo.src && playVideo.src.startsWith('blob:')) {
                URL.revokeObjectURL(playVideo.src);
            }
            playVideo.removeAttribute('src');
            playVideo.load();
        } catch (e) {
            console.error('Error stopping playback video:', e);
        }
        playVideo.classList.add('d-none');
    }
}

function resetCameraRecordUI() {
    videoRecordSeconds = 0;
    recordedVideoBlob = null;
    recordedVideoDuration = 0;
    clearInterval(videoRecordTimer);
    videoRecordTimer = null;

    const timerEl = document.getElementById('camRecordTimer');
    const progressEl = document.getElementById('camRecordProgress');
    const liveVideo = document.getElementById('cameraLiveView');

    if (timerEl) timerEl.innerText = '00:00 / 01:00';
    if (progressEl) progressEl.style.width = '0%';

    if (liveVideo) {
        liveVideo.classList.remove('d-none');
    }
    
    stopPlaybackVideo();

    // Button states
    document.getElementById('btnStartCamRecord')?.classList.remove('d-none');
    document.getElementById('btnStopCamRecord')?.classList.add('d-none');
    document.getElementById('camRecordActions')?.classList.add('d-none');
    document.getElementById('camRecBadge')?.classList.add('d-none');
}

function startCameraRecording() {
    if (!videoMediaStream) return;

    if (typeof pauseAllMedia === 'function') {
        pauseAllMedia(null);
    }

    isRecordingCancelled = false;
    videoChunks = [];
    let options = {};
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        options = { mimeType: 'video/webm;codecs=vp9,opus' };
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        options = { mimeType: 'video/webm;codecs=vp8,opus' };
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
        options = { mimeType: 'video/webm' };
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        options = { mimeType: 'video/mp4' };
    }

    try {
        videoRecorder = new MediaRecorder(videoMediaStream, options);

        videoRecorder.ondataavailable = function (e) {
            if (e.data && e.data.size > 0 && !isRecordingCancelled) {
                videoChunks.push(e.data);
            }
        };

        videoRecorder.onstop = function () {
            // If user cancelled / closed popup while recording -> DO NOT load playback
            if (isRecordingCancelled) {
                videoChunks = [];
                return;
            }
            const modalEl = document.getElementById('videoRecordModal');
            if (!modalEl || !modalEl.classList.contains('show')) {
                videoChunks = [];
                return;
            }

            const mime = videoRecorder?.mimeType || 'video/webm';
            recordedVideoBlob = new Blob(videoChunks, { type: mime });
            recordedVideoDuration = videoRecordSeconds;
            videoChunks = [];

            // Switch to playback mode
            showCameraPlayback(recordedVideoBlob);
        };

        videoRecorder.start(200);

        videoRecordSeconds = 0;
        updateCamTimerUI(0);

        document.getElementById('btnStartCamRecord')?.classList.add('d-none');
        document.getElementById('btnStopCamRecord')?.classList.remove('d-none');
        document.getElementById('camRecBadge')?.classList.remove('d-none');

        clearInterval(videoRecordTimer);
        videoRecordTimer = setInterval(() => {
            videoRecordSeconds++;
            updateCamTimerUI(videoRecordSeconds);

            if (videoRecordSeconds >= 60) { // Strict 1-minute limit (60s)
                stopCameraRecording();
            }
        }, 1000);

    } catch (err) {
        console.error('startCameraRecording error:', err);
        if (typeof showToast === 'function') {
            showToast('Error starting recording: ' + err.message, 'error');
        }
    }
}

function updateCamTimerUI(seconds) {
    const timerEl = document.getElementById('camRecordTimer');
    const progressEl = document.getElementById('camRecordProgress');

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeStr = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;

    if (timerEl) timerEl.innerText = `${timeStr} / 01:00`;
    if (progressEl) {
        const percent = Math.min(100, (seconds / 60) * 100);
        progressEl.style.width = percent + '%';
    }
}

function stopCameraRecording() {
    clearInterval(videoRecordTimer);
    videoRecordTimer = null;

    if (videoRecorder && videoRecorder.state !== 'inactive') {
        videoRecorder.stop();
    }

    document.getElementById('btnStopCamRecord')?.classList.add('d-none');
    document.getElementById('camRecBadge')?.classList.add('d-none');
}

function showCameraPlayback(blob) {
    // Stop live webcam stream
    if (videoMediaStream) {
        videoMediaStream.getTracks().forEach(track => track.stop());
        videoMediaStream = null;
    }
    const liveVideo = document.getElementById('cameraLiveView');
    if (liveVideo) {
        try { liveVideo.pause(); } catch {}
        liveVideo.srcObject = null;
        liveVideo.classList.add('d-none');
    }

    const playVideo = document.getElementById('cameraPlaybackView');
    if (playVideo) {
        playVideo.classList.remove('d-none');
        playVideo.src = URL.createObjectURL(blob);
        playVideo.currentTime = 0;
        playVideo.play().catch(() => {});
    }

    document.getElementById('camRecordActions')?.classList.remove('d-none');
}

async function retakeCameraRecording() {
    resetCameraRecordUI();
    try {
        videoMediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: true
        });

        const liveVideo = document.getElementById('cameraLiveView');
        if (liveVideo) {
            liveVideo.srcObject = videoMediaStream;
            liveVideo.classList.remove('d-none');
            liveVideo.play().catch(() => {});
        }
    } catch (e) {
        console.error("Retake camera error:", e);
    }
}

function cleanupCameraStream() {
    cancelActiveRecording();

    if (videoMediaStream) {
        videoMediaStream.getTracks().forEach(track => track.stop());
        videoMediaStream = null;
    }

    const liveVideo = document.getElementById('cameraLiveView');
    if (liveVideo) {
        try { liveVideo.pause(); } catch {}
        liveVideo.srcObject = null;
    }

    stopPlaybackVideo();
}

function sendRecordedCameraVideo() {
    if (!recordedVideoBlob || recordedVideoBlob.size === 0 || !currentConversationId) {
        if (typeof showToast === 'function') {
            showToast('No recorded video to send.', 'warning');
        }
        return;
    }

    const mime = recordedVideoBlob.type || 'video/webm';
    const ext = mime.includes('mp4') ? '.mp4' : '.webm';
    const videoFile = new File([recordedVideoBlob], `cam_video_${Date.now()}${ext}`, { type: mime });
    const dur = recordedVideoDuration || 0;

    // Stop playback and close modal immediately
    stopPlaybackVideo();
    const modalEl = document.getElementById('videoRecordModal');
    if (modalEl) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
    }
    cleanupCameraStream();
    resetCameraRecordUI();

    sendVideoOptimistically(videoFile, dur, currentConversationId);
}

// ==========================================
// 3. OPTIMISTIC VIDEO SEND & UPLOAD
// ==========================================

async function sendVideoOptimistically(file, durationSec, convId) {
    if (!convId || !file) return;

    const tempId = 'temp-video-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const localBlobUrl = URL.createObjectURL(file);
    const now = new Date().toISOString();

    const optimisticPayload = {
        url: localBlobUrl,
        duration: durationSec || 0,
        fileName: file.name,
        fileSize: file.size
    };

    const optimisticMsg = {
        id: tempId,
        conversationId: convId,
        senderId: currentUserId,
        senderName: 'You',
        content: JSON.stringify(optimisticPayload),
        messageType: 6,
        sentAt: now,
        isTemp: true,
        tempType: 'video',
        status: 'pending'
    };

    appendMessage(optimisticMsg);

    // Instantly update sidebar preview
    const conv = cachedConversations.find(c => c.id.toLowerCase() === convId.toLowerCase());
    if (conv) {
        conv.lastUpdatedAt = now;
        conv.previewMessage = conv.type === 2 ? `You: [Video]` : `[Video]`;
        cachedConversations = [conv, ...cachedConversations.filter(c => c.id.toLowerCase() !== conv.id.toLowerCase())];
        renderConversations(cachedConversations);
    }

    // Background upload to server
    const formData = new FormData();
    formData.append('file', file);
    formData.append('duration', durationSec || 0);

    try {
        const response = await fetch(`${API_BASE_URL}/conversation/${convId}/video`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            markOptimisticVideoSuccess(tempId, data);
        } else {
            const errData = await response.json().catch(() => ({}));
            markOptimisticVideoError(tempId, errData.message || 'Failed to send video.');
        }
    } catch (err) {
        console.error('Background video upload error:', err);
        markOptimisticVideoError(tempId, 'Server connection error.');
    }
}

function markOptimisticVideoSuccess(tempId, data) {
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

        const videoUrl = parsed?.url || parsed?.Url;
        if (videoUrl) {
            const video = bubbleEl.querySelector('video');
            if (video) {
                video.src = videoUrl;
            }
            const expandBtn = bubbleEl.querySelector('button[title="Expand video"]');
            if (expandBtn) {
                expandBtn.setAttribute('onclick', `if(typeof openVideoModal === 'function') openVideoModal('${videoUrl}')`);
            }
        }

        const pendingBadge = bubbleEl.querySelector('.upload-pending-badge');
        if (pendingBadge) pendingBadge.remove();

        if (typeof attachRecallMenu === 'function') {
            attachRecallMenu(bubbleEl, data.id, data.sentAt);
        }
    }
}

function markOptimisticVideoError(tempId, errorMsg) {
    const bubbleEl = document.querySelector(`[data-temp-id="${tempId}"]`);
    if (bubbleEl) {
        bubbleEl.dataset.tempStatus = 'error';

        const pendingBadge = bubbleEl.querySelector('.upload-pending-badge');
        if (pendingBadge) {
            pendingBadge.className = 'position-absolute bottom-0 end-0 m-2 px-2 py-1 rounded-pill bg-danger text-white d-flex align-items-center gap-1 shadow-sm';
            pendingBadge.innerHTML = `<span>✕ ${escapeHtml(errorMsg)}</span>`;
        }
    }
}

// ==========================================
// 4. BUBBLE RENDERER
// ==========================================

function renderVideoBubble(message, isMe, isPending) {
    let videoData = null;
    try {
        videoData = typeof message.content === 'object' ? message.content : JSON.parse(message.content);
    } catch {
        videoData = { url: message.content, duration: 0 };
    }

    const videoUrl = videoData.url || videoData.Url || '';
    const rawDuration = videoData.duration ?? videoData.Duration ?? 0;
    const duration = rawDuration ? Math.round(rawDuration) : 0;
    const durationText = formatAudioDuration(duration);

    const bgStyle = isMe 
        ? 'background-color: var(--primary); color: #fff;' 
        : 'background-color: var(--msg-in-bg); color: var(--text); border: 1px solid var(--border);';

    return `
        <div class="chat-bubble ${isMe ? 'sent' : 'received'} d-inline-block shadow-sm position-relative overflow-hidden" style="${bgStyle} border-radius: 16px; border-bottom-${isMe ? 'right' : 'left'}-radius: 4px; max-width: 80%;">
            <div class="position-relative" style="background: #000; border-radius: 12px; overflow: hidden;">
                <video controls preload="metadata" playsinline src="${escapeHtml(videoUrl)}" onplay="if (typeof isRecordingMedia === 'function' && isRecordingMedia()) { this.pause(); if (typeof warnMediaBlockedDuringRecording === 'function') warnMediaBlockedDuringRecording(); } else if (typeof pauseAllMedia === 'function') { pauseAllMedia(this); }" style="max-height: 300px; max-width: 100%; display: block; border-radius: 12px; background: #000;"></video>
                <button type="button" class="btn text-white position-absolute top-0 end-0 m-2 p-1 rounded-circle bg-black bg-opacity-60 border-0 d-flex align-items-center justify-content-center" title="Expand video" style="width: 26px; height: 26px; z-index: 2; cursor: pointer;" onclick="if(typeof openVideoModal === 'function') openVideoModal('${escapeHtml(videoUrl)}')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                    </svg>
                </button>
                <div class="position-absolute bottom-0 start-0 m-2 px-2 py-0 rounded-pill bg-black bg-opacity-75 text-white d-flex align-items-center gap-1 shadow-sm pointer-events-none" style="font-size: 0.65rem; backdrop-filter: blur(4px);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" class="bi bi-camera-video-fill" viewBox="0 0 16 16">
                        <path fill-rule="evenodd" d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2V5z"/>
                    </svg>
                    <span>${durationText !== '0:00' ? durationText : 'Video'}</span>
                </div>
            </div>
            ${isPending ? `
                <div class="upload-pending-badge position-absolute bottom-0 end-0 m-2 px-2 py-1 rounded-pill bg-black bg-opacity-75 text-white d-flex align-items-center gap-1 shadow-sm" style="font-size: 0.65rem; backdrop-filter: blur(4px);">
                    <span class="spinner-border spinner-border-sm" style="width: 10px; height: 10px; border-width: 1.5px;" role="status"></span>
                    <span>Sending video...</span>
                </div>
            ` : ''}
        </div>
    `;
}
