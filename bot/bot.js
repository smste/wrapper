// bot/bot.js (Main Entry Point)
require('dotenv').config(); // Load .env variables FIRST

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js'); // Remove InteractionResponseFlags if not used here
const config = require('../config'); // Adjust path
const { startScheduler } = require('../scheduler'); // Adjust path
const setupServer = require('../server'); // Adjust path - Import server setup function

// Check for token early
if (!config.discordToken) {
    console.error("FATAL: DISCORD_BOT_TOKEN is missing in environment variables.");
    process.exit(1); // Exit if token is missing
}

// Define Intents needed by bot + scheduler + verification DMs
const client = new Client({
     intents: [
         GatewayIntentBits.Guilds,
         GatewayIntentBits.GuildMembers, // Needed potentially by scheduler/verification lookup
         GatewayIntentBits.DirectMessages // Needed to send DMs
         // Add other intents your bot needs
     ]
 });

// Load commands
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
            } else {
                console.log(`[WARNING] Command at ${filePath} missing "data" or "execute".`);
            }
        } catch(err) {
             console.error(`Error loading command at ${file}:`, err);
        }
    }
}


// Interaction handler
client.on('interactionCreate', async interaction => {
     if (!interaction.isChatInputCommand()) return;
     const command = interaction.client.commands.get(interaction.commandName);
     if (!command) {
         console.error(`No command matching ${interaction.commandName} was found.`);
         // Avoid replying here if interaction might fail later
         return;
     }
     try {
         await command.execute(interaction);
     } catch (error) {
         console.error(`Error executing ${interaction.commandName}:`, error);
         // Graceful fallback reply if possible
         try {
             if (interaction.replied || interaction.deferred) {
                 await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
             } else {
                 // Use flags for ephemeral
                 await interaction.reply({ content: 'There was an error while executing this command!', flags: InteractionResponseFlags.Ephemeral });
             }
         } catch (replyError) {
              console.error('Failed to send error fallback reply:', replyError);
         }
     }
 });

// Once Ready - Start scheduler and API server
client.once('ready', async readyClient => {
    console.log(`Discord Bot Ready! Logged in as ${readyClient.user.tag}`);
    readyClient.user.setActivity('Qantas Virtual Flights', { type: 'WATCHING' }); // Example

    // Start the Notification Scheduler
    try {
        startScheduler(readyClient);
    } catch(schedulerError) {
        console.error("Failed to start scheduler:", schedulerError);
    }


    // Start the API Server AFTER bot is ready, passing the client
    console.log('Initializing API server...');
    try {
        setupServer(readyClient); // Pass the client instance
        console.log('API server setup initiated.');
    } catch (serverError) {
         console.error("FATAL: Failed to setup API server:", serverError);
    }
});

// Log in to Discord
console.log("Logging into Discord...");
client.login(config.discordToken).catch(err => {
    console.error("Failed to login to Discord:", err);
    process.exit(1);
});