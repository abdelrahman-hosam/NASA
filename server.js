const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

// Import controllers
const { automateRequest } = require("./API/automated");
const { checkAndUpdate, deleteOld } = require("./API/catastrophe");

// Init express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Health check
app.get("/", (req, res) => {
  res.status(200).json({ message: "Tempo Project API is running 🚀" });
});

// Prediction / Recommendation automation
app.post("/api/automate", automateRequest);

// Catastrophe system
app.get("/api/catastrophe/update", checkAndUpdate);
app.delete("/api/catastrophe/delete", deleteOld);

// Handle invalid routes
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`[INFO] Server running on http://localhost:${PORT}`);
});
