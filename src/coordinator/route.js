const express = require('express')
const {
    createRoom,
    editRoom,
    deleteRoom,
    getRooms
} = require("../coordinator/roomController")
const {
    createFaculty,
    updateFaculty,
    deleteFaculty,
    getFaculty
} = require("../coordinator/facultyController")

const {
    createSChedule,
    updateSchedule,
    deleteSchedule,
    getSchedule,
} = require("../coordinator/scheduleController")

const {
    getLoad,
    addSubject,
    removeSubject,
    reassignSubject,
    runAutoSchedule,
    getConflicts,
    updateConflict
} = require("../coordinator/loadController")

const {
    getUsers,
    deactivateUser,
    deleteUser,
    addUsersByFile
} = require("../coordinator/userController")

const {
    getDashboard
} = require("../coordinator/dashboardController")

const router = express.Router()
const multer = require("multer")


router.post("/room", createRoom)
router.put("/room/:id", editRoom)
router.delete("/room/:id", deleteRoom)
router.get("/rooms", getRooms)


router.post("/faculty", createFaculty)
router.put("/faculty/:id", updateFaculty)
router.delete("/faculty/:id", deleteFaculty)
router.get("/faculty", getFaculty)

router.post("/schedule", createSChedule)
router.put("/schedule/:id", updateSchedule)
router.delete("/schedule/:id", deleteSchedule)
router.get("/schedule", getSchedule)

router.post("/load/add/subject", addSubject)
router.put("/load/remove/subject", removeSubject)
router.delete("/load/reassign/subject", reassignSubject)
router.get("/load", getLoad)

router.get("/conflicts", getConflicts)
router.put("/conflicts/:id", updateConflict)

router.post("/auto/schedule", runAutoSchedule)

const upload = multer({ dest: 'uploads/' });

router.post("/users/signup", upload.single('file'), addUsersByFile)
router.get("/users", getUsers)
router.put("/users/deactivate/:id", deactivateUser)
router.delete("/users/:id", deleteUser)

router.get("/dashboard", getDashboard)
module.exports = router