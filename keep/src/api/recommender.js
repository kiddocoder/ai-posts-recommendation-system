// src/api/recommender.js
const tf = require("@tensorflow/tfjs-node");
const { getCache, setCache } = require("../utils/cache");
const logger = require("../utils/logger");
const {
  fetchUserData,
  fetchPostData,
  saveInteraction,
} = require("../data/dataloader");
const { loadModel } = require("../models/rankingmodel");
const { preprocessUserFeatures } = require("../data/preprocessing");
const { scheduleJob, cancelJob } = require("node-schedule");
const { startTrainingJob } = require("../training/trainer");

// In-memory queue for real-time updates
const realtimeUpdateQueue = new Set();

/**
 * Get personalized recommendations for a user
 * @param {string} userId - The user ID
 * @param {number} limit - Maximum number of recommendations to return
 * @param {number} offset - Offset for pagination
 * @returns {Object} Object containing recommended post IDs and metadata
 */
async function getRecommendations(userId, limit = 10, offset = 0) {
  try {
    const cacheKey = `recommendations:${userId}:${limit}:${offset}`;

    // Try to get from cache first
    const cachedRecommendations = await getCache(cacheKey);
    if (cachedRecommendations) {
      logger.info(`Cache hit for user ${userId} recommendations`);
      return JSON.parse(cachedRecommendations);
    }

    logger.info(`Cache miss for user ${userId}, computing recommendations`);

    // Fetch user data
    const userData = await fetchUserData(userId);
    if (!userData) {
      throw new Error(`User not found: ${userId}`);
    }

    // Load the model
    const model = await loadModel();
    if (!model) {
      throw new Error("Failed to load recommendation model");
    }

    // Preprocess user features
    const userFeatures = await preprocessUserFeatures(userData);

    // Get all eligible posts for recommendation
    // For a real system, you might need to implement filtering and pagination at the DB level
    const candidatePosts = await fetchPostData();

    // For each post, predict the user's interest
    const predictions = [];

    // Use TensorFlow.js for batch prediction (more efficient)
    const batchSize = 100; // Process in batches to avoid memory issues

    for (let i = 0; i < candidatePosts.length; i += batchSize) {
      const batch = candidatePosts.slice(i, i + batchSize);

      // Prepare batch inputs for the model
      const batchInputs = batch.map((post) => {
        // Combine user features with post features
        // This is a simplified example - you'd have more sophisticated feature engineering
        return {
          userFeatures: userFeatures,
          postFeatures: [
            post.category_id,
            post.is_most_popular ? 1 : 0,
            post.is_recommended ? 1 : 0,
            post.has_image ? 1 : 0,
            post.has_video ? 1 : 0,
            post.is_betting_tip ? 1 : 0,
            // Add more features as needed
          ],
        };
      });

      // Convert to tensors
      const tensorInputs = tf.tidy(() => {
        const userTensors = tf.tensor2d(
          batchInputs.map((input) => input.userFeatures),
          [batchInputs.length, userFeatures.length]
        );

        const postTensors = tf.tensor2d(
          batchInputs.map((input) => input.postFeatures),
          [batchInputs.length, batchInputs[0].postFeatures.length]
        );

        return {
          userFeatures: userTensors,
          postFeatures: postTensors,
        };
      });

      // Make predictions
      const predictionsTensor = model.predict(tensorInputs);
      const predictedScores = await predictionsTensor.data();

      // Cleanup tensors
      predictionsTensor.dispose();
      Object.values(tensorInputs).forEach((tensor) => tensor.dispose());

      // Store predictions with post information
      for (let j = 0; j < batch.length; j++) {
        predictions.push({
          postId: batch[j].id,
          score: predictedScores[j],
          post: batch[j],
        });
      }
    }

    // Sort by predicted score (descending)
    predictions.sort((a, b) => b.score - a.score);

    // Apply pagination
    const paginatedResults = predictions.slice(offset, offset + limit);

    // Format results
    const recommendations = {
      userId,
      recommendedAt: new Date().toISOString(),
      posts: paginatedResults.map((item) => ({
        postId: item.postId,
        score: item.score,
        category: item.post.category_id,
        isBettingTip: item.post.is_betting_tip,
      })),
    };

    // Cache the results (with 30-minute expiry)
    await setCache(cacheKey, JSON.stringify(recommendations), 30 * 60);

    return recommendations;
  } catch (error) {
    logger.error(
      `Error getting recommendations for ${userId}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Record a user interaction with content
 * @param {string} userId - User ID
 * @param {string} postId - Post ID
 * @param {string} interactionType - Type of interaction (view, like, comment, save, share)
 * @param {Object} metadata - Additional interaction data
 */
async function recordInteraction(
  userId,
  postId,
  interactionType,
  metadata = {}
) {
  try {
    // Save to database
    await saveInteraction(userId, postId, interactionType, metadata);

    // Invalidate cache for this user
    const cachePattern = `recommendations:${userId}:*`;
    await getCache().del(cachePattern);

    logger.info(
      `Recorded ${interactionType} interaction: User ${userId} with Post ${postId}`
    );
    return true;
  } catch (error) {
    logger.error(`Failed to record interaction: ${error.message}`);
    throw error;
  }
}

/**
 * Schedule a real-time update for a user's recommendations
 * @param {string} userId - The user ID
 */
function scheduleRealtimeUpdate(userId) {
  // Add to real-time update queue if not already there
  if (!realtimeUpdateQueue.has(userId)) {
    realtimeUpdateQueue.add(userId);
    logger.info(`Scheduled real-time update for user ${userId}`);

    // Process the real-time update queue every 5 minutes
    if (realtimeUpdateQueue.size === 1) {
      scheduleJob("realtimeUpdates", "*/5 * * * *", processRealtimeUpdates);
    }
  }
}

/**
 * Process all pending real-time updates
 */
async function processRealtimeUpdates() {
  if (realtimeUpdateQueue.size === 0) {
    cancelJob("realtimeUpdates");
    return;
  }

  logger.info(
    `Processing real-time updates for ${realtimeUpdateQueue.size} users`
  );

  const userIdsToUpdate = [...realtimeUpdateQueue];
  realtimeUpdateQueue.clear();

  // Update each user's recommendations
  // In a real system, you might want to batch this for efficiency
  for (const userId of userIdsToUpdate) {
    try {
      // Invalidate user cache
      const cachePattern = `recommendations:${userId}:*`;
      await getCache().del(cachePattern);

      // Pre-compute new recommendations for common limits
      // This ensures the next request will be fast
      await getRecommendations(userId, 10, 0);
      await getRecommendations(userId, 20, 0);

      logger.info(`Updated recommendations for user ${userId}`);
    } catch (error) {
      logger.error(
        `Failed to update recommendations for ${userId}: ${error.message}`
      );
    }
  }
}

/**
 * Start a training job for the recommendation model
 */
async function startTraining() {
  try {
    logger.info("Starting model training");
    await startTrainingJob();
    logger.info("Training completed successfully");
    return true;
  } catch (error) {
    logger.error(`Training failed: ${error.message}`);
    throw error;
  }
}

/**
 * Get the current status of the recommendation model
 */
async function getModelStatus() {
  try {
    const model = await loadModel();
    const lastTrainingTime = model.metadata?.lastTrainingTime || "Never";
    const dataPoints = model.metadata?.dataPoints || 0;
    const version = model.metadata?.version || "0.0.0";
    const accuracy = model.metadata?.accuracy || 0;

    return {
      status: model ? "loaded" : "not_loaded",
      lastTrainingTime,
      dataPoints,
      version,
      accuracy,
      realtimeUpdateQueueSize: realtimeUpdateQueue.size,
    };
  } catch (error) {
    logger.error(`Failed to get model status: ${error.message}`);
    return {
      status: "error",
      error: error.message,
    };
  }
}

module.exports = {
  getRecommendations,
  recordInteraction,
  scheduleRealtimeUpdate,
  startTraining,
  getModelStatus,
};
