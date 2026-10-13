/**
 * chat-voice.js
 * Voice message recording (Web Audio API / MediaRecorder) and Audio Player controls
 */

var mediaRecorder = null;
var audioChunks = [];
var voiceRecordTimer = null;
var voiceRecordSeconds = 0;
var voiceMediaStream = null;

function initVoiceEvents() {
    // Microphone button to start recording
    document.getElementById('btnVoiceRecord')?.addEventListener('click', function () {
        startVoiceRecording();
    });

    // Cancel recording button
    document.getElementById('btnCancelVoiceRecord')?.addEventListener('click', function () {
        cancelVoiceRecording();
    });

    // Stop and send voice recording button
    document.getElementById('btnSendVoiceRecord')?.addEventListener('click', function () {
        stopAndSendVoiceRecording();
    });
}

// ==========================================
// 1. RECORDING LIFECYCLE
// ==========================================

async function startVoiceRecording() {
    if (!currentConversationId) {
        if (typeof showToast === 'function') {
            showToast('Please select a conversation before recording.', 'warning');
        }
        return;
    }

    if (typeof pauseAllMedia === 'function') {
        pauseAllMedia(null);
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof showToast === 'function') {
            showToast('Your browser does not support audio recording.', 'error');
        }
        return;
    }

    try {
        voiceMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        
        let options = {};
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options = { mimeType: 'audio/webm;codecs=opus' };
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            options = { mimeType: 'audio/webm' };
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            options = { mimeType: 'audio/mp4' };
        }

        mediaRecorder = new MediaRecorder(voiceMediaStream, options);

        mediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        mediaRecorder.start(200);

        voiceRecordSeconds = 0;
        updateVoiceTimerText(0);

        const recordBar = document.getElementById('voiceRecordingBar');
        const inputArea = document.getElementById('chatInputArea');
        if (recordBar) {
            recordBar.classList.remove('d-none');
            recordBar.classList.add('d-flex');
        }
        if (inputArea) {
            inputArea.classList.add('d-none');
        }

        clearInterval(voiceRecordTimer);
        voiceRecordTimer = setInterval(() => {
            voiceRecordSeconds++;
            updateVoiceTimerText(voiceRecordSeconds);
            if (voiceRecordSeconds >= 180) { // Max limit 3 minutes
                stopAndSendVoiceRecording();
            }
        }, 1000);

    } catch (err) {
        console.error('Microphone access error:', err);
        if (typeof showToast === 'function') {
            showToast('Unable to access Microphone: ' + (err.message || 'Permission denied'), 'error');
        }
        cleanupVoiceRecording();
    }
}

function updateVoiceTimerText(seconds) {
    const timerEl = document.getElementById('voiceRecordTimer');
    if (!timerEl) return;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timerEl.innerText = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
}

function cancelVoiceRecording() {
    cleanupVoiceRecording();
    if (typeof showToast === 'function') {
        showToast('Recording cancelled.', 'info');
    }
}

function cleanupVoiceRecording() {
    clearInterval(voiceRecordTimer);
    voiceRecordTimer = null;
    voiceRecordSeconds = 0;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch {}
    }
    mediaRecorder = null;
    audioChunks = [];

    if (voiceMediaStream) {
        voiceMediaStream.getTracks().forEach(track => track.stop());
        voiceMediaStream = null;
    }

    const recordBar = document.getElementById('voiceRecordingBar');
    const inputArea = document.getElementById('chatInputArea');
    if (recordBar) {
        recordBar.classList.add('d-none');
        recordBar.classList.remove('d-flex');
    }
    if (inputArea) {
        inputArea.classList.remove('d-none');
    }
}

function stopAndSendVoiceRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        cleanupVoiceRecording();
        return;
    }

    const recordedSeconds = voiceRecordSeconds;
    const convId = currentConversationId;

    mediaRecorder.onstop = function() {
        if (voiceMediaStream) {
            voiceMediaStream.getTracks().forEach(track => track.stop());
            voiceMediaStream = null;
        }

        const mime = mediaRecorder?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunks, { type: mime });
        audioChunks = [];

        if (audioBlob.size === 0) {
            cleanupVoiceRecording();
            return;
        }

        const ext = mime.includes('mp4') ? '.mp4' : '.webm';
        const audioFile = new File([audioBlob], `voice_${Date.now()}${ext}`, { type: mime });

        cleanupVoiceRecording();
        sendVoiceOptimistically(audioFile, recordedSeconds, convId);
    };

    mediaRecorder.stop();
}

