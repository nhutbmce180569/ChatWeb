/**
 * chat.js
 * Core Coordinator: Manages State, SignalR Realtime, Conversation List, and Message Timeline.
 */

var token = window.appData?.token;
var currentUserId = window.appData?.userId;
var API_BASE_URL = 'https://localhost:7088/api';

var currentConversationId = null;
var currentConversation = null;
var connection = null;
var cachedConversations = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Search in Sidebar conversation list
    document.getElementById('searchConversationInput')?.addEventListener('input', function(e) {
        filterConversations(e.target.value);
    });

    // 2. Chat input & Send text message button
    document.getElementById('chatInput')?.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    document.getElementById('btnSend')?.addEventListener('click', function () {
        sendMessage();
    });

    // 3. Initialize extended event modules
    if (typeof initAttachmentEvents === 'function') {
        initAttachmentEvents();
    }
    if (typeof initVoiceEvents === 'function') {
        initVoiceEvents();
    }
    if (typeof initGroupEvents === 'function') {
        initGroupEvents();
    }
    if (typeof initVideoEvents === 'function') {
        initVideoEvents();
    }

    // 4. Initialize SignalR connection & Load initial conversations
    initSignalR();
    loadConversations();

    // 5. Periodic presence refresh (every 60s) for active conversation subtitle
    setInterval(() => {
        if (currentConversation && currentConversation.type !== 2) {
            updateChatHeaderPresence(currentConversation);
        }
    }, 60000);
});

// ==========================================
// MEDIA PLAYBACK COORDINATOR (Single Active Media)
// ==========================================

function pauseAllMedia(exceptElement = null) {
    // 1. Pause all <audio> elements
    document.querySelectorAll('audio').forEach(a => {
        if (a !== exceptElement && !a.paused) {
            try { a.pause(); } catch {}
            const bubble = a.closest('.voice-player-bubble');
            if (bubble) {
                const btn = bubble.querySelector('.voice-play-btn');
                btn?.querySelector('.play-icon')?.classList.remove('d-none');
                btn?.querySelector('.pause-icon')?.classList.add('d-none');
            }
        }
    });

    // 2. Pause all <video> elements
    document.querySelectorAll('video').forEach(v => {
        if (v.id === 'cameraLiveView' || v.id === 'localVideo' || v.id === 'remoteVideo') {
            return;
        }
        if (v !== exceptElement && !v.paused) {
            try { v.pause(); } catch {}
        }
    });
}
window.pauseAllMedia = pauseAllMedia;

var lastRecordingWarningTime = 0;
function warnMediaBlockedDuringRecording() {
    const now = Date.now();
    if (now - lastRecordingWarningTime > 2000) {
        lastRecordingWarningTime = now;
        if (typeof showToast === 'function') {
            showToast('Cannot play media while recording audio or video.', 'warning');
        }
    }
}
window.warnMediaBlockedDuringRecording = warnMediaBlockedDuringRecording;

function isRecordingMedia() {
    // 1. Recording Voice
    if (typeof mediaRecorder !== 'undefined' && mediaRecorder && mediaRecorder.state === 'recording') {
        return true;
    }
    const voiceBar = document.getElementById('voiceRecordingBar');
    if (voiceBar && !voiceBar.classList.contains('d-none')) {
        return true;
    }

    // 2. Recording live Video
    if (typeof videoRecorder !== 'undefined' && videoRecorder && videoRecorder.state === 'recording') {
        return true;
    }
    const camBadge = document.getElementById('camRecBadge');
    if (camBadge && !camBadge.classList.contains('d-none')) {
        return true;
    }

    return false;
}
window.isRecordingMedia = isRecordingMedia;

// Listen for play event across document in capture phase:
// When any audio or video starts playing, automatically pause other media
document.addEventListener('play', function (e) {
    const target = e.target;
    if (!target) return;
    if (target.tagName === 'AUDIO' || target.tagName === 'VIDEO') {
        if (target.id === 'cameraLiveView' || target.id === 'localVideo' || target.id === 'remoteVideo') {
            return;
        }

        // Block media playback while recording audio or video
        if (isRecordingMedia()) {
            try { 
                target.pause(); 
            } catch {}
            warnMediaBlockedDuringRecording();
            return;
        }

        pauseAllMedia(target);
    }
}, true);

// ==========================================
// 1. SIGNALR REALTIME
// ==========================================

