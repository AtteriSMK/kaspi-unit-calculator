// MV3 service worker — kept minimal on MVP; will host install/update hooks if needed.
chrome.runtime.onInstalled.addListener(() => {
  // No-op: defaults are seeded lazily on first read in storage.ts.
})

export {}
