import { calculateRollStats, uid } from './store.js';
import { combinedAttack as calculateAttack, distributionFor, rollFormula } from './probability.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const pageMeta = {
  character: ['DOSSIER DU PERSONNAGE', 'Personnage'], inventory: ['BESACE & RICHESSES', 'Équipement'],
  combat: ['APTITUDES & ARSENAL', 'Stats & combat'], talents: ['CAPACITÉS & PARTICULARITÉS', 'Talents'],
  calculator: ['PROBABILITÉS & JOURNAL', 'Calculateur'],
};

let state = normalizeState(loadState());
let currentPage = 'character';
let calcState = { formula: '1d10+1', failureFormula: '', enemyProtection: 2, attribute: 'Précision', modifier: 0 };
let rollFilters = { die: 'all', source: 'all', stat: 'all' };

function activeCharacter() { return state.characters.find(c => c.id === state.activeCharacterId) || state.characters[0]; }
function save() { localStorage.setItem('veilleur-state-v1', JSON.stringify(state)); }

function loadState() {
  try { const saved = JSON.parse(localStorage.getItem('veilleur-state-v1')); if (saved?.characters?.length) return saved; } catch {}
  const characterId = uid();
  return {
    activeCharacterId: characterId,
    characters: [{
      id: characterId, name: 'Aldren Virelame', archetype: 'Mystique', race: 'Humain', occupation: 'Érudit itinérant', age: '34', xp: 7,
      quote: 'La forêt se souvient de ceux qui savent écouter.', description: 'Un érudit d’Ambria aux manières calmes, fasciné par les ruines et les secrets que Davokar refuse de livrer.', image: '',
      notes: 'Recherche les traces de l’ancienne Symbar. Se méfie des Sorcières mais respecte leur savoir.',
      stats: { 'Discrétion': 10, 'Astuce': 13, 'Persuasion': 9, 'Précision': 14, 'Vigilance': 11, 'Puissance': 8, 'Agilité': 12, 'Volonté': 15 },
      resources: { endurance: 10, corruption: 0, enduranceMaxBonus: 0, painThresholdBonus: 0, corruptionThresholdBonus: 0, corruptionMaxBonus: 0 },
      inventory: [
        { id: uid(), category: 'equipment', name: 'Nécessaire d’érudit', detail: 'Plumes, encres, parchemins', quantity: 1 },
        { id: uid(), category: 'artifact', name: 'Œil de la crypte', detail: 'Artefact lié · 1 corruption temporaire', quantity: 1 },
        { id: uid(), category: 'possession', name: 'Carte des ruines', detail: 'Incomplète, annotée en elfe', quantity: 1 },
      ],
      money: { thaler: 12, shilling: 7, orteg: 4 },
      weapons: [
        { id: uid(), name: 'Épée bâtarde', damage: '1d10', bonus: 0, stat: 'Précision', ammo: null, quality: 'Longue', description: 'Une lame longue utilisable à une ou deux mains.' },
        { id: uid(), name: 'Arbalète légère', damage: '1d10', bonus: 1, stat: 'Précision', ammo: 8, quality: 'À distance', description: 'Compacte, silencieuse et facile à dissimuler.' },
      ],
      armors: [{ id: uid(), name: 'Cuir renforcé', protection: '1d4', bonus: 0, quality: 'Souple', equipped: true }],
      spells: [{ id: uid(), name: 'Cascade de soufre', stat: 'Volonté', cost: '1 corruption', quality: 'Mystique', description: 'Une pluie de soufre brûlant s’abat sur la cible.', successFormula: '1d12', successLabel: 'Dégâts si réussi', failureFormula: '1d6', failureLabel: 'Dégâts si raté' }],
      talents: [
        { id: uid(), type: 'talent', name: 'Érudit', level: 'Adepte', description: 'Reconnaît les langues, créatures et artefacts anciens.', effects: [{ stat: 'Astuce', value: 1, condition: 'hors combat' }], substitutions: [] },
        { id: uid(), type: 'boon', name: 'Sixième sens', level: 'Atout', description: 'L’instinct guide les tirs avant même que la menace soit pleinement visible.', effects: [{ stat: 'Volonté', value: 1, condition: 'combat' }], substitutions: [{ from: 'Précision', to: 'Vigilance', condition: 'armes à distance' }] },
        { id: uid(), type: 'burden', name: 'Marqué par la nuit', level: 'Fardeau', description: 'Les bêtes ressentent quelque chose d’anormal.', effects: [{ stat: 'Persuasion', value: -1, condition: 'animaux' }], substitutions: [] },
      ],
      rolls: [],
    }],
  };
}

function normalizeState(data) {
  delete data.context;
  delete data.contexts;
  for (const c of data.characters || []) {
    c.resources = { endurance: Math.max(10, Number(c.stats?.Puissance || 10)), corruption: 0, enduranceMaxBonus: 0, painThresholdBonus: 0, corruptionThresholdBonus: 0, corruptionMaxBonus: 0, ...(c.resources || {}) };
    c.weapons = (c.weapons || []).map(w => { const parsed=splitStoredFormula(w.damage,w.bonus); return ({ description: '', ...w, damage: parsed.formula, bonus: parsed.bonus }); });
    c.armors = (c.armors || []).map(a => { const parsed=splitStoredFormula(a.protection,a.bonus); return ({ ...a, protection: parsed.formula, bonus: parsed.bonus }); });
    c.spells = (c.spells || []).map(s => ({
      description: '', successFormula: s.successFormula ?? s.damage ?? '', successLabel: s.successLabel || 'Effet si réussi',
      failureFormula: s.failureFormula ?? '', failureLabel: s.failureLabel || 'Effet si raté', ...s,
    }));
    c.talents = (c.talents || []).map(t => ({
      ...t,
      effects: t.effects || (t.effectStat ? [{ stat: t.effectStat, value: Number(t.effectValue || 0), condition: t.condition || 'toujours' }] : []),
      substitutions: t.substitutions || [],
    }));
    c.rolls = (c.rolls || []).map(({adventure,chapter,scene,...roll})=>roll);
  }
  return data;
}

function splitStoredFormula(formula, explicitBonus) {
  const match=String(formula||'').replace(/\s/g,'').match(/^(.*?)([+-]\d+)$/);
  if (explicitBonus !== undefined && Number(explicitBonus)!==0) return {formula:String(formula).replace(/[+-]\d+$/,''),bonus:Number(explicitBonus)};
  return match ? {formula:match[1],bonus:Number(match[2])} : {formula,bonus:Number(explicitBonus||0)};
}

