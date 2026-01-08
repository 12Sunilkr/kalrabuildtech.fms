import fs from 'fs';
const text = fs.readFileSync('server/index.js', 'utf8');
let stack = [];
let inS=false, inD=false, inT=false, inLineC=false, inBlockC=false, esc=false;
let line=1, col=0;
for (let i=0;i<text.length;i++){
  const ch = text[i];
  col++;
  if (ch === '\n') { line++; col=0; if (inLineC) inLineC=false; continue; }
  if (inLineC) continue;
  if (inBlockC){ if (ch === '*' && text[i+1] === '/') { inBlockC=false; i++; col++; } continue; }
  if (esc) { esc=false; continue; }
  if (inS){ if (ch === "'") inS=false; else if (ch === "\\") esc=true; continue; }
  if (inD){ if (ch === '"') inD=false; else if (ch === '\\') esc=true; continue; }
  if (inT){ if (ch === '`') inT=false; else if (ch === '\\') esc=true; continue; }

  if (ch === '/' && text[i+1] === '/') { inLineC = true; continue; }
  if (ch === '/' && text[i+1] === '*') { inBlockC = true; i++; col++; continue; }
  if (ch === "'") { inS = true; continue; }
  if (ch === '"') { inD = true; continue; }
  if (ch === '`') { inT = true; continue; }
  if (ch === '{') { stack.push({line,col,index:i}); continue; }
  if (ch === '}') { if (stack.length===0) { console.log('Extra closing } at', line, col); } else stack.pop(); continue; }
}
console.log('Unmatched opens:', stack.length);
if (stack.length) {
  const last = stack[stack.length-1];
  console.log('Last unmatched at', last);
  const lines = text.split('\n');
  const start = Math.max(0, last.line-6);
  const end = Math.min(lines.length, last.line+5);
  console.log(lines.slice(start,end).map((l,idx)=>`${start+idx+1}: ${l}`).join('\n'));
}
