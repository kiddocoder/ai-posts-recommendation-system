// src/utils/logger.js
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, json } = format;

// Define log formats
const consoleFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

// Create the logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    json()
  ),
  defaultMeta: { service: 'recommender-service' },
  transports: [
    // Write all logs to console
    new transports.Console({
      format: combine(
        colorize(),
        timestamp(),
        consoleFormat
      )
    }),
    
    // Write all logs with level 'info' and below to combined.log
    new transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    //