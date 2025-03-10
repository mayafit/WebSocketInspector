// Debug logging function
function debugLog(message, data = null) {
    const logMessage = data ? `${message}: ${JSON.stringify(data)}` : message;
    console.log(logMessage);
    chrome.runtime.sendMessage({
        type: 'DEBUG_LOG',
        data: logMessage
    });
}

// Specific decoder for our TestMessage type
const TestMessageDecoder = {
    decode: function(buffer) {
        const view = new DataView(buffer);
        let offset = 0;
        const result = {};

        while (offset < buffer.byteLength) {
            const tag = view.getUint8(offset);
            offset += 1;
            const fieldNum = tag >> 3;
            const wireType = tag & 0x7;

            switch(fieldNum) {
                case 1: // text field
                    const textLength = view.getUint32(offset, true);
                    offset += 4;
                    const textBytes = new Uint8Array(buffer, offset, textLength);
                    result.text = new TextDecoder().decode(textBytes);
                    offset += textLength;
                    break;
                case 2: // number field
                    result.number = view.getInt32(offset, true);
                    offset += 4;
                    break;
                case 3: // flag field
                    result.flag = Boolean(view.getUint8(offset));
                    offset += 1;
                    break;
                case 4: // created_at field (timestamp)
                    result.created_at = {
                        seconds: view.getBigInt64(offset, true).toString(),
                        nanos: view.getInt32(offset + 8, true)
                    };
                    offset += 12;
                    break;
                default:
                    // Skip unknown fields
                    offset = this.skipField(buffer, offset, wireType);
            }
        }
        return result;
    },

    skipField: function(buffer, offset, wireType) {
        const view = new DataView(buffer);
        switch(wireType) {
            case 0: // Varint
                while (view.getUint8(offset) & 0x80) offset++;
                return offset + 1;
            case 1: // 64-bit
                return offset + 8;
            case 2: // Length-delimited
                const length = view.getUint32(offset, true);
                return offset + 4 + length;
            case 5: // 32-bit
                return offset + 4;
            default:
                throw new Error(`Unknown wire type: ${wireType}`);
        }
    }
};

class WebSocketDebugger {
    constructor() {
        debugLog('Initializing WebSocket Debugger');
        alert('Debug: Initializing WebSocket Debugger'); // Debug popup

        this.messages = [];
        this.port = null;

        // Initialize UI elements
        this.initializeUI();
        this.connectToBackgroundScript();
    }

    initializeUI() {
        debugLog('Starting UI initialization');
        alert('Debug: Starting UI initialization'); // Debug popup

        // Get UI elements
        this.errorDisplay = document.getElementById('errorDisplay');
        this.messageListContainer = document.getElementById('messageList');
        this.messageDetailContainer = document.getElementById('messageDetail');

        // Verify all required elements exist
        if (!this.errorDisplay || !this.messageListContainer || !this.messageDetailContainer) {
            const error = 'Required UI elements not found';
            debugLog('Error:', error);
            alert('Debug: Required UI elements not found'); // Debug popup
            throw new Error(error);
        }

        debugLog('UI initialization complete');
    }

    connectToBackgroundScript() {
        debugLog('Connecting to background script');
        this.port = chrome.runtime.connect({ name: "websocket-panel" });

        this.port.onMessage.addListener((message) => {
            debugLog('Received message from background script:', message);

            switch(message.type) {
                case 'WS_CONNECTED':
                    debugLog('WebSocket connected');
                    this.showError('');  // Clear any error messages
                    break;

                case 'WS_MESSAGE':
                    debugLog('WebSocket message received');
                    this.handleWebSocketMessage(message.data);
                    break;

                case 'WS_ERROR':
                    debugLog('WebSocket error:', message.error);
                    this.showError(message.error);
                    break;

                case 'WS_CLOSED':
                    debugLog('WebSocket closed');
                    this.showError('WebSocket connection closed. Attempting to reconnect...');
                    break;
            }
        });
    }

    showError(message) {
        debugLog('Error:', message);
        if (this.errorDisplay) {
            this.errorDisplay.textContent = message;
            this.errorDisplay.style.display = message ? 'block' : 'none';
        }
    }

    async handleWebSocketMessage(data) {
        try {
            debugLog('Handling WebSocket message');
            const message = {
                timestamp: new Date().toISOString(),
                rawData: data instanceof ArrayBuffer ?
                    new Uint8Array(data) :
                    data instanceof Blob ?
                        new Uint8Array(await data.arrayBuffer()) :
                        this.parseMessageData(data),
                decoded: null
            };

            try {
                message.decoded = TestMessageDecoder.decode(message.rawData.buffer);
                debugLog('Message decoded successfully:', message.decoded);
            } catch (error) {
                debugLog('Failed to decode message:', error);
                this.showError(`Failed to decode message: ${error.message}`);
            }

            this.messages.push(message);
            this.updateMessageList();
            debugLog('Message processed and list updated');
        } catch (error) {
            debugLog('Error handling WebSocket message:', error);
            this.showError(`Failed to process message: ${error.message}`);
        }
    }

    parseMessageData(data) {
        if (data instanceof ArrayBuffer) {
            return new Uint8Array(data);
        } else if (typeof data === 'string') {
            try {
                // Try to parse as base64
                const binary = atob(data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                return bytes;
            } catch (e) {
                // If not base64, return as string
                return data;
            }
        }
        return data;
    }

    updateMessageList() {
        debugLog('Updating message list');
        this.messageListContainer.innerHTML = '';

        this.messages.forEach((message, index) => {
            const messageElement = document.createElement('div');
            messageElement.className = 'message-item';

            const timestamp = new Date(message.timestamp).toLocaleTimeString();
            let displayText = `Message ${index + 1} - ${timestamp}`;

            if (message.decoded) {
                displayText += ' (Decoded)';
                messageElement.style.color = '#2196F3';
            }

            messageElement.textContent = displayText;
            messageElement.onclick = () => {
                debugLog('Message clicked:', { index });
                this.showMessageDetail(message);
            };

            this.messageListContainer.appendChild(messageElement);
        });
    }

    showMessageDetail(message) {
        try {
            if (message.decoded) {
                this.messageDetailContainer.innerHTML = `
                    <h4>Decoded Message:</h4>
                    <pre>${JSON.stringify(message.decoded, null, 2)}</pre>
                    <h4>Raw Data:</h4>
                    <pre>${JSON.stringify(Array.from(message.rawData), null, 2)}</pre>`;
            } else {
                this.messageDetailContainer.textContent = 'Failed to decode message';
            }
        } catch (error) {
            debugLog('Error showing message detail:', error);
            this.messageDetailContainer.textContent = `Error: ${error.message}`;
        }
    }
}

// Initialize the debugger
function initializeDebugger() {
    debugLog('Starting debugger initialization');
    alert('Debug: Starting debugger initialization'); // Debug popup
    try {
        new WebSocketDebugger();
        debugLog('WebSocket Debugger initialized successfully');
        alert('Debug: WebSocket Debugger initialized successfully'); // Debug popup
    } catch (error) {
        console.error('Error initializing WebSocket Debugger:', error);
        alert(`Debug: Initialization error - ${error.message}`); // Debug popup
        const errorDisplay = document.getElementById('errorDisplay');
        if (errorDisplay) {
            errorDisplay.style.display = 'block';
            errorDisplay.textContent = `Error: ${error.message}. Please refresh the page.`;
        }
    }
}

// Run initialization based on document ready state
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDebugger);
} else {
    initializeDebugger();
}