const { randomUUID } = require('crypto');
const store = new Map();

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, s] of store) {
    if (s.updatedAt < cutoff) store.delete(id);
  }
}, 60 * 60 * 1000).unref();

function createSession() {
  const id = randomUUID();
  const session = {
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    profile: {
      relatie: null, aandoening: null, gemeente: null,
      werkend: null, zorgverzekeraar: null, aanvullendeVerzekering: null,
    },
    messages: [],
  };
  store.set(id, session);
  return session;
}

function getSession(id) { return store.get(id) || null; }

function updateProfile(id, updates) {
  const s = store.get(id);
  if (!s) return null;
  const updated = { ...s, profile: { ...s.profile, ...updates }, updatedAt: Date.now() };
  store.set(id, updated);
  return updated;
}

function addMessage(id, role, content) {
  const s = store.get(id);
  if (!s) return null;
  const messages = [...s.messages, { role, content }].slice(-40);
  const updated = { ...s, messages, updatedAt: Date.now() };
  store.set(id, updated);
  return updated;
}

module.exports = { createSession, getSession, updateProfile, addMessage };
