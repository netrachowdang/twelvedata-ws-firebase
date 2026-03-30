import WebSocket from "ws";
import admin from "firebase-admin";
import fetch from "node-fetch"; // if using Node <18

// ===============================
// BOOT LOGS
// ===============================
console.log("🚀 Worker booting...");

console.log("ENV CHECK:", {
  TWELVE: !!process.env.TWELVE_DATA_KEY,
  DB: !!process.env.FIREBASE_DATABASE_URL,
  SA: !!process.env.FIREBASE_SERVICE_ACCOUNT,
});

// ===============================
// FIREBASE INIT
// ===============================
let serviceAccount;

try {
  serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf8")
  );
  console.log("✅ Firebase service account parsed");
} catch (err) {
  console.error("❌ Failed to parse Firebase service account", err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();
const API_KEY = process.env.TWELVE_DATA_KEY;

// ===============================
// TWELVEDATA WS (FOREX / GOLD)
// ===============================
function connectTwelveWS() {
  const WS_URL =
    "wss://ws.twelvedata.com/v1/quotes/price?apikey=" + API_KEY;

  console.log("🔌 Connecting TwelveData WS...");

  const ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    console.log("✅ TwelveData connected");

    ws.send(
      JSON.stringify({
        action: "subscribe",
        params: {
          symbols: "XAU/USD,EUR/USD,AAPL",
        },
      })
    );
  });

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (!data.symbol || !data.price) return;

      const symbol = data.symbol.replace("/", "");

      await db.ref(`prices/${symbol}`).set({
        symbol,
        name: symbol,
        price: Number(data.price),
        source: "twelvedata",
        timestamp: Date.now(),
      });

      console.log(`📊 [TD] ${symbol} → ${data.price}`);
    } catch (err) {
      console.error("❌ TwelveData parse error", err);
    }
  });

  ws.on("close", () => {
    console.warn("⚠️ TwelveData reconnecting...");
    setTimeout(connectTwelveWS, 3000);
  });

  ws.on("error", (err) => {
    console.error("❌ TwelveData WS error:", err.message);
  });
}

// ===============================
// BINANCE REST (WORKS ON RAILWAY)
// ===============================
const cryptoNames = {
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
  BNBUSDT: "Binance Coin",
  XRPUSDT: "Ripple",
  ADAUSDT: "Cardano",
  SOLUSDT: "Solana",
};

const symbols = Object.keys(cryptoNames);

// Store last prices to reduce Firebase writes
const lastPrices = {};

async function fetchBinancePrices() {
  try {
    const res = await fetch(
      "https://api.binance.com/api/v3/ticker/price"
    );

    const data = await res.json();

    for (let item of data) {
      if (!symbols.includes(item.symbol)) continue;

      const price = parseFloat(item.price);

      // ✅ Avoid unnecessary Firebase writes
      if (lastPrices[item.symbol] === price) continue;

      lastPrices[item.symbol] = price;

      await db.ref(`prices/${item.symbol}`).set({
        symbol: item.symbol,
        name: cryptoNames[item.symbol] || item.symbol,
        price: price,
        source: "binance",
        timestamp: Date.now(),
      });

      console.log(`💰 [BN-REST] ${item.symbol} → ${price}`);
    }
  } catch (err) {
    console.error("❌ Binance REST error:", err.message);
  }
}

// ===============================
// START SERVICES
// ===============================
connectTwelveWS();

// Run every 5 seconds
setInterval(fetchBinancePrices, 5000);

// ===============================
// KEEP PROCESS ALIVE (RAILWAY)
// ===============================
setInterval(() => {
  console.log("🫀 Worker heartbeat");
}, 30000);
