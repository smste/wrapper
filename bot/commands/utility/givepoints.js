// bot/commands/utility/givepoints.js (Updated for Status Credits)
const { SlashCommandBuilder, EmbedBuilder, InteractionResponseFlags, PermissionsBitField } = require('discord.js');
const ApiClient = require('../../../apiClient'); // Adjust path
const config = require('../../../config');    // Adjust path

const apiClient = new ApiClient(config.apiBaseUrl, config.apiKey);

// Helper function for staff check
function isStaff(interaction) {
    if (!config.staffRoleId) {
        console.error("STAFF_ROLE_ID is not configured!");
        return false;
    }
    return interaction.member?.roles?.cache?.has(config.staffRoleId);
}

// Helper function for staff error replies
async function replyStaffError(interaction, message) {
     const content = `❌ Error: ${message}`;
     try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: content, flags: InteractionResponseFlags.Ephemeral });
        } else {
             await interaction.reply({ content: content, flags: InteractionResponseFlags.Ephemeral });
        }
     } catch (e) { console.error("Failed to send staff error reply:", e); }
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('givepoints') // Keep name, but behaviour changes
        .setDescription('[Staff Only] Adds Status Credits (SC) to a user for tier progression.') // Updated description
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild) // Example permission
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to give Status Credits to.')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of Status Credits (SC) to ADD (must be positive).')
                .setRequired(true)
                .setMinValue(1)), // Enforce positive integer using minValue
    async execute(interaction) {
        // --- Permission Check ---
        if (!isStaff(interaction)) {
            // isStaff helper handles logging if needed
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount'); // Amount of SC to add
        const targetDiscordId = targetUser.id;
        const staffUser = interaction.user;

        // --- Validate Amount ---
        if (amount <= 0) {
            // Although setMinValue(1) helps, double-check here
             return replyStaffError(interaction, 'Amount must be a positive number of Status Credits.');
        }

        // Defer publicly for the success message
        await interaction.deferReply();

        try {
            // 1. Get target user's Roblox ID (needed for the addStatusCredits API call)
            let userData;
            try {
                // We don't strictly need the points here, just the robloxId
                userData = await apiClient.getUserByDiscordId(targetDiscordId);
            } catch (userError) {
                 if (userError.status === 404) {
                     await interaction.editReply({ content: `Error: Could not find user ${targetUser.toString()}. They need to link their account first.` }); // Public error is okay here
                     return;
                 }
                 throw userError; // Re-throw other API errors to be caught below
            }
            const robloxId = userData.robloxId;

            // 2. Call the API to add Status Credits and handle tier updates
            const reason = `Manual adjustment by Staff ${staffUser.tag} (${staffUser.id})`;
            // This API call returns the *updated* user object after credits/tier changes
            const updatedUserData = await apiClient.addStatusCredits(robloxId, amount, reason);

            // 3. Success! Edit the public deferred reply with details
            const embed = new EmbedBuilder()
                .setColor(0x00FF00) // Green for success
                .setTitle('Status Credits Added')
                .setDescription(`${staffUser.toString()} added **${amount}** Status Credits to ${targetUser.toString()}.`)
                .addFields(
                    { name: 'User', value: `${targetUser.toString()}`, inline: true },
                    { name: 'SC Added', value: `+${amount}`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }, // Blank field for layout
                    { name: 'New SC Balance', value: `**${updatedUserData.statusCredits?.toLocaleString() || 0}**`, inline: true },
                    { name: 'New Current Tier', value: `**${updatedUserData.currentTier || 'N/A'}**`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Reason: ${reason}` });

            await interaction.editReply({ embeds: [embed] }); // Public success message

        } catch (error) {
            console.error(`Error in /givepoints by ${staffUser.tag} for ${targetDiscordId}:`, error);
            // Use helper to send ephemeral error to staff
            await replyStaffError(interaction, `Failed to add Status Credits: ${error.message || 'An unknown error occurred.'}`);
        }
    },
};