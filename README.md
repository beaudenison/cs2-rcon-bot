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

- Docker + Docker Compose
- A Discord account that can create a bot in the Discord Developer Portal
- RCON enabled on your CS2 server

## Install

Use this single command:

```bash
curl -fsSL https://raw.githubusercontent.com/beaudenison/cs2-rcon-bot/main/install.sh | bash
```

The installer wizard will:

- Walk you through creating a Discord bot
- Prompts for bot token and client ID
- Optionally enables encrypted-at-rest RCON password storage
- Writes `.env` and `docker-compose.yml` to `~/cs2-rcon-bot`
- Pulls the prebuilt Docker image from GHCR
- Starts the container automatically

After install:

```bash
cd ~/cs2-rcon-bot && docker compose logs -f
```

Persistent guild configs are stored in `~/cs2-rcon-bot/data/guild-config.json`.

## What The Wizard Asks For

The terminal wizard handles setup in this order:

1. Install location
2. Discord bot creation guidance
3. Discord bot token
4. Discord application ID
5. Status refresh interval
6. Optional encrypted-at-rest password storage

## Discord Bot Creation

The installer itself explains these steps, but the short version is:

1. Create a Discord application.
2. Add a bot user.
3. Copy the Application ID.
4. Copy the bot token.
5. Invite the bot using scopes `bot` and `applications.commands`.

Developer Portal:

```text
https://discord.com/developers/applications
```

Invite URL template:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=274877926400
```

## Running And Managing

View logs:

```bash
cd ~/cs2-rcon-bot && docker compose logs -f
```

Restart:

```bash
cd ~/cs2-rcon-bot && docker compose restart
```

Stop:

```bash
cd ~/cs2-rcon-bot && docker compose down
```

Start again:

```bash
cd ~/cs2-rcon-bot && docker compose up -d
```

## For Developers Only

If you want to work on the source directly instead of using the installer:

```bash
npm install
cp .env.example .env
npm start
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

## Publishing Docker Image for One-Command Installs

This repo includes a workflow at `.github/workflows/publish-image.yml` that publishes:

- `ghcr.io/beaudenison/cs2-rcon-bot:latest` (on pushes to main)
- tag versions (when you push tags like `v1.0.0`)

To enable public pulls from GHCR:

1. Go to your repository packages in GitHub.
2. Open the published container package.
3. Set visibility to public.

Once public, anyone can run the one-command installer without cloning the repo.

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