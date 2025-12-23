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
// WEBSOCKET CONNECT (YOUR LINK)
// ===============================
function connectWS() {
  const WS_URL =
    "wss://ws.twelvedata.com/v1/quotes/price?apikey=" + API_KEY;

  console.log("🔌 Connecting to TwelveData WS...");
  console.log("URL:", WS_URL);

  const ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    console.log("✅ WebSocket connection opened");

    // Subscribe (will be ignored if endpoint not WS-enabled)
    ws.send(
      JSON.stringify({
        action: "subscribe",
        params: {
          symbols: "XAU/USD,BTC/USD",
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
        price: Number(data.price),
        timestamp: Date.now(),
      });

      console.log(`📈 ${symbol} → ${data.price}`);
    } catch (err) {
      console.error("❌ Message parse error", err);
    }
  });

  ws.on("error", (err) => {
    console.error("❌ WS error:", err.message);
  });

  ws.on("close", () => {
    console.warn("⚠️ WS closed. Reconnecting in 3s...");
    setTimeout(connectWS, 3000);
  });
}

// ===============================
// START WORKER
// ===============================
connectWS();

// ===============================
// KEEP PROCESS ALIVE (RAILWAY)
// ===============================
setInterval(() => {
  console.log("🫀 Worker heartbeat");
}, 30000);