// ==========================================
// 2. OPTIMISTIC VOICE SEND & UPLOAD
// ==========================================

async function sendVoiceOptimistically(file, durationSec, convId) {
    if (!convId || !file) return;

    const tempId = 'temp-voice-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const localBlobUrl = URL.createObjectURL(file);
    const now = new Date().toISOString();

    const optimisticPayload = {
        url: localBlobUrl,
        duration: durationSec || 0
    };

    const optimisticMsg = {
        id: tempId,
        conversationId: convId,
        senderId: currentUserId,
        senderName: 'You',
        content: JSON.stringify(optimisticPayload),
        messageType: 5,
        sentAt: now,
        isTemp: true,
        tempType: 'voice',
        status: 'pending'
    };

    appendMessage(optimisticMsg);

    // Instantly update sidebar preview
    const conv = cachedConversations.find(c => c.id.toLowerCase() === convId.toLowerCase());
    if (conv) {
        conv.lastUpdatedAt = now;
        conv.previewMessage = conv.type === 2 ? `You: [Voice message]` : `[Voice message]`;
        cachedConversations = [conv, ...cachedConversations.filter(c => c.id.toLowerCase() !== conv.id.toLowerCase())];
        renderConversations(cachedConversations);
    }

    // Background upload to server
    const formData = new FormData();
    formData.append('file', file);
    formData.append('duration', durationSec || 0);

    try {
        const response = await fetch(`${API_BASE_URL}/conversation/${convId}/voice`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            markOptimisticVoiceSuccess(tempId, data);
        } else {
            const errData = await response.json().catch(() => ({}));
            markOptimisticVoiceError(tempId, errData.message || 'Failed to send voice message.');
        }
    } catch (err) {
        console.error('Background voice upload error:', err);
        markOptimisticVoiceError(tempId, 'Server connection error.');
    }
}

function markOptimisticVoiceSuccess(tempId, data) {
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

        const voiceUrl = parsed?.url || parsed?.Url;
        const voiceDur = (parsed?.duration ?? parsed?.Duration) ? Math.round(parsed?.duration ?? parsed?.Duration) : 0;
        if (voiceUrl) {
            const audio = bubbleEl.querySelector('audio');
            if (audio) {
                audio.src = voiceUrl;
                if (voiceDur) audio.dataset.duration = voiceDur;
            }
        }
        if (voiceDur) {
            const playerBubble = bubbleEl.querySelector('.voice-player-bubble');
            if (playerBubble) playerBubble.dataset.duration = voiceDur;
        }

        const pendingBadge = bubbleEl.querySelector('.upload-pending-badge');
        if (pendingBadge) pendingBadge.remove();

        if (typeof attachRecallMenu === 'function') {
            attachRecallMenu(bubbleEl, data.id, data.sentAt);
        }
    }
}

