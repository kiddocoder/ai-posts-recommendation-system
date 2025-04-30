import { Pool } from "pg"
import { dbConfig } from "../config/database"
import { logger } from "../utils/logger"
import type { ContentFeatures, UserInteraction } from "../types/features"

// Database connection pool
const pool = new Pool(dbConfig)

// Get recent content IDs for ranking
export async function getRecentContentIds(limit: number): Promise<string[]> {
  try {
    const query = `
      SELECT id FROM posts
      WHERE created_at > NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
      LIMIT $1
    `

    const result = await pool.query(query, [limit])
    return result.rows.map((row) => row.id)
  } catch (error) {
    logger.error("Error fetching recent content IDs", error)
    throw error
  }
}

// Get content features for a specific post
export async function getContentFeatures(contentId: string): Promise<ContentFeatures> {
  try {
    // Get basic post data
    const postQuery = `
      SELECT 
        p.id,
        p.title,
        p.category_id,
        p.is_most_popular,
        p.is_recommended,
        p.created_at,
        c.name as category_name,
        CASE WHEN bt.id IS NOT NULL THEN true ELSE false END as is_betting_tip
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN betting_tips bt ON p.id = bt.post_id
      WHERE p.id = $1
    `

    const postResult = await pool.query(postQuery, [contentId])

    if (postResult.rows.length === 0) {
      throw new Error(`Content with ID ${contentId} not found`)
    }

    const post = postResult.rows[0]

    // Get engagement metrics
    const metricsQuery = `
      SELECT
        COUNT(DISTINCT CASE WHEN action = 'view' THEN user_id END) as view_count,
        COUNT(DISTINCT CASE WHEN action = 'like' THEN user_id END) as like_count,
        COUNT(DISTINCT CASE WHEN action = 'comment' THEN user_id END) as comment_count,
        COUNT(DISTINCT CASE WHEN action = 'save' THEN user_id END) as save_count,
        COUNT(DISTINCT CASE WHEN action = 'share' THEN user_id END) as share_count
      FROM user_interactions
      WHERE content_id = $1
    `

    const metricsResult = await pool.query(metricsQuery, [contentId])
    const metrics = metricsResult.rows[0]

    // Get all categories for one-hot encoding
    const categoriesQuery = `SELECT id, name FROM categories ORDER BY id`
    const categoriesResult = await pool.query(categoriesQuery)
    const categories = categoriesResult.rows

    // Create one-hot encoded category vector
    const categoryVector = categories.map((category) => (category.id === post.category_id ? 1 : 0))

    // Calculate days old
    const createdAt = new Date(post.created_at)
    const now = new Date()
    const daysOld = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)

    return {
      contentId,
      title: post.title,
      categoryId: post.category_id,
      categoryName: post.category_name,
      categoryVector,
      isMostPopular: post.is_most_popular,
      isRecommended: post.is_recommended,
      isBettingTip: post.is_betting_tip,
      viewCount: metrics.view_count || 0,
      likeCount: metrics.like_count || 0,
      commentCount: metrics.comment_count || 0,
      saveCount: metrics.save_count || 0,
      shareCount: metrics.share_count || 0,
      daysOld,
    }
  } catch (error) {
    logger.error(`Error fetching content features for ID ${contentId}`, error)
    throw error
  }
}

// Get user interactions for training
export async function getUserInteractions(startDate: Date, endDate: Date, limit = 10000): Promise<UserInteraction[]> {
  try {
    const query = `
      SELECT
        ui.id,
        ui.user_id,
        ui.content_id,
        ui.action,
        ui.created_at,
        p.category_id
      FROM user_interactions ui
      JOIN posts p ON ui.content_id = p.id
      WHERE ui.created_at BETWEEN $1 AND $2
      ORDER BY ui.created_at DESC
      LIMIT $3
    `

    const result = await pool.query(query, [startDate, endDate, limit])

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      contentId: row.content_id,
      action: row.action,
      timestamp: row.created_at,
      categoryId: row.category_id,
    }))
  } catch (error) {
    logger.error("Error fetching user interactions", error)
    throw error
  }
}

// Get user category preferences
export async function getUserCategoryPreferences(userId: string): Promise<Map<string, number>> {
  try {
    // First check if user has explicit category preferences
    const explicitPrefsQuery = `
      SELECT category_id, preference_score
      FROM user_categories
      WHERE user_id = $1
    `

    const explicitResult = await pool.query(explicitPrefsQuery, [userId])

    // If user has explicit preferences, use those
    if (explicitResult.rows.length > 0) {
      const preferences = new Map<string, number>()
      explicitResult.rows.forEach((row) => {
        preferences.set(row.category_id, row.preference_score)
      })
      return preferences
    }

    // Otherwise, infer preferences from interactions
    const inferredPrefsQuery = `
      SELECT 
        p.category_id,
        COUNT(*) as interaction_count
      FROM user_interactions ui
      JOIN posts p ON ui.content_id = p.id
      WHERE ui.user_id = $1
      GROUP BY p.category_id
      ORDER BY interaction_count DESC
    `

    const inferredResult = await pool.query(inferredPrefsQuery, [userId])

    const preferences = new Map<string, number>()
    let totalInteractions = 0

    inferredResult.rows.forEach((row) => {
      totalInteractions += Number.parseInt(row.interaction_count)
    })

    // Normalize to get preference scores between 0 and 1
    inferredResult.rows.forEach((row) => {
      const score = totalInteractions > 0 ? Number.parseInt(row.interaction_count) / totalInteractions : 0
      preferences.set(row.category_id, score)
    })

    return preferences
  } catch (error) {
    logger.error(`Error fetching category preferences for user ${userId}`, error)
    throw error
  }
}
