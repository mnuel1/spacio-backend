const express = require('express')

const {
    getMySchedules,
    getMyLoad
} = require('./facultyController')

const facultyRouter = express.Router()


facultyRouter.get('/schedules/:id', getMySchedules)
facultyRouter.get('/load/:id', getMyLoad)


module.exports = facultyRouter