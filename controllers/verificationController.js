// controllers/verificationController.js
const Verification = require('../models/Verification');
const User = require('../models/User');
// We don't need to require discord.js here, just use the passed instance

let discordClientInstance = null; // Module-level variable to hold the client

// Function for server.js to set the client instance
exports.setDiscordClient = (client) => {
    discordClientInstance = client;
    if (discordClientInstance) {
         console.log('[VerificationController] Discord client instance received.');
    } else {
         console.warn('[VerificationController] Received null/undefined client instance.');
    }
};

// Simplified user creation/linking (replace with your actual logic if needed)
async function createUserAndLink(robloxId, discordId) {
    // ... (your existing robust creation/linking logic) ...
     const existingUser = await User.findOne({ $or: [{ robloxId }, { discordId }] });
     if (existingUser) {
         if (existingUser.discordId === discordId && existingUser.robloxId === robloxId) return existingUser;
         throw new Error(`Conflict: Cannot link ${robloxId} and ${discordId}.`);
     }
     const newUser = new User({ robloxId: robloxId, discordId: discordId, points: 0 });
     await newUser.save();
     console.log(`Created user for RobloxID ${robloxId}, linked to DiscordID ${discordId}`);
     return newUser;
}

// The confirmation endpoint logic
exports.confirmVerification = async (req, res, next) => {
    const { verificationCode, robloxId } = req.body; // robloxId FROM GAME

    try {
        // 1. Find pending verification record
        const pendingVerification = await Verification.findOne({
            code: verificationCode.toUpperCase(),
            status: 'pending',
            expiresAt: { $gt: new Date() }
        });

        if (!pendingVerification) {
            return res.status(404).json({ success: false, message: 'Invalid or expired verification code.' });
        }

        // 2. Verify Roblox ID match
        if (pendingVerification.robloxId !== robloxId) {
            console.warn(`Verification mismatch: Code ${verificationCode} for RobloxID ${pendingVerification.robloxId} used by RobloxID ${robloxId}.`);
            return res.status(403).json({ success: false, message: 'Verification code does not match the logged-in Roblox user.' });
        }

        // --- Verification Success ---
        let linkedUser = null;
        // 3. Create User and Link Accounts
        try {
             linkedUser = await createUserAndLink(pendingVerification.robloxId, pendingVerification.discordId);
        } catch (createUserError) {
             console.error(`Error during user creation/linking for verification code ${verificationCode}:`, createUserError);
             const userMessage = createUserError.message?.includes('Conflict')
                  ? "Could not link account: This Roblox account or Discord account is already linked elsewhere."
                  : "An internal error occurred while creating your profile.";
             return res.status(409).json({ success: false, message: userMessage });
        }

        // 4. Update verification status (or let TTL handle deletion)
        pendingVerification.status = 'verified';
        await pendingVerification.save();
        // await Verification.deleteOne({ _id: pendingVerification._id }); // Alternative

        // --- 5. Respond Success to Game FIRST ---
        // It's often better to confirm success to the game quickly
        res.status(200).json({ success: true, message: 'Account linked successfully!' });

        // --- 6. Send DM to Discord User (After responding to game) ---
        if (discordClientInstance) {
            try {
                // Use the username stored during verification initiation
                const robloxUsername = pendingVerification.robloxUsername || `ID ${pendingVerification.robloxId}`;
                const welcomeMessage = `🎉 Welcome to Qantas Virtual! Your Roblox account (\`${robloxUsername}\`) has been successfully linked to your Discord account. You can now use commands like /myprofile.`;

                await discordClientInstance.users.send(pendingVerification.discordId, welcomeMessage);
                console.log(`Sent verification success DM to Discord user ${pendingVerification.discordId}`);
            } catch (dmError) {
                 // Log DM error but don't fail the overall process
                 console.warn(`Failed to send verification success DM to ${pendingVerification.discordId}:`, dmError.code, dmError.message);
            }
        } else {
            console.warn('Discord client instance not available in verificationController to send DM.');
        }
        // --- End Send DM ---

    } catch (error) {
        console.error(`Error confirming verification for code ${verificationCode}:`, error);
        // Ensure a response is sent even on unexpected errors if not already sent
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'An internal server error occurred during verification.' });
        }
        // next(error); // Optionally pass to central handler, but API should respond
    }
};