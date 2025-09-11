const express = require("express");

const {
    getLogs,
    getSchedule
} = require("./deanController")


const router = express.Router();

router.get("/logs", getLogs)
router.get("/faculty", getSchedule)

module.exports = router;
