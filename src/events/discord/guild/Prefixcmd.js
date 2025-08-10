import { ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { logger } from "#utils/logger";
import { db } from "#database/DatabaseManager";
import { cooldownManager } from "#utils/cooldownManager";
import { canUseCommand, getMissingBotPermissions, inSameVoiceChannel } from "#utils/permissionUtil";
import { config } from "#config/config";
import { PlayerManager } from "#managers/PlayerManager";


async function _sendError(message, title, description) {
  const container   =new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${title}\n*${description}*`)
    );
  const reply   ={ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true };
  try {
    if (message.replied || message.deferred) {
        await message.followUp(reply);
    } else {
        await message.reply(reply);
    }
  } catch (e) {  }
}

async function _sendPremiumError(message, type) {
    const button   =new ButtonBuilder().setLabel('Get Premium').setURL(config.links.supportServer).setStyle(ButtonStyle.Link);
    const row   =new ActionRowBuilder().addComponents(button);
    const typeText   =type   ==='user' ? 'User Premium' : 'Guild Premium';

    const container   =new ContainerBuilder()
      .setAccentColor(0xfde047)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${typeText} Required\nThis command is an exclusive feature for our premium subscribers.`))
      .addActionRowComponents(row);

    await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true });
}


async function _handleExpiredUserPerks(userId, author) {
  const hasNoPrefix   =db.hasNoPrefix(userId);
  const userPrefixes   =db.getUserPrefixes(userId);
  if (!hasNoPrefix && userPrefixes.length   ===0) return;

  if (!db.isUserPremium(userId)) {
    let perksRemoved   =[];
    if (hasNoPrefix) {
      db.setNoPrefix(userId, false, null);
      perksRemoved.push('No-Prefix Mode');
    }
    if (userPrefixes.length > 0) {
      db.setUserPrefixes(userId, []);
      perksRemoved.push('Custom User Prefixes');
    }

    if (perksRemoved.length > 0 && Math.random() < 0.3) {
      const button   =new ButtonBuilder().setLabel('Renew Premium').setURL(config.links.supportServer).setStyle(ButtonStyle.Link);
      const container   =new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('**User Premium Expired**\nYour subscription has ended. The following perks have been disabled:\n• ' + perksRemoved.join('\n• ')))
        .addActionRowComponents(new ActionRowBuilder().addComponents(button));
      try { await author.send({ components: [container], flags: MessageFlags.IsComponentsV2 }); } catch {}
    }
  }
}

async function _handleExpiredGuildPerks(guildId, channel) {
  if (db.isGuildPremium(guildId)) return;
  const prefixes   =db.getPrefixes(guildId);
  if (prefixes.length > 1) {
    db.setPrefixes(guildId, [config.prefix]);
    const container   =new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Server Premium Expired**\nThis server's premium has expired. Multiple prefixes have been disabled, and the prefix has been reset to: \`${config.prefix}\``));
    try { await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }); } catch {}
  }
}

function _parseCommand(message, client) {
  const content   =message.content.trim();
  const mentionPrefixRegex   =new RegExp(`^<@!?${client.user.id}>\\s+`);
  const mentionMatch   =content.match(mentionPrefixRegex);
  let commandText   =null;

  if (mentionMatch) {
    commandText   =content.slice(mentionMatch[0].length).trim();
  } else {
    if (db.isUserPremium(message.author.id)) {
      const userPrefix   =db.getUserPrefixes(message.author.id).find(p   => content.startsWith(p));
      if (userPrefix) commandText   =content.slice(userPrefix.length).trim();
    }
    if (commandText   ===null) {
      const guildPrefix   =db.getPrefixes(message.guild.id).find(p   => content.startsWith(p));
      if (guildPrefix) commandText   =content.slice(guildPrefix.length).trim();
    }
    if (commandText   ===null && db.hasNoPrefix(message.author.id)) {
      commandText   =content;
    }
  }

  if (commandText   ===null) return null;
  const parts   =commandText.split(/\s+/);
  const commandName   =parts.shift()?.toLowerCase();
  return commandName ? { commandName, args: parts } : null;
}


