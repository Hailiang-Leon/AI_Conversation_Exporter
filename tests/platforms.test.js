/* Platform normalization tests with mocked fetch. Run: node tests/platforms.test.js */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const plain = (value) => JSON.parse(JSON.stringify(value));

const messages = JSON.parse(
  fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8')
);

function getMessage(key, substitutions) {
  const entry = messages[key];
  if (!entry) return '';
  const values = Array.isArray(substitutions)
    ? substitutions
    : substitutions == null ? [] : [substitutions];
  let text = entry.message;
  for (const [name, def] of Object.entries(entry.placeholders || {})) {
    const index = Number(String(def.content).slice(1)) - 1;
    text = text.replace(new RegExp(`\\$${name}\\$`, 'gi'), values[index] == null ? '' : String(values[index]));
  }
  return text;
}

function loadPlatform(file, { pathname, href, fetchImpl, title }) {
  const sandbox = {
    window: {},
    location: { pathname, href },
    document: {
      title: title || 'Test',
      cookie: '',
      querySelector: () => null,
      querySelectorAll: () => []
    },
    fetch: fetchImpl,
    console,
    setTimeout,
    clearTimeout,
    URL,
    chrome: { i18n: { getMessage } }
  };
  vm.createContext(sandbox);
  for (const rel of [
    'src/common/util.js',
    'src/common/dom-collect.js',
    'src/common/markdown.js',
    file
  ]) {
    vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
  }
  return sandbox.window.AICE;
}

function jsonResponse(body, status) {
  return {
    ok: status === undefined || status < 400,
    status: status || 200,
    json: async () => body
  };
}

async function testChatGPT() {
  const conversationId = '11111111-1111-1111-1111-111111111111';
  const raw = {
    title: 'GPT sample',
    create_time: 1760000000,
    update_time: 1760000100,
    current_node: 'n3',
    mapping: {
      n1: {
        id: 'n1',
        parent: null,
        message: {
          author: { role: 'system' },
          content: { content_type: 'text', parts: ['system'] },
          metadata: { is_visually_hidden_from_conversation: true }
        }
      },
      n2: {
        id: 'n2',
        parent: 'n1',
        message: {
          author: { role: 'user' },
          create_time: 1760000001,
          content: { content_type: 'text', parts: ['Hello'] },
          metadata: {}
        }
      },
      n3: {
        id: 'n3',
        parent: 'n2',
        message: {
          author: { role: 'assistant' },
          create_time: 1760000002,
          content: {
            content_type: 'multimodal_text',
            parts: [
              'Hi there',
              { content_type: 'image_asset_pointer', asset_pointer: 'file-service://img-1' }
            ]
          },
          metadata: { model_slug: 'gpt-5' }
        }
      }
    }
  };

  const AICE = loadPlatform('src/platforms/chatgpt.js', {
    pathname: `/c/${conversationId}`,
    href: `https://chatgpt.com/c/${conversationId}`,
    fetchImpl: async (url, options) => {
      if (url === '/api/auth/session') return jsonResponse({ accessToken: 'token' });
      if (url === `/backend-api/conversation/${conversationId}`) {
        assert.strictEqual(options.headers.authorization, 'Bearer token');
        assert.strictEqual(options.headers['x-authorization'], 'Bearer token');
        return jsonResponse(raw);
      }
      throw new Error('unexpected URL ' + url);
    }
  });

  const info = AICE.platforms.chatgpt.getInfo();
  assert.strictEqual(info.supported, true);
  assert.strictEqual(info.conversationId, conversationId);

  const result = await AICE.platforms.chatgpt.extract();
  assert.strictEqual(result.source, 'api');
  assert.strictEqual(result.title, 'GPT sample');
  assert.strictEqual(result.createdAt, 1760000000000);
  assert.strictEqual(result.updatedAt, 1760000100000);
  assert.strictEqual(result.messages.length, 2);
  assert.deepStrictEqual(plain(result.messages.map((m) => m.role)), ['user', 'assistant']);
  assert.strictEqual(result.messages[1].model, 'gpt-5');
  assert.deepStrictEqual(plain(result.messages[1].blocks), [
    { type: 'text', text: 'Hi there' },
    { type: 'image', ref: 'file-service://img-1', alt: 'image' }
  ]);

  const json = AICE.toJsonObject(result);
  assert.strictEqual(json.schema, 'aice.conversation.v1');
  assert.strictEqual(json.messageCount, 2);
  assert.strictEqual(json.raw, undefined, 'raw payload must not be exported');
}

