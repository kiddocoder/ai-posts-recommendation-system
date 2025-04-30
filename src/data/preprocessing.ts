import { Pool } from "pg"
import { dbConfig } from "../config/database"
import { logger } from "../utils/logger"

// Database connection pool
const pool = new Pool(dbConfig)

// Clean and prepare data for training
export async function cleanData(): Promise<void> {
  try {
    // Remove duplicate interactions
    await pool.query(`
      DELETE FROM user_interactions a
      USING user_interactions b
      WHERE a.id > b.id
        AND a.user_id = b.user_id
        AND a.content_id = b.content_id
        AND a.action = b.action
        AND a.created_at = b.created_at
    `)

    // Remove interactions with non-existent content
    await pool.query(`
      DELETE FROM user_interactions
      WHERE content_id NOT IN (SELECT id FROM posts)
    `)

    // Remove interactions with non-existent users
    await pool.query(`
      DELETE FROM user_interactions
      WHERE user_id NOT IN (SELECT id FROM users)
    `)

    logger.info("Data cleaning completed successfully")
  } catch (error) {
    logger.error("Error cleaning data", error)
    throw error
  }
}

// Get training data statistics
export async function getDataStats(): Promise<{
  userCount: number
  contentCount: number
  interactionCount: number
  categoryCount: number
  avgInteractionsPerUser: number
  avgInteractionsPerContent: number
}> {
  try {
    const userCountQuery = `SELECT COUNT(DISTINCT id) as count FROM users`
    const contentCountQuery = `SELECT COUNT(DISTINCT id) as count FROM posts`
    const interactionCountQuery = `SELECT COUNT(*) as count FROM user_interactions`
    const categoryCountQuery = `SELECT COUNT(DISTINCT id) as count FROM categories`
    const avgPerUserQuery = `
      SELECT AVG(interaction_count) as avg
      FROM (
        SELECT user_id, COUNT(*) as interaction_count
        FROM user_interactions
        GROUP BY user_id
      ) as user_counts
    `
    const avgPerContentQuery = `
      SELECT AVG(interaction_count) as avg
      FROM (
        SELECT content_id, COUNT(*) as interaction_count
        FROM user_interactions
        GROUP BY content_id
      ) as content_counts
    `

    const [userResult, contentResult, interactionResult, categoryResult, avgPerUserResult, avgPerContentResult] =
      await Promise.all([
        pool.query(userCountQuery),
        pool.query(contentCountQuery),
        pool.query(interactionCountQuery),
        pool.query(categoryCountQuery),
        pool.query(avgPerUserQuery),
        pool.query(avgPerContentQuery),
      ])

    return {
      userCount: Number.parseInt(userResult.rows[0].count),
      contentCount: Number.parseInt(contentResult.rows[0].count),
      interactionCount: Number.parseInt(interactionResult.rows[0].count),
      categoryCount: Number.parseInt(categoryResult.rows[0].count),
      avgInteractionsPerUser: Number.parseFloat(avgPerUserResult.rows[0].avg),
      avgInteractionsPerContent: Number.parseFloat(avgPerContentResult.rows[0].avg),
    }
  } catch (error) {
    logger.error("Error getting data statistics", error)
    throw error
  }
}

// Identify and handle outliers
export async function handleOutliers(): Promise<void> {
  try {
    // Cap extremely high interaction counts (potential bots or spam)
    const maxInteractionsPerDay = 100

    await pool.query(
      `
      DELETE FROM user_interactions
      WHERE user_id IN (
        SELECT user_id
        FROM (
          SELECT 
            user_id,
            COUNT(*) / (EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 86400) as interactions_per_day
          FROM user_interactions
          GROUP BY user_id
          HAVING COUNT(*) > 10 AND MAX(created_at) != MIN(created_at)
        ) as user_rates
        WHERE interactions_per_day > $1
      )
    `,
      [maxInteractionsPerDay],
    )

    logger.info("Outlier handling completed successfully")
  } catch (error) {
    logger.error("Error handling outliers", error)
    throw error
  }
}

// Split data into training and validation sets
export async function splitTrainingValidation(validationRatio = 0.2): Promise<{
  trainingInteractionIds: string[]
  validationInteractionIds: string[]
}> {
  try {
    // Get all interaction IDs
    const query = `SELECT id FROM user_interactions ORDER BY created_at`
    const result = await pool.query(query)

    const allIds = result.rows.map((row) => row.id)
    const totalCount = allIds.length
    const validationCount = Math.floor(totalCount * validationRatio)

    // Use the most recent interactions for validation
    const validationInteractionIds = allIds.slice(totalCount - validationCount)
    const trainingInteractionIds = allIds.slice(0, totalCount - validationCount)

    return {
      trainingInteractionIds,
      validationInteractionIds,
    }
  } catch (error) {
    logger.error("Error splitting data", error)
    throw error
  }
}