function initSignalR() {
    connection = new signalR.HubConnectionBuilder()
        .withUrl("https://localhost:7088/chatHub", {
            accessTokenFactory: () => token
        })
        .withAutomaticReconnect()
        .build();

    // Receive new message (regular and system messages)
    connection.on("ReceiveMessage", function (message) {
        console.log("ReceiveMessage: ", message);
        const isCurrent = message.conversationId && currentConversationId && message.conversationId.toLowerCase() === currentConversationId.toLowerCase();

        if (isCurrent) {
            const isMe = message.senderId && currentUserId && message.senderId.toLowerCase() === currentUserId.toLowerCase();

            // Check if message is already in DOM to avoid duplicate rendering
            const existingMsg = message.id ? document.querySelector(`[data-msg-id="${message.id}"]`) : null;
            if (existingMsg) {
                if (isMe && typeof attachRecallMenu === 'function') {
                    attachRecallMenu(existingMsg, message.id, message.sentAt);
                }
                return;
            }

            // If sent by self with pending optimistic bubble in DOM -> update bubble instead of appending
            if (isMe && message.messageType === 2 && typeof markOptimisticImageSuccess === 'function') {
                const pendingBubble = document.querySelector(`[data-temp-type="image"][data-temp-status="pending"]`) || document.querySelector(`[data-temp-status="pending"]`);
                if (pendingBubble) {
                    markOptimisticImageSuccess(pendingBubble.dataset.tempId, message);
                    if (typeof attachRecallMenu === 'function') {
                        attachRecallMenu(pendingBubble, message.id, message.sentAt);
                    }
                    markAsRead(currentConversationId);
                    return;
                }
            } else if (isMe && message.messageType === 3 && typeof markOptimisticFileSuccess === 'function') {
                const pendingBubble = document.querySelector(`[data-temp-type="file"][data-temp-status="pending"]`);
                if (pendingBubble) {
                    markOptimisticFileSuccess(pendingBubble.dataset.tempId, message);
                    if (typeof attachRecallMenu === 'function') {
                        attachRecallMenu(pendingBubble, message.id, message.sentAt);
                    }
                    markAsRead(currentConversationId);
                    return;
                }
            } else if (isMe && message.messageType === 5 && typeof markOptimisticVoiceSuccess === 'function') {
                const pendingBubble = document.querySelector(`[data-temp-type="voice"][data-temp-status="pending"]`);
                if (pendingBubble) {
                    markOptimisticVoiceSuccess(pendingBubble.dataset.tempId, message);
                    if (typeof attachRecallMenu === 'function') {
                        attachRecallMenu(pendingBubble, message.id, message.sentAt);
                    }
                    markAsRead(currentConversationId);
                    return;
                }
            } else if (isMe && message.messageType === 6 && typeof markOptimisticVideoSuccess === 'function') {
                const pendingBubble = document.querySelector(`[data-temp-type="video"][data-temp-status="pending"]`);
                if (pendingBubble) {
                    markOptimisticVideoSuccess(pendingBubble.dataset.tempId, message);
                    if (typeof attachRecallMenu === 'function') {
                        attachRecallMenu(pendingBubble, message.id, message.sentAt);
                    }
                    markAsRead(currentConversationId);
                    return;
                }
            }

            appendMessage(message);
            markAsRead(currentConversationId);
        } else {
            showNotification(message);
        }

        // Update conversation list and unread count in cached conversations
        const conv = cachedConversations.find(c => c.id.toLowerCase() === message.conversationId.toLowerCase());
        const isMe = message.senderId && currentUserId && message.senderId.toLowerCase() === currentUserId.toLowerCase();

        if (conv) {
            conv.lastUpdatedAt = message.sentAt || new Date().toISOString();
            if (message.messageType === 4) {
                conv.previewMessage = message.content;
            } else if (message.messageType === 2) {
                const sName = message.senderName || 'User';
                conv.previewMessage = conv.type === 2 ? `${sName}: [Image]` : '[Image]';
            } else if (message.messageType === 3) {
                const sName = message.senderName || 'User';
                let fileLabel = '[Attachment]';
                try {
                    const fObj = typeof message.content === 'object' ? message.content : JSON.parse(message.content);
                    const fname = fObj?.fileName || fObj?.FileName;
                    if (fname) fileLabel = `[File: ${fname}]`;
                } catch {}
                conv.previewMessage = conv.type === 2 ? `${sName}: ${fileLabel}` : fileLabel;
            } else if (message.messageType === 5) {
                const sName = message.senderName || 'User';
                conv.previewMessage = conv.type === 2 ? `${sName}: [Voice message]` : '[Voice message]';
            } else if (message.messageType === 6) {
                const sName = message.senderName || 'User';
                conv.previewMessage = conv.type === 2 ? `${sName}: [Video]` : '[Video]';
            } else if (message.messageType === 7) {
                const sName = message.senderName || 'User';
                let callLabel = '[Call]';
                try {
                    const cObj = typeof message.content === 'object' ? message.content : JSON.parse(message.content);
                    const typeName = cObj.callType === 'video' ? 'Video call' : 'Audio call';
                    if (cObj.status === 'missed' || cObj.status === 'declined') {
                        callLabel = cObj.status === 'declined' ? `[${typeName} - Declined]` : `[Missed ${typeName.toLowerCase()}]`;
                    } else {
                        const dur = cObj.duration || 0;
                        const mins = String(Math.floor(dur / 60)).padStart(2, '0');
                        const secs = String(dur % 60).padStart(2, '0');
                        callLabel = `[${typeName} (${mins}:${secs})]`;
                    }
                } catch {}
                conv.previewMessage = conv.type === 2 ? `${sName}: ${callLabel}` : callLabel;
            } else {
                const sName = message.senderName || 'User';
                conv.previewMessage = conv.type === 2 ? `${sName}: ${message.content}` : message.content;
            }

            // If user is NOT in the conversation and message is NOT sent by self -> Increase unread count
            if (!isCurrent && !isMe) {
                conv.unreadCount = (conv.unreadCount || 0) + 1;
            } else if (isCurrent) {
                conv.unreadCount = 0;
            }

            // Move conversation to top of list
            cachedConversations = [conv, ...cachedConversations.filter(c => c.id.toLowerCase() !== conv.id.toLowerCase())];
            renderConversations(cachedConversations);
        } else {
            // New conversation not in cache -> reload from API
            loadConversations();
        }
    });

    // Notification: Added to new group
    connection.on("GroupCreated", function (data) {
        console.log("GroupCreated: ", data);
        if (typeof showToast === 'function') {
            showToast(`You have been added to group <b>${data.name}</b>`, 'info');
        }
        loadConversations();
    });

    // Notification: Group updated (rename, member changes)
    connection.on("GroupUpdated", function (data) {
        console.log("GroupUpdated: ", data);
        if (currentConversationId && data.id && currentConversationId.toLowerCase() === data.id.toLowerCase()) {
            const nameEl = document.getElementById('currentChatName');
            const subEl = document.getElementById('currentChatSubtitle');
            if (nameEl) nameEl.innerText = data.name || 'Group Chat';
            if (subEl) subEl.innerText = `👥 ${data.memberCount || 1} members`;
            if (currentConversation) {
                currentConversation.name = data.name;
                currentConversation.memberCount = data.memberCount;
            }
        }
        loadConversations();
    });

    // Notification: Removed from group
    connection.on("RemovedFromGroup", function (data) {
        console.log("RemovedFromGroup: ", data);
        if (typeof showToast === 'function') {
            showToast(data.message || 'You have been removed from the group.', 'warning');
        }
        if (currentConversationId && data.conversationId && currentConversationId.toLowerCase() === data.conversationId.toLowerCase()) {
            const chatMain = document.getElementById('chatMainArea');
            const noChat = document.getElementById('noChatSelected');
            if (chatMain) {
                chatMain.classList.add('d-none');
                chatMain.style.display = 'none';
            }
            if (noChat) noChat.classList.remove('d-none');
            currentConversationId = null;
            currentConversation = null;
        }
        loadConversations();
    });

    // Notification: Message recalled
    connection.on("MessageRecalled", function (data) {
        console.log("MessageRecalled received: ", data);
        if (!data || !data.messageId) return;

        // 1. Update message bubble in chat body if currently open
        const msgWrapper = document.querySelector(`[data-msg-id="${data.messageId}"]`);
        if (msgWrapper) {
            const isMe = msgWrapper.classList.contains('sent') || msgWrapper.classList.contains('text-end');
            const recalledBubbleHtml = `
                <div class="chat-bubble recalled d-inline-flex align-items-center gap-2 px-3 py-2 text-muted shadow-sm" style="background-color: var(--surface); border: 1px dashed var(--border); border-radius: 16px; ${isMe ? 'border-bottom-right-radius: 4px;' : 'border-bottom-left-radius: 4px;'} font-style: italic; font-size: 0.85rem; max-width: 100%;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0" style="color: var(--text-3);">
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                    <span style="color: var(--text-3);">This message has been recalled</span>
                </div>
            `;

            const currentBubble = msgWrapper.querySelector('.chat-bubble');
            if (currentBubble) {
                currentBubble.outerHTML = recalledBubbleHtml;
            }

            // Remove 3-dots action menu and any recall button
            msgWrapper.querySelector('.msg-action-menu')?.remove();
            msgWrapper.querySelector('.btn-recall-msg')?.remove();
        }

        // 2. Update conversation preview in sidebar
        if (cachedConversations && data.conversationId) {
            const conv = cachedConversations.find(c => c.id && c.id.toLowerCase() === data.conversationId.toLowerCase());
            if (conv) {
                conv.previewMessage = "[Message recalled]";
                renderConversations(cachedConversations);
            }
        }
    });

    // Notification: User Presence Changed (Online / Offline / Last Seen)
    connection.on("UserPresenceChanged", function (data) {
        console.log("UserPresenceChanged received: ", data);
        if (!data || !data.userId) return;

        const targetUserId = data.userId.toLowerCase();
        let hasChanges = false;

        // 1. Update cached conversations
        if (cachedConversations && Array.isArray(cachedConversations)) {
            cachedConversations.forEach(c => {
                if (c.members && Array.isArray(c.members)) {
                    c.members.forEach(m => {
                        if (m.userId && m.userId.toLowerCase() === targetUserId) {
                            m.isOnline = data.isOnline;
                            if (!data.isOnline && data.lastSeenAt) {
                                m.lastSeenAt = data.lastSeenAt;
                            }
                            hasChanges = true;
                        }
                    });
                }
            });
        }

        // 2. Update current active conversation header if currently chatting 1-on-1 with this user
        if (currentConversation && currentConversation.type !== 2) {
            const partner = currentConversation.members?.find(m => m.userId && m.userId.toLowerCase() === targetUserId);
            if (partner) {
                partner.isOnline = data.isOnline;
                if (!data.isOnline && data.lastSeenAt) {
                    partner.lastSeenAt = data.lastSeenAt;
                }
                updateChatHeaderPresence(currentConversation);
            }
        }

        // 3. Re-render conversation list if any contact's status changed
        if (hasChanges) {
            renderConversations(cachedConversations);
        }
    });

    connection.onreconnected(function () {
        console.log("SignalR reconnected, refreshing conversations...");
        loadConversations();
    });

    connection.start().then(function () {
        console.log("Connected to ChatHub");
        if (window.initWebRTC) window.initWebRTC(connection);
    }).catch(function (err) {
        console.error("SignalR Connection Error:", err.toString());
    });
}

