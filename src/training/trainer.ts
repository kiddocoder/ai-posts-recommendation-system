import { userEmbeddingModel } from "../models/userEmbedding"
import { contentEmbeddingModel } from "../models/contentEmbedding"
import { rankingModel } from "../models/rankingModel"
import { getUserInteractions } from "../data/dataLoader"
import { preprocessTrainingData } from "../data/featureEngineering"
import { cleanData, handleOutliers } from "../data/preprocessing"
import { logger } from "../utils/logger"
import { updatePopularPosts } from "../utils/cache"
import { config } from "../config/model"
import type { TrainingJob, TrainingStatus } from "../types/training"

// Store current training job
let currentTrainingJob: TrainingJob | null = null

// Train all models
export async function trainAllModels(): Promise<TrainingJob> {
  // Create a new training job
  const jobId = `train_${Date.now()}`
  currentTrainingJob = {
    id: jobId,
    status: "preparing",
    startedAt: new Date(),
    progress: 0,
    error: null,
  }

  try {
    logger.info(`Starting training job ${jobId}`)

    // Update job status
    currentTrainingJob.status = "cleaning"

    // Clean data
    await cleanData()
    await handleOutliers()

    // Get training data
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 90) // Use last 90 days of data

    currentTrainingJob.status = "loading_data"
    currentTrainingJob.progress = 10

    const interactions = await getUserInteractions(startDate, endDate, config.maxTrainingInteractions)

    // Preprocess data
    currentTrainingJob.status = "preprocessing"
    currentTrainingJob.progress = 20

    const { userFeatures, contentFeatures, trainingPairs } = await preprocessTrainingData(interactions, true)

    // Train user embedding model
    currentTrainingJob.status = "training_user_model"
    currentTrainingJob.progress = 30

    // Prepare user model training data
    const userIds = Array.from(userFeatures.keys())
    const userFeaturesList = userIds.map((id) => userFeatures.get(id)!)

    // Create engagement labels (simplified for training)
    const userEngagementLabels = userIds.map(() => {
      const label = Array(config.engagementTypeCount).fill(0)
      label[Math.floor(Math.random() * config.engagementTypeCount)] = 1 // Random engagement type for auxiliary task
      return label
    })

    // Train user model
    await userEmbeddingModel.train(userFeaturesList, userEngagementLabels)

    // Train content embedding model
    currentTrainingJob.status = "training_content_model"
    currentTrainingJob.progress = 50

    // Prepare content model training data
    const contentIds = Array.from(contentFeatures.keys())
    const contentFeaturesList = contentIds.map((id) => contentFeatures.get(id)!)

    // Create popularity labels (based on view count)
    const popularityThreshold = contentFeaturesList.map((f) => f.viewCount).sort((a, b) => b - a)[
      Math.floor(contentFeaturesList.length * 0.2)
    ] // Top 20% are "popular"

    const contentPopularityLabels = contentFeaturesList.map((features) =>
      features.viewCount >= popularityThreshold ? 1 : 0,
    )

    // Train content model
    await contentEmbeddingModel.train(contentFeaturesList, contentPopularityLabels)

    // Train ranking model
    currentTrainingJob.status = "training_ranking_model"
    currentTrainingJob.progress = 70

    // Prepare ranking model training data
    const userFeaturesForRanking: typeof userFeaturesList = []
    const contentFeaturesForRanking: typeof contentFeaturesList = []
    const interactionLabels: number[] = []

    trainingPairs.forEach((pair) => {
      const userFeature = userFeatures.get(pair.userId)
      const contentFeature = contentFeatures.get(pair.contentId)

      if (userFeature && contentFeature) {
        userFeaturesForRanking.push(userFeature)
        contentFeaturesForRanking.push(contentFeature)
        interactionLabels.push(pair.label)
      }
    })

    // Train ranking model
    await rankingModel.train(userFeaturesForRanking, contentFeaturesForRanking, interactionLabels)

    // Update popular posts cache
    currentTrainingJob.status = "updating_cache"
    currentTrainingJob.progress = 90

    await updatePopularPosts()

    // Complete training
    currentTrainingJob.status = "completed"
    currentTrainingJob.progress = 100
    currentTrainingJob.completedAt = new Date()

    logger.info(`Training job ${jobId} completed successfully`)

    return { ...currentTrainingJob }
  } catch (error) {
    logger.error(`Training job ${jobId} failed`, error)

    if (currentTrainingJob) {
      currentTrainingJob.status = "failed"
      currentTrainingJob.error = error instanceof Error ? error.message : String(error)
    }

    throw error
  }
}

// Trigger model training
export async function triggerModelTraining(): Promise<TrainingJob> {
  // Check if training is already in progress
  if (
    currentTrainingJob &&
    [
      "preparing",
      "cleaning",
      "loading_data",
      "preprocessing",
      "training_user_model",
      "training_content_model",
      "training_ranking_model",
      "updating_cache",
    ].includes(currentTrainingJob.status)
  ) {
    return { ...currentTrainingJob }
  }

  // Start new training job
  return trainAllModels()
}

// Get current training status
export async function getModelTrainingStatus(): Promise<TrainingStatus> {
  if (!currentTrainingJob) {
    return {
      isTraining: false,
      lastTrainingJob: null,
    }
  }

  return {
    isTraining: [
      "preparing",
      "cleaning",
      "loading_data",
      "preprocessing",
      "training_user_model",
      "training_content_model",
      "training_ranking_model",
      "updating_cache",
    ].includes(currentTrainingJob.status),
    lastTrainingJob: { ...currentTrainingJob },
  }
}
