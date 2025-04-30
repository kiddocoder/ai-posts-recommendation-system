// src/api/routes.js
const express = require("express");
const recommender = require("./recommender");
const logger = require("../utils/logger");
const { trackMetric } = require("../utils/metrics");

const router = express.Router();

// Get personalized recommendations for a user
router.get("/recommend/:userId", async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    logger.info(`Fetching recommendations for user: ${userId}`);

    // Track recommendation request
    trackMetric("recommendation_request", { userId });

    const startTime = Date.now();
    const recommendations = await recommender.getRecommendations(
      userId,
      parseInt(limit),
      parseInt(offset)
    );
    const elapsed = Date.now() - startTime;

    // Track response time
    trackMetric("recommendation_response_time", { userId, elapsed });

    res.status(200).json(recommendations);
  } catch (error) {
    next(error);
  }
});

// Record user interaction with content (view, like, comment, save, share)
router.post("/interaction", async (req, res, next) => {
  try {
    const { userId, postId, interactionType, metadata = {} } = req.body;

    if (!userId || !postId || !interactionType) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "userId, postId, and interactionType are required",
      });
    }

    // Validate interaction type
    const validInteractions = ["view", "like", "comment", "save", "share"];
    if (!validInteractions.includes(interactionType)) {
      return res.status(400).json({
        error: "Invalid interaction type",
        message: `Interaction type must be one of: ${validInteractions.join(
          ", "
        )}`,
      });
    }

    logger.info(
      `Recording interaction: ${userId} ${interactionType} ${postId}`
    );

    // Track the interaction
    trackMetric("user_interaction", { userId, postId, interactionType });

    await recommender.recordInteraction(
      userId,
      postId,
      interactionType,
      metadata
    );

    // Check if we should update recommendations in real-time
    if (["like", "save"].includes(interactionType)) {
      // Schedule real-time update for this user
      recommender.scheduleRealtimeUpdate(userId);
    }

    res.status(200).json({ status: "success" });
  } catch (error) {
    next(error);
  }
});

// Trigger model training manually (admin only)
router.post("/train", async (req, res, next) => {
  try {
    const { adminKey } = req.body;

    // Basic admin authentication
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    logger.info("Manual training triggered");

    // Initiate training in the background
    recommender
      .startTraining()
      .then(() => logger.info("Manual training completed"))
      .catch((err) => logger.error(`Training failed: ${err.message}`));

    res.status(202).json({ status: "training_started" });
  } catch (error) {
    next(error);
  }
});

// Get model status (admin only)
router.get("/status", async (req, res, next) => {
  try {
    const { adminKey } = req.query;

    // Basic admin authentication
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const status = await recommender.getModelStatus();
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