async function testChatGPTWebSearch() {
  const conversationId = '44444444-4444-4444-4444-444444444444';
  const citeA = '\ue200cite\ue202turn0search0\ue201';
  const citeB = '\ue200url\ue202https://endpoint.dev/doc\ue201';
  const raw = {
    title: 'GPT search',
    current_node: 'n4',
    mapping: {
      n1: {
        id: 'n1',
        parent: null,
        message: {
          author: { role: 'user' },
          create_time: 1760000001,
          content: { content_type: 'text', parts: ['search something'] },
          metadata: {}
        }
      },
      n2: {
        id: 'n2',
        parent: 'n1',
        message: {
          author: { role: 'assistant' },
          create_time: 1760000002,
          content: { content_type: 'code', text: '' },
          metadata: {
            model_slug: 'gpt-5',
            reasoning_status: 'is_reasoning',
            reasoning_title: 'Searching the web',
            search_queries: ['ai news']
          }
        }
      },
      n3: {
        id: 'n3',
        parent: 'n2',
        message: {
          author: { role: 'tool' },
          create_time: 1760000003,
          content: { content_type: 'text', parts: [''] },
          metadata: {
            search_result_groups: [
              { domain: 'example.com', entries: [{ title: 'Example result', url: 'https://example.com/a' }] },
              { domain: 'news.dev', entries: [{ url: 'https://news.dev/b' }] }
            ]
          }
        }
      },
      n4: {
        id: 'n4',
        parent: 'n3',
        message: {
          author: { role: 'assistant' },
          create_time: 1760000004,
          content: { content_type: 'text', parts: [`Found it${citeA} and the ${citeB} too`] },
          metadata: {
            model_slug: 'gpt-5',
            content_references: [
              { type: 'url', title: 'Source one', url: 'https://source-one.dev/x', matched_text: citeA },
              { type: 'cite', matched_text: citeB },
              { type: 'image_group', url: 'https://images.dev/not-a-source.png' },
              { type: 'sources_footnote', sources: [{ title: 'Footnote source', url: 'https://footnote.dev/z' }] }
            ]
          }
        }
      }
    }
  };

  const AICE = loadPlatform('src/platforms/chatgpt.js', {
    pathname: `/c/${conversationId}`,
    href: `https://chatgpt.com/c/${conversationId}`,
    fetchImpl: async (url) => {
      if (url === '/api/auth/session') return jsonResponse({ accessToken: 'token' });
      if (url === `/backend-api/conversation/${conversationId}`) return jsonResponse(raw);
      throw new Error('unexpected URL ' + url);
    }
  });

  const result = await AICE.platforms.chatgpt.extract();
  assert.deepStrictEqual(plain(result.messages.map((m) => m.role)), ['user', 'assistant', 'assistant']);
  assert.strictEqual(result.messages[1].sources, undefined, 'search step forwards its sources');
  assert.deepStrictEqual(plain(result.messages[1].blocks), [{ type: 'tool', name: 'code', input: '' }]);
  assert.deepStrictEqual(plain(result.messages[2].blocks), [
    { type: 'text', text: 'Found it and the https://endpoint.dev/doc too' }
  ]);
  assert.deepStrictEqual(plain(result.messages[2].sources), [
    { title: 'Example result', url: 'https://example.com/a' },
    { title: 'news.dev', url: 'https://news.dev/b' },
    { title: 'Source one', url: 'https://source-one.dev/x' },
    { title: 'Footnote source', url: 'https://footnote.dev/z' }
  ]);

  const md = AICE.renderMarkdown(result);
  assert(!md.includes('\ue200') && !md.includes('\ue202'), 'citation markers must never reach the export');
  assert.strictEqual(md.split('**Sources:**').length - 1, 1, 'sources render once, on the answer');
  assert(md.includes('- [Example result](https://example.com/a)'));
  assert(md.includes('- [news.dev](https://news.dev/b)'));
  assert(md.includes('- [Source one](https://source-one.dev/x)'));
  assert(md.includes('- [Footnote source](https://footnote.dev/z)'));
  assert(md.includes('Found it and the https://endpoint.dev/doc too'));

  const mdOff = AICE.renderMarkdown(result, { includeSources: false });
  assert(!mdOff.includes('**Sources:**'), 'sources can be disabled');

  const json = AICE.toJsonObject(result);
  assert.strictEqual(json.messages[2].sources.length, 4, 'sources must stay in JSON');
}

