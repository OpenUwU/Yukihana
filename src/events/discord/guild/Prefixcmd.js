import {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { logger } from "#utils/logger";
import { db } from "#database/DatabaseManager";
import { antiAbuse } from "#utils/AntiAbuse";
import emoji from "#config/emoji";
import {
  canUseCommand,
  getMissingBotPermissions,
  inSameVoiceChannel,
} from "#utils/permissionUtil";
import { config } from "#config/config";
import { PlayerManager } from "#managers/PlayerManager";

async function _sendError(message, title, description) {
  const button = new ButtonBuilder()
    .setLabel("Support")
    .setURL(config.links.supportServer)
    .setStyle(ButtonStyle.Link);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get("cross")} **${title}**`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(description),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork || 'https://cdn.discordapp.com/embed/avatars/2.png'
          )
        )
        .setButtonAccessory(button);

  const reply = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    ephemeral: true,
  };

  try {
    if (message.replied || message.deferred) {
      await message.followUp(reply);
    } else {
      await message.reply(reply);
    }
  } catch (e) {}
}

async function _sendPremiumError(message, type) {
  const button = new ButtonBuilder()
    .setLabel("Support")
    .setURL(config.links.supportServer)
    .setStyle(ButtonStyle.Link);

  const typeText = type === "user" ? "User Premium" : "Guild Premium";

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("info")} **${typeText} Required**`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "This command is an exclusive feature for our premium subscribers.",
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.premiumIcon || config.assets?.defaultThumbnail || 'https://cdn.discordapp.com/embed/avatars/2.png'
          )
        )
        .setButtonAccessory(button);

  await message.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    ephemeral: true,
  });
}

async function _sendCooldownError(message, cooldownTime, command) {
  if (
    !antiAbuse.shouldShowCooldownNotification(message.author.id, command.name)
  ) {
    return;
  }

  const button = new ButtonBuilder()
    .setLabel("Support")
    .setURL(config.links.supportServer)
    .setStyle(ButtonStyle.Link);

  const hasPremium = db.hasAnyPremium(message.author.id, message.guild.id);
  const premiumText = hasPremium
    ? ""
    : "\n\nPremium users get 50% faster cooldowns";

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("cross")} **Cooldown Active**`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `Please wait **${cooldownTime}** more second(s) before using this command again.${premiumText}`,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork || 'https://cdn.discordapp.com/embed/avatars/2.png'
          )
        )
        .setButtonAccessory(button);

  try {
    await message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true,
    });
  } catch (e) {}
}

async function _createTOSContainer() {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${emoji.get('info')} **Terms of Service**`)
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  const content = `**By using Yukihana, you agree to these terms:**\n\n` +
    `**${emoji.get('check')} Acceptable Use**\n` +
    `├─ Use the bot responsibly and follow Discord's Terms of Service\n` +
    `├─ Respect all cooldowns and rate limits for fair usage\n` +
    `├─ Do not attempt to exploit or abuse bot systems\n` +
    `└─ Maintain appropriate conduct in all interactions\n\n` +
    `**${emoji.get('folder')} Service Provision**\n` +
    `├─ Service is provided "as-is" without uptime guarantees\n` +
    `├─ Features may be modified or discontinued with notice\n` +
    `├─ Premium features are subject to additional terms\n` +
    `└─ We reserve the right to limit or suspend access\n\n` +
    `**${emoji.get('cross')} Prohibited Activities**\n` +
    `├─ Using the bot for illegal activities or copyright infringement\n` +
    `├─ Attempting to bypass anti-abuse or security systems\n` +
    `├─ Distributing malicious content or spam through the bot\n` +
    `└─ Disrupting service availability for other users\n\n` +
    `**${emoji.get('reset')} Data & Privacy**\n` +
    `├─ We collect minimal data necessary for functionality\n` +
    `├─ User data is stored securely and not shared inappropriately\n` +
    `├─ You may request data deletion at any time\n` +
    `└─ See our Privacy Policy for complete data handling details\n\n` +
    `**${emoji.get('add')} Enforcement**\n` +
    `├─ Violations may result in cooldown penalties or blacklisting\n` +
    `├─ Automated systems monitor for abuse patterns\n` +
    `├─ Appeals may be submitted through official channels\n` +
    `└─ Decisions are made at the discretion of the development team\n\n` +
    `*Effective: August 2025 | By using this bot, you acknowledge and accept these terms.*`;

  const section = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(
        config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork || 'https://cdn.discordapp.com/embed/avatars/2.png'
      )
    );
  container.addSectionComponents(section);

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  return container;
}

