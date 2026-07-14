// 文案与字体：古体楷书字体栈 + 简繁对照表 + 运行时切换。
// 所有可见文字集中于此，UI/游戏通过 t(key) 取当前书写体的文本。

export type Script = 'hans' | 'hant';

// 古体楷书字体栈（Windows 楷体 / Mac STKaiti / 兜底衬线），题名与旁白用之
export const FONT_KAI = '"STKaiti","KaiTi","楷体","BiauKai","DFKai-SB","KaiTi_GB2312",serif';
// HUD 数字用等宽衬线，兼顾易读与古意
export const FONT_HUD = '"STKaiti","KaiTi","楷体",serif';

// [简, 繁]
const TABLE: Record<string, [string, string]> = {
  'title.main': ['逐 光', '逐 光'],
  'title.sub': ['夸 父 逐 日', '夸 父 逐 日'],
  'title.prologue': ['北方有神，名曰夸父，不量力，欲追日影', '北方有神，名曰夸父，不量力，欲追日影'],
  'title.ctrl1': ['方向键 / AD 奔走 · 空格 跃 · Shift/J 冲', '方向鍵 / AD 奔走 · 空格 躍 · Shift/J 衝'],
  'title.ctrl2': ['拾日光以壮行 · 逃长夜之追噬', '拾日光以壯行 · 逃長夜之追噬'],
  'title.ctrl3': ['触屏 · 进退奔走 · 跃 冲 · 跨大招', '觸屏 · 進退奔走 · 躍 衝 · 跨大招'],
  'title.start': ['按任意键，起而逐日', '按任意鍵，起而逐日'],
  'title.start.touch': ['轻触屏幕，起而逐日', '輕觸螢幕，起而逐日'],
  'title.script': ['T / 点此 · 简繁', 'T / 點此 · 簡繁'],
  'title.script.touch': ['点此 · 简繁', '點此 · 簡繁'],
  'mode.endless': ['常规无尽', '常規無盡'],
  'mode.daily': ['今日挑战', '今日挑戰'],
  'mode.switch': ['G / 点上方 · 切换模式', 'G / 點上方 · 切換模式'],
  'mode.switch.touch': ['点上方 · 切换模式', '點上方 · 切換模式'],
  'mode.dailyHint': ['每日同关 · 同场竞逐', '每日同關 · 同場競逐'],
  'mode.endlessHint': ['地形逐局随机 · 逐日无尽', '地形逐局隨機 · 逐日無盡'],
  'board.daily': ['今日挑战榜', '今日挑戰榜'],
  'board.endless': ['天下逐日榜', '天下逐日榜'],

  'hud.motes': ['日光', '日光'],
  'hud.dist': ['步', '步'],
  'hud.full': ['满', '滿'],
  'hud.score': ['功业', '功業'],
  'hud.dist2': ['路程', '路程'],
  'hud.mult': ['倍率', '倍率'],
  'hud.brimful': ['日光盈满', '日光盈滿'],
  'hud.charge': ['神力', '神力'],
  'hint.ult': ['神力盈满 · K 发动夸父跨步', '神力盈滿 · K 發動夸父跨步'],
  'pop.stride': ['夸父跨步', '夸父跨步'],
  'cheat.on': ['秘籍·夸父不竭 · 神力无尽', '秘籍·夸父不竭 · 神力無盡'],
  'cheat.off': ['秘籍解除', '秘籍解除'],

  'help.open': ['H / 点此 · 帮助', 'H / 點此 · 幫助'],
  'help.open.touch': ['点此 · 帮助', '點此 · 幫助'],
  'help.title': ['操 作 说 明', '操 作 說 明'],
  'help.move': ['方向键 / A D　—　奔走', '方向鍵 / A D　—　奔走'],
  'help.jump': ['空格 / ↑ / W　—　腾跃', '空格 / ↑ / W　—　騰躍'],
  'help.dash': ['Shift / J　—　疾冲（撞碎旱魃金乌）', 'Shift / J　—　疾衝（撞碎旱魃金烏）'],
  'help.ult': ['K　—　夸父跨步（神力满·一步跨一屏·无敌）', 'K　—　夸父跨步（神力滿·一步跨一屏·無敵）'],
  // 触屏变体：改说屏上按钮（进退跃冲跨），不提键位
  'help.move.touch': ['进 / 退　—　奔走', '進 / 退　—　奔走'],
  'help.jump.touch': ['跃　—　腾跃', '躍　—　騰躍'],
  'help.dash.touch': ['冲　—　疾冲（撞碎旱魃金乌）', '衝　—　疾衝（撞碎旱魃金烏）'],
  'help.ult.touch': ['跨　—　夸父跨步（神力满·一步跨一屏·无敌）', '跨　—　夸父跨步（神力滿·一步跨一屏·無敵）'],
  'help.mote': ['拾日光　→　升倍率 · 攒神力', '拾日光　→　升倍率 · 攢神力'],
  'help.water': ['掬甘泉　→　续冲刺', '掬甘泉　→　續衝刺'],
  'help.keys': ['M 静音　·　T 简繁　·　H 帮助', 'M 靜音　·　T 簡繁　·　H 幫助'],
  'help.keys.touch': ['简繁在标题页右下角切换', '簡繁在標題頁右下角切換'],
  'help.sound.on': ['声音 开', '聲音 開'],
  'help.sound.off': ['声音 关', '聲音 關'],
  'help.close': ['按 H / 点屏 · 关闭', '按 H / 點屏 · 關閉'],

  'title.rank': ['称号', '稱號'],
  'rank.0': ['初出荒原', '初出荒原'],
  'rank.1': ['逐日者', '逐日者'],
  'rank.2': ['饮河渭者', '飲河渭者'],
  'rank.3': ['北饮大泽', '北飲大澤'],
  'rank.4': ['夸父之志', '夸父之志'],
  'rank.5': ['与日齐光', '與日齊光'],

  'death.share': ['按 F / 点上半屏 · 分享成绩', '按 F / 點上半屏 · 分享成績'],
  'death.share.touch': ['点上半屏 · 分享成绩', '點上半屏 · 分享成績'],
  'death.restart.touch': ['点下半屏 · 再逐一程', '點下半屏 · 再逐一程'],
  'share.copied': ['成绩已复制，快分享给好友', '成績已複製，快分享給好友'],
  'share.title': ['逐光 · 夸父逐日', '逐光 · 夸父逐日'],
  'share.tagline': ['你能追上夸父吗？', '你能追上夸父嗎？'],

  'hint.run': ['按住 → / D 向前奔逐', '按住 → / D 向前奔逐'],
  'hint.jump': ['空格 / ↑ 腾跃', '空格 / ↑ 騰躍'],
  'hint.dash': ['掬泉续力 · Shift / J 疾冲', '掬泉續力 · Shift / J 疾衝'],
  'hint.kill': ['疾冲撞碎旱魃 · 击退金乌', '疾衝撞碎旱魃 · 擊退金烏'],
  'hint.score': ['拾日光升倍率 · 路程 × 倍率 = 功业', '拾日光升倍率 · 路程 × 倍率 = 功業'],
  // 触屏变体（粗指针设备显示，改说按钮而非键位）
  'hint.run.touch': ['按住「进」向前奔逐', '按住「進」向前奔逐'],
  'hint.jump.touch': ['点「跃」腾跃', '點「躍」騰躍'],
  'hint.dash.touch': ['掬泉续力 · 点「冲」疾冲', '掬泉續力 · 點「衝」疾衝'],
  'hint.ult.touch': ['神力盈满 · 点「跨」发动夸父跨步', '神力盈滿 · 點「跨」發動夸父跨步'],

  // 主脉·《山海经·海外北经》
  'nar.0': ['夸父与日逐走', '夸父與日逐走'],
  'nar.1': ['入日，渴欲得饮', '入日，渴欲得飲'],
  'nar.2': ['饮于河、渭', '飲於河、渭'],
  'nar.3': ['河、渭不足，北饮大泽', '河、渭不足，北飲大澤'],
  'nar.4': ['未至，道渴而死', '未至，道渴而死'],
  'nar.5': ['弃其杖，化为邓林', '棄其杖，化為鄧林'],
  // 深处·他典异记（远行渐显）
  'nar.6': ['欲追日景，逮之于禺谷　——《大荒北经》', '欲追日景，逮之於禺谷　——《大荒北經》'],
  'nar.7': ['珥两黄蛇，把两黄蛇　——《大荒北经》', '珥兩黃蛇，把兩黃蛇　——《大荒北經》'],
  'nar.8': ['尸膏所浸，邓林弥广数千里　——《列子》', '屍膏所浸，鄧林彌廣數千里　——《列子》'],
  'nar.9': ['夸父诞宏志，乃与日竞走　——陶潜', '夸父誕宏志，乃與日競走　——陶潛'],
  'nar.10': ['神力既殊妙，倾河焉足有　——陶潜', '神力既殊妙，傾河焉足有　——陶潛'],
  'nar.11': ['余迹寄邓林，功竟在身后　——陶潜', '餘跡寄鄧林，功竟在身後　——陶潛'],

  'death.spike': ['殁于荒野', '歿於荒野'],
  'death.fall': ['坠入深渊', '墜入深淵'],
  'death.darkness': ['为长夜追及', '為長夜追及'],
  'death.enemy': ['为旱魃金乌所噬', '為旱魃金烏所噬'],
  'death.dist': ['距', '距'],
  'death.best': ['至远', '至遠'],
  'death.offline': ['离线', '離線'],
  'death.pending': ['上传中…', '上傳中…'],
  'death.rank': ['天下第', '天下第'],
  'death.footer': ['弃其杖，化为邓林', '棄其杖，化為鄧林'],
  'death.restart': ['按 R / 点下半屏 · 再逐一程', '按 R / 點下半屏 · 再逐一程'],
  'rotate.hint': ['横屏体验更佳', '橫屏體驗更佳'],
  'rotate.sub': ['请旋转设备', '請旋轉裝置'],

  'pop.water': ['续力', '續力'],
};

let current: Script = 'hans';

export function getScript(): Script { return current; }
export function setScript(s: Script) { current = s; }
export function toggleScript(): Script { current = current === 'hans' ? 'hant' : 'hans'; return current; }

export function t(key: string): string {
  const pair = TABLE[key];
  if (!pair) return key;
  return pair[current === 'hans' ? 0 : 1];
}

// 触屏变体优先：粗指针设备取 `${key}.touch`（改说按钮），无变体则回退键位文案
export function tTouch(key: string, coarse: boolean): string {
  return coarse && TABLE[`${key}.touch`] ? t(`${key}.touch`) : t(key);
}

// 按功业分数授予称号（逐日进阶，退出/分享皆见其名，成留存与身份钩子）
const RANK_CUTS = [100, 300, 700, 1500, 3000];
export function rankKeyFor(score: number): string {
  let i = 0;
  while (i < RANK_CUTS.length && score >= RANK_CUTS[i]) i++;
  return `rank.${i}`;
}