export default {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    await _handleExpiredGuildPerks(message.guild.id, message.channel);
    await _handleExpiredUserPerks(message.author.id, message.author);
    if (db.isUserBlacklisted(message.author.id) || db.isGuildBlacklisted(message.guild.id)) return;

    const mentionRegex   =new RegExp(`^<@!?${client.user.id}>\\s*$`);
    if (mentionRegex.test(message.content.trim())) {
      const guildPrefixes   =db.getPrefixes(message.guild.id);
      const userPrefixes   =db.getUserPrefixes(message.author.id);
      let content = `**Hello, I'm ${client.user.username}**\nMy prefix in this server is: ${guildPrefixes.map(p => `\`${p}\``).join(' ')}`;
      if (userPrefixes.length > 0) content += `\nYour personal prefixes are: ${userPrefixes.map(p => `\`${p}\``).join(' ')}`;
      content += `\nUse \`${guildPrefixes[0]}help\` for commands.`;
      return message.reply({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))], flags: MessageFlags.IsComponentsV2 });
    }

    const commandInfo   =_parseCommand(message, client);
    if (!commandInfo) return;

    const { commandName, args }   =commandInfo;
    let command   =client.commandHandler.commands.get(commandName);
    if (!command) {
      const aliasTarget   =client.commandHandler.aliases.get(commandName);
      if (aliasTarget) {
        command   =client.commandHandler.commands.get(aliasTarget);
      }
    }
    if (!command) return;

    try {
      if (command.maintenance && !config.ownerIds?.includes(message.author.id)) {
        return _sendError(message, 'Command Under Maintenance', 'This command is temporarily unavailable. Please try again later.');
      }

      if (command.ownerOnly && !config.ownerIds?.includes(message.author.id)) {
        return;
      }

      if (!canUseCommand(message.member, command)) {
        return _sendError(message, 'Insufficient Permissions', 'You do not have the required permissions to use this command.');
      }

      if (command.permissions?.length > 0) {
        const missingBotPerms   =getMissingBotPermissions(message.channel, command.permissions);
        if (missingBotPerms.length > 0) {
          return _sendError(message, 'Missing Bot Permissions', `I need the following permissions to run this command: \`${missingBotPerms.join(', ')}\``);
        }
      }

      if (command.userPrem && !db.isUserPremium(message.author.id)) return _sendPremiumError(message, 'user');
      if (command.guildPrem && !db.isGuildPremium(message.guild.id)) return _sendPremiumError(message, 'guild');
      if (command.anyPrem && !db.hasAnyPremium(message.author.id, message.guild.id)) return _sendPremiumError(message, 'user');

      const cooldownTime   =cooldownManager.checkCooldown(message.author.id, command);
      if (cooldownTime) {
        return _sendError(message, 'Cooldown Active', `Please wait **${cooldownTime}** more second(s) before using this command again.`);
      }

      if (command.voiceRequired && !message.member.voice.channel) {
        return _sendError(message, 'Voice Channel Required', 'You must be in a voice channel to use this command.');
      }
      if (command.sameVoiceRequired && message.guild.members.me.voice.channel) {
        if (!inSameVoiceChannel(message.member, message.guild.members.me)) {
          return _sendError(message, 'Same Voice Channel Required', `You must be in the same voice channel as me to use this.`);
        }
      }

      const player   =client.music.getPlayer(message.guild.id);
      if (command.playerRequired && !player) {
        return _sendError(message, 'No Player Active', `There is no music player in this server. Use \`/play\` to start one.`);
      }
      if (command.playingRequired && (!player || !player.queue.current)) {
        return _sendError(message, 'Nothing Is Playing', `There is no track currently playing.`);
      }

      const executionContext   ={ client, message, args };
      if (command.playerRequired || command.playingRequired) {
        executionContext.pm   =new PlayerManager(player);
      }

      cooldownManager.setCooldown(message.author.id, command);
      await command.execute(executionContext);

    } catch (error) {
      logger.error('MessageCreate', `Error executing command '${command.name}' for user ${message.author.id}`, error);
      await _sendError(message, 'An Unexpected Error Occurred', `Something went wrong while trying to run the \`${command.name}\` command. Please try again later.`);
    }
  }
};
