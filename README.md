# AI Conversation Exporter — MD & JSON

A lightweight Microsoft Edge / Chrome extension that exports **ChatGPT** and **Claude** conversations to **Markdown** or **JSON**.

Everything happens locally in your browser. No server, no uploads, no analytics, no account, no paid tier.

## 快速开始（中文）

1. 打开 Edge，进入 `edge://extensions/`，开启右下角的「开发人员模式」
2. 点击「加载解压缩的扩展」，选择本文件夹（`AI_Conversation_Exporter`）
3. 打开一个 ChatGPT（`chatgpt.com/c/...`）或 Claude（`claude.ai/chat/...`）对话页
4. 点击工具栏里的扩展图标，选择「导出 Markdown」或「导出 JSON」
5. 文件会保存到下载目录，命名为 `<对话标题>-<年月日-时分>.md|json`

界面会自动跟随浏览器 UI 语言切换中文 / English（导出格式名称保持英文）。代码注释和本文档主要是英文。修改代码后需要在扩展页点击「重新加载」，并刷新已打开的对话页面。

## Features

- **Two platforms, one extension** — `chatgpt.com`, `chat.openai.com`, `claude.ai`
- **Markdown export** — title/metadata header, `## Role:` headings, code fences, tables, lists, math, images, and web-search sources. Assistant thinking/tool steps are never written to Markdown (they stay in JSON); Claude artifacts are the one exception and render as code blocks
- **JSON export** — normalized, stable schema (`aice.conversation.v1`); web-search `sources` are always kept in JSON
- **API first, DOM fallback** — reads the site's own conversation API (using your existing login) for complete data, then falls back to a virtualized-DOM scroll crawler if the API is unavailable
- **Local only** — the download is created with a Blob URL; no network requests leave the two sites
- **Bilingual UI** — English and Simplified Chinese, follows the browser UI language automatically; no in-page UI injection

## Install (developer mode)

