const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function encryptString(plainText, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `enc:v1:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptString(cipherText, key) {
  if (typeof cipherText !== "string" || !cipherText.startsWith("enc:v1:")) {
    return cipherText;
  }

  const parts = cipherText.split(":");
  if (parts.length !== 5) {
    throw new Error("Invalid encrypted value format.");
  }

  const iv = Buffer.from(parts[2], "base64");
  const authTag = Buffer.from(parts[3], "base64");
  const encrypted = Buffer.from(parts[4], "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

class GuildConfigStore {
  constructor(dataDir, options = {}) {
    this.filePath = path.join(dataDir, "guild-config.json");
    this.encryptRconPasswords = Boolean(options.encryptRconPasswords);
    this.encryptionKey = options.encryptionKey || null;

    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({ guilds: {} }, null, 2));
    }
  }

  readRawAll() {
    const raw = fs.readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.guilds || {};
  }

  normalizeGuild(guildConfig) {
    const output = { ...guildConfig };

    if (output.rconPasswordEnc) {
      if (!this.encryptionKey) {
        output.rconPassword = null;
      } else {
        output.rconPassword = decryptString(output.rconPasswordEnc, this.encryptionKey);
      }
    }

    return output;
  }

  serializeGuild(guildConfig) {
    const output = { ...guildConfig };

    if (this.encryptRconPasswords && output.rconPassword != null) {
      if (!this.encryptionKey) {
        throw new Error("Cannot encrypt RCON password: encryption key is missing.");
      }

      output.rconPasswordEnc = encryptString(output.rconPassword, this.encryptionKey);
      delete output.rconPassword;
    } else if (!this.encryptRconPasswords && output.rconPasswordEnc && this.encryptionKey) {
      output.rconPassword = decryptString(output.rconPasswordEnc, this.encryptionKey);
      delete output.rconPasswordEnc;
    }

    return output;
  }

  readAll() {
    const rawGuilds = this.readRawAll();
    const guilds = {};

    for (const guildId of Object.keys(rawGuilds)) {
      guilds[guildId] = this.normalizeGuild(rawGuilds[guildId]);
    }

    return guilds;
  }

  writeAll(guilds) {
    fs.writeFileSync(this.filePath, JSON.stringify({ guilds }, null, 2));
  }

  get(guildId) {
    const all = this.readAll();
    return all[guildId] || null;
  }

  upsert(guildId, config) {
    const all = this.readAll();
    all[guildId] = {
      ...(all[guildId] || {}),
      ...config,
      updatedAt: new Date().toISOString()
    };

    const serialized = {};
    for (const id of Object.keys(all)) {
      serialized[id] = this.serializeGuild(all[id]);
    }

    this.writeAll(serialized);
    return all[guildId];
  }
}

module.exports = { GuildConfigStore };
