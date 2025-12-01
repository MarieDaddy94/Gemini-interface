
// server/broker/simBroker.js
//
// Simple in-memory simulated broker: one account + positions.

let simAccount = {
  accountId: 'SIM-001',
  accountName: 'Simulated Account',
  equity: 100000,
  balance: 100000,
  currency: 'USD',
};

let simPositions = [];

/**
 * Get current sim account snapshot.
 */
function getSimAccount() {
  return { ...simAccount };
}

/**
 * Get all positions.
 */
function getSimPositions() {
  return simPositions.map((p) => ({ ...p }));
}

/**
 * Open a new simulated position.
 *
 * @param {{
 *  instrumentSymbol: string,
 *  direction: 'long'|'short',
 *  riskPercent: number,
 *  entryPrice: number,
 *  stopPrice?: number
 * }} params
 */
function openSimPosition(params) {
  const {
    instrumentSymbol,
    direction,
    riskPercent,
    entryPrice,
    stopPrice,
  } = params;

  const dir = direction === 'short' ? 'short' : 'long';
  const side = dir === 'long' ? 'buy' : 'sell';

  const equity = Number(simAccount.equity || simAccount.balance || 100000);
  const riskPct = Number(riskPercent || 0);
  const riskMoney = equity * (riskPct / 100);

  const ep = Number(entryPrice);
  const sp = stopPrice !== undefined ? Number(stopPrice) : NaN;

  const unitRisk = isNaN(sp) || sp === ep ? 1 : Math.abs(ep - sp);
  const sizeUnits = unitRisk > 0 ? riskMoney / unitRisk : riskMoney;

  const now = new Date().toISOString();
  const id = `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const position = {
    id,
    instrumentSymbol,
    direction: dir,
    side,
    sizeUnits,
    entryPrice: ep,
    stopPrice: isNaN(sp) ? undefined : sp,
    openedAt: now,
    closedAt: undefined,
    closePrice: undefined,
    pnl: undefined,
    status: 'open',
  };

  simPositions.push(position);

  return { ...position };
}

/**
 * Close a simulated position and update account balance/equity.
 *
 * @param {string} positionId
 * @param {number} closePrice
 */
function closeSimPosition(positionId, closePrice) {
  const idx = simPositions.findIndex((p) => p.id === positionId);
  if (idx === -1) {
    throw new Error(`Position not found: ${positionId}`);
  }

  const pos = simPositions[idx];
  if (pos.status === 'closed') {
    return { ...pos };
  }

  const cp = Number(closePrice);
  const dir = pos.direction === 'short' ? 'short' : 'long';
  const priceDiff =
    dir === 'long' ? cp - pos.entryPrice : pos.entryPrice - cp;

  const pnl = priceDiff * pos.sizeUnits;

  simAccount.balance += pnl;
  simAccount.equity = simAccount.balance;

  const now = new Date().toISOString();

  const updated = {
    ...pos,
    closePrice: cp,
    closedAt: now,
    pnl,
    status: 'closed',
  };

  simPositions[idx] = updated;

  return { ...updated };
}

module.exports = {
  getSimAccount,
  getSimPositions,
  openSimPosition,
  closeSimPosition,
};
