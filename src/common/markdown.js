/* Conversation model serializers: Markdown + JSON. Pure functions, no network/DOM. */
(function () {
  'use strict';

  const AICE = (window.AICE = window.AICE || {});

  /*
   * Markdown is aligned with the two extensions this one replaces:
   *   # Title
   *
   *   **Created:** ...          (trailing two spaces = hard line break)
   *   **Updated:** ...
   *   **Exported:** ...
   *   **Link:** [url](url)
   *
   *   ## User:
   *
   *   > time · model
   *
   *   message body
   *
   * Thinking and tool steps never appear in Markdown: they are process data,
   * kept only in the JSON blocks. Web-search sources are optional (on by
   * default) and render as the original exporters' "**Sources:**" list at the
   * end of the message that cites them.
   */
  const MD_DEFAULTS = {
    includeSources: true,
    includeTimestamps: true,
    includeModel: true,
    roleUser: 'User',
    roleAssistant: 'Assistant'
  };

  function mdOptions(options) {
    const opts = Object.assign({}, MD_DEFAULTS, options || {});
    opts.roleUser = String(opts.roleUser || '').trim() || MD_DEFAULTS.roleUser;
    opts.roleAssistant = String(opts.roleAssistant || '').trim() || MD_DEFAULTS.roleAssistant;
    return opts;
  }

  function fence(text, lang) {
    let mark = '```';
    while (String(text).includes(mark)) mark += '`';
    return `${mark}${lang || ''}\n${String(text).replace(/\n+$/, '')}\n${mark}`;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function oneLine(text, max) {
    const flat = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    const chars = Array.from(flat);
    return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : flat;
  }

  function isoDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  /** Link label for a web-search source; falls back to the URL itself. */
  function sourceLabel(source) {
    const flat = oneLine(source && source.title, 160);
    return flat ? flat.replace(/[[\]]/g, '\\$&') : source.url;
  }

  /** Web-search references, rendered like the original exporters. */
  function renderSources(sources) {
    const lines = ['---', '', '**Sources:**', ''];
    for (const source of sources) {
      if (source && source.url) lines.push(`- [${sourceLabel(source)}](${source.url})`);
    }
    return lines.join('\n');
  }

  function renderBlock(block) {
    switch (block.type) {
      case 'text':
        return String(block.text || '').trim();
      case 'code':
        return fence(block.text || '', block.language || '');
      case 'thinking':
        // Process data: JSON only, never Markdown.
        return '';
      case 'tool':
        // Process data: JSON only, never Markdown.
        return '';
      case 'image': {
        const ref = block.url || block.ref || '';
        const alt = escapeHtml(block.alt || 'image');
        if (/^https?:\/\//.test(ref)) return `![${alt}](${ref})`;
        if (/^data:/.test(ref)) return `[${alt} (embedded image)]`;
        return `[${alt}${ref ? `: ${ref}` : ''}]`;
      }
      case 'attachment': {
        const lines = [`> File: ${block.name || 'file'}`];
        if (block.text) {
          lines.push('');
          lines.push(fence(String(block.text).trim(), 'text'));
        }
        return lines.join('\n');
      }
      default:
        return block.text ? String(block.text).trim() : '';
    }
  }

  AICE.renderMarkdown = function (conversation, options) {
    const opts = mdOptions(options);
    const lines = [];

    lines.push(`# ${conversation.title || 'Untitled conversation'}`);
    lines.push('');

    const meta = [];
    if (conversation.createdAt) {
      const created = AICE.formatDate(conversation.createdAt, true);
      if (created) meta.push(`**Created:** ${created}  `);
    }
    if (conversation.updatedAt) {
      const updated = AICE.formatDate(conversation.updatedAt, true);
      if (updated) meta.push(`**Updated:** ${updated}  `);
    }
    meta.push(`**Exported:** ${AICE.formatDate(new Date(), true)}  `);
    if (conversation.url) meta.push(`**Link:** [${conversation.url}](${conversation.url})  `);
    lines.push(...meta);
    lines.push('');

    if (conversation.source === 'dom') {
      lines.push('**Source:** page DOM (some messages may be missing)  ');
      lines.push('');
    }

    let exported = 0;

    for (const message of conversation.messages) {
      const rendered = message.blocks.map((block) => renderBlock(block)).filter(Boolean);
      // Agent turns are split into several API messages; the intermediate ones
      // may hold nothing but thinking/tool blocks. Skip them instead of
      // emitting an empty "## Assistant:" section.
      if (!rendered.length) continue;

      const roleLabel =
        message.role === 'user' ? opts.roleUser :
        message.role === 'assistant' ? opts.roleAssistant : message.role;

      lines.push(`## ${roleLabel}:`);
      lines.push('');

      const metaBits = [];
      if (opts.includeTimestamps && message.createdAt) {
        const stamp = AICE.formatDate(message.createdAt, true);
        if (stamp) metaBits.push(stamp);
      }
      if (opts.includeModel && message.model) metaBits.push(message.model);
      if (metaBits.length) {
        lines.push(`> ${metaBits.join(' · ')}`);
        lines.push('');
      }

      lines.push(rendered.join('\n\n'));

      const sources = opts.includeSources
        ? (message.sources || []).filter((source) => source && source.url)
        : [];
      if (sources.length) {
        lines.push('');
        lines.push(renderSources(sources));
      }

      lines.push('');
      exported += 1;
    }

    if (!exported) {
      lines.push('_No exportable text content in this conversation._');
      lines.push('');
    }

    // Do not collapse blank lines here: they are already exact at block
    // boundaries, and a global \n{4,} replace would rewrite the inside of
    // code fences.
    return lines.join('\n').trimEnd() + '\n';
  };

  /** Number of messages that actually produce a section in Markdown. */
  AICE.markdownMessageCount = function (conversation) {
    return conversation.messages.filter((message) =>
      (message.blocks || []).some((block) => Boolean(renderBlock(block)))
    ).length;
  };

  AICE.toJsonObject = function (conversation) {
    const out = {
      schema: 'aice.conversation.v1',
      platform: conversation.platform,
      title: conversation.title || '',
      url: conversation.url || '',
      conversationId: conversation.conversationId || null,
      createdAt: conversation.createdAt || null,
      createdAtISO: isoDate(conversation.createdAt),
      updatedAt: conversation.updatedAt || null,
      exportedAt: new Date().toISOString(),
      source: conversation.source || 'api',
      messageCount: conversation.messages.length,
      messages: conversation.messages
    };
    if (conversation.warnings && conversation.warnings.length) {
      out.warnings = conversation.warnings;
    }
    return out;
  };

  AICE.renderJson = function (conversation) {
    return JSON.stringify(AICE.toJsonObject(conversation), null, 2) + '\n';
  };
})();
