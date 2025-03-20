const WebSocket = require('ws');
const protobuf = require('protobufjs');
const path = require('path');

// Create WebSocket server with proper configuration
const wss = new WebSocket.Server({ 
    host: '127.0.0.1',
    port: 5000,
    verifyClient: ({ origin, req }, callback) => {
        console.log('Connection attempt:', {
            origin,
            headers: req.headers,
            url: req.url
        });
        // Accept connections from Chrome extension and localhost
        callback(true); // Accept all connections for testing
    }
});

// Load proto file
async function loadProtoDefinitions() {
    try {
        const root = await protobuf.load(path.join(__dirname, 'messages.proto'));
        return {
            TestMessage: root.lookupType('TestMessage'),
            EventInfo: root.lookupType('EventInfo'),
            UserProfile: root.lookupType('UserProfile'),
            Location: root.lookupType('Location'),
            Timestamp: root.lookupType('Timestamp')
        };
    } catch (error) {
        console.error('Error loading proto file:', error);
        process.exit(1);
    }
}

// Create a timestamp
function createTimestamp() {
    return {
        seconds: Math.floor(Date.now() / 1000),
        nanos: (Date.now() % 1000) * 1000000
    };
}

// Send test messages periodically
async function startMessageBroadcast(types) {
    let counter = 0;

    function createAnyContainer() {
        let innerMessage;
        let type;
        
        // Rotate between different message types to pack into Any
        switch(counter % 3) {
            case 0:
                innerMessage = createTestMessage();
                type = types.TestMessage;
                break;
            case 1:
                innerMessage = createEventMessage();
                type = types.EventInfo;
                break;
            case 2:
                innerMessage = createUserMessage();
                type = types.UserProfile;
                break;
        }

        return {
            container_id: `container_${counter}`,
            content: {
                type_url: `type.googleapis.com/${type.fullName}`,
                value: type.encode(type.create(innerMessage)).finish()
            },
            created_at: createTimestamp()
        };
    }

    function createTestMessage() {
        return {
            text: `Test message ${counter}`,
            number: counter,
            flag: counter % 2 === 0,
            created_at: createTimestamp()
        };
    }

    function createEventMessage() {
        return {
            name: `Event ${counter}`,
            description: `Test event description ${counter}`,
            start_time: createTimestamp(),
            location: {
                latitude: 37.7749 + (Math.random() - 0.5),
                longitude: -122.4194 + (Math.random() - 0.5),
                address: `${counter} Test St, San Francisco, CA`
            }
        };
    }

    function createUserMessage() {
        return {
            user_id: `user_${counter}`,
            name: `Test User ${counter}`,
            email: `user${counter}@test.com`,
            roles: ['user', counter % 2 === 0 ? 'admin' : 'viewer'],
            created_at: createTimestamp()
        };
    }

    setInterval(() => {
        let message, messageType, protoType;

        // Rotate between different message types
        switch(counter % 4) {
            case 0:
                message = createTestMessage();
                messageType = 'TestMessage';
                protoType = types.TestMessage;
                break;
            case 3:
                message = createAnyContainer();
                messageType = 'AnyContainer';
                protoType = types.AnyContainer;
                break;
            case 1:
                message = createEventMessage();
                messageType = 'EventInfo';
                protoType = types.EventInfo;
                break;
            case 2:
                message = createUserMessage();
                messageType = 'UserProfile';
                protoType = types.UserProfile;
                break;
        }

        // Verify the message
        const errMsg = protoType.verify(message);
        if (errMsg) throw Error(errMsg);

        // Create and encode the message
        const protoMessage = protoType.create(message);
        const buffer = protoType.encode(protoMessage).finish();

        // Log the message being sent
        console.log('Sending message:', {
            type: messageType,
            counter,
            bufferLength: buffer.length,
            messageContent: message
        });

        // Broadcast to all clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(buffer);
            }
        });

        counter++;
    }, 2000); // Send a message every 2 seconds
}

// Initialize the server
wss.on('connection', (ws, req) => {
    console.log('Client connected:', {
        headers: req.headers,
        url: req.url
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });

    ws.on('message', (data) => {
        console.log('Received message from client:', {
            dataType: typeof data,
            isBuffer: Buffer.isBuffer(data),
            length: data.length
        });
    });
});

// Log when server starts listening
wss.on('listening', () => {
    console.log('WebSocket server is listening on 127.0.0.1:5000');
});

// Handle server errors
wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
});

// Start the server
loadProtoDefinitions().then(types => {
    console.log('Proto definitions loaded, starting message broadcast');
    startMessageBroadcast(types);
}).catch(console.error);