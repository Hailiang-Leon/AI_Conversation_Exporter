# AI Conversation Exporter — Markdown 与 JSON 导出

[English](README.md) | 简体中文

一个轻量的 Microsoft Edge / Chrome 扩展，可将 **ChatGPT** 和 **Claude** 对话导出为 **Markdown** 或 **JSON**。

所有处理都在浏览器本地完成：无服务器、无上传、无统计、无需账号、无付费版本。

## 功能

- **一个扩展，支持两个平台** — `chatgpt.com`、`chat.openai.com`、`claude.ai`
- **Markdown 导出** — 标题与元数据头、`## Role:` 标题、代码围栏、表格、列表、数学公式、图片和联网检索来源。Assistant 的 thinking/tool 步骤不会写入 Markdown（只保留在 JSON）；唯一例外是 Claude artifacts，它会作为代码块导出
- **JSON 导出** — 归一化、稳定的 schema（`aice.conversation.v1`）；联网检索的 `sources` 始终保留在 JSON 中
- **API 优先，DOM 兜底** — 使用你现有的登录状态读取站点自己的对话 API，以获取完整数据；API 不可用时回退到虚拟化 DOM 滚动爬取
- **完全本地** — 使用 Blob URL 创建下载；不会向这两个站点之外的服务器发送请求
- **双语界面** — 支持英文和简体中文，自动跟随浏览器 UI 语言；不向页面注入可见 UI

## 安装（开发者模式）

1. 打开 Edge，进入 `edge://extensions/`（Chrome 为 `chrome://extensions/`）。
2. 开启 **开发者模式**。
3. 点击 **加载解压缩的扩展**，选择本文件夹。
4. 打开一个 ChatGPT 或 Claude 对话页，点击扩展图标，选择导出格式。

更新代码后，在扩展卡片上点击 **重新加载**。已打开的标签页需要刷新一次，以注入新的 content script。

## 使用

1. 打开一个对话，例如 `https://chatgpt.com/c/<id>` 或 `https://claude.ai/chat/<id>`。
2. 点击工具栏中的扩展图标。
3. 选择 **导出 Markdown** 或 **导出 JSON**。
4. 文件会保存为 `<对话标题>-<年月日-时分>.md|json`。

Markdown 内容选项（下次打开时会记住）：

- **导出联网检索来源（Include web-search sources）** — 默认开启。开启后，使用联网检索的回答末尾会追加与原扩展一致的引用列表（`---` + `**Sources:**` + `- [title](url)`）。关闭后不输出这些列表。
- **时间 / 模型名（Timestamps / Model name）** — 在每条消息的 `> 时间 · 模型` 引用行中包含时间戳和 assistant 模型。
- **角色标签（Role labels）** — 每一方使用的标题，默认 `User` / `Assistant`。可改为 `Prompt` / `Response`，以完全匹配 ChatGPT 原扩展。

## Markdown 格式

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

该格式与原扩展保持一致：元数据行使用硬换行，使用 `## Role:` 标题，并在每条消息下使用 `> 时间 · 模型` 引用行。Thinking/tool 步骤会被省略（仅存在于 JSON）；有提取文本时，附件会渲染为 `> File: 文件名` 加一个 `text` 代码围栏。联网检索来源（开启时）会附加到引用它们的回答末尾，格式与原扩展的 `**Sources:**` 块一致。

Claude 和 ChatGPT 会把一个回答拆成多条 API 消息（thinking → tool call → final text）。只包含 thinking/tool 块的消息会被跳过，因此不会出现空的 `## Assistant:` 章节。这些步骤中收集到的来源会移动到实际使用它们的回答。ChatGPT 的不可见引用标记（`\ue200cite…\ue201`）会从正文中移除。

## 输出 schema

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

块类型：`text`、`code`、`thinking`、`image`、`tool`、`attachment`。`sources` 只出现在引用了联网检索结果的消息（通常是回答）上。

## 工作方式

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

- **ChatGPT**：先通过 `/api/auth/session` 获取 access token，再请求 `/backend-api/conversation/{id}`。Workspace 账号会从 `_account` cookie 中读取并发送 `chatgpt-account-id` 请求头。
- **Claude**：先通过 `/api/organizations` 获取 org id，再请求
  `/api/organizations/{org}/chat_conversations/{id}?tree=True&rendering_mode=messages&render_all_tools=true`。
  `tree=True` 会返回已放弃的编辑/重新生成分支，因此导出器会沿 `current_leaf_message_uuid` → `parent_message_uuid` → root 回溯，只保留你实际看到的那个分支。
- **DOM 兜底**：滚动对话容器，记录可见消息，去重后按绝对位置排序。可处理两个站点的虚拟化消息列表。

## 已知限制

- 这些是内部、未公开的站点 API。如果 OpenAI/Anthropic 修改接口，扩展会回退到 DOM 抓取；DOM 选择器也可能需要随之更新。
- **按设计不提供 PDF 导出。** PDF 排版正是原扩展变得笨重且依赖服务器的原因；如需要，可在生成的 Markdown 上使用浏览器的「打印 → 另存为 PDF」。
- 图片以 URL/资源引用形式导出，不嵌入字节（可保持文件较小，避免 JSON 过大）。
- 会包含 ChatGPT 附件名称，但不会下载附件内容。
- Claude 的 DOM 兜底可能缺少折叠的 thinking/tool 块；API 路径会完整获取（它们始终存在于 JSON，且不会写入 Markdown）。
- ChatGPT 独立的 `tool` 角色消息不会包含在归一化 JSON 中；assistant 的 thinking/tool 块以及从中收集的联网检索来源会保留。
- 只能导出已存在的对话；新建/空对话会显示「不受支持」。共享链接（`/share/...`）不受支持。
- Claude 的 org 查询按页面会话缓存。

## 开发

无需构建步骤，也没有依赖。修改后重新加载扩展卡片并刷新标签页。

```bash
npm test                    # 三个测试套件
# 或单独运行：
node tests/smoke.js         # 序列化器
node tests/platforms.test.js # 使用 mock fetch 测试 API 归一化
node tests/i18n.test.js     # 语言包一致性
```

`tests/dom-test.html` 是 HTML → Markdown 转换器的浏览器测试页。通过任意静态服务器打开（例如 `python3 -m http.server`），然后检查 `window.__checks`。

## 隐私

该扩展：

- 没有 `background` service worker；
- 不向任何第三方服务器发送请求；
- 不使用统计或遥测；
- 仅在 `chrome.storage.local` 中保存 UI 偏好（选项开关、角色标签）。

## 项目结构

```
manifest.json
_locales/
  en/messages.json
  zh_CN/messages.json
popup.html / popup.css / popup.js
src/
  content.js
  common/
    util.js          工具函数、滚动容器查找、文件名/日期
    dom-to-md.js     HTML -> Markdown 转换器（仅兜底）
    dom-collect.js   虚拟化列表爬取器（仅兜底）
    markdown.js      Markdown + JSON 序列化器
    download.js      Blob 下载
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
