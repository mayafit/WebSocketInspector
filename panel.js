// Debug logging function
function debugLog(message, data = null) {
    const logMessage = data ? `${message}: ${JSON.stringify(data)}` : message;
    console.log(logMessage);
    chrome.runtime.sendMessage({
        type: 'DEBUG_LOG',
        data: logMessage
    });
}

// Global click handler for debugging
document.addEventListener('click', (e) => {
    debugLog('Global click event on element:', {
        id: e.target.id,
        tagName: e.target.tagName,
        className: e.target.className
    });
});

class WebSocketDebugger {
    constructor() {
        debugLog('Initializing WebSocket Debugger');
        this.messages = [];
        this.protoRoot = null;
        this.selectedMessageType = null;

        if (typeof protobuf === 'undefined') {
            debugLog('Error: Protobuf library not loaded');
            throw new Error('Protobuf library not loaded');
        }

        this.initializeUI();
        this.setupWebSocketListener();
    }

    initializeUI() {
        debugLog('Starting UI initialization');
        // Proto file upload handling
        const loadButton = document.getElementById('loadProto');
        const fileInput = document.getElementById('protoFile');

        if (!loadButton || !fileInput) {
            const error = 'Required UI elements not found: ' + 
                        `button=${!!loadButton}, input=${!!fileInput}`;
            debugLog('Error:', error);
            throw new Error(error);
        }

        loadButton.onclick = (event) => {
            debugLog('Load Proto button clicked');
            event.preventDefault();
            // Add visual feedback
            loadButton.style.backgroundColor = '#1565C0';
            setTimeout(() => loadButton.style.backgroundColor = '', 200);

            const file = fileInput.files[0];
            if (file) {
                debugLog('Loading proto file:', { name: file.name });
                this.loadProtoFile(file);
            } else {
                debugLog('No file selected');
                this.showError('Please select a proto file first');
            }
        };

        // Message type selector
        this.messageTypeSelect = document.getElementById('messageTypeSelect');
        if (!this.messageTypeSelect) {
            debugLog('Error: Message type selector not found');
            throw new Error('Message type selector not found');
        }

        this.messageTypeSelect.onchange = (e) => {
            this.selectedMessageType = e.target.value;
            debugLog('Selected message type:', { type: this.selectedMessageType });
            this.updateMessageList();
        };

        // Initialize containers
        this.messageListContainer = document.getElementById('messageList');
        this.messageDetailContainer = document.getElementById('messageDetail');
        this.errorDisplay = document.getElementById('errorDisplay');

        if (!this.messageListContainer || !this.messageDetailContainer || !this.errorDisplay) {
            const error = 'Required containers not found';
            debugLog('Error:', error);
            throw new Error(error);
        }

        // Add file input change handler
        fileInput.onchange = () => {
            debugLog('File input changed');
            if (fileInput.files.length > 0) {
                debugLog('File selected:', { name: fileInput.files[0].name });
                loadButton.disabled = false;
                this.errorDisplay.style.display = 'none';
            } else {
                debugLog('No file selected');
                loadButton.disabled = true;
            }
        };

        // Initial button state
        loadButton.disabled = fileInput.files.length === 0;
        debugLog('UI initialization complete');
    }

    showError(message) {
        console.error(message);
        if (this.errorDisplay) {
            this.errorDisplay.textContent = message;
            this.errorDisplay.style.display = 'block';
        }
        chrome.runtime.sendMessage({
            type: 'DEBUG_LOG',
            data: 'Error: ' + message
        });
    }

    async loadProtoFile(file) {
        try {
            if (typeof protobuf === 'undefined') {
                throw new Error('Protobuf library not loaded. Please refresh the page.');
            }

            const content = await file.text();
            console.log('Proto file content loaded, parsing...');

            // Use the global protobuf object
            const parsed = await protobuf.parse(content);
            if (!parsed || !parsed.root) {
                throw new Error('Failed to parse proto file: Invalid format');
            }

            this.protoRoot = parsed.root;

            // Populate message type selector
            this.populateMessageTypes(this.protoRoot);

            // Enable message type selector
            this.messageTypeSelect.disabled = false;

            console.log('Proto file loaded successfully');
            // Send debug log to background script
            chrome.runtime.sendMessage({
                type: 'DEBUG_LOG',
                data: 'Proto file loaded: ' + file.name
            });
        } catch (error) {
            console.error('Error loading proto file:', error);
            this.showError(`Error loading proto file: ${error.message}`);
        }
    }

