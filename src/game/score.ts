import { PX_PER_METER, MOTE_SCORE, MULT_PER_MOTE, MULT_MAX, AIRTIME_BONUS } from './constants';

export class Score {
  distanceM = 0;
  motes = 0;
  bonus = 0;

  get multiplier(): number {
    return Math.min(1 + this.motes * MULT_PER_MOTE, MULT_MAX);
  }

  get total(): number {
    return Math.floor(this.distanceM * this.multiplier) + this.motes * MOTE_SCORE + this.bonus;
  }

  updateDistance(playerX: number) {
    this.distanceM = Math.max(this.distanceM, playerX / PX_PER_METER);
  }

  collectMote() {
    this.motes++;
  }

  styleBonus() {
    this.bonus += AIRTIME_BONUS;
  }
}
