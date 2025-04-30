import express, { type Request, type Response, type NextFunction } from "express"
import cors from "cors"
import morgan from "morgan"
import { setupScheduledTraining } from "./training/scheduledTraining"
import { setupRoutes } from "./api/routes"
import { connectDB } from "./data/dataLoader"
import { setupCache } from "./utils/cache"
import { logger } from "./utils/logger"
import { config } from "./config/server"

// Initialize express app
const app = express()

// Apply middleware
app.use(cors())
app.use(express.json())
app.use(morgan("combined"))

// Apply routes
setupRoutes(app)

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok" })
})

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(`Error processing request: ${err.message}`)
  res.status(500).json({ error: "Internal server error", message: err.message })
})

// Start the server
const PORT = process.env.PORT || config.port || 3002

async function startServer(): Promise<void> {
  try {
    // Connect to database
    await connectDB()
    logger.info("Database connection established")

    // Setup cache
    await setupCache()
    logger.info("Cache initialized")

    // Start the scheduled training
    await setupScheduledTraining()
    logger.info("Scheduled training initialized")

    // Start the server
    app.listen(PORT, () => {
      logger.info(`Recommendation service running on port ${PORT}`)
    })
  } catch (error) {
    logger.error(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

startServer()
