// controllers/userController.js
const User = require('../models/User');

// Helper to handle 'not found' errors
const checkNotFound = (doc, id) => {
    if (!doc) {
        const error = new Error(`User with Roblox ID ${id} not found.`);
        error.statusCode = 404;
        throw error;
    }
};

// GET /users/:robloxId
exports.getUser = async (req, res, next) => {
    try {
        const { robloxId } = req.params;
        const user = await User.findOne({ robloxId: robloxId }).lean();
        checkNotFound(user, robloxId); // Assuming checkNotFound helper exists

        // Calculate progress
        const progress = calculateProgress(user);
        const userWithProgress = { ...user, progress }; // Add progress info

        res.status(200).json(userWithProgress);
    } catch (error) { next(error); }
};

// POST /users/:robloxId
exports.createUser = async (req, res, next) => {
    try {
        const { robloxId } = req.params;
        const { discordId } = req.body; // Optional discordId

        // Check if user already exists
        const existingUser = await User.findOne({ robloxId: robloxId });
        if (existingUser) {
            return res.status(409).json({ message: 'User already exists.' }); // 409 Conflict
        }

         // Check if discordId is already linked (if provided)
        if (discordId) {
            const existingDiscordLink = await User.findOne({ discordId: discordId });
             if (existingDiscordLink) {
                return res.status(409).json({ message: 'Discord ID is already linked to another user.', linkedRobloxId: existingDiscordLink.robloxId });
            }
        }


        const newUser = new User({
            robloxId: robloxId,
            discordId: discordId, // Will be undefined if not provided
            points: 0, // Default points
        });

        const savedUser = await newUser.save();
        res.status(201).json({ message: 'User created successfully.', user: savedUser });
    } catch (error) {
         if (error.code === 11000) { // Handle potential race condition for unique indexes
            if (error.keyPattern.robloxId) {
                 return res.status(409).json({ message: 'User already exists (concurrent creation).' });
            }
             if (error.keyPattern.discordId) {
                const existingUser = await User.findOne({ discordId: req.body.discordId }).lean();
                return res.status(409).json({ message: 'Discord ID is already linked to another user (concurrent creation).', linkedRobloxId: existingUser?.robloxId });
            }
        }
        next(error);
    }
};

/**
 * POST /users/get-or-create
 * Finds a user by Roblox ID or creates a basic placeholder if not found.
 * Called by Roblox game servers on player join.
 */
exports.findOrCreateUser = async (req, res, next) => {
    // Validation middleware should have run
    const { robloxId } = req.body;

    try {
        console.log(`[API /get-or-create] Finding or creating user for Roblox ID: ${robloxId}`);
        // Use findOneAndUpdate with upsert: true. This atomically finds or creates.
        const user = await User.findOneAndUpdate(
            { robloxId: robloxId }, // Find criteria
            { // Fields to set ONLY if a NEW document is inserted (upserted)
                $setOnInsert: {
                    robloxId: robloxId,
                    points: 0, // Default points
                    // discordId will be absent/null by default from schema
                    // createdAt will be added by timestamps:true
                }
            },
            {
                new: true, // Return the modified (or new) document
                upsert: true, // Create the document if it doesn't exist
                runValidators: true, // Run schema validators on insert
                setDefaultsOnInsert: true // Apply schema defaults (like points: 0) on insert
            }
        ).lean(); // Use lean if just returning data without modifying further here

        if (!user) {
             // This should theoretically not happen with upsert:true, but handle defensively
             console.error(`[API /get-or-create] findOneAndUpdate with upsert returned null for ${robloxId}`);
             throw new Error('Failed to find or create user record.');
        }

        console.log(`[API /get-or-create] Ensured user exists for Roblox ID: ${robloxId}. User ID: ${user._id}, Linked: ${!!user.discordId}`);
        // Respond with the user document (either existing or newly created placeholder)
        res.status(200).json(user);

    } catch (error) {
        console.error(`[API /get-or-create] Error finding/creating user ${robloxId}:`, error);
         // Handle potential validation errors from Mongoose if runValidators caught something
         if (error.name === 'ValidationError') {
             return res.status(400).json({ message: 'Validation Error during upsert', errors: error.errors });
         }
        next(error); // Pass to general error handler
    }
};

// POST /users/:robloxId/points
exports.setUserPoints = async (req, res, next) => {
    try {
        const { robloxId } = req.params;
        const { points } = req.body;

        const user = await User.findOne({ robloxId: robloxId });
        checkNotFound(user, robloxId);

        // Decide whether to set, add, or subtract points based on your logic.
        // This example SETS the points. Use $inc for adding/subtracting.
        user.points = points;
        // OR for adding: await User.updateOne({ robloxId }, { $inc: { points: points } });

        const updatedUser = await user.save();
        res.status(200).json({ message: 'Points updated successfully.', user: updatedUser });
    } catch (error) {
        next(error);
    }
};

 // POST /users/:robloxId/discord