function showNotification(message) {
    if (typeof showToast === 'function') {
        const sender = message.senderName || 'System';
        if (message.senderId && currentUserId && message.senderId.toLowerCase() === currentUserId.toLowerCase()) return;
        
        let text = message.content || '';
        if (message.messageType === 2) {
            text = '📷 [Image]';
        } else if (message.messageType === 3) {
            text = '📎 [Attachment]';
        } else if (message.messageType === 5) {
            text = '🎙️ [Voice message]';
        } else if (message.messageType === 6) {
            text = '📹 [Video]';
        } else if (message.messageType === 7) {
            text = '📞 [Call record]';
        } else if (text.length > 35) {
            text = text.substring(0, 35) + '...';
        }
        
        showToast(`<b>${sender}</b>: ${text}`, 'info');
    }
}

// ==========================================
// 2. CONVERSATION SIDEBAR LIST
// ==========================================

async function loadConversations() {
    try {
        const response = await fetch(`${API_BASE_URL}/conversation`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            cachedConversations = data.map(c => {
                if (currentConversationId && c.id.toLowerCase() === currentConversationId.toLowerCase()) {
                    c.unreadCount = 0;
                }
                return c;
            });
            renderConversations(cachedConversations);

            if (currentConversationId) {
                const updatedCurrent = cachedConversations.find(c => c.id.toLowerCase() === currentConversationId.toLowerCase());
                if (updatedCurrent) {
                    currentConversation = updatedCurrent;
                    updateChatHeaderPresence(currentConversation);
                }
            }
        }
    } catch (e) {
        console.error("Failed to load conversations", e);
    }
}

