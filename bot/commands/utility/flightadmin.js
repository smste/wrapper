// bot/commands/staff/flightadmin.js
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, InteractionResponseFlags } = require('discord.js');
const { formatInTimeZone } = require('date-fns-tz'); // For displaying dates nicely if needed
const ApiClient = require('../../../apiClient'); // Adjust path
const config = require('../../../config');    // Adjust path

const apiClient = new ApiClient(config.apiBaseUrl, config.apiKey);

// Helper function for staff check
function isStaff(interaction) {
    if (!config.staffRoleId) {
        console.error("STAFF_ROLE_ID is not configured!");
        return false;
    }
    // Check if member exists and has the role cache property before accessing it
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
     } catch (e) {
         console.error("Failed to send staff error reply:", e);
     }
}
 // Helper function for public success replies
async function replyStaffSuccess(interaction, message) {
    const content = `✅ Success: ${message}`;
     try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: content });
        } else {
             await interaction.reply({ content: content });
        }
     } catch (e) {
          console.error("Failed to send staff success reply:", e);
     }
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('flightadmin')
        .setDescription('[Staff] Manage flight data.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild) // Basic permission level

        // --- Subcommand: Create Flight ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new base flight record (add arrivals separately).')
                .addStringOption(option => option.setName('flight_reference').setDescription('The unique reference ID for the new flight (e.g., QFA123).').setRequired(true))
                .addStringOption(option => option.setName('dep_airport').setDescription('Full name of the departure airport.').setRequired(true))
                .addStringOption(option => option.setName('dep_iata').setDescription('3-letter IATA code for departure (e.g., SYD).').setRequired(true).setMinLength(3).setMaxLength(3))
                .addStringOption(option => option.setName('dep_time').setDescription('Scheduled departure time (HH:mm format, 24-hour).').setRequired(true))
                .addStringOption(option => option.setName('dispatcher').setDescription('Name/ID of the dispatcher.').setRequired(true))
                .addStringOption(option => option.setName('event_date').setDescription('Date of the flight event (YYYY-MM-DD).').setRequired(true))
                .addStringOption(option => option.setName('event_time').setDescription('Time relevant to the event (HH:mm format, 24-hour).').setRequired(true))
        ) // End create subcommand

        // --- Subcommand Group: Flight (Update/Delete) ---
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
                // Add other updatable fields like event_date/event_time if needed (handle timezones!)
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
        // Add player_add, player_preferences subcommands later if needed
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
            const flightRef = interaction.options.getString('flight_reference'); // Common option

            // --- Flight Create Subcommand ---
            if (subcommand === 'create') {
                 // Validate time format (basic check, more robust could be added)
                 const depTime = interaction.options.getString('dep_time');
                 const eventTime = interaction.options.getString('event_time');
                 const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
                 if (!timeRegex.test(depTime) || !timeRegex.test(eventTime)) {
                      return replyStaffError(interaction, 'Departure time and Event time must be in HH:mm format (e.g., 09:30, 14:00).');
                 }
                 // Validate date format (basic check)
                 const eventDate = interaction.options.getString('event_date');
                 const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                  if (!dateRegex.test(eventDate)) {
                       return replyStaffError(interaction, 'Event date must be in YYYY-MM-DD format (e.g., 2025-12-31).');
                  }
                 // Validate IATA format
                 const depIata = interaction.options.getString('dep_iata');
                 const iataRegex = /^[A-Za-z]{3}$/;
                  if (!iataRegex.test(depIata)) {
                       return replyStaffError(interaction, 'Departure IATA must be 3 letters.');
                  }

                 const departureData = {
                     airport: interaction.options.getString('dep_airport'),
                     iata: depIata.toUpperCase(),
                     time_format: depTime
                 };
                 const eventData = {
                     date: eventDate,
                     time: eventTime
                 };
                 const dispatcher = interaction.options.getString('dispatcher');

                 // Call API client - Note: passing null for arrivals, as we add them separately
                 const result = await apiClient.createFlight(flightRef, departureData, dispatcher, eventData, null);
                 await replyStaffSuccess(interaction, `Flight '${result.flight.flight_reference}' created successfully. Add arrival legs using \`/flightadmin arrival_add\`.`);

            }
            // --- Flight Delete Subcommand ---
            else if (subcommand === 'delete') {
                const result = await apiClient.deleteFlight(flightRef);
                await replyStaffSuccess(interaction, result.message || `Flight '${flightRef}' deleted.`);
            }
            // --- Flight Update Subcommand ---
            else if (subcommand === 'update') {
                 const updateData = {};
                 const dispatcher = interaction.options.getString('dispatcher');
                 if (dispatcher !== null) updateData.dispatcher = dispatcher;
                 // Add other updatable fields here...

                 if (Object.keys(updateData).length === 0) {
                      return replyStaffError(interaction, 'You must provide at least one field to update (e.g., dispatcher).');
                 }
                 const result = await apiClient.updateFlight(flightRef, updateData);
                 await replyStaffSuccess(interaction, result.message || `Flight '${flightRef}' updated.`);
            }
            // --- Arrival Add Subcommand ---
            else if (subcommand === 'arrival_add') {
                const iata = interaction.options.getString('iata');
                // Basic time/date/iata format checks (more robust validation on API side)
                 const dateStr = interaction.options.getString('date');
                 const timeStr = interaction.options.getString('time');
                 const tzStr = interaction.options.getString('timezone');
                 const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                 const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
                 const iataRegex = /^[A-Za-z]{3}$/;
                 if (!dateRegex.test(dateStr) || !timeRegex.test(timeStr) || !iataRegex.test(iata) || !tzStr) {
                       return replyStaffError(interaction, 'Invalid format for IATA (3 letters), Date (YYYY-MM-DD), Time (HH:mm[:ss]), or Timezone.');
                 }
                // Collect all required fields for arrival
                const arrivalData = {
                    airport: interaction.options.getString('airport'),
                    iata: iata.toUpperCase(),
                    scheduledArrivalDate: dateStr,
                    scheduledArrivalTimeStr: timeStr,
                    scheduledArrivalTimezone: tzStr,
                    flight_code: interaction.options.getString('flight_code'),
                    aircraft: interaction.options.getString('aircraft'),
                    upgrade_availability_business: interaction.options.getBoolean('upgrade_business'),
                    upgrade_availability_first: interaction.options.getBoolean('upgrade_first'),
                    upgrade_availability_chairmans: interaction.options.getBoolean('upgrade_chairmans'),
                };
                const result = await apiClient.createFlightArrival(flightRef, arrivalData);
                 // Access the returned arrival's data if needed
                const addedArrival = result.arrival;
                 await replyStaffSuccess(interaction, `Arrival ${addedArrival?.iata || iata.toUpperCase()} added to flight '${flightRef}'.`);
            }
            // --- Arrival Delete Subcommand ---
             else if (subcommand === 'arrival_delete') {
                 const iata = interaction.options.getString('iata');
                 const result = await apiClient.deleteArrival(flightRef, iata);
                  await replyStaffSuccess(interaction, result.message || `Arrival ${iata.toUpperCase()} deleted from flight '${flightRef}'.`);
             }
             // --- Arrival Update Subcommand ---
             else if (subcommand === 'arrival_update') {
                 const iata = interaction.options.getString('iata');
                 const updateData = {};
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

                  // Handle time update - require all 3 if any is present for simplicity
                  if (date || time || timezone) {
                      if (date && time && timezone) {
                          // Basic format validation
                           const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                           const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
                            if (!dateRegex.test(date) || !timeRegex.test(time)) {
                                 return replyStaffError(interaction, 'Invalid format for Date (YYYY-MM-DD) or Time (HH:mm[:ss]).');
                           }
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
                   await replyStaffSuccess(interaction, result.message || `Arrival ${iata.toUpperCase()} updated on flight '${flightRef}'.`);
             }
            // --- Player Remove Subcommand ---
            else if (subcommand === 'player_remove') {
                 const arrivalIata = interaction.options.getString('arrival_iata');
                 const robloxId = interaction.options.getInteger('roblox_id');
                 const result = await apiClient.removePlayerFromArrivalLeg(flightRef, arrivalIata, robloxId);
                 await replyStaffSuccess(interaction, result.message || `Player ${robloxId} removed from leg ${arrivalIata.toUpperCase()} on flight '${flightRef}'.`);
            }
            // --- Add Handlers for other subcommands (player_add, player_preferences) here ---
            else {
                await replyStaffError(interaction, `Subcommand '${subcommand}' not implemented yet.`);
            }

        } catch (error) {
             console.error(`Error executing /flightadmin ${subcommand} by ${interaction.user.tag}:`, error);
             // Use helper to send ephemeral error
             await replyStaffError(interaction, error.message || 'An unknown error occurred executing the command.');
        }
    },
};