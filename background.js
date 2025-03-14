chrome.runtime.onInstalled.addListener(() => {
    console.log("WebSocket Proto Debugger installed");
});

// WebSocket connection management
let ws = null;
let activeConnections = new Set();

// Connect to WebSocket server
function connectWebSocket() {
    if (ws) {
        ws.close();
    }

    try {
        console.log('Attempting to connect to WebSocket server at ws://localhost:5000');
        ws = new WebSocket('ws://localhost:5000', [], {
            headers: {
                'Upgrade': 'websocket',
                'Connection': 'Upgrade',
                'Sec-WebSocket-Version': '13',
                'Origin': chrome.runtime.getURL('')
            }
        });
        ws.binaryType = 'arraybuffer';  // Set binary type to arraybuffer

        ws.onopen = () => {
            console.log('WebSocket connected to test server');
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
                data: Array.from(uint8Array)  // Convert to regular array for serialization
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
            // Attempt to reconnect after a delay
            setTimeout(connectWebSocket, 2000);
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

        // Start WebSocket connection if not already connected
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connectWebSocket();
        }

        port.onDisconnect.addListener(() => {
            console.log('DevTools panel disconnected');
            activeConnections.delete(port);

            // Close WebSocket if no active connections
            if (activeConnections.size === 0 && ws) {
                ws.close();
                ws = null;
            }
        });
    }
});