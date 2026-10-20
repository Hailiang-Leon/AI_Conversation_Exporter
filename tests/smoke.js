/* Minimal smoke test for the pure serializers. Run: node tests/smoke.js */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const sandbox = {
  window: {},
  console,
  setTimeout,
  clearTimeout,
  URL
};
vm.createContext(sandbox);

for (const file of ['src/common/util.js', 'src/common/markdown.js']) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

const AICE = sandbox.window.AICE;
assert(AICE, 'AICE namespace missing');
assert.strictEqual(typeof AICE.renderMarkdown, 'function');
assert.strictEqual(typeof AICE.renderJson, 'function');

const conversation = {
  platform: 'chatgpt',
  title: 'Demo: `code` & tables',
  url: 'https://chatgpt.com/c/00000000-0000-0000-0000-000000000000',
  conversationId: '00000000-0000-0000-0000-000000000000',
  createdAt: Date.UTC(2026, 0, 2, 3, 4, 5),
  updatedAt: Date.UTC(2026, 0, 2, 4, 5, 6),
  source: 'api',
  messages: [
    {
      role: 'user',
      createdAt: Date.UTC(2026, 0, 2, 3, 4, 5),
      model: null,
      blocks: [{ type: 'text', text: 'Write a function.' }]
    },
    {
      role: 'assistant',
      createdAt: Date.UTC(2026, 0, 2, 3, 4, 6),
      model: 'gpt-5',
      blocks: [
        { type: 'thinking', text: 'The user wants code.' },
        { type: 'text', text: 'Here you go:' },
        { type: 'code', language: 'js', text: 'const x = 1;\nconsole.log(x);' },
        { type: 'tool', name: 'execution output', output: '1' },
        { type: 'image', ref: 'file-service://abc', alt: 'chart' }
      ]
    }
  ],
  raw: { ok: true },
  warnings: []
};

const md = AICE.renderMarkdown(conversation);
const assistantStamp = AICE.formatDate(conversation.messages[1].createdAt, true);

assert(md.startsWith('# Demo: `code` & tables'), 'markdown title missing');
assert(md.includes('**Created:** ') && md.includes('**Updated:** '), 'header date lines missing');
assert(md.includes('**Link:** [https://chatgpt.com/c/'), 'header link line missing');
assert(md.includes('## User:'), 'user heading missing');
assert(md.includes('## Assistant:'), 'assistant heading missing');
assert(md.includes(`> ${assistantStamp} · gpt-5`), 'assistant meta line missing');
assert(md.includes('```js\nconst x = 1;'), 'code fence missing');
assert(!md.includes('Thinking'), 'thinking must be off by default');
assert(!md.includes('execution output'), 'tool steps must be off by default');
assert(md.includes('[chart: file-service://abc]'), 'image reference missing');
assert(!md.includes('page DOM'), 'API export should not claim DOM source');
assert(!md.includes('\n---'), 'no horizontal rules between messages');

const mdForced = AICE.renderMarkdown(conversation, { includeThoughtProcess: true, includeToolSteps: true });
assert(!mdForced.includes('Thinking'), 'thinking must never appear in Markdown');
assert(!mdForced.includes('execution output'), 'tool steps must never appear in Markdown');

const mdCustom = AICE.renderMarkdown(conversation, {
  roleUser: 'Prompt',
  roleAssistant: 'Response',
  includeModel: false,
  includeTimestamps: false
});
assert(mdCustom.includes('## Prompt:') && mdCustom.includes('## Response:'), 'custom role labels missing');
assert(!mdCustom.includes('gpt-5'), 'model name should be omitted when disabled');
assert(!mdCustom.includes(`> ${assistantStamp}`), 'message timestamps should be omitted when disabled');
assert(mdCustom.includes('**Exported:** '), 'header metadata should always be present');

const invalidDates = {
  ...conversation,
  createdAt: 'not-a-date',
  updatedAt: 'not-a-date',
  messages: [
    { ...conversation.messages[0], createdAt: 'not-a-date' }
  ]
};
const mdInvalidDates = AICE.renderMarkdown(invalidDates);
assert(!mdInvalidDates.includes('**Created:**'), 'invalid created date must be omitted');
assert(!mdInvalidDates.includes('**Updated:**'), 'invalid updated date must be omitted');
assert.strictEqual(JSON.parse(AICE.renderJson(invalidDates)).createdAtISO, null, 'invalid ISO date must be null');

