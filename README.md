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

## Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the extension directory
   - Make sure to select the root directory containing manifest.json

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

## Packaging for Distribution

### Creating a ZIP Package

1. Ensure all required files are present:
   ```
   manifest.json
   background.js
   devtools.html
   devtools.js
   panel.html
   panel.js
   styles.css
   ```

2. Create a ZIP file containing these files:
   - On macOS/Linux:
     ```bash
     zip -r websocket-proto-debugger.zip . -x "*.git*" -x "node_modules/*" -x "test/*" -x "*.zip"
     ```
   - On Windows:
     - Right-click the files
     - Select "Send to > Compressed (zipped) folder"
     - Name it "websocket-proto-debugger.zip"

### Creating a .crx File

To create a .crx file for distribution:

1. Pack the extension in Chrome:
   - Go to `chrome://extensions/`
   - Ensure "Developer mode" is enabled
   - Click "Pack extension"
   - In "Extension root directory", select your extension's folder
   - Leave "Private key file" empty for first-time packaging
   - Click "Pack Extension"

2. Chrome will generate two files:
   - `websocket-proto-debugger.crx`: The packaged extension
   - `websocket-proto-debugger.pem`: The private key file

3. Important notes:
   - Keep the .pem file secure - you'll need it for future updates
   - Don't include the .pem file in version control
   - For future updates:
     - Use the same .pem file in the "Private key file" field
     - This ensures users can update smoothly

The extension is now ready for:
- Loading in Chrome via "Load unpacked" (using the unzipped directory)
- Direct installation via the .crx file
- Submission to the Chrome Web Store (using the ZIP file)

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