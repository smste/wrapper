// bot/deploy-commands.js
const { REST, Routes } = require('discord.js');
const config = require('../config'); // Adjust path as needed
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
// Grab all the command files from the commands directory you created earlier
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
             console.log(`Loaded command: ${command.data.name}`);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

// Construct and prepare an instance of the REST module
if (!config.discordToken || !config.discordClientId || !config.discordGuildId) {
    console.error("Missing Discord environment variables (TOKEN, CLIENT_ID, GUILD_ID) required for command deployment.");
    process.exit(1);
}

const rest = new REST().setToken(config.discordToken);

// and deploy your commands!
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands in the guild with the current set
        const data = await rest.put(
            Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands for guild ${config.discordGuildId}.`);
    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
})();