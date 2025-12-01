const { WebSocketServer, WebSocket } = require('ws');

// --- ASSET CONFIGURATION ---
const ASSETS = {
  // Simulated Assets (Indices/Metals where free WS is hard to find)
  'US30': { type: 'SIMULATED', price: 34500.00, volatility: 0.0002 },
  'NAS100': { type: 'SIMULATED', price: 15200.00, volatility: 0.0003 },
  'XAUUSD': { type: 'SIMULATED', price: 2040.00, volatility: 0.00015 },
  
  // Real Assets (Crypto from Binance)
  'BTCUSD': { type: 'REAL', binanceSymbol: 'btcusdt', price: 42000.00 },
  'ETHUSD': { type: 'REAL', binanceSymbol: 'ethusdt', price: 2200.00 }
};

class MarketDataEngine {
  constructor() {
    this.history = {}; 
    this.currentPrices = {};
    this.realDataConnected = false;
    this.binanceWs = null;

    // Initialize state
    Object.keys(ASSETS).forEach(symbol => {
      this.currentPrices[symbol] = ASSETS[symbol].price;
      this.history[symbol] = Array(30).fill(0).map((_, i) => {
        return ASSETS[symbol].price * (1 + (Math.random() - 0.5) * 0.001);
      });
    });

    // Start Real Data Connection
    this.connectRealData();
  }

  connectRealData() {
    try {
      const streams = Object.values(ASSETS)
        .filter(a => a.type === 'REAL')
        .map(a => `${a.binanceSymbol}@trade`)
        .join('/');

      if (!streams) return;

      const url = `wss://stream.binance.com:9443/ws/${streams}`;
      console.log(`[MarketData] Connecting to Binance WS: ${url}`);
      
      this.binanceWs = new WebSocket(url);

      this.binanceWs.on('open', () => {
        console.log('[MarketData] Binance WS Connected');
        this.realDataConnected = true;
      });

      this.binanceWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          // msg.s is symbol (e.g. BTCUSDT), msg.p is price
          if (msg.s && msg.p) {
            this.handleRealTick(msg.s, parseFloat(msg.p));
          }
        } catch (e) {
          // ignore parse errors
        }
      });

      this.binanceWs.on('error', (err) => {
        console.error('[MarketData] Binance WS Error:', err.message);
      });

      this.binanceWs.on('close', () => {
        console.log('[MarketData] Binance WS Closed. Reconnecting in 5s...');
        this.realDataConnected = false;
        setTimeout(() => this.connectRealData(), 5000);
      });

    } catch (e) {
      console.error('[MarketData] Fatal error in real data connection:', e);
    }
  }

  handleRealTick(binanceSymbol, price) {
    // Map binance symbol back to our symbol
    const mySymbol = Object.keys(ASSETS).find(
      key => ASSETS[key].binanceSymbol === binanceSymbol.toLowerCase()
    );

    if (mySymbol) {
      this.updatePrice(mySymbol, price);
    }
  }

  updatePrice(symbol, price) {
    this.currentPrices[symbol] = price;
    this.history[symbol].push(price);
    if (this.history[symbol].length > 50) {
      this.history[symbol].shift();
    }
  }

  // Basic RSI Calculation (14 periods)
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
  }

  // Simple Moving Average (20 periods)
  calculateSMA(prices, period = 20) {
    if (prices.length < period) return prices[prices.length - 1];
    const slice = prices.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / slice.length;
  }

  // The main loop that drives both simulated ticks and aggregating real ticks
  tick() {
    const updates = {};
    
    Object.keys(ASSETS).forEach(symbol => {
      const asset = ASSETS[symbol];
      let current = this.currentPrices[symbol];

      // If it's a simulated asset, OR if it's a real asset but connection is down,
      // generate a random walk tick.
      if (asset.type === 'SIMULATED' || (asset.type === 'REAL' && !this.realDataConnected)) {
         const volatility = asset.volatility || 0.0001;
         const change = current * volatility * (Math.random() - 0.5) * 2;
         let nextPrice = current + change;
         
         // Mean reversion boundaries for simulation
         if (asset.type === 'SIMULATED') {
             if (nextPrice > asset.price * 1.05) nextPrice -= asset.price * 0.001;
             if (nextPrice < asset.price * 0.95) nextPrice += asset.price * 0.001;
         }
         
         this.updatePrice(symbol, nextPrice);
         current = nextPrice;
      }

      // Calculate indicators
      const rsi = this.calculateRSI(this.history[symbol]);
      const sma = this.calculateSMA(this.history[symbol]);
      const startPrice = this.history[symbol][0]; // Approximate open for the session

      updates[symbol] = {
        symbol,
        price: current,
        change: current - startPrice,
        changePercent: ((current - startPrice) / startPrice) * 100,
        rsi,
        sma,
        timestamp: new Date().toISOString(),
        isSimulated: asset.type === 'SIMULATED' || !this.realDataConnected
      };
    });

    return updates;
  }
}

let wss;
let engine;
let interval;

function setupMarketData(server) {
  // Create WS Server attached to HTTP server
  wss = new WebSocketServer({ server, path: '/ws' });
  engine = new MarketDataEngine();

  console.log('[MarketData] Service started.');

  wss.on('connection', (ws) => {
    // Send initial snapshot
    ws.send(JSON.stringify({ type: 'SNAPSHOT', data: engine.tick() }));
  });

  // Global Tick Loop (1 second)
  if (!interval) {
    interval = setInterval(() => {
      const updates = engine.tick();
      const message = JSON.stringify({ type: 'UPDATE', data: updates });
      
      wss.clients.forEach(client => {
        if (client.readyState === 1) { // OPEN
          client.send(message);
        }
      });
    }, 1000);
  }
}

function getPrice(symbol) {
  if (!engine || !engine.currentPrices) return null;
  // Handle basic mapping for demo symbols
  if (engine.currentPrices[symbol]) return engine.currentPrices[symbol];
  // Simple fallback fuzzy match
  const key = Object.keys(engine.currentPrices).find(k => symbol.includes(k));
  return key ? engine.currentPrices[key] : null;
}

module.exports = { setupMarketData, getPrice };