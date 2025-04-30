import type { Request, Response } from "express"
import { getRecommendationsForUser } from "../models/rankingModel"
import { getPopularPostsFromCache, cacheRecommendations } from "../utils/cache"
import { triggerModelTraining, getModelTrainingStatus } from "../training/trainer"
import { logger } from "../utils/logger"
import { recordMetric } from "../utils/metrics"

export async function getRecommendations(req: Request, res: Response): Promise<void> {
  const startTime = Date.now()
  const userId = req.params.userId

  try {
    // Get recommendations for user
    const recommendations = await getRecommendationsForUser(userId)

    // Cache the results
    await cacheRecommendations(userId, recommendations)

    // Record metrics
    recordMetric("recommendation_request", {
      userId,
      responseTime: Date.now() - startTime,
      recommendationCount: recommendations.length,
    })

    res.status(200).json({
      userId,
      recommendations,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error(`Error getting recommendations for user ${userId}`, error)
    res.status(500).json({ error: "Failed to generate recommendations" })
  }
}

export async function getPopularPosts(req: Request, res: Response): Promise<void> {
  try {
    const popularPosts = await getPopularPostsFromCache()
    res.status(200).json({
      posts: popularPosts,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error("Error getting popular posts", error)
    res.status(500).json({ error: "Failed to retrieve popular posts" })
  }
}

export async function triggerTraining(req: Request, res: Response): Promise<void> {
  try {
    const trainingJob = await triggerModelTraining()
    res.status(200).json({
      jobId: trainingJob.id,
      status: trainingJob.status,
      startedAt: trainingJob.startedAt,
    })
  } catch (error) {
    logger.error("Error triggering training", error)
    res.status(500).json({ error: "Failed to trigger training" })
  }
}

export async function getTrainingStatus(req: Request, res: Response): Promise<void> {
  try {
    const status = await getModelTrainingStatus()
    res.status(200).json(status)
  } catch (error) {
    logger.error("Error getting training status", error)
    res.status(500).json({ error: "Failed to get training status" })
  }
}
