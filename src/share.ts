import { t, rankKeyFor, FONT_KAI } from './render/strings';

/** 分享成绩：生成成绩卡图，移动端走系统分享(含图)，桌面端复制文案+下载卡片。 */
export async function shareScore(
  distanceM: number, score: number, best: number, endingImg: HTMLImageElement | null,
): Promise<'shared' | 'copied' | 'failed'> {
  const url = location.href.split('#')[0];
  const rank = t(rankKeyFor(score));
  const text = `${t('share.title')}｜${t('title.rank')}「${rank}」· ${t('hud.score')} ${score}（${t('hud.dist2')} ${distanceM} ${t('hud.dist')}）｜${t('share.tagline')}`;

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
    x.font = `60px ${FONT_KAI}`;
    x.fillText(t('share.title'), W / 2, 90);
    x.font = `120px ${FONT_KAI}`;
    x.fillText(String(score), W / 2, 210);
    // 称号：分享卡的身份标记
    x.font = `44px ${FONT_KAI}`;
    x.fillStyle = 'rgba(255,220,150,0.95)';
    x.fillText(`「${rank}」`, W / 2, 300);
    x.font = `36px ${FONT_KAI}`;
    x.fillStyle = 'rgba(255,245,230,0.92)';
    x.fillText(`${t('hud.dist2')} ${distanceM} ${t('hud.dist')}　·　${t('death.best')} ${best}`, W / 2, 400);
    x.font = `32px ${FONT_KAI}`;
    x.fillStyle = 'rgba(255,220,150,0.95)';
    x.fillText(t('share.tagline'), W / 2, 470);
    x.font = `24px ${FONT_KAI}`;
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
