// AssistantX Clinical — Background service worker
// Opens the side panel when the extension action icon is clicked.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
