const express = require("express");

const {
  getDashboard,
  getMySchedules,
  getMyLoad,
  getPrefTimeDay,
  savePrefTImeDay,
  checkMyAvailabilityStatus,
} = require("./facultyController");

const facultyRouter = express.Router();

facultyRouter.put("/availability", savePrefTImeDay);

facultyRouter.get("/schedules/:id", getMySchedules);
facultyRouter.get("/load/:id", getMyLoad);
facultyRouter.get("/availability/:id", getPrefTimeDay);
facultyRouter.get("/availability-status/:id", checkMyAvailabilityStatus);
facultyRouter.get("/dashboard/:id", getDashboard);

module.exports = facultyRouter;
