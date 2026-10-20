/* Claude extractor: claude.ai internal API first, virtualized DOM as fallback. */
(function () {
  'use strict';

  const AICE = (window.AICE = window.AICE || {});
  const platforms = (AICE.platforms = AICE.platforms || {});

  let cachedOrgIds = null;

  function conversationId() {
    const match = location.pathname.match(/\/chat\/([0-9a-fA-F-]{8,})/);
    return match ? match[1] : null;
  }

  function pageTitle() {
    return document.title
      .replace(/\s*[|·-]\s*Claude\s*$/i, '')
      .replace(/^Claude\s*[|·-]\s*/i, '')
      .trim();
  }

  async function getOrganizationIds() {
    if (cachedOrgIds && cachedOrgIds.length) return cachedOrgIds;

    const res = await fetch('/api/organizations', {
      credentials: 'include',
      headers: { accept: 'application/json' }
    });
    if (!res.ok) throw new Error(AICE.t('errorOrgRequest', [String(res.status)]));

    const data = await res.json();
    const orgs = Array.isArray(data) ? data : data && data.organizations;
    if (!Array.isArray(orgs) || !orgs.length) throw new Error(AICE.t('errorNoOrganization'));

    cachedOrgIds = orgs.map((org) => org.uuid || org.id).filter(Boolean);
    if (!cachedOrgIds.length) throw new Error(AICE.t('errorOrgUuid'));
    return cachedOrgIds;
  }

  async function fetchConversation(id) {
    const orgIds = await getOrganizationIds();
    const urls = [];

    for (const orgId of orgIds) {
      urls.push(`/api/organizations/${orgId}/chat_conversations/${id}?tree=True&rendering_mode=messages&render_all_tools=true`);
    }
    for (const orgId of orgIds) {
      urls.push(`/api/organizations/${orgId}/chat_conversations/${id}`);
    }
    urls.push(`/api/chat_conversations/${id}?tree=True&rendering_mode=messages&render_all_tools=true`);

    let lastError = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          credentials: 'include',
          headers: { accept: 'application/json' }
        });
        if (!res.ok) {
          lastError = new Error(
            AICE.t('errorHttp', [String(res.status), url.split('?')[0]])
          );
          continue;
        }
        const data = await res.json();
        if (data && (Array.isArray(data.chat_messages) || data.uuid)) return data;
        lastError = new Error(AICE.t('errorBadResponse'));
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error(AICE.t('errorConversationRequest'));
  }

  function stringify(value) {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch (err) {
      return String(value);
    }
  }

  /*
   * Web-search hits arrive as `tool_result` blocks (name "web_search") whose
   * content carries `knowledge` items with title/url. The original exporter
   * turns exactly these into its "**Sources:**" list.
   */
  const SOURCE_ITEM_TYPES = new Set(['knowledge', 'web_search_result', 'search_result']);

  function collectSources(block, out) {
    if (!block || !Array.isArray(block.content)) return;
    const isSearch = block.name === 'web_search';
    for (const item of block.content) {
      if (!item || typeof item !== 'object' || !item.url) continue;
      // The REST payload does not always repeat the tool name on the result
      // block, so accept any knowledge-shaped item as well.
      if (isSearch || SOURCE_ITEM_TYPES.has(item.type)) {
        out.push({ title: item.title || item.url, url: item.url });
      }
    }
  }

  function blocksFromMessage(message, sources) {
    const blocks = [];
    const humanToolResultOnly = message.sender === 'human' &&
      Array.isArray(message.content) &&
      message.content.some((block) => block && block.type === 'tool_result') &&
      !message.content.some((block) => block && block.type === 'text' && block.text && block.text.trim());

    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!block || typeof block !== 'object') continue;

        if (block.type === 'text') {
          if (block.text) blocks.push({ type: 'text', text: block.text });
        } else if (block.type === 'thinking') {
          // Newer/redacted thinking blocks may only carry summaries instead of
          // the raw `thinking` text; the original exporter uses the last one.
          const summaries = Array.isArray(block.summaries) ? block.summaries : [];
          const lastSummary = summaries.length
            ? (summaries[summaries.length - 1].summary || '')
            : '';
          const text = block.thinking || block.text || lastSummary || '';
          if (text) blocks.push({ type: 'thinking', text });
        } else if (block.type === 'tool_use') {
          const input = block.input || {};
          if (block.name === 'artifacts' && input && typeof input.content === 'string') {
            blocks.push({ type: 'code', language: input.type || '', text: input.content });
          } else {
            blocks.push({ type: 'tool', name: block.name || 'tool', input });
          }
        } else if (block.type === 'tool_result') {
          collectSources(block, sources);
          blocks.push({
            type: 'tool',
            name: 'tool result',
            output: stringify(block.content)
          });
        } else if (block.type === 'image') {
          const source = block.source || {};
          const src = source.url || '';
          blocks.push({
            type: 'image',
            ref: src ? AICE.absoluteUrl(src, location.href)
              : source.data ? `data:${source.media_type || 'image/png'};base64,${source.data}` : '',
            alt: block.alt || 'image'
          });
        } else if (block.text) {
          // Unknown block types are treated as process data: keep them in
          // JSON but never risk leaking a tool step into Markdown.
          blocks.push({ type: 'tool', name: block.type || 'unknown', input: block.text });
        }
      }
    }

    if (!humanToolResultOnly &&
        typeof message.text === 'string' &&
        message.text.trim() &&
        !blocks.some((block) => block.type === 'text')) {
      // The content[] is authoritative. `message.text` is a convenience copy
      // of the visible text; use it only when content has no text block (for
      // example, an agent turn whose content is thinking/tool blocks only).
      blocks.push({ type: 'text', text: message.text });
    }

    const seen = new Set();

    for (const attachment of message.attachments || []) {
      const name = attachment.file_name || attachment.name || attachment.uuid || 'attachment';
      if (seen.has(name)) continue;
      seen.add(name);
      blocks.push({
        type: 'attachment',
        name,
        mime: attachment.file_type || attachment.mime_type || '',
        text: attachment.extracted_content || ''
      });
    }

    for (const file of message.files || []) {
      const name = file.file_name || file.name || file.uuid || 'file';
      if (seen.has(name)) continue;
      seen.add(name);

      const mime = file.file_type || file.mime_type || '';
      if (file.file_kind === 'image' || /^image\//.test(mime)) {
        const url = AICE.absoluteUrl(file.preview_url || file.thumbnail_url || '', location.href);
        if (url) {
          blocks.push({ type: 'image', url, alt: name });
          continue;
        }
      }

      blocks.push({
        type: 'attachment',
        name,
        mime,
        text: file.extracted_content || ''
      });
    }

    return blocks;
  }

  function normalizeMessage(message) {
    const role =
      message.sender === 'human' ? 'user' :
      message.sender === 'assistant' ? 'assistant' : null;
    if (!role) return null;

    const sources = [];
    const blocks = blocksFromMessage(message, sources);
    if (!blocks.length) return null;

    const out = {
      role,
      createdAt: message.created_at ? Date.parse(message.created_at) || null : null,
      model: message.model || null,
      blocks
    };
    if (sources.length) out.sources = sources;
    return out;
  }

  function flattenTree(messages) {
    if (!Array.isArray(messages)) return [];
    const hasNested = messages.some((m) => Array.isArray(m.children) && m.children.length);
    if (!hasNested) return messages;

    const out = [];
    const walk = (list) => {
      for (const message of list) {
        out.push(message);
        if (Array.isArray(message.children)) walk(message.children);
      }
    };
    walk(messages);
    return out;
  }

  /**
   * `tree=True` returns the whole tree, including abandoned edit/regeneration
   * branches. Reconstruct the branch the user actually sees by walking
   * `current_leaf_message_uuid` -> `parent_message_uuid` -> ... -> root.
   */
  function activePath(data) {
    const all = flattenTree(data.chat_messages || []);
    const byId = new Map();
    for (const message of all) {
      if (message && message.uuid) byId.set(message.uuid, message);
    }

    let leafId = data.current_leaf_message_uuid;
    if (!leafId || !byId.has(leafId)) {
      const parents = new Set(all.map((m) => m.parent_message_uuid).filter(Boolean));
      const leaves = all
        .filter((m) => m.uuid && !parents.has(m.uuid))
        .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
      leafId = leaves.length ? leaves[0].uuid : null;
    }

    if (leafId && byId.has(leafId)) {
      const chain = [];
      const seen = new Set();
      let id = leafId;
      while (id && byId.has(id) && !seen.has(id)) {
        seen.add(id);
        const message = byId.get(id);
        chain.push(message);
        id = message.parent_message_uuid;
      }
      if (chain.length > 1 || all.length === 1) return chain.reverse();
    }

    return all;
  }

  function normalizeApi(data) {
    const messages = activePath(data)
      .map(normalizeMessage)
      .filter(Boolean);
    // Tool results live in user-role messages; move the sources they carry to
    // the assistant answer that cites them.
    return AICE.attachSources(messages);
  }

  function domMessage(node) {
    const isUser = !!node.closest('[data-testid="user-message"], .font-user-message');
    const role = isUser ? 'user' : 'assistant';

    const text = AICE.domToMarkdown(node);
    if (!text) return null;

    const idHost = node.closest('[data-message-uuid], [data-uuid]');
    const id =
      (idHost && (idHost.getAttribute('data-message-uuid') || idHost.getAttribute('data-uuid'))) ||
      node.getAttribute('data-message-uuid') ||
      node.getAttribute('data-uuid') ||
      '';

    return {
      id,
      role,
      createdAt: null,
      model: null,
      blocks: [{ type: 'text', text }]
    };
  }

  async function extractFromDom() {
    const selector = '[data-testid="user-message"], .font-user-message, .font-claude-message';
    const nodes = Array.from(document.querySelectorAll(selector)).filter(
      (node) => !(node.parentElement && node.parentElement.closest(selector))
    );
    if (!nodes.length) return [];

    const messages = await AICE.collectVirtualized({
      selector,
      extract: (node) => {
        // Ignore outer wrappers when a more specific child is also matched.
        if (node.querySelector(selector)) return null;
        return domMessage(node);
      }
    });
    return messages.map(({ id, ...rest }) => rest);
  }

  const platform = {
    id: 'claude',
    label: 'Claude',

    getInfo() {
      const id = conversationId();
      return {
        supported: !!id,
        platform: 'claude',
        label: 'Claude',
        conversationId: id,
        title: pageTitle(),
        url: location.href,
        reason: id ? '' : AICE.t('reasonClaudeNoChat')
      };
    },

    async extract() {
      const id = conversationId();
      if (!id) throw new Error(AICE.t('reasonClaudeNoChat'));

      const warnings = [];

      try {
        const data = await fetchConversation(id);
        const messages = normalizeApi(data);
        if (!messages.length) throw new Error(AICE.t('errorNoMessagesApi'));

        return {
          platform: 'claude',
          title: data.name || pageTitle() || AICE.t('titleClaude'),
          url: location.href,
          conversationId: id,
          createdAt: data.created_at ? Date.parse(data.created_at) || null : null,
          updatedAt: data.updated_at ? Date.parse(data.updated_at) || null : null,
          messages,
          source: 'api',
          warnings
        };
      } catch (err) {
        warnings.push(AICE.t('warnApiFallback', [err.message]));
        const messages = await extractFromDom();
        if (!messages.length) {
          throw new Error(AICE.t('errorNoMessagesAfterFallback', [err.message]));
        }
        return {
          platform: 'claude',
          title: pageTitle() || AICE.t('titleClaude'),
          url: location.href,
          conversationId: id,
          createdAt: null,
          updatedAt: null,
          messages,
          source: 'dom',
          warnings
        };
      }
    }
  };

  platforms.claude = platform;
})();
