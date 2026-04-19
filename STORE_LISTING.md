# Web Store Listing Content

Use the following text blocks when uploading your extension to the Chrome Developer Dashboard.

## Short Summary (max 132 chars)
Your ultimate AI chat companion and multitasking hub. Access multiple AIs, pinned sites, notes, and tools—all from your sidebar!

## Detailed Description
**AI Sidekick** brings the power of multitasking and AI assistance directly to the side of your browser. Stop switching tabs and losing your train of thought—keep everything you need right at your fingertips in a sleek, resizable side panel.

### ✨ Core Features:
- **Your Favorite AI, Instantly:** Choose your default AI provider from a pre-loaded list (ChatGPT, Claude, Gemini, Copilot, DeepSeek, Grok) or add your own custom AI URL. Access it instantly with one click.
- **Pin Any Website:** Want to keep a tutorial, documentation, or your favorite web app open while you browse? Pin any website or your current active tab directly to the sidebar's navigation strip.
- **Split-Screen Multitasking:** True productivity! Use the dynamic drag-and-drop divider to split your sidebar into two vertical panes, allowing you to view your AI assistant and a pinned site simultaneously.
- **Drop (Notes & Files):** A built-in scratchpad to instantly drop text notes, links, or images to yourself. Everything is stored locally.
- **Built-in Tools:** Access a handy calculator and unit converter without ever opening a new tab or searching online.
- **Instant Search:** Quickly look up things via Google, Bing, or DuckDuckGo right from the sidebar.
- **Fully Customizable:** Drag and drop icons to reorder your navigation strip, and toggle the visibility of built-in apps via the Settings menu.

### 🔒 Privacy First
AI Sidekick is completely free, contains zero ads, and respects your privacy. All your settings, pinned sites, and Drop notes are saved locally on your device (`chrome.storage.local`). We do not collect, transmit, or sell any of your data.

---

## Developer Dashboard: Permissions Justification
*When submitting, Google will ask you to justify your permissions. Copy and paste this exactly:*

**Storage:** Used to save the user's local settings, pinned websites, and notes created in the "Drop" feature via `chrome.storage.local`.
**Tabs:** Used strictly to retrieve the URL and Title of the user's currently active tab when they click the "Pin Current Active Tab" button in the UI. We do not track browsing history.
**SidePanel:** Required to mount and display the extension UI inside the browser's side panel.
**ContextMenus:** Used to add a right-click menu to the sidebar navigation icons, allowing users to quickly "Unpin" or "Hide" apps.
**<all_urls>, declarativeNetRequest, and declarativeNetRequestWithHostAccess:** This extension functions as a secondary browser window within the side panel, allowing users to pin and view ANY custom website of their choosing within an iframe. Many modern websites employ `X-Frame-Options: DENY` or `Content-Security-Policy` headers that block iframe rendering. We strictly use DNR to strip these framing restrictions for the specific URLs the user chooses to pin, enabling them to load correctly in the side panel.
