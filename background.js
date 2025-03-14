chrome.runtime.onInstalled.addListener(() => {
    console.log("WebSocket Proto Debugger installed");
});

// WebSocket connection management
let ws = null;
let activeConnections = new Set();
let currentServer = null;

// Connect to WebSocket server
function connectWebSocket(host, port) {
    if (ws) {
        ws.close();
        ws = null;
    }

    try {
        const serverUrl = `ws://${host}:${port}`;
        console.log('Attempting to connect to WebSocket server at', serverUrl);
        
        ws = new WebSocket(serverUrl);
        ws.binaryType = 'arraybuffer';
        currentServer = { host, port };

        ws.onopen = () => {
            console.log('WebSocket connected to server');
            broadcastToDevTools({ type: 'WS_CONNECTED' });
        };

        ws.onmessage = (event) => {
            console.log('WebSocket message received:', {
                dataType: typeof event.data,
                isArrayBuffer: event.data instanceof ArrayBuffer,
                isBlob: event.data instanceof Blob,
                byteLength: event.data instanceof ArrayBuffer ? event.data.byteLength : 'N/A'
            });

            if (!(event.data instanceof ArrayBuffer)) {
                console.error('Unexpected data type:', typeof event.data);
                broadcastToDevTools({ 
                    type: 'WS_ERROR', 
                    error: `Unexpected data type: ${typeof event.data}` 
                });
                return;
            }

            // Convert ArrayBuffer to Array for message passing
            const uint8Array = new Uint8Array(event.data);
            broadcastToDevTools({ 
                type: 'WS_MESSAGE', 
                data: Array.from(uint8Array)
            });
        };

        ws.onerror = (error) => {
            console.log('WebSocket error:', {
                error: error,
                readyState: ws.readyState,
                url: ws.url
            });
            broadcastToDevTools({ 
                type: 'WS_ERROR', 
                error: 'Failed to connect to WebSocket server' 
            });
        };

        ws.onclose = () => {
            console.log('WebSocket connection closed');
            broadcastToDevTools({ type: 'WS_CLOSED' });
            currentServer = null;
        };
    } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        broadcastToDevTools({ 
            type: 'WS_ERROR', 
            error: `Connection error: ${error.message}` 
        });
    }
}

// Broadcast message to all active DevTools connections
function broadcastToDevTools(message) {
    console.log('Broadcasting to DevTools:', {
        type: message.type,
        dataLength: message.data ? message.data.length : 'N/A',
        isArray: message.data ? Array.isArray(message.data) : false
    });

    activeConnections.forEach(port => {
        try {
            port.postMessage(message);
        } catch (error) {
            console.error('Error sending message to DevTools:', error);
            activeConnections.delete(port);
        }
    });
}

// Handle connections from DevTools panels
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "websocket-panel") {
        console.log('DevTools panel connected');
        activeConnections.add(port);

        // Handle messages from the DevTools panel
        port.onMessage.addListener((message) => {
            switch (message.type) {
                case 'CONNECT':
                    connectWebSocket(message.host, message.port);
                    break;

                case 'GET_CHANNELS':
                    // For now, simulate channel detection
                    // In a real implementation, this would query the server
                    broadcastToDevTools({
                        type: 'WS_CHANNELS',
                        channels: ['/ws', '/websocket', '/socket']
                    });
                    break;

                case 'SUBSCRIBE':
                    // Handle channel subscription
                    console.log('Subscribing to channel:', message.channel);
                    // Implement channel subscription logic here
                    break;
            }
        });

        port.onDisconnect.addListener(() => {
            console.log('DevTools panel disconnected');
            activeConnections.delete(port);

            // Close WebSocket if no active connections
            if (activeConnections.size === 0 && ws) {
                ws.close();
                ws = null;
                currentServer = null;
            }
        });
    }
});
