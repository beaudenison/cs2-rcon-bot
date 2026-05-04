const path = require("node:path");

function parseBool(value, defaultValue = false) {
  if (value == null) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseEncryptionKey(rawValue) {
  if (!rawValue) {
    return null;
  }

  const value = String(rawValue).trim();

  const hexRegex = /^[0-9a-fA-F]{64}$/;
  if (hexRegex.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    const base64 = Buffer.from(value, "base64");
    if (base64.length === 32) {
      return base64;
    }
  } catch {
    // Ignore and continue to UTF-8 fallback.
  }

  const utf8 = Buffer.from(value, "utf8");
  if (utf8.length === 32) {
    return utf8;
  }

  throw new Error(
    "ENCRYPTION_KEY must be 32 bytes (64-char hex, base64 encoding of 32 bytes, or 32-char UTF-8 string)."
  );
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getConfig() {
  const encryptRconPasswords = parseBool(process.env.ENCRYPT_RCON_PASSWORDS, false);
  const encryptionKey = parseEncryptionKey(process.env.ENCRYPTION_KEY || "");

  if (encryptRconPasswords && !encryptionKey) {
    throw new Error("ENCRYPT_RCON_PASSWORDS is enabled, but ENCRYPTION_KEY is missing.");
  }

  return {
    discordToken: required("DISCORD_TOKEN"),
    discordClientId: required("DISCORD_CLIENT_ID"),
    statusRefreshSeconds: Number(process.env.STATUS_REFRESH_SECONDS || 30),
    dataDir: path.resolve(process.cwd(), process.env.DATA_DIR || "./data"),
    encryptRconPasswords,
    encryptionKey
  };
}

module.exports = { getConfig };
