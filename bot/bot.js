// bot/bot.js (Main Entry Point - Complete Code)
require('dotenv').config(); // Load .env variables FIRST

// Node.js Modules
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Discord.js Modules
const { Client, Collection, GatewayIntentBits, InteractionResponseFlags, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// WebSocket Server
const WebSocket = require('ws');

// Project Modules
const config = require('../config'); // Adjust path if needed
const { startScheduler } = require('../scheduler'); // Adjust path if needed
const setupServer = require('../server'); // Adjust path - Import server setup function
const botInternalApi = require('./botInternalApi'); // For triggering DMs from controllers
const WebLoginRequest = require('../models/WebLoginRequest'); // Need model for button handler

// --- Essential Config Checks ---
if (!config.discordToken) {
    console.error("❌ FATAL: DISCORD_BOT_TOKEN is missing. Check .env file.");
    process.exit(1);
}
if (!config.apiKey) {
     console.warn("⚠️ WARNING: API_KEY is missing. General API routes will be inaccessible.");
}
if (!config.gameServerSecretKey) {
     console.warn("⚠️ WARNING: GAME_SERVER_SECRET_KEY is missing. Roblox verification endpoint will be inaccessible.");
}
if (!config.apiBaseUrl){
    console.warn("⚠️ WARNING: API_BASE_URL is missing. API Client may not function correctly.");
}

// --- Discord Client Setup ---
// Define Intents needed by bot + scheduler + verification DMs
const client = new Client({
     intents: [
         GatewayIntentBits.Guilds, // Needed for interactions, member checks etc.
         GatewayIntentBits.GuildMembers, // Needed to get member nicknames/roles
         GatewayIntentBits.DirectMessages // Needed to send DMs (like verification success/login approval)
         // Add GuildMessages if reading messages or using prefix commands
     ]
 });

// --- Command Loading ---
console.log('[Bot] Loading commands...');
client.commands = new Collection();
const commandsPathBase = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPathBase)) {
    const commandFolders = fs.readdirSync(commandsPathBase);
    for (const folder of commandFolders) {
        const commandsPath = path.join(commandsPathBase, folder);
         try {
             if (fs.lstatSync(commandsPath).isDirectory()) {
                const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
                console.log(`[Bot] Loading commands from folder: ${folder}`);
                for (const file of commandFiles) {
                    const filePath = path.join(commandsPath, file);
                    try {
                        const command = require(filePath);
                        if (command?.data && typeof command.data.toJSON === 'function' && command.execute) {
                            client.commands.set(command.data.name, command);
                            console.log(`[Bot]  - Loaded command: /${command.data.name}`);
                        } else {
                            console.warn(`[WARNING] Command file ${filePath} is invalid or missing 'data'/'execute'.`);
                        }
                    } catch(err) {
                         console.error(`❌ Error loading command file ${filePath}:`, err);
                    }
                }
            }
         } catch (folderError){
              console.error(`Error reading command folder ${commandsPath}:`, folderError);
         }
    }
} else {
    console.warn(`[Bot] Commands directory not found at ${commandsPathBase}. No commands loaded.`);
}
console.log(`[Bot] Loaded ${client.commands.size} commands.`);


// --- WebSocket Management ---
// Map to store active WebSocket connections associated with login requests
const pendingLoginSockets = new Map(); // Map<loginRequestId, WebSocket>

// Function to send message to a specific login attempt's browser via WebSocket
function notifyWebClient(loginRequestId, type, data) {
    const ws = pendingLoginSockets.get(loginRequestId);
    if (ws && ws.readyState === WebSocket.OPEN) { // Check WebSocket state
        console.log(`[WebSocket] Sending ${type} notification for request ${loginRequestId}`);
        try {
            ws.send(JSON.stringify({ type, payload: data }));
            return true;
        } catch (sendError) {
             console.error(`[WebSocket] Error sending message for ${loginRequestId}:`, sendError);
             // Clean up potentially broken socket
             try { ws.close(); } catch {}
             pendingLoginSockets.delete(loginRequestId);
             return false;
        }
    } else {
         console.warn(`[WebSocket] No active/open connection found for login request ${loginRequestId} to notify.`);
         if (ws) { // Clean up map if socket state is closed/closing
              if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                   pendingLoginSockets.delete(loginRequestId);
              }
         }
         return false;
    }
}
// Export for internal API/Controller use
module.exports.notifyWebClient = notifyWebClient;


