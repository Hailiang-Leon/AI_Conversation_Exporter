# Privacy Policy — AI Conversation Exporter

**Effective date:** November 2, 2026  
**Applies to:** the AI Conversation Exporter browser extension for Microsoft Edge and Google Chrome.

## In short

AI Conversation Exporter runs locally in your browser. It does not operate a server, does not send conversation content to the developer, and does not use analytics, tracking, advertising, or telemetry.

The extension reads the conversation you are viewing only when you click an export button. It converts that conversation into Markdown or JSON and creates a file in your browser's download folder.

## 1. Data the extension accesses

When you export a conversation, the extension may access:

- **Conversation content** — messages, roles, timestamps, model names, attachments, citations, and web-search source links from the current ChatGPT or Claude conversation.
- **Page information** — the conversation title and URL, used in the exported file and its filename.
- **Your existing site session** — the extension uses the login session already present in your browser to request the same conversation from the site's own API. For ChatGPT workspace accounts, the extension may read the existing `_account` cookie value to identify the workspace in that request. Access tokens are used in memory only; they are not stored by the extension or sent to the developer.
- **Your preferences** — options such as whether to include sources, timestamps, or model names, and custom role labels. These are stored with `chrome.storage.local`.

The extension only runs on:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://claude.ai/*`

It does not read pages on other websites.

## 2. How the data is used

The accessed data is used only to:

- read the conversation you asked to export;
- convert the conversation into Markdown or JSON;
- create and download the resulting file;
- remember your export preferences.

The developer does not collect, receive, store, sell, rent, or share conversation content. There is no developer-operated server or database.

## 3. Network requests

The extension makes requests only to the same site you are already using:

- ChatGPT endpoints under `chatgpt.com` or `chat.openai.com`;
- Claude endpoints under `claude.ai`.

These requests use your existing browser session and are needed to retrieve the conversation for export. The extension does not contact any third-party server, analytics service, advertising network, or remote code host.

## 4. Data sharing

The extension does not:

- sell or rent user data;
- share data with advertisers or data brokers;
- use data for personalized advertising, profiling, or credit decisions;
- allow humans to read conversation content.

The only copy of the exported conversation is the file you choose to download. You control where that file is saved and with whom you share it.

## 5. Data retention

- The extension does not retain conversation content after the export is complete.
- Export preferences remain in `chrome.storage.local` until you clear them, uninstall the extension, or clear the browser's extension data.
- Downloaded Markdown and JSON files are stored in the location you choose, under your control.
- The developer has no server or database from which to delete user data.

## 6. Permissions

The extension requests only the permissions needed for its single purpose:

- **`storage`** — save your export preferences locally.
- **Host access to ChatGPT and Claude** — read the current conversation and call the site's own API to produce the export.
- **Content scripts on those same sites** — run the export code on the page you are viewing.

The extension does not request access to your browsing history, bookmarks, downloads, passwords, or other websites.

## 7. Third-party sites

ChatGPT and Claude are independent third-party services. Your use of those services is governed by their own terms and privacy policies. AI Conversation Exporter is not affiliated with, endorsed by, or sponsored by OpenAI or Anthropic.

## 8. Security

- All extension code is bundled with the extension; the extension does not load remote code.
- Conversation processing happens locally in the browser.
- The extension requests the minimum permissions needed for the export feature.
- The source code is available at [github.com/Hailiang-Leon/AI_Conversation_Exporter](https://github.com/Hailiang-Leon/AI_Conversation_Exporter).

## 9. Limited Use

The developer's use of information accessed by the extension is limited to providing the user-facing export feature described above. The extension complies with the applicable Microsoft Edge Add-ons and Chrome Web Store user data policies, including the Limited Use requirements. Data is not used for advertising, sold, or transferred to third parties.

## 10. Children

The extension is not directed to children under 13, and the developer does not knowingly collect personal information from children.

## 11. Changes to this policy

If this policy changes, the updated version will be published at this URL with a new effective date. Material changes will also be noted in the extension's release notes.

## 12. Contact

For privacy questions or data requests, open an issue at:

[https://github.com/Hailiang-Leon/AI_Conversation_Exporter/issues](https://github.com/Hailiang-Leon/AI_Conversation_Exporter/issues)

## 中文摘要

AI Conversation Exporter 完全在浏览器本地运行，不向开发者服务器上传数据，也不使用统计、追踪、广告或遥测。

扩展仅在你点击导出时读取当前 ChatGPT 或 Claude 对话内容，并在本地转换为 Markdown 或 JSON 文件。扩展会使用你现有的站点登录状态读取该对话；ChatGPT 工作区账号可能读取已有的 `_account` cookie 以标识工作区。访问令牌仅在内存中使用，不会保存或发送给开发者。

扩展不会收集、保存、出售或共享对话内容。导出选项保存在 `chrome.storage.local`，直到你清除扩展数据或卸载扩展。下载的文件由你自行保存和分享。

扩展仅申请导出所需的权限：本地设置存储，以及访问 ChatGPT/Claude 页面和同站点 API。问题和隐私请求请通过 GitHub Issues 联系。
