// scheduler.js
const schedule = require('node-schedule');
const Flight = require('./models/Flight'); // Adjust path if needed
const User = require('./models/User');   // Adjust path if needed
const { formatDistanceToNowStrict, format } = require('date-fns'); // For formatting time differences

// --- Configuration ---
const CHECK_INTERVAL_MINUTES = 1; // How often the check runs
const NOTIFICATION_WINDOWS = {
    // Key: Identifier used in DB, Value: milliseconds before arrival
    '1d': 24 * 60 * 60 * 1000,
    '5h': 5 * 60 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    'now': 5 * 60 * 1000, // Notify ~5 mins before
};
const NOTIFICATION_KEYS = Object.keys(NOTIFICATION_WINDOWS); // ['1d', '5h', '30m', 'now']

let discordClient = null; // Discord client instance will be passed in

async function checkAttendanceTimeouts() {
    const timeoutThreshold = new Date(Date.now() - HEARTBEAT_TIMEOUT_MINUTES * 60 * 1000);
    console.log(`[Scheduler] Checking for attendance records not seen since ${timeoutThreshold.toISOString()}`);

    try {
        const result = await AttendanceRecord.updateMany(
            {
                status: 'active',
                lastSeen: { $lt: timeoutThreshold } // Find active records last seen before the threshold
            },
            {
                $set: { status: 'abandoned' } // Or 'incomplete'
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`[Scheduler] Marked ${result.modifiedCount} attendance records as abandoned due to timeout.`);
        } else {
            // console.log(`[Scheduler] No attendance records timed out.`); // Can be noisy
        }
    } catch (error) {
        console.error("[Scheduler] Error checking attendance timeouts:", error);
    }
}

// --- Helper Function to Send DM ---
async function sendDm(discordId, message) {
    if (!discordClient) {
        console.error('[Scheduler] Discord client not initialized.');
        return false;
    }
    try {
        const user = await discordClient.users.fetch(discordId);
        if (user) {
            await user.send(message);
            console.log(`[Scheduler] Sent notification to Discord ID ${discordId}`);
            return true;
        } else {
            console.warn(`[Scheduler] Could not fetch Discord user ${discordId}`);
            return false;
        }
    } catch (error) {
        // Common errors: User not found, bot blocked, DMs disabled
        if (error.code === 50007 || error.code === 10013) { // Cannot send messages to this user OR User not found
            console.warn(`[Scheduler] Cannot send DM to Discord ID ${discordId}. Maybe blocked or DMs disabled?`);
        } else {
            console.error(`[Scheduler] Error sending DM to ${discordId}:`, error);
        }
        return false;
    }
}

