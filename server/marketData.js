
const { WebSocketServer } = require('ws');

// Configuration for simulated assets
const ASSETS = {
  'US30': { price: 34500.00, volatility: 0.0002 },
  'NAS100': { price: 15200.00, volatility: 0.0003 },
  'XAUUSD': { price: 2040.00, volatility: 0.00015 },
  'BTCUSD': { price: 42000.00, volatility: 0.0005 },
};

class MarketSimulator {
  constructor() {
    this.history = {}; // Store price history for indicator calc
    this.currentPrices = {};
    
    // Initialize
    Object.keys(ASSETS).forEach(symbol => {
      this.currentPrices[symbol] = ASSETS[symbol].price;
      // Pre-fill history with slight noise for immediate RSI calc
      this.history[symbol] = Array(30).fill(0).map((_, i) => {
        return ASSETS[symbol].price * (1 + (Math.random() - 0.5) * 0.001);
      });
    });
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

  tick() {
    const updates = {};
    
    Object.keys(ASSETS).forEach(symbol => {
      const { price, volatility } = ASSETS[symbol];
      const current = this.currentPrices[symbol];
      
      // Random Walk
      const change = current * volatility * (Math.random() - 0.5) * 2;
      let nextPrice = current + change;
      
      // Keep it somewhat bounded to reality for the demo (mean reversion if it drifts 5%)
      if (nextPrice > price * 1.05) nextPrice -= price * 0.001;
      if (nextPrice < price * 0.95) nextPrice += price * 0.001;
      
      this.currentPrices[symbol] = nextPrice;
      this.history[symbol].push(nextPrice);
      
      // Keep history manageable
      if (this.history[symbol].length > 50) {
        this.history[symbol].shift();
      }

      const rsi = this.calculateRSI(this.history[symbol]);
      const sma = this.calculateSMA(this.history[symbol]);

      updates[symbol] = {
        symbol,
        price: nextPrice,
        change: nextPrice - price,
        changePercent: ((nextPrice - price) / price) * 100,
        rsi,
        sma,
        timestamp: new Date().toISOString()
      };
    });

    return updates;
  }
}

let wss;
let simulator;
let interval;

function setupMarketData(server) {
  wss = new WebSocketServer({ server, path: '/ws' });
  simulator = new MarketSimulator();

  console.log('Real-time Market Data Stream established at /ws');

  wss.on('connection', (ws) => {
    // Send initial snapshot
    ws.send(JSON.stringify({ type: 'SNAPSHOT', data: simulator.tick() }));
  });

  // Tick loop
  if (!interval) {
    interval = setInterval(() => {
      const updates = simulator.tick();
      const message = JSON.stringify({ type: 'UPDATE', data: updates });
      
      wss.clients.forEach(client => {
        if (client.readyState === 1) { // OPEN
          client.send(message);
        }
      });
    }, 1000); // 1-second tick
  }
}

module.exports = { setupMarketData };