// Agent turns are split into several messages; thinking/tool-only ones must not
// produce empty "## Assistant:" sections when those blocks are excluded.
const agentTurn = {
  ...conversation,
  messages: [
    conversation.messages[0],
    {
      role: 'assistant',
      createdAt: Date.UTC(2026, 0, 2, 3, 4, 7),
      model: 'gpt-5',
      blocks: [
        { type: 'thinking', text: 'Step one.' },
        { type: 'tool', name: 'web_search', input: { query: 'react hooks' } }
      ]
    },
    {
      role: 'assistant',
      createdAt: Date.UTC(2026, 0, 2, 3, 4, 8),
      model: 'gpt-5',
      blocks: [{ type: 'text', text: 'Final answer.' }]
    }
  ]
};

const mdAgent = AICE.renderMarkdown(agentTurn);
assert(!mdAgent.includes('Empty message'), 'empty sections must be skipped');
assert(!mdAgent.includes('Step one.'), 'thinking must stay hidden by default');
assert.strictEqual(mdAgent.split('## Assistant:').length - 1, 1, 'only the non-empty assistant turn is kept');
assert(mdAgent.includes('Final answer.'), 'final answer missing');
assert.strictEqual(AICE.markdownMessageCount(agentTurn), 2, 'status count must match rendered MD sections');

const mdAgentForced = AICE.renderMarkdown(agentTurn, { includeThoughtProcess: true, includeToolSteps: true });
assert.strictEqual(mdAgentForced.split('## Assistant:').length - 1, 1, 'thinking/tool-only turn must be skipped');
assert(!mdAgentForced.includes('Step one.'), 'thinking must never appear in Markdown');
assert(!mdAgentForced.includes('web_search'), 'tool steps must never appear in Markdown');

const mdNothing = AICE.renderMarkdown({ ...conversation, messages: [agentTurn.messages[1]] });
assert(mdNothing.includes('_No exportable text content'), 'fallback note missing');

// Blank lines inside code/text must survive: only the layout between blocks is
// normalized, never the payload itself.
const withBlankLines = {
  ...conversation,
  messages: [
    conversation.messages[0],
    {
      role: 'assistant',
      createdAt: Date.UTC(2026, 0, 2, 3, 4, 6),
      model: null,
      blocks: [
        { type: 'text', text: 'Step one.\n\n\n\nStep two.' },
        { type: 'code', language: 'r', text: 'a <- 1\n\n\n\nb <- 2' }
      ]
    }
  ]
};
const mdBlank = AICE.renderMarkdown(withBlankLines);
assert(mdBlank.includes('Step one.\n\n\n\nStep two.'), 'blank lines in text must be preserved');
assert(mdBlank.includes('a <- 1\n\n\n\nb <- 2'), 'blank lines in code must be preserved');

// Web-search sources: optional, on by default, rendered like the original
// exporters ("---" + "**Sources:**" + link list at the end of the answer).
const withSources = {
  ...conversation,
  messages: [
    conversation.messages[0],
    {
      ...conversation.messages[1],
      sources: [
        { title: 'Example [docs]', url: 'https://example.com/a' },
        { title: '', url: 'https://plain.dev/b' }
      ]
    }
  ]
};

const mdSources = AICE.renderMarkdown(withSources);
assert(mdSources.includes('---\n\n**Sources:**'), 'sources block missing by default');
assert(mdSources.includes('- [Example \\[docs\\]](https://example.com/a)'), 'brackets in titles must be escaped');
assert(mdSources.includes('- [https://plain.dev/b](https://plain.dev/b)'), 'title falls back to the url');
assert.strictEqual(mdSources.split('**Sources:**').length - 1, 1, 'sources render once per message');
assert(!mdSources.includes('\n---\n\n---'), 'no doubled separators');

const withUntitledSource = {
  ...withSources,
  messages: [
    withSources.messages[0],
    {
      ...withSources.messages[1],
      sources: [{ url: 'https://no-title.dev' }]
    }
  ]
};
assert(
  AICE.renderMarkdown(withUntitledSource).includes('- [https://no-title.dev](https://no-title.dev)'),
  'missing source title must fall back to the url'
);

