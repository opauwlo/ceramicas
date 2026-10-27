import { describe, expect, it } from 'vitest';
import { discTopAt } from '../geometry/shapes';
import { normalizeDoc } from './spec';
import { NEEDLE_R, TEMPLATES, type TemplateKey } from './templates';

describe('modelos prontos', () => {
  for (const k of Object.keys(TEMPLATES) as TemplateKey[]) {
    it(`${k} monta um modelo válido`, () => {
      const doc = TEMPLATES[k].build();
      expect(doc.pieces.length).toBeGreaterThan(0);
      expect(normalizeDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    });
  }

  it('a agulha encosta no disco nos dois vinis', () => {
    for (const k of ['vinilMao', 'vinilAgua'] as const) {
      const doc = TEMPLATES[k].build();
      const disc = doc.pieces[0];
      const needle = doc.pieces.find(p => p.name === 'Agulha');
      expect(needle).toBeDefined();
      const tip = (needle?.pos[1] ?? 0) - (needle?.p.altura ?? 0);
      expect(tip).toBeCloseTo(discTopAt(disc, NEEDLE_R), 3);
    }
  });
});
