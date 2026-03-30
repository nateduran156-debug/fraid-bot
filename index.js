const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const PREFIX = ".";

// ===== WHITELIST =====
const DEFAULT_WHITELIST = ["1456824205545967713"];

const whitelist = new Set(
  process.env.WHITELIST_USERS
    ? process.env.WHITELIST_USERS.split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : DEFAULT_WHITELIST,
);

function isWhitelisted(userId) {
  return whitelist.has(userId);
}

// ===== CONFIG =====
const MUTED_ROLE_ID = process.env.MUTED_ROLE_ID || "1485860847929524225";
const SAFE_GROUP_ID = 489845165;

// ===== ROBLOX HELPER =====
async function getRobloxGroups(username) {
  const userRes = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });
  const userData = await userRes.json();
  if (!userData.data || userData.data.length === 0) return null;
  const userId = userData.data[0].id;
  const displayName = userData.data[0].displayName || username;
  const groupRes = await fetch(
    `https://groups.roblox.com/v2/users/${userId}/groups/roles`,
  );
  const groupData = await groupRes.json();
  const groups = groupData.data || [];
  return { userId, displayName, groups };
}

const PAGE_SIZE = 10;

function buildGroupPage(groups, page, displayName, userId, requesterTag) {
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  page = Math.min(Math.max(0, page), totalPages - 1);

  let totalFlagged = 0;
  const allLines = groups.map((g, i) => {
    const isSafe = g.group.id === SAFE_GROUP_ID;
    if (!isSafe) totalFlagged++;
    const flag = isSafe ? "✅" : "🚩";
    return `${flag} ${i + 1}. **${g.group.name}** — ${g.role.name}`;
  });

  const pageLines = allLines.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const description =
    groups.length === 0
      ? "This user is not in any groups."
      : pageLines.join("\n");

  const embed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle(`${displayName}'s Roblox Groups`)
    .setDescription(description)
    .setURL(`https://www.roblox.com/users/${userId}/profile`)
    .setFooter({
      text: `Page ${page + 1}/${totalPages} • ${groups.length} group(s) • ${totalFlagged} flagged 🚩 • Requested by ${requesterTag}`,
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`group_prev_${page}`)
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`group_next_${page}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );

  return { embed, row, page, totalPages };
}

// In-memory cache for paginated group results (messageId -> { groups, displayName, userId, requesterTag })
const groupPaginationCache = new Map();

// ===== BLACKTEA GAME =====
const LETTER_SEQUENCES = [
  "ing",
  "tion",
  "str",
  "ent",
  "ion",
  "ter",
  "con",
  "pro",
  "pre",
  "com",
  "ack",
  "ame",
  "air",
  "ant",
  "are",
  "ate",
  "ear",
  "eat",
  "end",
  "est",
  "igh",
  "ike",
  "ile",
  "ill",
  "ine",
  "int",
  "ire",
  "ite",
  "ive",
  "old",
  "one",
  "ong",
  "ool",
  "ore",
  "ose",
  "ost",
  "out",
  "ove",
  "own",
  "ple",
  "que",
  "ran",
  "ree",
  "ren",
  "rin",
  "rit",
  "ron",
  "rum",
  "run",
  "san",
  "scr",
  "sea",
  "sen",
  "set",
  "sho",
  "sli",
  "slo",
  "smo",
  "sna",
  "sol",
  "son",
  "sou",
  "spe",
  "spi",
  "spl",
  "spr",
  "sta",
  "ste",
  "sti",
  "sto",
  "stu",
  "sub",
  "sun",
  "sup",
  "sur",
  "swi",
  "tab",
  "tal",
  "tam",
  "tan",
  "tap",
  "tar",
  "ten",
  "the",
  "thr",
  "tim",
  "tin",
  "tip",
  "tis",
  "ton",
  "top",
  "tor",
  "tot",
  "tow",
  "tra",
  "tri",
  "tro",
  "tru",
  "tub",
  "tun",
  "tur",
  "ult",
  "unc",
  "und",
  "uni",
  "unk",
  "unt",
  "urn",
  "val",
  "van",
  "var",
  "ven",
  "ver",
  "vil",
  "vis",
  "vit",
  "vol",
  "war",
  "wat",
  "wen",
  "wer",
  "whe",
  "whi",
  "who",
  "wil",
  "win",
  "wit",
  "wor",
  "wri",
  "ach",
  "act",
  "add",
  "age",
  "ago",
  "aid",
  "aim",
  "all",
  "alm",
  "als",
  "alt",
  "alw",
  "amb",
  "amp",
  "ana",
  "and",
  "ang",
  "ani",
  "ann",
  "app",
  "apr",
  "arc",
  "arg",
  "arm",
  "arr",
  "art",
  "ask",
  "asp",
  "ass",
  "att",
  "aud",
  "aug",
  "aus",
  "aut",
  "awa",
  "awe",
  "axi",
  "ban",
  "bar",
  "bas",
  "bat",
  "bay",
  "bea",
  "bed",
  "beg",
  "bel",
  "ben",
  "bes",
  "bet",
  "big",
  "bit",
  "bla",
  "ble",
  "bli",
  "blo",
  "blu",
  "boi",
  "bol",
  "bon",
  "boo",
  "bor",
  "bot",
  "bou",
  "bow",
  "boy",
  "bra",
  "bre",
  "bri",
  "bro",
  "bru",
  "bub",
  "bud",
  "bug",
  "bul",
  "bun",
  "bus",
  "but",
  "buy",
  "cab",
  "cal",
  "cam",
  "can",
  "cap",
  "car",
  "cas",
  "cat",
  "cau",
  "cel",
  "cen",
  "cha",
  "che",
  "chi",
  "cho",
  "chu",
  "cit",
  "cla",
  "cle",
  "cli",
  "clo",
  "clu",
  "coa",
  "cob",
  "cod",
  "col",
  "cop",
  "cor",
  "cos",
  "cot",
  "cou",
  "cov",
  "cow",
  "cra",
  "cre",
  "cri",
  "cro",
  "cry",
  "cup",
  "cur",
  "cut",
  "dab",
  "dam",
  "dan",
  "dar",
  "das",
  "dat",
  "dau",
  "dea",
  "deb",
  "dec",
  "def",
  "deg",
  "del",
  "dem",
  "dep",
  "der",
  "des",
  "det",
  "dev",
  "dew",
  "dif",
  "dig",
  "dip",
  "dir",
  "dis",
  "dit",
  "div",
  "doc",
  "dog",
  "dom",
  "dor",
  "dot",
  "dou",
  "dra",
  "dre",
  "dri",
  "dro",
  "dru",
  "dry",
  "dub",
  "duc",
  "dug",
  "dul",
  "dum",
  "dun",
  "dur",
  "ear",
  "eas",
  "eco",
  "edg",
  "edu",
  "egg",
  "ela",
  "ele",
  "elf",
  "elk",
  "ell",
  "elm",
  "els",
  "ema",
  "emb",
  "emp",
  "enc",
  "eng",
  "ens",
  "env",
  "epi",
  "equ",
  "era",
  "eve",
  "exc",
  "exe",
  "exp",
  "ext",
  "fab",
  "fac",
  "fad",
  "fal",
  "fam",
  "fas",
  "fat",
  "fee",
  "fel",
  "fem",
  "fen",
  "fer",
  "fes",
  "few",
  "fib",
  "fig",
  "fil",
  "fin",
  "fis",
  "fit",
  "fla",
  "fle",
  "fli",
  "flo",
  "flu",
  "fly",
  "foc",
  "fog",
  "fol",
  "foo",
  "for",
  "fou",
  "fra",
  "fre",
  "fri",
  "fro",
  "fru",
  "fur",
  "gab",
  "gal",
  "gap",
  "gar",
  "gas",
  "gat",
  "gen",
  "ger",
  "get",
  "gig",
  "gir",
  "giv",
  "gla",
  "gle",
  "gli",
  "glo",
  "glu",
  "god",
  "gol",
  "gor",
  "gov",
  "gra",
  "gre",
  "gri",
  "gro",
  "gru",
  "gue",
  "gui",
  "gum",
  "gut",
  "gym",
  "hag",
  "hal",
  "ham",
  "han",
  "har",
  "has",
  "hat",
  "hav",
  "haz",
  "hea",
  "hel",
  "hem",
  "her",
  "hig",
  "him",
  "hit",
  "hob",
  "hol",
  "hom",
  "hon",
  "hop",
  "hor",
  "hot",
  "how",
  "hug",
  "hum",
  "hun",
  "hur",
  "hut",
];

const games = new Map();

function randomSequence() {
  return LETTER_SEQUENCES[Math.floor(Math.random() * LETTER_SEQUENCES.length)];
}

async function isValidWord(word, seq) {
  if (!word.toLowerCase().includes(seq.toLowerCase())) return false;
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
    );
    return res.ok;
  } catch {
    return word.toLowerCase().includes(seq.toLowerCase());
  }
}

function hpBar(hp, max = 3) {
  return "❤️".repeat(hp) + "🖤".repeat(max - hp);
}

async function startRound(channel, game) {
  if (game.phase !== "playing") return;

  const alive = [...game.players.entries()].filter(([, p]) => p.hp > 0);
  if (alive.length <= 1) {
    return endGame(channel, game);
  }

  game.letters = randomSequence();
  game.roundResponded = new Set();
  game.roundCorrect = new Set();

  const playerList = alive
    .map(([, p]) => `${p.name} ${hpBar(p.hp)}`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor("#e8b84b")
    .setTitle(
      `🍵 Black Tea — Type a word containing: \`${game.letters.toUpperCase()}\``,
    )
    .setDescription(`**Players:**\n${playerList}`)
    .setFooter({ text: "You have 12 seconds!" });

  const msg = await channel.send({ embeds: [embed] });
  game.currentMessage = msg;

  game.roundTimer = setTimeout(() => resolveRound(channel, game), 12000);
}

