const { Rcon } = require("rcon-client");
const { MODE_LOOKUP } = require("./constants");

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
    await rcon.end().catch(() => undefined);
  }
}

async function runCommands(config, commands) {
  return withRcon(config, async (rcon) => {
    const output = [];
    for (const command of commands) {
      const result = await rcon.send(command);
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
    const statusRaw = await rcon.send("status");
    const gameTypeRaw = await rcon.send("game_type");
    const gameModeRaw = await rcon.send("game_mode");

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
