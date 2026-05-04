require("dotenv").config();

const crypto = require("node:crypto");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  RoleSelectMenuBuilder,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} = require("discord.js");

const { getConfig } = require("./config");
const {
  GAME_MODE_CHOICES,
  MAP_CHOICES,
  QUICK_ACTIONS,
  SETTINGS_AND_PRESETS
} = require("./constants");
const { queryServerStatus, runCommands } = require("./rcon");
const { SetupSessionStore, buildSessionKey } = require("./setupSessions");
const { GuildConfigStore } = require("./storage");

const config = getConfig();
const store = new GuildConfigStore(config.dataDir, {
  encryptRconPasswords: config.encryptRconPasswords,
  encryptionKey: config.encryptionKey
});

const setupSessionTtlMinutes = Number(process.env.SETUP_SESSION_TTL_MINUTES || 30);
const setupSessions = new SetupSessionStore(config.dataDir, setupSessionTtlMinutes);

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Start CS2 RCON setup in a selected channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel where the setup wizard and control center should appear")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("editsetup")
    .setDescription("Edit existing CS2 setup without rerunning the full wizard")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Optional new channel for the control center")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .toJSON()
];

function makeSetupId() {
  return crypto.randomBytes(6).toString("hex");
}

function getSetupSession(guildId, ownerId, setupId) {
  const key = buildSessionKey(guildId, ownerId);
  const session = setupSessions.get(key);

  if (!session || session.mode !== "setup") {
    return { error: "expired" };
  }

  if (!setupId || session.setupId !== setupId) {
    return { error: "stale" };
  }

  return { session, key };
}

function staleSetupMessage() {
  return "This setup wizard is outdated. Please use the newest /setup message.";
}

function buildSetupEmbed(channelId) {
  return new EmbedBuilder()
    .setTitle("CS2 Bot Setup Wizard")
    .setDescription(
      [
        "Press **Start Setup** to configure this server.",
        "You will provide the CS2 server IP/port, RCON password, and who can use controls.",
        `Control center will be created in <#${channelId}>.`
      ].join("\n")
    )
    .setColor(0x118ab2);
}

function buildEditSetupEmbed(guildConfig) {
  return new EmbedBuilder()
    .setTitle("Edit CS2 Setup")
    .setColor(0x2a9d8f)
    .setDescription(
      [
        "Use the buttons below to edit only what you need.",
        "No full setup rerun is required.",
        `Current control channel: <#${guildConfig.controlChannelId}>`
      ].join("\n")
    )
    .addFields(
      {
        name: "Allowed Roles",
        value: guildConfig.allowedRoleIds?.length
          ? guildConfig.allowedRoleIds.map((id) => `<@&${id}>`).join(", ")
          : "None",
        inline: false
      },
      {
        name: "Allowed Users",
        value: guildConfig.allowedUserIds?.length
          ? guildConfig.allowedUserIds.map((id) => `<@${id}>`).join(", ")
          : "None",
        inline: false
      }
    );
}

function buildConnectUrl(guildConfig) {
  const steamConnect = `steam://connect/${guildConfig.rconHost}:${guildConfig.rconPort}`;
  return `https://steamcommunity.com/linkfilter/?url=${encodeURIComponent(steamConnect)}`;
}

function buildControlEmbed(guildConfig, status, connected) {
  return new EmbedBuilder()
    .setTitle("Counter-Strike 2 Control Center")
    .setColor(connected ? 0x06d6a0 : 0xef476f)
    .setDescription("Use the menus below to control your CS2 server through RCON.")
    .addFields(
      {
        name: "Connection",
        value: connected ? "Online" : "Offline / Unable to reach RCON",
        inline: true
      },
      {
        name: "Players",
        value: String(status?.players ?? "Unknown"),
        inline: true
      },
      {
        name: "Map",
        value: status?.map || "Unknown",
        inline: true
      },
      {
        name: "Mode",
        value: status?.modeLabel || "Unknown",
        inline: true
      },
      {
        name: "Allowed Roles",
        value: guildConfig.allowedRoleIds?.length
          ? guildConfig.allowedRoleIds.map((id) => `<@&${id}>`).join(", ")
          : "None",
        inline: false
      },
      {
        name: "Allowed Users",
        value: guildConfig.allowedUserIds?.length
          ? guildConfig.allowedUserIds.map((id) => `<@${id}>`).join(", ")
          : "None",
        inline: false
      },
      {
        name: "Connect Command",
        value: `steam://connect/${guildConfig.rconHost}:${guildConfig.rconPort}`,
        inline: false
      }
    )
    .setFooter({ text: `Last Updated: ${new Date(status?.updatedAt || Date.now()).toLocaleString()}` });
}

