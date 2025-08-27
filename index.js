import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

// Telegram bot inicializálása
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const ADMIN_ID = process.env.ADMIN_ID;

// Bot beállítások (dinamikusan változtathatók)
let postEnabled = true;
let minBurnedSol = 0.01;
let maxBurnedSol = 100;
let minMcap = 0;
let maxMcap = Infinity;

// Admin parancsok kezelése privátban
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // Csak admin férhet hozzá
  if (chatId.toString() !== ADMIN_ID) return;

  if (text === "/status") {
    return bot.sendMessage(chatId, `📊 *Bot státusz*:
- Posztolás: ${postEnabled ? "✅ BE" : "⛔ KI"}
- Minimum égetett SOL: ${minBurnedSol}
- Maximum égetett SOL: ${maxBurnedSol}
- Minimum MCAP: ${minMcap}
- Maximum MCAP: ${maxMcap}`, { parse_mode: "Markdown" });
  }

  if (text.startsWith("/post")) {
    const [, mode] = text.split(" ");
    postEnabled = mode === "on";
    return bot.sendMessage(chatId, `📢 Posztolás: ${postEnabled ? "✅ BE" : "⛔ KI"}`);
  }

  if (text.startsWith("/minsol")) {
    minBurnedSol = parseFloat(text.split(" ")[1]) || 0;
    return bot.sendMessage(chatId, `🔹 Minimum égetett SOL beállítva: ${minBurnedSol}`);
  }

  if (text.startsWith("/maxsol")) {
    maxBurnedSol = parseFloat(text.split(" ")[1]) || Infinity;
    return bot.sendMessage(chatId, `🔹 Maximum égetett SOL beállítva: ${maxBurnedSol}`);
  }

  if (text.startsWith("/mincap")) {
    minMcap = parseFloat(text.split(" ")[1]) || 0;
    return bot.sendMessage(chatId, `💎 Minimum MCAP beállítva: ${minMcap}`);
  }

  if (text.startsWith("/maxcap")) {
    maxMcap = parseFloat(text.split(" ")[1]) || Infinity;
    return bot.sendMessage(chatId, `💎 Maximum MCAP beállítva: ${maxMcap}`);
  }
});

// Webhook végpont a Helius számára
app.post("/webhook", async (req, res) => {
  try {
    const events = req.body;

    if (!events || events.length === 0) {
      return res.status(200).send("Nincs adat");
    }

    for (const event of events) {
      const accountData = event.accountData || {};
      const tx = event.signature || "Ismeretlen tranzakció";
      const burnedSol = parseFloat(accountData.amount || 0) / 1e9 || 0;
      const marketCap = accountData.marketCap || null;

      // Csak akkor posztolunk, ha a szűrőknek megfelel
      if (
        postEnabled &&
        burnedSol >= minBurnedSol &&
        burnedSol <= maxBurnedSol &&
        (!marketCap || (marketCap >= minMcap && marketCap <= maxMcap))
      ) {
        const message = `
🔥 *100% LP ELÉGETVE!* 🔥

💰 Token: ${accountData.token || "UNKNOWN"}
🔑 Mint: ${accountData.mint || "Ismeretlen"}
🔥 Égetett tokens: ${accountData.tokenAmount || "?"}
💎 SOL égetve: ${burnedSol} SOL
📊 Market Cap: ${marketCap ? `$${marketCap}` : "N/A"}
📅 Időpont: ${event.timestamp || "Ismeretlen"}

🔗 Tranzakció: [Solscan](https://solscan.io/tx/${tx})

🚀 Biztonságos memecoin lehet!
⚠️ DYOR: Mindig végezz saját kutatást!
        `;

        await bot.sendMessage(process.env.TELEGRAM_CHANNEL_ID, message, {
          parse_mode: "Markdown",
          disable_web_page_preview: false,
        });
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook feldolgozási hiba:", err);
    return res.status(500).send("Hiba");
  }
});

// Szerver indítása
app.listen(PORT, () => {
  console.log(`🚀 SLBB fut a ${PORT} porton - Webhook aktív: /webhook`);
});