async function _createPPContainer() {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${emoji.get('info')} **Privacy Policy**`)
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  const content = `**We value your privacy and handle data responsibly:**\n\n` +
    `**1. Data We Collect**\n` +
    `├─ Discord User ID for identification and bot functionality\n` +
    `├─ Guild ID for server-specific settings and configurations\n` +
    `├─ Music listening history for personalized recommendations\n` +
    `├─ Custom prefixes and bot preferences you configure\n` +
    `└─ Premium status and subscription information\n\n` +
    `**2. How We Use Data**\n` +
    `├─ Providing core bot functionality and music services\n` +
    `├─ Maintaining user preferences and custom settings\n` +
    `├─ Anti-abuse protection and cooldown management\n` +
    `├─ Premium feature access and subscription management\n` +
    `└─ Improving service quality and user experience\n\n` +
    `**3. Data Storage & Security**\n` +
    `├─ Data is stored securely in encrypted databases\n` +
    `├─ We implement industry-standard security measures\n` +
    `├─ Regular backups ensure data integrity and availability\n` +
    `└─ Access is restricted to authorized development team members\n\n` +
    `**4. Data Sharing**\n` +
    `├─ We do not sell or share personal data with third parties\n` +
    `├─ Music metadata may be sourced from public APIs\n` +
    `├─ Anonymous usage statistics may be collected for improvements\n` +
    `└─ Legal compliance may require data disclosure when required\n\n` +
    `**5. Your Rights**\n` +
    `├─ Request data deletion by contacting our support team\n` +
    `├─ View your stored data through bot commands\n` +
    `├─ Opt-out of data collection by discontinuing bot usage\n` +
    `└─ Update or correct your information at any time\n\n` +
    `*Last updated: August 2025*`;

  const section = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(
        config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork || 'https://cdn.discordapp.com/embed/avatars/2.png'
      )
    );
  container.addSectionComponents(section);

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  return container;
}

async function _sendTOSAcceptance(message) {
  const container = await _createTOSContainer();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tos_accept_${message.author.id}`)
      .setLabel("Accept Terms")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`tos_decline_${message.author.id}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger)
  );

  container.addActionRowComponents(buttons);

  const reply = await message.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });

  const filter = (i) => 
    i.user.id === message.author.id && 
    (i.customId === `tos_accept_${message.author.id}` || i.customId === `tos_decline_${message.author.id}`);

  const collector = reply.createMessageComponentCollector({
    filter,
    time: 300_000,
    max: 1
  });

  return new Promise((resolve) => {
    collector.on('collect', async (interaction) => {
      await interaction.deferUpdate();

      if (interaction.customId === `tos_accept_${message.author.id}`) {
        db.user.acceptTOS(message.author.id, "v1.0");
        resolve(true);
      } else {
        resolve(false);
      }
    });

    collector.on('end', async (collected) => {
      if (collected.size === 0) {
        resolve(false);
      }

      try {
        const finalContainer = await _createTOSContainer();
        await reply.edit({
          components: [finalContainer],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch (e) {}
    });
  });
}

async function _sendPPAcceptance(message) {
  const container = await _createPPContainer();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pp_accept_${message.author.id}`)
      .setLabel("Accept Policy")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pp_decline_${message.author.id}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger)
  );

  container.addActionRowComponents(buttons);

  const reply = await message.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });

  const filter = (i) => 
    i.user.id === message.author.id && 
    (i.customId === `pp_accept_${message.author.id}` || i.customId === `pp_decline_${message.author.id}`);

  const collector = reply.createMessageComponentCollector({
    filter,
    time: 300_000,
    max: 1
  });

  return new Promise((resolve) => {
    collector.on('collect', async (interaction) => {
      await interaction.deferUpdate();

      if (interaction.customId === `pp_accept_${message.author.id}`) {
        db.user.acceptPP(message.author.id, "v1.0");
        resolve(true);
      } else {
        resolve(false);
      }
    });

    collector.on('end', async (collected) => {
      if (collected.size === 0) {
        resolve(false);
      }

      try {
        const finalContainer = await _createPPContainer();
        await reply.edit({
          components: [finalContainer],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch (e) {}
    });
  });
}

async function _handleExpiredUserPerks(userId, author) {
  const hasNoPrefix = db.hasNoPrefix(userId);
  const userPrefixes = db.getUserPrefixes(userId);
  if (!hasNoPrefix && userPrefixes.length === 0) return;

  if (!db.isUserPremium(userId)) {
    let perksRemoved = [];
    if (hasNoPrefix) {
      db.setNoPrefix(userId, false, null);
      perksRemoved.push("No-Prefix Mode");
    }
    if (userPrefixes.length > 0) {
      db.setUserPrefixes(userId, []);
      perksRemoved.push("Custom User Prefixes");
    }

    if (perksRemoved.length > 0 && Math.random() < 0.3) {
      const button = new ButtonBuilder()
        .setLabel("Support")
        .setURL(config.links.supportServer)
        .setStyle(ButtonStyle.Link);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emoji.get("info")} **User Premium Expired**`,
          ),
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        )
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                "Your subscription has ended. The following perks have been disabled:\n• " +
                  perksRemoved.join("\n• "),
              ),
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(
                config.assets?.premiumIcon || config.assets?.defaultThumbnail || 'https://cdn.discordapp.com/embed/avatars/2.png'
              )
            )
            .setButtonAccessory(button);

      try {
        await author.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {}
    }
  }
}

async function _handleExpiredGuildPerks(guildId, channel) {
  if (db.isGuildPremium(guildId)) return;
  const prefixes = db.getPrefixes(guildId);
  if (prefixes.length > 1) {
    db.setPrefixes(guildId, [config.prefix]);

    const button = new ButtonBuilder()
      .setLabel("Support")
      .setURL(config.links.supportServer)
      .setStyle(ButtonStyle.Link);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **Server Premium Expired**`,
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      )
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `This server's premium has expired. Multiple prefixes have been disabled, and the prefix has been reset to: \`${config.prefix}\``,
            ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(
              config.assets?.premiumIcon || config.assets?.defaultThumbnail || 'https://cdn.discordapp.com/embed/avatars/2.png'
            )
          )
          .setButtonAccessory(button);

    try {
      await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch {}
  }
}

function _parseCommand(message, client) {
  const content = message.content.trim();
  const mentionPrefixRegex = new RegExp(`^<@!?${client.user.id}>\\s+`);
  const mentionMatch = content.match(mentionPrefixRegex);
  let commandText = null;

  if (mentionMatch) {
    commandText = content.slice(mentionMatch[0].length).trim();
  } else {
    if (db.isUserPremium(message.author.id)) {
      const userPrefix = db
        .getUserPrefixes(message.author.id)
        .find((p) => content.startsWith(p));
      if (userPrefix) commandText = content.slice(userPrefix.length).trim();
    }
    if (commandText === null) {
      const guildPrefix = db
        .getPrefixes(message.guild.id)
        .find((p) => content.startsWith(p));
      if (guildPrefix) commandText = content.slice(guildPrefix.length).trim();
    }
    if (commandText === null && db.hasNoPrefix(message.author.id)) {
      commandText = content;
    }
  }

  if (commandText === null) return null;
  const parts = commandText.split(/\s+/);
  const commandName = parts.shift()?.toLowerCase();
  return commandName ? { commandName, args: parts } : null;
}

export default {
  name: "messageCreate",
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    await _handleExpiredGuildPerks(message.guild.id, message.channel);
    await _handleExpiredUserPerks(message.author.id, message.author);

    if (
      db.isUserBlacklisted(message.author.id) ||
      db.isGuildBlacklisted(message.guild.id)
    )
      return;

    const mentionRegex = new RegExp(`^<@!?${client.user.id}>\\s*$`);
    if (mentionRegex.test(message.content.trim())) {
      if (!antiAbuse.canShowMentionResponse(message.author.id)) {
        return;
      }

      const guildPrefixes = db.getPrefixes(message.guild.id);
      const userPrefixes = db.getUserPrefixes(message.author.id);

      const button = new ButtonBuilder()
        .setLabel("Support")
        .setURL(config.links.supportServer)
        .setStyle(ButtonStyle.Link);

      let content = `Hello! I'm **${
        client.user.username
      }**\n\nMy prefix in this server is: ${guildPrefixes
        .map((p) => `\`${p}\``)
        .join(" ")}`;
      if (userPrefixes.length > 0)
        content += `\nYour personal prefixes are: ${userPrefixes
          .map((p) => `\`${p}\``)
          .join(" ")}`;
      content += `\n\nUse \`${guildPrefixes[0]}help\` for commands.`;

      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayComponents().setContent(
            `${emoji.get("info")} **Bot Information**`,
          ),
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        )
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(content),
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(
                config.assets?.helpThumbnail || config.assets?.defaultThumbnail || 'https://cdn.discordapp.com/embed/avatars/2.png'
              )
            )
            .setButtonAccessory(button);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const commandInfo = _parseCommand(message, client);
    if (!commandInfo) return;

    const { commandName, args } = commandInfo;
    let command = client.commandHandler.commands.get(commandName);
    if (!command) {
      const aliasTarget = client.commandHandler.aliases.get(commandName);
      if (aliasTarget) {
        command = client.commandHandler.commands.get(aliasTarget);
      }
    }
    if (!command) return;

    try {
      const cooldownTime = antiAbuse.checkCooldown(message.author.id, command, message);
      if (cooldownTime) {
        return _sendCooldownError(message, cooldownTime, command);
      }

      if (!db.user.hasAcceptedBoth(message.author.id)) {
        if (!db.user.hasAcceptedTOS(message.author.id)) {
          const tosAccepted = await _sendTOSAcceptance(message);
          if (!tosAccepted) {
            return _sendError(
              message,
              "Terms Required",
              "You must accept our Terms of Service to use this bot."
            );
          }
        }

        if (!db.user.hasAcceptedPP(message.author.id)) {
          const ppAccepted = await _sendPPAcceptance(message);
          if (!ppAccepted) {
            return _sendError(
              message,
              "Privacy Policy Required",
              "You must accept our Privacy Policy to use this bot."
            );
          }
        }
      }

      if (
        command.maintenance &&
        !config.ownerIds?.includes(message.author.id)
      ) {
        return _sendError(
          message,
          "Command Under Maintenance",
          "This command is temporarily unavailable. Please try again later.",
        );
      }

      if (command.ownerOnly && !config.ownerIds?.includes(message.author.id)) {
        return;
      }

      if (!canUseCommand(message.member, command)) {
        return _sendError(
          message,
          "Insufficient Permissions",
          `You do not have the required permissions to use this command, you need: \`${new PermissionsBitField(
            command.userPermissions,
          )
            .toArray()
            .join(", ")}\``,
        );
      }

      if (command.permissions?.length > 0) {
        const missingBotPerms = getMissingBotPermissions(
          message.channel,
          command.permissions,
        );
        if (missingBotPerms.length > 0) {
          return _sendError(
            message,
            "Missing Bot Permissions",
            `I need the following permissions to run this command: \`${missingBotPerms.join(
              ", ",
            )}\``,
          );
        }
      }

      if (command.userPrem && !db.isUserPremium(message.author.id))
        return _sendPremiumError(message, "user");
      if (command.guildPrem && !db.isGuildPremium(message.guild.id))
        return _sendPremiumError(message, "guild");
      if (
        command.anyPrem &&
        !db.hasAnyPremium(message.author.id, message.guild.id)
      )
        return _sendPremiumError(message, "user");

      if (command.voiceRequired && !message.member.voice.channel) {
        return _sendError(
          message,
          "Voice Channel Required",
          "You must be in a voice channel to use this command.",
        );
      }
      if (command.sameVoiceRequired && message.guild.members.me.voice.channel) {
        if (!inSameVoiceChannel(message.member, message.guild.members.me)) {
          return _sendError(
            message,
            "Same Voice Channel Required",
            "You must be in the same voice channel as me to use this command.",
          );
        }
      }

      const player = client.music.getPlayer(message.guild.id);
      if (command.playerRequired && !player) {
        return _sendError(
          message,
          "No Player Active",
          "There is no music player in this server. Use `/play` to start one.",
        );
      }
      if (command.playingRequired && (!player || !player.queue.current)) {
        return _sendError(
          message,
          "Nothing Is Playing",
          "There is no track currently playing.",
        );
      }

      const executionContext = { client, message, args };
      if (command.playerRequired || command.playingRequired) {
        executionContext.pm = new PlayerManager(player);
      }

      antiAbuse.setCooldown(message.author.id, command);
      await command.execute(executionContext);
    } catch (error) {
      logger.error(
        "MessageCreate",
        `Error executing command '${command.name}' for user ${message.author.id}`,
        error,
      );
      await _sendError(
        message,
        "An Unexpected Error Occurred",
        `Something went wrong while trying to run the \`${command.name}\` command. Please try again later.`,
      );
    }
  },
};