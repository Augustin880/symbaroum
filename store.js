export const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function calculateRollStats(rolls) {
  const values = rolls.map(r => Number(r.result)).filter(Number.isFinite);
  return {
    count: values.length,
    mean: values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

export function groupRolls(rolls, group = 'die') {
  const buckets = new Map();
  for (const roll of rolls) {
    let label = group === 'source' ? roll.source : group === 'stat' ? roll.stat : roll.formula;
    label = label || 'Sans catégorie';
    const bucket = buckets.get(label) || [];
    bucket.push(Number(roll.result)); buckets.set(label, bucket);
  }
  return [...buckets].map(([label, values]) => ({
    label, count: values.length, mean: values.reduce((a,b)=>a+b,0)/values.length,
  })).sort((a,b)=>b.count-a.count).slice(0,8);
}
