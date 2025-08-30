import { config } from '#config/config';
import { logger } from '#utils/logger';

export class SpotifyManager {
	constructor() {
		this.baseUrl = 'https://api.spotify.com/v1';
		this.clientId = config.spotify.clientId;
		this.clientSecret = config.spotify.clientSecret;
		this.accessToken = null;
		this.tokenExpiry = 0;
	}

	async getAccessToken() {
		try {
			if (this.accessToken && Date.now() < this.tokenExpiry) {
				return this.accessToken;
			}

			if (!this.clientId || !this.clientSecret) {
				logger.error(
					'SpotifyManager',
					'Spotify credentials not configured',
				);
				return null;
			}

			const tokenEndpoint = 'https://accounts.spotify.com/api/token';
			const authString = Buffer.from(
				`${this.clientId}:${this.clientSecret}`,
			).toString('base64');

			const response = await fetch(tokenEndpoint, {
				method: 'POST',
				headers: {
					Authorization: `Basic ${authString}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: 'grant_type=client_credentials',
			});

			const data = await response.json();

			if (data.access_token) {
				this.accessToken = data.access_token;
				this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
				return this.accessToken;
			}

			logger.error('SpotifyManager', 'Failed to get access token');
			return null;
		} catch (error) {
			logger.error('SpotifyManager', 'Error getting access token', error);
			return null;
		}
	}

	async apiRequest(endpoint, method = 'GET') {
		try {
			const token = await this.getAccessToken();
			if (!token) return null;

			const response = await fetch(`${this.baseUrl}${endpoint}`, {
				method,
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				logger.error(
					'SpotifyManager',
					`API request failed: ${response.status} ${response.statusText}`,
				);
				return null;
			}

			return await response.json();
		} catch (error) {
			logger.error(
				'SpotifyManager',
				`API request error: ${endpoint}`,
				error,
			);
			return null;
		}
	}

	parseSpotifyUrl(url) {
		try {
			const patterns = {
				playlist: /spotify\.com\/playlist\/([\dA-Za-z]+)/,
				user: /spotify\.com\/user\/([\dA-Za-z]+)/,
				track: /spotify\.com\/track\/([\dA-Za-z]+)/,
				album: /spotify\.com\/album\/([\dA-Za-z]+)/,
			};

			for (const [type, pattern] of Object.entries(patterns)) {
				const match = url.match(pattern);
				if (match) {
					return { id: match[1], type };
				}
			}

			return null;
		} catch (error) {
			logger.error('SpotifyManager', 'Error parsing Spotify URL', error);
			return null;
		}
	}

	async fetchUserData(profileUrl) {
		try {
			const parsed = this.parseSpotifyUrl(profileUrl);
			if (!parsed || parsed.type !== 'user') return null;

			const data = await this.apiRequest(`/users/${parsed.id}`);
			if (!data) return null;

			return {
				id: data.id,
				displayName: data.display_name || data.id,
				url: data.external_urls?.spotify || profileUrl,
				images: data.images || [],
			};
		} catch (error) {
			logger.error('SpotifyManager', 'Error fetching user data', error);
			return null;
		}
	}

	async fetchUserPlaylists(profileUrl) {
		try {
			const parsed = this.parseSpotifyUrl(profileUrl);
			if (!parsed || parsed.type !== 'user') return null;

			const userData = await this.fetchUserData(profileUrl);
			if (!userData) return null;

			const data = await this.apiRequest(
				`/users/${parsed.id}/playlists?limit=50`,
			);
			if (!data?.items) return null;

			return data.items
				.filter(
					playlist => playlist.public && playlist.tracks?.total > 0,
				)
				.map(playlist => ({
					id: playlist.id,
					name: playlist.name,
					url: playlist.external_urls?.spotify,
					coverUrl: playlist.images?.[0]?.url,
					trackCount: playlist.tracks?.total || 0,
					owner: playlist.owner?.display_name || playlist.owner?.id,
				}));
		} catch (error) {
			logger.error(
				'SpotifyManager',
				'Error fetching user playlists',
				error,
			);
			return null;
		}
	}

	async fetchPlaylistTracks(playlistId, limit = 100) {
		try {
			const tracks = [];
			let offset = 0;
			const maxPerRequest = 50;

			while (tracks.length < limit) {
				const data = await this.apiRequest(
					`/playlists/${playlistId}/tracks?limit=${maxPerRequest}&offset=${offset}`,
				);

				if (!data?.items?.length) break;

				const processedTracks = data.items
					.filter(item => item.track && !item.track.is_local)
					.map(item => ({
						name: item.track.name,
						artist: item.track.artists
							.map(artist => artist.name)
							.join(', '),
						album: item.track.album?.name,
						duration: item.track.duration_ms,
						url: item.track.external_urls?.spotify,
						albumCoverUrl: item.track.album?.images?.[0]?.url,
						uri: item.track.uri,
					}));

				tracks.push(...processedTracks);
				offset += maxPerRequest;

				if (data.items.length < maxPerRequest) break;
			}

			return tracks.slice(0, limit);
		} catch (error) {
			logger.error(
				'SpotifyManager',
				'Error fetching playlist tracks',
				error,
			);
			return null;
		}
	}

	async searchArtists(query, limit = 6) {
		try {
			const data = await this.apiRequest(
				`/search?q=${encodeURIComponent(
					query,
				)}&type=artist&limit=${limit}`,
			);

			if (!data?.artists?.items) return [];

			return data.artists.items.map(artist => ({
				name: artist.name,
				url: artist.external_urls?.spotify || '',
				image: artist.images?.[0]?.url || '',
				followers: artist.followers?.total || 0,
				genres: artist.genres || [],
				popularity: artist.popularity || 0,
			}));
		} catch (error) {
			logger.error('SpotifyManager', 'Error searching artists', error);
			return [];
		}
	}

	async searchAlbums(query, limit = 6) {
		try {
			const data = await this.apiRequest(
				`/search?q=${encodeURIComponent(
					query,
				)}&type=album&limit=${limit}`,
			);

			if (!data?.albums?.items) return [];

			return data.albums.items.map(album => ({
				name: album.name,
				url: album.external_urls?.spotify || '',
				image: album.images?.[0]?.url || '',
				artists: album.artists || [],
				release_date: album.release_date || '',
				total_tracks: album.total_tracks || 0,
				album_type: album.album_type || '',
			}));
		} catch (error) {
			logger.error('SpotifyManager', 'Error searching albums', error);
			return [];
		}
	}

	async searchPlaylists(query, limit = 6) {
		try {
			const data = await this.apiRequest(
				`/search?q=${encodeURIComponent(
					query,
				)}&type=playlist&limit=${limit}`,
			);

			if (!data?.playlists?.items) return [];

			return data.playlists.items.map(playlist => ({
				name: playlist.name,
				url: playlist.external_urls?.spotify || '',
				image: playlist.images?.[0]?.url || '',
				owner: playlist.owner || {},
				description: playlist.description || '',
				total_tracks: playlist.tracks?.total || 0,
				public: playlist.public || false,
			}));
		} catch (error) {
			logger.error('SpotifyManager', 'Error searching playlists', error);
			return [];
		}
	}

	async searchTrack(client, query, requester) {
		try {
			if (!client?.music?.lavalink) {
				logger.error('SpotifyManager', 'Music client not available');
				return null;
			}

			const searchQuery = `${query}`;
			const result = await client.music.search(searchQuery, {
				source: 'spsearch',
				requester,
			});

			if (!result?.tracks?.length) {
				return null;
			}

			return result.tracks[0];
		} catch (error) {
			logger.error('SpotifyManager', 'Error searching for track', error);
			return null;
		}
	}
}

export const spotifyManager = new SpotifyManager();
