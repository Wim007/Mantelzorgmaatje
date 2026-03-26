const Anthropic = require('@anthropic-ai/sdk');
const { updateProfile } = require('./session-store');
const { formatVoorPrompt } = require('./regelingen-matcher');
const wizardTemplates = require('../data/wizard-templates.json');

const MODEL = process.env.MANTELZORG_AI_MODEL || 'claude-sonnet-4-6';
let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const TOOLS = [
  {
    name: 'update_profile',
    description: 'Sla profielinformatie op die de mantelzorger heeft gedeeld. Roep dit aan zodra je nieuwe informatie hebt.',
    input_schema: {
      type: 'object',
      properties: {
        relatie:                { type: 'string'  },
        aandoening:             { type: 'string'  },
        gemeente:               { type: 'string'  },
        werkend:                { type: 'boolean' },
        zorgverzekeraar:        { type: 'string'  },
        aanvullendeVerzekering: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'generate_aanvraag',
    description: 'Genereer een concept aanvraagbrief op basis van verzamelde gegevens.',
    input_schema: {
      type: 'object',
      properties: {
        wizard_type: { type: 'string', enum: ['mantelzorgwaardering', 'zorgverlof_brief'] },
        velden: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['wizard_type', 'velden'],
    },
  },
];

function buildSystemPrompt(session) {
  const { profile } = session;
  const profielTekst = Object.entries(profile)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `  ${k}: ${v}`).join('\n') || 'Nog leeg.';

  const ontbrekend = [];
  if (!profile.relatie)         ontbrekend.push('relatie tot zorgontvanger');
  if (!profile.aandoening)      ontbrekend.push('aard/situatie van de zorg');
  if (!profile.gemeente)        ontbrekend.push('gemeente');
  if (profile.werkend === null) ontbrekend.push('werkstatus');
  if (!profile.zorgverzekeraar) ontbrekend.push('zorgverzekeraar');

  return `Je bent de Mantelzorg Coach van Mantelzorgmaatje. Je helpt mantelzorgers in Nederland praktisch en emotioneel.

PERSOONLIJKHEID:
- Warm maar zakelijk, praktisch en oplossingsgericht
- Schrijf op B1-niveau, geen vakjargon
- Normaliseer: "dit is herkenbaar, veel mantelzorgers lopen hier tegenaan"
- Bied altijd een concrete volgende stap

GRENZEN:
- Nooit medische adviezen of diagnoses
- Bij crisis: verwijs naar huisarts of Mantelzorgtelefoon 0800-0800 (gratis, ma-vr 08.00-20.00)

HUIDIG PROFIEL:
${profielTekst}

${profile.gemeente
  ? `PASSENDE REGELINGEN:\n${formatVoorPrompt(profile)}`
  : 'REGELINGEN: Nog niet beschikbaar - gemeente is nog onbekend.'}

${ontbrekend.length
  ? `VERZAMEL NOG (natuurlijk, max. 1-2 vragen tegelijk):\n${ontbrekend.map(o => `  - ${o}`).join('\n')}\nGebruik update_profile zodra je iets weet.`
  : 'Profiel compleet. Presenteer de meest relevante regelingen als je dat nog niet hebt gedaan.'}

AANVRAGEN: Als de gebruiker een aanvraag wil starten, stel de benodigde vragen en roep daarna generate_aanvraag aan.
TAAL: Altijd Nederlands. Spreek de gebruiker aan met je/jouw.`;
}

function generateAanvraagTekst(wizardType, velden, gemeente) {
  const wizard = wizardTemplates.wizards[wizardType];
  if (!wizard) return null;
  let tekst = wizard.template.replace(/\{gemeente\}/g, gemeente || '[uw gemeente]');
  for (const [k, v] of Object.entries(velden)) {
    tekst = tekst.replace(new RegExp(`\\{${k}\\}`, 'g'), v || '[niet ingevuld]');
  }
  if (velden.indicatie?.trim()) {
    tekst = tekst.replace('{indicatie_regel}', `\nDe persoon voor wie ik zorg heeft een ${velden.indicatie}.`);
  } else {
    tekst = tekst.replace('{indicatie_regel}', '');
  }
  tekst = tekst.replace(/\{[^}]+\}/g, '[niet ingevuld]');
  return `Concept: ${wizard.naam}\n\nKopieer en pas aan waar nodig.\n\n${tekst}`;
}

async function chat(session) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      message: 'De AI Coach is momenteel niet beschikbaar. Bel de gratis Mantelzorgtelefoon 0800-0800 (ma-vr 08.00-20.00).',
      profileUpdated: false, session,
    };
  }

  let apiMessages = session.messages.map(m => ({ role: m.role, content: m.content }));
  const cleaned = [];
  for (const msg of apiMessages) {
    if (!cleaned.length || cleaned[cleaned.length - 1].role !== msg.role) cleaned.push(msg);
  }
  apiMessages = cleaned;

  if (!apiMessages.length || apiMessages[0].role !== 'user') {
    return { message: 'Sessie-fout. Laad de pagina opnieuw.', profileUpdated: false, session };
  }

  let currentSession = session;
  let profileUpdated = false;

  let response = await getClient().messages.create({
    model: MODEL, max_tokens: 1500,
    system: buildSystemPrompt(session),
    tools: TOOLS, messages: apiMessages,
  });

  let rounds = 0;
  while (response.stop_reason === 'tool_use' && rounds < 4) {
    rounds++;
    const toolResults = [];

    for (const block of response.content.filter(b => b.type === 'tool_use')) {
      let result = '';
      if (block.name === 'update_profile') {
        const updates = Object.fromEntries(
          Object.entries(block.input).filter(([, v]) => v !== null && v !== undefined)
        );
        if (Object.keys(updates).length) {
          currentSession = updateProfile(currentSession.id, updates);
          profileUpdated = true;
          result = 'Profiel bijgewerkt: ' + JSON.stringify(updates);
        }
      } else if (block.name === 'generate_aanvraag') {
        result = generateAanvraagTekst(block.input.wizard_type, block.input.velden, currentSession.profile.gemeente)
          || 'Template niet gevonden.';
      }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }

    apiMessages = [...apiMessages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];

    response = await getClient().messages.create({
      model: MODEL, max_tokens: 1500,
      system: buildSystemPrompt(currentSession),
      tools: TOOLS, messages: apiMessages,
    });
  }

  const finalText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { message: finalText || 'Geen antwoord ontvangen.', profileUpdated, session: currentSession };
}

module.exports = { chat };
