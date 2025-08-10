import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} from "discord.js";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";
const PREMIUM_PREFIX_LIMIT = 5;
const COMMON_PREFIXES = ['!', '.', '?', '$', '%', '^', '&', '*'];

class PrefixCommand extends Command {
  constructor() {
    super({
      name: "prefix",
      description: "View or change the bot prefix for this server with premium multi-prefix support",
      usage: "prefix [new prefix]",
      aliases: ["setprefix"],
      category: "settings",
      examples: [
        "prefix",
        "prefix !",
        "setprefix $",
        "prefix ?"
      ],
      cooldown: 1,
      userPermissions: [PermissionFlagsBits.Administrator],
      permissions: [PermissionFlagsBits.SendMessages],
      enabledSlash: true,
      slashData: {
        name: "prefix",
        description: "View or change the bot prefix for this server.",
        options: [{
          name: "set",
          description: "Set a new prefix. This will overwrite the existing one for standard servers.",
          type: 3,
          required: false,
          max_length: 5,
        }, ],
      },
    });
  }

  async execute({ message, args }) {
    await this._handleCommand(message, args[0]);
  }

  async slashExecute({ interaction }) {
    const newPrefix = interaction.options.getString("set");
    await this._handleCommand(interaction, newPrefix);
  }

  async _handleCommand(ctx, newPrefix) {
    const isInteraction = !!ctx.user;
    const guild = ctx.guild;
    const user = isInteraction ? ctx.user : ctx.author;

    if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator) && !config.ownerIds.includes(user.id)) {
      return this._sendError(ctx, "Permission Denied", "Only server administrators can change the bot prefix.");
    }

    const isPremium = db.isGuildPremium(guild.id);

    if (newPrefix) {
      await this._setPrefix(ctx, newPrefix, isPremium, isInteraction);
    } else {
      await this._showManagementUI(ctx, isPremium, isInteraction);
    }
  }

  async _setPrefix(ctx, newPrefix, isPremium, isInteraction) {
    if (newPrefix.length > 5) {
      return this._sendError(ctx, "Error", "Prefix is too long. Maximum 5 characters allowed.");
    }

    let prefixes   =db.getPrefixes(ctx.guild.id);
    let updateMessage;

    if (isPremium) {
      if (prefixes.includes(newPrefix)) {
        return this._sendError(ctx, "Prefix Exists", `The prefix \`${newPrefix}\` is already set for this server.`);
      }
      if (prefixes.length >= PREMIUM_PREFIX_LIMIT) {
        return this._sendError(ctx, "Prefix Limit Reached", `Premium servers can have a maximum of ${PREMIUM_PREFIX_LIMIT} prefixes.`);
      }
      prefixes.push(newPrefix);
      updateMessage   =`Successfully added new prefix: \`${newPrefix}\``;
    } else {
      prefixes   =[newPrefix];
      updateMessage   =`Server prefix has been updated to \`${newPrefix}\``;
    }

    db.setPrefixes(ctx.guild.id, prefixes);

    const container   =this._createSuccessContainer("Prefix Updated", updateMessage, newPrefix);
    const replyOptions   ={
      components: [container],
      flags: MessageFlags.IsComponentsV2
    };
    isInteraction ? await ctx.reply(replyOptions) : await ctx.channel.send(replyOptions);
  }

  async _showManagementUI(ctx, isPremium, isInteraction) {
    const prefixes   =db.getPrefixes(ctx.guild.id);
    const container   =isPremium ?
      this._createPremiumContainer(prefixes) :
      this._createStandardContainer(prefixes[0]);

    const reply   =await (isInteraction ?
      ctx.reply({
        components: [container],
        fetchReply: true,
        flags: MessageFlags.IsComponentsV2
      }) :
      ctx.channel.send({
        components: [container],
        fetchReply: true,
        flags: MessageFlags.IsComponentsV2
      }));

    if (isPremium) {
      this._setupCollector(reply, isInteraction ? ctx.user.id : ctx.author.id);
    }
  }

  _createStandardContainer(prefix) {
    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Server Prefix`)
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
    const section   =new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`The current prefix for this server is: **\`${prefix}\`**`),
        new TextDisplayBuilder().setContent(`\nTo change it, use the command with a new prefix.\nExample: \`${prefix}prefix new!\` or \`/prefix set:new!\`\n\n**Note:** premium servers can have multiple prefixes buy premium now!`)
      ).setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));
    container.addSectionComponents(section);
    return container;
  }

  _createPremiumContainer(prefixes) {
    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Premium Prefix Management`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const prefixList   =prefixes.map(p   => `\`${p}\``).join(' ');
    const section   =new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Current Prefixes (${prefixes.length}/${PREMIUM_PREFIX_LIMIT}):**\n${prefixList}`))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));
    container.addSectionComponents(section);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    if (prefixes.length > 1) {
      const selectMenu   =new StringSelectMenuBuilder()
        .setCustomId('prefix_remove_select')
        .setPlaceholder('Select prefixes to remove')
        .setMinValues(1)
        .setMaxValues(prefixes.length - 1)
        .addOptions(prefixes.map(p   => ({
          label: p,
          value: p
        })));
      container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));
    }

    const buttons   =new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('prefix_add').setLabel('Add Prefix').setStyle(ButtonStyle.Success).setDisabled(prefixes.length >= PREMIUM_PREFIX_LIMIT),
        new ButtonBuilder().setCustomId('prefix_remove').setLabel('Remove Selected').setStyle(ButtonStyle.Danger).setDisabled(prefixes.length <= 1),
        new ButtonBuilder().setCustomId('prefix_reset').setLabel('Reset to Default').setStyle(ButtonStyle.Secondary)
      );
    container.addActionRowComponents(buttons);
    return container;
  }

  _setupCollector(message, userId) {
    const collector   =message.createMessageComponentCollector({
      filter: (i)   => i.user.id   ===userId,
      time: 300_000,
    });

    collector.on('collect', async (interaction)   => {
      if (interaction.customId   ==='prefix_add') {
        const modal   =new ModalBuilder().setCustomId('prefix_add_modal').setTitle('Add New Prefix')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('new_prefix_input').setLabel("New prefix (max 5 characters)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5)
            )
          );
        await interaction.showModal(modal);

        const modalSubmit   =await interaction.awaitModalSubmit({
          time: 60_000
        }).catch(()   => null);
        if (!modalSubmit) return;

        await modalSubmit.deferUpdate();
        const newPrefix   =modalSubmit.fields.getTextInputValue('new_prefix_input');
        await this._setPrefix(message, newPrefix, true, !!interaction.user);
        const prefixes   =db.getPrefixes(message.guild.id);
        await message.edit({
          components: [this._createPremiumContainer(prefixes)]
        });

      } else if (interaction.customId   ==='prefix_reset') {
        await interaction.deferUpdate();
        db.setPrefixes(message.guild.id, [config.prefix]);
        const newPrefixes   =db.getPrefixes(message.guild.id);
        await interaction.editReply({
          components: [this._createPremiumContainer(newPrefixes)]
        });

      } else if (interaction.isStringSelectMenu() && interaction.customId   ==='prefix_remove_select') {
        await interaction.deferUpdate();

      } else if (interaction.customId   ==='prefix_remove') {
        await interaction.deferUpdate();
        const selectInteraction   =message.components[1]?.components[0];
        if (!selectInteraction || !interaction.message.components[1]?.components[0]?.values?.length) {
            return; 
        }
        const valuesToRemove   =interaction.message.components[1]?.components[0].values;
        if (!valuesToRemove || valuesToRemove.length   ===0) return;

        let currentPrefixes   =db.getPrefixes(message.guild.id);
        const newPrefixes   =currentPrefixes.filter(p   => !valuesToRemove.includes(p));
        db.setPrefixes(message.guild.id, newPrefixes);

        await interaction.editReply({
          components: [this._createPremiumContainer(newPrefixes)]
        });
      }
    });

    collector.on('end', async ()   => {
      try {
        const fetchedMessage   =await message.fetch().catch(()   => null);
        if (fetchedMessage && fetchedMessage.components.length > 0) {
          const disabledComponents   =fetchedMessage.components.map(row   => {
            const newRow   =new ActionRowBuilder();
            row.components.forEach(comp   => {
                const newComp   =ButtonBuilder.from(comp).setDisabled(true);
                newRow.addComponents(newComp);
            });
            return newRow;
          });
          await fetchedMessage.edit({
            components: disabledComponents
          });
        }
      } catch (error) {
        if (error.code   !==10008) {
          logger.error("PrefixCommand", "Failed to disable prefix components:", error);
        }
      }
    });
  }

  _createSuccessContainer(title, description, prefix) {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${title}`)
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
    let fullDescription = description;
    if (COMMON_PREFIXES.includes(prefix)) {
      fullDescription += `\n\n**Warning:** Using a common prefix like \`${prefix}\` may cause conflicts with other bots in this server.`;
    }
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(fullDescription))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));
    container.addSectionComponents(section);
    return container;
  }

  async _sendError(ctx, title, description) {
    const isInteraction   =!!ctx.user;
    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    const section   =new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));
    container.addSectionComponents(section);
    const replyOptions   ={
      components: [container],
      ephemeral: true,
      flags: MessageFlags.IsComponentsV2
    };
    if (isInteraction) {
      if (ctx.deferred || ctx.replied) await ctx.editReply(replyOptions);
      else await ctx.reply(replyOptions);
    } else {
      await ctx.channel.send(replyOptions);
    }
  }
}

export default new PrefixCommand();
