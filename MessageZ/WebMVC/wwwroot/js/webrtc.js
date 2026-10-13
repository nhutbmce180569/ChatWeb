// webrtc.js - Handles WebRTC Audio & Video Calling with Dynamic Island & Call History Recording

// Safe global fallbacks for non-chat pages
if (typeof window.currentConversationId === 'undefined') window.currentConversationId = null;
if (typeof window.currentConversation === 'undefined') window.currentConversation = null;
if (typeof window.currentUserId === 'undefined') window.currentUserId = window.appData?.userId || null;

let localStream = null;
let peerConnection = null;
let activeCallUserId = null;
let activeCallType = 'audio'; // 'audio' or 'video'
let activeConversationId = null;
let activeCallerName = null;
let activeCallerAvatar = null;
let isCaller = false;
let isMicMuted = false;
let isCamMuted = false;
let callTimerInterval = null;
let callDurationSeconds = 0;
let callRecordSaved = false;
let hubConnection = null;

// Ringtone using Web Audio API
let ringToneInterval = null;
let ringToneAudioCtx = null;

function playRingTone() {
    stopRingTone();
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        ringToneAudioCtx = new AudioContext();

        function ringBeep() {
            if (!ringToneAudioCtx) return;
            try {
                const osc1 = ringToneAudioCtx.createOscillator();
                const osc2 = ringToneAudioCtx.createOscillator();
                const gain = ringToneAudioCtx.createGain();

                osc1.type = 'sine';
                osc1.frequency.value = 440; // A4
                osc2.type = 'sine';
                osc2.frequency.value = 480;

                gain.gain.setValueAtTime(0.08, ringToneAudioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ringToneAudioCtx.currentTime + 1.2);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(ringToneAudioCtx.destination);

                osc1.start();
                osc2.start();
                osc1.stop(ringToneAudioCtx.currentTime + 1.2);
                osc2.stop(ringToneAudioCtx.currentTime + 1.2);
            } catch (e) {
                console.warn("[WebRTC] Ringtone beep error:", e);
            }
        }

        ringBeep();
        ringToneInterval = setInterval(ringBeep, 2500);
    } catch (e) {
        console.warn("[WebRTC] AudioContext ringtone error:", e);
    }
}

function stopRingTone() {
    if (ringToneInterval) {
        clearInterval(ringToneInterval);
        ringToneInterval = null;
    }
    if (ringToneAudioCtx) {
        try { ringToneAudioCtx.close(); } catch {}
        ringToneAudioCtx = null;
    }
}

function getHubConnection() {
    return hubConnection || (typeof connection !== 'undefined' ? connection : null) || window.connection;
}

// STUN servers for NAT traversal
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    // Header Call Buttons (in Chat view)
    document.getElementById('btnAudioCall')?.addEventListener('click', () => startCall('audio'));
    document.getElementById('btnVideoCall')?.addEventListener('click', () => startCall('video'));

    // Incoming Call Actions
    document.getElementById('btnAcceptCall')?.addEventListener('click', acceptCall);
    document.getElementById('btnDeclineCall')?.addEventListener('click', declineCall);

    // In-Call Dock Controls
    document.getElementById('btnEndCall')?.addEventListener('click', endCall);
    document.getElementById('btnToggleMic')?.addEventListener('click', toggleMic);
    document.getElementById('btnToggleCam')?.addEventListener('click', toggleCam);
    document.getElementById('btnMinimizeCall')?.addEventListener('click', minimizeCall);

    // Dynamic Island Controls
    document.getElementById('callDynamicIsland')?.addEventListener('click', expandCall);
    document.getElementById('btnIslandToggleMic')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMic();
    });
    document.getElementById('btnIslandEndCall')?.addEventListener('click', (e) => {
        e.stopPropagation();
        endCall();
    });
});

