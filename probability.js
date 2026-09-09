export function parseDiceFormula(formula) {
  const clean = String(formula).toLowerCase().replace(/\s+/g, '');
  const match = clean.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) throw new Error('Utilisez une formule comme 2d6+1.');
  const count = Number(match[1] || 1);
  const sides = Number(match[2]);
  const bonus = Number(match[3] || 0);
  if (count < 1 || count > 20 || sides < 2 || sides > 100) throw new Error('Formule de dés hors limites.');
  return { count, sides, bonus, normalized: `${count}d${sides}${bonus ? (bonus > 0 ? `+${bonus}` : bonus) : ''}` };
}

export function distributionFor(formula, reduction = 0) {
  const { count, sides, bonus, normalized } = parseDiceFormula(formula);
  let distribution = new Map([[0, 1]]);
  for (let die = 0; die < count; die += 1) {
    const next = new Map();
    for (const [sum, probability] of distribution) {
      for (let face = 1; face <= sides; face += 1) {
        next.set(sum + face, (next.get(sum + face) || 0) + probability / sides);
      }
    }
    distribution = next;
  }
  const reduced = new Map();
  for (const [sum, probability] of distribution) {
    const result = Math.max(0, sum + bonus - Number(reduction || 0));
    reduced.set(result, (reduced.get(result) || 0) + probability);
  }
  const entries = [...reduced.entries()].sort((a, b) => a[0] - b[0]);
  const mean = entries.reduce((total, [value, probability]) => total + value * probability, 0);
  const zeroChance = (reduced.get(0) || 0) * 100;
  const max = Math.max(...entries.map(([value]) => value));
  return { formula: normalized, mean, zeroChance, max, entries };
}

export function opposedDistribution(damageFormula, armorFormula = '') {
  const damage = rawDistribution(damageFormula);
  const armor = armorFormula ? rawDistribution(armorFormula) : new Map([[0, 1]]);
  const results = new Map();
  for (const [damageValue, damageProbability] of damage) {
    for (const [armorValue, armorProbability] of armor) {
      const value = Math.max(0, damageValue - armorValue);
      results.set(value, (results.get(value) || 0) + damageProbability * armorProbability);
    }
  }
  const entries = [...results.entries()].sort((a,b)=>a[0]-b[0]);
  return {
    entries,
    mean: entries.reduce((sum,[value,p])=>sum+value*p,0),
    zeroChance: (results.get(0)||0)*100,
    damageMean: [...damage].reduce((sum,[value,p])=>sum+value*p,0),
    armorMean: [...armor].reduce((sum,[value,p])=>sum+value*p,0),
  };
}

function rawDistribution(formula) {
  const { count, sides, bonus } = parseDiceFormula(formula);
  let distribution = new Map([[bonus, 1]]);
  for (let die=0; die<count; die+=1) {
    const next = new Map();
    for (const [sum,p] of distribution) for (let face=1; face<=sides; face+=1)
      next.set(sum+face,(next.get(sum+face)||0)+p/sides);
    distribution=next;
  }
  return distribution;
}

// Reproduction exacte de utils.py : les résultats <= au malus valent zéro,
// les autres conservent leur valeur (le malus n'est pas soustrait).
export function legacyMean(die, bonus = 0, malus = 0) {
  let sum=0;
  for (let result=1+Number(bonus); result<=Number(die)+Number(bonus); result+=1) if(result>Number(malus)) sum+=result;
  return sum/Number(die);
}

export function successChance(attribute, modifier = 0) {
  const target = Math.max(0, Math.min(20, Number(attribute) + Number(modifier || 0)));
  return { target, chance: target * 5 };
}

export function combinedAttack({ formula, failureFormula = '', armorFormula = '', reduction, armor = 0, attribute = 10, modifier = 0 }) {
  const damage = armorFormula ? opposedDistribution(formula, armorFormula) : distributionFor(formula, reduction ?? armor);
  const failure = failureFormula
    ? (armorFormula ? opposedDistribution(failureFormula, armorFormula) : distributionFor(failureFormula, reduction ?? armor))
    : { mean: 0, zeroChance: 100, entries: [[0, 1]] };
  const success = successChance(attribute, modifier);
  const hitRate = success.chance / 100;
  const mixed = new Map();
  for (const [value,p] of damage.entries) mixed.set(value,(mixed.get(value)||0)+p*hitRate);
  for (const [value,p] of failure.entries) mixed.set(value,(mixed.get(value)||0)+p*(1-hitRate));
  return {
    damageMean: damage.damageMean ?? distributionFor(formula).mean,
    armorMean: damage.armorMean ?? Number(reduction ?? armor ?? 0),
    ...damage, ...success,
    distribution: [...mixed.entries()].sort((a,b)=>a[0]-b[0]),
    successMean: damage.mean,
    failureMean: failure.mean,
    expectedDamage: damage.mean * hitRate + failure.mean * (1-hitRate),
    totalZeroChance: hitRate * damage.zeroChance + (1-hitRate) * failure.zeroChance,
  };
}

export function rollFormula(formula, random = Math.random) {
  const { count, sides, bonus, normalized } = parseDiceFormula(formula);
  const dice = Array.from({ length: count }, () => Math.floor(random() * sides) + 1);
  return { dice, bonus, total: dice.reduce((a, b) => a + b, 0) + bonus, formula: normalized };
}
