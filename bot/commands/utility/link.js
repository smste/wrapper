// bot/commands/utility/link.js
const { SlashCommandBuilder, EmbedBuilder, InteractionResponseFlags } = require('discord.js');
const axios = require('axios');
const crypto = require('crypto'); // For generating random code
const ApiClient = require('../../../apiClient'); // Adjust path
const config = require('../../../config');    // Adjust path
const Verification = require('../../../models/Verification'); // Adjust path

const apiClient = new ApiClient(config.apiBaseUrl, config.apiKey);
const ROBLOX_USER_API = 'https://users.roblox.com/v1/usernames/users';
const VERIFICATION_EXPIRY_MINUTES = 5; // How long the code is valid
const ROBLOX_GAME_LINK = process.env.ROBLOX_GAME_LINK || "YOUR_GAME_LINK_HERE"; // Add ROBLOX_GAME_LINK to .env!

// Helper to generate a random code
function generateVerificationCode(length = 6) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length).toUpperCase();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your Roblox account to your Discord account.')
        .addStringOption(option =>
            option.setName('roblox_username')
                .setDescription('Your exact Roblox username.')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ flags: InteractionResponseFlags.Ephemeral });

        const discordId = interaction.user.id;
        const requestedUsername = interaction.options.getString('roblox_username');

        try {
            // --- Pre-checks ---
            // 1. Check if Discord user is already linked
            try {
                const existingUser = await apiClient.getUserByDiscordId(discordId);
                await interaction.editReply(`Your Discord account is already linked to Roblox ID \`${existingUser.robloxId}\`. Use \`/unlink\` first if you want to link a different account.`);
                return;
            } catch (error) {
                if (error.status !== 404) { // Ignore 404 (not linked), throw other errors
                    throw error;
                }
                // User is not linked, proceed.
            }

            // 2. Get Roblox ID from username via Roblox API
            let robloxIdFound = null;
            let robloxUsernameFound = null;
            try {
                const robloxApiResponse = await axios.post(ROBLOX_USER_API, {
                    usernames: [requestedUsername],
                    excludeBannedUsers: true
                });
                if (robloxApiResponse.data?.data?.length > 0) {
                    robloxIdFound = robloxApiResponse.data.data[0].id;
                    robloxUsernameFound = robloxApiResponse.data.data[0].name; // Get the exact name
                } else {
                    await interaction.editReply(`Could not find an active Roblox user named \`${requestedUsername}\`. Please check the spelling and try again.`);
                    return;
                }
            } catch (robloxApiError) {
                console.error(`Roblox API lookup error for ${requestedUsername}:`, robloxApiError.response?.data || robloxApiError.message);
                await interaction.editReply('There was an error looking up the Roblox username. Please try again later.');
                return;
            }

            // 3. Check if the found Roblox ID is already linked to *another* Discord user
            try {
                const existingRobloxLink = await apiClient.getUser(robloxIdFound); // Check by Roblox ID
                 // If getUser succeeds, it means this Roblox ID is linked, but is it to *this* discord user?
                 if (existingRobloxLink.discordId && existingRobloxLink.discordId !== discordId) {
                     await interaction.editReply(`The Roblox account \`${robloxUsernameFound}\` (ID: ${robloxIdFound}) is already linked to a different Discord user. Please ask them to unlink first.`);
                     return;
                 } else if (existingRobloxLink.discordId === discordId) {
                     // Should have been caught by the first check, but handle defensively
                      await interaction.editReply(`You are already linked to Roblox account \`${robloxUsernameFound}\` (ID: ${robloxIdFound}).`);
                     return;
                 }
                 // If getUser succeeds but discordId is not set or matches, it's okay to proceed with verification
                 // (although linking should ideally happen atomically later)

            } catch (error) {
                 if (error.status !== 404) { // Ignore 404 (Roblox ID not found in our DB yet), throw others
                     throw error;
                 }
                 // Roblox ID not found in our DB, safe to proceed.
            }

            // --- Generate and Store Verification ---
            const verificationCode = generateVerificationCode();
            const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000);

            // Remove any previous pending codes for this Discord user
            await Verification.deleteMany({ discordId: discordId, status: 'pending' });

            // Create new verification record
            await Verification.create({
                code: verificationCode,
                discordId: discordId,
                robloxId: robloxIdFound,
                robloxUsername: robloxUsernameFound,
                status: 'pending',
                expiresAt: expiresAt,
            });

            // --- Instruct User ---
            const embed = new EmbedBuilder()
                .setColor(0xFFFF00) // Yellow for pending action
                .setTitle('Verify Your Roblox Account')
                .setDescription(`Okay, I found the Roblox account \`${robloxUsernameFound}\` (ID: ${robloxIdFound}).\n\nTo complete the linking process:`)
                .addFields(
                    { name: '1. Join the Verification Game', value: `[Click Here to Join](${ROBLOX_GAME_LINK}) (or search for it)` },
                    { name: '2. Enter Your Code', value: `When prompted in-game, enter this code:\n# \`${verificationCode}\`` }
                )
                .setFooter({ text: `This code expires in ${VERIFICATION_EXPIRY_MINUTES} minutes.` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`Error during /link for ${discordId} requesting ${requestedUsername}:`, error);
            await interaction.editReply({ content: `An unexpected error occurred during the linking process: ${error.message || 'Please try again.'}` });
        }
    },
};