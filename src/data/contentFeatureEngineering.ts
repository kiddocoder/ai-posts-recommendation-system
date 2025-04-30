import { Pool } from "pg"
import { dbConfig } from "../config/database"
import { logger } from "../utils/logger"
import type { ContentFeatures } from "../types/data"

// Database connection pool
const pool = new Pool(dbConfig)

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