async function resolveRound(channel, game) {
  if (game.phase !== "playing") return;
  clearTimeout(game.roundTimer);

  const alive = [...game.players.entries()].filter(([, p]) => p.hp > 0);
  const penalties = [];

  for (const [id, player] of alive) {
    if (!game.roundCorrect.has(id)) {
      player.hp--;
      penalties.push(`💀 **${player.name}** lost a HP! ${hpBar(player.hp)}`);
    }
  }

  const stillAlive = [...game.players.entries()].filter(([, p]) => p.hp > 0);

  if (penalties.length > 0) {
    await channel.send(penalties.join("\n"));
  }

  if (stillAlive.length <= 1) {
    return endGame(channel, game);
  }

  await new Promise((r) => setTimeout(r, 2000));
  startRound(channel, game);
}

async function endGame(channel, game) {
  game.phase = "ended";
  games.delete(channel.id);

  const alive = [...game.players.entries()].filter(([, p]) => p.hp > 0);
  const winner = alive.length === 1 ? alive[0][1].name : null;

  const embed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("🍵 Black Tea — Game Over!")
    .setDescription(winner ? `🏆 **${winner}** wins!` : "No survivors!")
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

// ===== SNIPE STORE =====
const snipeStore = new Map(); // channelId -> { content, author, timestamp, attachmentURL }

client.on("messageDelete", (message) => {
  if (!message.author || message.author.bot) return;
  if (!message.content && message.attachments.size === 0) return;
  snipeStore.set(message.channel.id, {
    content: message.content || null,
    author: message.author.tag,
    authorAvatar: message.author.displayAvatarURL({ dynamic: true }),
    timestamp: message.createdAt,
    attachmentURL: message.attachments.first()?.url || null,
  });
});

// ===== FUN HELPERS =====
const EIGHTBALL = [
  "It is certain.",
  "It is decidedly so.",
  "Without a doubt.",
  "Yes, definitely.",
  "You may rely on it.",
  "As I see it, yes.",
  "Most likely.",
  "Outlook good.",
  "Yes.",
  "Signs point to yes.",
  "Reply hazy, try again.",
  "Ask again later.",
  "Better not tell you now.",
  "Cannot predict now.",
  "Concentrate and ask again.",
  "Don't count on it.",
  "My reply is no.",
  "My sources say no.",
  "Outlook not so good.",
  "Very doubtful.",
];

// ===== SLASH COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName("hb").setDescription("Show all commands"),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to ban").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason").setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to mute").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("to")
    .setDescription("Timeout a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("User").setRequired(true),
    )
    .addIntegerOption((o) =>
      o.setName("minutes").setDescription("Minutes").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("group")
    .setDescription("Look up Roblox groups for a user")
    .addStringOption((o) =>
      o.setName("username").setDescription("Roblox username").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Manage whitelist")
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add user")
        .addUserOption((u) =>
          u.setName("user").setDescription("User").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove user")
        .addUserOption((u) =>
          u.setName("user").setDescription("User").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("List whitelisted users"),
    ),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8ball")
    .addStringOption((o) =>
      o.setName("question").setDescription("Your question").setRequired(true),
    ),

  new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin"),

  new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Roll a dice")
    .addIntegerOption((o) =>
      o
        .setName("sides")
        .setDescription("Number of sides (default 6)")
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Rock Paper Scissors")
    .addStringOption((o) =>
      o
        .setName("choice")
        .setDescription("rock, paper, or scissors")
        .setRequired(true)
        .addChoices(
          { name: "Rock", value: "rock" },
          { name: "Paper", value: "paper" },
          { name: "Scissors", value: "scissors" },
        ),
    ),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show a user's avatar")
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription("User (defaults to you)")
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("List all available commands"),

  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Bot and server information"),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Bulk delete messages")
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("reload")
    .setDescription("Re-register all slash commands"),

  new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("Show the last deleted message in this channel"),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands,
    });
    console.log("Slash commands registered");
  } catch (err) {
    console.error("Failed to register slash commands:", err);
  }
});