function modifiedStat(name, context='combat') {
  const c = activeCharacter();
  return c.talents.reduce((value, t) => value + t.effects
    .filter(e => e.stat === name && (e.condition === 'toujours' || e.condition === context))
    .reduce((sum,e)=>sum+Number(e.value||0),0), Number(c.stats[name] || 0));
}

function substitutedStat(name, context='') {
  const substitution=activeCharacter().talents.flatMap(t=>t.substitutions||[]).find(s=>s.from===name&&(s.condition==='toujours'||s.condition===context));
  return substitution?.to||name;
}

function effectiveWeaponStat(item) {
  const ranged = /distance|arc|arbalète|projectile/i.test(`${item.quality} ${item.description}`);
  const substitution = activeCharacter().talents.flatMap(t=>t.substitutions || []).find(s =>
    s.from === item.stat && (s.condition === 'toujours' || (s.condition === 'armes à distance' && ranged) || s.condition === 'combat'));
  return substitution?.to || item.stat;
}

function formulaWithBonus(formula, bonus=0) {
  const base=String(formula||'').replace(/\s/g,'').replace(/[+-]\d+$/,'');
  const value=Number(bonus||0);
  return `${base}${value ? (value>0?`+${value}`:value) : ''}`;
}

function activeStatChanges() {
  return activeCharacter().talents.flatMap(t=>t.effects.map(e=>({...e,talent:t.name})).filter(e=>['toujours','combat'].includes(e.condition)));
}

function potentialStatChanges() {
  return activeCharacter().talents.flatMap(t=>[
    ...t.effects.map(e=>({talent:t.name,text:`${e.value>0?'+':''}${e.value} ${e.stat}`,condition:e.condition})),
    ...t.substitutions.map(s=>({talent:t.name,text:`${s.from} → ${s.to}`,condition:s.condition})),
  ]);
}

function resourceValues() {
  const c=activeCharacter(), r=c.resources;
  const power=Number(c.stats.Puissance||0), will=Number(c.stats.Volonté||0);
  return {
    enduranceMax: Math.max(10,power)+Number(r.enduranceMaxBonus||0),
    painThreshold: Math.ceil(power/2)+Number(r.painThresholdBonus||0),
    corruptionThreshold: Math.ceil(will/2)+Number(r.corruptionThresholdBonus||0),
    corruptionMax: will+Number(r.corruptionMaxBonus||0),
  };
}

function resourcesPanel() {
  const c=activeCharacter(), values=resourceValues(), r=c.resources;
  const endurancePercent=Math.min(100,Math.max(0,r.endurance/Math.max(1,values.enduranceMax)*100));
  const corruptionPercent=Math.min(100,Math.max(0,r.corruption/Math.max(1,values.corruptionMax)*100));
  const corruptionThresholdPercent=Math.min(100,values.corruptionThreshold/Math.max(1,values.corruptionMax)*100);
  return `<style>.resource-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.vital-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.vital-card{padding:18px;border:1px solid var(--line);border-radius:14px;background:#e3ebe4}.vital-card.corruption{background:#e9e1ed}.gauge-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.gauge-top>span,.gauge-note{color:var(--muted);font-size:10px}.gauge-value{display:flex;align-items:center;gap:4px}.gauge-value input{width:54px;border:0;background:transparent;padding:0;text-align:right;font:600 25px Cinzel;color:var(--forest)}.corruption .gauge-value input{color:#68486f}.gauge-value b{font:600 14px Cinzel;color:var(--muted)}.gauge-track{position:relative;height:18px;border-radius:99px;background:#cad4cc;box-shadow:inset 0 2px 4px #24352c18;overflow:visible}.corruption .gauge-track{background:#d4c9d9}.gauge-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#78917f,#365c49);transition:width .25s}.corruption .gauge-fill{background:linear-gradient(90deg,#a786ac,#724d7c)}.gauge-marker{position:absolute;top:-5px;bottom:-5px;width:2px;background:#8d4160}.gauge-marker::after{content:'seuil';position:absolute;top:25px;left:50%;transform:translateX(-50%);font-size:8px;color:#71435d}.gauge-controls{display:flex;align-items:center;gap:6px;margin-top:18px}.gauge-controls button{width:30px;height:28px;border:1px solid var(--line);border-radius:7px;background:#f6f2e9;cursor:pointer}.gauge-note{margin-left:auto}</style><section class="card card-pad"><div class="resource-heading"><div><p class="eyebrow">ÉTAT DU PERSONNAGE</p><h2 class="section-title">Endurance & corruption</h2></div><button class="button ghost" data-action="edit-resource-limits">Modifier les seuils</button></div><div class="vital-grid">
    <div class="vital-card endurance"><div class="gauge-top"><span>Endurance</span><div class="gauge-value"><input data-resource="endurance" type="number" min="0" value="${r.endurance}"><b>/ ${values.enduranceMax}</b></div></div><div class="gauge-track"><div class="gauge-fill" style="width:${endurancePercent}%"></div></div><div class="gauge-controls"><button data-resource-delta="endurance" data-delta="-1">−</button><button data-resource-delta="endurance" data-delta="1">+</button><span class="gauge-note">Seuil de douleur : ${values.painThreshold}</span></div></div>
    <div class="vital-card corruption"><div class="gauge-top"><span>Corruption</span><div class="gauge-value"><input data-resource="corruption" type="number" min="0" value="${r.corruption}"><b>/ ${values.corruptionMax}</b></div></div><div class="gauge-track"><div class="gauge-fill" style="width:${corruptionPercent}%"></div><i class="gauge-marker" style="left:${corruptionThresholdPercent}%"></i></div><div class="gauge-controls"><button data-resource-delta="corruption" data-delta="-1">−</button><button data-resource-delta="corruption" data-delta="1">+</button><span class="gauge-note">Seuil : ${values.corruptionThreshold}</span></div></div>
  </div></section>`;
}

function render() {
  const [eyebrow, title] = pageMeta[currentPage];
  $('#page-eyebrow').textContent = eyebrow; $('#page-title').textContent = title;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === currentPage));
  const c = activeCharacter();
  $('#switcher-name').textContent = c.name; $('#switcher-archetype').textContent = `${c.archetype} · ${c.race}`;
  $('#avatar-mini').textContent = c.name.charAt(0).toUpperCase();
  const renderers = { character: renderCharacter, inventory: renderInventory, combat: renderCombat, talents: renderTalents, calculator: renderCalculator };
  $('#page-content').innerHTML = renderers[currentPage]();
  bindPageEvents();
}

