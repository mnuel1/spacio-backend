const express = require('express')

const {
    getSchedule,
    getFaculty,
    getDashboard
} = require("./studentController")

const studentRouter = express.Router()

studentRouter.get("/schedules/:id", getSchedule)
studentRouter.get("/faculty", getFaculty)
studentRouter.get("/dashboard/:id", getDashboard)

module.exports = studentRouter