exports.setUserDiscord = async (req, res, next) => {
    try {
        const { robloxId } = req.params;
        const { discordId } = req.body;

         // Check if discordId is already linked to *another* user
        const existingDiscordLink = await User.findOne({ discordId: discordId, robloxId: { $ne: robloxId } });
         if (existingDiscordLink) {
            return res.status(409).json({ message: 'Discord ID is already linked to another user.', linkedRobloxId: existingDiscordLink.robloxId });
        }

        // Find and update the user, setting the new discordId
         const updatedUser = await User.findOneAndUpdate(
            { robloxId: robloxId },
            { $set: { discordId: discordId } },
            { new: true } // Return the updated document
        );

        checkNotFound(updatedUser, robloxId);

        res.status(200).json({ message: 'Discord account linked successfully.', user: updatedUser });
    } catch (error) {
          if (error.code === 11000 && error.keyPattern.discordId) { // Handle potential race condition for unique index
                const existingUser = await User.findOne({ discordId: req.body.discordId }).lean();
                return res.status(409).json({ message: 'Discord ID is already linked to another user (concurrent creation).', linkedRobloxId: existingUser?.robloxId });
          }
        next(error);
    }
};

// Add this function to userController.js
exports.getUserByDiscordId = async (req, res, next) => {
    try {
        const { discordId } = req.params;
        const user = await User.findOne({ discordId: discordId }).lean();
        if (!user) {
             const error = new Error(`User with Discord ID ${discordId} not found or not linked.`);
             error.statusCode = 404;
             throw error;
        }

        // Calculate progress
        const progress = calculateProgress(user);
        const userWithProgress = { ...user, progress };

        res.status(200).json(user, userWithProgress);
    } catch (error) {
        next(error);
    }
};

const TIER_THRESHOLDS = {
    // Target Tier: { Temp Threshold, Lifetime Threshold }
    Silver: { Temp: 300, Lifetime: 800 },
    Gold: { Temp: 500, Lifetime: 1000 },
    Platinum: { Temp: 700, Lifetime: 1200 },
    PlatinumOne: { Temp: 900, Lifetime: 1400 },
};
const TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'PlatinumOne'];

// Helper function to calculate new tier status
function calculateNewTierStatus(currentLifetimeTier, currentSC) {
    let nextTier = null;
    let nextThresholds = null;

    // Determine which tier the user is currently working towards
    if (currentLifetimeTier === 'Bronze') nextTier = 'Silver';
    else if (currentLifetimeTier === 'Silver') nextTier = 'Gold';
    else if (currentLifetimeTier === 'Gold') nextTier = 'Platinum';
    else if (currentLifetimeTier === 'Platinum') nextTier = 'PlatinumOne';
    // If already PlatinumOne Lifetime, no further tier progression

    if (nextTier && TIER_THRESHOLDS[nextTier]) {
        nextThresholds = TIER_THRESHOLDS[nextTier];
    }

    let achievedTier = null; // The highest tier reached with current SC
    let isLifetime = false;
    let didReset = false;
    let newSC = currentSC;
    let newExpiry = null;

    if (nextTier && nextThresholds) {
        // Check if Lifetime threshold for the NEXT tier is met
        if (currentSC >= nextThresholds.Lifetime) {
            achievedTier = nextTier;
            isLifetime = true;
            didReset = true; // Reset SC and expiry because Lifetime was hit
            newSC = 0;
            newExpiry = null;
            console.log(`  - Achieved Lifetime ${achievedTier}`);
        }
        // Check if Temporary threshold for the NEXT tier is met (and Lifetime wasn't)
        else if (currentSC >= nextThresholds.Temp) {
            achievedTier = nextTier;
            isLifetime = false;
            didReset = false; // Don't reset SC for Temp achievement
            // Set expiry date (4 months from now)
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + 4);
            newExpiry = expiryDate;
            console.log(`  - Achieved Temporary ${achievedTier}, expires ${newExpiry.toISOString()}`);
        }
    }

    // Return the results
    return {
        achievedTier, // e.g., 'Silver', 'Gold', or null if no new tier reached
        isLifetime, // true if the lifetime threshold was met
        didReset, // true if SC should be reset
        newStatusCredits: newSC, // SC value after potential reset
        newExpiryDate: newExpiry // New expiry date or null
    };
}


/**
 * POST /users/:robloxId/credits
 * Adds Status Credits to a user and updates their tier status if thresholds are met.
 */
