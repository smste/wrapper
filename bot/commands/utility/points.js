// bot/commands/utility/points.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ApiClient = require('../../../apiClient'); // Adjust path if needed
const config = require('../../../config');    // Adjust path if needed

// Instantiate API Client for this command
const apiClient = new ApiClient(config.apiBaseUrl, config.apiKey);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('points')
        .setDescription('Checks the points balance for yourself or another user.')
        .addUserOption(option => // Optional user argument
            option.setName('user')
                .setDescription('The user whose points you want to check (defaults to yourself).')
                .setRequired(false)),
    async execute(interaction) {
        // Defer publicly
        await interaction.deferReply();

        // Determine the target user
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetDiscordId = targetUser.id;

        try {
            // Get user data via API using Discord ID
            const userData = await apiClient.getUserByDiscordId(targetDiscordId);

            // Build success embed
            const embed = new EmbedBuilder()
                .setColor(0x0099FF) // Blue color
                .setTitle(`${targetUser.username}'s Points Balance`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setDescription(`User ${targetUser.toString()} currently has **${userData.points}** points.`)
                .addFields({ name: 'Linked Roblox ID', value: `\`${userData.robloxId}\``, inline: true })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`Error fetching points for ${targetDiscordId}:`, error);
            let userErrorMessage;

            if (error && error.status === 404) {
                userErrorMessage = `Could not find a profile linked to ${targetUser.toString()}. They may need to link their account using \`/link\`.`;
            } else if (error && error.message) {
                userErrorMessage = `Error fetching points: ${error.message}`;
            } else {
                userErrorMessage = 'An unexpected error occurred while fetching points.';
            }
            // Send error publicly
            await interaction.editReply({ content: userErrorMessage });
        }
    },
};