function markOptimisticVoiceError(tempId, errorMsg) {
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

// ==========================================
// 3. AUDIO BUBBLE & PLAYBACK CONTROLS
// ==========================================

function renderVoiceBubble(message, isMe, isPending) {
    let voiceData = null;
    try {
        voiceData = typeof message.content === 'object' ? message.content : JSON.parse(message.content);
    } catch {
        voiceData = { url: message.content, duration: 0 };
    }

    const audioUrl = voiceData.url || voiceData.Url || '';
    const rawDuration = voiceData.duration ?? voiceData.Duration ?? 0;
    const duration = rawDuration ? Math.round(rawDuration) : 0;
    const durationText = formatAudioDuration(duration);
    const uniqueAudioId = 'audio-' + (message.id || ('temp-' + Math.random().toString(36).substring(2, 7)));

    const bgStyle = isMe 
        ? 'background: linear-gradient(135deg, var(--primary), var(--violet)); color: #fff;' 
        : 'background: var(--msg-in-bg); color: var(--msg-in-text); border: 1px solid var(--msg-in-border);';
    const btnBg = isMe ? 'bg-white text-primary' : 'bg-primary text-white';

    return `
        <div class="chat-bubble ${isMe ? 'sent' : 'received'} d-inline-block shadow-sm position-relative overflow-hidden" style="${bgStyle} border-radius: 18px; border-bottom-${isMe ? 'right' : 'left'}-radius: 4px; max-width: 100%;">
            <div class="voice-player-bubble" data-audio-id="${uniqueAudioId}" data-duration="${duration}">
                <button type="button" class="voice-play-btn ${btnBg} shadow-sm" onclick="togglePlayVoice(this, '${uniqueAudioId}')" title="Play">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-play-fill play-icon" viewBox="0 0 16 16">
                        <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
                    </svg>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pause-fill pause-icon d-none" viewBox="0 0 16 16">
                        <path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5zm5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5z"/>
                    </svg>
                </button>
                <div class="voice-progress-container">
                    <div class="voice-progress-bar" onclick="seekVoice(event, '${uniqueAudioId}')">
                        <div class="voice-progress-fill" style="width: 0%;"></div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-1">
                        <span class="voice-duration-text">${durationText}</span>
                        <span class="voice-tag-badge">Voice</span>
                    </div>
                </div>
                <audio id="${uniqueAudioId}" data-duration="${duration}" src="${escapeHtml(audioUrl)}" preload="metadata" onloadedmetadata="onVoiceLoadedMetadata('${uniqueAudioId}')" ontimeupdate="onVoiceTimeUpdate('${uniqueAudioId}')" onended="onVoiceEnded('${uniqueAudioId}')" onplay="onVoicePlay('${uniqueAudioId}')" onpause="onVoicePaused('${uniqueAudioId}')"></audio>
            </div>
            ${isPending ? `
                <div class="upload-pending-badge position-absolute bottom-0 end-0 m-1 px-2 py-0 rounded-pill bg-black bg-opacity-75 text-white d-flex align-items-center gap-1 shadow-sm" style="font-size: 0.65rem; backdrop-filter: blur(4px);">
                    <span class="spinner-border spinner-border-sm" style="width: 10px; height: 10px; border-width: 1.5px;" role="status"></span>
                    <span>Sending voice...</span>
                </div>
            ` : ''}
        </div>
    `;
}

function onVoicePlay(audioId) {
    const audio = document.getElementById(audioId);
    if (!audio) return;

    if (typeof isRecordingMedia === 'function' && isRecordingMedia()) {
        try { audio.pause(); } catch {}
        if (typeof warnMediaBlockedDuringRecording === 'function') {
            warnMediaBlockedDuringRecording();
        }
        return;
    }

    if (typeof pauseAllMedia === 'function') {
        pauseAllMedia(audio);
    }
    const bubble = audio.closest('.voice-player-bubble');
    if (!bubble) return;
    const playBtn = bubble.querySelector('.voice-play-btn');
    if (playBtn) {
        playBtn.querySelector('.play-icon')?.classList.add('d-none');
        playBtn.querySelector('.pause-icon')?.classList.remove('d-none');
    }
}

function onVoicePaused(audioId) {
    const audio = document.getElementById(audioId);
    if (!audio) return;
    const bubble = audio.closest('.voice-player-bubble');
    if (!bubble) return;
    const playBtn = bubble.querySelector('.voice-play-btn');
    if (playBtn) {
        playBtn.querySelector('.play-icon')?.classList.remove('d-none');
        playBtn.querySelector('.pause-icon')?.classList.add('d-none');
    }
}

function togglePlayVoice(btn, audioId) {
    if (typeof isRecordingMedia === 'function' && isRecordingMedia()) {
        if (typeof warnMediaBlockedDuringRecording === 'function') {
            warnMediaBlockedDuringRecording();
        } else if (typeof showToast === 'function') {
            showToast('Cannot play media while recording audio or video.', 'warning');
        }
        return;
    }

    const audio = document.getElementById(audioId);
    if (!audio) return;

    if (!audio.src || audio.src === window.location.href) {
        if (typeof showToast === 'function') {
            showToast('Audio source not found or invalid file URL.', 'error');
        }
        return;
    }

    if (audio.paused) {
        if (typeof pauseAllMedia === 'function') {
            pauseAllMedia(audio);
        }
        audio.play().catch(err => {
            console.error("Audio playback error:", err);
            if (typeof showToast === 'function') {
                showToast('Cannot play audio: ' + err.message, 'error');
            }
        });
    } else {
        audio.pause();
    }
}

function getVoiceTotalDuration(audio, bubble) {
    if (audio && isFinite(audio.duration) && audio.duration > 0) {
        return audio.duration;
    }
    const dataDur = parseFloat(bubble?.dataset?.duration || audio?.dataset?.duration || 0);
    if (isFinite(dataDur) && dataDur > 0) {
        return dataDur;
    }
    return 0;
}

function onVoiceLoadedMetadata(audioId) {
    const audio = document.getElementById(audioId);
    if (!audio) return;
    const bubble = audio.closest('.voice-player-bubble');
    if (!bubble) return;

    if (isFinite(audio.duration) && audio.duration > 0) {
        bubble.dataset.duration = Math.round(audio.duration);
        const timeText = bubble.querySelector('.voice-duration-text');
        if (timeText && !timeText.innerText.includes('/')) {
            timeText.innerText = formatAudioDuration(Math.round(audio.duration));
        }
    } else if (audio.duration === Infinity) {
        const currentDataDur = parseFloat(bubble.dataset.duration || 0);
        if (!currentDataDur || currentDataDur <= 0) {
            const onSeeked = () => {
                audio.removeEventListener('seeked', onSeeked);
                if (isFinite(audio.duration) && audio.duration > 0) {
                    bubble.dataset.duration = Math.round(audio.duration);
                    const timeText = bubble.querySelector('.voice-duration-text');
                    if (timeText && !timeText.innerText.includes('/')) {
                        timeText.innerText = formatAudioDuration(Math.round(audio.duration));
                    }
                }
                audio.currentTime = 0;
            };
            audio.addEventListener('seeked', onSeeked, { once: true });
            audio.currentTime = 1e101;
        }
    }
}

function onVoiceTimeUpdate(audioId) {
    const audio = document.getElementById(audioId);
    if (!audio) return;
    const bubble = audio.closest('.voice-player-bubble');
    if (!bubble) return;

    const fill = bubble.querySelector('.voice-progress-fill');
    const timeText = bubble.querySelector('.voice-duration-text');

    const totalDuration = getVoiceTotalDuration(audio, bubble);
    const currentSec = isFinite(audio.currentTime) ? audio.currentTime : 0;

    if (totalDuration > 0) {
        const percent = Math.min(100, Math.max(0, (currentSec / totalDuration) * 100));
        if (fill) fill.style.width = percent + '%';
        if (timeText) {
            timeText.innerText = formatAudioDuration(Math.round(currentSec)) + ' / ' + formatAudioDuration(Math.round(totalDuration));
        }
    } else {
        if (timeText) {
            timeText.innerText = formatAudioDuration(Math.round(currentSec));
        }
    }
}

function onVoiceEnded(audioId) {
    const audio = document.getElementById(audioId);
    if (!audio) return;
    const bubble = audio.closest('.voice-player-bubble');
    if (!bubble) return;

    const playBtn = bubble.querySelector('.voice-play-btn');
    if (playBtn) {
        playBtn.querySelector('.play-icon')?.classList.remove('d-none');
        playBtn.querySelector('.pause-icon')?.classList.add('d-none');
    }
    const fill = bubble.querySelector('.voice-progress-fill');
    if (fill) fill.style.width = '0%';
    const timeText = bubble.querySelector('.voice-duration-text');
    const totalDuration = getVoiceTotalDuration(audio, bubble);
    if (timeText && totalDuration > 0) {
        timeText.innerText = formatAudioDuration(Math.round(totalDuration));
    }
}

function seekVoice(e, audioId) {
    const audio = document.getElementById(audioId);
    if (!audio) return;
    const bubble = audio.closest('.voice-player-bubble');
    const totalDuration = getVoiceTotalDuration(audio, bubble);
    if (totalDuration <= 0) return;

    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    audio.currentTime = percent * totalDuration;
}

function formatAudioDuration(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds) || !isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
}
