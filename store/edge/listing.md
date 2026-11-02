# Microsoft Edge Add-ons submission pack

This folder contains the copy, privacy answers, and assets needed for the Edge Add-ons submission.

## Package

Use:

```text
AI_Conversation_Exporter-v0.3.2.zip
```

The archive has `manifest.json` at its root, contains only runtime files, and excludes tests and Git files.

- Extension version: `0.3.2`
- Visibility: **Public**
- Markets: all markets
- Category: **Productivity**
- Mature content: **No**

## 1. Developer account

Register for the Microsoft Edge program in Partner Center:

1. Go to [Partner Center → Microsoft Edge](https://partner.microsoft.com/dashboard/microsoftedge/public/login).
2. Sign in with a Microsoft account. A GitHub account can also be used to create the required Microsoft account.
3. Select **Individual** or **Company**. Individual is normally faster to verify.
4. Choose a public **Publisher display name**. It will appear on the store listing.
5. Accept the App Developer Agreement and complete email/account verification.

There is no Edge registration fee. The certification review can take up to seven business days.

## 2. Store listing fields

**Extension name** (from `manifest.json`):

```text
AI Conversation Exporter - MD & JSON
```

**Short description** (from `manifest.json`):

```text
Export ChatGPT and Claude conversations to Markdown or JSON. Fully local, no server, no tracking.
```

**Category:** `Productivity`

**Website:**

```text
https://github.com/Hailiang-Leon/AI_Conversation_Exporter
```

**Support contact:**

```text
https://github.com/Hailiang-Leon/AI_Conversation_Exporter/issues
```

**Privacy policy URL:**

```text
https://hailiang-leon.github.io/AI_Conversation_Exporter/privacy.html
```

**Search terms** (6 terms, within the 7-term / 21-word limit):

```text
ChatGPT export
Claude export
conversation backup
Markdown
JSON
AI chat export
```

## 3. Full description — English

```text
AI Conversation Exporter is a local-only browser extension that saves your ChatGPT and Claude conversations as clean Markdown or structured JSON. Open a conversation, click the extension icon, and choose a format. The Markdown export keeps headings, code blocks, tables, lists, math, images, and web-search sources, so the result is easy to read, search, or paste into another AI tool. The JSON export provides a stable schema with roles, timestamps, model names, content blocks, and sources for archiving or programmatic use. All processing happens in your browser. There is no server, no upload, no account, no analytics, no tracking, and no paid tier. The extension uses your existing login only to read the conversation you are viewing; it does not send your data anywhere else. Export options let you include or hide web-search sources, timestamps, and model names, and customize the role labels. Both English and Simplified Chinese interfaces are included.
```

## 4. Full description — 简体中文

```text
AI Conversation Exporter 是一款完全本地运行的浏览器扩展，可将 ChatGPT 和 Claude 对话导出为清晰的 Markdown 或结构化 JSON。打开一个对话，点击扩展图标并选择格式即可。Markdown 导出会保留标题、代码块、表格、列表、数学公式、图片和联网检索来源，方便阅读、搜索或粘贴到其他 AI 工具中继续分析。JSON 导出使用稳定的 schema，保留角色、时间、模型、内容块和来源，适合归档或程序处理。所有处理都在浏览器本地完成：没有服务器、没有上传、没有账号、没有统计、没有追踪，也没有付费版本。扩展仅使用你当前的登录状态读取正在查看的对话，不会把数据发送到其他服务器。你可以选择是否包含联网检索来源、时间戳和模型名，并自定义角色标签。界面支持英文和简体中文。
```

## 5. Privacy and permissions answers

### Single purpose

```text
Export the current ChatGPT or Claude conversation to Markdown or JSON.
```

### Remote code

Select:

```text
No, I am not using remote code.
```

All JavaScript is bundled in the extension package. No CDN, remote script, or `eval` is used at runtime. Test files are excluded from the store package.

### Permission justification

**`storage`:**

```text
Saves only the user's export preferences and custom role labels locally. No conversation content is stored in extension storage.
```

**Host permission for `https://chatgpt.com/*`, `https://chat.openai.com/*`, and `https://claude.ai/*`:**

```text
Required to read the conversation that the user explicitly chooses to export and to call the same site's own conversation API. The extension does not access any other website.
```

**Content scripts on the same hosts:**

```text
Runs the export code on supported conversation pages so the popup can request the current conversation. No visible UI is injected into the page.
```

### Data usage

The extension reads website content and conversation text locally when the user clicks an export button. It does not transmit that content to the developer or any third party.

Select the categories that match the actual behavior in the Partner Center form — normally **Website content** and **Personal communications**. Do not select categories the extension does not access. In the explanation, state that all processing is local and that no data is collected or transmitted to the developer.

### Privacy policy

Use:

```text
https://hailiang-leon.github.io/AI_Conversation_Exporter/privacy.html
```

The policy covers local processing, the existing site session, `chrome.storage.local` preferences, permissions, retention, the Limited Use statement, and contact information.

## 6. Certification notes for reviewers

```text
AI Conversation Exporter is a local-only export tool for ChatGPT and Claude.

Test steps:
1. Sign in to ChatGPT (https://chatgpt.com) or Claude (https://claude.ai) with a free account.
2. Open any existing conversation.
3. Click the AI Conversation Exporter toolbar icon.
4. Click "Export Markdown" and confirm a .md file downloads.
5. Click "Export JSON" and confirm a .json file downloads.

The extension uses the reviewer's existing site session only to read the conversation being viewed. It requests data only from the same site (chatgpt.com, chat.openai.com, or claude.ai). No credentials, conversation content, or analytics are sent to the developer.

If the site API is unavailable, the extension falls back to reading the visible page DOM. In that case the popup reports the source as "page DOM" and the export may not include virtualized messages.

No test account is bundled with the package. A free ChatGPT or Claude account and an existing conversation are sufficient to test both export formats.
```

## 7. Assets

| Asset | Requirement | Status |
|---|---|---|
| Extension package | ZIP with `manifest.json` at root | `AI_Conversation_Exporter-v0.3.2.zip` |
| Store logo | 300×300 recommended, 128×128 minimum | `store/edge/logo-300.png` |
| Screenshot | 1280×800 or 640×480, up to 6 | `store/edge/screenshot-1.png` |
| Small promotional tile | Optional, 440×280 | Optional |
| Large promotional tile | Optional, 1400×560 | Optional |

Do not use ChatGPT or Claude logos in the store listing or promotional art. Descriptive references such as "for ChatGPT and Claude" are fine, but the listing must not imply official affiliation.

## 8. Submission flow

1. Complete Partner Center registration and verification.
2. Open **Microsoft Edge → Create new extension**.
3. Upload `AI_Conversation_Exporter-v0.3.2.zip`.
4. Set visibility to **Public** and select all markets.
5. Fill in the category, website, support contact, and mature-content fields.
6. Complete the **Privacy** page with the single purpose, permission justifications, remote-code answer, data usage, and privacy policy URL.
7. Add the English and Chinese store listings. Upload `store/edge/logo-300.png` and `store/edge/screenshot-1.png`.
8. Paste the certification notes and submit.
9. After certification, the listing becomes public and updates are delivered through the store.

For future extension updates, increment the `version` field in `manifest.json`, rebuild the ZIP, and submit a new package. The store version must be higher than the currently published version.
