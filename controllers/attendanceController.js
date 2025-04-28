// controllers/attendanceController.js
const AttendanceRecord = require('../models/AttendanceRecord');
// const FlightPlan = require('../models/flightPlan'); // Needed to validate plan/leg exists?

// POST /attendance/checkin
exports.recordCheckIn = async (req, res, next) => {
    const { planReference, robloxId, segmentFlightCode } = req.body;
    const now = new Date();
    try {
        // Optional: Validate planRef/robloxId/segmentFlightCode exists in FlightPlan DB first
        // const plan = await FlightPlan.findOne({ planReference: planReference, robloxId: robloxId, 'legs.segmentFlightCode': segmentFlightCode });
        // if (!plan) return res.status(404).json({ success: false, message: 'Valid plan/leg not found for this user.'});

        // Use findOneAndUpdate with upsert: create if not exists, update if exists (e.g., re-checkin)
        const result = await AttendanceRecord.findOneAndUpdate(
            { planReference, robloxId, segmentFlightCode }, // Find criteria
            { // Update/Set data
                $set: {
                    status: 'active',
                    lastSeen: now,
                },
                $setOnInsert: { // Only set these fields when creating NEW record
                     checkInTime: now,
                }
            },
            { upsert: true, new: true, runValidators: true } // Options: create if no match, return new doc, run schema checks
        );
        console.log(`[Attendance] Check-in recorded for ${robloxId} on ${planReference} / ${segmentFlightCode}`);
        res.status(200).json({ success: true, message: 'Check-in recorded.' });
    } catch (error) { next(error); }
};

// POST /attendance/heartbeat
exports.recordHeartbeat = async (req, res, next) => {
    const { planReference, robloxId, segmentFlightCode } = req.body;
    try {
        const result = await AttendanceRecord.updateOne(
            { planReference, robloxId, segmentFlightCode, status: 'active' }, // Only update active records
            { $set: { lastSeen: new Date() } }
        );

        if (result.matchedCount === 0) {
             console.warn(`[Attendance] Heartbeat received for inactive/unknown record: ${robloxId} on ${planReference} / ${segmentFlightCode}`);
             return res.status(404).json({ success: false, message: 'No active attendance record found for this leg.' });
        }
        // console.log(`[Attendance] Heartbeat received for ${robloxId} on ${planReference} / ${segmentFlightCode}`); // Can be very noisy
        res.status(200).json({ success: true, message: 'Heartbeat received.' });
    } catch (error) { next(error); }
};

// POST /attendance/checkout
exports.recordCheckOut = async (req, res, next) => {
    const { planReference, robloxId, segmentFlightCode } = req.body;
    try {
        // Find the active record first
        const record = await AttendanceRecord.findOne({
             planReference, robloxId, segmentFlightCode, status: 'active'
        });

        if (!record) {
             return res.status(404).json({ success: false, message: 'No active attendance record found to check out.' });
        }

        // Mark as completed
        record.status = 'completed';
        record.checkOutTime = new Date();
        record.lastSeen = new Date();
        await record.save();

        console.log(`[Attendance] Checkout recorded for ${robloxId} on ${planReference} / ${segmentFlightCode}`);

        // --- AWARD STATUS CREDITS ---
        const creditsToAward = 50; // Example: Award 50 SC per leg
        const reason = `Completed leg ${segmentFlightCode} on plan ${planReference}`;
        console.log(`[Attendance] Attempting to award ${creditsToAward} SC to ${robloxId}`);

        try {
            // Option B: Call controller function directly (if in same process)
            // Mock req/res objects or refactor addStatusCredits to be callable internally
            // This requires refactoring addStatusCredits to not rely directly on req/res
            // Or, fetch user and call the calculation logic directly, then save user.

            // Simpler temporary approach (less ideal design): Fetch user, update, check tiers, save
             const user = await User.findOne({ robloxId: robloxId });
             if (user) {
                 user.statusCredits += creditsToAward;
                 // Re-run tier calculation logic here (or better: put logic in User model method user.addCreditsAndCheckTier(amount))
                 // For now, just save - tier update relies on calling the dedicated endpoint separately or refactoring
                 await user.save(); // Basic save, tier logic NOT run here yet
                 console.log(`[Attendance] Directly added ${creditsToAward} SC to user ${robloxId}. Tier check requires separate call or refactor.`);
                 // TODO: Refactor needed - call the actual tier update logic from userController.addStatusCredits here

                 // Proper way would be:
                 // await userController.addStatusCreditsInternal(robloxId, creditsToAward, reason);
                 // OR via API Client if separate services:
                 // await apiClient.addStatusCredits(robloxId, creditsToAward, reason);

             } else {
                 console.warn(`[Attendance] User ${robloxId} not found when trying to award credits.`);
             }

        } catch (creditError) {
             console.error(`[Attendance] Failed to award/process status credits for ${robloxId} after checkout:`, creditError);
             // Don't fail the checkout response just because credit award failed
        }
        // --- END AWARD ---

        res.status(200).json({ success: true, message: 'Check-out recorded successfully.' });

    } catch (error) { next(error); }
};