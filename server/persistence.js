const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '.data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const JOURNALS_FILE = path.join(DATA_DIR, 'journals.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class PersistenceLayer {
  constructor() {
    this.sessions = new Map();
    this.journals = new Map();
    this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
        const data = JSON.parse(raw);
        // Convert array of entries back to Map
        this.sessions = new Map(data);
        console.log(`[Persistence] Loaded ${this.sessions.size} sessions.`);
      }
    } catch (err) {
      console.error('[Persistence] Error loading sessions:', err);
    }

    try {
      if (fs.existsSync(JOURNALS_FILE)) {
        const raw = fs.readFileSync(JOURNALS_FILE, 'utf8');
        const data = JSON.parse(raw);
        this.journals = new Map(data);
        console.log(`[Persistence] Loaded ${this.journals.size} journals.`);
      }
    } catch (err) {
      console.error('[Persistence] Error loading journals:', err);
    }
  }

  saveSessions() {
    try {
      // Convert Map to array of entries for JSON serialization
      const data = Array.from(this.sessions.entries());
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[Persistence] Error saving sessions:', err);
    }
  }

  saveJournals() {
    try {
      const data = Array.from(this.journals.entries());
      fs.writeFileSync(JOURNALS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[Persistence] Error saving journals:', err);
    }
  }

  // Session Methods
  getSession(id) {
    return this.sessions.get(id);
  }

  setSession(id, data) {
    this.sessions.set(id, data);
    this.saveSessions();
  }

  deleteSession(id) {
    this.sessions.delete(id);
    this.saveSessions();
  }

  // Journal Methods
  getJournal(sessionId) {
    return this.journals.get(sessionId) || [];
  }

  setJournal(sessionId, entries) {
    this.journals.set(sessionId, entries);
    this.saveJournals();
  }
  
  // Expose raw maps if needed for reference, but prefer methods
  getSessionsMap() {
    return this.sessions;
  }
  
  getJournalsMap() {
    return this.journals;
  }
}

const persistence = new PersistenceLayer();

module.exports = persistence;