// --- Discord Interaction Handler ---
client.on('interactionCreate', async interaction => {

    // --- Button Interaction Handler ---
    if (interaction.isButton()) {
        const customId = interaction.customId;
        console.log(`[Interaction] Button clicked: ${customId} by ${interaction.user.tag}`);

        if (customId.startsWith('approve-login_') || customId.startsWith('deny-login_')) {
             const parts = customId.split('_');
             const action = parts[0];
             const loginRequestId = parts[1];

             try {
                 await interaction.deferUpdate(); // Acknowledge button press
             } catch (deferError) {
                  console.error(`Failed to defer update for button ${customId}:`, deferError);
                  return; // Cannot proceed without acknowledging
             }

             let loginRequest;
             try {
                loginRequest = await WebLoginRequest.findOne({
                    loginRequestId: loginRequestId,
                    discordId: interaction.user.id,
                    status: 'pending',
                    expiresAt: { $gt: new Date() }
                });
             } catch (dbError) {
                  console.error(`DB Error finding login request ${loginRequestId}:`, dbError);
                  try { await interaction.editReply({ content: 'An error occurred finding your login request.', components: [] }); } catch {}
                  return;
             }

             if (!loginRequest) {
                 console.log(`[Interaction] Invalid/Expired login button click: ${customId} by ${interaction.user.tag}`);
                 try { await interaction.editReply({ content: 'This login request is invalid or has expired.', components: [] }); } catch {}
                 return;
             }

             // --- Process Approve Action ---
             if (action === 'approve-login') {
                 try {
                      // 1. Generate One-Time Token (OTT)
                      const oneTimeToken = crypto.randomBytes(32).toString('hex'); // Secure random token
                      const ottExpiry = new Date(Date.now() + 60 * 1000); // OTT valid for 60 seconds

                      // 2. Update DB Record with OTT and Status
                      loginRequest.status = 'approved';
                      loginRequest.ott = oneTimeToken;
                      loginRequest.ottExpiresAt = ottExpiry;
                      await loginRequest.save();
                      console.log(`[Interaction] Login request ${loginRequestId} approved. OTT generated.`);

                      // 3. Notify the website via WebSocket WITH THE OTT
                      notifyWebClient(loginRequestId, 'loginApproved', {
                          ott: oneTimeToken // Send the OTT to the client
                      });

                      // 4. Update the button message in Discord
                      await interaction.editReply({ content: `✅ Login approved for Roblox account \`${loginRequest.robloxUsername}\`! Please return to the website window to complete login.`, components: [] });

                 } catch(approvalError) {
                       console.error(`Error processing login approval for ${loginRequestId}:`, approvalError);
                        try { await interaction.editReply({ content: 'Error approving login. Please try logging in again.', components: [] }); } catch {}
                 }

             // --- Process Deny Action ---
             } else if (action === 'deny-login') {
                 try {
                     loginRequest.status = 'denied';
                     // Optionally delete immediately instead of just marking denied
                     // await WebLoginRequest.deleteOne({ _id: loginRequest._id });
                     await loginRequest.save();
                     console.log(`[Interaction] Login request ${loginRequestId} denied by ${interaction.user.tag}.`);

                     // Notify the website
                     notifyWebClient(loginRequestId, 'loginDenied', { message: 'Login request denied via Discord.' });

                     // Update the button message in Discord
                     await interaction.editReply({ content: '❌ Login request denied.', components: [] });

                 } catch(denialError) {
                       console.error(`Error processing login denial for ${loginRequestId}:`, denialError);
                        try { await interaction.editReply({ content: 'Error processing denial.', components: [] }); } catch {}
                 }
             }
        } // End if login button
        // Handle other buttons if needed...
        return;
    } // End Button Handling

    // --- Slash Command Handler ---
     if (interaction.isChatInputCommand()) {
         const command = interaction.client.commands.get(interaction.commandName);
         if (!command) {
             console.error(`No command matching ${interaction.commandName} was found.`);
             try { await interaction.reply({ content: `Command /${interaction.commandName} not found.`, ephemeral: true }); } catch {}
             return;
         }

         console.log(`[Interaction] Executing /${interaction.commandName} for user ${interaction.user.tag} (${interaction.user.id})`);
         try {
             await command.execute(interaction);
         } catch (error) {
             console.error(`❌ Error executing /${interaction.commandName}:`, error);
             try {
                 const errorMessage = 'There was an error while executing this command!';
                 if (interaction.replied || interaction.deferred) {
                     await interaction.followUp({ content: errorMessage, ephemeral: true });
                 } else {
                     // Use flags for ephemeral error reply
                     await interaction.reply({ content: errorMessage, flags: InteractionResponseFlags.Ephemeral });
                 }
             } catch (replyError) {
                  console.error(`Failed to send error fallback reply for /${interaction.commandName}:`, replyError);
             }
         }
         return; // Stop processing after command handled
     } // End Slash Command Handling

     // Handle other interaction types (modals, select menus) if needed
 });


