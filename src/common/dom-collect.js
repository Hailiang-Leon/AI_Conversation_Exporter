/* Fallback loader for virtualized message lists: walk the scroller, snapshot visible messages. */
(function () {
  'use strict';

  const AICE = (window.AICE = window.AICE || {});

  function fingerprint(message) {
    const firstText = (message.blocks || [])
      .filter((b) => b.type === 'text' || b.type === 'code')
      .map((b) => b.text || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 160);
    return `${message.role}|${firstText}|${firstText.length}`;
  }

  /**
   * @param {object} opts
   * @param {string} opts.selector  CSS selector matching one element per message.
   * @param {(el: Element) => object|null} opts.extract
   * @param {number} [opts.maxSteps]
   * @returns {Promise<Array>} messages sorted top-to-bottom
   */
  AICE.collectVirtualized = async function (opts) {
    const selector = opts.selector;
    const extract = opts.extract;
    const maxSteps = opts.maxSteps || 600;

    const first = document.querySelector(selector);
    if (!first) return [];

    const scroller = AICE.findScroller(first);
    const isPageScroller = !scroller || scroller === document.scrollingElement || scroller === document.documentElement;
    const originalScroll = isPageScroller ? window.scrollY : scroller.scrollTop;
    const seen = new Map();

    function snapshot() {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        let message;
        try {
          message = extract(node);
        } catch (err) {
          message = null;
        }
        if (!message) continue;

        const top = AICE.offsetTopIn(node, scroller);
        const id = message.id || '';
        const key = id ? `id:${id}` : `pos:${Math.round(top / 6)}:${message.role}`;
        const print = fingerprint(message);

        const previous = seen.get(key);
        if (previous) {
          // Keep the version with more content (streaming can grow while scrolling).
          if (print.length >= previous.print.length) {
            seen.set(key, { top, message, print });
          }
          continue;
        }
        seen.set(key, { top, message, print });
      }
    }

    snapshot();
    if (isPageScroller) {
      window.scrollTo(0, 0);
    } else {
      scroller.scrollTop = 0;
    }
    await AICE.sleep(700);
    snapshot();

    let position = 0;
    let steps = 0;
    let staleRounds = 0;

    while (steps < maxSteps) {
      steps += 1;
      const view = isPageScroller ? window.innerHeight : scroller.clientHeight;
      const height = isPageScroller ? document.documentElement.scrollHeight : scroller.scrollHeight;

      if (position + view >= height) {
        await AICE.sleep(600);
        snapshot();
        const newHeight = isPageScroller ? document.documentElement.scrollHeight : scroller.scrollHeight;
        if (position + view >= newHeight) {
          staleRounds += 1;
          if (staleRounds >= 2) break;
        } else {
          staleRounds = 0;
        }
      }

      position = Math.min(position + Math.max(240, view * 0.7), height);
      if (isPageScroller) window.scrollTo(0, position);
      else scroller.scrollTop = position;
      await AICE.sleep(300);
      snapshot();
    }

    // Restore the user's scroll position.
    try {
      if (isPageScroller) window.scrollTo(0, originalScroll);
      else scroller.scrollTop = originalScroll;
    } catch (err) {
      /* ignore */
    }

    const ordered = [...seen.values()].sort((a, b) => a.top - b.top);

    // Remove adjacent duplicates caused by layout drift, but keep legitimate
    // repeated messages that sit far apart in the conversation.
    const out = [];
    for (const entry of ordered) {
      const previous = out[out.length - 1];
      const sameText = previous && previous.print === entry.print;
      if (sameText && Math.abs(previous.top - entry.top) < 60) continue;
      out.push(entry);
    }

    return out
      .map((entry) => entry.message)
      .filter((m) => (m.blocks || []).some((b) => b.text || b.url || b.ref || b.output || b.name));
  };
})();
