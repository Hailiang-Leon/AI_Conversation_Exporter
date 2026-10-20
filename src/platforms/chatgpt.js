/* ChatGPT extractor: backend API first, virtualized DOM as fallback. */
(function () {
  'use strict';

  const AICE = (window.AICE = window.AICE || {});
  const platforms = (AICE.platforms = AICE.platforms || {});

  function conversationId() {
    const match = location.pathname.match(/\/c\/([0-9a-zA-Z-]{8,})/);
    return match ? match[1] : null;
  }

  function pageTitle() {
    return document.title
      .replace(/\s*[|·-]\s*ChatGPT\s*$/i, '')
      .replace(/^ChatGPT\s*[|·-]\s*/i, '')
      .trim();
  }

  async function getAccessToken() {
    const res = await fetch('/api/auth/session', {
      credentials: 'include',
      headers: { accept: 'application/json' }
    });
    if (!res.ok) throw new Error(AICE.t('errorSessionRequest', [String(res.status)]));
    const data = await res.json();
    const token = data && data.accessToken;
    if (!token) throw new Error(AICE.t('errorNotLoggedIn'));
    return token;
  }

  async function fetchConversation(id, token) {
    const headers = {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'x-authorization': `Bearer ${token}`
    };

    // Workspace accounts need the account id; personal accounts do not send it.
    const accountMatch = document.cookie.match(/(?:^|;\s*)_account=([^;]+)/);
    const accountId = accountMatch && decodeURIComponent(accountMatch[1]);
    if (accountId && /^[0-9a-f-]{36}$/i.test(accountId)) {
      headers['chatgpt-account-id'] = accountId;
    }

    const res = await fetch(`/backend-api/conversation/${id}`, {
      credentials: 'include',
      headers
    });
    if (!res.ok) throw new Error(AICE.t('errorConversationRequestHttp', [String(res.status)]));
    return res.json();
  }

  function blocksFromContent(content) {
    const blocks = [];
    if (!content) return blocks;
    const type = content.content_type;

    if (type === 'text' || type === 'multimodal_text') {
      for (const part of content.parts || []) {
        if (typeof part === 'string') {
          const text = AICE.stripCitationMarkers(part);
          if (text.trim()) blocks.push({ type: 'text', text });
          continue;
        }
        if (!part || typeof part !== 'object') continue;
        if (part.content_type === 'audio_asset_pointer') {
          blocks.push({ type: 'text', text: '[Audio]' });
        } else if (part.content_type === 'image_asset_pointer' || part.asset_pointer) {
          blocks.push({
            type: 'image',
            ref: part.asset_pointer || part.url || '',
            alt: 'image'
          });
        } else if (typeof part.text === 'string' && part.text.trim()) {
          blocks.push({ type: 'text', text: AICE.stripCitationMarkers(part.text) });
        }
      }
    } else if (type === 'code') {
      blocks.push({
        type: 'tool',
        name: content.language ? `code (${content.language})` : 'code',
        input: content.text || ''
      });
    } else if (type === 'execution_output') {
      blocks.push({ type: 'tool', name: 'execution output', output: content.text || '' });
    } else if (type === 'thoughts') {
      const text = (content.thoughts || [])
        .map((thought) => thought.content || thought.summary || '')
        .filter(Boolean)
        .join('\n\n');
      if (text) blocks.push({ type: 'thinking', text });
    } else if (type === 'reasoning_recap') {
      if (content.content) blocks.push({ type: 'thinking', text: content.content });
    } else if (typeof content.text === 'string' && content.text.trim()) {
      blocks.push({ type: 'text', text: AICE.stripCitationMarkers(content.text) });
    }

    return blocks;
  }

  /*
   * Web-search sources live in two places: `content_references` on the message
   * (the links behind ChatGPT's inline citation markers) and
   * `search_result_groups` on the tool nodes that follow a search step. The
   * original exporter lists the first entry of every group.
   */
  function sourcesFromReferences(message) {
    const out = [];
    const lists = [
      message.metadata && message.metadata.content_references,
      message.content && message.content.content_references
    ];
    // `content_references` also carries non-link entries (image groups,
    // entities); only URL references belong in the Sources list.
    const skipTypes = new Set(['image_group', 'entity', 'file']);
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const ref of list) {
        if (!ref || typeof ref !== 'object') continue;

        // Newer answers store their references in a single footnote entry.
        if (ref.type === 'sources_footnote' && Array.isArray(ref.sources)) {
          for (const item of ref.sources) {
            if (item && item.url) {
              out.push({ title: item.title || item.attribution || item.url, url: item.url });
            }
          }
          continue;
        }

        if (!ref.url) continue;
        if (ref.type && skipTypes.has(ref.type)) continue;
        out.push({ title: ref.title || ref.alt || ref.url, url: ref.url });
      }
    }
    return out;
  }

  function sourcesFromSearchGroups(message) {
    const groups = message.metadata && message.metadata.search_result_groups;
    const out = [];
    if (!Array.isArray(groups)) return out;
    for (const group of groups) {
      const entry = group && Array.isArray(group.entries) ? group.entries[0] : null;
      if (entry && entry.url) {
        out.push({ title: entry.title || (group && group.domain) || entry.url, url: entry.url });
      }
    }
    return out;
  }

  /** Tool-role nodes right after `index` in the chain hold the search hits. */
  function sourcesFromFollowingToolNodes(chain, index) {
    const out = [];
    for (let i = index + 1; i < chain.length; i += 1) {
      const message = chain[i] && chain[i].message;
      if (!message) continue;
      if ((message.author && message.author.role) !== 'tool') break;
      out.push(...sourcesFromSearchGroups(message));
    }
    return out;
  }

  function normalizeMessage(node) {
    const message = node && node.message;
    if (!message) return null;

    const role = message.author && message.author.role;
    if (role !== 'user' && role !== 'assistant') return null;
    if (message.metadata && message.metadata.is_visually_hidden_from_conversation) return null;

    const contentType = message.content && message.content.content_type;
    if (contentType === 'user_editable_context' || contentType === 'model_editable_context') {
      return null;
    }

    const blocks = blocksFromContent(message.content);

    for (const attachment of (message.metadata && message.metadata.attachments) || []) {
      blocks.push({
        type: 'attachment',
        name: attachment.name || attachment.id || 'attachment',
        mime: attachment.mime_type || '',
        text: ''
      });
    }

    if (!blocks.length) return null;

    return {
      role,
      createdAt: message.create_time ? Math.round(message.create_time * 1000) : null,
      model: (message.metadata && message.metadata.model_slug) || null,
      blocks
    };
  }

  function linearize(data) {
    const mapping = data.mapping || {};
    let nodeId = data.current_node;

    if (!nodeId || !mapping[nodeId]) {
      const ids = Object.keys(mapping);
      const parents = new Set(ids.map((id) => mapping[id].parent).filter(Boolean));
      const leaves = ids.filter((id) => !parents.has(id));
      leaves.sort((a, b) => {
        const ta = (mapping[a].message && mapping[a].message.create_time) || 0;
        const tb = (mapping[b].message && mapping[b].message.create_time) || 0;
        return tb - ta;
      });
      nodeId = leaves[0] || ids[ids.length - 1];
    }

    const visited = new Set();
    const chain = [];

    while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
      visited.add(nodeId);
      chain.push(mapping[nodeId]);
      nodeId = mapping[nodeId].parent;
    }

    if (!chain.length) {
      return Object.keys(mapping)
        .map((key) => mapping[key])
        .sort((a, b) => {
          const ta = (a.message && a.message.create_time) || 0;
          const tb = (b.message && b.message.create_time) || 0;
          return ta - tb;
        });
    }

    // Guard against a broken/partial chain (e.g. missing parent pointers).
    if (chain.length === 1 && Object.keys(mapping).length > 1) {
      return Object.keys(mapping)
        .map((key) => mapping[key])
        .sort((a, b) => {
          const ta = (a.message && a.message.create_time) || 0;
          const tb = (b.message && b.message.create_time) || 0;
          return ta - tb;
        });
    }

    return chain.reverse();
  }

  function normalizeApi(data) {
    const chain = linearize(data);
    const messages = [];

    chain.forEach((node, index) => {
      const record = normalizeMessage(node);
      if (!record) return;

      if (record.role === 'assistant') {
        const sources = sourcesFromReferences(node.message)
          .concat(sourcesFromFollowingToolNodes(chain, index));
        if (sources.length) record.sources = sources;
      }

      messages.push(record);
    });

    // Search steps have no text of their own: hand their sources to the answer.
    return AICE.attachSources(messages);
  }

  function domMessage(node) {
    const role = node.getAttribute('data-message-author-role');
    if (role !== 'user' && role !== 'assistant') return null;

    const contentRoot = node.querySelector('.markdown') || node;
    const text = AICE.domToMarkdown(contentRoot);
    if (!text) return null;

    const idHost = node.closest('[data-message-id]');
    const id = (idHost && idHost.getAttribute('data-message-id')) || node.getAttribute('data-message-id') || '';

    return {
      id,
      role,
      createdAt: null,
      model: null,
      blocks: [{ type: 'text', text }]
    };
  }

  async function extractFromDom() {
    const messages = await AICE.collectVirtualized({
      selector: '[data-message-author-role]',
      extract: domMessage
    });
    return messages.map(({ id, ...rest }) => rest);
  }

  const platform = {
    id: 'chatgpt',
    label: 'ChatGPT',

    getInfo() {
      const id = conversationId();
      return {
        supported: !!id,
        platform: 'chatgpt',
        label: 'ChatGPT',
        conversationId: id,
        title: pageTitle(),
        url: location.href,
        reason: id ? '' : AICE.t('reasonChatGPTNoChat')
      };
    },

    async extract() {
      const id = conversationId();
      if (!id) throw new Error(AICE.t('reasonChatGPTNoChat'));

      const warnings = [];

      try {
        const token = await getAccessToken();
        const data = await fetchConversation(id, token);
        const messages = normalizeApi(data);
        if (!messages.length) throw new Error(AICE.t('errorNoMessagesApi'));

        return {
          platform: 'chatgpt',
          title: data.title || pageTitle() || AICE.t('titleChatGPT'),
          url: location.href,
          conversationId: id,
          createdAt: data.create_time ? Math.round(data.create_time * 1000) : null,
          updatedAt: data.update_time ? Math.round(data.update_time * 1000) : null,
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
          platform: 'chatgpt',
          title: pageTitle() || AICE.t('titleChatGPT'),
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

  platforms.chatgpt = platform;
})();
