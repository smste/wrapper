// scheduler.js
const schedule = require('node-schedule');
const mongoose = require('mongoose'); // Optional: for checking connection state
const Flight = require('./models/Flight'); // Adjust path if needed
const User = require('./models/User');   // Adjust path if needed
const { differenceInMilliseconds, add, formatDistanceToNowStrict, format } = require('date-fns');

// --- Configuration ---
const FLIGHT_NOTIFICATION_CHECK_INTERVAL_MINUTES = 2; // How often to check for flight notifications
const TIER_EXPIRY_CHECK_CRON = '0 3 * * *'; // Run tier expiry check once daily at 3:00 AM server time
const NOTIFICATION_WINDOWS = {
    // Key: Identifier used in DB map, Value: duration object for date-fns add()
    '1d': { days: 1 },
    '5h': { hours: 5 },
    '30m': { minutes: 30 },
    'now': { minutes: 5 }, // Notify ~5 mins before scheduled arrival
};
const NOTIFICATION_KEYS = Object.keys(NOTIFICATION_WINDOWS); // ['1d', '5h', '30m', 'now']

// Tier Order for demotion check
const TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'PlatinumOne'];

// Module-level variable to hold the Discord client instance
let discordClient = null;

// --- Helper Function to Send DM ---
async function sendDm(discordId, message) {
    if (!discordClient) {
        console.error('[Scheduler] Discord client not initialized.');
        return false;
    }
    if (!discordId || typeof discordId !== 'string') {
         console.warn('[Scheduler] Attempted to send DM with invalid discordId:', discordId);
         return false;
    }
    try {
        // Fetch user ensures the ID is valid before attempting send
        const user = await discordClient.users.fetch(discordId);
        if (user) {
            await user.send(message);
            console.log(`[Scheduler] Sent notification DM to Discord ID ${discordId}`);
            return true;
        } else {
            // Should not happen if fetch works, but handle just in case
            console.warn(`[Scheduler] Could not fetch Discord user ${discordId} after successful fetch check?`);
            return false;
        }
    } catch (error) {
        // Handle common errors like user blocking bot or leaving shared servers
        if (error.code === 50007) { // Cannot send messages to this user
            console.warn(`[Scheduler] Cannot send DM to Discord ID ${discordId}. User may have DMs disabled or blocked the bot.`);
        } else if (error.code === 10013 ) { // Unknown User
             console.warn(`[Scheduler] Could not find Discord user with ID ${discordId} to send DM.`);
        }
         else {
            console.error(`[Scheduler] Error sending DM to ${discordId}:`, error);
        }
        return false;
    }
}

