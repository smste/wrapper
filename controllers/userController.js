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
        const user = await User.findOne({ robloxId: robloxId }).lean(); // Use lean for read-only ops
        checkNotFound(user, robloxId);
        res.status(200).json(user);
    } catch (error) {
        next(error); // Pass error to the centralized handler
    }
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
        res.status(200).json(user);
    } catch (error) {
        next(error);
    }
};