async function testChatGPTFallback() {
  const conversationId = '22222222-2222-2222-2222-222222222222';
  const AICE = loadPlatform('src/platforms/chatgpt.js', {
    pathname: `/c/${conversationId}`,
    href: `https://chatgpt.com/c/${conversationId}`,
    fetchImpl: async () => {
      throw new Error('network down');
    }
  });

  await assert.rejects(
    () => AICE.platforms.chatgpt.extract(),
    /network down[\s\S]*Page scraping found no messages either/
  );
}

async function testClaude() {
  const conversationId = '33333333-3333-3333-3333-333333333333';
  const raw = {
    uuid: conversationId,
    name: 'Claude sample',
    created_at: '2026-01-02T03:04:05.000Z',
    updated_at: '2026-01-02T05:00:00.000Z',
    current_leaf_message_uuid: 'm4',
    chat_messages: [
      {
        uuid: 'm1',
        parent_message_uuid: null,
        sender: 'human',
        created_at: '2026-01-02T03:04:06.000Z',
        content: [{ type: 'text', text: 'Hello' }]
      },
      {
        uuid: 'm2',
        parent_message_uuid: 'm1',
        sender: 'assistant',
        created_at: '2026-01-02T03:04:06.500Z',
        content: [{ type: 'text', text: 'Old abandoned answer' }]
      },
      {
        uuid: 'm3',
        parent_message_uuid: 'm1',
        sender: 'human',
        created_at: '2026-01-02T03:04:07.000Z',
        content: [{ type: 'text', text: 'Try again' }]
      },
      {
        uuid: 'm4',
        parent_message_uuid: 'm3',
        sender: 'assistant',
        created_at: '2026-01-02T03:04:08.000Z',
        text: 'Here is the page.',
        content: [
          { type: 'thinking', thinking: 'Let me think.' },
          { type: 'thinking', summaries: [{ summary: 'Looked up the page.' }] },
          { type: 'text', text: 'Here is the page.' },
          {
            type: 'tool_use',
            name: 'artifacts',
            input: { command: 'create', type: 'text/html', content: '<h1>Hi</h1>' }
          }
        ],
        files: [{ file_name: 'notes.txt', file_type: 'text/plain', extracted_content: 'notes body' }]
      }
    ]
  };

  const AICE = loadPlatform('src/platforms/claude.js', {
    pathname: `/chat/${conversationId}`,
    href: `https://claude.ai/chat/${conversationId}`,
    fetchImpl: async (url) => {
      if (url === '/api/organizations') return jsonResponse([{ uuid: 'org-1' }]);
      if (url.startsWith('/api/organizations/org-1/chat_conversations/')) return jsonResponse(raw);
      throw new Error('unexpected URL ' + url);
    }
  });

  const info = AICE.platforms.claude.getInfo();
  assert.strictEqual(info.supported, true);

  const result = await AICE.platforms.claude.extract();
  assert.strictEqual(result.source, 'api');
  assert.strictEqual(result.title, 'Claude sample');
  assert.strictEqual(result.updatedAt, Date.parse('2026-01-02T05:00:00.000Z'));
  assert.strictEqual(result.messages.length, 3);
  assert.deepStrictEqual(plain(result.messages.map((m) => m.role)), ['user', 'user', 'assistant']);
  assert.deepStrictEqual(plain(result.messages[0].blocks), [{ type: 'text', text: 'Hello' }]);
  assert.deepStrictEqual(plain(result.messages[1].blocks), [{ type: 'text', text: 'Try again' }]);
  assert(!JSON.stringify(result.messages).includes('Old abandoned answer'), 'branch should be excluded');
  assert.deepStrictEqual(plain(result.messages[2].blocks), [
    { type: 'thinking', text: 'Let me think.' },
    { type: 'thinking', text: 'Looked up the page.' },
    { type: 'text', text: 'Here is the page.' },
    { type: 'code', language: 'text/html', text: '<h1>Hi</h1>' },
    { type: 'attachment', name: 'notes.txt', mime: 'text/plain', text: 'notes body' }
  ]);

  const md = AICE.renderMarkdown(result);
  assert(md.includes('## User:'));
  assert(md.includes('## Assistant:'));
  assert(!md.includes('Let me think.'), 'thinking must be hidden by default');
  assert(!md.includes('notes body') || md.includes('> File: notes.txt'), 'attachment label missing');
  assert(md.includes('```text/html'));
  assert(md.includes('> File: notes.txt'));
  assert(md.includes('```text\nnotes body'));

  const mdForced = AICE.renderMarkdown(result, { includeThoughtProcess: true, includeToolSteps: true });
  assert(!mdForced.includes('Let me think.'), 'thinking must never appear in Markdown');
  assert(!mdForced.includes('tool result'), 'tool steps must never appear in Markdown');
}

