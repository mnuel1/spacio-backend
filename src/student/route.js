const express = require('express')

const {
    getSchedule,
    getFaculty
} = require("./studentController")

const studentRouter = express.Router()

studentRouter.get("/schedules/:id", getSchedule)
studentRouter.get("/faculty", getFaculty)

module.exports = studentRouter