function filterConversations(query) {
    if (!query) {
        renderConversations(cachedConversations);
        return;
    }
    const q = query.toLowerCase().trim();
    const filtered = cachedConversations.filter(c => (c.name && c.name.toLowerCase().includes(q)));
    renderConversations(filtered);
}

function renderConversations(conversations) {
    const list = document.getElementById('contactsList');
    if (!list) return;
    list.innerHTML = '';
    
    if (conversations.length === 0) {
        list.innerHTML = '<div class="text-center p-4 text-muted small">No conversations yet</div>';
        return;
    }

    conversations.forEach(conv => {
        const div = document.createElement('div');
        div.className = 'contact-item d-flex align-items-center gap-3 p-3 border-bottom';
        div.style.cursor = 'pointer';
        div.style.transition = 'background 0.2s';
        
        const isCurrent = currentConversationId && conv.id.toLowerCase() === currentConversationId.toLowerCase();
        if (isCurrent) {
            div.classList.add('active');
            div.style.backgroundColor = 'var(--surface-hover, #1e293b)';
        }
        
        div.onmouseover = () => { if (!div.classList.contains('active')) div.style.backgroundColor = 'var(--surface-hover, #334155)'; };
        div.onmouseout = () => { if (!div.classList.contains('active')) div.style.backgroundColor = 'transparent'; };
        
        const isGroup = conv.type === 2;
        let initial = conv.name ? conv.name.charAt(0).toUpperCase() : (isGroup ? 'G' : 'U');
        let preview = conv.previewMessage || 'Start a conversation';

        let avatarHtml = '';
        if (isGroup) {
            avatarHtml = `
                <div class="avatar-wrapper flex-shrink-0">
                    <div class="contact-avatar d-flex align-items-center justify-content-center shadow-sm" style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7Zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.784 6A2.238 2.238 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216ZM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/>
                        </svg>
                    </div>
                </div>
            `;
        } else {
            const otherMember = conv.members && currentUserId ? conv.members.find(m => m.userId && m.userId.toLowerCase() !== currentUserId.toLowerCase()) : null;
            const avatarUrl = conv.avatarUrl || otherMember?.avatarUrl;
            const isOnline = otherMember?.isOnline === true;
            const onlineDotHtml = isOnline ? '<span class="online-status-dot"></span>' : '';

            if (avatarUrl) {
                avatarHtml = `
                    <div class="avatar-wrapper flex-shrink-0">
                        <div class="contact-avatar shadow-sm" style="width: 48px; height: 48px; border-radius: 50%; overflow: hidden;">
                            <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(conv.name || 'User')}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'d-flex align-items-center justify-content-center w-100 h-100\\' style=\\'background: #3b82f6; color: white; font-weight: bold; font-size: 1.1rem;\\'>${escapeHtml(initial)}</div>';" />
                        </div>
                        ${onlineDotHtml}
                    </div>
                `;
            } else {
                avatarHtml = `
                    <div class="avatar-wrapper flex-shrink-0">
                        <div class="contact-avatar d-flex align-items-center justify-content-center shadow-sm" style="width: 48px; height: 48px; border-radius: 50%; background: #3b82f6; color: white; font-weight: bold; font-size: 1.1rem;">
                            ${initial}
                        </div>
                        ${onlineDotHtml}
                    </div>
                `;
            }
        }

        let unreadBadgeHtml = '';
        if (conv.unreadCount && conv.unreadCount > 0) {
            const countDisplay = conv.unreadCount > 99 ? '99+' : conv.unreadCount;
            unreadBadgeHtml = `<span class="badge rounded-pill bg-danger shadow-sm" style="font-size: 0.72rem; padding: 0.35em 0.6em;">${countDisplay}</span>`;
        }

        div.innerHTML = `
            ${avatarHtml}
            <div class="flex-grow-1 overflow-hidden">
                <div class="d-flex justify-content-between align-items-baseline mb-1">
                    <span class="fw-bold text-truncate contact-name" style="font-size: 0.95rem; color: var(--text);">${escapeHtml(conv.name || (isGroup ? 'Group Chat' : 'User'))}</span>
                    <small class="text-muted" style="font-size: 0.75rem;">${formatTime(conv.lastUpdatedAt)}</small>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                    <span class="text-muted small text-truncate ${conv.unreadCount > 0 ? 'fw-bold' : ''}" style="max-width: 170px; color: ${conv.unreadCount > 0 ? 'var(--text)' : 'var(--text-3)'};">${escapeHtml(preview)}</span>
                    ${unreadBadgeHtml}
                </div>
            </div>
        `;
        
        div.onclick = () => selectConversation(conv);
        list.appendChild(div);
        
        // Ensure connection has joined the SignalR room
        if (connection && connection.state === signalR.HubConnectionState.Connected) {
            connection.invoke("JoinChat", conv.id).catch(err => console.error(err));
        }
    });
}

