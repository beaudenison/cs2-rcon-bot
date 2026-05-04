const MAP_CHOICES = [
  { label: "Dust II", value: "de_dust2" },
  { label: "Mirage", value: "de_mirage" },
  { label: "Inferno", value: "de_inferno" },
  { label: "Nuke", value: "de_nuke" },
  { label: "Ancient", value: "de_ancient" },
  { label: "Anubis", value: "de_anubis" },
  { label: "Vertigo", value: "de_vertigo" },
  { label: "Overpass", value: "de_overpass" },
  { label: "Train", value: "de_train" }
];

const GAME_MODE_CHOICES = [
  {
    label: "Competitive",
    value: "competitive",
    commands: ["game_type 0", "game_mode 1", "mp_restartgame 1"]
  },
  {
    label: "Casual",
    value: "casual",
    commands: ["game_type 0", "game_mode 0", "mp_restartgame 1"]
  },
  {
    label: "Deathmatch",
    value: "deathmatch",
    commands: ["game_type 1", "game_mode 2", "mp_restartgame 1"]
  },
  {
    label: "Wingman",
    value: "wingman",
    commands: ["game_type 0", "game_mode 2", "mp_restartgame 1"]
  },
  {
    label: "Arms Race",
    value: "arms_race",
    commands: ["game_type 1", "game_mode 0", "mp_restartgame 1"]
  }
];

const QUICK_ACTIONS = [
  { label: "Restart Round", value: "restart_round", commands: ["mp_restartgame 1"] },
  { label: "Pause Match", value: "pause_match", commands: ["mp_pause_match"] },
  { label: "Unpause Match", value: "unpause_match", commands: ["mp_unpause_match"] },
  { label: "Restart Match", value: "restart_match", commands: ["mp_restartgame 3"] },
  { label: "Start Warmup", value: "start_warmup", commands: ["mp_warmup_start"] },
  { label: "End Warmup", value: "end_warmup", commands: ["mp_warmup_end"] },
  { label: "Pause Warmup", value: "pause_warmup", commands: ["mp_warmup_pausetimer 1"] },
  { label: "Unpause Warmup", value: "unpause_warmup", commands: ["mp_warmup_pausetimer 0"] },
  { label: "Swap Teams", value: "swap_teams", commands: ["mp_swapteams"] },
  { label: "Scramble Teams", value: "scramble_teams", commands: ["mp_scrambleteams"] }
];

const SETTINGS_AND_PRESETS = [
  {
    label: "Preset: PUG 5v5",
    value: "preset_pug",
    commands: [
      "mp_limitteams 0",
      "mp_autoteambalance 0",
      "mp_friendlyfire 1",
      "mp_maxrounds 24",
      "mp_halftime 1"
    ]
  },
  {
    label: "Preset: Practice",
    value: "preset_practice",
    commands: [
      "sv_cheats 1",
      "mp_roundtime 60",
      "mp_roundtime_defuse 60",
      "mp_maxmoney 60000",
      "mp_startmoney 60000"
    ]
  },
  {
    label: "Preset: Casual Fun",
    value: "preset_casual_fun",
    commands: [
      "game_type 0",
      "game_mode 0",
      "mp_friendlyfire 0",
      "mp_autoteambalance 1",
      "mp_restartgame 1"
    ]
  },
  { label: "Headshot Only ON", value: "hs_on", commands: ["mp_damage_headshot_only 1"] },
  { label: "Headshot Only OFF", value: "hs_off", commands: ["mp_damage_headshot_only 0"] },
  { label: "Friendly Fire ON", value: "ff_on", commands: ["mp_friendlyfire 1"] },
  { label: "Friendly Fire OFF", value: "ff_off", commands: ["mp_friendlyfire 0"] },
  { label: "Auto Team Balance ON", value: "atb_on", commands: ["mp_autoteambalance 1"] },
  { label: "Auto Team Balance OFF", value: "atb_off", commands: ["mp_autoteambalance 0"] }
];

const MODE_LOOKUP = {
  "0:0": "Casual",
  "0:1": "Competitive",
  "0:2": "Wingman",
  "1:0": "Arms Race",
  "1:2": "Deathmatch"
};

module.exports = {
  MAP_CHOICES,
  GAME_MODE_CHOICES,
  QUICK_ACTIONS,
  SETTINGS_AND_PRESETS,
  MODE_LOOKUP
};
