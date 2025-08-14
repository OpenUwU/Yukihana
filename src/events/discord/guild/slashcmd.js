import {
  InteractionType,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
} from "discord.js";

import { config } from "#config/config";
import { db } from "#database/DatabaseManager";
import { PlayerManager } from "#managers/PlayerManager";
import { antiAbuse } from "#utils/AntiAbuse";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import {
  canUseCommand,
  getMissingBotPermissions,
  inSameVoiceChannel,
  hasPremiumAccess,
} from "#utils/permissionUtil";

async function _sendError(interaction, title, description) {
  const button = new ButtonBuilder()
    .setLabel("Support")
    .setURL("https://discord.gg/XYwwyDKhec")
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
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  } catch (error) {
    logger.error("InteractionCreate", "Failed to send error reply.", error);
  }
}

async function _sendPremiumError(interaction, type) {
  const button = new ButtonBuilder()
    .setLabel("Support")
    .setURL("https://discord.gg/XYwwyDKhec")
    .setStyle(ButtonStyle.Link);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("info")} **${type} Required**`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `This command requires a **${type}** subscription.\nContact the bot owner for access.`,
          ),
        )
        .setButtonAccessory(button),
    );

  const reply = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    ephemeral: true,
  };

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  } catch (error) {
    logger.error(
      "InteractionCreate",
      "Failed to send premium error reply.",
      error,
    );
  }
}

async function _sendCooldownError(interaction, cooldownTime, command) {
  if (!antiAbuse.shouldShowCooldownNotification(interaction.user.id, command.name)) {
    return;
  }

  const button = new ButtonBuilder()
    .setLabel("Support")
    .setURL("https://discord.gg/XYwwyDKhec")
    .setStyle(ButtonStyle.Link);

  const hasPremium = db.hasAnyPremium(interaction.user.id, interaction.guild.id);
  const premiumText = hasPremium ? "" : "\n\n*Premium users get 50% faster cooldowns*";

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Cooldown Active**`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `Please wait **${cooldownTime}** more second(s) before using this command.${premiumText}`,
          ),
        )
        .setButtonAccessory(button),
    );

  try {
    await interaction.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true,
    });
  } catch (error) {
    logger.error("InteractionCreate", "Failed to send cooldown error.", error);
  }
}

function getCommandFile(interaction, client) {
  const { commandName } = interaction;
  const subCommandName = interaction.options.getSubcommand(false);
  const key = subCommandName
    ? [commandName, subCommandName].toString()
    : commandName;
  return client.commandHandler.slashCommandFiles.get(key);
}

