import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiceFormula, distributionFor, opposedDistribution, legacyMean, combinedAttack, rollFormula } from './probability.js';

test('analyse une formule multi-dés avec bonus', () => {
  assert.deepEqual(parseDiceFormula('2d6+1'), { count: 2, sides: 6, bonus: 1, normalized: '2d6+1' });
});

test('reproduit la moyenne du prototype avec une armure', () => {
  const result = distributionFor('1d10', 1);
  assert.ok(Math.abs(result.mean - 4.5) < 1e-10);
  assert.equal(result.zeroChance, 10);
});

test('combine dégâts et chance de réussite au d20', () => {
  const result = combinedAttack({ formula: '1d10', armor: 1, attribute: 14 });
  assert.equal(result.chance, 70);
  assert.ok(Math.abs(result.expectedDamage - 3.15) < 1e-10);
  assert.ok(Math.abs(result.totalZeroChance - 37) < 1e-10);
});

test('ajoute un bonus positif ou un malus négatif à la caractéristique', () => {
  assert.equal(combinedAttack({ formula: '1d10', attribute: 15, modifier: -8 }).target, 7);
  assert.equal(combinedAttack({ formula: '1d10', attribute: 15, modifier: 2 }).target, 17);
});

test('intègre une formule de dégâts différente lorsque le test échoue', () => {
  const result = combinedAttack({ formula: '1d10', failureFormula: '1d6', attribute: 10 });
  assert.ok(Math.abs(result.successMean - 5.5) < 1e-10);
  assert.ok(Math.abs(result.failureMean - 3.5) < 1e-10);
  assert.ok(Math.abs(result.expectedDamage - 4.5) < 1e-10);
  assert.ok(Math.abs(result.totalZeroChance) < 1e-10);
});

test('oppose exactement le dé de dégâts au dé d’armure', () => {
  const result = opposedDistribution('1d10+1', '1d4');
  assert.ok(Math.abs(result.damageMean - 6.5) < 1e-10);
  assert.ok(Math.abs(result.armorMean - 2.5) < 1e-10);
  assert.ok(Math.abs(result.mean - 4.1) < 1e-10);
  assert.ok(Math.abs(result.zeroChance - 15) < 1e-10);
});

test('reproduit aussi le calcul historique de utils.py', () => {
  assert.equal(legacyMean(10, 1, 1), 6.5);
  assert.equal(legacyMean(6, 0, 2), 3);
});

test('un jet injecté reste déterministe', () => {
  assert.deepEqual(rollFormula('2d6+1', () => 0), { dice: [1,1], bonus: 1, total: 3, formula: '2d6+1' });
});