    populateMessageTypes(root) {
        console.log('Populating message types...');
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
        console.log('Found message types:', messageTypes);
    }

    setupWebSocketListener() {
        console.log('Setting up WebSocket listener...');
        chrome.devtools.network.onNavigated.addListener(() => {
            console.log('Page navigated, clearing messages');
            this.messages = [];
            this.updateMessageList();
        });

        // Listen for WebSocket frames
        chrome.devtools.network.onRequestFinished.addListener((request) => {
            if (request.type === 'websocket') {
                console.log('WebSocket request intercepted:', request);
                request.getContent((content, encoding) => {
                    if (content) {
                        console.log('WebSocket content received:', { encoding, length: content.length });
                        this.handleWebSocketMessage(content, encoding);
                    }
                });
            }
        });
    }

    handleWebSocketMessage(content, encoding) {
        console.log('Handling WebSocket message:', { encoding });
        const message = {
            timestamp: new Date().toISOString(),
            data: content,
            encoding: encoding,
            // Store binary data as Uint8Array
            rawData: this.parseMessageData(content, encoding)
        };

        this.messages.push(message);
        this.updateMessageList();

        chrome.runtime.sendMessage({
            type: 'DEBUG_LOG',
            data: `New WebSocket message received at ${message.timestamp}`
        });
    }

    parseMessageData(content, encoding) {
        if (encoding === 'base64') {
            console.log('Decoding base64 content');
            // Convert base64 to binary
            const binaryString = atob(content);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        }
        return content;
    }

    updateMessageList() {
        this.messageListContainer.innerHTML = '';

        this.messages.forEach((message, index) => {
            const messageElement = document.createElement('div');
            messageElement.className = 'message-item';
            messageElement.textContent = `Message ${index + 1} - ${message.timestamp}`;

            messageElement.addEventListener('click', () => {
                console.log('Message selected:', index);
                this.showMessageDetail(message);
            });

            this.messageListContainer.appendChild(messageElement);
        });
    }

    async showMessageDetail(message) {
        console.log('Showing message detail');
        try {
            if (!this.protoRoot) {
                this.messageDetailContainer.textContent = 'Please load a proto file first';
                return;
            }

            if (!this.selectedMessageType) {
                this.messageDetailContainer.textContent = 'Please select a message type';
                return;
            }

            // Try to decode the message using the loaded proto definition
            const decoded = await this.decodeProtobufMessage(message.rawData);
            console.log('Message decoded successfully:', decoded);
            this.messageDetailContainer.textContent = JSON.stringify(decoded, null, 2);
        } catch (error) {
            console.error('Error showing message detail:', error);
            this.messageDetailContainer.textContent = `Error decoding message: ${error.message}`;
        }
    }

    async decodeProtobufMessage(data) {
        if (!this.protoRoot || !this.selectedMessageType) {
            throw new Error('Proto definition or message type not selected');
        }

        try {
            const MessageType = this.protoRoot.lookupType(this.selectedMessageType);
            // Ensure we're working with Uint8Array
            const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
            return MessageType.decode(buffer);
        } catch (error) {
            console.error('Error decoding protobuf message:', error);
            throw new Error(`Failed to decode message: ${error.message}`);
        }
    }
}

// Initialize the debugger when the panel loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Panel DOM loaded, checking protobuf availability');
    try {
        if (typeof protobuf === 'undefined') {
            console.error('Protobuf library not available');
            const errorDisplay = document.getElementById('errorDisplay');
            if (errorDisplay) {
                errorDisplay.style.display = 'block';
                errorDisplay.textContent = 'Error: Protobuf library not loaded. Please refresh the page.';
            }
            return;
        }
        console.log('Initializing WebSocket Debugger');
        new WebSocketDebugger();
    } catch (error) {
        console.error('Error initializing WebSocket Debugger:', error);
        const errorDisplay = document.getElementById('errorDisplay');
        if (errorDisplay) {
            errorDisplay.style.display = 'block';
            errorDisplay.textContent = `Error: ${error.message}. Please refresh the page.`;
        }
    }
});