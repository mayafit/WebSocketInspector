const WebSocket = require('ws');
const protobuf = require('protobufjs');
const path = require('path');

// Create WebSocket server with proper configuration
const wss = new WebSocket.Server({ 
    host: '127.0.0.1',
    port: 5000,
    verifyClient: ({ origin, req }, callback) => {
        console.log('Connection attempt from origin:', origin);
        // Accept connections from Chrome extension and localhost
        callback(true); // Accept all connections for testing
    }
});

// Load proto file
async function loadProtoFile() {
    try {
        const root = await protobuf.load(path.join(__dirname, 'messages.proto'));
        const TestMessage = root.lookupType('TestMessage');
        return TestMessage;
    } catch (error) {
        console.error('Error loading proto file:', error);
        process.exit(1);
    }
}

// Send test messages periodically
async function startMessageBroadcast(TestMessage) {
    let counter = 0;
    setInterval(() => {
        const message = {
            text: `Test message ${counter}`,
            number: counter,
            flag: counter % 2 === 0,
            created_at: {
                seconds: Math.floor(Date.now() / 1000),
                nanos: (Date.now() % 1000) * 1000000
            }
        };

        // Verify the message
        const errMsg = TestMessage.verify(message);
        if (errMsg) throw Error(errMsg);

        // Create and encode the message
        const protoMessage = TestMessage.create(message);
        const buffer = TestMessage.encode(protoMessage).finish();

        // Log the message being sent
        console.log('Sending message:', {
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
loadProtoFile().then(TestMessage => {
    console.log('Proto file loaded, starting message broadcast');
    startMessageBroadcast(TestMessage);
}).catch(console.error);