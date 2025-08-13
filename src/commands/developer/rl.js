import {
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SectionBuilder,
	ThumbnailBuilder,
	MessageFlags,
	SeparatorSpacingSize,
} from "discord.js";
import { config } from "#config/config";
import { Command } from "#structures/classes/Command";
import emoji from "#config/emoji";

class ReloadCommand extends Command {
	constructor() {
		super({
			name: "rl",
			description: "Reloads all commands for development purposes",
			aliases: ["reload"],
			category: "developer",
			ownerOnly: true,
		});
	}

	async execute({ client, message }) {
		const title = "Reloading All Commands";
		const result = await client.commandHandler.reloadAllCommands();

		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`### ${result.success ? emoji.get("check") : emoji.get("cross")} ${title}`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const statusText = result.success
			? "Operation Successful"
			: "Operation Failed";
		const detailText = result.message;

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`**${statusText}**`),
					new TextDisplayBuilder().setContent(detailText),
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
				),
		);

		if (!result.success && result.error) {
			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
			);

			container.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent("**Error Details**"),
						new TextDisplayBuilder().setContent(
							`\`\`\`\n${result.error.substring(0, 1000)}\n\`\`\``,
						),
					)
					.setThumbnailAccessory(
						new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
					),
			);
		}

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		await message.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		});
	}
}

export default new ReloadCommand();
