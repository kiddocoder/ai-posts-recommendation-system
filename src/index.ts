import express from "express"
import cors from "cors"
import { config } from "./config/server"
import { setupRoutes } from "./api/routes"
import { initializeScheduledTraining } from "./training/scheduledTraining"
import { logger } from "./utils/logger"

async function bootstrap(): Promise<void> {
  try {
    const app = express()

    // Middleware
    app.use(express.json())
    app.use(cors())

    // Setup routes
    setupRoutes(app)

    // Initialize scheduled training
    await initializeScheduledTraining()

    // Start server
    app.listen(config.port, () => {
      logger.info(`Recommendation service running on port ${config.port}`)
    })
  } catch (error) {
    logger.error("Failed to start recommendation service", error)
    process.exit(1)
  }
}

bootstrap()