function buildControlComponents(guildConfig) {
  const mapMenu = new StringSelectMenuBuilder()
    .setCustomId(`cc:map:${guildConfig.guildId}`)
    .setPlaceholder("Choose map")
    .addOptions(MAP_CHOICES);

  const modeMenu = new StringSelectMenuBuilder()
    .setCustomId(`cc:mode:${guildConfig.guildId}`)
    .setPlaceholder("Choose game mode")
    .addOptions(GAME_MODE_CHOICES.map((mode) => ({ label: mode.label, value: mode.value })));

  const quickMenu = new StringSelectMenuBuilder()
    .setCustomId(`cc:quick:${guildConfig.guildId}`)
    .setPlaceholder("Quick actions")
    .addOptions(QUICK_ACTIONS.map((action) => ({ label: action.label, value: action.value })));

  const settingsMenu = new StringSelectMenuBuilder()
    .setCustomId(`cc:settings:${guildConfig.guildId}`)
    .setPlaceholder("Presets and toggles")
    .addOptions(SETTINGS_AND_PRESETS.map((item) => ({ label: item.label, value: item.value })));

  const connectButton = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel("Connect to Server")
    .setURL(buildConnectUrl(guildConfig));

  const refreshButton = new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setCustomId(`cc:refresh:${guildConfig.guildId}`)
    .setLabel("Refresh Status");

  return [
    new ActionRowBuilder().addComponents(mapMenu),
    new ActionRowBuilder().addComponents(modeMenu),
    new ActionRowBuilder().addComponents(quickMenu),
    new ActionRowBuilder().addComponents(settingsMenu),
    new ActionRowBuilder().addComponents(connectButton, refreshButton)
  ];
}

function findCommandsForInteraction(kind, value) {
  if (kind === "map") {
    return [`changelevel ${value}`];
  }

  if (kind === "mode") {
    const mode = GAME_MODE_CHOICES.find((entry) => entry.value === value);
    return mode ? mode.commands : null;
  }

  if (kind === "quick") {
    const quickAction = QUICK_ACTIONS.find((entry) => entry.value === value);
    return quickAction ? quickAction.commands : null;
  }

  if (kind === "settings") {
    const setting = SETTINGS_AND_PRESETS.find((entry) => entry.value === value);
    return setting ? setting.commands : null;
  }

  return null;
}

function hasControlPermission(member, guildConfig) {
  if (!member) {
    return false;
  }

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (guildConfig.allowedUserIds?.includes(member.id)) {
    return true;
  }

  if (guildConfig.allowedRoleIds?.length) {
    const matchingRole = member.roles.cache.find((role) => guildConfig.allowedRoleIds.includes(role.id));
    if (matchingRole) {
      return true;
    }
  }

  return false;
}

async function postOrUpdateControlCenter(guildId) {
  const guildConfig = store.get(guildId);
  if (!guildConfig) {
    return;
  }

  const channel = await client.channels.fetch(guildConfig.controlChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    return;
  }

  let status = null;
  let connected = false;

  try {
    status = await queryServerStatus(guildConfig);
    connected = true;
  } catch {
    status = { updatedAt: new Date().toISOString() };
  }

  const embed = buildControlEmbed(guildConfig, status, connected);
  const components = buildControlComponents(guildConfig);

  if (!guildConfig.controlMessageId) {
    const sent = await channel.send({ embeds: [embed], components });
    store.upsert(guildId, { controlMessageId: sent.id });
    return;
  }

  const existingMessage = await channel.messages.fetch(guildConfig.controlMessageId).catch(() => null);
  if (!existingMessage) {
    const sent = await channel.send({ embeds: [embed], components });
    store.upsert(guildId, { controlMessageId: sent.id });
    return;
  }

  await existingMessage.edit({ embeds: [embed], components });
}

async function registerSlashCommands() {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(Routes.applicationCommands(config.discordClientId), { body: commands });
}

