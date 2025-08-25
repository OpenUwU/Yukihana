import dotenv from 'dotenv';
dotenv.config();

export const config = {
  token:  process.env.token,
  clientId: "1031120600858624000",
  prefix: process.env.PREFIX || '.',
  ownerIds: (process.env.OWNER_IDS || '931059762173464597').split(', ').filter(Boolean),
  nodes: [
    {
      id: "main-node",
      host: process.env.lavahost,
      port: 7023,
      authorization: process.env.passlink,
      secure: false,
      retryAmount: 5,
      retryDelay: 3000,
    },
  ],
  environment: process.env.NODE_ENV || 'development',
  debug: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development',
  database: {
    guild: './database/data/guild.bread',
    user: './database/data/user.bread',
    premium: './database/data/premium.bread',
    antiabuse: './database/data/antiabuse.bread',
  },
  links: {
    supportServer: "https://google.com"
  },
  status: {
    text: process.env.STATUS_TEXT || '!help | Discord Bot',
    status: process.env.STATUS_TYPE || 'dnd',
    type: 'CUSTOM'
  },
  colors: {
    info: '#3498db',
    success: '#2ecc71',
    warning: '#f39c12',
    error: '#e74c3c'
  },
  
  webhook: {
    enabled: process.env.WEBHOOK_ENABLED !== 'false',
    url: process.env.WEBHOOK_URL || null,
    username: process.env.WEBHOOK_USERNAME || 'Bot Logger',
    avatarUrl: process.env.WEBHOOK_AVATAR_URL || null,
    levels: {
      info: {
        enabled: process.env.WEBHOOK_INFO_ENABLED !== 'false'
      },
      success: {
        enabled: process.env.WEBHOOK_SUCCESS_ENABLED !== 'false'
      },
      warning: {
        enabled: process.env.WEBHOOK_WARNING_ENABLED !== 'false'
      },
      error: {
        enabled: process.env.WEBHOOK_ERROR_ENABLED !== 'false'
      },
      debug: {
        enabled: process.env.WEBHOOK_DEBUG_ENABLED === 'true'
      }
    }
  },
  features: {
    stay247: true
  },
  queue: {
    maxSongs: {
      free: 50,
      premium: 200
    }
  },
  assets: {
    defaultTrackArtwork: 'https://github.com/bre4d777/Yukihana/blob/main/images.jpeg?raw=true',
    defaultThumbnail: 'https://github.com/bre4d777/Yukihana/blob/main/images.jpeg?raw=true',
    helpThumbnail: 'https://github.com/bre4d777/Yukihana/blob/main/images.jpeg?raw=true'
  },
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || "321c535c35b4423a945c9a6df5c5be06",
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "1bc3fee6cfd743be843ef29047bfe46d"
  },
  search: {
    maxResults: 6,
    defaultSources: ['ytsearch', 'spsearch', 'amsearch', 'scsearch']
  },
  player: {
    defaultVolume: 100,
    seekStep: 10000,
    maxHistorySize: 50,
    stay247: {
      reconnectDelay: 5000,
      maxReconnectAttempts: 3,
      checkInterval: 30000
    }
  },
  watermark: 'coded by bre4d',
  version: '2.0.0'
};