1. Open Edge and go to `edge://extensions/` (Chrome: `chrome://extensions/`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Open a ChatGPT or Claude conversation, click the extension icon, choose a format.

After updating the code, click **Reload** on the extension card. Existing tabs must be refreshed once so the new content script is injected.

## Usage

1. Open a conversation, e.g. `https://chatgpt.com/c/<id>` or `https://claude.ai/chat/<id>`.
2. Click the toolbar icon.
3. Choose **Export Markdown** or **Export JSON**.
4. The file is saved as `<conversation title>-<YYYYMMDD-HHmm>.md|json`.

Markdown content options (remembered between runs):

- **Include web-search sources (导出联网检索来源)** — on by default. When on, an answer that used web search gets the original exporters' reference list at the end (`---` + `**Sources:**` + `- [title](url)`). Turn it off to skip those lists.
- **Timestamps / Model name (时间 / 模型名)** — include the per-message timestamp and the assistant model in the `> time · model` line.
- **Role labels (角色标签)** — the headings used for each side, default `User` / `Assistant`. Set them to `Prompt` / `Response` to match the ChatGPT exporter exactly.

## Markdown format

```markdown
# Conversation title

**Created:** 2026-10-19 07:30  
**Updated:** 2026-10-19 07:45  
**Exported:** 2026-10-19 23:10  
**Link:** [https://claude.ai/chat/…](https://claude.ai/chat/…)  

## User:

> 2026-10-19 07:30

Message text…

## Assistant:

> 2026-10-19 07:31 · claude-sonnet-4-5

Reply text…

---

**Sources:**

- [Example page](https://example.com/page)
- [docs.dev](https://docs.dev/guide)
```

This mirrors the original extensions' layout: metadata lines with hard line breaks, `## Role:` headings, and the per-message `> time · model` blockquote. Thinking/tool steps are omitted (they live only in JSON); attachments render as `> File: name` plus a `text` code fence when extracted text is available. Web-search references (when enabled) are appended at the end of the answer that cites them, exactly like the original `**Sources:**` block.

Claude and ChatGPT split one answer into several API messages (thinking → tool call → final text). Messages that hold nothing but thinking/tool blocks are skipped, so you never get empty `## Assistant:` sections. Sources collected during those steps are moved to the answer that used them. ChatGPT's invisible citation markers (`\ue200cite…\ue201`) are stripped from the text.

## Output schema

```json
{
  "schema": "aice.conversation.v1",
  "platform": "chatgpt",
  "title": "Conversation title",
  "url": "https://chatgpt.com/c/...",
  "conversationId": "...",
  "createdAt": 1792387800000,
  "createdAtISO": "2026-10-19T05:30:00.000Z",
  "updatedAt": 1792387900000,
  "exportedAt": "2026-10-19T14:00:00.000Z",
  "source": "api",
  "messageCount": 12,
  "messages": [
    {
      "role": "user",
      "createdAt": 1792387800000,
      "model": null,
      "blocks": [{ "type": "text", "text": "Hello" }]
    },
    {
      "role": "assistant",
      "createdAt": 1792387860000,
      "model": "gpt-5",
      "blocks": [{ "type": "text", "text": "Hi" }],
      "sources": [{ "title": "Example page", "url": "https://example.com/page" }]
    }
  ]
}
```

Block types: `text`, `code`, `thinking`, `image`, `tool`, `attachment`. `sources` is present only on messages (usually answers) that cite web-search results.

## How it works

```
popup.js
   │ chrome.tabs.sendMessage
   ▼
content.js ──► platforms/chatgpt.js  ──► same-origin API  ──► normalize
   │        └─ platforms/claude.js   ──► same-origin API  ──► normalize
   │                                    │
   │                                    └─ on failure: DOM crawler (dom-collect.js)
   ▼
markdown.js (serializer) ──► download.js (Blob + <a download>)
```

- **ChatGPT**: `/api/auth/session` for the access token, then `/backend-api/conversation/{id}`. Workspace accounts get the `chatgpt-account-id` header from the `_account` cookie.
- **Claude**: `/api/organizations` for the org id, then
  `/api/organizations/{org}/chat_conversations/{id}?tree=True&rendering_mode=messages&render_all_tools=true`.
  `tree=True` returns abandoned edit/regeneration branches too, so the exporter walks `current_leaf_message_uuid` → `parent_message_uuid` → root to keep only the branch you actually see.
- **DOM fallback**: scrolls the conversation container, snapshots visible messages, de-duplicates and sorts them by absolute position. This handles both sites' virtualized message lists.

## Limitations

- These are internal, undocumented site APIs. If OpenAI/Anthropic change them, the extension falls back to DOM scraping; the DOM selectors may also need updates over time.
- **No PDF export by design.** PDF layout is the part that makes the original extensions heavy and server-dependent; use your browser's Print → Save as PDF on the generated Markdown if needed.
- Images are exported as URL/asset references, not embedded bytes (keeps files small and avoids huge JSON).
- ChatGPT attachment names are included, but attachment contents are not downloaded.
- On the Claude DOM fallback, collapsed thinking/tool blocks may be missing; the API path captures them fully (they are always present in JSON and never written to Markdown).
- ChatGPT's standalone `tool`-role messages are not included in the normalized JSON. Assistant thinking/tool blocks and the web-search sources collected from them are kept.
- Only existing conversations can be exported; new/empty chats show "not supported". Shared links (`/share/...`) are not supported.
- Claude's org lookup is cached per page session.

## Development

No build step and no dependencies. After editing, reload the extension card and refresh the tab.

```bash
npm test                    # all three test suites
# or individually:
node tests/smoke.js         # serializers
node tests/platforms.test.js # API normalization with mocked fetch
node tests/i18n.test.js     # locale parity
```

`tests/dom-test.html` is a browser page for the HTML → Markdown converter. Open it through any static server (for example `python3 -m http.server`) and check `window.__checks`.

## Privacy

The extension:

- has no `background` service worker,
- makes no requests to any third-party server,
- does not use analytics or telemetry,
- keeps only UI preferences (format toggles, role labels) in `chrome.storage.local`.

## Project layout

```
manifest.json
_locales/
  en/messages.json
  zh_CN/messages.json
popup.html / popup.css / popup.js
src/
  content.js
  common/
    util.js          helpers, scroll finder, filename/date
    dom-to-md.js     HTML -> Markdown converter (fallback only)
    dom-collect.js   virtualized list crawler (fallback only)
    markdown.js      Markdown + JSON serializers
    download.js      Blob download
  platforms/
    chatgpt.js
    claude.js
icons/
tests/
  smoke.js
  platforms.test.js
  i18n.test.js
  dom-test.html
```
