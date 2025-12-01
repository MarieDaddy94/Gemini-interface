
// server/indicators.js

class TechnicalAnalysis {
  static sma(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  static ema(data, period, previousEma = null) {
    if (data.length < period) return null;
    const currentPrice = data[data.length - 1];
    if (previousEma === null) {
      return this.sma(data, period);
    }
    const k = 2 / (period + 1);
    return currentPrice * k + previousEma * (1 - k);
  }

  static rsi(data, period = 14) {
    if (data.length < period + 1) return 50;
    let gains = 0;
    let losses = 0;
    
    // Calculate initial average
    for (let i = data.length - period; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
  }

  static bollingerBands(data, period = 20, multiplier = 2) {
    if (data.length < period) return null;
    const sma = this.sma(data, period);
    const slice = data.slice(-period);
    const squaredDiffs = slice.map(val => Math.pow(val - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      upper: sma + multiplier * stdDev,
      middle: sma,
      lower: sma - multiplier * stdDev
    };
  }

  static macd(data, fast = 12, slow = 26, signal = 9) {
    if (data.length < slow) return null;
    
    // Simplification: Calculate EMAs for the last point
    // In a real engine we'd maintain state, but for simulation we re-calc roughly
    const fastEma = this.ema(data, fast);
    const slowEma = this.ema(data, slow);
    
    if (!fastEma || !slowEma) return null;
    
    const macdLine = fastEma - slowEma;
    // We would need history of MACD lines to calculate signal, 
    // returning simplified snapshot
    return {
      macd: macdLine,
      signal: macdLine * 0.9, // Mock signal lag
      histogram: macdLine * 0.1
    };
  }
}

module.exports = TechnicalAnalysis;
