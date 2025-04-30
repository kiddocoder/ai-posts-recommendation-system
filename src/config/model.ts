// Model configuration
export const config = {
  // Embedding sizes
  userEmbeddingSize: 32,
  contentEmbeddingSize: 32,

  // Feature sizes
  userFeatureSize: 25, // Categories + interaction counts + temporal features
  contentFeatureSize: 20, // Categories + metadata + engagement metrics

  // Training parameters
  trainingEpochs: 10,
  batchSize: 64,
  engagementTypeCount: 5, // view, like, comment, save, share

  // Data limits
  maxTrainingInteractions: 100000,
  maxContentToRank: 500,

  // Recommendation parameters
  recommendationCount: 20,
  popularPostsCount: 10,

  // Training schedule
  trainingSchedule: "0 2 * * *", // 2 AM daily (cron format)
  trainOnStartup: true,
}