// ===== HELP TEXT =====
function helpText() {
  return [
    "**General**",
    "`.help` — show this menu",
    "`.info` — bot & server info",
    "`.reload` — re-register slash commands",
    "`.reboot` — reboot the bot",
    "",
    "**Moderation**",
    "`.ban @user [reason]` — ban a user",
    "`.mute @user` — mute a user",
    "`.to @user <minutes>` — timeout a user",
    "`.clear <amount>` — delete messages (1–100)",
    "",
    "**Roblox**",
    "`.group <username>` — list Roblox groups (🚩 = flagged, ✅ = safe)",
    "",
    "**Snipe**",
    "`.s` — show last deleted message",
    "`.cs` — clear sniped message",
    "",
    "**Fun**",
    "`.8ball <question>` — magic 8ball",
    "`.coinflip` — heads or tails",
    "`.dice [sides]` — roll a dice",
    "`.rps <rock/paper/scissors>` — rock paper scissors",
    "`.avatar [@user]` — show avatar",
    "`.blacktea` — start a Black Tea word game",
    "",
    "**Whitelist**",
    "`.whitelist add/remove/list`",
    "",
    "**Slash Commands**",
    "`/help` `/info` `/ban` `/mute` `/to` `/clear` `/reload`",
    "`/group` `/snipe` `/8ball` `/coinflip` `/dice` `/rps` `/avatar` `/whitelist`",
  ].join("\n");
}

