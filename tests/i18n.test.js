/* Locale parity checks. Run: node tests/i18n.test.js */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const locales = ['en', 'zh_CN'];
const data = {};

for (const loc of locales) {
  data[loc] = JSON.parse(
    fs.readFileSync(path.join(root, '_locales', loc, 'messages.json'), 'utf8')
  );
}

const enKeys = Object.keys(data.en).sort();
assert(enKeys.length > 0, 'en locale is empty');

for (const loc of locales) {
  assert.deepStrictEqual(
    Object.keys(data[loc]).sort(),
    enKeys,
    `${loc} must define the same keys as en`
  );

  for (const [key, value] of Object.entries(data[loc])) {
    assert.strictEqual(typeof value.message, 'string', `${loc}.${key}: message missing`);
    assert(value.message.trim().length > 0, `${loc}.${key}: message is empty`);

    const placeholders = value.placeholders || {};
    const used = [...value.message.matchAll(/\$([A-Z0-9_]+)\$/g)].map((m) => m[1].toLowerCase());

    for (const name of used) {
      assert(placeholders[name], `${loc}.${key}: $${name.toUpperCase()}$ has no placeholder`);
    }
    for (const [name, def] of Object.entries(placeholders)) {
      assert(used.includes(name), `${loc}.${key}: placeholder ${name} is unused`);
      assert(/^\$\d+$/.test(def.content || ''), `${loc}.${key}.${name}: content must be $N`);
    }
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.strictEqual(manifest.default_locale, 'en', 'manifest default_locale must be en');

for (const value of [manifest.name, manifest.description, manifest.action.default_title]) {
  const match = /^__MSG_([A-Za-z0-9_]+)__$/.exec(value);
  assert(match, `manifest value must use __MSG__ placeholder: ${value}`);
  assert(data.en[match[1]], `manifest message ${match[1]} is missing from en`);
}

console.log('i18n tests passed');
