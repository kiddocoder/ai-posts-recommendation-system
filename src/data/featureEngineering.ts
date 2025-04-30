import { getUserCategoryPreferences, getUserInteractions } from "./dataLoader"
import { logger } from "../utils/logger"
import type { UserFeatures } from "../types/features"
import type { UserInteraction, ContentFeatures } from "../types/data"
import { getContentFeatures } from "./contentFeatureEngineering"

// Get user features for recommendation
export async function getUserFeatures(userId: string): Promise<UserFeatures> {
  try {
    // Get category preferences
    const categoryPreferences = await getUserCategoryPreferences(userId)

    // Get recent user interactions (last 30 days)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    const interactions = await getUserInteractions(startDate, endDate)
    const userInteractions = interactions.filter((interaction) => interaction.userId === userId)

    // Count interaction types
    let viewCount = 0
    let likeCount = 0
    let commentCount = 0
    let saveCount = 0
    let shareCount = 0
    let bettingTipInteractions = 0

    // Track time patterns
    const timeOfDayCount = Array(6).fill(0) // 4-hour blocks
    const dayOfWeekCount = Array(7).fill(0) // days of week

    // Process interactions
    userInteractions.forEach((interaction) => {
      // Count by action type
      switch (interaction.action) {
        case "view":
          viewCount++
          break
        case "like":
          likeCount++
          break
        case "comment":
          commentCount++
          break
        case "save":
          saveCount++
          break
        case "share":
          shareCount++
          break
      }

      // Check if interaction is with betting tip
      if (interaction.contentId.startsWith("betting_")) {
        bettingTipInteractions++
      }

      // Track time patterns
      const timestamp = new Date(interaction.timestamp)
      const hour = timestamp.getHours()
      const dayOfWeek = timestamp.getDay()

      // 4-hour blocks (0-3, 4-7, 8-11, 12-15, 16-19, 20-23)
      const timeBlock = Math.floor(hour / 4)
      timeOfDayCount[timeBlock]++

      // Day of week (0 = Sunday, 6 = Saturday)
      dayOfWeekCount[dayOfWeek]++
    })

    // Normalize time patterns
    const totalTimeInteractions = timeOfDayCount.reduce((sum, count) => sum + count, 0)
    const timeOfDayActivity = timeOfDayCount.map((count) =>
      totalTimeInteractions > 0 ? count / totalTimeInteractions : 0,
    )

    const totalDayInteractions = dayOfWeekCount.reduce((sum, count) => sum + count, 0)
    const dayOfWeekActivity = dayOfWeekCount.map((count) =>
      totalDayInteractions > 0 ? count / totalDayInteractions : 0,
    )

    // Get all categories for one-hot encoding
    const allCategories = await getAllCategories()

    // Create category preference vector
    const categoryPreferenceVector = allCategories.map((categoryId) => {
      return categoryPreferences.has(categoryId) ? categoryPreferences.get(categoryId)! : 0
    })

    return {
      userId,
      categoryPreferences: categoryPreferenceVector,
      viewCount,
      likeCount,
      commentCount,
      saveCount,
      shareCount,
      bettingTipInteractions,
      timeOfDayActivity,
      dayOfWeekActivity,
    }
  } catch (error) {
    logger.error(`Error generating user features for user ${userId}`, error)
    throw error
  }
}

// Helper to get all category IDs
async function getAllCategories(): Promise<string[]> {
  try {
    const { Pool } = require("pg")
    const pool = new Pool(require("../config/database").dbConfig)

    const query = `SELECT id FROM categories ORDER BY id`
    const result = await pool.query(query)

    return result.rows.map((row: any) => row.id)
  } catch (error) {
    logger.error("Error fetching categories", error)
    throw error
  }
}

// Preprocess training data
export async function preprocessTrainingData(
  interactions: UserInteraction[],
  sampleNegatives = true,
): Promise<{
  userFeatures: Map<string, UserFeatures>
  contentFeatures: Map<string, ContentFeatures>
  trainingPairs: Array<{ userId: string; contentId: string; label: number }>
}> {
  try {
    const userIds = new Set<string>()
    const contentIds = new Set<string>()
    const positiveInteractions = new Set<string>()

    // Extract unique users and content
    interactions.forEach((interaction) => {
      userIds.add(interaction.userId)
      contentIds.add(interaction.contentId)

      // Consider views, likes, comments, saves as positive interactions
      if (["like", "comment", "save"].includes(interaction.action)) {
        positiveInteractions.add(`${interaction.userId}:${interaction.contentId}`)
      }
    })

    // Get features for all users
    const userFeatures = new Map<string, UserFeatures>()
    for (const userId of userIds) {
      userFeatures.set(userId, await getUserFeatures(userId))
    }

    // Get features for all content
    const contentFeatures = new Map<string, ContentFeatures>()
    for (const contentId of contentIds) {
      contentFeatures.set(contentId, await getContentFeatures(contentId))
    }

    // Create training pairs
    const trainingPairs: Array<{ userId: string; contentId: string; label: number }> = []

    // Add positive examples
    for (const key of positiveInteractions) {
      const [userId, contentId] = key.split(":")
      trainingPairs.push({
        userId,
        contentId,
        label: 1,
      })
    }

    // Sample negative examples if requested
    if (sampleNegatives) {
      const userIdArray = Array.from(userIds)
      const contentIdArray = Array.from(contentIds)

      // Create roughly the same number of negative examples as positive
      const negativeCount = Math.min(trainingPairs.length * 2, (userIdArray.length * contentIdArray.length) / 10)

      for (let i = 0; i < negativeCount; i++) {
        const userId = userIdArray[Math.floor(Math.random() * userIdArray.length)]
        const contentId = contentIdArray[Math.floor(Math.random() * contentIdArray.length)]

        // Skip if this is a positive interaction
        if (positiveInteractions.has(`${userId}:${contentId}`)) {
          continue
        }

        trainingPairs.push({
          userId,
          contentId,
          label: 0,
        })
      }
    }

    return {
      userFeatures,
      contentFeatures,
      trainingPairs,
    }
  } catch (error) {
    logger.error("Error preprocessing training data", error)
    throw error
  }
}
