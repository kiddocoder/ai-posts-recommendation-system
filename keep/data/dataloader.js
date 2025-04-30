// src/data/dataloader.js
const { Pool } = require("pg");
const dbConfig = require("../../config/database");
const logger = require("../utils/logger");

let pool;

/**
 * Initialize database connection
 */
async function connectDB() {
  try {
    pool = new Pool({
      user: dbConfig.user,
      host: dbConfig.host,
      database: dbConfig.database,
      password: dbConfig.password,
      port: dbConfig.port,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    const client = await pool.connect();
    client.release();

    logger.info("Successfully connected to PostgreSQL database");
    return true;
  } catch (error) {
    logger.error(`Database connection error: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch user data including their interactions and preferences
 * @param {string} userId - The user ID
 * @returns {Object} User data with interaction history
 */
async function fetchUserData(userId) {
  try {
    const userData = {};

    // Get basic user info
    const userQuery = `
      SELECT id, created_at, updated_at 
      FROM users 
      WHERE id = $1
    `;
    const userResult = await pool.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      logger.warn(`User ${userId} not found`);
      return null;
    }

    userData.basic = userResult.rows[0];

    // Get user's preferred categories
    const categoryQuery = `
      SELECT category_id 
      FROM user_categories 
      WHERE user_id = $1
    `;
    const categoryResult = await pool.query(categoryQuery, [userId]);
    userData.preferredCategories = categoryResult.rows.map(
      (row) => row.category_id
    );

    // Get viewed posts (last 100)
    const viewsQuery = `
      SELECT post_id, created_at 
      FROM user_interactions 
      WHERE user_id = $1 AND interaction_type = 'view' 
      ORDER BY created_at DESC 
      LIMIT 100
    `;
    const viewsResult = await pool.query(viewsQuery, [userId]);
    userData.viewedPosts = viewsResult.rows;

    // Get liked posts (all)
    const likesQuery = `
      SELECT post_id, created_at 
      FROM user_interactions 
      WHERE user_id = $1 AND interaction_type = 'like' 
      ORDER BY created_at DESC
    `;
    const likesResult = await pool.query(likesQuery, [userId]);
    userData.likedPosts = likesResult.rows;

    // Get commented posts (all)
    const commentsQuery = `
      SELECT post_id, created_at 
      FROM user_interactions 
      WHERE user_id = $1 AND interaction_type = 'comment' 
      ORDER BY created_at DESC
    `;
    const commentsResult = await pool.query(commentsQuery, [userId]);
    userData.commentedPosts = commentsResult.rows;

    // Get saved posts (all)
    const savesQuery = `
      SELECT post_id, created_at 
      FROM user_interactions 
      WHERE user_id = $1 AND interaction_type = 'save' 
      ORDER BY created_at DESC
    `;
    const savesResult = await pool.query(savesQuery, [userId]);
    userData.savedPosts = savesResult.rows;

    // Get shared posts (all)
    const sharesQuery = `
      SELECT post_id, created_at 
      FROM user_interactions 
      WHERE user_id = $1 AND interaction_type = 'share' 
      ORDER BY created_at DESC
    `;
    const sharesResult = await pool.query(sharesQuery, [userId]);
    userData.sharedPosts = sharesResult.rows;

    // Get betting tip interactions (all)
    const bettingTipsQuery = `
      SELECT ui.post_id, ui.created_at, ui.interaction_type
      FROM user_interactions ui
      JOIN posts p ON ui.post_id = p.id
      WHERE ui.user_id = $1 AND p.is_betting_tip = true
      ORDER BY ui.created_at DESC
    `;
    const bettingTipsResult = await pool.query(bettingTipsQuery, [userId]);
    userData.bettingTipInteractions = bettingTipsResult.rows;

    logger.info(`Fetched data for user ${userId}`);
    return userData;
  } catch (error) {
    logger.error(`Error fetching user data: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch posts for recommendation candidates
 * @param {Array} excludeIds - Post IDs to exclude
 * @param {number} limit - Maximum number of posts to fetch
 * @returns {Array} Array of post objects
 */
async function fetchPostData(excludeIds = [], limit = 1000) {
  try {
    const query = `
      SELECT 
        p.id, 
        p.title, 
        p.category_id, 
        p.is_most_popular, 
        p.is_recommended,
        p.created_at,
        p.has_image,
        p.has_video,
        p.is_betting_tip,
        c.name as category_name
      FROM 
        posts p
      JOIN 
        categories c ON p.category_id = c.id
      WHERE 
        p.id NOT IN (${excludeIds.length > 0 ? excludeIds.join(",") : "0"})
      ORDER BY 
        p.created_at DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    logger.info(`Fetched ${result.rows.length} posts for recommendation`);
    return result.rows;
  } catch (error) {
    logger.error(`Error fetching posts: ${error.message}`);
    throw error;
  }
}

/**
 * Save a user interaction with content
 * @param {string} userId - User ID
 * @param {string} postId - Post ID
 * @param {string} interactionType - Type of interaction (view, like, comment, save, share)
 * @param {Object} metadata - Additional interaction data
 */
async function saveInteraction(userId, postId, interactionType, metadata = {}) {
  try {
    const query = `
      INSERT INTO user_interactions
        (user_id, post_id, interaction_type, metadata, created_at)
      VALUES
        ($1, $2, $3, $4, NOW())
    `;

    await pool.query(query, [userId, postId, interactionType, metadata]);
    logger.info(
      `Saved ${interactionType} interaction for user ${userId} with post ${postId}`
    );
    return true;
  } catch (error) {
    logger.error(`Error saving interaction: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch training data for the recommendation model
 * @param {number} limit - Maximum number of training examples to fetch
 * @returns {Array} Array of training examples
 */
async function fetchTrainingData(limit = 100000) {
  try {
    // This query is designed to create training examples from user interactions
    // - Positive examples: actual interactions (likes, saves, comments, shares)
    // - Negative examples: posts that were viewed but not interacted with
    const query = `
      WITH user_interactions_summary AS (
        -- Positive interactions (likes, saves, comments, shares)
        SELECT 
          ui.user_id,
          ui.post_id,
          1 as label,  -- Positive example
          ui.created_at,
          ui.interaction_type
        FROM 
          user_interactions ui
        WHERE 
          ui.interaction_type IN ('like', 'save', 'comment', 'share')
        
        UNION ALL
        
        -- Negative examples (views without other interactions within 24 hours)
        SELECT 
          v.user_id,
          v.post_id,
          0 as label,  -- Negative example
          v.created_at,
          v.interaction_type
        FROM 
          user_interactions v
        LEFT JOIN 
          user_interactions pos ON 
            v.user_id = pos.user_id AND 
            v.post_id = pos.post_id AND 
            pos.interaction_type IN ('like', 'save', 'comment', 'share') AND
            pos.created_at BETWEEN v.created_at AND v.created_at + interval '24 hours'
        WHERE 
          v.interaction_type = 'view' AND
          pos.user_id IS NULL  -- No positive interaction found
      )
      
      SELECT 
        uis.user_id,
        uis.post_id,
        uis.label,
        uis.interaction_type,
        p.category_id,
        p.is_most_popular,
        p.is_recommended,
        p.has_image,
        p.has_video,
        p.is_betting_tip,
        array_agg(DISTINCT uc.category_id) as user_preferred_categories,
        COUNT(DISTINCT view.post_id) as user_view_count,
        COUNT(DISTINCT like.post_id) as user_like_count,
        COUNT(DISTINCT save.post_id) as user_save_count
      FROM 
        user_interactions_summary uis
      JOIN 
        posts p ON uis.post_id = p.id
      LEFT JOIN 
        user_categories uc ON uis.user_id = uc.user_id
      LEFT JOIN 
        user_interactions view ON 
          uis.user_id = view.user_id AND 
          view.interaction_type = 'view' AND
          view.created_at < uis.created_at
      LEFT JOIN 
        user_interactions like ON 
          uis.user_id = like.user_id AND 
          like.interaction_type = 'like' AND
          like.created_at < uis.created_at
      LEFT JOIN 
        user_interactions save ON 
          uis.user_id = save.user_id AND 
          save.interaction_type = 'save' AND
          save.created_at < uis.created_at
      GROUP BY 
        uis.user_id, uis.post_id, uis.label, uis.interaction_type,
        p.category_id, p.is_most_popular, p.is_recommended, 
        p.has_image, p.has_video, p.is_betting_tip
      ORDER BY 
        uis.created_at DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    logger.info(`Fetched ${result.rows.length} training examples`);
    return result.rows;
  } catch (error) {
    logger.error(`Error fetching training data: ${error.message}`);
    throw error;
  }
}

module.exports = {
  connectDB,
  fetchUserData,
  fetchPostData,
  saveInteraction,
  fetchTrainingData,
};
