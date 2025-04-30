import { CronJob } from "cron"
import { triggerModelTraining } from "./trainer"
import { logger } from "../utils/logger"
import { config } from "../config/model"

let trainingJob: CronJob | null = null

// Initialize scheduled training
export async function initializeScheduledTraining(): Promise<void> {
  try {
    // Schedule training based on configuration
    const cronSchedule = config.trainingSchedule || "0 2 * * *" // Default: 2 AM daily

    trainingJob = new CronJob(
      cronSchedule,
      async () => {
        logger.info("Starting scheduled model training")
        try {
          await triggerModelTraining()
          logger.info("Scheduled model training completed successfully")
        } catch (error) {
          logger.error("Scheduled model training failed", error)
        }
      },
      null, // onComplete
      false, // start
      "UTC", // timezone
    )

    // Start the job
    trainingJob.start()

    logger.info(`Scheduled training initialized with schedule: ${cronSchedule}`)

    // Run initial training if configured
    if (config.trainOnStartup) {
      logger.info("Running initial training on startup")
      await triggerModelTraining()
    }
  } catch (error) {
    logger.error("Failed to initialize scheduled training", error)
    throw error
  }
}

// Stop scheduled training
export function stopScheduledTraining(): void {
  if (trainingJob) {
    trainingJob.stop()
    trainingJob = null
    logger.info("Scheduled training stopped")
  }
}
