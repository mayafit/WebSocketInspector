# WebSocket Proto Debugger

A Chrome DevTools extension for debugging WebSocket data streams with Protocol Buffer message decoding capabilities.

## Features

- Real-time WebSocket message monitoring
- Protocol Buffer message decoding
- Binary data visualization
- Message history tracking
- Detailed message inspection

## Installation

1. Clone this repository:
```bash
git clone <your-repo-url>
cd websocket-proto-debugger
```

2. Install dependencies:
```bash
npm install
```

3. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the extension directory

## Testing

1. Start the test WebSocket server:
```bash
cd test
node server.js
```

2. Open the test page:
   - Navigate to the `test` directory and open `index.html` in Chrome
   - Or serve it using a local HTTP server:
     ```bash
     npx http-server . -p 3000
     ```
   - Then visit `http://localhost:3000/test/index.html`

3. Open Chrome DevTools and select the "WebSocket Proto" panel
   - You should see incoming messages being decoded and displayed
   - The test server sends a new message every 2 seconds

## Development

The extension uses the following technologies:
- Chrome Extension APIs
- WebSocket protocol
- Protocol Buffers
- Node.js (for test server)

## Project Structure

```
├── background.js         # Extension background script
├── devtools.html        # DevTools page
├── devtools.js          # DevTools script
├── manifest.json        # Extension manifest
├── panel.html          # Panel UI
├── panel.js            # Panel functionality
├── styles.css          # Panel styles
└── test/
    ├── index.html      # Test page
    ├── messages.proto  # Protocol Buffer definition
    └── server.js       # Test WebSocket server
```
