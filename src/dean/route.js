const express = require("express");

const {
    recordLog,
    getLogs,
    getSchedule
} = require("./deanController")


const router = express.Router();

router.post("/logs", recordLog)
router.get("/logs", getLogs)
router.get("/faculty", getSchedule)

module.exports = router;