async function markAsRead(conversationId) {
    if (!conversationId) return;
    try {
        await fetch(`${API_BASE_URL}/conversation/${conversationId}/read`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (e) {
        console.error("markAsRead Error:", e);
    }
}

async function selectConversation(conv) {
    if (typeof pauseAllMedia === 'function') pauseAllMedia(null);
    currentConversationId = conv.id;
    currentConversation = conv;
    if (typeof clearStagedImage === 'function') clearStagedImage();
    if (typeof clearStagedFile === 'function') clearStagedFile();
    if (typeof clearStagedVideo === 'function') clearStagedVideo();

    // If conversation has unread messages -> mark as read and clear badge on UI
    if (conv.unreadCount > 0) {
        conv.unreadCount = 0;
        markAsRead(conv.id);
        renderConversations(cachedConversations);
    }

    const noChat = document.getElementById('noChatSelected');
    const chatMain = document.getElementById('chatMainArea');
    if (noChat) noChat.classList.add('d-none');
    if (chatMain) {
        chatMain.classList.remove('d-none');
        chatMain.style.display = 'flex';
    }

    const isGroup = conv.type === 2;
    const currentName = document.getElementById('currentChatName');
    const avatarEl = document.getElementById('currentChatAvatar');

    if (currentName) currentName.innerText = conv.name || (isGroup ? 'Group Chat' : 'Conversation');

    if (isGroup) {
        if (avatarEl) {
            avatarEl.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
            avatarEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7Zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.784 6A2.238 2.238 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216ZM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/></svg>';
            avatarEl.classList.remove('online');
        }

        // Hide 1-1 Video and Audio Call buttons when in a Group
        document.getElementById('btnVideoCall')?.classList.add('d-none');
        document.getElementById('btnAudioCall')?.classList.add('d-none');
        // Show Group Info button
        document.getElementById('btnGroupInfo')?.classList.remove('d-none');
    } else {
        const otherMember = conv.members && currentUserId ? conv.members.find(m => m.userId && m.userId.toLowerCase() !== currentUserId.toLowerCase()) : null;
        const avatarUrl = conv.avatarUrl || otherMember?.avatarUrl;
        let initial = conv.name ? conv.name.charAt(0).toUpperCase() : 'U';
        if (avatarEl) {
            if (avatarUrl) {
                avatarEl.style.background = 'transparent';
                avatarEl.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(conv.name || 'User')}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" onerror="this.onerror=null; this.parentElement.style.background='#3b82f6'; this.parentElement.innerText='${escapeHtml(initial)}';" />`;
            } else {
                avatarEl.style.background = '#3b82f6';
                avatarEl.innerText = initial;
            }
            if (otherMember?.isOnline) {
                avatarEl.classList.add('online');
            } else {
                avatarEl.classList.remove('online');
            }
        }

        // Show Video and Audio Call buttons for 1-1
        document.getElementById('btnVideoCall')?.classList.remove('d-none');
        document.getElementById('btnAudioCall')?.classList.remove('d-none');
        // Hide Group Info button
        document.getElementById('btnGroupInfo')?.classList.add('d-none');
    }

    // Dynamic presence header
    updateChatHeaderPresence(conv);

    document.querySelectorAll('.contact-item').forEach(el => {
        el.classList.remove('active');
        el.style.backgroundColor = 'transparent';
    });
    
    // Load message history
    await loadMessages(conv.id);
    
    // Refresh sidebar to highlight active item
    loadConversations();
}

// ==========================================
// 3. MESSAGES (SEND & DISPLAY)
// ==========================================

async function loadMessages(conversationId) {
    const chatBody = document.getElementById('chatBody');
    if (!chatBody) return;
    chatBody.innerHTML = '<div class="text-center text-muted p-4 small">Loading messages...</div>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/conversation/${conversationId}/messages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const messages = await response.json();
            chatBody.innerHTML = '';
            messages.forEach(msg => appendMessage(msg));
            chatBody.scrollTop = chatBody.scrollHeight;
        }
    } catch (e) {
        console.error("Failed to load messages", e);
    }
}