async function testClaudeWebSearch() {
  const conversationId = '55555555-5555-5555-5555-555555555555';
  const raw = {
    uuid: conversationId,
    name: 'Claude search',
    current_leaf_message_uuid: 'm4',
    chat_messages: [
      {
        uuid: 'm1',
        parent_message_uuid: null,
        sender: 'human',
        created_at: '2026-01-02T03:04:06.000Z',
        content: [{ type: 'text', text: 'search something' }]
      },
      {
        uuid: 'm2',
        parent_message_uuid: 'm1',
        sender: 'assistant',
        created_at: '2026-01-02T03:04:07.000Z',
        content: [
          { type: 'thinking', thinking: 'I should search.' },
          { type: 'tool_use', name: 'web_search', input: { query: 'ai news' } }
        ]
      },
      {
        uuid: 'm3',
        parent_message_uuid: 'm2',
        sender: 'human',
        created_at: '2026-01-02T03:04:08.000Z',
        text: 'tool output text that should stay hidden',
        content: [
          {
            type: 'tool_result',
            name: 'web_search',
            content: [
              { type: 'knowledge', title: 'Example doc', url: 'https://example.com/doc', metadata: { site_domain: 'example.com' } },
              { type: 'knowledge', title: '', url: 'https://no-title.dev/x' },
              { type: 'text', text: 'noise that is not a source' }
            ]
          }
        ]
      },
      {
        uuid: 'm4',
        parent_message_uuid: 'm3',
        sender: 'assistant',
        created_at: '2026-01-02T03:04:09.000Z',
        content: [{ type: 'text', text: 'According to the docs.' }]
      }
    ]
  };

  const AICE = loadPlatform('src/platforms/claude.js', {
    pathname: `/chat/${conversationId}`,
    href: `https://claude.ai/chat/${conversationId}`,
    fetchImpl: async (url) => {
      if (url === '/api/organizations') return jsonResponse([{ uuid: 'org-1' }]);
      if (url.startsWith('/api/organizations/org-1/chat_conversations/')) return jsonResponse(raw);
      throw new Error('unexpected URL ' + url);
    }
  });

  const result = await AICE.platforms.claude.extract();
  assert.deepStrictEqual(plain(result.messages.map((m) => m.role)), ['user', 'assistant', 'user', 'assistant']);
  assert.strictEqual(result.messages[1].sources, undefined);
  assert.strictEqual(result.messages[2].sources, undefined, 'tool-result message must not keep the sources');
  assert(
    !result.messages[2].blocks.some((block) => block.type === 'text'),
    'tool-result message text must not become a visible text block'
  );
  assert.deepStrictEqual(plain(result.messages[3].sources), [
    { title: 'Example doc', url: 'https://example.com/doc' },
    { title: 'https://no-title.dev/x', url: 'https://no-title.dev/x' }
  ]);

  const md = AICE.renderMarkdown(result);
  assert.strictEqual(md.split('## Assistant:').length - 1, 1, 'step messages stay hidden by default');
  assert.strictEqual(md.split('**Sources:**').length - 1, 1, 'sources render once, on the answer');
  assert(!md.includes('tool output text that should stay hidden'), 'tool-result text must never reach Markdown');
  assert(md.includes('- [Example doc](https://example.com/doc)'));
  assert(!md.includes('noise that is not a source'), 'non-knowledge tool output must not become a source');
}

(async () => {
  await testChatGPT();
  await testChatGPTWebSearch();
  await testChatGPTFallback();
  await testClaude();
  await testClaudeWebSearch();
  console.log('platform tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
