import {
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js";

import { config } from "#config/config";
import { Command } from "#structures/classes/Command";
import emoji from "#config/emoji";

class PopFilterCommand extends Command {
	constructor() {
		super({
			name: "pop",
			description: "Apply pop equalizer preset to the music",
			usage: "pop",
			aliases: [],
			category: "music",
			examples: ["pop"],
			cooldown: 2,
			voiceRequired: true,
			sameVoiceRequired: true,
			playerRequired: true,
			playingRequired: true,
			enabledSlash: true,
			slashData: {
				name: ["filter", "pop"],
				description: "Apply pop equalizer preset to the music",
			},
		});
	}

	async execute({ message, pm }) {
		return this._handleFilter(message, pm);
	}

	async slashExecute({ interaction, pm }) {
		return this._handleFilter(interaction, pm);
	}

	async _handleFilter(context, pm) {
		try {
			await pm.player.filterManager.setEQ([
   {
      band: 0,
      gain: -0.25
   },
   {
      band: 1,
      gain: 0.48
   },
   {
      band: 2,
      gain: 0.59
   },
   {
      band: 3,
      gain: 0.72
   },
   {
      band: 4,
      gain: 0.56
   },
   {
      band: 5,
      gain: 0.15
   },
   {
      band: 6,
      gain: -0.24
   },
   {
      band: 7,
      gain: -0.24
   },
   {
      band: 8,
      gain: -0.16
   },
   {
      band: 9,
      gain: -0.16
   },
   {
      band: 10,
      gain: 0
   },
   {
      band: 11,
      gain: 0
   },
   {
      band: 12,
      gain: 0
   },
   {
      band: 13,
      gain: 0
   }
]);

			return this._reply(context, this._createSuccessContainer("Pop"));
		} catch (error) {
			return this._reply(
				context,
				this._createErrorContainer("Could not apply the pop filter."),
			);
		}
	}

	_createSuccessContainer(filterName) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("music")} **Filter Applied**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Filter Information**\n\n` +
			`├─ **${emoji.get("music")} Filter:** ${filterName} Equalizer\n` +
			`├─ **${emoji.get("check")} Status:** Applied successfully\n` +
			`└─ **${emoji.get("info")} Effect:** Enhanced for pop music\n\n` +
			`*Filter has been applied to the current playback*`;

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(
						config.assets?.defaultThumbnail ||
							config.assets?.defaultTrackArtwork,
					),
				),
		);

		return container;
	}

	_createErrorContainer(message) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Error**`),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Something went wrong**\n\n` +
			`├─ **${emoji.get("info")} Issue:** ${message}\n` +
			`└─ **${emoji.get("reset")} Action:** Try again or contact support\n\n` +
			`*Please check your input and try again*`;

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(
						config.assets?.defaultThumbnail ||
							config.assets?.defaultTrackArtwork,
					),
				),
		);

		return container;
	}

	async _reply(context, container) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		};
		if (context.reply) {
			return context.reply(payload);
		}
		return context.channel.send(payload);
	}
}

export default new PopFilterCommand();