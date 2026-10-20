/* Minimal, dependency-free HTML -> Markdown converter (used only by the DOM fallback). */
(function () {
  'use strict';

  const AICE = (window.AICE = window.AICE || {});

  const BLOCK = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DETAILS', 'DIV', 'DL', 'FIELDSET',
    'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL'
  ]);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'BUTTON', 'CANVAS']);

  function isBlock(el) {
    return el && el.nodeType === 1 && BLOCK.has(el.tagName);
  }

  function fence(text, lang) {
    let mark = '```';
    while (text.includes(mark)) mark += '`';
    return `${mark}${lang || ''}\n${text.replace(/\n+$/, '')}\n${mark}`;
  }

  function katexSource(el) {
    if (!el || el.nodeType !== 1) return '';
    const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
    if (annotation && annotation.textContent) return annotation.textContent.trim();
    return '';
  }

  function inlineChildren(node, ctx) {
    let out = '';
    for (const child of node.childNodes) out += inline(child, ctx);
    return out;
  }

  function inline(node, ctx) {
    if (node.nodeType === 3) {
      const parent = node.parentElement;
      const whiteSpace = parent ? getComputedStyle(parent).whiteSpace : '';
      if (whiteSpace && whiteSpace.indexOf('pre') === 0) return node.nodeValue;
      return node.nodeValue.replace(/\s+/g, ' ');
    }
    if (node.nodeType !== 1) return '';

    const el = node;

    if (SKIP.has(el.tagName)) return '';
    if (el.getAttribute('aria-hidden') === 'true' && !el.classList.contains('katex')) return '';
    const computed = getComputedStyle(el);
    if (computed.display === 'none' || computed.visibility === 'hidden') return '';

    if (el.classList && el.classList.contains('katex')) {
      const src = katexSource(el);
      if (src) return src.startsWith('\\[') || src.startsWith('$$') ? src : `$${src}$`;
    }

    const tag = el.tagName;
    const inner = () => inlineChildren(el, ctx);

    switch (tag) {
      case 'BR':
        return '  \n';
      case 'STRONG':
      case 'B': {
        const t = inner().trim();
        return t ? `**${t}**` : '';
      }
      case 'EM':
      case 'I': {
        const t = inner().trim();
        return t ? `*${t}*` : '';
      }
      case 'DEL':
      case 'S':
      case 'STRIKE': {
        const t = inner().trim();
        return t ? `~~${t}~~` : '';
      }
      case 'CODE': {
        if (el.closest('pre')) return el.textContent || '';
        const t = el.textContent || '';
        if (!t) return '';
        const mark = t.includes('`') ? '``' : '`';
        return `${mark}${t}${mark}`;
      }
      case 'A': {
        const hrefAttr = el.getAttribute('href');
        const href = hrefAttr ? (el.href || hrefAttr) : '';
        const label = inner().trim() || href;
        if (!href || href.startsWith('javascript:')) return label;
        return `[${label}](${href})`;
      }
      case 'IMG': {
        const alt = (el.getAttribute('alt') || 'image').replace(/[\[\]]/g, '');
        const srcAttr = el.getAttribute('src');
        const src = srcAttr ? (el.src || srcAttr) : '';
        if (!src || src.startsWith('blob:') || src.startsWith('data:')) return `[${alt}]`;
        return `![${alt}](${src})`;
      }
      case 'PRE': {
        const codeEl = el.querySelector('code') || el;
        const langClass = (codeEl.className || '').match(/language-([\w+#.-]+)/);
        const lang = langClass ? langClass[1] : '';
        const text = (codeEl.innerText || codeEl.textContent || '').replace(/\n+$/, '');
        return `\n\n${fence(text, lang)}\n\n`;
      }
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
        const level = Number(tag[1]);
        return `\n\n${'#'.repeat(level)} ${inner().trim()}\n\n`;
      }
      case 'HR':
        return '\n\n---\n\n';
      case 'BLOCKQUOTE': {
        const text = inner()
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n[ \t]+/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        return `\n\n${text.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')}\n\n`;
      }
      case 'UL':
      case 'OL':
        return `\n\n${listToMarkdown(el, ctx, 0)}\n\n`;
      case 'TABLE':
        return `\n\n${tableToMarkdown(el, ctx)}\n\n`;
      case 'DETAILS': {
        const summaryEl = el.querySelector(':scope > summary');
        const summary = summaryEl ? inlineChildren(summaryEl, ctx).trim() : '';
        const body = Array.from(el.childNodes)
          .filter((n) => n !== summaryEl)
          .map((n) => inline(n, ctx))
          .join('');
        return `\n\n<details><summary>${summary || 'Details'}</summary>\n\n${body.trim()}\n\n</details>\n\n`;
      }
      case 'P':
      case 'DIV':
      case 'SECTION':
      case 'ARTICLE':
        return `\n\n${inner().trim()}\n\n`;
      default:
        return inner();
    }
  }

  function listToMarkdown(list, ctx, depth) {
    const ordered = list.tagName === 'OL';
    const indent = '  '.repeat(depth);
    let index = Number(list.getAttribute('start') || 1);
    const lines = [];

    for (const li of list.children) {
      if (li.tagName !== 'LI') continue;
      const marker = ordered ? `${index++}.` : '-';
      const nested = [];
      let body = '';

      for (const child of li.childNodes) {
        if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) {
          nested.push(listToMarkdown(child, ctx, depth + 1));
        } else {
          body += inline(child, ctx);
        }
      }

      const text = body.trim().replace(/\n{3,}/g, '\n\n');
      const indented = text.split('\n').join(`\n${indent}  `);
      lines.push(`${indent}${marker} ${indented}`);
      if (nested.length) lines.push(nested.join('\n'));
    }

    return lines.join('\n');
  }

  function tableToMarkdown(table, ctx) {
    const rows = [];
    for (const tr of table.querySelectorAll('tr')) {
      const cells = [];
      for (const cell of tr.children) {
        if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue;
        const text = inlineChildren(cell, ctx)
          .replace(/\s*\n\s*/g, ' ')
          .replace(/\|/g, '\\|')
          .trim();
        cells.push(text);
      }
      if (cells.length) rows.push(cells);
    }
    if (!rows.length) return '';
    const width = Math.max(...rows.map((r) => r.length));
    const normalized = rows.map((r) => {
      while (r.length < width) r.push('');
      return r;
    });
    const header = normalized[0];
    const divider = header.map(() => '---');
    const body = normalized.slice(1);
    return [header, divider, ...body]
      .map((r) => `| ${r.join(' | ')} |`)
      .join('\n');
  }

  AICE.domToMarkdown = function (root) {
    if (!root) return '';
    const raw = inline(root, {});
    return raw
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '');
  };
})();
