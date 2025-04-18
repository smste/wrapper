// bot/commands/utility/givepoints.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const config = require('../../../config'); // Adjust path

module.exports = {
    data: new SlashCommandBuilder()
        .setName('givepoints')
        .setDescription('[Staff Only] Gives points to a user.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to give points to.')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('The amount of points to give (can be negative to remove).')
                .setRequired(true))
         // .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // Alternative/additional check
        ,
    async execute(interaction) {
         await interaction.deferReply({ ephemeral: false }); // Public reply

         // --- Permission Check ---
         if (!config.staffRoleId) {
              console.error("STAFF_ROLE_ID is not set in .env");
              return interaction.editReply({ content: 'Command configuration error: Staff role not defined.', ephemeral: true });
         }
         // Check if the user has the staff role
         if (!interaction.member.roles.cache.has(config.staffRoleId)) {
             return interaction.editReply({ content: 'You do not have permission to use this command.', ephemeral: true });
         }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const targetDiscordId = targetUser.id;

        try {
             // 1. Find user by Discord ID via API (needs the GET /users/discord/:discordId endpoint)
             let userResponse;
             try {
                 userResponse = await axios.get(`<span class="math-inline">\{config\.apiBaseUrl\}/users/discord/</span>{targetDiscordId}`, {
                     headers: { 'X-API-Key': config.apiKey }
                 });
             } catch (findError) {
                 if (findError.response?.status === 404) {
                     return interaction.editReply({ content: `User ${targetUser.username} not found or not linked. Cannot give points.` });
                 }
                 throw findError; // Re-throw other find errors
             }

             const userData = userResponse.data;
             const currentPoints = userData.points;
             const newPoints = currentPoints + amount; // Calculate new total

             // 2. Update points via API (needs PUT or PATCH /users/:robloxId/points or similar)
             // Using POST /users/:robloxId/points which SETS points
             await axios.post(`<span class="math-inline">\{config\.apiBaseUrl\}/users/</span>{userData.robloxId}/points`,
                 { points: newPoints }, // Send the *new total* points
                 { headers: { 'X-API-Key': config.apiKey } }
             );

             const embed = new EmbedBuilder()
                .setColor(0x00FF00) // Green for success
                .setTitle('Points Updated')
                .setDescription(`<span class="math-inline">\{interaction\.user\.username\} gave \*\*</span>{amount}** points to ${targetUser.username}.`)
                .addFields(
                    { name: 'User', value: `<span class="math-inline">\{targetUser\.toString\(\)\} \(</span>{targetUser.username})`, inline: true },
                    { name: 'Points Change', value: `<span class="math-inline">\{amount \> 0 ? '\+' \: ''\}</span>{amount}`, inline: true },
                    { name: 'New Balance', value: `${newPoints}`, inline: true }
                )
                .setTimestamp();

             await interaction.editReply({ embeds: [embed] });

        } catch (error) {
             console.error("Error giving points:", error.response?.data || error.message);
             let errorMessage = `Failed to give points to ${targetUser.username}. Please try again later.`;
             if (error.response?.data?.error) {
                 errorMessage = `Error: ${error.response.data.error}`;
             }
             await interaction.editReply({ content: errorMessage, ephemeral: true }); // Make error ephemeral
        }
    },
};