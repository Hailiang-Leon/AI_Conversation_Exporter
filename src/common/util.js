/* Shared helpers. Runs in the content-script isolated world. */
(function () {
  'use strict';

  const AICE = (window.AICE = window.AICE || {});

  /** Localized string from _locales; falls back to the key when unavailable. */
  AICE.t = function (key, substitutions) {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
        return chrome.i18n.getMessage(key, substitutions) || key;
      }
    } catch (err) {
      /* ignore */
    }
    return key;
  };

  AICE.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  AICE.text = (el) => ((el && el.innerText) || '').replace(/\u00a0/g, ' ').trim();

  function utf8Size(codePoint) {
    if (codePoint <= 0x7f) return 1;
    if (codePoint <= 0x7ff) return 2;
    if (codePoint <= 0xffff) return 3;
    return 4;
  }

  AICE.sanitizeFilename = function (name, fallback) {
    const cleaned = String(name || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[.\s]+|[.\s]+$/g, '')
      .trim();

    // macOS and most Linux filesystems cap a filename at 255 bytes. Leave
    // room for the timestamp/extension and never split a surrogate pair.
    let title = '';
    let bytes = 0;
    for (const ch of cleaned) {
      const size = utf8Size(ch.codePointAt(0));
      if (title.length >= 120 || bytes + size > 180) break;
      title += ch;
      bytes += size;
    }
    title = title.replace(/[.\s]+$/, '').trim();
    return title || fallback || 'conversation';
  };

  AICE.pad = (n) => String(n).padStart(2, '0');

  AICE.formatDate = function (value, withTime) {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const date = `${d.getFullYear()}-${AICE.pad(d.getMonth() + 1)}-${AICE.pad(d.getDate())}`;
    if (!withTime) return date;
    return `${date} ${AICE.pad(d.getHours())}:${AICE.pad(d.getMinutes())}`;
  };

  AICE.fileStamp = function (d) {
    const date = d || new Date();
    return `${date.getFullYear()}${AICE.pad(date.getMonth() + 1)}${AICE.pad(date.getDate())}-${AICE.pad(date.getHours())}${AICE.pad(date.getMinutes())}`;
  };

  /** Walk up from `el` to the nearest scrollable ancestor. */
  AICE.findScroller = function (el) {
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      const canScroll = /(auto|scroll|overlay)/.test(style.overflowY);
      if (canScroll && node.scrollHeight > node.clientHeight + 40) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };

  /** Absolute Y position of an element inside a scroller's content. */
  AICE.offsetTopIn = function (el, scroller) {
    const elRect = el.getBoundingClientRect();
    if (!scroller || scroller === document.scrollingElement || scroller === document.documentElement) {
      return elRect.top + (window.scrollY || 0);
    }
    const scRect = scroller.getBoundingClientRect();
    return elRect.top - scRect.top + scroller.scrollTop;
  };

  AICE.dedupeBy = function (items, keyFn) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      const key = keyFn(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };

  AICE.absoluteUrl = function (url, base) {
    if (!url || typeof url !== 'string') return '';
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    if (url.startsWith('//')) return `${(base && base.split('/')[0]) || location.protocol}${url}`;
    try {
      return new URL(url, base || location.href).href;
    } catch (err) {
      return url;
    }
  };

  AICE.summarize = function (messages) {
    return {
      messageCount: messages.length,
      userCount: messages.filter((m) => m.role === 'user').length,
      assistantCount: messages.filter((m) => m.role === 'assistant').length,
    };
  };

  /**
   * Web-search results are recorded while the assistant is still working
   * (tool calls / tool results), but they belong to the answer that cites
   * them. Push each collected source list forward to the next assistant
   * message that has real text; anything left over goes to the previous
   * assistant message.
   */
  AICE.attachSources = function (messages) {
    const pending = [];
    const hasText = (message) =>
      message.blocks.some((block) => block.type === 'text' || block.type === 'code');

    for (const message of messages) {
      if (Array.isArray(message.sources) && message.sources.length) {
        pending.push(...message.sources);
      }
      delete message.sources;

      if (message.role === 'assistant' && hasText(message) && pending.length) {
        message.sources = AICE.dedupeBy(pending.splice(0), (source) => source.url);
      }
    }

    if (pending.length) {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].role === 'assistant') {
          const all = (messages[i].sources || []).concat(pending);
          messages[i].sources = AICE.dedupeBy(all, (source) => source.url);
          break;
        }
      }
    }

    return messages;
  };

  /** Drop ChatGPT's invisible citation markers from a text run. */
  AICE.stripCitationMarkers = function (text) {
    if (typeof text !== 'string' || !/[\ue200-\ue204]/.test(text)) return text;
    return text
      .replace(/\ue200url\ue202([^\ue200-\ue204]*)\ue201/g, '$1')
      .replace(/\ue200[^\ue201]*\ue201/g, '')
      .replace(/[\ue200-\ue204]/g, '');
  };
})();
