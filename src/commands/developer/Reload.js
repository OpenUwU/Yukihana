import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
  SeparatorSpacingSize,
} from 'discord.js';

import { config } from '#config/config';
import { Command } from '#structures/classes/Command';

class ReloadCommand extends Command {
  constructor() {
    super({
      name: 'rl',
      description: 'Reloads a command, a category, or all commands for development purposes',
      usage: 'rl <all | command> [name]',
      aliases: ['reload'],
      category: 'developer',
      examples: [
        'rl all',
        'rl command play',
        'reload all',
        'reload command skip',
      ],
      ownerOnly: true,
    });
  }

  async execute({ client, message, args }) {
    const type   =args[0]?.toLowerCase();
    const name   =args.slice(1).join(' ');

    if (!type) {
      return this.sendError(message, `Invalid usage. Correct usage: \`${this.usage}\``);
    }

    let result;
    let title;

    switch (type) {
      case 'all':
        title   ='Reloading All Commands';
        result   =await client.commandHandler.reloadAllCommands();
        break;

      case 'command':
        if (!name) return this.sendError(message, 'Please provide a command name to reload.');
        title   =`Reloading Command: ${name}`;
        result   =await client.commandHandler.reloadCommand(name);
        break;

      default:
        return this.sendError(message, `Invalid type specified. Use 'all' or 'command'.`);
    }

    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const statusText   =result.success ? 'Operation Successful' : 'Operation Failed';
    const detailText   =result.success ? result.message : result.message;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${statusText}**`),
          new TextDisplayBuilder().setContent(`*${detailText}*`),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail)),
    );

    if (!result.success && result.error) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('**Error Details**'),
            new TextDisplayBuilder().setContent(`\`\`\`\n${result.error.substring(0, 1000) }\n\`\`\``),
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail)),
      );
    }

    await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  async sendError(message, error) {
    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Command Error'));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('**Invalid Usage**'),
          new TextDisplayBuilder().setContent(`*${error}*`),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail)),
    );
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
}

export default new ReloadCommand();
