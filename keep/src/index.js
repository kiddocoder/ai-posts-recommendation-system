// src/index.js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { setupScheduledTraining } = require("./training/scheduledtraining");
const routes = require("./api/routes");
const { connectDB } = require("./data/dataloader");
const { setupCache } = require("./utils/cache");
const logger = require("./utils/logger");
const config = require("../config/server");

// Initialize express app
const app = express();

// Apply middleware
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

// Apply routes
app.use("/", routes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error processing request: ${err.message}`);
  res
    .status(500)
    .json({ error: "Internal server error", message: err.message });
});

// Start the server
const PORT = process.env.PORT || config.port || 3002;

async function startServer() {
  try {
    // Connect to database
    await connectDB();
    logger.info("Database connection established");

    // Setup cache
    await setupCache();
    logger.info("Cache initialized");

    // Start the scheduled training
    setupScheduledTraining();
    logger.info("Scheduled training initialized");

    // Start the server
    app.listen(PORT, () => {
      logger.info(`Recommendation service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

startServer();