function appendMessage(message) {
    const chatBody = document.getElementById('chatBody');
    if (!chatBody) return;

    const isMe = (message.senderId && currentUserId) && (message.senderId.toLowerCase() === currentUserId.toLowerCase());
    const timeStr = formatTime(message.sentAt);
    
    // Handle System Message (MessageType = 4)
    if (message.messageType === 4) {
        const sysDiv = document.createElement('div');
        sysDiv.className = 'text-center my-3';
        sysDiv.innerHTML = `
            <span class="badge text-muted px-3 py-2 rounded-pill border" style="font-weight: 500; font-size: 0.8rem; background-color: var(--surface); border-color: var(--border-color) !important;">
                ${escapeHtml(message.content)}
            </span>
        `;
        chatBody.appendChild(sysDiv);
        chatBody.scrollTop = chatBody.scrollHeight;
        return;
    }

    const wrapper = document.createElement('div');
    if (message.id) wrapper.dataset.msgId = message.id;
    if (message.isTemp) {
        wrapper.dataset.tempId = message.id;
        wrapper.dataset.tempStatus = message.status || 'pending';
        if (message.tempType) wrapper.dataset.tempType = message.tempType;
    }

    const isPending = message.isTemp && message.status === 'pending';

    if (isMe) {
        wrapper.className = 'message-row sent d-flex align-items-center justify-content-end gap-2 mb-3';
        let bubbleHtml = '';
        if (message.isRecalled) {
            bubbleHtml = `
                <div class="chat-bubble recalled d-inline-flex align-items-center gap-2 px-3 py-2 text-muted shadow-sm" style="background-color: var(--surface); border: 1px dashed var(--border); border-radius: 16px; border-bottom-right-radius: 4px; font-style: italic; font-size: 0.85rem; max-width: 100%;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0" style="color: var(--text-3);">
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                    <span style="color: var(--text-3);">This message has been recalled</span>
                </div>
            `;
        } else if (message.messageType === 2) {
            bubbleHtml = `
                <div class="chat-bubble sent d-inline-block p-1 shadow-sm position-relative chat-image-container" style="background-color: var(--primary); border-radius: 16px; border-bottom-right-radius: 4px; max-width: 100%; overflow: hidden;">
                    <img src="${escapeHtml(message.content)}" alt="Image" class="rounded img-fluid" style="max-height: 280px; max-width: 100%; object-fit: cover; cursor: pointer; display: block; ${isPending ? 'opacity: 0.85;' : ''}" onclick="openImageModal('${escapeHtml(message.content)}')" loading="lazy" />
                    ${isPending ? `
                        <div class="upload-pending-badge position-absolute bottom-0 end-0 m-2 px-2 py-1 rounded-pill bg-black bg-opacity-75 text-white d-flex align-items-center gap-1 shadow-sm" style="font-size: 0.65rem; backdrop-filter: blur(4px);">
                            <span class="spinner-border spinner-border-sm" style="width: 10px; height: 10px; border-width: 1.5px;" role="status"></span>
                            <span>Sending...</span>
                        </div>
                    ` : ''}
                </div>
            `;
        } else if (message.messageType === 3 && typeof renderFileBubble === 'function') {
            bubbleHtml = renderFileBubble(message, true, isPending);
        } else if (message.messageType === 5 && typeof renderVoiceBubble === 'function') {
            bubbleHtml = renderVoiceBubble(message, true, isPending);
        } else if (message.messageType === 6 && typeof renderVideoBubble === 'function') {
            bubbleHtml = renderVideoBubble(message, true, isPending);
        } else if (message.messageType === 7) {
            bubbleHtml = renderCallRecordBubble(message, true);
        } else {
            bubbleHtml = `
                <div class="chat-bubble sent d-inline-block text-start px-3 py-2 shadow-sm" style="background-color: var(--primary); color: white; border-radius: 18px; border-bottom-right-radius: 4px; word-break: break-word; max-width: 100%;">
                    ${escapeHtml(message.content)}
                </div>
            `;
        }

        const sentDate = parseDate(message.sentAt);
        const diffMs = Date.now() - sentDate.getTime();
        const isWithin5Hours = diffMs <= 5 * 60 * 60 * 1000;
        const canRecall = !message.isRecalled && !isPending && message.id && isWithin5Hours && message.messageType !== 7;

        const actionMenuHtml = canRecall ? `
            <div class="msg-action-menu dropdown">
                <button class="btn btn-msg-more p-0" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="More options">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.8"/>
                        <circle cx="12" cy="12" r="1.8"/>
                        <circle cx="12" cy="19" r="1.8"/>
                    </svg>
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow border-0 py-1" style="background: var(--surface-2); border: 1px solid var(--border) !important; border-radius: 12px; min-width: 130px; z-index: 1050;">
                    <li>
                        <button class="dropdown-item d-flex align-items-center gap-2 py-2 px-3 text-danger" type="button" onclick="promptRecallMessage('${message.id}')" style="font-size: 0.85rem; font-weight: 500;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="1 4 1 10 7 10"></polyline>
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                            </svg>
                            <span>Recall</span>
                        </button>
                    </li>
                </ul>
            </div>
        ` : '';

        wrapper.innerHTML = `
            ${actionMenuHtml}
            <div class="message-bubble-group text-end" style="max-width: 75%;">
                ${bubbleHtml}
                <div class="mt-1 me-1 time-container">
                    <small class="text-muted" style="font-size: 0.7rem;">${timeStr}</small>
                </div>
            </div>
        `;
    } else {
        wrapper.className = 'd-flex align-items-end gap-2 mb-3';
        let initial = message.senderName ? message.senderName.charAt(0).toUpperCase() : '?';
        let bubbleHtml = '';
        if (message.isRecalled) {
            bubbleHtml = `
                <div class="chat-bubble recalled d-inline-flex align-items-center gap-2 px-3 py-2 text-muted shadow-sm" style="background-color: var(--surface); border: 1px dashed var(--border); border-radius: 16px; border-bottom-left-radius: 4px; font-style: italic; font-size: 0.85rem; max-width: 80%;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0" style="color: var(--text-3);">
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                    <span style="color: var(--text-3);">This message has been recalled</span>
                </div>
            `;
        } else if (message.messageType === 2) {
            bubbleHtml = `<div class="chat-bubble received d-inline-block p-1 shadow-sm" style="background-color: var(--msg-in-bg); border-radius: 16px; border-bottom-left-radius: 4px; max-width: 80%; border: 1px solid var(--border); overflow: hidden;">
                 <img src="${escapeHtml(message.content)}" alt="Image" class="rounded img-fluid" style="max-height: 280px; max-width: 100%; object-fit: cover; cursor: pointer; display: block;" onclick="openImageModal('${escapeHtml(message.content)}')" loading="lazy" />
               </div>`;
        } else if (message.messageType === 3 && typeof renderFileBubble === 'function') {
            bubbleHtml = renderFileBubble(message, false, false);
        } else if (message.messageType === 5 && typeof renderVoiceBubble === 'function') {
            bubbleHtml = renderVoiceBubble(message, false, false);
        } else if (message.messageType === 6 && typeof renderVideoBubble === 'function') {
            bubbleHtml = renderVideoBubble(message, false, false);
        } else if (message.messageType === 7) {
            bubbleHtml = renderCallRecordBubble(message, false);
        } else {
            bubbleHtml = `<div class="chat-bubble received d-inline-block text-start px-3 py-2 shadow-sm" style="background-color: var(--msg-in-bg); color: var(--text); border-radius: 18px; border-bottom-left-radius: 4px; overflow-wrap: break-word; word-break: break-word; border: 1px solid var(--border);">
                 ${escapeHtml(message.content)}
               </div>`;
        }

        let avatarUrl = message.senderAvatarUrl || message.senderAvatar;
        if (!avatarUrl && currentConversation && currentConversation.members) {
            const memberMatch = currentConversation.members.find(m => m.userId && message.senderId && m.userId.toLowerCase() === message.senderId.toLowerCase());
            if (memberMatch && memberMatch.avatarUrl) {
                avatarUrl = memberMatch.avatarUrl;
            }
        }

        let avatarElHtml = '';
        if (avatarUrl) {
            avatarElHtml = `
                <div class="contact-avatar shadow-sm flex-shrink-0" style="width: 32px; height: 32px; border-radius: 50%; overflow: hidden;">
                    <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(message.senderName || 'User')}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'d-flex align-items-center justify-content-center w-100 h-100\\' style=\\'background: #3b82f6; color: white; font-size: 0.8rem; font-weight: bold;\\'>${escapeHtml(initial)}</div>';" />
                </div>
            `;
        } else {
            avatarElHtml = `
                <div class="contact-avatar d-flex align-items-center justify-content-center flex-shrink-0 shadow-sm" style="width: 32px; height: 32px; border-radius: 50%; background: #3b82f6; color: white; font-size: 0.8rem; font-weight: bold;">
                    ${escapeHtml(initial)}
                </div>
            `;
        }

        wrapper.innerHTML = `
            ${avatarElHtml}
            <div style="flex: 1; max-width: 80%;">
                <small class="text-muted mb-1 ms-2 d-block" style="font-size: 0.75rem; font-weight: 600;">${escapeHtml(message.senderName || 'User')}</small>
                ${bubbleHtml}
                <div class="mt-1 ms-2">
                    <small class="text-muted" style="font-size: 0.7rem;">${timeStr}</small>
                </div>
            </div>
        `;
    }
    
    chatBody.appendChild(wrapper);
    chatBody.scrollTop = chatBody.scrollHeight;
}

