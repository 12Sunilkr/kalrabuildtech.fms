import fs from 'fs';
const s = fs.readFileSync('server/index.js','utf8');
let stack = [];
let inS=false,inD=false,inT=false,inC=false,inBlockC=false;
for (let i=0;i<s.length;i++){
  const ch = s[i];
  const prev = s[i-1];
  if (inS) { if (ch === "'" && prev !== '\\') inS = false; continue; }
  if (inD) { if (ch === '"' && prev !== '\\') inD = false; continue; }
  if (inT) { if (ch === '`' && prev !== '\\') inT = false; continue; }
  if (inC) { if (ch === '\n') inC = false; continue; }
  if (inBlockC) { if (ch === '*' && s[i+1] === '/') { inBlockC = false; i++; continue; } }
  if (ch === '/' && s[i+1] === '/') { inC = true; }
  else if (ch === '/' && s[i+1] === '*') { inBlockC = true; i++; }
  else if (ch === "'") inS = true;
  else if (ch === '"') inD = true;
  else if (ch === '`') inT = true;
  else if (ch === '{') stack.push(i);
  else if (ch === '}') stack.pop();
}
console.log('stack length', stack.length);
if (stack.length) {
  // show surrounding lines for last unmatched
  const pos = stack[stack.length-1];
  const lines = s.slice(0,pos).split('\n');
  const lineNo = lines.length;
  const start = Math.max(0, lineNo-5);
  const end = lineNo+5;
  const out = s.split('\n').slice(start, end).map((l, idx) => `${start+idx+1}: ${l}`);
  console.log(out.join('\n'));
}
