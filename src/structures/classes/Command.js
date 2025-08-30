export class Command {
	constructor(options = {}) {
		this.name = options.name;
		this.description = options.description || 'No description provided';
		this.usage = options.usage || this.name;
		this.aliases = options.aliases || [];
		this.category = options.category || 'Miscellaneous';
		this.cooldown = options.cooldown || 3;
		this.examples = options.examples || [];

		this.permissions = options.permissions || [];
		this.userPermissions = options.userPermissions || [];
		this.ownerOnly = options.ownerOnly || false;

		this.userPrem = options.userPrem || false;
		this.guildPrem = options.guildPrem || false;
		this.anyPrem = options.anyPrem || false;

		this.voiceRequired = options.voiceRequired || false;
		this.sameVoiceRequired = options.sameVoiceRequired || false;

		this.playerRequired = options.playerRequired || false;
		this.playingRequired = options.playingRequired || false;

		this.maintenance = options.maintenance || false;

		this.enabledSlash = options.enabledSlash || false;
		this.slashData = options.slashData || null;
	}

	async execute(context) {
		throw new Error(
			`Prefix command ${this.name} doesn't provide an execute method!`,
		);
	}

	async slashExecute(context) {
		throw new Error(
			`Slash command ${
				this.slashData?.name || this.name
			} doesn't provide a slashExecute method!`,
		);
	}

	async autocomplete(context) {}
}
