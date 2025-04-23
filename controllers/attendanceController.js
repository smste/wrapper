// controllers/attendanceController.js
const AttendanceRecord = require('../models/AttendanceRecord');
const FlightPlan = require('../models/FlightPlan'); // Needed to validate plan/leg exists?

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
        const result = await AttendanceRecord.findOneAndUpdate(
            { planReference, robloxId, segmentFlightCode, status: 'active' }, // Only complete active records
            { $set: { status: 'completed', checkOutTime: new Date(), lastSeen: new Date() } },
            { new: true } // Return updated doc
        );

        if (!result) {
             console.warn(`[Attendance] Checkout received for inactive/unknown record: ${robloxId} on ${planReference} / ${segmentFlightCode}`);
             return res.status(404).json({ success: false, message: 'No active attendance record found to check out.' });
        }
        console.log(`[Attendance] Checkout recorded for ${robloxId} on ${planReference} / ${segmentFlightCode}`);
        res.status(200).json({ success: true, message: 'Check-out recorded successfully.' });
    } catch (error) { next(error); }
};