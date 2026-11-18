// Regenerate the shareable condition guide from the application's current result copy.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const context = vm.createContext({ window: { GlobalState: { lang: 'ko' } } });
for (const path of ['voiceMemesound.js', 'earCode.js', 'copy.js', 'resulttest/catalog.js']) {
  vm.runInContext(readFileSync(new URL(path, root), 'utf8'), context, { filename: path });
}
const html = vm.runInContext('ResultCopyCatalog.documentHtml({worksheet:false})', context);
writeFileSync(new URL('resulttest/guide.html', root), html);
console.log('Updated resulttest/guide.html from current application copy.');