// --- Bot Ready Handler ---
client.once('ready', async readyClient => {
    console.log(`✅ Discord Bot Ready! Logged in as ${readyClient.user.tag}`);
    readyClient.user.setActivity('Qantas Virtual Operations', { type: 'WATCHING' });

    // Pass client to internal API module (for controllers to trigger bot actions)
    botInternalApi.setClient(readyClient);

    // Start the Notification Scheduler
    console.log('[Bot] Starting background scheduler...');
    try {
        startScheduler(readyClient);
        console.log('✅ Background scheduler started.');
    } catch(schedulerError) {
        console.error("❌ Failed to start scheduler:", schedulerError);
    }

    // Start the API Server AFTER bot is ready, passing the client
    console.log('[Bot] Initializing API server...');
    let httpServer;
    try {
        // setupServer now returns the http server instance
        const serverInfo = setupServer(readyClient);
        httpServer = serverInfo.httpServer; // Get the created http server (not listening yet)
        console.log('✅ API server setup function completed.');
    } catch (serverError) {
         console.error("❌ FATAL: Failed to setup API server:", serverError);
         process.exit(1); // Exit if server setup fails critically
    }

    // --- Setup WebSocket Server AFTER HTTP server is created ---
    if (!httpServer) {
         console.error("❌ FATAL: HTTP Server instance not available for WebSocket setup.");
         process.exit(1);
    }
    console.log('[WebSocket] Setting up WebSocket server...');
    try {
        const wss = new WebSocket.Server({ server: httpServer }); // Attach WS to HTTP server

        wss.on('connection', (ws, req) => {
            const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress; // Get IP for logging (consider proxy)
            console.log(`[WebSocket] Client connected from ${clientIp}`);

            ws.on('message', (message) => {
                try {
                    const parsedMessage = JSON.parse(message);
                    console.log('[WebSocket] Received:', parsedMessage);

                    // Handle client registration message
                    if (parsedMessage.type === 'register' && parsedMessage.loginRequestId) {
                        const loginRequestId = parsedMessage.loginRequestId;
                        // Check if this ID is actually pending? Optional extra security.
                        console.log(`[WebSocket] Registering connection for login request: ${loginRequestId}`);
                        pendingLoginSockets.set(loginRequestId, ws);
                        ws.loginRequestId = loginRequestId; // Store on socket for cleanup
                        ws.send(JSON.stringify({ type: 'registered', success: true }));
                    } else {
                        console.warn("[WebSocket] Received unknown message type or format:", parsedMessage);
                    }
                } catch (e) { console.error('[WebSocket] Failed message parse:', message.toString(), e); } // Log raw message if parse fails
            });

            ws.on('close', (code, reason) => {
                const reasonString = reason ? reason.toString() : 'N/A';
                console.log(`[WebSocket] Client disconnected. Code: ${code}, Reason: ${reasonString}`);
                if (ws.loginRequestId) {
                    pendingLoginSockets.delete(ws.loginRequestId);
                    console.log(`[WebSocket] Removed connection for login request: ${ws.loginRequestId}`);
                }
            });

            ws.on('error', (error) => {
                 console.error('[WebSocket] Connection error:', error);
                 if (ws.loginRequestId) { pendingLoginSockets.delete(ws.loginRequestId); }
                 try { ws.close(); } catch {} // Attempt to close on error
            });
        }); // End wss.on('connection')

        wss.on('error', (serverError) => {
            console.error("❌ WebSocket Server Error:", serverError);
        });

        console.log('✅ WebSocket server setup complete.');

        // --- NOW Start Listening for HTTP/WebSocket connections ---
        httpServer.listen(config.port, '0.0.0.0', () => { // Listen on all IPv4 interfaces
             console.log(`✅ API Server & WebSocket Server listening on http://localhost:${config.port} (bound to 0.0.0.0) in ${config.nodeEnv} mode.`);
        });
        httpServer.on('error', (error) => { // Handle listen errors like EADDRINUSE
            if (error.syscall !== 'listen') { throw error; }
            switch (error.code) {
                case 'EACCES':
                    console.error(`❌ FATAL: Port ${config.port} requires elevated privileges.`);
                    process.exit(1);
                    break;
                case 'EADDRINUSE':
                    console.error(`❌ FATAL: Port ${config.port} is already in use. Stop the other process.`);
                    process.exit(1);
                    break;
                default:
                    console.error(`❌ FATAL: Failed to start HTTP server:`, error);
                    process.exit(1);
            }
        });
        // --- End Listening ---

    } catch (wsError) {
        console.error("❌ Failed to setup WebSocket server:", wsError);
    }

}); // End client.once('ready')


// --- Log in to Discord ---
console.log("[Bot] Attempting to log into Discord...");
client.login(config.discordToken).catch(err => {
    console.error("❌ FATAL: Failed to login to Discord:", err.message);
    // Common issue: Invalid token, Missing intents
    if(err.code === 'TokenInvalid') {
        console.error("Check that DISCORD_BOT_TOKEN in your .env file is correct.");
    } else if (err.message?.includes('Privileged intent')) {
         console.error("Check that you have enabled necessary Privileged Gateway Intents (like GuildMembers) in your Bot Application settings on the Discord Developer Portal.");
    }
    process.exit(1); // Exit if login fails
});

// Optional: Handle process exit more gracefully
process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection:', error);
});
process.on('uncaughtException', error => {
	console.error('Uncaught exception:', error);
    // Optional: Attempt graceful shutdown? Risky in uncaught exception state.
	// process.exit(1); // Exit on uncaught exception
});