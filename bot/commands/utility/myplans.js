// bot/commands/utility/myplans.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ApiClient = require('../../../apiClient'); // Adjust path
const config = require('../../../config');    // Adjust path

const apiClient = new ApiClient(config.apiBaseUrl, config.apiKey);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('myplans')
        .setDescription('View your upcoming and active flight plans.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const discordId = interaction.user.id;

        try {
            // 1. Get user's Roblox ID
            let userData;
            try {
                userData = await apiClient.getUserByDiscordId(discordId);
            } catch (userError) {
                 if (userError.status === 404) {
                    await interaction.editReply({ content: 'Could not find an account linked to your Discord ID. Please link your account.' });
                    return;
                 }
                 throw userError; // Re-throw other errors
            }

            const robloxId = userData.robloxId;

            // 2. Get user's flight plans (requesting Planned and Active)
            // Adjust statuses if needed or fetch all and filter below
            const statusesToFetch = ['Planned', 'Active'];
            const plans = await apiClient.getUserPlans(robloxId, statusesToFetch);

            if (!plans || plans.length === 0) {
                await interaction.editReply({ content: "You don't have any planned or active flight plans right now." });
                return;
            }

            // 3. Format the plans into an Embed
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`${interaction.user.username}'s Flight Plans`)
                .setDescription(`Showing your **Planned** and **Active** flight plans (${plans.length} total).`)
                .setTimestamp();

            // Limit the number of plans shown directly in the embed for readability
            const maxPlansToShow = 5;
            for (let i = 0; i < Math.min(plans.length, maxPlansToShow); i++) {
                const plan = plans[i];
                const firstLeg = plan.legs[0];
                const lastLeg = plan.legs[plan.legs.length - 1];
                let planDetails = `Status: **${plan.status}**\n`;
                planDetails += `Ref: \`${plan.planReference}\`\n`;
                planDetails += `Route: ${firstLeg.departureIata} → ... → ${lastLeg.arrivalIata} (${plan.legs.length} leg${plan.legs.length > 1 ? 's' : ''})`;

                embed.addFields({
                    name: plan.planName || `Plan ${i + 1}`, // Use planName or generic title
                    value: planDetails,
                    inline: false,
                });
            }

            if (plans.length > maxPlansToShow) {
                 embed.setFooter({ text: `Showing ${maxPlansToShow} of ${plans.length} plans. More display features coming soon!` });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`Error fetching plans for ${discordId}:`, error);
            await interaction.editReply({ content: `Sorry, there was an error retrieving your flight plans. (${error.message || 'Unknown error'})` });
        }
    },
};