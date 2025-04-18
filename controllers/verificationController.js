// controllers/verificationController.js
const Verification = require('../models/Verification');
const User = require('../models/User'); // To create/find the user

let discordClientInstance = null; // Module-level variable to hold the Discord client

// Function for server.js (or bot.js) to set the client instance
exports.setDiscordClient = (client) => {
    discordClientInstance = client;
    if (discordClientInstance) {
         console.log('[VerificationController] Discord client instance received.');
    } else {
         console.warn('[VerificationController] Received null/undefined client instance.');
    }
};

// Simplified user creation/linking logic
// TODO: Replace this with more robust logic, potentially calling userController functions
// or using a shared service layer to handle conflicts and updates correctly.
async function createUserAndLink(robloxId, discordId) {
    // Check if link already exists correctly
    let user = await User.findOne({ robloxId: robloxId });
    if (user) {
        if (user.discordId === discordId) {
             console.log(`User ${robloxId} already exists and is correctly linked to Discord ${discordId}.`);
             return user; // Already good
        } else if (user.discordId) {
             throw new Error(`Conflict: Roblox ID ${robloxId} is already linked to a different Discord account.`);
        } else {
             // User exists but not linked, link them
             user.discordId = discordId;
             await user.save();
             console.log(`Updated existing user ${robloxId}, linked to Discord ${discordId}.`);
             return user;
        }
    } else {
         // Check if Discord ID is linked to another Roblox ID
         const discordUser = await User.findOne({ discordId: discordId });
         if (discordUser) {
              throw new Error(`Conflict: Discord ID ${discordId} is already linked to Roblox ID ${discordUser.robloxId}.`);
         }
        // Create new user if neither link exists
        const newUser = new User({
            robloxId: robloxId,
            discordId: discordId,
            points: 0, // Default points
        });
        await newUser.save();
        console.log(`Created user for RobloxID ${robloxId}, linked to DiscordID ${discordId}`);
        return newUser;
    }
}

// Handles POST /verifications/confirm
exports.confirmVerification = async (req, res, next) => {
    // Validation middleware should have already run
    const { verificationCode, robloxId } = req.body; // robloxId FROM GAME

    try {
        // 1. Find PENDING verification record by code (case-insensitive potentially needed)
        // Using uppercase from validation ensures match if code stored as uppercase
        const pendingVerification = await Verification.findOne({
            code: verificationCode, // Assumes code stored as uppercase
            status: 'pending',
            expiresAt: { $gt: new Date() } // Check if not expired
        });

        if (!pendingVerification) {
            console.log(`Verification attempt failed: Code ${verificationCode} not found, expired, or not pending.`);
            return res.status(404).json({ success: false, message: 'Invalid or expired verification code.' });
        }

        // 2. CRITICAL: Verify Roblox ID match
        if (pendingVerification.robloxId !== robloxId) {
             console.warn(`Verification mismatch: Code ${verificationCode} for RobloxID ${pendingVerification.robloxId} used by RobloxID ${robloxId} from game.`);
            return res.status(403).json({ success: false, message: 'Verification code does not match the logged-in Roblox user.' });
        }

        // --- Verification Checks Passed ---
        console.log(`Verification code ${verificationCode} matched for Roblox ID ${robloxId}. Proceeding with linking.`);

        // 3. Create User and Link Accounts
        let linkedUser;
        try {
             linkedUser = await createUserAndLink(pendingVerification.robloxId, pendingVerification.discordId);
        } catch (createUserError) {
             console.error(`Error during user creation/linking for verification code ${verificationCode}:`, createUserError);
             const userMessage = createUserError.message?.includes('Conflict')
                  ? "Could not link account: This Roblox or Discord account is already linked elsewhere."
                  : "An internal error occurred while creating your profile link.";
             // Use 409 Conflict for linking issues
             return res.status(409).json({ success: false, message: userMessage });
        }

        // 4. Update verification status to prevent reuse
        pendingVerification.status = 'verified';
        // Optionally set expiresAt to now if not using TTL index for immediate cleanup idea
        // pendingVerification.expiresAt = new Date();
        await pendingVerification.save();
        console.log(`Verification record ${verificationCode} marked as verified.`);


        // 5. Respond Success to Game FIRST
        res.status(200).json({ success: true, message: 'Account linked successfully!' });

        // --- 6. Send DM to Discord User (Asynchronously after response) ---
        if (discordClientInstance) {
             // Run this part without waiting for it to finish, so the API responds quickly
             // Use setImmediate or just don't await the promise inside the controller flow
             setImmediate(async () => {
                 try {
                    const robloxUsername = pendingVerification.robloxUsername || `ID ${pendingVerification.robloxId}`;
                    // Customize your welcome message
                    const welcomeMessage = `🎉 **Welcome to Qantas Virtual!** 🎉\n\nYour Roblox account (\`${robloxUsername}\`) has been successfully linked to your Discord account. You can now use commands like \`/myprofile\` and others that require a linked account.\n\nEnjoy your journey with us!`;

                    await discordClientInstance.users.send(pendingVerification.discordId, welcomeMessage);
                    console.log(`Sent verification success DM to Discord user ${pendingVerification.discordId}`);
                 } catch (dmError) {
                    // Log DM error but don't crash anything
                    console.warn(`Failed to send verification success DM to ${pendingVerification.discordId}. Error Code: ${dmError.code} - ${dmError.message}`);
                 }
             });
        } else {
            console.warn('Discord client instance not available in verificationController to send DM.');
        }
        // --- End Send DM ---

    } catch (error) {
        console.error(`Error confirming verification for code ${verificationCode}:`, error);
        // Send generic error back to game ONLY if response hasn't been sent
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'An internal server error occurred during verification.' });
        }
        // Optionally pass to global error handler if needed, but API should respond
        // next(error);
    }
};