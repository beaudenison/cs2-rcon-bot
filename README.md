# CS2 RCON Discord Bot

A Docker-ready Discord bot that lets each Discord server configure and control its own Counter-Strike 2 server over RCON.

After inviting the bot, run `/setup` and it will launch an embed-driven setup wizard where admins configure:

- CS2 server host/IP and port
- RCON password
- Which roles/users can use server controls
- Which channel should host the control center

The bot then posts a persistent Control Center embed with live server status and interactive controls.

## Features

- Slash command setup flow: `/setup`
- Fast partial reconfiguration: `/editsetup` (no full setup rerun)
- Embed-based setup wizard with modal inputs
- Per-server permissions (allowed roles and allowed users)
- Status panel showing:
	- RCON connectivity state
	- Current players
	- Current map
	- Current game mode
- One-click `Connect to Server` button using Steam protocol
- Server controls:
	- Map switcher
	- Game mode switcher
	- Quick actions:
		- Restart round
		- Pause/unpause match
		- Restart match
		- Start/end/pause/unpause warmup
		- Swap teams
		- Scramble teams
	- Popular config presets and toggles:
		- Headshot Only ON/OFF
		- Friendly Fire ON/OFF
		- Auto Team Balance ON/OFF

## Requirements

- Node.js 20+ (if running locally)
- Docker + Docker Compose (recommended)
- A Discord application and bot token
- RCON enabled on your CS2 server

## Quick Start (Self-Host with Docker)

1. Clone the repository.
2. Copy environment template:

```bash
cp .env.example .env
```

3. Fill in `.env`:

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_client_id
STATUS_REFRESH_SECONDS=30
DATA_DIR=./data
ENCRYPT_RCON_PASSWORDS=false
ENCRYPTION_KEY=
```

4. Build and start:

```bash
docker compose up -d --build
```

5. Check logs:

```bash
docker compose logs -f
```

Persistent guild configs are stored in `./data/guild-config.json` via a mounted volume.

## Easiest Docker Install (Copy/Paste)

If someone just wants to try it quickly:

```bash
git clone https://github.com/beaudenison/cs2-rcon-bot.git
cd cs2-rcon-bot
cp .env.example .env
# edit .env with token + client id
docker compose up -d --build
docker compose logs -f
```

Stop/restart commands:

```bash
docker compose down
docker compose up -d
```

## Local Development (No Docker)

```bash
npm install
cp .env.example .env
# edit .env
npm start
```

## Discord Bot Setup (Step-by-Step)

Use these exact steps in the Discord Developer Portal so new users can self-host quickly.

1. Go to https://discord.com/developers/applications
2. Click **New Application**.
3. Enter a name (for example, `CS2 RCON Bot`) and click **Create**.
4. In **General Information**:
	- Copy **Application ID** and set it as `DISCORD_CLIENT_ID` in `.env`.
5. In **Bot** (left sidebar):
	- Click **Add Bot** and confirm.
	- Under **Token**, click **Reset Token** (or **Copy**) and set it as `DISCORD_TOKEN` in `.env`.
	- Keep this token secret. Anyone with it can control your bot.
6. In **Bot** settings, enable these toggles:
	- `PUBLIC BOT` enabled (if you want other servers to invite your hosted bot)
	- `MESSAGE CONTENT INTENT` is not required for this project
	- `SERVER MEMBERS INTENT` is not required for this project
	- `PRESENCE INTENT` is not required for this project
7. In **OAuth2 -> URL Generator**:
	- Select scopes: `bot` and `applications.commands`
	- Select bot permissions (recommended baseline):
		- View Channels
		- Send Messages
		- Embed Links
		- Use Slash Commands
		- Read Message History
	- Copy generated URL and open it to invite the bot to your server.
8. After invite, run your container and wait up to a minute for global slash command propagation.
9. In your Discord server, run `/setup` to finish guild-specific CS2 setup.

Invite URL template:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=274877926400
```

## How Server Admins Use It

1. Invite the bot.
2. Run `/setup` and choose a channel.
3. Press `Start Setup` in the posted wizard embed.
4. Enter CS2 host/IP, port, and RCON password.
5. Select allowed roles/users and press `Complete Setup`.
6. Use the Control Center embed in the selected channel.

## Hosting a Public Shared Bot

If you run one public bot instance, multiple Discord servers can invite it and run `/setup` independently. Each guild gets isolated configuration in storage.

To offer your hosted bot to others:

1. Deploy this project once (Docker on a VPS, cloud VM, or container service).
2. Share your bot invite link.
3. Keep `data` volume persistent so guild configurations survive restarts.

## Security Notes

- By default, RCON credentials are stored in `data/guild-config.json` in plaintext.
- Optional encryption at rest is supported:
	- Set `ENCRYPT_RCON_PASSWORDS=true`
	- Set `ENCRYPTION_KEY` to a 32-byte key as one of:
		- 64-char hex
		- base64 for 32 bytes
		- exact 32-char UTF-8 string
- Generate a key quickly:

```bash
openssl rand -hex 32
```

- Restrict file/system access where the bot runs.
- Rotate RCON passwords periodically.
- Use dedicated CS2 server credentials for this bot.

## Commands

- `/setup channel:#your-channel` - starts setup wizard for the guild.
- `/editsetup [channel:#optional-new-channel]` - edits connection/permissions/channel without rerunning full setup.

## Troubleshooting

- Slash commands do not appear:
	- Verify `DISCORD_CLIENT_ID` and token.
	- Confirm bot has `applications.commands` scope in the invite URL.
	- Wait a minute for global command propagation.
- RCON status shows offline:
	- Verify server IP/port and RCON password.
	- Ensure your host can reach the game server port.
	- Confirm RCON is enabled in the game server config.

## Project Structure

```text
.
├── src/
│   ├── config.js
│   ├── constants.js
│   ├── index.js
│   ├── rcon.js
│   └── storage.js
├── data/
├── Dockerfile
├── docker-compose.yml
└── .env.example
```