// src/training/scheduledtraining.js
const { scheduleJob } = require("node-schedule");
const { startTrainingJob } = require("./trainer");
const logger = require("../utils/logger");

/**
 * Set up scheduled training jobs
 * - Daily training at 3:00 AM
 * - Weekly full retraining on Sunday at 4:00 AM
 */
function setupScheduledTraining() {
  // Daily incremental training job (Monday-Saturday at 3:00 AM)
  scheduleJob("0 3 * * 1-6", async () => {
    logger.info("Running daily incremental training job");
    try {
      await startTrainingJob();
      logger.info("Daily training completed successfully");
    } catch (error) {
      logger.error(`Daily training failed: ${error.message}`);
    }
  });

  // Weekly full retraining job (Sunday at 4:00 AM)
  scheduleJob("0 4 * * 0", async () => {
    logger.info("Running weekly full retraining job");
    try {
      // We could implement a more thorough training process here
      // For example, hyperparameter tuning or model architecture search
      await startTrainingJob();
      logger.info("Weekly full retraining completed successfully");
    } catch (error) {
      logger.error(`Weekly full retraining failed: ${error.message}`);
    }
  });

  // Hourly mini-batch training for highly active periods (every hour from 9 AM to 11 PM)
  scheduleJob("0 9-23 * * *", async () => {
    logger.info("Running hourly mini-batch training");
    try {
      // We could implement a lightweight training process for recent interactions
      // This helps the model stay up-to-date with recent trends
      // In a real implementation, this might be a separate function that only trains
      // on the most recent data with fewer epochs
      await startTrainingJob();
      logger.info("Hourly mini-batch training completed successfully");
    } catch (error) {
      logger.error(`Hourly mini-batch training failed: ${error.message}`);
    }
  });

  logger.info("Scheduled training jobs initialized");
}

module.exports = {
  setupScheduledTraining,
};
