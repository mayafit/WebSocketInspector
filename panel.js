class WebSocketDebugger {
    constructor() {
        this.messages = [];
        this.protoRoot = null;
        this.selectedMessageType = null;
        console.log('WebSocket Debugger initialized');

        this.initializeUI();
        this.setupWebSocketListener();
    }

    initializeUI() {
        // Proto file upload handling
        document.getElementById('loadProto').addEventListener('click', () => {
            const fileInput = document.getElementById('protoFile');
            const file = fileInput.files[0];
            if (file) {
                console.log('Loading proto file:', file.name);
                this.loadProtoFile(file);
            }
        });

        // Message type selector
        this.messageTypeSelect = document.getElementById('messageTypeSelect');
        this.messageTypeSelect.addEventListener('change', (e) => {
            this.selectedMessageType = e.target.value;
            console.log('Selected message type:', this.selectedMessageType);
            // Refresh displayed messages with new type
            this.updateMessageList();
        });

        // Initialize message list container
        this.messageListContainer = document.getElementById('messageList');
        this.messageDetailContainer = document.getElementById('messageDetail');

        console.log('UI initialized successfully');
    }

    async loadProtoFile(file) {
        try {
            const content = await file.text();
            console.log('Proto file content loaded, parsing...');
            this.protoRoot = await protobuf.parse(content).root;

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
            this.messageDetailContainer.textContent = `Error loading proto file: ${error.message}`;
            chrome.runtime.sendMessage({
                type: 'DEBUG_LOG',
                data: 'Proto file error: ' + error.message
            });
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
    console.log('Panel DOM loaded, initializing WebSocket Debugger');
    new WebSocketDebugger();
});