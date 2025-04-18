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
        // Defer publicly
        await interaction.deferReply();

        const discordId = interaction.user.id;
        const discordUsername = interaction.user.username;

        try {
            // 1. Get user's Roblox ID
            let userData;
            try {
                userData = await apiClient.getUserByDiscordId(discordId);
            } catch (userError) {
                 if (userError.status === 404) {
                    // Make error public
                    await interaction.editReply({ content: 'Your Discord account is not linked yet. Please use `/link <roblox_username>` first.' });
                    return;
                 }
                 throw userError; // Re-throw other errors
            }
            const robloxId = userData.robloxId;

            // 2. Get user's 'Planned' and 'Active' flight plans
            // Assuming API supports filtering by multiple statuses passed in array
            const statusesToFetch = ['Planned', 'Active'];
            const plans = await apiClient.getUserPlans(robloxId, statusesToFetch);

            // 3. Build the response
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`${discordUsername}'s Flight Plans`)
                .setTimestamp();

            if (!plans || plans.length === 0) {
                embed.setDescription("You don't have any planned or active flight plans right now.");
            } else {
                embed.setDescription(`Showing your **Planned** and **Active** flight plans (${plans.length} total).`);
                // Limit the number of plans shown directly in the embed
                const maxPlansToShow = 5;
                for (let i = 0; i < Math.min(plans.length, maxPlansToShow); i++) {
                    const plan = plans[i];
                    // Ensure legs exist and have content before accessing elements
                    const firstLeg = plan.legs?.[0];
                    const lastLeg = plan.legs?.[plan.legs.length - 1];
                    let routeInfo = "N/A";
                    if (firstLeg && lastLeg) {
                         routeInfo = `${firstLeg.departureIata} → ... → ${lastLeg.arrivalIata} (${plan.legs.length} leg${plan.legs.length > 1 ? 's' : ''})`;
                    } else if (firstLeg) { // Handle case with only one leg
                         routeInfo = `${firstLeg.departureIata} → ${firstLeg.arrivalIata} (1 leg)`;
                    }


                    let planDetails = `Status: **${plan.status}**\n`;
                    planDetails += `Ref: \`${plan.planReference}\`\n`;
                    planDetails += `Route: ${routeInfo}`;

                    embed.addFields({
                        name: plan.planName || `Plan Reference: ${plan.planReference}`, // Use planName or Ref
                        value: planDetails,
                        inline: false,
                    });
                }

                if (plans.length > maxPlansToShow) {
                     embed.setFooter({ text: `Showing ${maxPlansToShow} of ${plans.length} plans.` });
                }
            }

            // Edit the public deferred reply
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`Error fetching plans for ${discordId}:`, error);
            // Send error publicly
            await interaction.editReply({ content: `Sorry, there was an error retrieving your flight plans: ${error.message || 'Unknown error'}` });
        }
    },
};