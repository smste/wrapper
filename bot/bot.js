// bot/bot.js (Main Entry Point)
require('dotenv').config(); // Load .env variables FIRST

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, InteractionResponseFlags } = require('discord.js');
const config = require('../config'); // Adjust path if needed
const { startScheduler } = require('../scheduler'); // Adjust path if needed
const setupServer = require('../server'); // Adjust path - Import server setup function

// Check for token early
if (!config.discordToken) {
    console.error("❌ FATAL: DISCORD_BOT_TOKEN is missing in environment variables.");
    process.exit(1);
}

// Define Intents needed by bot + scheduler + verification DMs
const client = new Client({
     intents: [
         GatewayIntentBits.Guilds, // Needed for interactions, member checks etc.
         GatewayIntentBits.GuildMembers, // Needed to get member nicknames in link command
         GatewayIntentBits.DirectMessages // Needed to send DMs (like verification success)
         // Add GuildMessages if reading messages or using prefix commands
     ]
 });

// Load commands
console.log('[Bot] Loading commands...');
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    console.log(`[Bot] Loading commands from folder: ${folder}`);
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                console.log(`[Bot] Loaded command: /${command.data.name}`);
            } else {
                console.warn(`[WARNING] Command at ${filePath} missing "data" or "execute".`);
            }
        } catch(err) {
             console.error(`❌ Error loading command at ${filePath}:`, err);
        }
    }
}
console.log(`[Bot] Loaded ${client.commands.size} commands.`);

// Interaction handler
client.on('interactionCreate', async interaction => {
     if (!interaction.isChatInputCommand()) return; // Only handle slash commands

     const command = interaction.client.commands.get(interaction.commandName);

     if (!command) {
         console.error(`No command matching ${interaction.commandName} was found.`);
         // Try to reply if possible, otherwise ignore
         try {
              await interaction.reply({ content: `Command /${interaction.commandName} not found.`, ephemeral: true });
         } catch (e) {
              console.error('Failed to reply to unknown command interaction:', e);
         }
         return;
     }

     console.log(`[Interaction] Executing /${interaction.commandName} for user ${interaction.user.tag} (${interaction.user.id})`);
     try {
         await command.execute(interaction);
     } catch (error) {
         console.error(`❌ Error executing /${interaction.commandName}:`, error);
         // Graceful fallback reply if possible
         try {
             const errorMessage = 'There was an error while executing this command!';
             if (interaction.replied || interaction.deferred) {
                 await interaction.followUp({ content: errorMessage, ephemeral: true });
             } else {
                 // Use flags for ephemeral reply
                 await interaction.reply({ content: errorMessage, flags: InteractionResponseFlags.Ephemeral });
             }
         } catch (replyError) {
              console.error(`Failed to send error fallback reply for /${interaction.commandName}:`, replyError);
         }
     }
 });

// Once Ready - Start scheduler and API server
client.once('ready', async readyClient => { // Make async if needed
    console.log(`✅ Discord Bot Ready! Logged in as ${readyClient.user.tag}`);
    readyClient.user.setActivity('Qantas Virtual Operations', { type: 'WATCHING' }); // Example

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
    try {
        setupServer(readyClient); // Pass the client instance
        // setupServer returns the app/server, but we may not need them here
        console.log('✅ API server setup initiated.');
    } catch (serverError) {
         console.error("❌ FATAL: Failed to setup API server:", serverError);
         // Optional: Exit if API fails critically? Might want bot to stay online.
         // process.exit(1);
    }
});

// Log in to Discord
console.log("[Bot] Logging into Discord...");
client.login(config.discordToken).catch(err => {
    console.error("❌ FATAL: Failed to login to Discord:", err);
    process.exit(1); // Exit if login fails - critical error
});