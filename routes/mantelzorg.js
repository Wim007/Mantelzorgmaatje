const express      = require('express');
const router       = express.Router();
const sessionStore = require('../lib/session-store');
const aiCoach      = require('../lib/ai-coach');

router.post('/session', (req, res) => {
  const { sessionId } = req.body || {};
  let session = sessionId ? sessionStore.getSession(sessionId) : null;
  if (!session) session = sessionStore.createSession();
  res.json({ sessionId: session.id, profile: session.profile, messages: session.messages });
});

router.post('/chat', async (req, res) => {
  const { sessionId, message } = req.body || {};
  if (!sessionId || typeof message !== 'string' || !message.trim())
    return res.status(400).json({ error: 'sessionId en message zijn verplicht.' });

  let session = sessionStore.getSession(sessionId) || sessionStore.createSession();
  session = sessionStore.addMessage(session.id, 'user', message.trim());

  try {
    const result = await aiCoach.chat(session);
    if (result.message) sessionStore.addMessage(result.session.id, 'assistant', result.message);
    res.json({ message: result.message, profileUpdated: result.profileUpdated,
               profile: result.session.profile, sessionId: result.session.id });
  } catch (err) {
    console.error('[Coach] fout:', err);
    res.status(500).json({ message: 'Er is iets misgegaan. Probeer het opnieuw of bel 0800-0800.' });
  }
});

router.get('/session/:id', (req, res) => {
  const session = sessionStore.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Sessie niet gevonden.' });
  res.json({ profile: session.profile, messages: session.messages });
});

module.exports = router;