function sendMessage() {
    if (!currentConversationId) return;

    // If staged image exists -> send along
    if (typeof stagedImageFile !== 'undefined' && stagedImageFile && typeof confirmAndSendStagedImage === 'function') {
        confirmAndSendStagedImage();
    }

    // If staged file exists -> send along
    if (typeof stagedFile !== 'undefined' && stagedFile && typeof confirmAndSendStagedFile === 'function') {
        confirmAndSendStagedFile();
    }

    // If staged video exists -> send along
    if (typeof stagedVideoFile !== 'undefined' && stagedVideoFile && typeof confirmAndSendStagedVideo === 'function') {
        confirmAndSendStagedVideo();
    }

    const input = document.getElementById('chatInput');
    const text = input ? input.value.trim() : '';
    if (!text) return;
    
    if (input) input.value = '';
    
    if (connection && connection.state === signalR.HubConnectionState.Connected) {
        connection.invoke("SendMessage", currentConversationId, text)
        .catch(err => {
            console.error("SendMessage Error:", err);
            if (typeof showToast === 'function') {
                showToast("Error sending message: " + (err.message || err), "error");
            }
        });
    } else {
        console.error("SignalR is not connected.");
    }
}

// ==========================================
// 4. UTILITIES
// ==========================================

function parseDate(dateInput) {
    if (!dateInput) return new Date();
    if (dateInput instanceof Date) return dateInput;
    let s = String(dateInput);
    if (!s.endsWith('Z') && !s.includes('+') && !s.includes('GMT')) {
        s += 'Z';
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date(dateInput) : d;
}
window.parseDate = parseDate;

function formatTime(dateString) {
    if (!dateString) return '';
    const date = parseDate(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLastSeen(dateInput) {
    if (!dateInput) return 'Offline';
    const date = parseDate(dateInput);
    if (isNaN(date.getTime())) return 'Offline';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) {
        return 'Active just now';
    }

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffSec < 60) {
        return 'Active just now';
    }
    if (diffMin < 60) {
        return `Active ${diffMin}m ago`;
    }

    const isSameDay = date.getDate() === now.getDate() &&
                      date.getMonth() === now.getMonth() &&
                      date.getFullYear() === now.getFullYear();

    if (isSameDay) {
        return `Active ${diffHour}h ago`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.getDate() === yesterday.getDate() &&
                        date.getMonth() === yesterday.getMonth() &&
                        date.getFullYear() === yesterday.getFullYear();

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    if (isYesterday) {
        return `Active yesterday at ${hours}:${minutes}`;
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `Active on ${day}/${month}/${year}`;
}
window.formatLastSeen = formatLastSeen;

function updateChatHeaderPresence(conv) {
    const currentSub = document.getElementById('currentChatSubtitle');
    const avatarEl = document.getElementById('currentChatAvatar');
    if (!conv) return;

    const isGroup = conv.type === 2;
    if (isGroup) {
        if (currentSub) {
            currentSub.className = 'chat-topbar-sub is-group';
            currentSub.innerText = `👥 ${conv.memberCount || 1} members`;
        }
        if (avatarEl) {
            avatarEl.classList.remove('online');
        }
        return;
    }

    const otherMember = conv.members && currentUserId
        ? conv.members.find(m => m.userId && m.userId.toLowerCase() !== currentUserId.toLowerCase())
        : null;

    if (!otherMember) {
        if (currentSub) {
            currentSub.className = 'chat-topbar-sub is-offline';
            currentSub.innerText = 'Offline';
        }
        if (avatarEl) {
            avatarEl.classList.remove('online');
        }
        return;
    }

    if (otherMember.isOnline) {
        if (currentSub) {
            currentSub.className = 'chat-topbar-sub is-online';
            currentSub.innerText = 'Online';
        }
        if (avatarEl) {
            avatarEl.classList.add('online');
        }
    } else {
        if (currentSub) {
            currentSub.className = 'chat-topbar-sub is-offline';
            currentSub.innerText = formatLastSeen(otherMember.lastSeenAt);
        }
        if (avatarEl) {
            avatarEl.classList.remove('online');
        }
    }
}
window.updateChatHeaderPresence = updateChatHeaderPresence;

function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '0 KB';
    if (bytes >= 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    return (bytes / 1024).toFixed(1) + ' KB';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

// ==========================================
// 5. MESSAGE RECALL
// ==========================================

function attachRecallMenu(wrapper, messageId, sentAt) {
    if (!wrapper || !messageId) return;
    wrapper.dataset.msgId = messageId;

    // Check if message is already recalled
    if (wrapper.querySelector('.chat-bubble.recalled')) return;

    // Check 5 hours limit
    if (sentAt) {
        const sentDate = parseDate(sentAt);
        const diffMs = Date.now() - sentDate.getTime();
        if (diffMs > 5 * 60 * 60 * 1000) return;
    }

    // If menu already exists, ensure onclick has current messageId and return
    const existingMenu = wrapper.querySelector('.msg-action-menu');
    if (existingMenu) {
        const recallBtn = existingMenu.querySelector('button.dropdown-item');
        if (recallBtn) {
            recallBtn.setAttribute('onclick', `promptRecallMessage('${messageId}')`);
        }
        return;
    }

    // Only sent messages by current user get recall menu
    const isSent = wrapper.classList.contains('sent') || wrapper.classList.contains('message-row');
    if (!isSent) return;

    const actionMenu = document.createElement('div');
    actionMenu.className = 'msg-action-menu dropdown';
    actionMenu.innerHTML = `
        <button class="btn btn-msg-more p-0" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="More options">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.8"/>
                <circle cx="12" cy="12" r="1.8"/>
                <circle cx="12" cy="19" r="1.8"/>
            </svg>
        </button>
        <ul class="dropdown-menu dropdown-menu-end shadow border-0 py-1" style="background: var(--surface-2); border: 1px solid var(--border) !important; border-radius: 12px; min-width: 130px; z-index: 1050;">
            <li>
                <button class="dropdown-item d-flex align-items-center gap-2 py-2 px-3 text-danger" type="button" onclick="promptRecallMessage('${messageId}')" style="font-size: 0.85rem; font-weight: 500;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                    <span>Recall</span>
                </button>
            </li>
        </ul>
    `;

    const target = wrapper.querySelector('.message-bubble-group') || wrapper.firstChild;
    if (target) {
        wrapper.insertBefore(actionMenu, target);
    } else {
        wrapper.appendChild(actionMenu);
    }
}
window.attachRecallMenu = attachRecallMenu;

let pendingRecallMessageId = null;

function promptRecallMessage(messageId) {
    if (!messageId) return;
    pendingRecallMessageId = messageId;

    const modalEl = document.getElementById('recallMessageModal');
    if (modalEl && typeof bootstrap !== 'undefined') {
        if (modalEl.parentElement !== document.body) {
            document.body.appendChild(modalEl);
        }
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    } else {
        if (confirm("Are you sure you want to recall this message? The message and any attachments will be permanently removed for everyone.")) {
            executeRecallMessage(messageId);
        }
    }
}
window.promptRecallMessage = promptRecallMessage;

async function executeRecallMessage(messageId) {
    if (!messageId || !currentConversationId) return;

    const btnConfirm = document.getElementById('btnConfirmRecall');
    const btnText = document.getElementById('btnConfirmRecallText');
    const btnSpinner = document.getElementById('btnConfirmRecallSpinner');

    if (btnText) btnText.innerText = "Recalling...";
    if (btnSpinner) btnSpinner.classList.remove('d-none');
    if (btnConfirm) btnConfirm.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/conversation/${currentConversationId}/messages/${messageId}/recall`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok) {
            if (typeof showToast === 'function') {
                showToast("Message recalled successfully.", "success");
            }
            // Close modal if open
            const modalEl = document.getElementById('recallMessageModal');
            if (modalEl && typeof bootstrap !== 'undefined') {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }
        } else {
            const errorMsg = data?.message || "Failed to recall message.";
            if (typeof showToast === 'function') {
                showToast(errorMsg, "error");
            } else {
                alert(errorMsg);
            }
        }
    } catch (err) {
        console.error("Recall message error:", err);
        if (typeof showToast === 'function') {
            showToast("Connection error while recalling message.", "error");
        }
    } finally {
        if (btnText) btnText.innerText = "Recall";
        if (btnSpinner) btnSpinner.classList.add('d-none');
        if (btnConfirm) btnConfirm.disabled = false;
        pendingRecallMessageId = null;
    }
}
window.executeRecallMessage = executeRecallMessage;

// Listen for recall confirmation button click
document.addEventListener("DOMContentLoaded", function () {
    const btnConfirm = document.getElementById('btnConfirmRecall');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', function () {
            if (pendingRecallMessageId) {
                executeRecallMessage(pendingRecallMessageId);
            }
        });
    }
});

// ==========================================
// 6. CALL RECORD BUBBLE RENDERER
// ==========================================

function renderCallRecordBubble(message, isMe) {
    let callType = 'audio';
    let status = 'completed';
    let duration = 0;

    try {
        const cObj = typeof message.content === 'object' ? message.content : JSON.parse(message.content);
        if (cObj) {
            callType = (cObj.callType || 'audio').toLowerCase();
            status = (cObj.status || 'completed').toLowerCase();
            duration = parseInt(cObj.duration, 10) || 0;
        }
    } catch {
        callType = 'audio';
    }

    const isVideo = callType === 'video';
    const isMissed = status === 'missed';
    const isDeclined = status === 'declined';
    const isCompleted = status === 'completed';

    const title = isVideo ? 'Video call' : 'Audio call';
    let detailText = '';
    if (isCompleted) {
        const mins = Math.floor(duration / 60);
        const secs = duration % 60;
        if (mins > 0) {
            detailText = `${mins}m ${secs}s`;
        } else {
            detailText = `${secs}s`;
        }
    } else if (isDeclined) {
        detailText = 'Call declined';
    } else {
        detailText = isMe ? 'Outgoing call (No answer)' : 'Missed call';
    }

    const iconBoxClass = `${callType} ${status}`;
    let iconSvg = '';
    if (isVideo) {
        iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
    } else {
        iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.89 12 19.79 19.79 0 0 1 1.93 3.62 2 2 0 0 1 3.91 1.45h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
    }

    return `
        <div class="call-record-card">
            <div class="call-record-icon-box ${iconBoxClass}">
                ${iconSvg}
            </div>
            <div class="text-start">
                <div class="call-record-title">${title}</div>
                <div class="call-record-detail ${status}">${detailText}</div>
            </div>
            <button type="button" class="btn-call-back" onclick="if (typeof startCall === 'function') startCall('${callType}');" title="Call back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.89 12 19.79 19.79 0 0 1 1.93 3.62 2 2 0 0 1 3.91 1.45h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
            </button>
        </div>
    `;
}
window.renderCallRecordBubble = renderCallRecordBubble;
