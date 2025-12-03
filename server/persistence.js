
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'trading.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class PersistenceLayer {
  constructor() {
    this.db = new sqlite3.Database(DB_FILE, (err) => {
      if (err) {
        console.error('[Persistence] Could not connect to database:', err.message);
      } else {
        console.log('[Persistence] Connected to SQLite database.');
        this.init();
      }
    });
  }

  init() {
    this.db.serialize(() => {
      // Sessions Table: Stores broker session data as JSON
      this.db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          data TEXT
        )
      `);

      // Journals Table: Stores the entire journal array as JSON (legacy compat)
      this.db.run(`
        CREATE TABLE IF NOT EXISTS journals (
          sessionId TEXT PRIMARY KEY,
          data TEXT
        )
      `);

      // Vision Snapshots Table: Structured vision data
      this.db.run(`
        CREATE TABLE IF NOT EXISTS vision_snapshots (
          id TEXT PRIMARY KEY,
          symbol TEXT,
          timeframe TEXT,
          createdAt TEXT,
          source TEXT,
          summaryJson TEXT
        )
      `);

      // --- PHASE K NEW TABLES ---

      // Model Policy Table: Stores the active lineup of models per role
      this.db.run(`
        CREATE TABLE IF NOT EXISTS model_policies (
          id TEXT PRIMARY KEY,
          createdAt TEXT,
          activeLineupJson TEXT,
          recommendationsJson TEXT,
          isActive INTEGER DEFAULT 0
        )
      `);

      // Desk Sessions Table: Narratives and daily stats
      this.db.run(`
        CREATE TABLE IF NOT EXISTS desk_sessions (
          id TEXT PRIMARY KEY,
          date TEXT,
          startTime TEXT,
          endTime TEXT,
          summary TEXT,
          tags TEXT,
          statsJson TEXT,
          rawEventsJson TEXT
        )
      `);

      // --- PHASE M: PLAYBOOKS ---
      this.db.run(`
        CREATE TABLE IF NOT EXISTS playbooks (
          id TEXT PRIMARY KEY,
          symbol TEXT,
          timeframe TEXT,
          tier TEXT,
          data TEXT,
          isArchived INTEGER DEFAULT 0,
          updatedAt TEXT
        )
      `);
    });
  }

  // --- GENERIC HELPERS ---

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // --- SESSIONS ---

  async getSession(id) {
    if (!id) return null;
    const row = await this.get('SELECT data FROM sessions WHERE id = ?', [id]);
    if (!row) return null;
    try {
      return JSON.parse(row.data);
    } catch (e) {
      console.error('Failed to parse session data', e);
      return null;
    }
  }

  async setSession(id, data) {
    const json = JSON.stringify(data);
    await this.run(
      `INSERT INTO sessions (id, data) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      [id, json]
    );
  }

  async deleteSession(id) {
    await this.run('DELETE FROM sessions WHERE id = ?', [id]);
  }

  // --- JOURNALS ---

  async getJournal(sessionId) {
    if (!sessionId) return [];
    const row = await this.get('SELECT data FROM journals WHERE sessionId = ?', [sessionId]);
    if (!row) return [];
    try {
      return JSON.parse(row.data);
    } catch (e) {
      console.error('Failed to parse journal data', e);
      return [];
    }
  }

  async setJournal(sessionId, entries) {
    const json = JSON.stringify(entries);
    await this.run(
      `INSERT INTO journals (sessionId, data) VALUES (?, ?)
       ON CONFLICT(sessionId) DO UPDATE SET data = excluded.data`,
      [sessionId, json]
    );
  }

  // --- VISION SNAPSHOTS ---

  async saveVisionSnapshot(snapshot) {
    const { id, symbol, timeframe, createdAt, source, ...rest } = snapshot;
    const json = JSON.stringify(rest);
    await this.run(
      `INSERT INTO vision_snapshots (id, symbol, timeframe, createdAt, source, summaryJson) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, symbol || 'UNKNOWN', timeframe || 'UNKNOWN', createdAt, source || 'manual', json]
    );
  }

  async getRecentVisionSnapshots(symbol, limit = 5) {
    let sql = 'SELECT * FROM vision_snapshots';
    const params = [];
    if (symbol && symbol !== 'Auto') {
        sql += ' WHERE symbol = ?';
        params.push(symbol);
    }
    sql += ' ORDER BY createdAt DESC LIMIT ?';
    params.push(limit);

    const rows = await this.all(sql, params);
    return rows.map(r => {
        let rest = {};
        try {
            rest = JSON.parse(r.summaryJson || '{}');
        } catch (e) {}
        return { 
            id: r.id, 
            symbol: r.symbol, 
            timeframe: r.timeframe, 
            createdAt: r.createdAt, 
            source: r.source,
            ...rest 
        };
    });
  }

  // --- MODEL POLICIES ---

  async getActiveModelPolicy() {
    const row = await this.get('SELECT * FROM model_policies WHERE isActive = 1 ORDER BY createdAt DESC LIMIT 1');
    if (!row) return null;
    try {
      return {
        id: row.id,
        createdAt: row.createdAt,
        lineup: JSON.parse(row.activeLineupJson),
        recommendations: JSON.parse(row.recommendationsJson || '[]')
      };
    } catch (e) { return null; }
  }

  async saveModelPolicy(policy) {
    // Set all others inactive first
    await this.run('UPDATE model_policies SET isActive = 0');
    
    const lineupJson = JSON.stringify(policy.lineup);
    const recsJson = JSON.stringify(policy.recommendations || []);
    
    await this.run(
      `INSERT INTO model_policies (id, createdAt, activeLineupJson, recommendationsJson, isActive) VALUES (?, ?, ?, ?, 1)`,
      [policy.id, policy.createdAt, lineupJson, recsJson]
    );
  }

  // --- DESK SESSIONS ---

  async getDeskSessions(limit = 7) {
    const rows = await this.all('SELECT * FROM desk_sessions ORDER BY date DESC LIMIT ?', [limit]);
    return rows.map(r => {
      let stats = {}, rawEvents = [];
      try { stats = JSON.parse(r.statsJson || '{}'); } catch(e){}
      try { rawEvents = JSON.parse(r.rawEventsJson || '[]'); } catch(e){}
      return {
        ...r,
        stats,
        rawEvents
      };
    });
  }

  async saveDeskSession(session) {
    const statsJson = JSON.stringify(session.stats || {});
    const eventsJson = JSON.stringify(session.rawEvents || []);
    
    await this.run(
      `INSERT INTO desk_sessions (id, date, startTime, endTime, summary, tags, statsJson, rawEventsJson) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET summary=excluded.summary, statsJson=excluded.statsJson, tags=excluded.tags, endTime=excluded.endTime`,
      [session.id, session.date, session.startTime, session.endTime, session.summary, session.tags, statsJson, eventsJson]
    );
  }

  // --- PLAYBOOKS (Phase M) ---

  async getPlaybooks(filter) {
    let sql = 'SELECT * FROM playbooks WHERE isArchived = 0';
    const params = [];

    if (filter.symbol) {
        sql += ' AND symbol = ?';
        params.push(filter.symbol);
    }
    if (filter.timeframe) {
        sql += ' AND timeframe = ?';
        params.push(filter.timeframe);
    }
    if (filter.tier) {
        sql += ' AND tier = ?';
        params.push(filter.tier);
    }

    sql += ' ORDER BY updatedAt DESC';

    const rows = await this.all(sql, params);
    return rows.map(r => {
      let data = {};
      try { data = JSON.parse(r.data || '{}'); } catch(e){}
      return { ...data, id: r.id, symbol: r.symbol, timeframe: r.timeframe, tier: r.tier };
    });
  }

  async getPlaybook(id) {
    const row = await this.get('SELECT * FROM playbooks WHERE id = ?', [id]);
    if (!row) return null;
    let data = {};
    try { data = JSON.parse(row.data || '{}'); } catch(e){}
    return { ...data, id: row.id, symbol: row.symbol, timeframe: row.timeframe, tier: row.tier };
  }

  async savePlaybook(playbook) {
    const { id, symbol, timeframe, tier, isArchived, ...rest } = playbook;
    const dataJson = JSON.stringify(rest);
    const now = new Date().toISOString();
    
    await this.run(
      `INSERT INTO playbooks (id, symbol, timeframe, tier, data, isArchived, updatedAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET 
         symbol=excluded.symbol, 
         timeframe=excluded.timeframe, 
         tier=excluded.tier, 
         data=excluded.data, 
         isArchived=excluded.isArchived,
         updatedAt=excluded.updatedAt`,
      [id, symbol, timeframe, tier, dataJson, isArchived ? 1 : 0, now]
    );
  }
}

const persistence = new PersistenceLayer();

module.exports = persistence;
