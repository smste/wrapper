// bot/commands/utility/givepoints.js
const { SlashCommandBuilder, EmbedBuilder, InteractionResponseFlags, PermissionsBitField } = require('discord.js');
const ApiClient = require('../../../apiClient'); // Adjust path
const config = require('../../../config');    // Adjust path

const apiClient = new ApiClient(config.apiBaseUrl, config.apiKey);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('givepoints')
        .setDescription('[Staff Only] Gives points to a user (use negative amount to remove).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild) // Example permission check
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to give points to.')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of points to give/remove (e.g., 100 or -50).')
                .setRequired(true)),
    async execute(interaction) {
        // Permission Check (Using role ID from config)
        if (!config.staffRoleId) {
             console.error("STAFF_ROLE_ID is not set in .env");
             return interaction.reply({ content: 'Command configuration error: Staff role not defined.', ephemeral: true });
        }
        if (!interaction.member.roles.cache.has(config.staffRoleId)) {
            // You can optionally use setDefaultMemberPermissions above as well/instead
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const targetDiscordId = targetUser.id;
        const staffUser = interaction.user;

        // Defer publicly for the potential success message
        await interaction.deferReply();

        try {
            // 1. Get target user's current data (need robloxId and current points)
            let userData;
            try {
                userData = await apiClient.getUserByDiscordId(targetDiscordId);
            } catch (userError) {
                 if (userError.status === 404) {
                     await interaction.editReply({ content: `Error: Could not find user ${targetUser.toString()}. They need to link their account first.`, flags: InteractionResponseFlags.Ephemeral }); // Ephemeral error
                     return;
                 }
                 throw userError; // Re-throw other API errors
            }

            // 2. Calculate new points total
            const currentPoints = userData.points;
            const newPoints = currentPoints + amount;
            const robloxId = userData.robloxId;

             if (newPoints < 0) {
                  await interaction.editReply({ content: `Error: Cannot set points below zero. User ${targetUser.toString()} has ${currentPoints} points, removing ${Math.abs(amount)} would result in ${newPoints}.`, flags: InteractionResponseFlags.Ephemeral }); // Ephemeral error
                  return;
             }

            // 3. Update points via API (using setUserPoints which *sets* the total)
            await apiClient.setUserPoints(robloxId, newPoints);

            // 4. Success! Edit the public deferred reply
            const embed = new EmbedBuilder()
                .setColor(0x00FF00) // Green for success
                .setTitle('Points Awarded/Removed')
                .setDescription(`${staffUser.toString()} ${amount >= 0 ? 'gave' : 'removed'} **${Math.abs(amount)}** point${Math.abs(amount) !== 1 ? 's' : ''} ${amount >= 0 ? 'to' : 'from'} ${targetUser.toString()}.`)
                .addFields(
                    { name: 'User', value: `${targetUser.toString()}`, inline: true },
                    { name: 'Points Change', value: `${amount > 0 ? '+' : ''}${amount}`, inline: true },
                    { name: 'New Balance', value: `**${newPoints}**`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] }); // Public success message

        } catch (error) {
            console.error(`Error in /givepoints by ${staffUser.id} for ${targetDiscordId}:`, error);
            // Send specific error message ephemerally
            await interaction.editReply({
                content: `Failed to give points: ${error.message || 'An unknown error occurred.'}`,
                flags: InteractionResponseFlags.Ephemeral // Error only visible to staff
            });
        }
    },
};