const mdNoSources = AICE.renderMarkdown(withSources, { includeSources: false });
assert(!mdNoSources.includes('**Sources:**'), 'sources must be omitted when disabled');

const jsonSources = JSON.parse(AICE.renderJson(withSources));
assert.deepStrictEqual(jsonSources.messages[1].sources, withSources.messages[1].sources, 'sources must stay in JSON');
const jsonNoSources = JSON.parse(AICE.renderJson(withSources, { includeSources: false }));
assert.strictEqual(jsonNoSources.messages[1].sources.length, 2, 'JSON must keep sources even when MD sources are disabled');

assert.strictEqual(AICE.stripCitationMarkers('a\ue200cite\ue202turn0search0\ue201b'), 'ab');
assert.strictEqual(AICE.stripCitationMarkers('see \ue200url\ue202https://x.dev\ue201'), 'see https://x.dev');
assert.strictEqual(AICE.stripCitationMarkers('plain'), 'plain');

const forwarded = AICE.attachSources([
  { role: 'user', blocks: [{ type: 'text', text: 'q' }] },
  { role: 'assistant', blocks: [{ type: 'thinking', text: 'searching' }], sources: [{ title: 'A', url: 'https://a.dev' }] },
  { role: 'user', blocks: [{ type: 'tool', name: 'tool result' }], sources: [{ title: 'B', url: 'https://b.dev' }] },
  { role: 'assistant', blocks: [{ type: 'text', text: 'answer' }] }
]);
assert.strictEqual(forwarded[1].sources, undefined, 'search step must not keep the sources');
assert.strictEqual(forwarded[2].sources, undefined, 'tool-result message must not keep the sources');
assert.strictEqual(forwarded[3].sources.map((s) => s.url).join(), 'https://a.dev,https://b.dev');

const trailingSources = AICE.attachSources([
  { role: 'user', blocks: [{ type: 'text', text: 'q' }] },
  { role: 'assistant', blocks: [{ type: 'text', text: 'answer' }] },
  { role: 'user', blocks: [{ type: 'tool', name: 'tool result' }], sources: [{ title: 'C', url: 'https://c.dev' }] }
]);
assert.strictEqual(trailingSources[1].sources.map((s) => s.url).join(), 'https://c.dev', 'leftovers go to the previous answer');

const json = JSON.parse(AICE.renderJson(conversation));
assert.strictEqual(json.schema, 'aice.conversation.v1');
assert.strictEqual(json.platform, 'chatgpt');
assert.strictEqual(json.messages.length, 2);
assert(json.messages[1].blocks.some((block) => block.type === 'thinking'), 'thinking must stay in JSON');
assert(json.messages[1].blocks.some((block) => block.type === 'tool'), 'tool blocks must stay in JSON');
assert.strictEqual(json.raw, undefined, 'raw API data must never be exported');

const domConversation = { ...conversation, source: 'dom' };
assert(AICE.renderMarkdown(domConversation).includes('**Source:** page DOM'), 'DOM warning missing');

assert.strictEqual(AICE.sanitizeFilename('a/b:c*?"<>|', 'x'), 'a b c');
assert.strictEqual(AICE.sanitizeFilename('   ', 'x'), 'x');
const longChinese = AICE.sanitizeFilename('中'.repeat(200), 'x');
assert(Buffer.byteLength(longChinese, 'utf8') <= 180, 'long CJK filenames must stay under the filesystem limit');
assert.strictEqual(Array.from(longChinese).length, 60, 'CJK filename must be truncated by UTF-8 bytes');
const longEmoji = AICE.sanitizeFilename('😀'.repeat(100), 'x');
assert(Buffer.byteLength(longEmoji, 'utf8') <= 180, 'emoji filenames must stay under the filesystem limit');
assert.strictEqual(Array.from(longEmoji).length, 45, 'emoji filename must not split surrogate pairs');
assert.strictEqual(AICE.absoluteUrl('/api/x', 'https://claude.ai'), 'https://claude.ai/api/x');
assert.strictEqual(AICE.absoluteUrl('https://example.com/a', 'https://claude.ai'), 'https://example.com/a');
assert.strictEqual(AICE.absoluteUrl('//cdn.example.com/a.png', 'https://claude.ai'), 'https://cdn.example.com/a.png');

console.log('smoke test passed');
