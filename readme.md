
![Header](https://raw.githubusercontent.com/OpenUwU/.github/refs/heads/main/header.jpg)

# Yukihana

Yukihana is a versatile Discord music bot built with Discord.js, designed with advanced sharding capabilities and a modular command architecture. It offers high-quality music streaming and management within Discord servers alongside utility features.

## Technologies Used

*   [Discord.js](https://discord.js.org/)
*   [discord-hybrid-sharding](https://github.com/meister03/discord-hybrid-sharding)
*   [Lavalink](https://github.com/lavalink-devs/Lavalink)
*   [lavalink-client](https://github.com/Tomato6966/lavalink-client)
*   [Better-SQLite3](https://github.com/WiseSource/better-sqlite3)

## Key Features

*   **Music Playback:** Plays music from various sources including YouTube, Spotify, Apple Music, and SoundCloud.
*   **Queue Management:** Offers extensive queue management commands, such as shuffle, clear, remove, and move.
*   **Custom Playlists:** Users can create their own playlists and save songs in them to listen to later.
*   **Filters:** Includes a number of audio filters such as bassboost, nightcore, and vaporwave.
*   **Premium Features:** Offers premium features such as user-specific prefixes and enhanced queue limits.

## Setup Instructions

To get Yukihana up and running, follow these steps:

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/bre4d777/yukihana.git
    cd yukihana-discord-bot
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Configure environment variables:**
    *   Create a `.env` file in the project root.
    *   Copy the contents of `.env.example` into your `.env` file:
        ```bash
        cp .env.example .env
        ```
    *   Edit the `.env` file with your actual configuration:
        ```
        token=YOUR_BOT_TOKEN
        CLIENT_ID=YOUR_BOT_CLIENT_ID
        PREFIX=.
        OWNER_IDS=YOUR_USER_ID
        LAVALINK_HOST=localhost 
        LAVALINK_PORT=2333
        LAVALINK_PASSWORD=youshallnotpass
        ```
        *   `token`: Your Discord bot token.
        *   `CLIENT_ID`: Your Discord application client ID.
        *   `PREFIX`: The default command prefix.
        *   `OWNER_IDS`: A comma-separated list of user IDs that are bot owners.
        *   `LAVALINK_HOST`: The hostname or IP address of your Lavalink server.
        *   `LAVALINK_PORT`: The port your Lavalink server is running on.
        *   `LAVALINK_PASSWORD`: The password set for your Lavalink server.

4.  **Configure Lavalink:**
    *   A Lavalink server is **required** for Yukihana to play music.
    *   Download Lavalink 
    *   Configure `application.yml` with appropriate settings for your environment.
    *   Ensure Lavalink is running and accessible from your bot.

5.  **Start the bot:**

    ```bash
    npm start
    ```
    This command executes [shard.js](https://github.com/OpenUwU/Yukihana/blob/main/src/shard.js) to start the bot using Discord Hybrid Sharding.

    For development purposes and hot-reloading, use:

    ```bash
    npm run dev
    ```

## Important Notes

*   This project is under development, so expect potential bugs and instabilities. If you encounter any issues, please report them on the [The OpenUwU Project GitHub](https://github.com/bre4d777/yukihana).
*   Hosting a public instance is prohibited without prior permission.
*   Modification of credits is strictly forbidden.

## Credits

This project is maintained by [The OpenUwU Project](https://github.com/OpenUwU) and created by Bre4d777.
