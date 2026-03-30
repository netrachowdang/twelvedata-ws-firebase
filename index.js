function connectBinanceWS() {
  console.log("🔌 Connecting Binance WS...");

  const streams = [
    "btcusdt@trade",
    "ethusdt@trade",
    "bnbusdt@trade",
    "xrpusdt@trade",
    "adausdt@trade",
    "solusdt@trade"
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

      if (!data || !data.s || !data.p) return;

      const symbol = data.s;
      const price = parseFloat(data.p);

      await db.ref(`prices/${symbol}`).set({
        symbol: symbol,
        name: cryptoNames[symbol] || symbol,
        price: price,
        source: "binance",
        timestamp: Date.now(),
      });

      console.log(`💰 ${symbol} (${cryptoNames[symbol]}) → ${price}`);
    } catch (err) {
      console.error("❌ Binance parse error", err);
    }
  });

  ws.on("close", () => {
    console.warn("⚠️ Binance reconnecting...");
    setTimeout(connectBinanceWS, 3000);
  });

  ws.on("error", (err) => {
    console.error("❌ Binance WS error:", err.message);
  });
}
