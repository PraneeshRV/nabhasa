// Replay Write/Edit tool calls from a claude session jsonl to reconstruct a file.
const fs = require('fs');
const [,, jsonl, target] = process.argv;
let content = null, wroteDone = false, ops = 0;
for (const line of fs.readFileSync(jsonl, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  const blocks = e?.message?.content;
  if (!Array.isArray(blocks)) continue;
  for (const b of blocks) {
    if (b.type !== 'tool_use') continue;
    const fp = b.input?.file_path || '';
    if ((b.name === 'Write') && fp.endsWith('.a2-done')) wroteDone = true;
    if (!fp.endsWith(target)) continue;
    if (b.name === 'Write') { content = b.input.content; ops++; }
    else if (b.name === 'Edit' && content !== null) {
      const { old_string, new_string, replace_all } = b.input;
      content = replace_all ? content.split(old_string).join(new_string)
                            : content.replace(old_string, new_string);
      ops++;
    }
  }
}
console.error(`ops=${ops} wroteDone=${wroteDone} len=${content ? content.length : 0}`);
if (content) process.stdout.write(content);
