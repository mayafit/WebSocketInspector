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
        this.messages = [];
        this.protoRoot = null;
        this.selectedMessageType = null;
        this.activeConnections = new Map();

        // Check protobuf availability immediately
        if (typeof protobuf === 'undefined') {
            debugLog('Error: Protobuf library not loaded');
            throw new Error('Protobuf library not loaded');
        }

        this.initializeUI();
        this.setupWebSocketListener();
    }

    initializeUI() {
        debugLog('Starting UI initialization');

        // Get UI elements
        const loadButton = document.getElementById('loadProto');
        const fileInput = document.getElementById('protoFile');
        this.errorDisplay = document.getElementById('errorDisplay');

        if (!loadButton || !fileInput || !this.errorDisplay) {
            const error = 'Required UI elements not found';
            debugLog('Error:', error);
            throw new Error(error);
        }

        // Direct event listener for button click
        loadButton.addEventListener('click', async (event) => {
            event.preventDefault();
            debugLog('Load Proto button clicked');

            // If no file is selected, trigger file input click
            if (fileInput.files.length === 0) {
                debugLog('No file selected, triggering file input');
                fileInput.click();
                return;
            }

            // Visual feedback
            loadButton.style.backgroundColor = '#1565C0';
            setTimeout(() => loadButton.style.backgroundColor = '', 200);

            try {
                const file = fileInput.files[0];
                debugLog('Processing selected file:', { name: file.name });
                await this.loadProtoFile(file);
                debugLog('File processed successfully');
            } catch (error) {
                debugLog('Error processing file:', error);
                this.showError(`Failed to load proto file: ${error.message}`);
            }
        });

        // File input change handler
        fileInput.addEventListener('change', (event) => {
            debugLog('File input changed');
            const file = event.target.files[0];
            if (file) {
                debugLog('File selected:', { name: file.name });
                // Enable the button and update UI
                loadButton.disabled = false;
                this.errorDisplay.style.display = 'none';

                // Automatically trigger the load after file selection
                loadButton.click();
            } else {
                debugLog('No file selected');
                loadButton.disabled = true;
            }
        });

        // Initialize message type selector
        this.messageTypeSelect = document.getElementById('messageTypeSelect');
        if (!this.messageTypeSelect) {
            throw new Error('Message type selector not found');
        }

        // Message type selection handler
        this.messageTypeSelect.addEventListener('change', (e) => {
            this.selectedMessageType = e.target.value;
            debugLog('Selected message type:', { type: this.selectedMessageType });
            this.updateMessageList();
        });

        // Initialize containers
        this.messageListContainer = document.getElementById('messageList');
        this.messageDetailContainer = document.getElementById('messageDetail');

        if (!this.messageListContainer || !this.messageDetailContainer) {
            throw new Error('Required containers not found');
        }

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

            // Populate message type selector
            this.populateMessageTypes(this.protoRoot);

            // Enable message type selector
            this.messageTypeSelect.disabled = false;

            debugLog('Proto file loaded successfully');
            this.errorDisplay.style.display = 'none';
        } catch (error) {
            debugLog('Error loading proto file:', error);
            throw error; // Re-throw to be handled by the click handler
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
    }

    setupWebSocketListener() {
        debugLog('Setting up WebSocket listener');

        // Listen for network events
        chrome.devtools.network.onRequestFinished.addListener(async (request) => {
            if (request.request.url.startsWith('ws://') || request.request.url.startsWith('wss://')) {
                debugLog('WebSocket connection detected:', { url: request.request.url });

                // Create a new WebSocket connection to monitor
                const wsUrl = request.request.url;
                if (!this.activeConnections.has(wsUrl)) {
                    try {
                        const ws = new WebSocket(wsUrl);
                        this.activeConnections.set(wsUrl, ws);

                        ws.onopen = () => {
                            debugLog('WebSocket connection established:', { url: wsUrl });
                        };

                        ws.onmessage = (event) => {
                            debugLog('WebSocket message received');
                            this.handleWebSocketMessage(event.data);
                        };

                        ws.onerror = (error) => {
                            debugLog('WebSocket error:', { url: wsUrl, error });
                            this.showError(`WebSocket error: ${error.message}`);
                        };

                        ws.onclose = () => {
                            debugLog('WebSocket connection closed:', { url: wsUrl });
                            this.activeConnections.delete(wsUrl);
                        };
                    } catch (error) {
                        debugLog('Error creating WebSocket connection:', error);
                        this.showError(`Failed to connect to WebSocket: ${error.message}`);
                    }
                }
            }
        });

        // Clear connections on navigation
        chrome.devtools.network.onNavigated.addListener(() => {
            debugLog('Page navigated, clearing connections');
            this.activeConnections.forEach(ws => ws.close());
            this.activeConnections.clear();
            this.messages = [];
            this.updateMessageList();
        });
    }

    handleWebSocketMessage(data) {
        try {
            const message = {
                timestamp: new Date().toISOString(),
                rawData: this.parseMessageData(data),
                decoded: null
            };

            this.messages.push(message);
            this.updateMessageList();
            debugLog('New message processed');
        } catch (error) {
            debugLog('Error handling WebSocket message:', error);
        }
    }

    parseMessageData(data) {
        if (typeof data === 'string') {
            try {
                // Try to parse as base64
                const binary = atob(data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                return bytes;
            } catch (e) {
                // If not base64, return as-is
                return data;
            }
        }
        return new Uint8Array(data);
    }

    updateMessageList() {
        this.messageListContainer.innerHTML = '';
        this.messages.forEach((message, index) => {
            const messageElement = document.createElement('div');
            messageElement.className = 'message-item';
            messageElement.textContent = `Message ${index + 1} - ${message.timestamp}`;
            messageElement.onclick = () => this.showMessageDetail(message);
            this.messageListContainer.appendChild(messageElement);
        });
    }

    async showMessageDetail(message) {
        try {
            if (!this.protoRoot || !this.selectedMessageType) {
                this.messageDetailContainer.textContent = 'Please load a proto file and select a message type';
                return;
            }

            const decoded = await this.decodeProtobufMessage(message.rawData);
            this.messageDetailContainer.innerHTML = `<pre>${JSON.stringify(decoded, null, 2)}</pre>`;
        } catch (error) {
            debugLog('Error showing message detail:', error);
            this.messageDetailContainer.textContent = `Error decoding message: ${error.message}`;
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

// Initialize the debugger when the panel loads
document.addEventListener('DOMContentLoaded', () => {
    debugLog('Panel DOM loaded');
    try {
        new WebSocketDebugger();
        debugLog('WebSocket Debugger initialized successfully');
    } catch (error) {
        console.error('Error initializing WebSocket Debugger:', error);
        const errorDisplay = document.getElementById('errorDisplay');
        if (errorDisplay) {
            errorDisplay.style.display = 'block';
            errorDisplay.textContent = `Error: ${error.message}. Please refresh the page.`;
        }
    }
});