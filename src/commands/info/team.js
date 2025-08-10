import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { config } from "#config/config";

class TeamInfoCommand extends Command {
  constructor() {
    super({
      name: "teaminfo",
      description: "Shows information about the development team",
      usage: "teaminfo",
      aliases: ["dev team papa", "devteam", "team"],
      category: "info",
      examples: [
        "teaminfo",
        "dev team papa"
      ],
      cooldown: 3,
      enabledSlash: true,
      slashData: {
        name: "teaminfo",
        description: "Get information about the development team",
      },
    });
  }

  async execute({ client, message, args }) {
    try {
      const teamInfoMessage = await message.reply({
        components: [this._createTeamInfoContainer()],
        flags: MessageFlags.IsComponentsV2,
      });

      
    } catch (error) {
      client.logger?.error("TeamInfoCommand", `Error in prefix command: ${error.message}`, error);
      await message.reply({
        components: [this._createErrorContainer("An error occurred while loading team information.")],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const teamInfoMessage = await interaction.reply({
        components: [this._createTeamInfoContainer()],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true,
      });

  
    } catch (error) {
      client.logger?.error("TeamInfoCommand", `Error in slash command: ${error.message}`, error);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ components: [this._createErrorContainer("An error occurred while loading team information.")] });
        } else {
          await interaction.reply({ components: [this._createErrorContainer("An error occurred while loading team information.")], ephemeral: true });
        }
      } catch (e) {}
    }
  }

  _createTeamInfoContainer() {
    try {
      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### Development Team`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const thumbnailUrl = config.assets?.helpThumbnail || config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork || 'https://cdn.discordapp.com/embed/avatars/2.png';

      let content = `**Meet our development team!**\n\n`;
      content += `👨‍💻 **Lead Developer:** Bre4d777\n`;
      content += `🎵 **Bot Name:** Yukihana\n`;
      content += `⚡ **Specialization:** Music & Utility Bot\n`;
      content += `🚀 **Status:** Active Development\n\n`;
      content += `*We're constantly working to improve your experience!*`;

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('GitHub')
          .setStyle(ButtonStyle.Link)
          .setURL('https://github.com/bre4d777/yukihana')
        )
        
      container.addActionRowComponents(buttonRow);

      return container;
    } catch (error) {
      return this._createErrorContainer("Unable to load team information.");
    }
  }

  _createErrorContainer(message) {
    try {
      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### Error`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const thumbnailUrl = config.assets?.helpThumbnail || config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork || 'https://cdn.discordapp.com/embed/avatars/2.png';

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`❌ ${message}`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

      container.addSectionComponents(section);

      return container;
    } catch (error) {
      const fallbackContainer = new ContainerBuilder();
      fallbackContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`❌ ${message}`)
      );
      return fallbackContainer;
    }
  }

  }
export default new TeamInfoCommand();