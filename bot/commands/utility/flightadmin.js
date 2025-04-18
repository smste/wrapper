// bot/commands/staff/flightadmin.js
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, InteractionResponseFlags } = require('discord.js');
const { formatInTimeZone } = require('date-fns-tz'); // For displaying dates nicely
const ApiClient = require('../../../apiClient'); // Adjust path
const config = require('../../../config');    // Adjust path

const apiClient = new ApiClient(config.apiBaseUrl, config.apiKey);

// Helper function for staff check
function isStaff(interaction) {
    if (!config.staffRoleId) {
        console.error("STAFF_ROLE_ID is not configured!");
        return false; // Cannot check without ID
    }
    return interaction.member?.roles?.cache?.has(config.staffRoleId);
}

// Helper function to create consistent error replies for staff
async function replyStaffError(interaction, message) {
     const content = `❌ Error: ${message}`;
     if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: content, flags: InteractionResponseFlags.Ephemeral });
     } else {
         await interaction.reply({ content: content, flags: InteractionResponseFlags.Ephemeral });
     }
}
 // Helper function to create consistent success replies for staff
async function replyStaffSuccess(interaction, message) {
    const content = `✅ Success: ${message}`;
     if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: content }); // Public success usually
     } else {
         await interaction.reply({ content: content }); // Public success usually
     }
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('flightadmin')
        .setDescription('[Staff] Manage flight data.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild) // Basic permission level
        // --- Subcommand Group: Flight ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a flight entirely.')
                .addStringOption(option => option.setName('flight_reference').setDescription('The unique reference ID of the flight to delete.').setRequired(true))
        )
        .addSubcommand(subcommand =>
             subcommand
                .setName('update')
                .setDescription('Update details of a flight (e.g., dispatcher).')
                .addStringOption(option => option.setName('flight_reference').setDescription('The unique reference ID of the flight to update.').setRequired(true))
                .addStringOption(option => option.setName('dispatcher').setDescription('Set a new dispatcher name.'))
                // Add other updatable fields like date/time/zone for date_of_event if needed
        )
        // --- Subcommand Group: Arrival ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('arrival_add')
                .setDescription('Add an arrival segment to an existing flight.')
                .addStringOption(option => option.setName('flight_reference').setDescription('The flight reference to add the arrival to.').setRequired(true))
                .addStringOption(option => option.setName('airport').setDescription('Name of the arrival airport.').setRequired(true))
                .addStringOption(option => option.setName('iata').setDescription('3-letter IATA code (e.g., SYD).').setRequired(true).setMinLength(3).setMaxLength(3))
                .addStringOption(option => option.setName('date').setDescription('Arrival Date (YYYY-MM-DD).').setRequired(true))
                .addStringOption(option => option.setName('time').setDescription('Arrival Time (HH:mm or HH:mm:ss).').setRequired(true))
                .addStringOption(option => option.setName('timezone').setDescription('Timezone (e.g., Australia/Sydney or +10:00)').setRequired(true))
                .addStringOption(option => option.setName('flight_code').setDescription('Specific flight code for this arrival segment.').setRequired(true))
                .addStringOption(option => option.setName('aircraft').setDescription('Aircraft type for this segment.').setRequired(true))
                .addBooleanOption(option => option.setName('upgrade_business').setDescription('Business upgrade available?').setRequired(true))
                .addBooleanOption(option => option.setName('upgrade_first').setDescription('First class upgrade available?').setRequired(true))
                .addBooleanOption(option => option.setName('upgrade_chairmans').setDescription('Chairmans upgrade available?').setRequired(true))
        )
         .addSubcommand(subcommand =>
            subcommand
                .setName('arrival_delete')
                .setDescription('Delete an arrival segment from a flight.')
                .addStringOption(option => option.setName('flight_reference').setDescription('The flight reference containing the arrival.').setRequired(true))
                .addStringOption(option => option.setName('iata').setDescription('IATA code of the arrival segment to delete.').setRequired(true).setMinLength(3).setMaxLength(3))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('arrival_update')
                .setDescription('Update details of an arrival segment.')
                .addStringOption(option => option.setName('flight_reference').setDescription('The flight reference containing the arrival.').setRequired(true))
                .addStringOption(option => option.setName('iata').setDescription('IATA code of the arrival segment to update.').setRequired(true).setMinLength(3).setMaxLength(3))
                // Add optional fields corresponding to arrivalBodyValidation
                .addStringOption(option => option.setName('airport').setDescription('New arrival airport name.'))
                .addStringOption(option => option.setName('date').setDescription('New Arrival Date (YYYY-MM-DD). Requires time & timezone.'))
                .addStringOption(option => option.setName('time').setDescription('New Arrival Time (HH:mm:ss). Requires date & timezone.'))
                .addStringOption(option => option.setName('timezone').setDescription('New Timezone (e.g., Australia/Sydney). Requires date & time.'))
                .addStringOption(option => option.setName('flight_code').setDescription('New flight code for this segment.'))
                .addStringOption(option => option.setName('aircraft').setDescription('New aircraft type.'))
                .addBooleanOption(option => option.setName('upgrade_business').setDescription('New business upgrade availability.'))
                .addBooleanOption(option => option.setName('upgrade_first').setDescription('New first class upgrade availability.'))
                .addBooleanOption(option => option.setName('upgrade_chairmans').setDescription('New chairmans upgrade availability.'))
        )
        // --- Subcommand Group: Player ---
        .addSubcommand(subcommand =>
             subcommand
                .setName('player_remove')
                .setDescription('Remove a player from a specific flight arrival leg.')
                .addStringOption(option => option.setName('flight_reference').setDescription('The flight reference.').setRequired(true))
                .addStringOption(option => option.setName('arrival_iata').setDescription('The IATA code of the arrival leg.').setRequired(true).setMinLength(3).setMaxLength(3))
                .addIntegerOption(option => option.setName('roblox_id').setDescription('The Roblox ID of the player to remove.').setRequired(true))
        )
        // Add player_add, player_preferences subcommands if desired (mirroring API)
    ,
    async execute(interaction) {
        // --- Staff Check ---
        if (!isStaff(interaction)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        // Defer publicly for success messages, errors will be edited to ephemeral
         await interaction.deferReply();

        try {
            const flightRef = interaction.options.getString('flight_reference');

            // --- Flight Subcommands ---
            if (subcommand === 'delete') {
                const result = await apiClient.deleteFlight(flightRef);
                await replyStaffSuccess(interaction, result.message || `Flight '${flightRef}' deleted.`);
            }
            else if (subcommand === 'update') {
                 const updateData = {};
                 const dispatcher = interaction.options.getString('dispatcher');
                 // Add other fields here
                 if (dispatcher !== null) updateData.dispatcher = dispatcher;
                 // ... add date/time/zone handling if those options are added ...

                 if (Object.keys(updateData).length === 0) {
                      return replyStaffError(interaction, 'You must provide at least one field to update (e.g., dispatcher).');
                 }
                 const result = await apiClient.updateFlight(flightRef, updateData);
                 await replyStaffSuccess(interaction, result.message || `Flight '${flightRef}' updated.`);
            }
            // --- Arrival Subcommands ---
            else if (subcommand === 'arrival_add') {
                const iata = interaction.options.getString('iata');
                // Collect all required fields for arrival
                const arrivalData = {
                    airport: interaction.options.getString('airport'),
                    iata: iata.toUpperCase(),
                    scheduledArrivalDate: interaction.options.getString('date'),
                    scheduledArrivalTimeStr: interaction.options.getString('time'),
                    scheduledArrivalTimezone: interaction.options.getString('timezone'),
                    flight_code: interaction.options.getString('flight_code'),
                    aircraft: interaction.options.getString('aircraft'),
                    upgrade_availability_business: interaction.options.getBoolean('upgrade_business'),
                    upgrade_availability_first: interaction.options.getBoolean('upgrade_first'),
                    upgrade_availability_chairmans: interaction.options.getBoolean('upgrade_chairmans'),
                };
                const result = await apiClient.createFlightArrival(flightRef, arrivalData);
                await replyStaffSuccess(interaction, result.message || `Arrival <span class="math-inline">\{iata\.toUpperCase\(\)\} added to flight '</span>{flightRef}'.`);
            }
             else if (subcommand === 'arrival_delete') {
                 const iata = interaction.options.getString('iata');
                 const result = await apiClient.deleteArrival(flightRef, iata);
                  await replyStaffSuccess(interaction, result.message || `Arrival <span class="math-inline">\{iata\.toUpperCase\(\)\} deleted from flight '</span>{flightRef}'.`);
             }
             else if (subcommand === 'arrival_update') {
                 const iata = interaction.options.getString('iata');
                 const updateData = {};
                 // Collect optional fields provided
                 const airport = interaction.options.getString('airport');
                 const date = interaction.options.getString('date');
                 const time = interaction.options.getString('time');
                 const timezone = interaction.options.getString('timezone');
                 const flight_code = interaction.options.getString('flight_code');
                 const aircraft = interaction.options.getString('aircraft');
                 const upgrade_business = interaction.options.getBoolean('upgrade_business');
                 const upgrade_first = interaction.options.getBoolean('upgrade_first');
                 const upgrade_chairmans = interaction.options.getBoolean('upgrade_chairmans');

                 if (airport !== null) updateData.airport = airport;
                 if (flight_code !== null) updateData.flight_code = flight_code;
                 if (aircraft !== null) updateData.aircraft = aircraft;
                  if (upgrade_business !== null) updateData.upgrade_availability_business = upgrade_business;
                  if (upgrade_first !== null) updateData.upgrade_availability_first = upgrade_first;
                  if (upgrade_chairmans !== null) updateData.upgrade_availability_chairmans = upgrade_chairmans;

                  // Handle time update - require all 3 if any is present
                  if (date || time || timezone) {
                      if (date && time && timezone) {
                          updateData.scheduledArrivalDate = date;
                          updateData.scheduledArrivalTimeStr = time;
                          updateData.scheduledArrivalTimezone = timezone;
                      } else {
                           return replyStaffError(interaction, 'To update arrival time, you must provide all three: date, time, and timezone.');
                      }
                  }

                  if (Object.keys(updateData).length === 0) {
                       return replyStaffError(interaction, 'You must provide at least one field to update for the arrival.');
                  }

                  const result = await apiClient.updateArrival(flightRef, iata, updateData);
                   await replyStaffSuccess(interaction, result.message || `Arrival <span class="math-inline">\{iata\.toUpperCase\(\)\} updated on flight '</span>{flightRef}'.`);
             }
            // --- Player Subcommands ---
            else if (subcommand === 'player_remove') {
                 const arrivalIata = interaction.options.getString('arrival_iata');
                 const robloxId = interaction.options.getInteger('roblox_id');
                 const result = await apiClient.removePlayerFromArrivalLeg(flightRef, arrivalIata, robloxId);
                 await replyStaffSuccess(interaction, result.message || `Player ${robloxId} removed from leg <span class="math-inline">\{arrivalIata\.toUpperCase\(\)\} on flight '</span>{flightRef}'.`);
            }
            // Add handlers for player_add, player_preferences here if needed

        } catch (error) {
             console.error(`Error executing /flightadmin ${subcommand} by ${interaction.user.tag}:`, error);
             // Use helper to send ephemeral error
             await replyStaffError(interaction, error.message || 'An unknown error occurred.');
        }
    },
};