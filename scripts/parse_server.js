import fs from 'fs';
import { parse } from 'acorn';
const src = fs.readFileSync('server/index.js', 'utf8');
try {
  parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  console.log('parsed ok');
} catch (e) {
  console.error('Parse error:', e.message);
  console.error('At', e.loc);
}
