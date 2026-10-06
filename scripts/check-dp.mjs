// 构建闸：生产包里不许带着 DEV 取景夹具（src/dev/dp.ts）。
//
// 夹具靠 `import.meta.env.DEV` 排在最前来被裁掉，而「以为裁掉了」和「真裁掉了」
// 之间隔着一整套构建配置——有人把那句 if 挪到参数解析之后、或改成静态 import，
// 线上就会多一个能被人用 URL 参数摆布状态的口（虽然只改显示，也是白送的攻击面）。
// 所以每次构建都拿产物本身对一遍。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] ?? 'dist';

/** 只在夹具源码里出现的串；任何一条出现在产物里就说明夹具没被裁掉。 */
const MARKERS = ['SunrunnerX', '不是数，按默认', 'silenceStoreWrites', 'installDp'];

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

if (!statSync(DIST, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`check-dp: 找不到构建产物目录 ${DIST}（应在 vite build 之后运行）`);
  process.exit(1);
}

const leaks = [];
for (const file of jsFiles(DIST)) {
  const code = readFileSync(file, 'utf8');
  for (const m of MARKERS) if (code.includes(m)) leaks.push(`${file}: ${m}`);
}
if (leaks.length) {
  console.error('check-dp: 生产包里出现了取景夹具，检查 main.ts 里的 DEV 闸门：\n  ' + leaks.join('\n  '));
  process.exit(1);
}
console.log(`check-dp: 生产包干净（${MARKERS.length} 个夹具标记，0 命中）`);
