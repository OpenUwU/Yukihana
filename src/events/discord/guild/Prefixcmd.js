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
        .setButtonAccessory(button),
    );

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
        .setButtonAccessory(button),
    );

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
        .setButtonAccessory(button),
    );

  try {
    await message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true,
    });
  } catch (e) {}
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
            .setButtonAccessory(button),
        );

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
          .setButtonAccessory(button),
      );

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
      if (userPrefix) {
        commandText = content.slice(userPrefix.length).trim();
      }
    }

    if (commandText === null) {
      const guildPrefix = db
        .getPrefixes(message.guild.id)
        .find((p) => content.startsWith(p));
      if (guildPrefix) {
        commandText = content.slice(guildPrefix.length).trim();
      }
    }

    if (commandText === null && db.hasNoPrefix(message.author.id)) {
      commandText = content;
    }

    if (commandText === null) {
      if (/^yuki/i.test(content)) {
        commandText = content.slice(4).trim();
      } else if (message.author.id === "931059762173464597") {
        const customPrefixes = ["babu", "baby", "bitch", "bish", "qt", "cutie", "baccha"];
        const match = customPrefixes.find((p) =>
          content.toLowerCase().startsWith(p.toLowerCase())
        );
        if (match) {
          commandText = content.slice(match.length).trim();
        }
      }
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
          new TextDisplayBuilder().setContent(
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
            .setButtonAccessory(button),
        );

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
      const cooldownTime = antiAbuse.checkCooldown(message.author.id, command,message);
      if (cooldownTime) {
        return _sendCooldownError(message, cooldownTime, command);
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