import { userEmbeddingModel } from "../src/models/userEmbedding"
import { contentEmbeddingModel } from "../src/models/contentEmbedding"
import { rankingModel } from "../src/models/rankingModel"
import { getUserInteractions } from "../src/data/dataLoader"
import { preprocessTrainingData } from "../src/data/featureEngineering"
import { logger } from "../src/utils/logger"

async function evaluateModels() {
  try {
    logger.info("Starting model evaluation")

    // Get evaluation data (last 7 days)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)

    const interactions = await getUserInteractions(startDate, endDate, 10000)

    // Preprocess data
    const { userFeatures, contentFeatures, trainingPairs } = await preprocessTrainingData(interactions, true)

    // Evaluate ranking model
    let correctPredictions = 0
    let totalPredictions = 0

    for (const pair of trainingPairs) {
      const userFeature = userFeatures.get(pair.userId)
      const contentFeature = contentFeatures.get(pair.contentId)

      if (userFeature && contentFeature) {
        // Get embeddings
        const userEmbedding = await userEmbeddingModel.getUserEmbedding(userFeature)
        const contentEmbedding = await contentEmbeddingModel.getContentEmbedding(contentFeature)

        // Predict engagement
        const predictedScore = await rankingModel.predictEngagement(userEmbedding, contentEmbedding)
        const predictedLabel = predictedScore > 0.5 ? 1 : 0

        // Check if prediction is correct
        if (predictedLabel === pair.label) {
          correctPredictions++
        }

        totalPredictions++
      }
    }

    // Calculate accuracy
    const accuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0

    logger.info(`Evaluation results:`)
    logger.info(`Total predictions: ${totalPredictions}`)
    logger.info(`Correct predictions: ${correctPredictions}`)
    logger.info(`Accuracy: ${(accuracy * 100).toFixed(2)}%`)

    return {
      totalPredictions,
      correctPredictions,
      accuracy,
    }
  } catch (error) {
    logger.error("Error evaluating models", error)
    throw error
  }
}

evaluateModels()
  .then(() => {
    logger.info("Evaluation completed")
    process.exit(0)
  })
  .catch((error) => {
    logger.error("Evaluation failed", error)
    process.exit(1)
  })
