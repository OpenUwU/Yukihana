import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder,
  ButtonBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, SeparatorSpacingSize, ButtonStyle, MessageFlags
} from "discord.js";
import { db } from "#database/DatabaseManager";

const USER_PREFIX_LIMIT   =3;

class UserPrefixCommand extends Command {
  constructor() {
    super({
      name: "userprefix",
      description: "Manage your personal command prefixes that work across all servers (Premium Only)",
      usage: "userprefix [prefix]",
      aliases: ["up", "myprefix"],
      category: "settings",
      examples: [
        "userprefix",
        "userprefix !",
        "up $",
        "myprefix ?"
      ],
      cooldown: 5,
      userPrem: true,
      enabledSlash: true,
      slashData: {
        name: "userprefix",
        description: "Manage your personal command prefixes (Premium Only).",
        options: [{
          name: "add",
          description: "Add a new personal prefix",
          type: 3,
          required: false,
          max_length: 5,
        }],
      },
    });
  }

  _buildUIManagementContainer(username, prefixes   =[], actionMessage   =null) {
    const container   =new ContainerBuilder().setAccentColor(0x5865f2);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Personal Prefix Management\n*Premium Feature for ${username}*`)
    );
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small, true));

    if (actionMessage) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${actionMessage}**`));
      container.addSeparatorComponents(new SeparatorBuilder());
    }

    const prefixList   =prefixes.length > 0
      ? prefixes.map(p   => `\`${p}\``).join(' ')
      : "*You have no custom prefixes. Click 'Add Prefix' to create one.*";

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Your Prefixes (${prefixes.length}/${USER_PREFIX_LIMIT}):**\n${prefixList}\n\n*These prefixes work only for you in any server I'm in.*`)
    );
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large, true));

    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("up_add").setLabel("Add Prefix").setStyle(ButtonStyle.Success).setDisabled(prefixes.length >= USER_PREFIX_LIMIT),
      new ButtonBuilder().setCustomId("up_remove_all").setLabel("Remove All").setStyle(ButtonStyle.Danger).setDisabled(prefixes.length   ===0)
    ));

    if (prefixes.length > 0) {
      container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('up_remove_select')
          .setPlaceholder('Or, select specific prefixes to remove...')
          .setMinValues(1).setMaxValues(prefixes.length)
          .addOptions(prefixes.map(p   => ({ label: `Remove prefix: "${p}"`, value: p })))
      ));
    }
    return container;
  }

  _createSuccessContainer(message) {
    return new ContainerBuilder()
      .setAccentColor(0x57f287)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### Success\n**${message}**`)
      );
  }

  _createErrorContainer(message) {
    return new ContainerBuilder()
      .setAccentColor(0xed4245)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### Error\n**${message}**`)
      );
  }

  async _addPrefix(userId, newPrefix) {
    if (!newPrefix || newPrefix.trim()   ==='') {
      return { success: false, message: "Please provide a valid prefix." };
    }

    const trimmedPrefix   =newPrefix.trim();

    if (trimmedPrefix.length > 5) {
      return { success: false, message: "Prefix is too long. Maximum 5 characters allowed." };
    }

    const currentPrefixes   =db.getUserPrefixes(userId);

    if (currentPrefixes.length >= USER_PREFIX_LIMIT) {
      return { success: false, message: `You can only have up to ${USER_PREFIX_LIMIT} personal prefixes.` };
    }

    if (currentPrefixes.includes(trimmedPrefix)) {
      return { success: false, message: `The prefix \`${trimmedPrefix}\` has already been added.` };
    }

    const newPrefixes   =[...currentPrefixes, trimmedPrefix];
    db.setUserPrefixes(userId, newPrefixes);

    return {
      success: true,
      message: `Successfully added new prefix: \`${trimmedPrefix}\``,
      prefixes: newPrefixes
    };
  }

  async _handleCommand(ctx, directPrefix   =null) {
    const userId   =ctx.user?.id || ctx.author?.id;
    const username   =ctx.user?.username || ctx.author?.username;
    const isInteraction   =!!ctx.user;

    if (directPrefix) {
      const result   =await this._addPrefix(userId, directPrefix);
      const container   =result.success
        ? this._createSuccessContainer(result.message)
        : this._createErrorContainer(result.message);

      return ctx.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: !result.success
      });
    }

    const message   =await ctx.reply({
      components: [this._buildUIManagementContainer(username, db.getUserPrefixes(userId))],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    });
    this._setupCollector(message, userId, username);
  }

  async execute({ message, args }) {
    await this._handleCommand(message, args[0]);
  }

  async slashExecute({ interaction }) {
    const addPrefix   =interaction.options.getString("add");
    await this._handleCommand(interaction, addPrefix);
  }

  _setupCollector(message, userId, username) {
    const collector   =message.createMessageComponentCollector({
      filter: (i)   => i.user.id   ===userId,
      time: 300_000
    });

    collector.on('collect', async (interaction)   => {
      let prefixes   =db.getUserPrefixes(userId);
      let actionMessage   =null;

      if (interaction.customId   ==='up_add') {
        const modal   =new ModalBuilder()
          .setCustomId('up_add_modal')
          .setTitle('Add a Personal Prefix')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('new_prefix_input')
                .setLabel("New Prefix (max 5 chars)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(5)
                .setPlaceholder("Enter your new prefix...")
            )
          );

        await interaction.showModal(modal);

        try {
          const modalSubmit   =await interaction.awaitModalSubmit({ time: 60000 });
          await modalSubmit.deferUpdate();

          const newPrefix   =modalSubmit.fields.getTextInputValue('new_prefix_input');
          const result   =await this._addPrefix(userId, newPrefix);

          if (result.success) {
            prefixes   =result.prefixes;
            actionMessage   =result.message;
          } else {
            actionMessage   =result.message;
          }

          await modalSubmit.editReply({
            components: [this._buildUIManagementContainer(username, prefixes, actionMessage)]
          });
        } catch (error) {
          return;
        }

      } else if (interaction.customId   ==='up_remove_all') {
        await interaction.deferUpdate();
        db.setUserPrefixes(userId, []);
        prefixes   =[];
        actionMessage   ="All of your custom prefixes have been removed.";

        await interaction.editReply({
          components: [this._buildUIManagementContainer(username, prefixes, actionMessage)]
        });

      } else if (interaction.isStringSelectMenu() && interaction.customId   ==='up_remove_select') {
        await interaction.deferUpdate();
        const valuesToRemove   =interaction.values;
        prefixes   =prefixes.filter(p   => !valuesToRemove.includes(p));
        db.setUserPrefixes(userId, prefixes);
        actionMessage   =`Removed: ${valuesToRemove.map(p   => `\`${ p}\``).join(', ') }`;

        await interaction.editReply({
          components: [this._buildUIManagementContainer(username, prefixes, actionMessage)]
        });
      }
    });

    collector.on('end', async ()   => {
      try {
        const fetched   =await message.fetch().catch(()   => null);
        if (fetched?.components.length > 0) {
          const expiredContainer   =new ContainerBuilder()
            .setAccentColor(0x747f8d)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent("### This interface has expired.\n*Run the command again to manage your prefixes.*")
            );
          await fetched.edit({ components: [expiredContainer] });
        }
      } catch (e) {
      }
    });
  }
}

export default new UserPrefixCommand();
