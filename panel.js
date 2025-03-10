// Debug logging function
function debugLog(message, data = null) {
    const logMessage = data ? `${message}: ${JSON.stringify(data)}` : message;
    console.log(logMessage);
    chrome.runtime.sendMessage({
        type: 'DEBUG_LOG',
        data: logMessage
    });
}

class WebSocketDebugger {
    constructor() {
        debugLog('Initializing WebSocket Debugger');
        alert('Debug: Initializing WebSocket Debugger'); // Debug popup

        this.messages = [];
        this.protoRoot = null;
        this.selectedMessageType = null;
        this.activeConnections = new Map();

        // Initialize UI elements
        this.initializeUI();
        this.setupWebSocketListener();
    }

    verifyProtobuf() {
        debugLog('Verifying protobuf availability');
        if (typeof protobuf === 'undefined') {
            debugLog('Error: Protobuf is undefined');
            return false;
        }
        try {
            // Try to access some protobuf functionality to verify it's working
            const test = protobuf.util;
            debugLog('Protobuf verified successfully');
            return true;
        } catch (error) {
            debugLog('Error verifying protobuf:', error);
            return false;
        }
    }

    initializeUI() {
        debugLog('Starting UI initialization');
        alert('Debug: Starting UI initialization'); // Debug popup

        // Get UI elements
        const loadButton = document.getElementById('loadProto');
        const fileInput = document.getElementById('protoFile');
        this.errorDisplay = document.getElementById('errorDisplay');
        this.messageTypeSelect = document.getElementById('messageTypeSelect');
        this.messageListContainer = document.getElementById('messageList');
        this.messageDetailContainer = document.getElementById('messageDetail');

        // Verify all required elements exist
        if (!loadButton || !fileInput || !this.errorDisplay ||
            !this.messageTypeSelect || !this.messageListContainer ||
            !this.messageDetailContainer) {
            const error = 'Required UI elements not found';
            debugLog('Error:', error);
            alert('Debug: Required UI elements not found'); // Debug popup
            throw new Error(error);
        }

        // Direct event listener for button click
        loadButton.addEventListener('click', async (event) => {
            event.preventDefault();
            debugLog('Load Proto button clicked');
            alert('Debug: Button clicked'); // Debug popup

            // If no file is selected, trigger file input click
            if (fileInput.files.length === 0) {
                debugLog('No file selected, triggering file input');
                alert('Debug: No file selected, opening file dialog'); // Debug popup
                fileInput.click();
                return;
            }

            try {
                // Visual feedback
                loadButton.disabled = true;
                loadButton.textContent = 'Loading...';

                const file = fileInput.files[0];
                debugLog('Processing selected file:', { name: file.name });
                alert(`Debug: Processing file: ${file.name}`); // Debug popup

                await this.loadProtoFile(file);
                debugLog('File processed successfully');

                // Success feedback
                loadButton.textContent = 'Proto File Loaded';
                alert('Debug: Proto file loaded successfully'); // Debug popup
                setTimeout(() => {
                    loadButton.textContent = 'Load Proto File';
                }, 2000);
            } catch (error) {
                debugLog('Error processing file:', error);
                alert(`Debug: Error loading file: ${error.message}`); // Debug popup
                this.showError(`Failed to load proto file: ${error.message}`);
                loadButton.textContent = 'Load Proto File';
            } finally {
                loadButton.disabled = false;
            }
        });

        // File input change handler
        fileInput.addEventListener('change', () => {
            debugLog('File input changed');
            alert('Debug: File input changed'); // Debug popup
            const file = fileInput.files[0];
            if (file) {
                debugLog('File selected:', { name: file.name });
                // Enable the button and clear any previous errors
                loadButton.disabled = false;
                this.errorDisplay.style.display = 'none';
            } else {
                debugLog('No file selected');
                loadButton.disabled = true;
            }
        });

        // Message type selection handler
        this.messageTypeSelect.addEventListener('change', (e) => {
            this.selectedMessageType = e.target.value;
            debugLog('Selected message type:', { type: this.selectedMessageType });
            this.updateMessageList();
        });

        // Set initial button state
        loadButton.disabled = fileInput.files.length === 0;
        debugLog('UI initialization complete');
    }

    showError(message) {
        debugLog('Error:', message);
        if (this.errorDisplay) {
            this.errorDisplay.textContent = message;
            this.errorDisplay.style.display = 'block';
        }
    }

    async loadProtoFile(file) {
        if (!this.verifyProtobuf()) {
            throw new Error('Protobuf library not available. Please refresh the page.');
        }

        try {
            debugLog('Starting to load proto file');
            const content = await file.text();
            debugLog('Proto file content loaded, parsing...');

            const parsed = await protobuf.parse(content);
            if (!parsed || !parsed.root) {
                throw new Error('Failed to parse proto file: Invalid format');
            }

            this.protoRoot = parsed.root;
            debugLog('Proto file parsed successfully');

            // Clear any previous errors
            this.errorDisplay.style.display = 'none';

            // Update UI with message types
            this.populateMessageTypes(this.protoRoot);

            // Enable message type selector
            this.messageTypeSelect.disabled = false;
            debugLog('Message type selector enabled');

        } catch (error) {
            debugLog('Error loading proto file:', error);
            throw error;
        }
    }

