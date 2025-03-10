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
        ws = new WebSocket('ws://localhost:5000');
        ws.binaryType = 'arraybuffer';  // Set binary type to arraybuffer

        ws.onopen = () => {
            console.log('WebSocket connected to test server');
            broadcastToDevTools({ type: 'WS_CONNECTED' });
        };

        ws.onmessage = (event) => {
            console.log('WebSocket message received');
            // Convert data to ArrayBuffer if needed
            let data = event.data;
            if (data instanceof Blob) {
                data.arrayBuffer().then(buffer => {
                    broadcastToDevTools({ 
                        type: 'WS_MESSAGE', 
                        data: buffer
                    });
                });
            } else {
                broadcastToDevTools({ 
                    type: 'WS_MESSAGE', 
                    data: data
                });
            }
        };

        ws.onerror = (error) => {
            console.log('WebSocket error:', error);
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