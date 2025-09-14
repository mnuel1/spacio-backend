const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const studentRouter = require("./student/route");
const facultyRouter = require("./faculty/route");
const coordinatorRouter = require("./coordinator/route");
const deanRouter = require("./dean/route");
const mmDataRouter = require("./mmdata/route");
const accountRouter = require("./account/route");
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ✅ Enable CORS
app.use(cors());

app.use(express.json());

// Routes
app.use("/student", studentRouter);
app.use("/faculty", facultyRouter);
app.use("/coordinator", coordinatorRouter);
app.use("/dean", deanRouter);
app.use("/mdata", mmDataRouter);
app.use("/account", accountRouter);

app.get("/", (req, res) => {
  res.send("Hello from Express with Supabase!");
});

module.exports = app;


