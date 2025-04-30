// src/models/rankingmodel.js
const tf = require("@tensorflow/tfjs-node");
const path = require("path");
const fs = require("fs").promises;
const logger = require("../utils/logger");
const modelConfig = require("../../config/model");

// Path where the model is saved
const MODEL_PATH = path.join(__dirname, "../../data/models/ranking_model");

// In-memory model cache
let cachedModel = null;
let modelLoadTime = null;

/**
 * Create a new recommendation model using TensorFlow.js
 * This is a two-tower model that separately encodes user and content features
 * before combining them for the final prediction
 */
function createModel(userFeatureSize, contentFeatureSize) {
  // User embedding tower
  const userInput = tf.input({
    name: "userFeatures",
    shape: [userFeatureSize],
  });

  let userTower = tf.layers
    .dense({
      units: 64,
      activation: "relu",
      kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
    })
    .apply(userInput);

  userTower = tf.layers.dropout({ rate: 0.2 }).apply(userTower);

  userTower = tf.layers
    .dense({
      units: 32,
      activation: "relu",
      kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
    })
    .apply(userTower);

  // Content embedding tower
  const contentInput = tf.input({
    name: "postFeatures",
    shape: [contentFeatureSize],
  });

  let contentTower = tf.layers
    .dense({
      units: 64,
      activation: "relu",
      kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
    })
    .apply(contentInput);

  contentTower = tf.layers.dropout({ rate: 0.2 }).apply(contentTower);

  contentTower = tf.layers
    .dense({
      units: 32,
      activation: "relu",
      kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
    })
    .apply(contentTower);

  // Combine the two towers
  const concatenated = tf.layers.concatenate().apply([userTower, contentTower]);

  // Interaction layers
  let output = tf.layers
    .dense({
      units: 16,
      activation: "relu",
      kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
    })
    .apply(concatenated);

  output = tf.layers.dropout({ rate: 0.2 }).apply(output);

  // Final prediction layer (single output for ranking score)
  output = tf.layers
    .dense({
      units: 1,
      activation: "sigmoid",
      name: "prediction",
    })
    .apply(output);

  // Create and compile the model
  const model = tf.model({
    inputs: [userInput, contentInput],
    outputs: output,
  });

  model.compile({
    optimizer: tf.train.adam(modelConfig.learningRate || 0.001),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"],
  });

  return model;
}

/**
 * Load the saved model, or create a new one if it doesn't exist
 */
async function loadModel() {
  try {
    // If model is already loaded and less than 1 hour old, return cached version
    const ONE_HOUR = 60 * 60 * 1000;
    if (cachedModel && modelLoadTime && Date.now() - modelLoadTime < ONE_HOUR) {
      return cachedModel;
    }

    // Check if model exists on disk
    try {
      await fs.access(path.join(MODEL_PATH, "model.json"));
      logger.info("Loading existing model from disk");

      // Load the model
      cachedModel = await tf.loadLayersModel(
        `file://${path.join(MODEL_PATH, "model.json")}`
      );

      // Load metadata if it exists
      try {
        const metadataStr = await fs.readFile(
          path.join(MODEL_PATH, "metadata.json"),
          "utf8"
        );
        cachedModel.metadata = JSON.parse(metadataStr);
      } catch (err) {
        logger.warn("No metadata found for model");
        cachedModel.metadata = {
          version: "1.0.0",
          lastTrainingTime: new Date().toISOString(),
        };
      }
    } catch (err) {
      // Model doesn't exist, create a new one
      logger.info("No existing model found, creating new model");

      // Get feature sizes from config
      const { userFeatureSize, contentFeatureSize } = modelConfig;

      if (!userFeatureSize || !contentFeatureSize) {
        throw new Error("Model configuration is missing feature sizes");
      }

      cachedModel = createModel(userFeatureSize, contentFeatureSize);

      // Create default metadata
      cachedModel.metadata = {
        version: "1.0.0",
        lastTrainingTime: "Never",
        dataPoints: 0,
        accuracy: 0,
      };

      // Save the model
      await saveModel(cachedModel);
    }

    modelLoadTime = Date.now();
    return cachedModel;
  } catch (error) {
    logger.error(`Error loading model: ${error.message}`);
    throw error;
  }
}

/**
 * Save the model to disk
 */
async function saveModel(model, metadata = null) {
  try {
    // Create directory if it doesn't exist
    await fs.mkdir(MODEL_PATH, { recursive: true });

    // Save the model
    await model.save(`file://${MODEL_PATH}`);

    // Save metadata if provided
    if (metadata) {
      model.metadata = { ...model.metadata, ...metadata };
    }

    // Write metadata to file
    await fs.writeFile(
      path.join(MODEL_PATH, "metadata.json"),
      JSON.stringify(model.metadata, null, 2)
    );

    logger.info("Model saved successfully");
    return true;
  } catch (error) {
    logger.error(`Error saving model: ${error.message}`);
    throw error;
  }
}

/**
 * Predict using the model
 */
async function predict(userFeatures, contentFeatures) {
  try {
    const model = await loadModel();

    const prediction = tf.tidy(() => {
      // Convert inputs to tensors
      const userTensor = tf.tensor2d([userFeatures], [1, userFeatures.length]);
      const contentTensor = tf.tensor2d(
        [contentFeatures],
        [1, contentFeatures.length]
      );

      // Make prediction
      return model.predict([userTensor, contentTensor]);
    });

    // Get the value
    const score = await prediction.data();
    prediction.dispose();

    return score[0];
  } catch (error) {
    logger.error(`Prediction error: ${error.message}`);
    throw error;
  }
}

module.exports = {
  createModel,
  loadModel,
  saveModel,
  predict,
};
