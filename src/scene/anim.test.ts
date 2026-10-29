import { describe, expect, it } from 'vitest';
import { LIFT, poseOf, type Anim } from './anim';

const mk = (over: Partial<Anim>): Anim => ({ kind: 'drop', t0: 0, h: 1.2, amp: 1, hide: false, ...over });

describe('animações', () => {
  it('a peça cai, amassa ao bater na mesa e para', () => {
    const a = mk({});
    expect(poseOf(a, 0)?.dy).toBeCloseTo(1.2, 5);
    const land = 260;
    expect(poseOf(a, land - 1)?.dy).toBeLessThan(0.05);
    const hit = poseOf(a, land + 1);
    expect(hit?.dy).toBe(0);
    expect(hit?.sy).toBeLessThan(0.85);
    expect(poseOf(a, land + 800)).toBeNull();
  });

  it('fica escondida até a vez dela na sequência', () => {
    const a = mk({ t0: 100, hide: true });
    expect(poseOf(a, 50)?.hidden).toBe(true);
    expect(poseOf(a, 120)?.hidden).toBe(false);
  });

  it('o quique é pequeno e acaba rápido', () => {
    const a = mk({ kind: 'boop' });
    for (let t = 0; t < 600; t += 20) {
      const p = poseOf(a, t);
      expect(Math.abs((p?.sy ?? 1) - 1)).toBeLessThan(0.11);
    }
    expect(poseOf(a, 700)).toBeNull();
  });

  it('segurada no ar, fica erguida até soltar', () => {
    const a = mk({ kind: 'lift' });
    expect(poseOf(a, 5000)?.dy).toBeCloseTo(LIFT, 5);
  });

  it('nunca deforma demais', () => {
    const a = mk({ amp: 5 });
    for (let t = 0; t < 1200; t += 10) {
      const p = poseOf(a, t);
      if (!p) continue;
      expect(p.sy).toBeGreaterThanOrEqual(0.5);
      expect(p.sy).toBeLessThanOrEqual(1.6);
    }
  });
});