function renderCharacter() {
  const c = activeCharacter();
  return `<div class="grid main-side">
    <section class="card hero">
      <div class="portrait">${c.image ? `<img src="${c.image}" alt="Portrait de ${esc(c.name)}">` : `<div class="portrait-placeholder">${esc(c.name[0])}</div>`}<label for="portrait-input">Changer l’image<input id="portrait-input" type="file" accept="image/*" hidden></label></div>
      <div class="hero-copy"><p class="eyebrow">${esc(c.occupation).toUpperCase()}</p><h2>${esc(c.name)}</h2><div class="tags"><span class="tag">${esc(c.race)}</span><span class="tag gold">${esc(c.archetype)}</span></div><p class="quote">« ${esc(c.quote)} »</p>
      <div class="xp-box"><div><span class="subtle">EXPÉRIENCE NON DÉPENSÉE</span><div class="xp-number">${c.xp}</div></div><button class="button secondary" data-action="edit-character">Modifier</button></div></div>
    </section>
    <section class="card card-pad"><h2 class="section-title">En bref</h2><div class="bio-grid"><div><span class="subtle">ARCHÉTYPE</span><p>${esc(c.archetype)}</p></div><div><span class="subtle">ÂGE</span><p>${esc(c.age || '—')}</p></div><div><span class="subtle">RACE</span><p>${esc(c.race)}</p></div><div><span class="subtle">OCCUPATION</span><p>${esc(c.occupation)}</p></div></div><div class="divider"></div><span class="subtle">DESCRIPTION</span><p class="subtle" style="line-height:1.65">${esc(c.description)}</p></section>
    <section class="card card-pad"><h2 class="section-title">Caractéristiques</h2><div class="stat-grid">${Object.entries(c.stats).map(([name,value]) => statBox(name,value)).join('')}</div></section>
    <section class="card card-pad"><h2 class="section-title">Notes & histoire</h2><p class="subtle" style="line-height:1.7;white-space:pre-wrap">${esc(c.notes || 'Aucune note pour le moment.')}</p><button class="button ghost" data-action="edit-notes">Écrire dans le journal</button></section>
  </div>`;
}

function statBox(name, value) {
  const modified = modifiedStat(name); const delta = modified - value;
  return `<div class="stat-box"><label>${esc(name)}</label><input data-stat="${esc(name)}" type="number" min="1" max="20" value="${value}"><span class="modified">${delta ? `${delta > 0 ? '+' : ''}${delta} → ${modified}` : '&nbsp;'}</span><button class="stat-roll-button" data-action="roll-stat" data-stat-name="${esc(name)}">Tester au d20</button></div>`;
}

function renderInventory() {
  const c = activeCharacter(); const sections = [
    ['equipment','Équipement','Objets utiles transportés'],['artifact','Artefacts','Objets de pouvoir liés ou non'],['possession','Possessions','Biens, souvenirs et objets sans usage martial']
  ];
  return `<div class="grid main-side"><div class="grid">${sections.map(([type,title,sub]) => {
    const items=c.inventory.filter(i=>i.category===type); return `<section class="card"><div class="card-header"><div><h2>${title}</h2><small>${sub}</small></div><span class="spacer"></span><button class="button ghost" data-action="add-item" data-type="${type}">+ Ajouter</button></div><div class="list">${items.length ? items.map(inventoryRow).join('') : emptyState('Rien ici','Ajoutez votre premier objet.')}</div></section>`;
  }).join('')}</div><aside class="grid">
    <section class="card card-pad"><h2 class="section-title">Bourse</h2>${[['thaler','Thalers'],['shilling','Shillings'],['orteg','Ortegs']].map(([key,label])=>`<div class="resource-row"><div><strong>${label}</strong><div class="subtle">${key==='thaler'?'1 thaler = 10 shillings':key==='shilling'?'1 shilling = 10 ortegs':'Petite monnaie'}</div></div><div class="counter"><button data-money="${key}" data-delta="-1">−</button><strong>${c.money[key]}</strong><button data-money="${key}" data-delta="1">+</button></div></div>`).join('')}</section>
    <section class="card card-pad"><h2 class="section-title">Charge</h2><div class="metric"><small>Objets transportés</small><strong>${c.inventory.reduce((n,i)=>n+Number(i.quantity),0)}</strong></div><p class="subtle">Le Veilleur vous laisse interpréter les règles de charge selon votre table.</p></section>
  </aside></div>`;
}
function inventoryRow(item){return `<div class="list-row"><div><h4>${esc(item.name)} <span class="tag">×${item.quantity}</span></h4><p>${esc(item.detail || '')}</p></div><div class="row-actions"><button data-action="edit-item" data-id="${item.id}">✎</button><button data-action="delete-item" data-id="${item.id}">×</button></div></div>`}

