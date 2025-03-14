// Debug logging function
function debugLog(message, data = null) {
    const logMessage = data ? `${message}: ${JSON.stringify(data)}` : message;
    console.log(logMessage);
}

// At the top of panel.js, add the ProtoRegistry class

class ProtoRegistry {
    constructor() {
        this.protoFiles = new Map(); // filename -> file content
        this.messageTypes = new Map(); // message type name -> decoder
        this.decoders = new Map(); // message type name -> decoder instance
    }

    async loadProtoFile(file) {
        try {
            const content = await file.text();
            this.protoFiles.set(file.name, content);

            // Parse proto file content to extract message types
            const messageTypes = this.parseProtoFile(content);
            messageTypes.forEach(type => {
                this.messageTypes.set(type.name, type);
            });

            return {
                filename: file.name,
                types: messageTypes.map(t => t.name)
            };
        } catch (error) {
            throw new Error(`Failed to load proto file ${file.name}: ${error.message}`);
        }
    }

    parseProtoFile(content) {
        const messageTypes = [];
        const lines = content.split('\n');
        let currentMessage = null;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('message ')) {
                const name = trimmed.split(' ')[1];
                currentMessage = { name, fields: [] };
                messageTypes.push(currentMessage);
            } else if (currentMessage && trimmed.match(/^[\w\d_]+ +[\w\d_]+ += +\d+;/)) {
                const [type, name, num] = trimmed.split(/[ =;]+/);
                currentMessage.fields.push({ type, name, number: parseInt(num) });
            }
        }

        return messageTypes;
    }

    getDecoderForType(typeName) {
        if (!this.decoders.has(typeName)) {
            const type = this.messageTypes.get(typeName);
            if (!type) {
                throw new Error(`Unknown message type: ${typeName}`);
            }
            this.decoders.set(typeName, this.createDecoder(type));
        }
        return this.decoders.get(typeName);
    }

    createDecoder(type) {
        return {
            readVarint: function(view, offset) {
                let result = 0;
                let shift = 0;
                let byte;

                do {
                    if (offset >= view.byteLength) {
                        throw new Error('Malformed varint');
                    }
                    byte = view.getUint8(offset++);
                    result |= (byte & 0x7F) << shift;
                    shift += 7;
                } while (byte & 0x80);

                return [result, offset];
            },

            decode: function(buffer) {
                if (!(buffer instanceof ArrayBuffer)) {
                    throw new Error('Input must be an ArrayBuffer');
                }

                const view = new DataView(buffer);
                let offset = 0;
                const result = {};

                try {
                    while (offset < buffer.byteLength) {
                        const tag = view.getUint8(offset++);
                        const fieldNum = tag >> 3;
                        const wireType = tag & 0x7;

                        const field = type.fields.find(f => f.number === fieldNum);
                        if (!field) {
                            offset = this.skipField(view, offset, wireType);
                            continue;
                        }

                        switch(field.type) {
                            case 'string':
                                const [strLen, strOffset] = this.readVarint(view, offset);
                                offset = strOffset;
                                const strBytes = new Uint8Array(buffer, offset, strLen);
                                result[field.name] = new TextDecoder().decode(strBytes);
                                offset += strLen;
                                break;

                            case 'int32':
                            case 'int64':
                                const [value, numOffset] = this.readVarint(view, offset);
                                result[field.name] = value;
                                offset = numOffset;
                                break;

                            case 'bool':
                                result[field.name] = Boolean(view.getUint8(offset));
                                offset += 1;
                                break;

                            default:
                                if (this.isMessageType(field.type)) {
                                    const [msgLen, msgOffset] = this.readVarint(view, offset);
                                    offset = msgOffset + msgLen;
                                    // Handle nested message types here
                                    result[field.name] = { _type: field.type, _raw: buffer.slice(msgOffset, offset) };
                                } else {
                                    offset = this.skipField(view, offset, wireType);
                                }
                        }
                    }
                    return result;
                } catch (error) {
                    throw new Error(`Failed to decode message: ${error.message}`);
                }
            },

            isMessageType: function(type) {
                return /^[A-Z]/.test(type);
            },

            skipField: function(view, offset, wireType) {
                switch(wireType) {
                    case 0: // Varint
                        const [_, newOffset] = this.readVarint(view, offset);
                        return newOffset;
                    case 1: // 64-bit
                        return offset + 8;
                    case 2: // Length-delimited
                        const [length, lengthOffset] = this.readVarint(view, offset);
                        return lengthOffset + length;
                    case 5: // 32-bit
                        return offset + 4;
                    default:
                        throw new Error(`Unknown wire type: ${wireType}`);
                }
            }
        };
    }
}