// --- The Main Check Function ---
async function checkAndSendNotifications() {
    const now = new Date(); // Current time in UTC
    console.log(`[Scheduler] Running check at ${now.toISOString()}`);

    try {
        // Iterate through each notification window
        for (const key of NOTIFICATION_KEYS) {
            const notifyTimeMillis = NOTIFICATION_WINDOWS[key];
            const targetTimeStart = new Date(now.getTime() + notifyTimeMillis - (CHECK_INTERVAL_MINUTES * 60 * 1000)); // Check within interval window
            const targetTimeEnd = new Date(now.getTime() + notifyTimeMillis);

            // Find flights with arrival legs within the current notification window
            // $elemMatch finds documents where at least one element in an array matches criteria
            const flightsToNotify = await Flight.find({
                'arrivals': {
                    $elemMatch: {
                        'scheduledArrivalTime': { $gte: targetTimeStart, $lte: targetTimeEnd },
                        'players': {
                            $elemMatch: {
                                // Player exists AND notification for this key hasn't been sent
                                [`notificationsSent.${key}`]: { $ne: true }
                            }
                        }
                    }
                }
            })
            // Only select relevant fields to reduce data transfer
            .select('flight_reference arrivals.$') // '$' projection gets only the matching arrival(s)
            .lean(); // Use lean for read-only optimization

            if (!flightsToNotify || flightsToNotify.length === 0) {
                // console.log(`[Scheduler] No flights found for ${key} window.`);
                continue; // No flights match this window
            }

            console.log(`[Scheduler] Found ${flightsToNotify.length} flight(s) potentially needing '${key}' notifications.`);

            // Process each flight and its matching arrival legs
            for (const flight of flightsToNotify) {
                // Should only contain matching arrivals due to '$' projection
                for (const arrival of flight.arrivals) {

                    // Find players within this arrival leg who need this specific notification
                    const playersToNotify = arrival.players.filter(
                        p => !(p.notificationsSent?.get(key)) // Check if map key is not true
                    );

                    if (playersToNotify.length === 0) continue;

                    // Get Roblox IDs
                    const robloxIds = playersToNotify.map(p => p.robloxId);

                    // Find corresponding Discord IDs
                    const users = await User.find({ 'robloxId': { $in: robloxIds } }).select('robloxId discordId').lean();
                    const discordIdMap = new Map(users.map(u => [u.robloxId, u.discordId]));

                    // Prepare notification message
                    const timeUntil = formatDistanceToNowStrict(arrival.scheduledArrivalTime);
                    // Format arrival time for message (e.g., AEST)
                    const arrivalTimeFormatted = format(arrival.scheduledArrivalTime, 'dd/MM/yy HH:mm:ss', { timeZone: 'Australia/Sydney' }); // Adjust format/timezone as needed

                    let message;
                    if (key === 'now') {
                         message = `✈️ Your flight segment **${arrival.flight_code}** to **${arrival.iata}** (${arrival.airport}) is scheduled to arrive now (${arrivalTimeFormatted} AEST).`;
                    } else {
                         message = `✈️ Reminder: Your flight segment **${arrival.flight_code}** to **${arrival.iata}** (${arrival.airport}) is scheduled to arrive in approximately **${timeUntil}** (at ${arrivalTimeFormatted} AEST).`;
                    }


                    // Send DMs and prepare DB updates
                    const updateOps = []; // Bulk update operations
                    for (const player of playersToNotify) {
                        const discordId = discordIdMap.get(player.robloxId);
                        if (discordId) {
                            const dmSent = await sendDm(discordId, message);
                            if (dmSent) {
                                // Prepare update to mark notification as sent for this player on this leg
                                updateOps.push({
                                    updateOne: {
                                        filter: {
                                            '_id': flight._id, // Target specific flight
                                            'arrivals._id': arrival._id // Target specific arrival leg
                                        },
                                        update: {
                                            // Use arrayFilters to target the specific player within the nested array
                                            $set: { [`arrivals.$[arrElem].players.$[playerElem].notificationsSent.${key}`]: true }
                                        },
                                        arrayFilters: [
                                            { 'arrElem._id': arrival._id }, // Ensure we update the correct arrival
                                            { 'playerElem.robloxId': player.robloxId } // Target the correct player
                                        ]
                                    }
                                });
                            }
                        } else {
                            console.warn(`[Scheduler] No Discord ID found for Roblox ID ${player.robloxId} on flight ${arrival.flight_code}`);
                        }
                    } // End player loop

                    // Execute bulk updates if any DMs were sent successfully
                    if (updateOps.length > 0) {
                        try {
                            const bulkResult = await Flight.bulkWrite(updateOps);
                            console.log(`[Scheduler] Marked ${bulkResult.modifiedCount} notifications as sent for flight ${arrival.flight_code}`);
                        } catch (dbError) {
                            console.error(`[Scheduler] Error updating notification status for flight ${arrival.flight_code}:`, dbError);
                        }
                    }

                } // End arrival loop
            } // End flight loop
        } // End notification key loop

    } catch (error) {
        console.error('[Scheduler] Error during notification check:', error);
    }
}

// --- Function to Start the Scheduler ---
function startScheduler(client) {
    if (!client) {
        console.error('[Scheduler] Cannot start: Discord client instance is required.');
        return;
    }
    discordClient = client; // Store client instance
    console.log(`[Scheduler] Starting notification check job (runs every ${CHECK_INTERVAL_MINUTES} minute(s))...`);

    // Schedule the job to run
    schedule.scheduleJob(`*/${CHECK_INTERVAL_MINUTES} * * * *`, checkAndSendNotifications); // Cron syntax for every X minutes
    console.log(`[Scheduler] Starting attendance timeout check job (runs every ${CHECK_TIMEOUT_INTERVAL_MINUTES} minutes)...`);
    schedule.scheduleJob(`*/${CHECK_TIMEOUT_INTERVAL_MINUTES} * * * *`, checkAttendanceTimeouts);
    // Optional: Run once immediately on startup?
    // checkAndSendNotifications();
}

module.exports = { startScheduler }; // Export the start function