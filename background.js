chrome.runtime.onInstalled.addListener(() => {
    console.log("WebSocket Proto Debugger installed");
});

// Add debugging capabilities
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background script received message:", message);
    if (message.type === "DEBUG_LOG") {
        console.log("Debug log from panel:", message.data);
    }
    sendResponse({ received: true });
});
