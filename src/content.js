/* Content script entry: routes export requests from the popup to the right platform. */
(function () {
  'use strict';

  const AICE = window.AICE;

  function currentPlatform() {
    const host = location.hostname;
    if (host === 'claude.ai' || host.endsWith('.claude.ai')) return AICE.platforms.claude;
    if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com') {
      return AICE.platforms.chatgpt;
    }
    return null;
  }

  async function handleExport(message) {
    const platform = currentPlatform();
    if (!platform) throw new Error(AICE.t('errorUnsupported'));

    const info = platform.getInfo();
    if (!info.supported) throw new Error(info.reason || AICE.t('errorOpenConversation'));

    const conversation = await platform.extract();
    if (!conversation.messages.length) {
      throw new Error(AICE.t('errorNoExportable'));
    }

    const format = message.format === 'json' ? 'json' : 'md';
    const options = {
      includeSources: message.includeSources !== false,
      includeTimestamps: message.includeTimestamps !== false,
      includeModel: message.includeModel !== false,
      roleUser: message.roleUser,
      roleAssistant: message.roleAssistant
    };

    let content;
    let mime;
    let extension;

    if (format === 'json') {
      content = AICE.renderJson(conversation, options);
      mime = 'application/json;charset=utf-8';
      extension = 'json';
    } else {
      content = AICE.renderMarkdown(conversation, options);
      mime = 'text/markdown;charset=utf-8';
      extension = 'md';
    }

    const filename = `${AICE.sanitizeFilename(conversation.title, 'conversation')}-${AICE.fileStamp()}.${extension}`;
    AICE.downloadFile(content, filename, mime);

    return {
      ok: true,
      filename,
      messageCount: format === 'md'
        ? AICE.markdownMessageCount(conversation)
        : conversation.messages.length,
      source: conversation.source,
      warnings: conversation.warnings || []
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === 'AICE_INFO') {
      const platform = currentPlatform();
      if (!platform) {
        sendResponse({ ok: true, supported: false, reason: AICE.t('errorUnsupported') });
        return false;
      }
      try {
        sendResponse({ ok: true, ...platform.getInfo() });
      } catch (err) {
        sendResponse({ ok: false, supported: false, reason: err.message });
      }
      return false;
    }

    if (message.type === 'AICE_EXPORT') {
      handleExport(message)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
      return true;
    }

    return false;
  });
})();
