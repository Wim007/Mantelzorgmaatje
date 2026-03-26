const { regelingen } = require('../data/regelingen.json');

function matchRegelingen(profile) {
  return regelingen.filter(r => {
    switch (r.trigger) {
      case 'altijd': return true;
      case 'werkend': return profile.werkend === true;
      case 'heeft_zorgverzekering': return Boolean(profile.zorgverzekeraar);
      default: return false;
    }
  });
}

function formatVoorPrompt(profile) {
  const matched = matchRegelingen(profile);
  if (!matched.length) return 'Nog geen profiel voor regelingen-matching.';
  return matched.map(r =>
    `• [${r.categorie.toUpperCase()}] ${r.naam}: ${r.uitleg} — Aanvragen bij: ${r.aanvragen_bij}`
  ).join('\n');
}

module.exports = { matchRegelingen, formatVoorPrompt };