// Exposed function to attach SignalR listeners (called from chat.js or global-signalr.js)
window.initWebRTC = function(signalRConnection) {
    hubConnection = signalRConnection;

    // 1. Incoming Call Ringing
    hubConnection.on("IncomingCall", (callerId, callerName, callType, callerAvatarUrl, conversationId) => {
        if (peerConnection || activeCallUserId) {
            // Already in a call, reject automatically
            getHubConnection()?.invoke("AnswerCall", callerId, false);
            return;
        }

        activeCallUserId = (callerId || '').toLowerCase();
        activeCallType = (callType || 'audio').toLowerCase();
        activeConversationId = conversationId || window.currentConversationId || null;
        activeCallerName = callerName || 'User';
        activeCallerAvatar = callerAvatarUrl || null;
        isCaller = false;
        callRecordSaved = false;
        callDurationSeconds = 0;

        playRingTone();

        // Show Incoming Call Popup
        const modal = document.getElementById('incomingCallModal');
        const nameEl = document.getElementById('incomingCallerName');
        const avEl = document.getElementById('incomingCallerAvatar');
        const iconEl = document.getElementById('incomingCallTypeIcon');
        const labelEl = document.getElementById('incomingCallTypeLabel');

        if (nameEl) nameEl.innerText = activeCallerName;
        if (iconEl) iconEl.innerText = activeCallType === 'video' ? '📹' : '📞';
        if (labelEl) labelEl.innerText = `Incoming ${activeCallType === 'video' ? 'Video' : 'Audio'} Call...`;

        if (avEl) {
            if (activeCallerAvatar) {
                avEl.innerHTML = `<img src="${activeCallerAvatar}" alt="${activeCallerName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
            } else {
                avEl.innerText = activeCallerName ? activeCallerName.charAt(0).toUpperCase() : 'U';
            }
        }

        if (modal) modal.classList.remove('d-none');
    });

    // 2. Call Answered (Accepted or Rejected)
    hubConnection.on("CallAnswered", async (responderId, isAccepted) => {
        if (!isCaller) return;
        if (activeCallUserId && responderId.toLowerCase() !== activeCallUserId.toLowerCase()) return;

        stopRingTone();

        if (isAccepted) {
            const statusEl = document.getElementById('callStatusBadge');
            if (statusEl) statusEl.innerText = "Connected";
            startCallTimer();
            await createOffer();
        } else {
            // Call was declined
            if (typeof showToast === 'function') {
                showToast("Call was declined.", "warning");
            }
            saveCallRecord("declined", 0);
            resetCallUI();
        }
    });

    // 3. Receive WebRTC Signaling Data (Offer, Answer, ICE Candidates)
    hubConnection.on("ReceiveSignal", async (senderId, signalData) => {
        if (activeCallUserId && senderId.toLowerCase() !== activeCallUserId.toLowerCase()) return;

        try {
            const data = JSON.parse(signalData);
            if (data.type === 'offer') {
                await handleOffer(data.offer);
            } else if (data.type === 'answer') {
                await handleAnswer(data.answer);
            } else if (data.type === 'candidate') {
                await handleCandidate(data.candidate);
            }
        } catch (e) {
            console.error("ReceiveSignal parsing error:", e);
        }
    });

    // 4. Call Ended by remote peer
    hubConnection.on("CallEnded", (senderId) => {
        if (!activeCallUserId || (senderId && senderId.toLowerCase() === activeCallUserId.toLowerCase())) {
            stopRingTone();
            if (typeof showToast === 'function') {
                showToast("Call ended.", "info");
            }
            if (isCaller) {
                const status = callDurationSeconds > 0 ? "completed" : "missed";
                saveCallRecord(status, callDurationSeconds);
            }
            resetCallUI();
        }
    });
};

function saveCallRecord(status, duration) {
    if (!isCaller || callRecordSaved) return;

    const convId = activeConversationId || window.currentConversationId;
    const targetId = activeCallUserId;
    const callType = activeCallType || 'audio';
    const finalDuration = Math.max(0, duration || 0);
    const finalStatus = status || (finalDuration > 0 ? "completed" : "missed");

    if (!convId || !targetId) {
        console.warn("[WebRTC] Missing conversationId or targetUserId, cannot record call:", { convId, targetId });
        return;
    }

    callRecordSaved = true;
    console.log(`[WebRTC] Saving Call Record: conv=${convId}, target=${targetId}, type=${callType}, status=${finalStatus}, dur=${finalDuration}s`);

    const hub = getHubConnection();
    if (hub) {
        hub.invoke("RecordCall", convId, targetId, callType, finalStatus, finalDuration)
            .then(() => console.log("[WebRTC] RecordCall invoked successfully"))
            .catch(err => console.error("[WebRTC] RecordCall invoke error:", err));
    } else {
        console.error("[WebRTC] No SignalR hub connection available to record call");
    }
}

async function startCall(callType = 'audio') {
    const curConvId = window.currentConversationId;
    const curConv = window.currentConversation;
    const myUserId = window.currentUserId || window.appData?.userId;

    if (!curConvId || activeCallUserId) {
        if (typeof showToast === 'function') {
            showToast("A call is already active or no chat is selected.", "warning");
        }
        return;
    }

    if (!curConv || curConv.type === 2) {
        if (typeof showToast === 'function') {
            showToast("Group calls are not supported yet.", "warning");
        }
        return;
    }

    // Determine partner from currentConversation.members
    let targetUser = null;
    if (curConv.members && curConv.members.length > 0) {
        targetUser = curConv.members.find(m => m.userId && myUserId && m.userId.toLowerCase() !== myUserId.toLowerCase());
    }

    if (!targetUser) {
        if (typeof showToast === 'function') {
            showToast("Cannot find target user for this call.", "error");
        }
        return;
    }

    const targetUserId = targetUser.userId;
    const partnerName = targetUser.displayName || curConv.name || 'User';
    const partnerAvatar = targetUser.avatarUrl || curConv.avatarUrl;

    isCaller = true;
    activeCallUserId = targetUserId.toLowerCase();
    activeCallType = callType;
    activeConversationId = curConvId;
    activeCallerName = partnerName;
    activeCallerAvatar = partnerAvatar;
    callRecordSaved = false;
    callDurationSeconds = 0;
    isMicMuted = false;
    isCamMuted = false;

    // Setup Call Overlay UI
    setupCallOverlayUI(partnerName, partnerAvatar, callType, "Calling…");

    try {
        await setupMedia(callType);
        const myName = window.appData?.displayName || 'User';
        getHubConnection()?.invoke("CallUser", targetUserId, myName, callType, curConvId).catch(err => {
            console.error("CallUser error:", err);
            resetCallUI();
        });
    } catch (e) {
        console.error("Media permission error:", e);
        resetCallUI();
    }
}
window.startCall = startCall;

async function acceptCall() {
    stopRingTone();

    const modal = document.getElementById('incomingCallModal');
    if (modal) modal.classList.add('d-none');

    // Partner info from incoming call or cached conversation
    let partnerName = activeCallerName || 'User';
    let partnerAvatar = activeCallerAvatar || null;

    const curConv = window.currentConversation;
    if (curConv && curConv.members) {
        const other = curConv.members.find(m => m.userId && activeCallUserId && m.userId.toLowerCase() === activeCallUserId.toLowerCase());
        if (other) {
            partnerName = other.displayName || partnerName;
            partnerAvatar = other.avatarUrl || partnerAvatar;
        }
    }

    setupCallOverlayUI(partnerName, partnerAvatar, activeCallType, "Connecting…");

    // If on Chat page and a conversation is active, auto-select it
    if (activeConversationId && typeof selectConversation === 'function' && window.currentConversationId !== activeConversationId) {
        try {
            selectConversation(activeConversationId);
        } catch (e) {
            console.warn("Could not auto-select conversation:", e);
        }
    }

    try {
        await setupMedia(activeCallType);
        getHubConnection()?.invoke("AnswerCall", activeCallUserId, true);
        startCallTimer();
        const statusEl = document.getElementById('callStatusBadge');
        if (statusEl) statusEl.innerText = "Connected";
    } catch (e) {
        console.error("Error accepting call:", e);
        getHubConnection()?.invoke("AnswerCall", activeCallUserId, false);
        resetCallUI();
    }
}

function declineCall() {
    stopRingTone();

    const modal = document.getElementById('incomingCallModal');
    if (modal) modal.classList.add('d-none');

    if (activeCallUserId) {
        getHubConnection()?.invoke("AnswerCall", activeCallUserId, false).catch(console.error);
    }
    resetCallUI();
}

function endCall() {
    stopRingTone();

    const targetId = activeCallUserId;
    const isCallerUser = isCaller;
    const duration = callDurationSeconds;
    const status = duration > 0 ? "completed" : "missed";

    if (targetId) {
        getHubConnection()?.invoke("EndCall", targetId).catch(console.error);
        if (isCallerUser) {
            saveCallRecord(status, duration);
        }
    }
    resetCallUI();
}

function minimizeCall() {
    const overlay = document.getElementById('callOverlay');
    const island = document.getElementById('callDynamicIsland');
    if (!activeCallUserId) return;

    if (overlay) overlay.classList.add('minimized');
    if (island) {
        updateIslandUI();
        island.classList.remove('d-none');
    }
}
window.minimizeCall = minimizeCall;

function expandCall() {
    const overlay = document.getElementById('callOverlay');
    const island = document.getElementById('callDynamicIsland');

    if (island) island.classList.add('d-none');
    if (overlay) overlay.classList.remove('minimized');
}
window.expandCall = expandCall;

function updateIslandUI() {
    const nameEl = document.getElementById('islandPartnerName');
    const avEl = document.getElementById('islandPartnerAvatar');
    const typeEl = document.getElementById('islandCallTypeIcon');
    const timerEl = document.getElementById('islandTimer');

    const partnerName = activeCallerName || 'User';
    const partnerAvatar = activeCallerAvatar;

    if (nameEl) nameEl.innerText = partnerName;
    if (typeEl) typeEl.innerText = activeCallType === 'video' ? '📹' : '📞';

    if (avEl) {
        if (partnerAvatar) {
            avEl.innerHTML = `<img src="${partnerAvatar}" alt="${partnerName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
        } else {
            avEl.innerText = partnerName ? partnerName.charAt(0).toUpperCase() : 'U';
        }
    }

    const mins = String(Math.floor(callDurationSeconds / 60)).padStart(2, '0');
    const secs = String(callDurationSeconds % 60).padStart(2, '0');
    if (timerEl) timerEl.innerText = `${mins}:${secs}`;

    updateIslandMicBtnUI();
}

function updateIslandMicBtnUI() {
    const btn = document.getElementById('btnIslandToggleMic');
    const micOn = document.getElementById('iconIslandMicOn');
    const micOff = document.getElementById('iconIslandMicOff');
    if (!btn) return;

    if (isMicMuted) {
        btn.classList.add('muted');
        micOn?.classList.add('d-none');
        micOff?.classList.remove('d-none');
    } else {
        btn.classList.remove('muted');
        micOn?.classList.remove('d-none');
        micOff?.classList.add('d-none');
    }
}

function setupCallOverlayUI(partnerName, partnerAvatar, callType, statusText) {
    const overlay = document.getElementById('callOverlay');
    const island = document.getElementById('callDynamicIsland');
    const headerName = document.getElementById('callPartnerName');
    const statusBadge = document.getElementById('callStatusBadge');
    const headerAv = document.getElementById('callHeaderAvatar');
    const videoArea = document.getElementById('videoCallArea');
    const audioArea = document.getElementById('audioCallArea');
    const audioName = document.getElementById('audioPartnerName');
    const audioAv = document.getElementById('audioCallAvatar');
    const btnCam = document.getElementById('btnToggleCam');
    const timerPill = document.getElementById('callTimer');

    if (headerName) headerName.innerText = partnerName;
    if (statusBadge) statusBadge.innerText = statusText;
    if (audioName) audioName.innerText = partnerName;

    const initial = partnerName ? partnerName.charAt(0).toUpperCase() : 'U';

    if (headerAv) {
        if (partnerAvatar) {
            headerAv.innerHTML = `<img src="${partnerAvatar}" alt="${partnerName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
        } else {
            headerAv.innerText = initial;
        }
    }

    if (audioAv) {
        if (partnerAvatar) {
            audioAv.innerHTML = `<img src="${partnerAvatar}" alt="${partnerName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
        } else {
            audioAv.innerText = initial;
        }
    }

    if (callType === 'video') {
        videoArea?.classList.remove('d-none');
        audioArea?.classList.add('d-none');
        btnCam?.classList.remove('d-none');
    } else {
        videoArea?.classList.add('d-none');
        audioArea?.classList.remove('d-none');
        btnCam?.classList.add('d-none');
    }

    if (timerPill) {
        timerPill.innerText = "00:00";
        timerPill.classList.add('d-none');
    }

    updateMicBtnUI();
    updateCamBtnUI();
    updateIslandUI();

    if (island) island.classList.add('d-none');
    if (overlay) {
        overlay.classList.remove('minimized');
        overlay.classList.remove('d-none');
    }
}

async function setupMedia(callType) {
    try {
        const wantsVideo = callType === 'video';
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: wantsVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
        });

        const localVidEl = document.getElementById('localVideo');
        if (localVidEl && wantsVideo) {
            localVidEl.srcObject = localStream;
        }

        peerConnection = new RTCPeerConnection(iceServers);

        // Add local tracks to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Listen for remote tracks
        peerConnection.ontrack = (event) => {
            const remoteVidEl = document.getElementById('remoteVideo');
            if (remoteVidEl) {
                remoteVidEl.srcObject = event.streams[0];
            }
        };

        // Listen for ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && activeCallUserId) {
                getHubConnection()?.invoke("SendSignal", activeCallUserId, JSON.stringify({
                    type: 'candidate',
                    candidate: event.candidate
                }));
            }
        };

    } catch (err) {
        console.error("Error accessing media devices.", err);
        if (typeof showToast === 'function') {
            showToast("Could not access microphone/camera.", "error");
        }
        resetCallUI();
        throw err;
    }
}