function renderCombat() {
  const c=activeCharacter();
  return `<div class="grid">${resourcesPanel()}
    <section class="card card-pad"><div style="display:flex;justify-content:space-between;align-items:center"><div><p class="eyebrow">VALEURS ACTUELLES</p><h2 class="section-title">Caractéristiques</h2></div><span class="subtle">Modifiables directement</span></div><div class="stat-grid">${Object.entries(c.stats).map(([n,v])=>statBox(n,v)).join('')}</div><div class="divider"></div><h3>Modifications potentielles</h3><p class="subtle">Elles seront appliquées automatiquement lorsque leur contexte correspond au jet.</p><div class="change-list potential">${potentialStatChanges().map(e=>`<div><span>${esc(e.talent)} · ${esc(e.condition)}</span><strong>${esc(e.text)}</strong></div>`).join('')||'<p class="subtle">Aucune modification potentielle.</p>'}</div></section>
    <div class="grid two"><section class="card"><div class="card-header"><h2>Armes & attaques</h2><span class="spacer"></span><button class="button ghost" data-action="add-combat" data-type="weapon">+ Arme</button></div><div class="list">${c.weapons.map(x=>combatRow(x,'weapon')).join('')||emptyState('Aucune arme','Ajoutez une arme pour enregistrer ses jets.')}</div></section>
    <section class="card"><div class="card-header"><h2>Sorts & pouvoirs</h2><span class="spacer"></span><button class="button ghost" data-action="add-combat" data-type="spell">+ Sort</button></div><div class="list">${c.spells.map(x=>combatRow(x,'spell')).join('')||emptyState('Aucun sort','Ajoutez une capacité mystique.')}</div></section></div>
    <section class="card"><div class="card-header"><h2>Armures</h2><span class="spacer"></span><button class="button ghost" data-action="add-combat" data-type="armor">+ Armure</button></div><div class="list">${c.armors.map(x=>`<div class="list-row"><div><h4>${esc(x.name)} ${x.equipped?'<span class="tag gold">Équipée</span>':''}</h4><p>${esc(x.quality)}</p></div><div class="row-actions"><span class="value-pill">Protection ${esc(formulaWithBonus(x.protection,x.bonus))}</span><button class="button" data-action="roll-armor" data-id="${x.id}">Lancer</button><button data-action="edit-combat" data-type="armor" data-id="${x.id}">✎</button></div></div>`).join('')}</div></section>
  </div>`;
}
function combatRow(item,type){
  const isSpell=type==='spell'; const stat=isSpell?item.stat:effectiveWeaponStat(item); const replaced=!isSpell&&stat!==item.stat;
  const formulas=isSpell
    ? [item.successFormula&&`Réussite · ${item.successFormula}`,item.failureFormula&&`Échec · ${item.failureFormula}`].filter(Boolean).join(' / ') || 'Effet sans dé'
    : formulaWithBonus(item.damage,item.bonus);
  return `<div class="list-row"><div><h4>${esc(item.name)}</h4><p>${esc(item.description||'Aucune description')}</p><p>${esc(stat)}${replaced?` (remplace ${esc(item.stat)})`:''} · ${esc(item.quality||item.cost||'')}</p></div><div class="row-actions">${item.ammo!==null&&item.ammo!==undefined?`<span class="value-pill">${item.ammo} mun.</span>`:''}<span class="value-pill">${esc(formulas)}</span><button class="button ghost" data-action="test-combat" data-type="${type}" data-id="${item.id}">Tester</button>${isSpell?`${item.successFormula?`<button class="button" data-action="roll-spell" data-outcome="success" data-id="${item.id}">Effet réussi</button>`:''}${item.failureFormula?`<button class="button secondary" data-action="roll-spell" data-outcome="failure" data-id="${item.id}">Effet raté</button>`:''}`:`<button class="button" data-action="roll-attack" data-type="${type}" data-id="${item.id}">Dégâts</button>`}<button data-action="edit-combat" data-type="${type}" data-id="${item.id}">✎</button></div></div>`}

function renderTalents() {
  const c=activeCharacter(); const groups=[['talent','Talents','Capacités et savoir-faire hors combat'],['boon','Atouts','Avantages particuliers'],['burden','Fardeaux','Faiblesses et complications']];
  return `<div class="grid">${groups.map(([type,title,sub])=>`<section><div style="display:flex;align-items:end;justify-content:space-between"><div><p class="eyebrow">${sub.toUpperCase()}</p><h2 class="section-title">${title}</h2></div><button class="button ghost" data-action="add-talent" data-type="${type}">+ Ajouter</button></div><div class="grid three">${c.talents.filter(t=>t.type===type).map(t=>`<article class="card talent-card"><div style="display:flex;justify-content:space-between"><h3>${esc(t.name)}</h3><span class="tag ${type==='burden'?'rust':type==='boon'?'gold':''}">${esc(t.level)}</span></div><p>${esc(t.description)}</p>${t.effects.map(e=>`<div class="effect">${e.value>0?'+':''}${e.value} ${esc(e.stat)} · ${esc(e.condition)}</div>`).join('')}${t.substitutions.map(s=>`<div class="effect">Utilise ${esc(s.to)} à la place de ${esc(s.from)} · ${esc(s.condition)}</div>`).join('')}<button class="button ghost" style="margin-top:12px" data-action="edit-talent" data-id="${t.id}">Modifier</button></article>`).join('')||emptyState(`Aucun ${title.toLowerCase()}`,'Ajoutez-en un lorsque votre histoire évolue.')}</div></section>`).join('')}</div>`;
}

