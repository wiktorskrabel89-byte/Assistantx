// AssistantX Clinical — Side Panel
// Reads the configured host URL from chrome.storage.sync and sets the iframe src.
(function () {
  const frame = document.getElementById("app-frame");
  if (!frame) return;

  chrome.storage.sync.get(["clinicalHost"], (result) => {
    const host = result.clinicalHost || "http://localhost:3000";
    frame.src = `${host}/?tab=clinical`;
  });
})();
