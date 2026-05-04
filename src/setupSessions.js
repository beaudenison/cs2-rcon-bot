const fs = require("node:fs");
const path = require("node:path");

function buildSessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

class SetupSessionStore {
  constructor(dataDir, ttlMinutes = 30) {
    this.filePath = path.join(dataDir, "setup-sessions.json");
    this.ttlMs = Math.max(1, Number(ttlMinutes) || 30) * 60 * 1000;

    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({ sessions: {} }, null, 2));
    }

    this.cleanupExpired();
  }

  readRaw() {
    const raw = fs.readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.sessions || {};
  }

  writeRaw(sessions) {
    fs.writeFileSync(this.filePath, JSON.stringify({ sessions }, null, 2));
  }

  isExpired(session) {
    if (!session || !session.expiresAt) {
      return true;
    }

    return new Date(session.expiresAt).getTime() <= Date.now();
  }

  cleanupExpired() {
    const sessions = this.readRaw();
    let changed = false;

    for (const key of Object.keys(sessions)) {
      if (this.isExpired(sessions[key])) {
        delete sessions[key];
        changed = true;
      }
    }

    if (changed) {
      this.writeRaw(sessions);
    }
  }

  get(key) {
    const sessions = this.readRaw();
    const current = sessions[key];

    if (!current) {
      return null;
    }

    if (this.isExpired(current)) {
      delete sessions[key];
      this.writeRaw(sessions);
      return null;
    }

    return current;
  }

  set(key, session) {
    const sessions = this.readRaw();
    sessions[key] = {
      ...session,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString()
    };
    this.writeRaw(sessions);
    return sessions[key];
  }

  delete(key) {
    const sessions = this.readRaw();
    if (sessions[key]) {
      delete sessions[key];
      this.writeRaw(sessions);
    }
  }
}

module.exports = {
  SetupSessionStore,
  buildSessionKey
};