async function createOffer() {
    if (!peerConnection) return;
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        getHubConnection()?.invoke("SendSignal", activeCallUserId, JSON.stringify({
            type: 'offer',
            offer: offer
        }));
    } catch (err) {
        console.error("createOffer error:", err);
    }
}

async function handleOffer(offer) {
    if (!peerConnection) return;
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        getHubConnection()?.invoke("SendSignal", activeCallUserId, JSON.stringify({
            type: 'answer',
            answer: answer
        }));
    } catch (err) {
        console.error("handleOffer error:", err);
    }
}

async function handleAnswer(answer) {
    if (!peerConnection) return;
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error("handleAnswer error:", err);
    }
}

async function handleCandidate(candidate) {
    if (!peerConnection) return;
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        console.error("handleCandidate error:", err);
    }
}

function toggleMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        isMicMuted = !audioTrack.enabled;
        updateMicBtnUI();
        updateIslandMicBtnUI();
    }
}

function updateMicBtnUI() {
    const btn = document.getElementById('btnToggleMic');
    const micOn = document.getElementById('iconMicOn');
    const micOff = document.getElementById('iconMicOff');
    if (!btn) return;

    if (isMicMuted) {
        btn.classList.add('active-muted');
        micOn?.classList.add('d-none');
        micOff?.classList.remove('d-none');
    } else {
        btn.classList.remove('active-muted');
        micOn?.classList.remove('d-none');
        micOff?.classList.add('d-none');
    }
}

