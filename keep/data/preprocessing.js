// src/data/preprocessing.js
const logger = require("../utils/logger");

/**
 * Preprocess user data into feature vectors for the model
 * @param {Object} userData - User data from the database
 * @returns {Array} Feature vector for the user
 */
async function preprocessUserFeatures(userData) {
  try {
    if (!userData) {
      throw new Error("User data is required");
    }

    // Calculate user activity features
    const viewCount = userData.viewedPosts?.length || 0;
    const likeCount = userData.likedPosts?.length || 0;
    const commentCount = userData.commentedPosts?.length || 0;
    const saveCount = userData.savedPosts?.length || 0;
    const shareCount = userData.sharedPosts?.length || 0;

    // Calculate engagement ratios (to normalize across users)
    const totalInteractions =
      viewCount + likeCount + commentCount + saveCount + shareCount;
    const likeRatio = totalInteractions > 0 ? likeCount / totalInteractions : 0;
    const commentRatio =
      totalInteractions > 0 ? commentCount / totalInteractions : 0;
    const saveRatio = totalInteractions > 0 ? saveCount / totalInteractions : 0;
    const shareRatio =
      totalInteractions > 0 ? shareCount / totalInteractions : 0;

    // Calculate betting tip engagement
    const bettingTipInteractions = userData.bettingTipInteractions?.length || 0;
    const bettingTipRatio =
      totalInteractions > 0 ? bettingTipInteractions / totalInteractions : 0;

    // Calculate category preferences
    // Create a map of category_id -> interaction count
    const categoryInteractions = {};

    // Process viewed posts
    userData.viewedPosts?.forEach((post) => {
      if (post.category_id) {
        categoryInteractions[post.category_id] =
          (categoryInteractions[post.category_id] || 0) + 1;
      }
    });

    // Process liked posts (with higher weight)
    userData.likedPosts?.forEach((post) => {
      if (post.category_id) {
        categoryInteractions[post.category_id] =
          (categoryInteractions[post.category_id] || 0) + 3;
      }
    });

    // Process saved posts (with higher weight)
    userData.savedPosts?.forEach((post) => {
      if (post.category_id) {
        categoryInteractions[post.category_id] =
          (categoryInteractions[post.category_id] || 0) + 5;
      }
    });

    // Find the top 3 categories
    const topCategories = Object.entries(categoryInteractions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((entry) => parseInt(entry[0]));

    // User recency features (days since registration)
    const accountAgeDays = userData.basic
      ? Math.floor(
          (new Date() - new Date(userData.basic.created_at)) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

    // Recent activity intensity
    const now = new Date();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const recentViews =
      userData.viewedPosts?.filter(
        (post) => new Date(post.created_at) >= oneWeekAgo
      ).length || 0;

    const recentLikes =
      userData.likedPosts?.filter(
        (post) => new Date(post.created_at) >= oneWeekAgo
      ).length || 0;

    // Combine all features into a vector
    const features = [
      // Activity counts
      Math.min(viewCount / 100, 1), // Normalize to 0-1 range
      Math.min(likeCount / 50, 1),
      Math.min(commentCount / 25, 1),
      Math.min(saveCount / 25, 1),
      Math.min(shareCount / 10, 1),

      // Engagement ratios
      likeRatio,
      commentRatio,
      saveRatio,
      shareRatio,

      // Betting tip engagement
      bettingTipRatio,

      // Account age (normalized)
      Math.min(accountAgeDays / 365, 3) / 3, // Cap at 3 years

      // Recent activity intensity (normalized)
      Math.min(recentViews / 20, 1),
      Math.min(recentLikes / 10, 1),
    ];

    // Add category preferences (one-hot encoding for top categories)
    // Assuming we have up to 20 categories
    for (let i = 1; i <= 20; i++) {
      features.push(topCategories.includes(i) ? 1 : 0);
    }

    // Add explicitly preferred categories
    for (let i = 1; i <= 20; i++) {
      features.push(userData.preferredCategories?.includes(i) ? 1 : 0);
    }

    return features;
  } catch (error) {
    logger.error(`Error preprocessing user features: ${error.message}`);
    throw error;
  }
}

/**
 * Preprocess training data for the recommendation model
 * @param {Array} trainingData - Raw training data from the database
 * @returns {Object} Processed training data ready for model training
 */
async function preprocessTrainingData(trainingData) {
  try {
    // Initialize arrays to hold the processed data
    const userFeatures = [];
    const contentFeatures = [];
    const labels = [];

    // Track unique users and posts for feature mapping
    const uniqueUsers = new Set();
    const uniquePosts = new Set();
    const uniqueCategories = new Set();

    // First pass: collect unique entities
    trainingData.forEach((example) => {
      uniqueUsers.add(example.user_id);
      uniquePosts.add(example.post_id);
      uniqueCategories.add(example.category_id);
    });

    // Create mapping dictionaries
    const userIdToIndex = {};
    Array.from(uniqueUsers)
      .sort()
      .forEach((userId, index) => {
        userIdToIndex[userId] = index;
      });

    const postIdToIndex = {};
    Array.from(uniquePosts)
      .sort()
      .forEach((postId, index) => {
        postIdToIndex[postId] = index;
      });

    const categoryIdToIndex = {};
    Array.from(uniqueCategories)
      .sort()
      .forEach((categoryId, index) => {
        categoryIdToIndex[categoryId] = index;
      });

    // Second pass: create feature vectors
    trainingData.forEach((example) => {
      // User features
      const userIndex = userIdToIndex[example.user_id];
      const userViewCount = example.user_view_count || 0;
      const userLikeCount = example.user_like_count || 0;
      const userSaveCount = example.user_save_count || 0;

      // Calculate engagement ratios
      const totalInteractions = userViewCount + userLikeCount + userSaveCount;
      const likeRatio =
        totalInteractions > 0 ? userLikeCount / totalInteractions : 0;
      const saveRatio =
        totalInteractions > 0 ? userSaveCount / totalInteractions : 0;

      // Create user preferred categories array
      const userPreferredCategories = example.user_preferred_categories || [];

      // User feature vector
      const userFeatureVector = [
        userIndex / uniqueUsers.size, // Normalized user ID
        Math.min(userViewCount / 100, 1), // Normalize to 0-1 range
        Math.min(userLikeCount / 50, 1),
        Math.min(userSaveCount / 25, 1),
        likeRatio,
        saveRatio,
      ];

      // Add category preferences (one-hot encoding)
      for (let categoryId of Array.from(uniqueCategories).sort()) {
        userFeatureVector.push(
          userPreferredCategories.includes(categoryId) ? 1 : 0
        );
      }

      // Content features
      const postIndex = postIdToIndex[example.post_id];
      const categoryIndex = categoryIdToIndex[example.category_id];

      // Content feature vector
      const contentFeatureVector = [
        postIndex / uniquePosts.size, // Normalized post ID
        categoryIndex / uniqueCategories.size, // Normalized category ID
        example.is_most_popular ? 1 : 0,
        example.is_recommended ? 1 : 0,
        example.has_image ? 1 : 0,
        example.has_video ? 1 : 0,
        example.is_betting_tip ? 1 : 0,
      ];

      // Add the feature vectors and label to our arrays
      userFeatures.push(userFeatureVector);
      contentFeatures.push(contentFeatureVector);
      labels.push(example.label);
    });

    return {
      userFeatures,
      contentFeatures,
      labels,
      userFeatureMap: userIdToIndex,
      contentFeatureMap: postIdToIndex,
      categoryFeatureMap: categoryIdToIndex,
    };
  } catch (error) {
    logger.error(`Error preprocessing training data: ${error.message}`);
    throw error;
  }
}

module.exports = {
  preprocessUserFeatures,
  preprocessTrainingData,
};
