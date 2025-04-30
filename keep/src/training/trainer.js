// src/training/trainer.js
const tf = require("@tensorflow/tfjs-node");
const { loadModel, saveModel } = require("../models/rankingmodel");
const { fetchTrainingData } = require("../data/dataloader");
const { preprocessTrainingData } = require("../data/preprocessing");
const logger = require("../utils/logger");
const { getCache, setCache } = require("../utils/cache");
const modelConfig = require("../../config/model");

// Flag to prevent multiple training jobs from running simultaneously
let isTrainingInProgress = false;

/**
 * Start a training job for the recommendation model
 */
async function startTrainingJob() {
  if (isTrainingInProgress) {
    logger.warn("Training job already in progress, skipping");
    return false;
  }

  try {
    isTrainingInProgress = true;
    logger.info("Starting model training job");

    // Load the current model
    const model = await loadModel();

    // Fetch training data from database
    const rawTrainingData = await fetchTrainingData();
    logger.info(`Fetched ${rawTrainingData.length} training examples`);

    if (rawTrainingData.length === 0) {
      logger.warn("No training data available, skipping training");
      isTrainingInProgress = false;
      return false;
    }

    // Preprocess the data
    const {
      userFeatures,
      contentFeatures,
      labels,
      userFeatureMap,
      contentFeatureMap,
    } = await preprocessTrainingData(rawTrainingData);

    logger.info("Data preprocessing complete");

    // Convert to tensors
    const xs = {
      userFeatures: tf.tensor2d(userFeatures),
      postFeatures: tf.tensor2d(contentFeatures),
    };
    const ys = tf.tensor2d(labels, [labels.length, 1]);

    // Split into training and validation sets (80/20)
    const splitIdx = Math.floor(labels.length * 0.8);

    const trainXs = {
      userFeatures: xs.userFeatures.slice(
        [0, 0],
        [splitIdx, xs.userFeatures.shape[1]]
      ),
      postFeatures: xs.postFeatures.slice(
        [0, 0],
        [splitIdx, xs.postFeatures.shape[1]]
      ),
    };
    const trainYs = ys.slice([0, 0], [splitIdx, 1]);

    const valXs = {
      userFeatures: xs.userFeatures.slice(
        [splitIdx, 0],
        [-1, xs.userFeatures.shape[1]]
      ),
      postFeatures: xs.postFeatures.slice(
        [splitIdx, 0],
        [-1, xs.postFeatures.shape[1]]
      ),
    };
    const valYs = ys.slice([splitIdx, 0], [-1, 1]);

    // Train the model
    logger.info("Starting model training");

    const history = await model.fit(trainXs, trainYs, {
      epochs: modelConfig.epochs || 10,
      batchSize: modelConfig.batchSize || 32,
      validationData: [valXs, valYs],
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          logger.info(
            `Epoch ${epoch + 1}/${
              modelConfig.epochs || 10
            } - loss: ${logs.loss.toFixed(4)} - accuracy: ${logs.acc.toFixed(
              4
            )} - val_loss: ${logs.val_loss.toFixed(
              4
            )} - val_acc: ${logs.val_acc.toFixed(4)}`
          );
        },
      },
    });

    logger.info("Model training complete");

    // Calculate final accuracy
    const finalValAccuracy =
      history.history.val_acc[history.history.val_acc.length - 1];

    // Save the updated model
    await saveModel(model, {
      version: (parseFloat(model.metadata.version || "1.0") + 0.1).toFixed(1),
      lastTrainingTime: new Date().toISOString(),
      dataPoints: rawTrainingData.length,
      accuracy: finalValAccuracy,
      featureMaps: {
        userFeatureMap,
        contentFeatureMap,
      },
    });

    // Clear all recommendation caches to force fresh predictions with new model
    await getCache().flushDb();

    logger.info(`Model saved with accuracy: ${finalValAccuracy.toFixed(4)}`);

    // Clean up tensors
    Object.values(trainXs).forEach((tensor) => tensor.dispose());
    Object.values(valXs).forEach((tensor) => tensor.dispose());
    trainYs.dispose();
    valYs.dispose();

    isTrainingInProgress = false;
    return true;
  } catch (error) {
    logger.error(`Training failed: ${error.message}`);
    isTrainingInProgress = false;
    throw error;
  }
}
