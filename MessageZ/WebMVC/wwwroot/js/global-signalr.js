/**
 * global-signalr.js
 * Manages background SignalR connectivity and incoming call handling across main layout pages (Home, Profile, etc.)
 */

(function () {
    // Only initialize if token exists and not already connected by chat.js
    const token = window.appData?.token;
    if (!token) return;

    if (window.connection && window.connection.state === 'Connected') {
        return;
    }

    const connection = new signalR.HubConnectionBuilder()
        .withUrl("https://5tzv6cx5-7088.asse.devtunnels.ms/chatHub", {
            accessTokenFactory: () => token
        })
        .withAutomaticReconnect()
        .build();

    window.connection = connection;

    // Toast notification for incoming messages while browsing non-chat pages
    connection.on("ReceiveMessage", function (message) {
        if (typeof showToast !== 'function') return;

        // Skip call records
        if (message.messageType === 7) return;

        const senderName = message.senderName || 'Someone';
        let preview = message.content || '';

        if (message.messageType === 2) preview = '[Image]';
        else if (message.messageType === 3) preview = '[Attachment]';
        else if (message.messageType === 4) preview = message.content;
        else if (message.messageType === 5) preview = '[Voice message]';
        else if (message.messageType === 6) preview = '[Video]';

        showToast(`<b>${senderName}</b>: ${preview}`, 'info');
    });

    connection.start().then(function () {
        console.log("[GlobalSignalR] Connected to ChatHub on main layout.");
        if (window.initWebRTC) {
            window.initWebRTC(connection);
        }
    }).catch(function (err) {
        console.error("[GlobalSignalR] ChatHub connection error:", err);
    });
})();