// --- Job 1: Check and Send Flight Notifications ---
async function checkAndSendNotifications() {
    const now = new Date(); // Current time in UTC
    console.log(`[Scheduler] Running Flight Notification check at ${now.toISOString()}`);
    if (!discordClient) return; // Don't run if client not ready

    const checkBufferMillis = FLIGHT_NOTIFICATION_CHECK_INTERVAL_MINUTES * 60 * 1000;

    try {
        // Iterate through each notification window type ('1d', '5h', etc.)
        for (const key of NOTIFICATION_KEYS) {
            const durationObject = NOTIFICATION_WINDOWS[key];
            // Calculate the target time window we're looking for
            const targetTime = add(now, durationObject); // Future time (e.g., 1 day from now)
            const windowStart = new Date(targetTime.getTime() - checkBufferMillis); // Start of check window
            const windowEnd = targetTime; // End of check window

            // Find Flights with arrivals scheduled within this window
            // And where players exist who haven't received this specific notification yet
            const flightsToNotify = await Flight.find({
                'arrivals.scheduledArrivalTime': { $gte: windowStart, $lte: windowEnd },
                'arrivals.players': { // Ensure there are players on the arrival
                    $elemMatch: {
                        [`notificationsSent.${key}`]: { $ne: true } // Check specific map key is not true
                    }
                 }
            })
            // Select only necessary fields. Project matching arrivals and players efficiently.
            // Using $filter in aggregation might be more efficient for large datasets,
            // but this approach is simpler for moderate loads.
            .select('flight_reference arrivals') // Select needed fields
            .lean();

            if (!flightsToNotify || flightsToNotify.length === 0) {
                continue; // No flights match this time window
            }

            console.log(`[Scheduler] Found ${flightsToNotify.length} flight(s) potentially needing '${key}' notifications.`);
            const bulkUpdateOps = []; // Array for database updates

            // Process each flight
            for (const flight of flightsToNotify) {
                // Process each arrival leg within the flight
                for (const arrival of flight.arrivals) {
                    // Double-check if this specific arrival falls within the window
                    // (find() might return flights where *any* arrival matches, lean doesn't filter sub-arrays)
                    if (!arrival.scheduledArrivalTime || arrival.scheduledArrivalTime < windowStart || arrival.scheduledArrivalTime > windowEnd) {
                         continue; // Skip arrival if it's not the one in the time window
                    }

                    // Filter players on *this* arrival leg needing *this* notification
                    const playersOnLegToNotify = (arrival.players || []).filter(
                        p => !p.notificationsSent?.get(key)
                    );

                    if (playersOnLegToNotify.length === 0) continue; // No players need notification on this leg

                    // Get Roblox IDs of players needing notification
                    const robloxIds = playersOnLegToNotify.map(p => p.robloxId);

                    // Find corresponding Discord IDs from the User collection
                    const usersData = await User.find({ 'robloxId': { $in: robloxIds } }).select('robloxId discordId').lean();
                    const discordIdMap = new Map(usersData.map(u => [u.robloxId, u.discordId]));

                    // Prepare notification message content
                    const arrivalTime = arrival.scheduledArrivalTime;
                    const timeUntil = formatDistanceToNowStrict(arrivalTime, { addSuffix: true }); // e.g., "in 1 day", "in 5 hours"
                    // Format time for display (Example: AEST/AEDT - adjust if needed)
                    const arrivalTimeFormatted = format(arrivalTime, 'dd/MM/yy HH:mm:ss'); // Simpler format without timezone lib

                    let message;
                    if (key === 'now') {
                         message = `✈️ Heads up! Your Qantas Virtual flight segment **${arrival.flight_code}** to **${arrival.iata}** (${arrival.airport}) is scheduled to arrive now (${arrivalTimeFormatted} server time).`;
                    } else {
                         message = `✈️ Qantas Virtual Reminder: Your flight segment **${arrival.flight_code}** to **${arrival.iata}** (${arrival.airport}) is scheduled to arrive ${timeUntil} (at ${arrivalTimeFormatted} server time).`;
                    }

                    // Send DMs and prepare DB updates
                    for (const player of playersOnLegToNotify) {
                        const discordId = discordIdMap.get(player.robloxId);
                        if (discordId) {
                            const dmSent = await sendDm(discordId, message);
                            if (dmSent) {
                                // Prepare update to mark notification as sent
                                bulkUpdateOps.push({
                                    updateOne: {
                                        filter: {
                                            '_id': flight._id, // Target specific flight doc
                                            'arrivals._id': arrival._id // Target specific arrival sub-doc
                                        },
                                        update: {
                                            // Use arrayFilters to target the specific player within the nested array
                                            $set: { [`arrivals.$[arrElem].players.$[playerElem].notificationsSent.${key}`]: true }
                                        },
                                        arrayFilters: [
                                            { 'arrElem._id': arrival._id },
                                            { 'playerElem.robloxId': player.robloxId } // Target player by robloxId
                                        ]
                                    }
                                });
                            } // else: DM failed, don't mark as sent, will retry next interval
                        } else {
                             console.warn(`[Scheduler] No Discord ID found for Roblox ID ${player.robloxId} on flight ${arrival.flight_code}`);
                             // Optionally mark as failed? For now, just retry next time.
                        }
                    } // End player loop
                } // End arrival loop
            } // End flight loop

            // Execute bulk updates if any notifications were successfully sent
            if (bulkUpdateOps.length > 0) {
                try {
                    console.log(`[Scheduler] Attempting to mark ${bulkUpdateOps.length} notifications as sent...`);
                    const bulkResult = await Flight.bulkWrite(bulkUpdateOps);
                    console.log(`[Scheduler] Marked ${bulkResult.modifiedCount} notifications as sent for window '${key}'.`);
                } catch (dbError) {
                    console.error(`[Scheduler] Error bulk updating notification status for window '${key}':`, dbError);
                }
            }
        } // End notification key loop

    } catch (error) {
        console.error('[Scheduler] Error during flight notification check:', error);
    }
}