client.once("ready", async () => {
  await registerSlashCommands();

  setInterval(async () => {
    const guilds = store.readAll();
    for (const guildId of Object.keys(guilds)) {
      await postOrUpdateControlCenter(guildId).catch((error) => {
        console.error(`Failed to refresh control center for guild ${guildId}:`, error);
      });
    }
  }, Math.max(15, config.statusRefreshSeconds) * 1000);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === "setup") {
    const channel = interaction.options.getChannel("channel", true);
    const key = buildSessionKey(interaction.guildId, interaction.user.id);
    const setupId = makeSetupId();

    setupSessions.set(key, {
      guildId: interaction.guildId,
      ownerId: interaction.user.id,
      setupId,
      mode: "setup",
      channelId: channel.id,
      allowedRoleIds: [],
      allowedUserIds: [interaction.user.id]
    });

    const startButton = new ButtonBuilder()
      .setCustomId(`setup:start:${interaction.guildId}:${interaction.user.id}:${setupId}`)
      .setStyle(ButtonStyle.Primary)
      .setLabel("Start Setup");

    await channel.send({
      embeds: [buildSetupEmbed(channel.id)],
      components: [new ActionRowBuilder().addComponents(startButton)]
    });

    await interaction.reply({
      content: `Setup wizard posted in <#${channel.id}>.`,
      ephemeral: true
    });

    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "editsetup") {
    const existingConfig = store.get(interaction.guildId);
    if (!existingConfig) {
      await interaction.reply({
        content: "No setup exists yet. Run /setup first.",
        ephemeral: true
      });
      return;
    }

    const newChannel = interaction.options.getChannel("channel", false);
    const targetChannelId = newChannel?.id || existingConfig.controlChannelId;
    const key = buildSessionKey(interaction.guildId, interaction.user.id);

    setupSessions.set(key, {
      guildId: interaction.guildId,
      ownerId: interaction.user.id,
      channelId: targetChannelId,
      rconHost: existingConfig.rconHost,
      rconPort: existingConfig.rconPort,
      rconPassword: existingConfig.rconPassword,
      allowedRoleIds: [...(existingConfig.allowedRoleIds || [])],
      allowedUserIds: [...(existingConfig.allowedUserIds || [interaction.user.id])],
      controlMessageId: existingConfig.controlMessageId || null,
      mode: "edit"
    });

    const editConnectionButton = new ButtonBuilder()
      .setCustomId(`edit:connection:${interaction.guildId}:${interaction.user.id}`)
      .setStyle(ButtonStyle.Primary)
      .setLabel("Edit Connection");

    const editPermissionsButton = new ButtonBuilder()
      .setCustomId(`edit:permissions:${interaction.guildId}:${interaction.user.id}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("Edit Permissions");

    const saveButton = new ButtonBuilder()
      .setCustomId(`edit:save:${interaction.guildId}:${interaction.user.id}`)
      .setStyle(ButtonStyle.Success)
      .setLabel("Save Changes");

    const previewConfig = {
      ...existingConfig,
      controlChannelId: targetChannelId
    };

    await interaction.reply({
      embeds: [buildEditSetupEmbed(previewConfig)],
      components: [
        new ActionRowBuilder().addComponents(editConnectionButton, editPermissionsButton, saveButton)
      ],
      ephemeral: true
    });

    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("setup:start:")) {
    const [, , guildId, ownerId, setupId] = interaction.customId.split(":");

    if (interaction.guildId !== guildId) {
      await interaction.reply({ content: "This setup button is for another server.", ephemeral: true });
      return;
    }

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "Only the person who started setup can continue this wizard.",
        ephemeral: true
      });
      return;
    }

    const setupCheck = getSetupSession(guildId, ownerId, setupId);
    if (setupCheck.error === "stale") {
      await interaction.reply({ content: staleSetupMessage(), ephemeral: true });
      return;
    }

    if (setupCheck.error === "expired") {
      await interaction.reply({ content: "Setup session expired. Please run /setup again.", ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`setup:modal:${guildId}:${ownerId}:${setupId}`)
      .setTitle("CS2 Server Connection");

    const hostInput = new TextInputBuilder()
      .setCustomId("rcon_host")
      .setLabel("Server IP or Hostname")
      .setPlaceholder("123.45.67.89")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const portInput = new TextInputBuilder()
      .setCustomId("rcon_port")
      .setLabel("Server Port")
      .setPlaceholder("27015")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const passwordInput = new TextInputBuilder()
      .setCustomId("rcon_password")
      .setLabel("RCON Password")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(hostInput),
      new ActionRowBuilder().addComponents(portInput),
      new ActionRowBuilder().addComponents(passwordInput)
    );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("setup:modal:")) {
    const [, , guildId, ownerId, setupId] = interaction.customId.split(":");
    const setupCheck = getSetupSession(guildId, ownerId, setupId);
    if (setupCheck.error === "stale") {
      await interaction.reply({
        content: staleSetupMessage(),
        ephemeral: true
      });
      return;
    }

    if (setupCheck.error === "expired") {
      await interaction.reply({
        content: "Setup session expired. Please run /setup again.",
        ephemeral: true
      });
      return;
    }

    const { key, session: existing } = setupCheck;

    const rconHost = interaction.fields.getTextInputValue("rcon_host").trim();
    const rconPort = interaction.fields.getTextInputValue("rcon_port").trim();
    const rconPassword = interaction.fields.getTextInputValue("rcon_password").trim();

    setupSessions.set(key, {
      ...existing,
      rconHost,
      rconPort,
      rconPassword
    });

    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`setup:roles:${guildId}:${ownerId}:${setupId}`)
      .setPlaceholder("Select roles that can control the server")
      .setMinValues(0)
      .setMaxValues(10);

    const userSelect = new UserSelectMenuBuilder()
      .setCustomId(`setup:users:${guildId}:${ownerId}:${setupId}`)
      .setPlaceholder("Select specific users that can control the server")
      .setMinValues(0)
      .setMaxValues(10);

    const completeButton = new ButtonBuilder()
      .setCustomId(`setup:complete:${guildId}:${ownerId}:${setupId}`)
      .setStyle(ButtonStyle.Success)
      .setLabel("Complete Setup");

    const permissionsEmbed = new EmbedBuilder()
      .setTitle("Setup Step 2: Permissions")
      .setColor(0xff9f1c)
      .setDescription(
        [
          "Choose which roles and users can use the CS2 controls.",
          "Admins can always control regardless of selected roles/users.",
          "When ready, click **Complete Setup**."
        ].join("\n")
      );

    await interaction.reply({
      embeds: [permissionsEmbed],
      components: [
        new ActionRowBuilder().addComponents(roleSelect),
        new ActionRowBuilder().addComponents(userSelect),
        new ActionRowBuilder().addComponents(completeButton)
      ],
      ephemeral: true
    });

    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("edit:connection:")) {
    const [, , guildId, ownerId] = interaction.customId.split(":");
    const key = buildSessionKey(guildId, ownerId);
    const current = setupSessions.get(key);

    if (!current || current.mode !== "edit") {
      await interaction.reply({
        content: "Edit session expired. Run /editsetup again.",
        ephemeral: true
      });
      return;
    }

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "Only the person who started edit mode can use this button.",
        ephemeral: true
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`edit:modal:${guildId}:${ownerId}`)
      .setTitle("Edit CS2 Server Connection");

    const hostInput = new TextInputBuilder()
      .setCustomId("rcon_host")
      .setLabel("Server IP or Hostname")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(current.rconHost || "");

    const portInput = new TextInputBuilder()
      .setCustomId("rcon_port")
      .setLabel("Server Port")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(String(current.rconPort || ""));

    const passwordInput = new TextInputBuilder()
      .setCustomId("rcon_password")
      .setLabel("RCON Password")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(current.rconPassword || "");

    modal.addComponents(
      new ActionRowBuilder().addComponents(hostInput),
      new ActionRowBuilder().addComponents(portInput),
      new ActionRowBuilder().addComponents(passwordInput)
    );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("edit:permissions:")) {
    const [, , guildId, ownerId] = interaction.customId.split(":");
    const key = buildSessionKey(guildId, ownerId);
    const current = setupSessions.get(key);

    if (!current || current.mode !== "edit") {
      await interaction.reply({
        content: "Edit session expired. Run /editsetup again.",
        ephemeral: true
      });
      return;
    }

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "Only the person who started edit mode can use this button.",
        ephemeral: true
      });
      return;
    }

    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`edit:roles:${guildId}:${ownerId}`)
      .setPlaceholder("Select roles that can control the server")
      .setMinValues(0)
      .setMaxValues(10);

    const userSelect = new UserSelectMenuBuilder()
      .setCustomId(`edit:users:${guildId}:${ownerId}`)
      .setPlaceholder("Select specific users that can control the server")
      .setMinValues(0)
      .setMaxValues(10);

    const summaryEmbed = new EmbedBuilder()
      .setTitle("Edit Permissions")
      .setColor(0xff9f1c)
      .setDescription("Select roles/users and submit selections. Then click Save Changes in /editsetup.")
      .addFields(
        {
          name: "Current Roles",
          value: current.allowedRoleIds?.length
            ? current.allowedRoleIds.map((id) => `<@&${id}>`).join(", ")
            : "None",
          inline: false
        },
        {
          name: "Current Users",
          value: current.allowedUserIds?.length
            ? current.allowedUserIds.map((id) => `<@${id}>`).join(", ")
            : "None",
          inline: false
        }
      );

    await interaction.reply({
      embeds: [summaryEmbed],
      components: [
        new ActionRowBuilder().addComponents(roleSelect),
        new ActionRowBuilder().addComponents(userSelect)
      ],
      ephemeral: true
    });

    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("edit:modal:")) {
    const [, , guildId, ownerId] = interaction.customId.split(":");
    const key = buildSessionKey(guildId, ownerId);
    const current = setupSessions.get(key);

    if (!current || current.mode !== "edit") {
      await interaction.reply({
        content: "Edit session expired. Run /editsetup again.",
        ephemeral: true
      });
      return;
    }

    const rconHost = interaction.fields.getTextInputValue("rcon_host").trim();
    const rconPort = interaction.fields.getTextInputValue("rcon_port").trim();
    const rconPassword = interaction.fields.getTextInputValue("rcon_password").trim();

    setupSessions.set(key, {
      ...current,
      rconHost,
      rconPort,
      rconPassword
    });

    await interaction.reply({
      content: "Connection details updated for this edit session. Click Save Changes in /editsetup.",
      ephemeral: true
    });

    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("edit:save:")) {
    const [, , guildId, ownerId] = interaction.customId.split(":");
    const key = buildSessionKey(guildId, ownerId);
    const current = setupSessions.get(key);

    if (!current || current.mode !== "edit") {
      await interaction.reply({
        content: "Edit session expired. Run /editsetup again.",
        ephemeral: true
      });
      return;
    }

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "Only the person who started edit mode can save changes.",
        ephemeral: true
      });
      return;
    }

    const existingConfig = store.get(guildId);
    const channelChanged = existingConfig?.controlChannelId !== current.channelId;

    const savedConfig = store.upsert(guildId, {
      guildId,
      controlChannelId: current.channelId,
      rconHost: current.rconHost,
      rconPort: current.rconPort,
      rconPassword: current.rconPassword,
      allowedRoleIds: current.allowedRoleIds || [],
      allowedUserIds: current.allowedUserIds || [ownerId],
      controlMessageId: channelChanged ? null : current.controlMessageId || null
    });

    setupSessions.delete(key);

    try {
      await postOrUpdateControlCenter(guildId);
      await interaction.reply({
        content: `Saved. Control center is now configured for <#${savedConfig.controlChannelId}>.`,
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({
        content: `Settings saved, but refreshing the control center failed: ${error.message}`,
        ephemeral: true
      });
    }

    return;
  }

  if (
    (interaction.isRoleSelectMenu() || interaction.isUserSelectMenu()) &&
    interaction.customId.startsWith("setup:")
  ) {
    const [, kind, guildId, ownerId, setupId] = interaction.customId.split(":");

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "Only the setup owner can change permissions in this wizard.",
        ephemeral: true
      });
      return;
    }

    const setupCheck = getSetupSession(guildId, ownerId, setupId);
    if (setupCheck.error === "stale") {
      await interaction.reply({
        content: staleSetupMessage(),
        ephemeral: true
      });
      return;
    }

    if (setupCheck.error === "expired") {
      await interaction.reply({
        content: "Setup session expired. Please run /setup again.",
        ephemeral: true
      });
      return;
    }

    const { key, session: existing } = setupCheck;

    if (kind === "roles") {
      existing.allowedRoleIds = [...interaction.values];
    }

    if (kind === "users") {
      existing.allowedUserIds = [...new Set([ownerId, ...interaction.values])];
    }

    setupSessions.set(key, existing);

    await interaction.reply({ content: "Permissions selection updated.", ephemeral: true });
    return;
  }

  if (
    (interaction.isRoleSelectMenu() || interaction.isUserSelectMenu()) &&
    interaction.customId.startsWith("edit:")
  ) {
    const [, kind, guildId, ownerId] = interaction.customId.split(":");

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "Only the edit owner can change permissions in this session.",
        ephemeral: true
      });
      return;
    }

    const key = buildSessionKey(guildId, ownerId);
    const existing = setupSessions.get(key);
    if (!existing || existing.mode !== "edit") {
      await interaction.reply({
        content: "Edit session expired. Please run /editsetup again.",
        ephemeral: true
      });
      return;
    }

    if (kind === "roles") {
      existing.allowedRoleIds = [...interaction.values];
    }

    if (kind === "users") {
      existing.allowedUserIds = [...new Set([ownerId, ...interaction.values])];
    }

    setupSessions.set(key, existing);

    await interaction.reply({ content: "Edit permissions selection updated.", ephemeral: true });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("setup:complete:")) {
    const [, , guildId, ownerId, setupId] = interaction.customId.split(":");

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "Only the setup owner can complete this wizard.",
        ephemeral: true
      });
      return;
    }

    const setupCheck = getSetupSession(guildId, ownerId, setupId);
    if (setupCheck.error === "stale") {
      await interaction.reply({
        content: staleSetupMessage(),
        ephemeral: true
      });
      return;
    }

    if (setupCheck.error === "expired") {
      await interaction.reply({
        content: "Setup session expired or missing values. Please run /setup again.",
        ephemeral: true
      });
      return;
    }

    const { key, session: current } = setupCheck;

    if (!current.rconHost || !current.rconPort || !current.rconPassword) {
      await interaction.reply({
        content: "Setup session is missing connection values. Start again with /setup and use the newest setup message.",
        ephemeral: true
      });
      return;
    }

    const savedConfig = store.upsert(guildId, {
      guildId,
      controlChannelId: current.channelId,
      rconHost: current.rconHost,
      rconPort: current.rconPort,
      rconPassword: current.rconPassword,
      allowedRoleIds: current.allowedRoleIds || [],
      allowedUserIds: current.allowedUserIds || [ownerId],
      controlMessageId: null
    });

    setupSessions.delete(key);

    try {
      await postOrUpdateControlCenter(guildId);
      await interaction.reply({
        content: `Setup completed. Control center created in <#${savedConfig.controlChannelId}>.`,
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({
        content: `Setup saved, but creating the control center failed: ${error.message}`,
        ephemeral: true
      });
    }

    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("cc:refresh:")) {
    const [, , guildId] = interaction.customId.split(":");
    const guildConfig = store.get(guildId);

    if (!guildConfig) {
      await interaction.reply({ content: "Server config not found. Run /setup again.", ephemeral: true });
      return;
    }

    if (!hasControlPermission(interaction.member, guildConfig)) {
      await interaction.reply({ content: "You do not have permission to control this server.", ephemeral: true });
      return;
    }

    await postOrUpdateControlCenter(guildId).catch(() => undefined);
    await interaction.reply({ content: "Status refreshed.", ephemeral: true });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("cc:")) {
    const [, kind, guildId] = interaction.customId.split(":");
    const guildConfig = store.get(guildId);

    if (!guildConfig) {
      await interaction.reply({ content: "Server config not found. Run /setup again.", ephemeral: true });
      return;
    }

    if (!hasControlPermission(interaction.member, guildConfig)) {
      await interaction.reply({ content: "You do not have permission to use these controls.", ephemeral: true });
      return;
    }

    const selected = interaction.values[0];
    const commandsToRun = findCommandsForInteraction(kind, selected);

    if (!commandsToRun?.length) {
      await interaction.reply({ content: "Unknown action selected.", ephemeral: true });
      return;
    }

    try {
      await runCommands(guildConfig, commandsToRun);
      await postOrUpdateControlCenter(guildId).catch(() => undefined);
      await interaction.reply({
        content: `Executed ${commandsToRun.length} command(s): ${commandsToRun.join(", ")}`,
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({
        content: `RCON command failed: ${error.message}`,
        ephemeral: true
      });
    }
  }
});

client.login(config.discordToken);
