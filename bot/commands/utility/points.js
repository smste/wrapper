// bot/commands/utility/points.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../../config'); // Adjust path

module.exports = {
    data: new SlashCommandBuilder()
        .setName('points')
        .setDescription('Checks your current points balance.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true }); // Defer reply, make it visible only to user

        const discordId = interaction.user.id;

        try {
            // 1. Find user by Discord ID in the User DB via API
            // We need an API endpoint for this. Let's assume we add:
            // GET /users/discord/:discordId
            const response = await axios.get(`<span class="math-inline">\{config\.apiBaseUrl\}/users/discord/</span>{discordId}`, {
                headers: { 'X-API-Key': config.apiKey }
            });

            const userData = response.data;

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`${interaction.user.username}'s Points`)
                .setDescription(`You currently have **${userData.points}** points.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Error fetching points:", error.response?.data || error.message);
            let errorMessage = 'Could not fetch your points. Please try again later.';
             if (error.response?.status === 404) {
                errorMessage = 'Could not find your account. Make sure your Discord is linked.';
                // TODO: Add instructions on how to link (e.g., "/link command")
             } else if (error.response?.data?.error) {
                errorMessage = `Error: ${error.response.data.error}`;
             }
             await interaction.editReply({ content: errorMessage });
        }
    },
};