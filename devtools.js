console.log("DevTools script starting");

chrome.devtools.panels.create(
    "WebSocket Proto",
    "",
    "panel.html",
    (panel) => {
        console.log("WebSocket Proto panel created");

        // Add panel initialization handlers
        panel.onShown.addListener((panelWindow) => {
            console.log("Panel shown to user");
        });

        panel.onHidden.addListener(() => {
            console.log("Panel hidden by user");
        });
    }
);

console.log("DevTools script loaded");