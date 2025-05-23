import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import { loadCommands } from "./commands/index.js";
import { data as embedData } from "./commands/embed.js";
import { data as menuData, restoreMenu, handleButton } from "./commands/menu.js";

// Carregar configurações do bot
let config = {};
if (fs.existsSync("./config.json")) {
  config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
} else {
  console.error("Arquivo config.json não encontrado. Crie um arquivo com seu token e clientId.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Carregar comandos
const commandsMap = await loadCommands();
console.log("Comandos carregados:", Array.from(commandsMap.keys()));

const embedCommand = embedData;
const menuCommand = menuData;

const commands = [embedCommand.toJSON(), menuCommand.toJSON()];

const rest = new REST({ version: "10" }).setToken(config.token);

(async () => {
  try {
    console.log("Registrando comandos de barra...");
    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands }
    );
    console.log("Comandos registrados com sucesso!");
  } catch (error) {
    console.error(error);
  }
})();

client.on("ready", async () => {
  console.log(`Bot logado como ${client.user.tag}`);
  client.user.setPresence({ activities: [{ name: "Online!" }], status: "online" });
  // Restaura o menu interativo após reconexão
  await restoreMenu(client);
});

// Monitoramento de conexão e reconexão
let reconnecting = false;
setInterval(() => {
  if (client.ws.status !== 0) { // 0 = READY
    if (!reconnecting) {
      reconnecting = true;
      console.log("Tentando reconectar ao Discord...");
      if (client.user) {
        client.user.setPresence({ activities: [{ name: "Reconectando..." }], status: "dnd" });
      }
    }
  } else {
    if (reconnecting) {
      reconnecting = false;
      if (client.user) {
        client.user.setPresence({ activities: [{ name: "Online!" }], status: "online" });
      }
      console.log("Reconectado ao Discord!");
    }
  }
}, 10000); // verifica a cada 10 segundos

client.on("shardDisconnect", (event, id) => {
  console.warn(`Shard ${id} desconectada. Código: ${event.code}`);
  if (client.user) {
    client.user.setPresence({ activities: [{ name: "Reconectando..." }], status: "dnd" });
  }
});

client.on("shardReconnecting", (id) => {
  console.warn(`Shard ${id} tentando reconectar...`);
  if (client.user) {
    client.user.setPresence({ activities: [{ name: "Reconectando..." }], status: "dnd" });
  }
});

client.on("shardResume", (id) => {
  console.log(`Shard ${id} reconectada!`);
  if (client.user) {
    client.user.setPresence({ activities: [{ name: "Online!" }], status: "online" });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    await handleButton(interaction);
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const command = commandsMap.get(interaction.commandName);
  console.log("Recebido comando:", interaction.commandName, "Encontrado:", !!command);
  if (!command) {
    await interaction.reply({ content: `Comando '${interaction.commandName}' não encontrado.`, ephemeral: true });
    return;
  }
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Erro ao executar o comando /${interaction.commandName}:`, err);
    if (!interaction.replied) {
      await interaction.reply({ content: "Ocorreu um erro ao processar o comando.", ephemeral: true });
    }
  }
});

client.login(config.token);