async function handleChatInputCommand(interaction, client) {
  if (!interaction.inGuild()) {
    const button = new ButtonBuilder()
      .setLabel("Support")
      .setURL("https://discord.gg/XYwwyDKhec")
      .setStyle(ButtonStyle.Link);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("cross")} **Server Only**`,
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      )
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              "Commands can only be used in a server.",
            ),
          )
          .setButtonAccessory(button),
      );

    return interaction.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true,
    });
  }

  const commandToExecute = getCommandFile(interaction, client);

  if (!commandToExecute) {
    logger.warn(
      "InteractionCreate",
      `No command file found for interaction: /${interaction.commandName}`,
    );

    const button = new ButtonBuilder()
      .setLabel("Support")
      .setURL("https://discord.gg/XYwwyDKhec")
      .setStyle(ButtonStyle.Link);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("cross")} **Command Error**`,
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      )
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              "This command seems to be outdated or improperly configured.",
            ),
          )
          .setButtonAccessory(button),
      );

    return interaction.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true,
    });
  }

  try {
    const cooldownTime = antiAbuse.checkCooldown(
      interaction.user.id,
      commandToExecute,
    );
    if (cooldownTime) {
      return _sendCooldownError(interaction, cooldownTime, commandToExecute);
    }

    if (
      db.isUserBlacklisted(interaction.user.id) ||
      db.isGuildBlacklisted(interaction.guild.id)
    ) {
      return _sendError(
        interaction,
        "Access Denied",
        "You are not permitted to use this bot.",
      );
    }

    if (
      commandToExecute.maintenance &&
      !config.ownerIds?.includes(interaction.user.id)
    ) {
      return _sendError(
        interaction,
        "Under Maintenance",
        "This command is currently under maintenance. Please try again later.",
      );
    }

    if (
      commandToExecute.ownerOnly &&
      !config.ownerIds?.includes(interaction.user.id)
    ) {
      return _sendError(
        interaction,
        "Permission Denied",
        "This is an owner-only command.",
      );
    }

    if (!canUseCommand(interaction.member, commandToExecute)) {
      return _sendError(
        interaction,
        "Insufficient Permissions",
        "You do not have the required permissions to use this command.",
      );
    }

    if (commandToExecute.permissions?.length > 0) {
      const missingBotPerms = getMissingBotPermissions(
        interaction.channel,
        commandToExecute.permissions,
      );
      if (missingBotPerms.length > 0) {
        return _sendError(
          interaction,
          "Missing Bot Permissions",
          `I am missing the following permissions to run this command: \`${missingBotPerms.join(", ")}\``,
        );
      }
    }

    if (
      commandToExecute.userPrem &&
      !hasPremiumAccess(interaction.user.id, interaction.guild.id, "user")
    )
      return _sendPremiumError(interaction, "User Premium");
    if (
      commandToExecute.guildPrem &&
      !hasPremiumAccess(interaction.user.id, interaction.guild.id, "guild")
    )
      return _sendPremiumError(interaction, "Guild Premium");
    if (
      commandToExecute.anyPrem &&
      !hasPremiumAccess(interaction.user.id, interaction.guild.id, "any")
    )
      return _sendPremiumError(interaction, "Premium");

    if (commandToExecute.voiceRequired && !interaction.member.voice.channel) {
      return _sendError(
        interaction,
        "Voice Channel Required",
        "You must be in a voice channel to use this command.",
      );
    }
    if (
      commandToExecute.sameVoiceRequired &&
      interaction.guild.members.me.voice.channel
    ) {
      if (
        !inSameVoiceChannel(interaction.member, interaction.guild.members.me)
      ) {
        return _sendError(
          interaction,
          "Different Voice Channel",
          `You must be in the same voice channel as me: **${interaction.guild.members.me.voice.channel.name}**.`,
        );
      }
    }

    const player = client.music.getPlayer(interaction.guild.id);

    if (commandToExecute.playerRequired && !player) {
      return _sendError(
        interaction,
        "No Player Active",
        "There is no music player active in this server.\nUse `/play` to start one.",
      );
    }
    if (
      commandToExecute.playingRequired &&
      (!player || !player.queue.current)
    ) {
      return _sendError(
        interaction,
        "Nothing Playing",
        "There is no track currently playing.\nUse `/play` to start a song.",
      );
    }

    const executionContext = { interaction, client };

    if (commandToExecute.playerRequired || commandToExecute.playingRequired) {
      executionContext.pm = new PlayerManager(player);
    }

    antiAbuse.setCooldown(interaction.user.id, commandToExecute);
    await commandToExecute.slashExecute(executionContext);
  } catch (error) {
    logger.error(
      "InteractionCreate",
      `Error executing slash command '${commandToExecute.slashData.name}'`,
      error,
    );
    await _sendError(
      interaction,
      "Command Error",
      "An unexpected error occurred while running the command.",
    );
  }
}

async function handleAutocomplete(interaction, client) {
  const commandToExecute = getCommandFile(interaction, client);
  if (!commandToExecute || !commandToExecute.autocomplete) return;

  try {
    await commandToExecute.autocomplete({ interaction, client });
  } catch (error) {
    logger.error(
      "InteractionCreate",
      `Error handling autocomplete for '${interaction.commandName}'`,
      error,
    );
  }
}

export default {
  name: "interactionCreate",
  async execute(interaction, client) {
    if (interaction.type === InteractionType.ApplicationCommand) {
      await handleChatInputCommand(interaction, client);
    } else if (
      interaction.type === InteractionType.ApplicationCommandAutocomplete
    ) {
      await handleAutocomplete(interaction, client);
    }
  },
};
