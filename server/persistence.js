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

      // Journals Table: Stores the entire journal array as JSON (for now, to match existing logic)
      // In a strict schema migration, we would normalize entries, but JSON blob is fine for this stage.
      this.db.run(`
        CREATE TABLE IF NOT EXISTS journals (
          sessionId TEXT PRIMARY KEY,
          data TEXT
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
}

const persistence = new PersistenceLayer();

module.exports = persistence;