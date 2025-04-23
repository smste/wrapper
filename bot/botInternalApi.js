// bot/botInternalApi.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

let discordClient = null;

// Function called by bot.js after client is ready
function setClient(client) {
    discordClient = client;
}

// Function called by authController to send the DM
async function triggerLoginApprovalDm(discordId, robloxUsername, loginRequestId) {
    if (!discordClient) {
        console.error('[Bot Internal] Discord client not set!');
        return false;
    }
    try {
        const user = await discordClient.users.fetch(discordId);
        if (!user) {
             console.error(`[Bot Internal] Could not fetch user ${discordId} to send login DM.`);
             return false;
        }

        const embed = new EmbedBuilder()
            .setColor(0xFFA500) // Orange
            .setTitle('Website Login Approval Request')
            .setDescription(`A login attempt was made for your linked Roblox account **${robloxUsername}** on the Qantas Virtual website.`)
            .addFields({ name: 'Approve Login?', value: 'Click "Approve" below to log in, or "Deny" if this wasn\'t you.' })
            .setFooter({ text: `Request ID: ${loginRequestId}` })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve-login_${loginRequestId}`) // Include ID in customId
                    .setLabel('Approve Login')
                    .setStyle(ButtonStyle.Success), // Green
                new ButtonBuilder()
                    .setCustomId(`deny-login_${loginRequestId}`) // Include ID in customId
                    .setLabel('Deny Login')
                    .setStyle(ButtonStyle.Danger) // Red
            );

        await user.send({ embeds: [embed], components: [row] });
        console.log(`[Bot Internal] Sent login approval DM to ${discordId} for request ${loginRequestId}`);
        return true;

    } catch (error) {
        console.error(`[Bot Internal] Failed to send login DM to ${discordId}:`, error);
        return false;
    }
}

module.exports = {
    setClient,
    triggerLoginApprovalDm,
};