exports.addStatusCredits = async (req, res, next) => {
    const { robloxId } = req.params; // Validation ensures this is integer
    const { amount, reason } = req.body; // Validation ensures amount is integer

    // Basic check for non-negative amount, adjust if needed
    if (amount < 0) {
        // Or handle negative amounts if 'removing' credits is a feature
        return res.status(400).json({ message: 'Credit amount cannot be negative.' });
    }
    if (amount === 0) {
         return res.status(200).json({ message: 'Amount was zero, no credits added.', user: await User.findOne({robloxId}).lean() }); // Return current state
    }


    try {
        // Find the user document (non-lean, we need to save it)
        const user = await User.findOne({ robloxId: robloxId });
        if (!user) {
            // Maybe create user here if findOrCreate wasn't guaranteed? Or just error.
            return res.status(404).json({ message: `User with Roblox ID ${robloxId} not found.` });
        }

        console.log(`[Add Credits] User: ${robloxId}, Current Tier: ${user.currentTier}, Lifetime: ${user.lifetimeTier}, Current SC: ${user.statusCredits}, Adding: ${amount}`);

        // Add the new credits
        const updatedSC = user.statusCredits + amount;
        user.statusCredits = updatedSC; // Temporarily update to calculate potential new tier

        // Calculate new tier status based on the updated SC and user's *current lifetime tier*
        const tierResult = calculateNewTierStatus(user.lifetimeTier, user.statusCredits);

        // Apply changes based on calculation
        let tierChanged = false;
        if (tierResult.achievedTier) {
             // Check if this is actually an upgrade (higher index in TIER_ORDER)
             const currentTierIndex = TIER_ORDER.indexOf(user.currentTier);
             const newTierIndex = TIER_ORDER.indexOf(tierResult.achievedTier);

             if (newTierIndex > currentTierIndex) {
                  console.log(`[Add Credits] Tier Upgrade: ${user.currentTier} -> ${tierResult.achievedTier} (${tierResult.isLifetime ? 'Lifetime' : 'Temporary'})`);
                  user.currentTier = tierResult.achievedTier;
                  tierChanged = true;
                  if (tierResult.isLifetime) {
                      user.lifetimeTier = tierResult.achievedTier; // Update highest lifetime achieved
                  }
                  // Always set/reset expiry when achieving a new temporary or lifetime tier
                  user.temporaryTierExpiryDate = tierResult.newExpiryDate;
             } else {
                  console.log(`[Add Credits] Credits added, but user already at or above ${tierResult.achievedTier}. Current tier remains ${user.currentTier}.`);
                  // If they re-qualify for Temp but are already Lifetime, clear expiry if needed
                  if (user.lifetimeTier === tierResult.achievedTier) {
                       user.temporaryTierExpiryDate = null;
                  }
             }

             // Apply SC reset ONLY if a Lifetime tier was achieved
             if (tierResult.didReset) {
                  console.log(`[Add Credits] Resetting Status Credits to 0 after achieving Lifetime ${user.lifetimeTier}.`);
                  user.statusCredits = 0; // Reset SC *after* calculations for this update
             }
        } else {
             console.log(`[Add Credits] Credits added, no tier change. New SC: ${user.statusCredits}`);
             // No tier change, expiry date remains unchanged unless cleared by hitting lifetime
        }


        // Save the updated user document
        const savedUser = await user.save();

        // Log the action (optional audit trail)
        console.log(`[Add Credits] Successfully added ${amount} SC to user ${robloxId}. Reason: ${reason || 'N/A'}. New SC: ${savedUser.statusCredits}. New Tier: ${savedUser.currentTier}.`);

        res.status(200).json({
            message: `Successfully added ${amount} Status Credits.`,
            user: savedUser // Return the updated user object
        });

    } catch (error) {
         console.error(`[Add Credits] Error adding credits for user ${robloxId}:`, error);
         if (error.name === 'ValidationError') {
             return res.status(400).json({ message: 'Validation Error saving user', errors: error.errors });
         }
        next(error);
    }
};

function calculateProgress(user) {
    if (!user || !user.currentTier || user.statusCredits === undefined || user.lifetimeTier === 'PlatinumOne') {
         return { nextTier: null, requiredSC: 0, progressPercent: 0 }; // No progress if top tier or invalid data
    }

    let nextStatus = null;
    let nextTierRequiredSC = 0;
    const currentTierIndex = TIER_ORDER.indexOf(user.currentTier);
    const lifetimeTierIndex = TIER_ORDER.indexOf(user.lifetimeTier);

    // Are they working towards Lifetime of current Temp tier?
    if (currentTierIndex > lifetimeTierIndex) { // Current tier is temporary
         const tierData = TIER_THRESHOLDS[user.currentTier];
         if (tierData) {
             nextStatus = `Lifetime ${user.currentTier}`;
             nextTierRequiredSC = tierData.Lifetime;
         }
    }
    // Or working towards Temp of the next tier?
    else if (currentTierIndex < TIER_ORDER.length - 1) { // Not highest tier yet
         const nextTierName = TIER_ORDER[currentTierIndex + 1];
         const tierData = TIER_THRESHOLDS[nextTierName];
         if (tierData) {
              nextStatus = `Temporary ${nextTierName}`;
              nextTierRequiredSC = tierData.Temp;
         }
    }

    if (nextStatus && nextTierRequiredSC > 0) {
        const progress = Math.max(0, Math.min(100, (user.statusCredits / nextTierRequiredSC) * 100));
        return {
            nextTier: nextStatus,
            requiredSC: nextTierRequiredSC,
            progressPercent: Math.floor(progress) // Or round as desired
        };
    } else {
         // Likely PlatinumOne Lifetime, or error in logic
         return { nextTier: 'Maximum Tier Achieved', requiredSC: 0, progressPercent: 100 };
    }
}