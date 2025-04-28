// bot/commands/utility/myprofile.js
const { SlashCommandBuilder, EmbedBuilder, InteractionResponseFlags } = require('discord.js');
const ApiClient = require('../../../apiClient'); // Adjust path if needed
const config = require('../../../config');    // Adjust path if needed

// Assume apiClient is instantiated correctly
const apiClient = new ApiClient(config.apiBaseUrl, config.apiKey);

// Helper function to create a simple text progress bar
function createProgressBar(percentage, length = 10) {
    // Ensure percentage is within 0-100
    const validPercentage = Math.max(0, Math.min(100, percentage));
    const filledBlocks = Math.round((validPercentage / 100) * length);
    const emptyBlocks = length - filledBlocks;
    // Using simple block characters - adjust emojis if you prefer
    return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks) + ` (${validPercentage}%)`;
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('myprofile')
        .setDescription('View your linked profile and tier status details.'), // Updated description
    async execute(interaction) {
        // Defer publicly (as requested previously)
        await interaction.deferReply();
        const discordId = interaction.user.id;
        const discordUsername = interaction.user.username;

        try {
            // 1. Try to get existing user data (now includes tier info + progress object)
            const userData = await apiClient.getUserByDiscordId(discordId);

            // --- Profile Found ---

            // Prepare derived data for display
            const progress = userData.progress || { progressPercent: 0, nextTier: 'N/A', requiredSC: 'N/A' }; // Default if progress missing
            const expiryDateFormatted = userData.temporaryTierExpiryDate
                 ? new Date(userData.temporaryTierExpiryDate).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Australia/Sydney' }) // Format Date for AEST/AEDT display
                 : 'N/A (Lifetime / Bronze)'; // Show N/A if null

            const progressBar = createProgressBar(progress.progressPercent);

            // Build the richer embed
            const embed = new EmbedBuilder()
                .setColor(0xE10000) // Qantas Red
                .setTitle(`${discordUsername}'s Qantas Virtual Profile`)
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    // Row 1: Basic Info
                    { name: 'Roblox ID', value: `\`${userData.robloxId}\``, inline: true },
                    { name: 'Redeemable Points', value: `🪙 **${userData.points?.toLocaleString() || 0}**`, inline: true },
                    { name: 'Status Credits (SC)', value: `✈️ **${userData.statusCredits?.toLocaleString() || 0}**`, inline: true },
                    // Row 2: Tier Info
                    { name: 'Current Tier', value: `${userData.currentTier || 'Bronze'}`, inline: true },
                    { name: 'Lifetime Tier', value: `${userData.lifetimeTier || 'Bronze'}`, inline: true },
                    { name: 'Temp. Tier Expiry', value: expiryDateFormatted, inline: true },
                    // Row 3: Progress Info
                    {
                         name: 'Progress to Next Status',
                         value: `${userData.statusCredits?.toLocaleString() || 0} / ${progress.requiredSC?.toLocaleString() || 'N/A'} SC towards **${progress.nextTier}**`,
                         inline: false // Takes full width
                    },
                    { name: 'Progress Bar', value: progressBar, inline: false } // Display the bar
                )
                .setTimestamp()
                .setFooter({ text: 'Qantas Virtual Loyalty Program' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            // Log the error for debugging
            console.error(`Profile fetch/display for ${discordId} failed:`, error);

            let userErrorMessage;
            // --- Profile Not Found (404) ---
            if (error && error.status === 404) {
                // Instruct user how to link
                 userErrorMessage = 'Your Discord account is not linked to a profile yet. Please use the `/link <roblox_username>` command to link your Roblox account.';

            } else {
                // Handle other errors
                 userErrorMessage = `There was an error retrieving your profile: ${error.message || 'Unknown error.'}`;
            }
             // This editReply will also be public because the defer was public
             await interaction.editReply({ content: userErrorMessage });
        }
    },
};