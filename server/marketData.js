
const { WebSocketServer, WebSocket } = require('ws');

// --- ASSET CONFIGURATION ---
const ASSETS = {
  'US30': { type: 'SIMULATED', price: 34500.00, volatility: 0.0002 },
  'NAS100': { type: 'SIMULATED', price: 15200.00, volatility: 0.0003 },
  'XAUUSD': { type: 'SIMULATED', price: 2040.00, volatility: 0.00015 },
  'BTCUSD': { type: 'REAL', binanceSymbol: 'btcusdt', price: 42000.00 },
  'ETHUSD': { type: 'REAL', binanceSymbol: 'ethusdt', price: 2200.00 }
};

class MarketDataEngine {
  constructor() {
    this.currentPrices = {};
    this.realDataConnected = false;
    this.binanceWs = null;

    // Initialize state
    Object.keys(ASSETS).forEach(symbol => {
      this.currentPrices[symbol] = ASSETS[symbol].price;
    });

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
          if (msg.s && msg.p) {
            this.handleRealTick(msg.s, parseFloat(msg.p));
          }
        } catch (e) {}
      });

      this.binanceWs.on('close', () => {
        this.realDataConnected = false;
        setTimeout(() => this.connectRealData(), 5000);
      });

    } catch (e) {
      console.error('[MarketData] Fatal error in real data connection:', e);
    }
  }

  handleRealTick(binanceSymbol, price) {
    const mySymbol = Object.keys(ASSETS).find(
      key => ASSETS[key].binanceSymbol === binanceSymbol.toLowerCase()
    );
    if (mySymbol) {
      this.updatePrice(mySymbol, price);
    }
  }

  updatePrice(symbol, price) {
    this.currentPrices[symbol] = price;
  }

  tick() {
    const updates = {};
    
    Object.keys(ASSETS).forEach(symbol => {
      const asset = ASSETS[symbol];
      let current = this.currentPrices[symbol];

      // Simulation Logic (Random Walk)
      if (asset.type === 'SIMULATED' || (asset.type === 'REAL' && !this.realDataConnected)) {
         let change = current * asset.volatility * (Math.random() - 0.5) * 2;
         let nextPrice = current + change;
         this.updatePrice(symbol, nextPrice);
         current = nextPrice;
      }

      updates[symbol] = {
        symbol,
        price: current,
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
  wss = new WebSocketServer({ server, path: '/ws' });
  engine = new MarketDataEngine();
  console.log('[MarketData] Service started.');

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'SNAPSHOT', data: engine.tick() }));
  });

  if (!interval) {
    interval = setInterval(() => {
      const updates = engine.tick();
      const message = JSON.stringify({ type: 'UPDATE', data: updates });
      wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(message);
      });
    }, 1000);
  }
}

function getPrice(symbol) {
  if (!engine || !engine.currentPrices) return null;
  if (engine.currentPrices[symbol]) return engine.currentPrices[symbol];
  const key = Object.keys(engine.currentPrices).find(k => symbol.includes(k));
  return key ? engine.currentPrices[key] : null;
}

module.exports = { setupMarketData, getPrice };