    populateMessageTypes(root) {
        debugLog('Populating message types...');

        // Clear existing options except the default one
        while (this.messageTypeSelect.options.length > 1) {
            this.messageTypeSelect.remove(1);
        }

        // Add all message types from the proto file
        const messageTypes = [];
        root.nestedArray.forEach(type => {
            if (type.fieldsArray) {
                messageTypes.push(type.fullName);
            }
        });

        messageTypes.sort().forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            this.messageTypeSelect.appendChild(option);
        });

        debugLog('Found message types:', messageTypes);

        // Select first message type if available
        if (messageTypes.length > 0) {
            this.messageTypeSelect.value = messageTypes[0];
            this.selectedMessageType = messageTypes[0];
            debugLog('Auto-selected first message type:', { type: messageTypes[0] });
        }
    }

    setupWebSocketListener() {
        debugLog('Setting up WebSocket listener');
        alert('Debug: Setting up WebSocket listener'); // Debug popup

        const connectWebSocket = () => {
            try {
                debugLog('Attempting to connect to WebSocket server');
                const ws = new WebSocket('ws://localhost:5000');

                ws.binaryType = 'arraybuffer'; // Ensure proper binary data handling

                ws.onopen = () => {
                    debugLog('WebSocket connection established to test server');
                    alert('Debug: WebSocket connected to test server'); // Debug popup
                    this.showError(''); // Clear any previous error messages
                };

                ws.onmessage = async (event) => {
                    debugLog('WebSocket message received');
                    alert('Debug: Message received'); // Debug popup
                    await this.handleWebSocketMessage(event.data);
                };

                ws.onerror = (error) => {
                    debugLog('WebSocket error:', error);
                    alert(`Debug: WebSocket error occurred`); // Debug popup
                    this.showError(`WebSocket error: Failed to connect to server. Please ensure the test server is running.`);
                };

                ws.onclose = () => {
                    debugLog('WebSocket connection closed');
                    alert('Debug: WebSocket closed'); // Debug popup
                    // Attempt to reconnect after a delay
                    setTimeout(connectWebSocket, 2000);
                };

                this.activeConnections.set('test-server', ws);
            } catch (error) {
                debugLog('Error creating WebSocket connection:', error);
                alert(`Debug: Connection error - ${error.message}`); // Debug popup
                this.showError(`Failed to connect to WebSocket: ${error.message}`);
                // Attempt to reconnect after a delay
                setTimeout(connectWebSocket, 2000);
            }
        };

        // Start the connection
        connectWebSocket();

        // Clear connections on navigation
        chrome.devtools.network.onNavigated.addListener(() => {
            debugLog('Page navigated, clearing connections');
            this.activeConnections.forEach(ws => ws.close());
            this.activeConnections.clear();
            this.messages = [];
            this.updateMessageList();
        });
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

            debugLog('Raw data type:', typeof data, data instanceof ArrayBuffer, data instanceof Blob);
            debugLog('Converted data:', message.rawData);

            if (this.protoRoot && this.selectedMessageType) {
                try {
                    const MessageType = this.protoRoot.lookupType(this.selectedMessageType);
                    const decodedMessage = MessageType.decode(message.rawData);
                    message.decoded = MessageType.toObject(decodedMessage, {
                        longs: String,
                        enums: String,
                        bytes: String,
                        defaults: true
                    });
                    debugLog('Message decoded successfully:', message.decoded);
                } catch (error) {
                    debugLog('Failed to decode message:', error);
                    this.showError(`Failed to decode message: ${error.message}`);
                }
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
            } else if (!this.protoRoot || !this.selectedMessageType) {
                this.messageDetailContainer.textContent = 'Please load a proto file and select a message type';
            } else {
                this.messageDetailContainer.textContent = 'Failed to decode message with selected type';
            }
        } catch (error) {
            debugLog('Error showing message detail:', error);
            this.messageDetailContainer.textContent = `Error: ${error.message}`;
        }
    }

    async decodeProtobufMessage(data) {
        if (!this.protoRoot || !this.selectedMessageType) {
            throw new Error('Proto definition or message type not selected');
        }

        try {
            const MessageType = this.protoRoot.lookupType(this.selectedMessageType);
            const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
            return MessageType.decode(buffer).toJSON();
        } catch (error) {
            throw new Error(`Failed to decode message: ${error.message}`);
        }
    }
}

// Initialize the debugger
function initializeDebugger() {
    debugLog('Starting debugger initialization');
    alert('Debug: Starting debugger initialization'); // Debug popup
    try {
        if (!window.protobuf) {
            const error = 'Protobuf library not loaded. Please refresh the page.';
            alert(`Debug: Error - ${error}`); // Debug popup
            throw new Error(error);
        }
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