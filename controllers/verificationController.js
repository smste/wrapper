// controllers/verificationController.js
const Verification = require('../models/Verification');
const User = require('../models/User'); // To create the user

// We might need a dedicated function or reuse parts of userController.createUser
// Let's assume a simplified creation logic here for clarity
async function createUserAndLink(robloxId, discordId) {
     // Simplistic check - In reality, use userController logic or a shared service
     // to handle potential conflicts (e.g., if robloxId got linked between verification start and now)
     const existingUser = await User.findOne({ $or: [{ robloxId }, { discordId }] });
     if (existingUser) {
         if (existingUser.discordId === discordId && existingUser.robloxId === robloxId) {
             console.log(`User <span class="math-inline">\{robloxId\}/</span>{discordId} already exists and is linked.`);
             return existingUser; // Already correctly linked
         } else {
             // Conflict! Either Roblox ID or Discord ID is linked to someone else.
              throw new Error(`Conflict: Cannot link ${robloxId} and ${discordId}. An existing link conflicts.`);
              // Should provide more specific conflict info in a real scenario
         }
     }

    // Create new user
    const newUser = new User({
        robloxId: robloxId,
        discordId: discordId,
        points: 0, // Default points
    });
    await newUser.save();
    console.log(`Created user for RobloxID ${robloxId}, linked to DiscordID ${discordId}`);
    return newUser;
}


exports.confirmVerification = async (req, res, next) => {
    const { verificationCode, robloxId } = req.body; // robloxId comes FROM THE GAME SERVER

    try {
        // 1. Find pending verification record by code
        const pendingVerification = await Verification.findOne({
            code: verificationCode.toUpperCase(),
            status: 'pending',
            expiresAt: { $gt: new Date() } // Check if not expired
        });

        if (!pendingVerification) {
            return res.status(404).json({ success: false, message: 'Invalid or expired verification code.' });
        }

        // 2. CRITICAL: Verify Roblox ID match
        if (pendingVerification.robloxId !== robloxId) {
             console.warn(`Verification mismatch: Code ${verificationCode} for RobloxID ${pendingVerification.robloxId} used by RobloxID ${robloxId}.`);
            return res.status(403).json({ success: false, message: 'Verification code does not match the logged-in Roblox user.' });
        }

        // --- Verification Success ---

        // 3. Create User and Link Accounts
        try {
             await createUserAndLink(pendingVerification.robloxId, pendingVerification.discordId);
        } catch (createUserError) {
             console.error(`Error during user creation/linking for verification code ${verificationCode}:`, createUserError);
             // Inform game of specific conflict if possible, otherwise generic error
             const userMessage = createUserError.message?.includes('Conflict')
                  ? "Could not link account: This Roblox account or Discord account is already linked elsewhere."
                  : "An internal error occurred while creating your profile.";
             return res.status(409).json({ success: false, message: userMessage }); // 409 Conflict or 500?
        }


        // 4. Update verification status (or let TTL handle deletion)
        // Option A: Mark as verified
        pendingVerification.status = 'verified';
        await pendingVerification.save();
        // Option B: Delete immediately (TTL will get it eventually anyway)
        // await Verification.deleteOne({ _id: pendingVerification._id });

        // 5. Respond Success to Game
        res.status(200).json({ success: true, message: 'Account linked successfully!' });

        // Optional: Notify Discord user via DM (Bot needs mechanism like events or polling)

    } catch (error) {
        console.error(`Error confirming verification for code ${verificationCode}:`, error);
        // Send generic error back to game
        res.status(500).json({ success: false, message: 'An internal server error occurred during verification.' });
        // next(error); // Don't necessarily pass to main error handler for game response
    }
};