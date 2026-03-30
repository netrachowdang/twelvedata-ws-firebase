import WebSocket from "ws";
import admin from "firebase-admin";

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
// BINANCE WS (CRYPTO - STABLE)
// ===============================
function connectBinanceWS() {
  console.log("🔌 Connecting Binance WS...");

  const streams = [
    "btcusdt@miniTicker",
    "ethusdt@miniTicker",
    "bnbusdt@miniTicker",
    "xrpusdt@miniTicker",
    "adausdt@miniTicker",
    "solusdt@miniTicker",
  ].join("/");

  const WS_URL = `wss://stream.binance.com:9443/stream?streams=${streams}`;

  const ws = new WebSocket(WS_URL);

  // ✅ SYMBOL → NAME MAP
  const cryptoNames = {
    BTCUSDT: "Bitcoin",
    ETHUSDT: "Ethereum",
    BNBUSDT: "Binance Coin",
    XRPUSDT: "Ripple",
    ADAUSDT: "Cardano",
    SOLUSDT: "Solana",
  };

  ws.on("open", () => {
    console.log("✅ Binance connected");
  });

  ws.on("message", async (msg) => {
    try {
      const json = JSON.parse(msg.toString());
      const data = json.data;

      if (!data || !data.s || !data.c) return;

      const symbol = data.s;
      const price = parseFloat(data.c);

      await db.ref(`prices/${symbol}`).set({
        symbol: symbol,
        name: cryptoNames[symbol] || symbol,
        price: price,
        source: "binance",
        timestamp: Date.now(),
      });

      console.log(`💰 [BN] ${symbol} (${cryptoNames[symbol]}) → ${price}`);
    } catch (err) {
      console.error("❌ Binance parse error", err);
    }
  });

  ws.on("close", () => {
    console.warn("⚠️ Binance closed. Reconnecting...");
    setTimeout(connectBinanceWS, 3000);
  });

  ws.on("error", (err) => {
    console.error("❌ Binance WS error:", err.message);
  });
}

// ===============================
// START BOTH SERVICES
// ===============================
connectTwelveWS();
connectBinanceWS();

// ===============================
// KEEP PROCESS ALIVE (RAILWAY)
// ===============================
setInterval(() => {
  console.log("🫀 Worker heartbeat");
}, 30000);
