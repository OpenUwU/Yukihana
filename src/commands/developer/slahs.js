import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  MessageFlags,
} from 'discord.js';

import { config } from '#config/config';
import { Command } from '#structures/classes/Command';
import { logger } from '#utils/logger';

class UpdateSlashCommand extends Command {
  constructor() {
    super({
      name: 'updateslash',
      description: 'Registers or updates all slash commands with Discord globally (Owner Only)',
      usage: 'updateslash',
      aliases: ['slashupdate'],
      category: 'developer',
      examples: [
        'updateslash',
        'slashupdate',
      ],
      ownerOnly: true,
      enabledSlash: false,
    });
  }

  async execute({ client, message }) {
    const initialContainer   =new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Updating Slash Commands'))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('**Scanning Commands**'),
            new TextDisplayBuilder().setContent('*Checking for slash-enabled commands...*'),
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail)),
      );

    const msg   =await message.reply({ components: [initialContainer], flags: MessageFlags.IsComponentsV2 });

    try {
      const slashCommandsData   =client.commandHandler.getSlashCommandsData();

      if (!slashCommandsData || slashCommandsData.length   ===0) {
        return;
      }

      const validationContainer   =new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Validating Commands'))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**Found ${slashCommandsData.length} Commands**`),
              new TextDisplayBuilder().setContent('*Validating command names against Discord API rules...*'),
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail)),
        );
      await msg.edit({ components: [validationContainer] });

      const nameRegex   =/^[\da-z-]{ 1, 32 }$/;
      for (const cmdData of slashCommandsData) {
        if (!nameRegex.test(cmdData.name)) {
          const validationErrorMsg   =`Validation failed for command name: "${cmdData.name}". Names must be 1-32 characters, all lowercase, and contain no spaces or special characters other than hyphens.`;
          logger.error('UpdateSlash', validationErrorMsg);

          const validationErrorContainer   =new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Validation Failed'))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent('**Invalid Command Name**'),
                  new TextDisplayBuilder().setContent(`The command \`${cmdData.name}\` has an invalid name. Please fix it and try again. Check console for details.`),
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail)),
            );
          return msg.edit({ components: [validationErrorContainer] });
        }
      }

      const processingContainer   =new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Registering Commands'))
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**Validation Passed. Registering ${slashCommandsData.length} Commands**`),
              new TextDisplayBuilder().setContent('*Attempting to register them globally...*'),
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail)),
        );
      await msg.edit({ components: [processingContainer] });

      const rest   =new REST({ version: '10' }).setToken(config.token);

      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: slashCommandsData },
      );

      const successContainer   =new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Registration Complete'));
      await msg.edit({ components: [successContainer] });

      logger.success('UpdateSlash', `Registered ${slashCommandsData.length} commands.`);
    } catch (error) {
      logger.error('UpdateSlash', 'Failed to register slash commands', error);
      const errorContainer   =new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Registration Failed'));
      await msg.edit({ components: [errorContainer] });
    }
  }
}

export default new UpdateSlashCommand();
