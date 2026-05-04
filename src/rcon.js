const { Rcon } = require("rcon-client");
const { MODE_LOOKUP } = require("./constants");

const DEFAULT_COMMAND_TIMEOUT_MS = Number(process.env.RCON_COMMAND_TIMEOUT_MS || 5000);

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function sendWithTimeout(rcon, command, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
  return withTimeout(rcon.send(command), timeoutMs, `RCON command '${command}'`);
}

async function withRcon(config, fn) {
  const rcon = await Rcon.connect({
    host: config.rconHost,
    port: Number(config.rconPort),
    password: config.rconPassword,
    timeout: 7000
  });

  try {
    return await fn(rcon);
  } finally {
    await withTimeout(rcon.end(), 2000, "RCON disconnect").catch(() => undefined);
  }
}

async function runCommands(config, commands) {
  return withRcon(config, async (rcon) => {
    const output = [];
    for (const command of commands) {
      const result = await sendWithTimeout(rcon, command);
      output.push({ command, result });
    }
    return output;
  });
}

function parseStatusText(statusText) {
  const mapMatch = statusText.match(/map\s*:\s*([^\s]+)/i);
  const playersLineMatch = statusText.match(/players\s*:\s*(\d+)/i);
  const playerRows = statusText.match(/^#\s+\d+\s+/gm);

  const map = mapMatch ? mapMatch[1] : "Unknown";
  const players = playersLineMatch
    ? Number(playersLineMatch[1])
    : playerRows
      ? playerRows.length
      : 0;

  return { map, players };
}

function parseConvarValue(response) {
  const quotedMatch = response.match(/"([^"]+)"/);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  const parts = response.split("=");
  if (parts.length > 1) {
    return parts[1].trim();
  }

  return response.trim();
}

async function queryServerStatus(config) {
  return withRcon(config, async (rcon) => {
    const [statusResult, gameTypeResult, gameModeResult] = await Promise.allSettled([
      sendWithTimeout(rcon, "status"),
      sendWithTimeout(rcon, "game_type"),
      sendWithTimeout(rcon, "game_mode")
    ]);

    const statusRaw = statusResult.status === "fulfilled" ? statusResult.value : "";
    const gameTypeRaw = gameTypeResult.status === "fulfilled" ? gameTypeResult.value : "";
    const gameModeRaw = gameModeResult.status === "fulfilled" ? gameModeResult.value : "";

    if (!statusRaw && !gameTypeRaw && !gameModeRaw) {
      throw new Error("RCON status query did not return a response.");
    }

    const { map, players } = parseStatusText(statusRaw || "");
    const gameType = parseConvarValue(gameTypeRaw || "");
    const gameMode = parseConvarValue(gameModeRaw || "");
    const modeLabel = MODE_LOOKUP[`${gameType}:${gameMode}`] || `Type ${gameType} / Mode ${gameMode}`;

    return {
      map,
      players,
      modeLabel,
      gameType,
      gameMode,
      updatedAt: new Date().toISOString()
    };
  });
}

module.exports = {
  runCommands,
  queryServerStatus
};
