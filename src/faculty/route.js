const express = require("express");

const {
  getDashboard,
  getMySchedules,
  getMyLoad,
  getPrefTimeDay,
  savePrefTImeDay,
  checkMyAvailabilityStatus,
  getMyProfile,
  updateMyProfile,
  checkOnboardingStatus
} = require("./facultyController");

const facultyRouter = express.Router();

facultyRouter.put("/availability", savePrefTImeDay);
facultyRouter.put("/profile/:id", updateMyProfile);

facultyRouter.get("/schedules/:id", getMySchedules);
facultyRouter.get("/load/:id", getMyLoad);
facultyRouter.get("/availability/:id", getPrefTimeDay);
facultyRouter.get("/availability-status/:id", checkMyAvailabilityStatus);
facultyRouter.get("/dashboard/:id", getDashboard);
facultyRouter.get("/profile/:id", getMyProfile);
facultyRouter.get("/onboarding-status/:id", checkOnboardingStatus);

module.exports = facultyRouter;