// Update the WebSocketDebugger class to use ProtoRegistry
class WebSocketDebugger {
    constructor() {
        debugLog('Initializing WebSocket Debugger');
        this.messages = [];
        this.port = null;
        this.protoRegistry = new ProtoRegistry();
        this.selectedMessageType = null;

        this.initializeUI();
        this.connectToBackgroundScript();
    }

    initializeUI() {
        debugLog('Starting UI initialization');

        // Get UI elements
        const fileInput = document.getElementById('protoFile');
        const loadButton = document.getElementById('loadProto');
        this.errorDisplay = document.getElementById('errorDisplay');
        this.messageTypeSelect = document.getElementById('messageTypeSelect');
        this.messageListContainer = document.getElementById('messageList');
        this.messageDetailContainer = document.getElementById('messageDetail');
        this.loadedFilesList = document.getElementById('loadedFilesList');

        // Verify all required elements exist
        if (!loadButton || !fileInput || !this.errorDisplay || !this.messageTypeSelect || 
            !this.messageListContainer || !this.messageDetailContainer || !this.loadedFilesList) {
            throw new Error('Required UI elements not found');
        }

        // File input change handler
        fileInput.addEventListener('change', () => {
            debugLog('File input changed');
            const files = fileInput.files;
            if (files.length > 0) {
                debugLog('Files selected:', { count: files.length });
                loadButton.disabled = false;
                this.showError('');
            }
        });

        // Load button click handler
        loadButton.addEventListener('click', async () => {
            debugLog('Load Proto button clicked');
            const files = fileInput.files;
            if (files.length > 0) {
                try {
                    for (const file of files) {
                        const result = await this.protoRegistry.loadProtoFile(file);
                        this.updateLoadedFilesList(result);
                    }
                    this.updateMessageTypeSelect();
                } catch (error) {
                    this.showError(`Failed to load proto files: ${error.message}`);
                }
            }
        });

        // Message type selection handler
        this.messageTypeSelect.addEventListener('change', (e) => {
            debugLog('Message type changed:', e.target.value);
            this.selectedMessageType = e.target.value;
        });
    }

    updateLoadedFilesList(fileInfo) {
        const li = document.createElement('li');
        li.textContent = `${fileInfo.filename} (${fileInfo.types.length} message types)`;
        this.loadedFilesList.appendChild(li);
    }

    updateMessageTypeSelect() {
        this.messageTypeSelect.innerHTML = '<option value="">Select Message Type</option>';
        this.protoRegistry.messageTypes.forEach((type, name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            this.messageTypeSelect.appendChild(option);
        });
        this.messageTypeSelect.disabled = false;
    }


    connectToBackgroundScript() {
        debugLog('Connecting to background script');
        this.port = chrome.runtime.connect({ name: "websocket-panel" });

        this.port.onMessage.addListener((message) => {
            debugLog('Received message from background script:', message);

            switch(message.type) {
                case 'WS_CONNECTED':
                    debugLog('WebSocket connected');
                    this.showError('');
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
            if (!Array.isArray(data)) {
                throw new Error(`Invalid message format: expected Array, got ${typeof data}`);
            }

            const buffer = new ArrayBuffer(data.length);
            const view = new Uint8Array(buffer);
            data.forEach((value, index) => {
                view[index] = value;
            });

            const message = {
                timestamp: new Date().toISOString(),
                rawData: buffer,
                decoded: null,
                type: this.selectedMessageType
            };

            if (this.selectedMessageType) {
                try {
                    const decoder = this.protoRegistry.getDecoderForType(this.selectedMessageType);
                    message.decoded = decoder.decode(buffer);
                    debugLog('Message decoded successfully:', message.decoded);
                } catch (error) {
                    debugLog('Failed to decode message:', error);
                    this.showError(`Failed to decode message: ${error.message}`);
                }
            }

            this.messages.push(message);
            this.updateMessageList();

        } catch (error) {
            debugLog('Error handling WebSocket message:', error);
            this.showError(`Failed to process message: ${error.message}`);
        }
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
                    <pre>${JSON.stringify(Array.from(new Uint8Array(message.rawData)), null, 2)}</pre>`;
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
}

// Run initialization based on document ready state
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDebugger);
} else {
    initializeDebugger();
}