import { createClient } from "redis"
import { getRecentContentIds, getContentFeatures } from "../data/dataLoader"
import { config } from "../config/server"
import { logger } from "./logger"

// Redis client
let redisClient: ReturnType<typeof createClient> | null = null

// Initialize Redis client
async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({
      url: config.redis.url,
    })

    redisClient.on("error", (err) => {
      logger.error("Redis client error", err)
    })

    await redisClient.connect()
  }

  return redisClient
}

// Cache recommendations for a user
export async function cacheRecommendations(userId: string, recommendations: string[]): Promise<void> {
  try {
    const client = await getRedisClient()
    const key = `recommendations:${userId}`

    // Store recommendations as JSON
    await client.set(key, JSON.stringify(recommendations))

    // Set expiration (30 minutes)
    await client.expire(key, 1800)

    logger.debug(`Cached recommendations for user ${userId}`)
  } catch (error) {
    logger.error(`Error caching recommendations for user ${userId}`, error)
    // Continue execution even if caching fails
  }
}

// Get cached recommendations for a user
export async function getCachedRecommendations(userId: string): Promise<string[] | null> {
  try {
    const client = await getRedisClient()
    const key = `recommendations:${userId}`

    const cachedData = await client.get(key)

    if (!cachedData) {
      return null
    }

    return JSON.parse(cachedData)
  } catch (error) {
    logger.error(`Error getting cached recommendations for user ${userId}`, error)
    return null
  }
}

// Update popular posts cache
export async function updatePopularPosts(): Promise<void> {
  try {
    // Get recent content
    const contentIds = await getRecentContentIds(100)

    // Get features for each content
    const contentWithFeatures = await Promise.all(
      contentIds.map(async (id) => {
        const features = await getContentFeatures(id)
        return {
          id,
          features,
        }
      }),
    )

    // Sort by popularity (view count)
    contentWithFeatures.sort((a, b) => b.features.viewCount - a.features.viewCount)

    // Take top N
    const popularPostIds = contentWithFeatures.slice(0, config.popularPostsCount).map((item) => item.id)

    // Cache popular posts
    const client = await getRedisClient()
    await client.set("popular_posts", JSON.stringify(popularPostIds))

    // Set expiration (6 hours)
    await client.expire("popular_posts", 21600)

    logger.info(`Updated popular posts cache with ${popularPostIds.length} posts`)
  } catch (error) {
    logger.error("Error updating popular posts cache", error)
    throw error
  }
}

// Get popular posts from cache
export async function getPopularPostsFromCache(): Promise<string[]> {
  try {
    const client = await getRedisClient()
    const cachedData = await client.get("popular_posts")

    if (!cachedData) {
      // If not in cache, update and return
      await updatePopularPosts()
      return getPopularPostsFromCache()
    }

    return JSON.parse(cachedData)
  } catch (error) {
    logger.error("Error getting popular posts from cache", error)
    throw error
  }
}

// Clear all cache
export async function clearCache(): Promise<void> {
  try {
    const client = await getRedisClient()
    await client.flushAll()
    logger.info("Cache cleared successfully")
  } catch (error) {
    logger.error("Error clearing cache", error)
    throw error
  }
}
