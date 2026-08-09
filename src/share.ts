import { t, rankKeyFor, fontKai, type StringKey } from './render/strings';

/** 死因 → 文案键。与 ui.ts 的 DEATH_KEY 同源，分享卡也该说清是怎么终结的。 */
const DEATH_KEY: Record<string, StringKey> = {
  spike: 'death.spike',
  fall: 'death.fall',
  darkness: 'death.darkness',
  enemy: 'death.enemy',
};

/** 分享成绩：生成成绩卡图，移动端走系统分享(含图)，桌面端复制文案+下载卡片。 */
export async function shareScore(
  distanceM: number, score: number, best: number, endingImg: HTMLImageElement | null,
  deathCause: string | null = null,
): Promise<'shared' | 'copied' | 'failed'> {
  // 剥掉 ?lang=：那是发送方自己的语种覆盖，不该跟着链接强加给每一位接收者
  // （它在 pickLocale 里优先级最高，会盖过对方的浏览器语言与亲选偏好）。
  const shareUrl = new URL(location.href);
  shareUrl.hash = '';
  shareUrl.searchParams.delete('lang');
  const url = shareUrl.toString().replace(/\?$/, '');
  const rank = t(rankKeyFor(score));
  // 死因是这一局的结局，卡片与文案都该带上——只报分数，故事就少了收尾那一句
  const cause = deathCause ? t(DEATH_KEY[deathCause] ?? 'death.darkness') : '';
  const text = `${t('share.title')}｜${t('title.rank')}「${rank}」· ${t('hud.score')} ${score}（${t('hud.dist2')} ${distanceM} ${t('hud.dist')}）${cause ? `· ${cause}` : ''}｜${t('share.tagline')}`;

  // 生成成绩卡（结局图 + 分数）
  let file: File | null = null;
  try {
    const W = 1200, H = 630;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d')!;
    x.fillStyle = '#1a0f08';
    x.fillRect(0, 0, W, H);
    if (endingImg) {
      const sc = Math.max(W / endingImg.width, H / endingImg.height);
      const w = endingImg.width * sc, h = endingImg.height * sc;
      x.drawImage(endingImg, (W - w) / 2, (H - h) / 2, w, h);
      x.fillStyle = 'rgba(20,10,6,0.52)';
      x.fillRect(0, 0, W, H);
    }
    x.textAlign = 'center';
    x.fillStyle = '#f7ecd8';
    x.font = `60px ${fontKai()}`;
    x.fillText(t('share.title'), W / 2, 90);
    x.font = `120px ${fontKai()}`;
    x.fillText(String(score), W / 2, 210);
    // 称号：分享卡的身份标记
    x.font = `44px ${fontKai()}`;
    x.fillStyle = 'rgba(255,220,150,0.95)';
    x.fillText(`「${rank}」`, W / 2, 300);
    if (cause) {
      // 别压太暗：这是卡片上唯一交代「怎么结束的」那一句，
      // 30px/0.7 贴在亮结局图上几乎读不出来，等于白写
      x.font = `32px ${fontKai()}`;
      x.fillStyle = 'rgba(250,240,225,0.85)';
      x.fillText(cause, W / 2, 350);
    }
    x.font = `36px ${fontKai()}`;
    x.fillStyle = 'rgba(255,245,230,0.92)';
    x.fillText(`${t('hud.dist2')} ${distanceM} ${t('hud.dist')}　·　${t('death.best')} ${best}`, W / 2, 400);
    x.font = `32px ${fontKai()}`;
    x.fillStyle = 'rgba(255,220,150,0.95)';
    x.fillText(t('share.tagline'), W / 2, 470);
    x.font = `24px ${fontKai()}`;
    x.fillStyle = 'rgba(255,245,230,0.6)';
    x.fillText(url, W / 2, 560);
    const blob: Blob | null = await new Promise(res => c.toBlob(res, 'image/png'));
    if (blob) file = new File([blob], 'kuafu.png', { type: 'image/png' });
  } catch { /* 生成卡片失败，仍可分享文案 */ }

  const nav = navigator as Navigator & {
    canShare?: (d: unknown) => boolean;
    share?: (d: unknown) => Promise<void>;
  };
  // 优先：系统分享（移动端原生分享面板，尽量带图）
  try {
    if (file && nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], text, title: t('share.title') });
      return 'shared';
    }
    if (nav.share) {
      await nav.share({ text, url, title: t('share.title') });
      return 'shared';
    }
  } catch {
    return 'failed'; // 用户取消/失败
  }

  // 兜底：复制文案（桌面）+ 下载成绩卡
  try {
    await navigator.clipboard?.writeText(`${text} ${url}`);
    if (file) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = 'kuafu.png';
      a.click();
      URL.revokeObjectURL(a.href);
    }
    return 'copied';
  } catch {
    return 'failed';
  }
}