// --- Job 2: Check for Expired Temporary Tiers ---
async function checkTierExpiry() {
    const now = new Date();
    console.log(`[Scheduler] Running Tier Expiry check at ${now.toISOString()}`);

    try {
        // Find users whose temporary tier expiry date is in the past
        const expiredUsers = await User.find({
            temporaryTierExpiryDate: { $ne: null, $lt: now }
            // No need to check currentTier vs lifetimeTier here, do it after finding
        });

        if (!expiredUsers || expiredUsers.length === 0) {
            // console.log('[Scheduler] No expired temporary tiers found.');
            return;
        }

        console.log(`[Scheduler] Found ${expiredUsers.length} users with potentially expired temporary tiers.`);
        let demotedCount = 0;

        for (const user of expiredUsers) {
            const currentTierIndex = TIER_ORDER.indexOf(user.currentTier);
            const lifetimeTierIndex = TIER_ORDER.indexOf(user.lifetimeTier);

            // Only demote if their current tier is strictly higher than their lifetime tier
            if (currentTierIndex > lifetimeTierIndex) {
                console.log(`[Scheduler] Demoting user ${user.robloxId} from Temp ${user.currentTier} to ${user.lifetimeTier}.`);
                user.currentTier = user.lifetimeTier; // Demote to highest lifetime tier
                user.statusCredits = 0; // Reset status credits upon demotion
                user.temporaryTierExpiryDate = null; // Clear expiry date

                try {
                    await user.save(); // Save changes for this user
                    demotedCount++;
                } catch (saveError) {
                     console.error(`[Scheduler] Failed to save demotion for user ${user.robloxId}:`, saveError);
                }
            } else {
                 // User might have reached lifetime status for their current tier, or is already at lifetime level
                 // Just clear the expiry date as it's no longer relevant
                 if (user.temporaryTierExpiryDate !== null) { // Only update if needed
                     console.log(`[Scheduler] Clearing expired temp date for user ${user.robloxId} who is already at/above lifetime ${user.currentTier}.`);
                      user.temporaryTierExpiryDate = null;
                      try { await user.save(); } catch (e) { console.error(`[Scheduler] Failed to clear expiry date for user ${user.robloxId}:`, e); }
                 }
            }
        }

        if (demotedCount > 0) {
             console.log(`[Scheduler] Successfully processed demotions for ${demotedCount} users.`);
        }

    } catch (error) {
        console.error('[Scheduler] Error during tier expiry check:', error);
    }
}


// --- Function to Start All Scheduled Jobs ---
function startScheduler(client) {
    if (!client) {
        console.error('[Scheduler] Cannot start: Discord client instance is required.');
        return;
    }
    discordClient = client; // Store client instance for helper functions
    console.log(`[Scheduler] Initializing scheduled jobs...`);

    // Schedule Job 1: Flight Notifications
    const notificationJob = schedule.scheduleJob(`*/${FLIGHT_NOTIFICATION_CHECK_INTERVAL_MINUTES} * * * *`, () => {
        // Add check if DB is connected?
        if (mongoose.connections.some(conn => conn.readyState === 1)) {
             checkAndSendNotifications().catch(err => console.error("[Scheduler] Uncaught error in checkAndSendNotifications:", err));
        } else {
            console.warn("[Scheduler] Skipping notification check - DB not connected.");
        }
    });
    console.log(`[Scheduler] Flight notification job scheduled (runs every ${FLIGHT_NOTIFICATION_CHECK_INTERVAL_MINUTES} mins). Next invocation: ${notificationJob?.nextInvocation()?.toISOString() || 'N/A'}`);

    // Schedule Job 2: Tier Expiry Check
    const expiryJob = schedule.scheduleJob(TIER_EXPIRY_CHECK_CRON, () => {
        if (mongoose.connections.some(conn => conn.readyState === 1)) {
             checkTierExpiry().catch(err => console.error("[Scheduler] Uncaught error in checkTierExpiry:", err));
        } else {
             console.warn("[Scheduler] Skipping tier expiry check - DB not connected.");
        }
    });
    console.log(`[Scheduler] Tier expiry job scheduled (cron: ${TIER_EXPIRY_CHECK_CRON}). Next invocation: ${expiryJob?.nextInvocation()?.toISOString() || 'N/A'}`);

    // Optional: Run checks once immediately on startup?
    // setTimeout(() => checkAndSendNotifications(), 5000); // Delay slightly after start
    // setTimeout(() => checkTierExpiry(), 10000);
}

module.exports = { startScheduler }; // Export the start function