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

class ReggaeFilterCommand extends Command {
	constructor() {
		super({
			name: "reggae",
			description: "Apply reggae equalizer preset to the music",
			usage: "reggae",
			aliases: [],
			category: "music",
			examples: ["reggae"],
			cooldown: 2,
			voiceRequired: true,
			sameVoiceRequired: true,
			playerRequired: true,
			playingRequired: true,
			enabledSlash: true,
			slashData: {
				name: ["filter", "reggae"],
				description: "Apply reggae equalizer preset to the music",
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
      gain: 0
   },
   {
      band: 1,
      gain: 0
   },
   {
      band: 2,
      gain: 0
   },
   {
      band: 3,
      gain: -0.5
   },
   {
      band: 4,
      gain: -0.1
   },
   {
      band: 5,
      gain: 0.2
   },
   {
      band: 6,
      gain: 0.3
   },
   {
      band: 7,
      gain: 0
   },
   {
      band: 8,
      gain: 0
   },
   {
      band: 9,
      gain: 0
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

			return this._reply(context, this._createSuccessContainer("Reggae"));
		} catch (error) {
			return this._reply(
				context,
				this._createErrorContainer("Could not apply the reggae filter."),
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
			`└─ **${emoji.get("info")} Effect:** Enhanced for reggae music\n\n` +
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

export default new ReggaeFilterCommand();