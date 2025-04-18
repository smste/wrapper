// bot/commands/utility/myprofile.js
const { SlashCommandBuilder, EmbedBuilder, InteractionResponseFlags } = require('discord.js');
const ApiClient = require('../../../apiClient'); // Adjust path if needed
const config = require('../../../config');    // Adjust path if needed

// Assume apiClient is instantiated correctly
const apiClient = new ApiClient(config.apiBaseUrl, config.apiKey);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('myprofile')
        .setDescription('View your linked profile details (Roblox ID, Points).'),
    async execute(interaction) {
        await interaction.deferReply({ flags: InteractionResponseFlags.Ephemeral });
        const discordId = interaction.user.id;
        const discordUsername = interaction.user.username;

        try {
            // 1. Try to get existing user data
            const existingUserData = await apiClient.getUserByDiscordId(discordId);

            // --- Profile Found ---
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`${discordUsername}'s Profile`)
                // ... (rest of embed fields as before) ...
                .addFields(
                     { name: 'Discord User', value: interaction.user.toString(), inline: true },
                     { name: 'Linked Roblox ID', value: `\`${existingUserData.robloxId}\``, inline: true },
                     { name: 'Points Balance', value: `**${existingUserData.points}**`, inline: true }
                 )
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            // Log the error for debugging
            console.error(`Initial profile fetch for ${discordId} failed:`, error);

            // --- Profile Not Found (404) ---
            if (error && error.status === 404) {
                // Instruct user how to link
                await interaction.editReply({
                    content: 'Your Discord account is not linked to a profile yet. Please use the `/link <roblox_username>` command to link your Roblox account.'
                });
            } else {
                // Handle other errors
                let userErrorMessage = `There was an error retrieving your profile: ${error.message || 'Unknown error.'}`;
                await interaction.editReply({ content: userErrorMessage });
            }
        }
    },
};