function toggleCam() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        isCamMuted = !videoTrack.enabled;
        updateCamBtnUI();
    }
}

function updateCamBtnUI() {
    const btn = document.getElementById('btnToggleCam');
    const camOn = document.getElementById('iconCamOn');
    const camOff = document.getElementById('iconCamOff');
    const offNotice = document.getElementById('localCamOffNotice');
    if (!btn) return;

    if (isCamMuted) {
        btn.classList.add('active-muted');
        camOn?.classList.add('d-none');
        camOff?.classList.remove('d-none');
        offNotice?.classList.remove('d-none');
    } else {
        btn.classList.remove('active-muted');
        camOn?.classList.remove('d-none');
        camOff?.classList.add('d-none');
        offNotice?.classList.add('d-none');
    }
}

function startCallTimer() {
    stopCallTimer();
    callDurationSeconds = 0;
    const timerPill = document.getElementById('callTimer');
    const islandTimer = document.getElementById('islandTimer');
    if (timerPill) {
        timerPill.innerText = "00:00";
        timerPill.classList.remove('d-none');
    }
    if (islandTimer) {
        islandTimer.innerText = "00:00";
    }

    callTimerInterval = setInterval(() => {
        callDurationSeconds++;
        const mins = String(Math.floor(callDurationSeconds / 60)).padStart(2, '0');
        const secs = String(callDurationSeconds % 60).padStart(2, '0');
        const timeStr = `${mins}:${secs}`;
        if (timerPill) {
            timerPill.innerText = timeStr;
        }
        if (islandTimer) {
            islandTimer.innerText = timeStr;
        }
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
}

function resetCallUI() {
    stopRingTone();
    stopCallTimer();

    document.getElementById('callOverlay')?.classList.add('d-none');
    document.getElementById('callOverlay')?.classList.remove('minimized');
    document.getElementById('incomingCallModal')?.classList.add('d-none');
    document.getElementById('callDynamicIsland')?.classList.add('d-none');

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    const localVid = document.getElementById('localVideo');
    if (localVid) localVid.srcObject = null;
    const remoteVid = document.getElementById('remoteVideo');
    if (remoteVid) remoteVid.srcObject = null;

    activeCallUserId = null;
    activeConversationId = null;
    activeCallerName = null;
    activeCallerAvatar = null;
    isCaller = false;
    isMicMuted = false;
    isCamMuted = false;
    callDurationSeconds = 0;
}
