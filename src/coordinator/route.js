const express = require("express");
const {
  createRoom,
  editRoom,
  deleteRoom,
  getRooms,
} = require("../coordinator/roomController");
const {
  createFaculty,
  updateFaculty,
  deleteFaculty,
  getFaculty,
  checkFacultyDataIntegrity,
} = require("../coordinator/facultyController");

const {
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getSchedule,
} = require("../coordinator/scheduleController");

const {
  getLoad,
  addSubject,
  removeSubject,
  reassignSubject,
  runAutoSchedule,
  getConflicts,
  updateConflict,
  checkTeachersAvailability,
  sectionSchedule,
} = require("../coordinator/loadController");

const {
  getUsers,
  deactivateUser,
  deleteUser,
  addUsersByFile,
} = require("../coordinator/userController");

const {
  getCurrentPeriod,
  getAcademicPeriods,
  createAcademicPeriod,
  setCurrentPeriod,
  getOfficialsBoard,
  appointOfficial,
} = require("../coordinator/academicPeriodController");

const { getDashboard } = require("../coordinator/dashboardController");

const {
  sendTeacherAvailabilityNotification,
  testEmailService,
} = require("../coordinator/emailController");

const router = express.Router();
const multer = require("multer");

router.post("/room", createRoom);
router.put("/room/:id", editRoom);
router.delete("/room/:id", deleteRoom);
router.get("/rooms", getRooms);

router.post("/faculty", createFaculty);
router.put("/faculty/:id", updateFaculty);
router.delete("/faculty/:id", deleteFaculty);
router.get("/faculty", getFaculty);
router.get("/faculty/data-integrity/check", checkFacultyDataIntegrity);

router.post("/schedule", createSchedule);
router.put("/schedule/:id", updateSchedule);
router.delete("/schedule/:id", deleteSchedule);
router.get("/schedule", getSchedule);

router.post("/load/add/subject", addSubject);
router.delete("/load/remove/subject/:id", removeSubject);
router.put("/load/reassign/subject/:id", reassignSubject);
router.get("/load", getLoad);

router.get("/conflicts", getConflicts);
router.put("/conflicts/:id", updateConflict);

router.get("/teachers/availability/check", checkTeachersAvailability);

router.post("/auto/schedule", runAutoSchedule);
router.get("/section/schedule", sectionSchedule);

// Store files in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post("/users/signup", upload.single("file"), addUsersByFile);
router.get("/users", getUsers);
router.put("/users/deactivate/:id", deactivateUser);
router.delete("/users/:id", deleteUser);

router.get("/dashboard", getDashboard);

// Academic Period Management Routes
router.get("/academic-periods/current", getCurrentPeriod);
router.get("/academic-periods", getAcademicPeriods);
router.post("/academic-periods", createAcademicPeriod);
router.put("/academic-periods/:id/set-current", setCurrentPeriod);

// Officials Board Routes
router.get("/officials-board", getOfficialsBoard);
router.post("/officials-board/appoint", appointOfficial);

// Email Notification Routes
router.get("/notifications/test", testEmailService);
router.post(
  "/notifications/teachers/availability",
  sendTeacherAvailabilityNotification
);

module.exports = router;