// ===== RPS LOGIC =====
function playRPS(choice) {
  const options = ["rock", "paper", "scissors"];
  const bot = options[Math.floor(Math.random() * 3)];
  const beats = { rock: "scissors", scissors: "paper", paper: "rock" };
  let result;
  if (bot === choice) result = "It's a tie!";
  else if (beats[choice] === bot) result = "You win!";
  else result = "You lose!";
  return { bot, result };
}

// ===== SLASH HANDLER =====
client.on("interactionCreate", async (interaction) => {
  // ===== BUTTON HANDLER =====
  if (interaction.isButton()) {
    const { customId, message } = interaction;

    if (
      customId.startsWith("group_prev_") ||
      customId.startsWith("group_next_")
    ) {
      const cached = groupPaginationCache.get(message.id);
      if (!cached)
        return interaction.reply({
          content: "This menu has expired. Run the command again.",
          ephemeral: true,
        });

      const currentPage = parseInt(customId.split("_")[2]);
      const newPage = customId.startsWith("group_prev_")
        ? currentPage - 1
        : currentPage + 1;
      const { embed: groupEmbed, row } = buildGroupPage(
        cached.groups,
        newPage,
        cached.displayName,
        cached.userId,
        cached.requesterTag,
      );

      await interaction.update({ embeds: [groupEmbed], components: [row] });
      return;
    }
  }

  if (!interaction.isChatInputCommand()) return;
  if (!isWhitelisted(interaction.user.id)) {
    return interaction.reply({
      content: "You are not authorized to use this bot.",
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setFooter({ text: `Requested by ${interaction.user.tag}` })
    .setTimestamp();

  if (interaction.commandName === "hb") {
    embed.setTitle("Commands").setDescription(helpText());
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "ban") {
    const member = interaction.options.getMember("user");
    const reason =
      interaction.options.getString("reason") || "No reason provided";
    if (!member)
      return interaction.reply({ content: "User not found.", ephemeral: true });
    try {
      await member.ban({ reason });
      embed
        .setTitle("Banned")
        .setDescription(`${member.user.tag}\n**Reason:** ${reason}`);
      return interaction.reply({ embeds: [embed] });
    } catch (e) {
      return interaction.reply({
        content: `Failed: ${e.message}`,
        ephemeral: true,
      });
    }
  }

  if (interaction.commandName === "mute") {
    const member = interaction.options.getMember("user");
    if (!member)
      return interaction.reply({ content: "User not found.", ephemeral: true });
    try {
      await member.roles.add(MUTED_ROLE_ID);
      embed.setTitle("Muted").setDescription(member.user.tag);
      return interaction.reply({ embeds: [embed] });
    } catch (e) {
      return interaction.reply({
        content: `Failed: ${e.message}`,
        ephemeral: true,
      });
    }
  }

  if (interaction.commandName === "to") {
    const member = interaction.options.getMember("user");
    const minutes = interaction.options.getInteger("minutes");
    if (!member)
      return interaction.reply({ content: "User not found.", ephemeral: true });
    try {
      await member.timeout(minutes * 60000);
      embed
        .setTitle("Timed Out")
        .setDescription(`${member.user.tag} for **${minutes}m**`);
      return interaction.reply({ embeds: [embed] });
    } catch (e) {
      return interaction.reply({
        content: `Failed: ${e.message}`,
        ephemeral: true,
      });
    }
  }

  if (interaction.commandName === "group") {
    const username = interaction.options.getString("username");
    await interaction.deferReply();
    try {
      const result = await getRobloxGroups(username);
      if (!result)
        return interaction.editReply(`Roblox user **${username}** not found.`);
      const { displayName, groups, userId } = result;
      const { embed: groupEmbed, row } = buildGroupPage(
        groups,
        0,
        displayName,
        userId,
        interaction.user.tag,
      );
      const reply = await interaction.editReply({
        embeds: [groupEmbed],
        components: groups.length > PAGE_SIZE ? [row] : [],
      });
      if (groups.length > PAGE_SIZE) {
        groupPaginationCache.set(reply.id, {
          groups,
          displayName,
          userId,
          requesterTag: interaction.user.tag,
        });
        setTimeout(() => groupPaginationCache.delete(reply.id), 10 * 60 * 1000);
      }
    } catch (e) {
      return interaction.editReply(`Error: ${e.message}`);
    }
    return;
  }

  if (interaction.commandName === "whitelist") {
    const sub = interaction.options.getSubcommand();
    if (sub === "add") {
      const user = interaction.options.getUser("user");
      whitelist.add(user.id);
      embed.setTitle("Whitelist").setDescription(`Added ${user.tag}`);
      return interaction.reply({ embeds: [embed] });
    }
    if (sub === "remove") {
      const user = interaction.options.getUser("user");
      if (user.id === interaction.user.id)
        return interaction.reply({
          content: "Cannot remove yourself.",
          ephemeral: true,
        });
      whitelist.delete(user.id);
      embed.setTitle("Whitelist").setDescription(`Removed ${user.tag}`);
      return interaction.reply({ embeds: [embed] });
    }
    if (sub === "list") {
      const ids = [...whitelist];
      embed
        .setTitle("Whitelisted Users")
        .setDescription(
          ids.length ? ids.map((id) => `<@${id}> (${id})`).join("\n") : "None.",
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  if (interaction.commandName === "8ball") {
    const question = interaction.options.getString("question");
    const answer = EIGHTBALL[Math.floor(Math.random() * EIGHTBALL.length)];
    embed
      .setTitle("🎱 Magic 8-Ball")
      .setDescription(`**Q:** ${question}\n**A:** ${answer}`);
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "coinflip") {
    const result = Math.random() < 0.5 ? "Heads" : "Tails";
    embed.setTitle("🪙 Coin Flip").setDescription(`**${result}!**`);
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "dice") {
    const sides = interaction.options.getInteger("sides") || 6;
    if (sides < 2)
      return interaction.reply({
        content: "Dice must have at least 2 sides.",
        ephemeral: true,
      });
    const roll = Math.floor(Math.random() * sides) + 1;
    embed
      .setTitle("🎲 Dice Roll")
      .setDescription(`You rolled a **${roll}** on a d${sides}`);
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "rps") {
    const choice = interaction.options.getString("choice");
    const { bot, result } = playRPS(choice);
    const icons = { rock: "🪨", paper: "📄", scissors: "✂️" };
    embed
      .setTitle("✊ Rock Paper Scissors")
      .setDescription(
        `You: ${icons[choice]} **${choice}**\nBot: ${icons[bot]} **${bot}**\n\n**${result}**`,
      );
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "avatar") {
    const user = interaction.options.getUser("user") || interaction.user;
    const avatarURL = user.displayAvatarURL({ size: 512, dynamic: true });
    embed
      .setTitle(`${user.username}'s Avatar`)
      .setImage(avatarURL)
      .setURL(avatarURL);
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "help") {
    embed.setTitle("📖 Commands").setDescription(helpText());
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "info") {
    const guild = interaction.guild;
    const botUptime = process.uptime();
    const hours = Math.floor(botUptime / 3600);
    const minutes = Math.floor((botUptime % 3600) / 60);
    const seconds = Math.floor(botUptime % 60);
    embed
      .setTitle("ℹ️ Info")
      .addFields(
        {
          name: "🤖 Bot",
          value: `**Name:** ${client.user.tag}\n**Uptime:** ${hours}h ${minutes}m ${seconds}s\n**Servers:** ${client.guilds.cache.size}`,
          inline: true,
        },
        {
          name: "🏠 Server",
          value: `**Name:** ${guild?.name || "N/A"}\n**Members:** ${guild?.memberCount || "N/A"}\n**Created:** <t:${Math.floor((guild?.createdTimestamp || 0) / 1000)}:D>`,
          inline: true,
        },
      );
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "clear") {
    const amount = interaction.options.getInteger("amount");
    if (amount < 1 || amount > 100)
      return interaction.reply({
        content: "Amount must be between 1 and 100.",
        ephemeral: true,
      });
    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);
      embed
        .setTitle("🧹 Cleared")
        .setDescription(`Deleted **${deleted.size}** message(s).`);
      const reply = await interaction.reply({ embeds: [embed] });
      setTimeout(() => reply.delete().catch(() => {}), 4000);
    } catch (e) {
      return interaction.reply({
        content: `Failed: ${e.message}`,
        ephemeral: true,
      });
    }
    return;
  }

  if (interaction.commandName === "reload") {
    await interaction.deferReply({ ephemeral: true });
    try {
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: commands,
      });
      return interaction.editReply(
        "✅ Slash commands re-registered successfully.",
      );
    } catch (e) {
      return interaction.editReply(`❌ Failed: ${e.message}`);
    }
  }

  if (interaction.commandName === "snipe") {
    const sniped = snipeStore.get(interaction.channel.id);
    if (!sniped)
      return interaction.reply({
        content: "No deleted message to snipe in this channel.",
        ephemeral: true,
      });
    embed
      .setTitle("🔍 Sniped Message")
      .setDescription(sniped.content || "*[no text content]*")
      .setAuthor({ name: sniped.author, iconURL: sniped.authorAvatar })
      .setTimestamp(sniped.timestamp);
    if (sniped.attachmentURL) embed.setImage(sniped.attachmentURL);
    return interaction.reply({ embeds: [embed] });
  }
});

// ===== PREFIX HANDLER =====
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;

  // Black Tea — anyone in an active game can submit words mid-round
  if (message.guild) {
    const game = games.get(message.channel.id);
    if (
      game &&
      game.phase === "playing" &&
      game.players.has(message.author.id)
    ) {
      const word = message.content.trim().split(/\s+/)[0];
      if (
        word.toLowerCase().includes(game.letters.toLowerCase()) &&
        !game.roundCorrect.has(message.author.id)
      ) {
        const valid = await isValidWord(word, game.letters);
        if (valid) {
          game.roundCorrect.add(message.author.id);
          await message.react("✅");
          const allAlive = [...game.players.entries()].filter(
            ([, p]) => p.hp > 0,
          );
          const allResponded = allAlive.every(([id]) =>
            game.roundCorrect.has(id),
          );
          if (allResponded) {
            clearTimeout(game.roundTimer);
            await resolveRound(message.channel, game);
          }
          return;
        } else {
          await message.react("❌");
          return;
        }
      }
    }
  }

  if (!isWhitelisted(message.author.id)) {
    return message.reply("You are not authorized to use this bot.");
  }

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  const embed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setFooter({ text: `Requested by ${message.author.tag}` })
    .setTimestamp();

  // .hb / .help
  if (cmd === "hb" || cmd === "help") {
    embed.setTitle("📖 Commands").setDescription(helpText());
    return message.reply({ embeds: [embed] });
  }

  // .info
  if (cmd === "info") {
    const guild = message.guild;
    const botUptime = process.uptime();
    const hours = Math.floor(botUptime / 3600);
    const mins = Math.floor((botUptime % 3600) / 60);
    const secs = Math.floor(botUptime % 60);
    embed
      .setTitle("ℹ️ Info")
      .addFields(
        {
          name: "🤖 Bot",
          value: `**Name:** ${client.user.tag}\n**Uptime:** ${hours}h ${mins}m ${secs}s\n**Servers:** ${client.guilds.cache.size}`,
          inline: true,
        },
        {
          name: "🏠 Server",
          value: `**Name:** ${guild?.name || "N/A"}\n**Members:** ${guild?.memberCount || "N/A"}\n**Created:** <t:${Math.floor((guild?.createdTimestamp || 0) / 1000)}:D>`,
          inline: true,
        },
      );
    return message.reply({ embeds: [embed] });
  }

  // .clear / .purge
  if (cmd === "clear" || cmd === "purge") {
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100)
      return message.reply("Usage: `.clear <1-100>`");
    try {
      await message.delete().catch(() => {});
      const deleted = await message.channel.bulkDelete(amount, true);
      embed
        .setTitle("🧹 Cleared")
        .setDescription(`Deleted **${deleted.size}** message(s).`);
      const reply = await message.channel.send({ embeds: [embed] });
      setTimeout(() => reply.delete().catch(() => {}), 4000);
    } catch (e) {
      return message.reply(`Failed: ${e.message}`);
    }
    return;
  }

  // .reload
  if (cmd === "reload") {
    const msg = await message.reply("🔄 Re-registering slash commands...");
    try {
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: commands,
      });
      return msg.edit("✅ Slash commands re-registered successfully.");
    } catch (e) {
      return msg.edit(`❌ Failed: ${e.message}`);
    }
  }

  // .s (snipe)
  if (cmd === "s") {
    const sniped = snipeStore.get(message.channel.id);
    if (!sniped)
      return message.reply("No deleted message to snipe in this channel.");
    embed
      .setTitle("🔍 Sniped Message")
      .setDescription(sniped.content || "*[no text content]*")
      .setAuthor({ name: sniped.author, iconURL: sniped.authorAvatar })
      .setTimestamp(sniped.timestamp);
    if (sniped.attachmentURL) embed.setImage(sniped.attachmentURL);
    return message.reply({ embeds: [embed] });
  }

  // .cs (clear snipe)
  if (cmd === "cs") {
    snipeStore.delete(message.channel.id);
    embed.setTitle("🔍 Snipe").setDescription("Sniped message cleared.");
    return message.reply({ embeds: [embed] });
  }

  // .reboot
  if (cmd === "reboot") {
    await message.reply("🔄 Rebooting...");
    process.exit(0);
  }

  // .ban
  if (cmd === "ban") {
    const member = message.mentions.members.first();
    if (!member) return message.reply("Usage: `.ban @user [reason]`");
    const reason =
      args.filter((a) => !a.match(/^<@!?\d+>$/)).join(" ") ||
      "No reason provided";
    try {
      await member.ban({ reason });
      embed
        .setTitle("Banned")
        .setDescription(`${member.user.tag}\n**Reason:** ${reason}`);
      return message.reply({ embeds: [embed] });
    } catch (e) {
      return message.reply(`Failed: ${e.message}`);
    }
  }

  // .mute
  if (cmd === "mute") {
    const member = message.mentions.members.first();
    if (!member) return message.reply("Usage: `.mute @user`");
    try {
      await member.roles.add(MUTED_ROLE_ID);
      embed.setTitle("Muted").setDescription(member.user.tag);
      return message.reply({ embeds: [embed] });
    } catch (e) {
      return message.reply(`Failed: ${e.message}`);
    }
  }

  // .to
  if (cmd === "to") {
    const member = message.mentions.members.first();
    const minutes = parseInt(args.find((a) => !a.startsWith("<")));
    if (!member || isNaN(minutes))
      return message.reply("Usage: `.to @user <minutes>`");
    try {
      await member.timeout(minutes * 60000);
      embed
        .setTitle("Timed Out")
        .setDescription(`${member.user.tag} for **${minutes}m**`);
      return message.reply({ embeds: [embed] });
    } catch (e) {
      return message.reply(`Failed: ${e.message}`);
    }
  }

  // .group
  if (cmd === "group") {
    const username = args[0];
    if (!username) return message.reply("Usage: `.group <roblox username>`");
    const loading = await message.reply("Looking up Roblox groups...");
    try {
      const result = await getRobloxGroups(username);
      if (!result)
        return loading.edit(`Roblox user **${username}** not found.`);
      const { displayName, groups, userId } = result;
      const { embed: groupEmbed, row } = buildGroupPage(
        groups,
        0,
        displayName,
        userId,
        message.author.tag,
      );
      const sent = await loading.edit({
        content: "",
        embeds: [groupEmbed],
        components: groups.length > PAGE_SIZE ? [row] : [],
      });
      if (groups.length > PAGE_SIZE) {
        groupPaginationCache.set(sent.id, {
          groups,
          displayName,
          userId,
          requesterTag: message.author.tag,
        });
        setTimeout(() => groupPaginationCache.delete(sent.id), 10 * 60 * 1000);
      }
    } catch (e) {
      return loading.edit(`Error: ${e.message}`);
    }
    return;
  }

  // .whitelist
  if (cmd === "whitelist") {
    const sub = args[0]?.toLowerCase();
    if (sub === "add") {
      const user = message.mentions.users.first();
      if (!user) return message.reply("Usage: `.whitelist add @user`");
      whitelist.add(user.id);
      embed.setTitle("Whitelist").setDescription(`Added ${user.tag}`);
      return message.reply({ embeds: [embed] });
    }
    if (sub === "remove") {
      const user = message.mentions.users.first();
      if (!user) return message.reply("Usage: `.whitelist remove @user`");
      if (user.id === message.author.id)
        return message.reply("Cannot remove yourself.");
      whitelist.delete(user.id);
      embed.setTitle("Whitelist").setDescription(`Removed ${user.tag}`);
      return message.reply({ embeds: [embed] });
    }
    if (sub === "list") {
      const ids = [...whitelist];
      embed
        .setTitle("Whitelisted Users")
        .setDescription(
          ids.length ? ids.map((id) => `<@${id}> (${id})`).join("\n") : "None.",
        );
      return message.reply({ embeds: [embed] });
    }
    return message.reply("Usage: `.whitelist add/remove/list`");
  }

  // .8ball
  if (cmd === "8ball") {
    const question = args.join(" ");
    if (!question) return message.reply("Usage: `.8ball <question>`");
    const answer = EIGHTBALL[Math.floor(Math.random() * EIGHTBALL.length)];
    embed
      .setTitle("🎱 Magic 8-Ball")
      .setDescription(`**Q:** ${question}\n**A:** ${answer}`);
    return message.reply({ embeds: [embed] });
  }

  // .coinflip
  if (cmd === "coinflip") {
    embed
      .setTitle("🪙 Coin Flip")
      .setDescription(`**${Math.random() < 0.5 ? "Heads" : "Tails"}!**`);
    return message.reply({ embeds: [embed] });
  }

  // .dice
  if (cmd === "dice") {
    const sides = parseInt(args[0]) || 6;
    if (sides < 2) return message.reply("Dice must have at least 2 sides.");
    const roll = Math.floor(Math.random() * sides) + 1;
    embed
      .setTitle("🎲 Dice Roll")
      .setDescription(`You rolled a **${roll}** on a d${sides}`);
    return message.reply({ embeds: [embed] });
  }

  // .rps
  if (cmd === "rps") {
    const choice = args[0]?.toLowerCase();
    if (!["rock", "paper", "scissors"].includes(choice))
      return message.reply("Usage: `.rps <rock/paper/scissors>`");
    const { bot, result } = playRPS(choice);
    const icons = { rock: "🪨", paper: "📄", scissors: "✂️" };
    embed
      .setTitle("✊ Rock Paper Scissors")
      .setDescription(
        `You: ${icons[choice]} **${choice}**\nBot: ${icons[bot]} **${bot}**\n\n**${result}**`,
      );
    return message.reply({ embeds: [embed] });
  }

  // .avatar
  if (cmd === "avatar") {
    const user = message.mentions.users.first() || message.author;
    const avatarURL = user.displayAvatarURL({ size: 512, dynamic: true });
    embed
      .setTitle(`${user.username}'s Avatar`)
      .setImage(avatarURL)
      .setURL(avatarURL);
    return message.reply({ embeds: [embed] });
  }

  // .blacktea
  if (cmd === "blacktea") {
    if (games.has(message.channel.id)) {
      return message.reply(
        "A Black Tea game is already running in this channel!",
      );
    }

    const game = {
      phase: "joining",
      players: new Map(),
      letters: null,
      roundResponded: new Set(),
      roundCorrect: new Set(),
      roundTimer: null,
    };

    game.players.set(message.author.id, {
      hp: 3,
      name: message.author.username,
    });
    games.set(message.channel.id, game);

    const joinEmbed = new EmbedBuilder()
      .setColor("#e8b84b")
      .setTitle("🍵 Black Tea — Join the game!")
      .setDescription(
        `**${message.author.username}** started a game!\nType \`.join\` to join.\n\nGame starts in **30 seconds**.`,
      )
      .setFooter({ text: "Last player standing wins!" });

    await message.channel.send({ embeds: [joinEmbed] });

    game.joinTimer = setTimeout(async () => {
      if (game.players.size < 1) {
        games.delete(message.channel.id);
        return message.channel.send("Not enough players. Game cancelled.");
      }
      game.phase = "playing";
      const names = [...game.players.values()].map((p) => p.name).join(", ");
      const startEmbed = new EmbedBuilder()
        .setColor("#e8b84b")
        .setTitle("🍵 Black Tea — Game Starting!")
        .setDescription(
          `**Players:** ${names}\n\nEach player has ❤️❤️❤️ — fail to answer and lose a HP!`,
        );
      await message.channel.send({ embeds: [startEmbed] });
      await new Promise((r) => setTimeout(r, 2000));
      startRound(message.channel, game);
    }, 30000);

    return;
  }

  // .join (for blacktea)
  if (cmd === "join") {
    const game = games.get(message.channel.id);
    if (!game || game.phase !== "joining")
      return message.reply("No game is currently accepting players.");
    if (game.players.has(message.author.id))
      return message.reply("You are already in the game!");
    game.players.set(message.author.id, {
      hp: 3,
      name: message.author.username,
    });
    return message.reply(
      `✅ **${message.author.username}** joined the game! (${game.players.size} players)`,
    );
  }
});

client.login(process.env.TOKEN);
