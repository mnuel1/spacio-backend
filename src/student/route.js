const express = require('express')

const {
    getSchedule,
    getFaculty
} = require("./studentController")

const studentRouter = express.Router()

studentRouter.get("/schedule/:id", getSchedule)
studentRouter.get("/faculty", getFaculty)

module.exports = studentRouter