function renderCalculator() {
  const c=activeCharacter(); let analysis;
  try { analysis=calculateAttack({formula:calcState.formula,failureFormula:calcState.failureFormula,reduction:calcState.enemyProtection,attribute:modifiedStat(calcState.attribute),modifier:calcState.modifier}); } catch { analysis=calculateAttack({formula:'1d10',failureFormula:'',reduction:0,attribute:10,modifier:0}); }
  const scoped=c.rolls; sanitizeRollFilters(scoped); const filtered=dimensionFilteredRolls(scoped), rollStats=calculateRollStats(filtered);
  const filteredDice=uniqueValues(filtered,'die'), theoreticalMean=filteredDice.length===1?theoreticalMeanFor(filteredDice[0]):null;
  return `<div class="grid">
    <section class="card card-pad"><p class="eyebrow">ATTAQUE CONTRE PROTECTION</p><h2 class="section-title">Calcul exact des chances</h2><div class="calculator-form">
      <div class="field"><label>Dé de dégâts + bonus</label><input id="calc-formula" value="${esc(calcState.formula)}" placeholder="ex. 1d10+1"></div>
      <div class="field"><label>Dégâts si le test est raté</label><input id="calc-failureFormula" value="${esc(calcState.failureFormula)}" placeholder="0 par défaut, ex. 1d6"></div>
      <div class="field"><label>Protection fixe de l’ennemi</label><input id="calc-enemyProtection" type="number" min="0" value="${calcState.enemyProtection}"></div>
      <div class="field"><label>Caractéristique</label><select id="calc-stat">${Object.keys(c.stats).map(s=>`<option ${s===calcState.attribute?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
      <div class="field"><label>Bonus / malus au test (+ / −)</label><input id="calc-modifier" type="number" value="${calcState.modifier}" placeholder="ex. -8"></div></div>
      <div class="calculator-results"><div class="metric featured"><small>Dégâts espérés / tentative</small><strong>${analysis.expectedDamage.toFixed(2)}</strong></div><div class="metric"><small>Moyenne réussite / échec</small><strong>${analysis.successMean.toFixed(2)} / ${analysis.failureMean.toFixed(2)}</strong></div><div class="metric"><small>${esc(calcState.attribute)} de base → testée</small><strong>${modifiedStat(calcState.attribute)} → ${analysis.target}</strong></div><div class="metric"><small>Toucher / zéro dégât total</small><strong>${analysis.chance}% / ${analysis.totalZeroChance.toFixed(1)}%</strong></div></div>
      <div class="chart-title"><div><strong>Distribution par tentative</strong><small>Combine les issues de réussite et d’échec après la protection fixe</small></div><span class="legend-dot"></span><small>Probabilité théorique</small></div>${distributionChart(analysis.distribution,analysis.expectedDamage)}
    </section>
    <section class="card card-pad"><div class="chart-title"><div><p class="eyebrow">JETS ENREGISTRÉS</p><h2 class="section-title">Analyse filtrée</h2></div><div class="row-actions"><button class="button secondary" data-action="reset-filters">Réinitialiser</button><button class="button ghost" data-action="physical">+ Jet physique</button></div></div>
      <div class="dimension-filters">${filterSelect('die','Type de dé',compatibleValues(scoped,'die'))}${filterSelect('source','Attaque, sort ou action',compatibleValues(scoped,'source'))}${filterSelect('stat','Caractéristique',compatibleValues(scoped,'stat'))}</div>
      <div class="calculator-results compact"><div class="metric"><small>Jets retenus</small><strong>${rollStats.count}</strong></div><div class="metric"><small>Moyenne observée</small><strong>${rollStats.mean.toFixed(2)}</strong></div><div class="metric"><small>Minimum</small><strong>${rollStats.min??'—'}</strong></div><div class="metric"><small>Maximum</small><strong>${rollStats.max??'—'}</strong></div></div>
      <div class="grid two charts-grid"><div><h3>Répartition des résultats</h3>${observedHistogram(filtered,theoreticalMean)}</div><div><h3>Évolution chronologique</h3>${timelineChart(filtered,theoreticalMean)}</div></div>
    </section>
    <section class="card"><div class="card-header"><div><h2>Journal des dés</h2><small>Chaque jet conserve son dé, sa source et sa caractéristique</small></div></div><div class="list">${filtered.slice(-16).reverse().map(rollRow).join('')||emptyState('Aucun jet pour ces filtres','Élargissez les filtres ou enregistrez un nouveau jet.')}</div></section>
  </div>`;
}

function filterSelect(key,label,values){return `<div class="field"><label>${label}</label><select data-roll-filter="${key}"><option value="all">Tous</option>${values.map(v=>`<option value="${esc(v)}" ${rollFilters[key]===v?'selected':''}>${esc(v)}</option>`).join('')}</select></div>`}
function rollField(roll,key){
  const raw=key==='die'?roll.formula:roll[key];
  if(!raw)return '';
  return key==='die'?String(raw).toLowerCase().replace(/\s+/g,''):String(raw).trim();
}
function uniqueValues(rolls,key){return [...new Set(rolls.map(r=>rollField(r,key)).filter(Boolean))].sort()}
function theoreticalMeanFor(formula){try{return distributionFor(formula).mean}catch{return null}}
function compatibleValues(rolls,key){return uniqueValues(rolls.filter(r=>Object.entries(rollFilters).every(([other,value])=>other===key||value==='all'||rollField(r,other)===value)),key)}
function dimensionFilteredRolls(rolls){return rolls.filter(r=>Object.entries(rollFilters).every(([key,value])=>value==='all'||rollField(r,key)===value))}
function sanitizeRollFilters(rolls){for(const key of Object.keys(rollFilters)){if(rollFilters[key]!=='all'&&!uniqueValues(rolls,key).includes(rollFilters[key]))rollFilters[key]='all'}}
function distributionChart(entries,mean){const max=Math.max(...entries.map(([,p])=>p),.01),last=entries.at(-1)?.[0]||1;return `<div class="bar-chart rich-chart">${entries.map(([v,p])=>`<div class="bar" style="height:${Math.max(2,p/max*100)}%" data-label="${v} dégâts · ${(p*100).toFixed(1)}%"><span>${(p*100).toFixed(0)}%</span><b>${v}</b></div>`).join('')}<i class="mean-marker" style="left:${Math.min(100,mean/last*100)}%"><em>Moy. théorique ${mean.toFixed(2)}</em></i></div>`}
function observedHistogram(rolls,theoreticalMean){if(!rolls.length)return '<div class="empty">Pas encore de données.</div>';const counts=new Map();rolls.forEach(r=>counts.set(Number(r.result),(counts.get(Number(r.result))||0)+1));const entries=[...counts].sort((a,b)=>a[0]-b[0]),max=Math.max(...entries.map(x=>x[1])),maxResult=Math.max(entries.at(-1)[0],theoreticalMean||0,1);return `<div class="bar-chart observed-chart">${entries.map(([v,n])=>`<div class="bar observed" style="height:${n/max*100}%" data-label="Résultat ${v} · ${n} fois"><span>${n}</span><b>${v}</b></div>`).join('')}${theoreticalMean!==null?`<i class="mean-marker" style="left:${theoreticalMean/maxResult*100}%"><em>Moy. théorique ${theoreticalMean.toFixed(2)}</em></i>`:''}</div>`}
function timelineChart(rolls,theoreticalMean){if(!rolls.length)return '<div class="empty">Pas encore de données.</div>';const values=rolls.slice(-30).map(r=>Number(r.result)),max=Math.max(...values,theoreticalMean||0,1),points=values.map((v,i)=>`${values.length===1?50:i/(values.length-1)*100},${92-v/max*78}`).join(' '),meanY=92-(theoreticalMean||0)/max*78;return `<div class="line-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b38a44" stop-opacity=".38"/><stop offset="1" stop-color="#b38a44" stop-opacity="0"/></linearGradient></defs>${theoreticalMean!==null?`<line class="theoretical-line" x1="0" x2="100" y1="${meanY}" y2="${meanY}"/>`:''}<polyline class="area" points="0,96 ${points} 100,96"/><polyline class="line" points="${points}"/></svg>${theoreticalMean!==null?`<em class="timeline-mean" style="top:${meanY}%">Moy. théorique ${theoreticalMean.toFixed(2)}</em>`:''}<span>Ancien</span><span>30 derniers jets</span><span>Récent</span></div>`}
function rollRow(r){const statLabel=r.requestedStat&&r.requestedStat!==r.stat?`${r.requestedStat} → ${r.stat}`:r.stat||'sans caractéristique';return `<div class="list-row history-row"><span class="tag ${r.outcome==='Réussi'?'success':r.outcome==='Raté'?'rust':r.mode==='physique'?'gold':''}">${esc(r.outcome||r.mode)}</span><div><h4>${esc(r.source||r.formula)}</h4><p>${esc(r.formula)} · ${esc(statLabel)}${r.target!==undefined?` · cible ≤ ${r.target}`:''} · ${new Date(r.timestamp).toLocaleDateString('fr-FR')}</p></div><span class="roll-result">${r.result}</span><button class="row-actions" data-action="delete-roll" data-id="${r.id}">×</button></div>`}
function emptyState(title,text){return `<div class="empty"><strong>${title}</strong>${text}</div>`}

function bindPageEvents() {
  $$('[data-stat]').forEach(input=>input.addEventListener('change',()=>{activeCharacter().stats[input.dataset.stat]=Math.max(1,Math.min(20,Number(input.value)));save();render()}));
  $$('[data-resource]').forEach(input=>input.addEventListener('change',()=>{activeCharacter().resources[input.dataset.resource]=Math.max(0,Number(input.value)||0);save();render()}));
  $$('[data-resource-delta]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.resourceDelta,r=activeCharacter().resources;r[key]=Math.max(0,Number(r[key]||0)+Number(button.dataset.delta));save();render()}));
  $('#portrait-input')?.addEventListener('change', readPortrait);
  $$('[data-action]').forEach(el=>el.addEventListener('click',()=>handleAction(el.dataset.action,el.dataset)));
  $$('[data-money]').forEach(el=>el.addEventListener('click',()=>{const m=activeCharacter().money,k=el.dataset.money;m[k]=Math.max(0,m[k]+Number(el.dataset.delta));save();render()}));
  $$('[data-roll-filter]').forEach(el=>el.addEventListener('change',()=>{
    const key=el.dataset.rollFilter; rollFilters[key]=el.value;
    if(!dimensionFilteredRolls(activeCharacter().rolls).length){for(const other of Object.keys(rollFilters))if(other!==key)rollFilters[other]='all'}
    render();
  }));
  ['formula','failureFormula','enemyProtection','stat','modifier'].forEach(k=> $(`#calc-${k}`)?.addEventListener('change',e=>{calcState[k==='stat'?'attribute':k]=['modifier','enemyProtection'].includes(k)?Number(e.target.value):e.target.value.trim();render()}));
}

function handleAction(action,d){
  const c=activeCharacter();
  if(action==='edit-character') return characterModal(); if(action==='edit-notes')return notesModal();
  if(action==='edit-resource-limits') return resourceLimitsModal();
  if(action==='roll-stat') return statRollModal(d.statName);
  if(action==='add-item')return itemModal(null,d.type); if(action==='edit-item')return itemModal(c.inventory.find(x=>x.id===d.id));
  if(action==='delete-item'){c.inventory=c.inventory.filter(x=>x.id!==d.id);save();render();return}
  if(action==='add-combat')return combatModal(null,d.type); if(action==='edit-combat')return combatModal(listFor(d.type).find(x=>x.id===d.id),d.type);
  if(action==='roll-attack'){const item=listFor(d.type).find(x=>x.id===d.id);return performVirtualRoll(formulaWithBonus(item.damage,item.bonus),item.name,effectiveWeaponStat(item))}
  if(action==='roll-armor'){const item=c.armors.find(x=>x.id===d.id);return performVirtualRoll(formulaWithBonus(item.protection,item.bonus),`Armure · ${item.name}`,'Protection')}
  if(action==='test-combat'){const item=listFor(d.type).find(x=>x.id===d.id),ranged=d.type==='weapon'&&/distance|arc|arbalète|projectile/i.test(`${item.quality} ${item.description}`);return statRollModal(item.stat,item.name,ranged?'armes à distance':'combat')}
  if(action==='roll-spell'){const item=c.spells.find(x=>x.id===d.id), success=d.outcome==='success';return performVirtualRoll(success?item.successFormula:item.failureFormula,`${item.name} · ${success?item.successLabel:item.failureLabel}`,item.stat)}
  if(action==='add-talent')return talentModal(null,d.type);if(action==='edit-talent')return talentModal(c.talents.find(x=>x.id===d.id));
  if(action==='reset-filters'){rollFilters={die:'all',source:'all',stat:'all'};render();return}
  if(action==='physical')return physicalModal(); if(action==='delete-roll'){c.rolls=c.rolls.filter(x=>x.id!==d.id);save();render()}
}
function listFor(type){const c=activeCharacter();return type==='weapon'?c.weapons:type==='spell'?c.spells:c.armors}

function openModal(html){$('#modal-content').innerHTML=html;$('#modal-backdrop').classList.remove('hidden')}
function closeModal(){$('#modal-backdrop').classList.add('hidden');$('#modal-content').innerHTML=''}
function formValues(form){return Object.fromEntries(new FormData(form).entries())}

function characterModal(){const c=activeCharacter();openModal(`<h2 id="modal-title">Modifier le personnage</h2><form id="modal-form"><div class="bio-grid">${field('name','Nom',c.name)}${field('xp','XP non dépensée',c.xp,'number')}${field('archetype','Archétype',c.archetype)}${field('race','Race',c.race)}${field('occupation','Occupation',c.occupation)}${field('age','Âge',c.age)}${field('quote','Devise',c.quote,'text','full')}${field('description','Description',c.description,'textarea','full')}</div>${modalButtons()}</form>`);$('#modal-form').onsubmit=e=>{e.preventDefault();Object.assign(c,formValues(e.target));c.xp=Number(c.xp);save();closeModal();render()}}
function notesModal(){const c=activeCharacter();openModal(`<h2 id="modal-title">Notes & histoire</h2><form id="modal-form">${field('notes','Journal libre',c.notes,'textarea')}${modalButtons()}</form>`);$('#modal-form').onsubmit=e=>{e.preventDefault();c.notes=formValues(e.target).notes;save();closeModal();render()}}
function resourceLimitsModal(){const r=activeCharacter().resources;openModal(`<h2 id="modal-title">Ajuster les seuils</h2><form id="modal-form"><p class="subtle">Ces bonus s’ajoutent aux valeurs calculées. Ils permettent de gérer les futurs talents sans perdre les formules de base.</p>${field('enduranceMaxBonus','Bonus d’endurance maximale',r.enduranceMaxBonus,'number')}${field('painThresholdBonus','Bonus au seuil de douleur',r.painThresholdBonus,'number')}${field('corruptionThresholdBonus','Bonus au seuil de corruption',r.corruptionThresholdBonus,'number')}${field('corruptionMaxBonus','Bonus de corruption maximale',r.corruptionMaxBonus,'number')}${modalButtons()}</form>`);$('#modal-form').onsubmit=e=>{e.preventDefault();const v=formValues(e.target);for(const key of ['enduranceMaxBonus','painThresholdBonus','corruptionThresholdBonus','corruptionMaxBonus'])r[key]=Number(v[key]||0);save();closeModal();render()}}
function itemModal(item,type){const editing=!!item;item=item||{category:type,name:'',detail:'',quantity:1};openModal(`<h2 id="modal-title">${editing?'Modifier':'Ajouter'} un objet</h2><form id="modal-form">${field('name','Nom',item.name)}${field('detail','Description',item.detail)}${field('quantity','Quantité',item.quantity,'number')}${modalButtons()}</form>`);$('#modal-form').onsubmit=e=>{e.preventDefault();const v=formValues(e.target);v.quantity=Math.max(1,Number(v.quantity));if(editing)Object.assign(item,v);else activeCharacter().inventory.push({id:uid(),category:type,...v});save();closeModal();render()}}
function combatModal(item,type){
  const editing=!!item, isArmor=type==='armor', isSpell=type==='spell';
  item=item||{name:'',description:'',damage:'1d8',bonus:0,stat:'Précision',ammo:type==='weapon'?0:null,quality:'',protection:'1d4',successFormula:'',successLabel:'Effet si réussi',failureFormula:'',failureLabel:'Effet si raté'};
  const mechanical=isArmor
    ? `${field('protection','Dé de protection',item.protection)}${field('bonus','Bonus au jet',item.bonus||0,'number')}`
    : isSpell
      ? `${field('successLabel','Description de l’effet réussi',item.successLabel)}${field('successFormula','Dé associé — optionnel',item.successFormula)}${field('failureLabel','Description de l’effet raté',item.failureLabel)}${field('failureFormula','Dé associé — optionnel',item.failureFormula)}`
      : `${field('damage','Dé de dégâts',item.damage)}${field('bonus','Bonus au jet',item.bonus||0,'number')}${field('ammo','Munitions',item.ammo??0,'number')}`;
  openModal(`<h2 id="modal-title">${editing?'Modifier':'Ajouter'} ${isArmor?'une armure':isSpell?'un sort':'une arme'}</h2><form id="modal-form">${field('name','Nom',item.name)}${!isArmor?field('description','Description et effets',item.description,'textarea'):''}${mechanical}${!isArmor?selectField('stat','Caractéristique',Object.keys(activeCharacter().stats),item.stat):''}${field('quality',isArmor?'Qualités':isSpell?'Coût / tradition':'Qualités et type d’arme',item.quality||item.cost||'')}${modalButtons(editing)}</form>`);
  $('#modal-form').onsubmit=e=>{e.preventDefault();const v=formValues(e.target);if(!isSpell)v.bonus=Number(v.bonus||0);if(type==='weapon')v.ammo=Number(v.ammo);if(editing)Object.assign(item,v);else listFor(type).push({id:uid(),...v,...(isArmor?{equipped:false}:{})});save();closeModal();render()};
  $('#delete-modal')?.addEventListener('click',()=>{const arr=listFor(type);arr.splice(arr.findIndex(x=>x.id===item.id),1);save();closeModal();render()});
}
function talentModal(item,type){
  const editing=!!item; item=item||{type,name:'',level:type==='boon'?'Atout':type==='burden'?'Fardeau':'Novice',description:'',effects:[],substitutions:[]};
  const stats=['',...Object.keys(activeCharacter().stats)], conditions=['toujours','combat','hors combat','armes à distance','animaux','social'];
  const effectRows=Array.from({length:3},(_,i)=>{const x=item.effects[i]||{stat:'',value:0,condition:'toujours'};return `<div class="form-row">${selectField(`effectStat${i}`,`Caractéristique ${i+1}`,stats,x.stat)}${field(`effectValue${i}`,'Modificateur',x.value,'number')}${selectField(`effectCondition${i}`,'Contexte',conditions,x.condition)}</div>`}).join('');
  const substitutionRows=Array.from({length:2},(_,i)=>{const x=item.substitutions[i]||{from:'',to:'',condition:'combat'};return `<div class="form-row">${selectField(`subFrom${i}`,'Remplace',stats,x.from)}${selectField(`subTo${i}`,'Par',stats,x.to)}${selectField(`subCondition${i}`,'Contexte',conditions,x.condition)}</div>`}).join('');
  openModal(`<h2 id="modal-title">${editing?'Modifier':'Ajouter'} une capacité</h2><form id="modal-form">${field('name','Nom',item.name)}${field('level','Niveau / nature',item.level)}${field('description','Description',item.description,'textarea')}<h3>Modificateurs</h3>${effectRows}<h3>Substitutions de caractéristiques</h3><p class="subtle">Exemple : Précision remplacée par Vigilance avec les armes à distance.</p>${substitutionRows}${modalButtons(editing)}</form>`);
  $('#modal-form').onsubmit=e=>{e.preventDefault();const v=formValues(e.target);const base={name:v.name,level:v.level,description:v.description};base.effects=Array.from({length:3},(_,i)=>({stat:v[`effectStat${i}`],value:Number(v[`effectValue${i}`]),condition:v[`effectCondition${i}`]})).filter(x=>x.stat&&x.value);base.substitutions=Array.from({length:2},(_,i)=>({from:v[`subFrom${i}`],to:v[`subTo${i}`],condition:v[`subCondition${i}`]})).filter(x=>x.from&&x.to);if(editing)Object.assign(item,base);else activeCharacter().talents.push({id:uid(),type,...base});save();closeModal();render()};
  $('#delete-modal')?.addEventListener('click',()=>{activeCharacter().talents=activeCharacter().talents.filter(x=>x.id!==item.id);save();closeModal();render()});
}
function statRollModal(initialStat='Discrétion',source='',initialContext='normal'){
  const c=activeCharacter(), contexts=['normal','combat','hors combat','armes à distance','animaux','social'];
  openModal(`<h2 id="modal-title">Jet de caractéristique</h2><form id="modal-form">${selectField('stat','Caractéristique',Object.keys(c.stats),initialStat)}${selectField('context','Contexte du jet',contexts,initialContext)}${field('modifier','Bonus ou malus (+ / −)',0,'number')}<div class="stat-preview" id="stat-preview"></div><p class="subtle">Un résultat au d20 inférieur ou égal à la valeur finale est réussi.</p>${modalButtons()}</form>`);
  const preview=()=>{
    const form=$('#modal-form'), requested=form.elements.stat.value, rawContext=form.elements.context.value, context=rawContext==='normal'?'':rawContext;
    const resolved=substitutedStat(requested,context), base=modifiedStat(resolved,context), modifier=Number(form.elements.modifier.value||0), target=Math.max(0,Math.min(20,base+modifier));
    $('#stat-preview').innerHTML=`<span>Valeur utilisée</span><strong>${esc(requested)}${resolved!==requested?` → ${esc(resolved)}`:''} : ${base}${modifier?` ${modifier>0?'+':''}${modifier}`:''} = ${target}</strong><small>Réussite sur ${target} ou moins · ${target*5}%</small>`;
  };
  ['stat','context','modifier'].forEach(name=>$('#modal-form').elements[name].addEventListener('input',preview)); preview();
  $('#modal-form').onsubmit=e=>{
    e.preventDefault(); const v=formValues(e.target), context=v.context==='normal'?'':v.context;
    const resolved=substitutedStat(v.stat,context), base=modifiedStat(resolved,context), target=Math.max(0,Math.min(20,base+Number(v.modifier||0))), roll=rollFormula('1d20');
    const outcome=roll.total<=target?'Réussi':'Raté';
    recordRoll({formula:'1d20',result:roll.total,details:String(roll.total),source:source||`Test de ${v.stat}`,stat:resolved,requestedStat:v.stat,mode:'virtuel',kind:'test',context:v.context,modifier:Number(v.modifier||0),target,outcome});
    closeModal(); render();
  };
}
function physicalModal(){const c=activeCharacter(),sources=[...c.weapons.map(x=>x.name),...c.spells.map(x=>x.name),...c.armors.map(x=>`Armure · ${x.name}`)];openModal(`<h2 id="modal-title">Saisir un jet physique</h2><form id="modal-form">${field('formula','Type de dé et bonus','1d20')}${field('result','Résultat final',1,'number')}${selectField('source','Attaque, sort, armure ou action',['Jet libre',...sources],'Jet libre')}${selectField('stat','Caractéristique',['',...Object.keys(c.stats),'Protection'],'')}${modalButtons()}</form>`);$('#modal-form').onsubmit=e=>{e.preventDefault();const v=formValues(e.target);recordRoll({formula:v.formula.replace(/\s/g,''),result:Number(v.result),source:v.source,stat:v.stat,mode:'physique'});closeModal();render()}}
function field(name,label,value,type='text',cls=''){
  const control=type==='textarea'
    ? `<textarea id="f-${name}" name="${name}">${esc(value)}</textarea>`
    : `<input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'step="1"':''}>`;
  return `<div class="field ${cls}"><label for="f-${name}">${label}</label>${control}</div>`;
}
function selectField(name,label,options,value){return `<div class="field"><label>${label}</label><select name="${name}">${options.map(o=>`<option value="${esc(o)}" ${o===value?'selected':''}>${esc(o||'Aucune')}</option>`).join('')}</select></div>`}
function modalButtons(deletable=false){return `<div class="modal-actions">${deletable?'<button type="button" class="button danger" id="delete-modal">Supprimer</button>':''}<span style="flex:1"></span><button type="button" class="button secondary" onclick="document.getElementById('modal-close').click()">Annuler</button><button class="button">Enregistrer</button></div>`}

function recordRoll(data){activeCharacter().rolls.push({id:uid(),timestamp:new Date().toISOString(),...data});save();toast(`${data.formula} →`,`${data.result}${data.outcome?` · ${data.outcome}`:''}`)}
function performVirtualRoll(formula,source='Jet libre',stat=''){try{const roll=rollFormula(formula);recordRoll({formula:roll.formula,result:roll.total,details:roll.dice.join(' + '),source,stat,mode:'virtuel'});render()}catch(e){toast('Erreur',e.message)}}
function readPortrait(e){const file=e.target.files[0];if(!file)return;if(file.size>2_000_000)return toast('Image trop lourde','2 Mo maximum');const reader=new FileReader();reader.onload=()=>{activeCharacter().image=reader.result;save();render()};reader.readAsDataURL(file)}
function toast(label,value){const el=document.createElement('div');el.className='toast';el.innerHTML=`${esc(label)} <strong>${esc(value)}</strong>`;$('#toast-region').append(el);setTimeout(()=>el.remove(),3200)}

function characterMenu(){const menu=$('#character-menu');menu.innerHTML=state.characters.map(c=>`<button data-character="${c.id}">${esc(c.name)} <small>· ${esc(c.archetype)}</small></button>`).join('')+'<button id="new-character"><strong>＋ Nouveau personnage</strong></button>';menu.classList.toggle('hidden');$$('[data-character]',menu).forEach(b=>b.onclick=()=>{state.activeCharacterId=b.dataset.character;rollFilters={die:'all',source:'all',stat:'all'};save();menu.classList.add('hidden');render()});$('#new-character').onclick=()=>newCharacterModal()}
function newCharacterModal(){openModal(`<h2 id="modal-title">Nouveau personnage</h2><form id="modal-form">${field('name','Nom','Nouveau personnage')}${field('archetype','Archétype','Aventurier')}${field('race','Race','Humain')}${modalButtons()}</form>`);$('#modal-form').onsubmit=e=>{e.preventDefault();const v=formValues(e.target),base=structuredClone(activeCharacter());Object.assign(base,v,{id:uid(),xp:0,image:'',description:'',quote:'',notes:'',inventory:[],weapons:[],armors:[],spells:[],talents:[],rolls:[]});state.characters.push(base);state.activeCharacterId=base.id;save();closeModal();render()}}

$('#main-nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(!b)return;currentPage=b.dataset.page;$('.sidebar').classList.remove('open');render()});
$('#mobile-menu').onclick=()=>$('.sidebar').classList.toggle('open'); $('#character-switcher').onclick=characterMenu;
$('#modal-close').onclick=closeModal;$('#modal-backdrop').onclick=e=>{if(e.target.id==='modal-backdrop')closeModal()};
$('#dice-toggle').onclick=()=>$('#dice-quick').classList.toggle('hidden');
$$('#dice-quick [data-die]').forEach(b=>b.onclick=()=>{if(b.dataset.die==='20')statRollModal();else performVirtualRoll(`1d${b.dataset.die}`);$('#dice-quick').classList.add('hidden')});
$('#physical-roll').onclick=()=>{physicalModal();$('#dice-quick').classList.add('hidden')};

render();
if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
