
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'app_errors.log');

/**
 * Write a message to the log file with timestamp and level.
 * @param {'INFO' | 'WARN' | 'ERROR'} level 
 * @param {string} message 
 * @param {any} [meta] Optional metadata (stack trace, object, etc.)
 */
function logToFile(level, message, meta) {
  const timestamp = new Date().toISOString();
  let logLine = `[${timestamp}] [${level}] ${message}`;
  
  if (meta) {
    if (meta instanceof Error) {
      logLine += `\nStack: ${meta.stack}`;
    } else if (typeof meta === 'object') {
      logLine += `\nMeta: ${JSON.stringify(meta)}`;
    } else {
      logLine += `\nDetails: ${String(meta)}`;
    }
  }
  
  logLine += '\n';

  // Append to file asynchronously
  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) {
      console.error('FAILED TO WRITE TO LOG FILE:', err);
    }
  });

  // Also output to console for dev visibility
  if (level === 'ERROR') {
    console.error(logLine);
  } else {
    console.log(logLine);
  }
}

const logger = {
  info: (msg, meta) => logToFile('INFO', msg, meta),
  warn: (msg, meta) => logToFile('WARN', msg, meta),
  error: (msg, meta) => logToFile('ERROR', msg, meta),
};

module.exports = logger;
