const express = require('express')

const {
    getMySchedules,
    getMyLoad, 
    getPrefTimeDay,
    savePrefTImeDay
} = require('./facultyController')

const facultyRouter = express.Router()

facultyRouter.post('/availability', savePrefTImeDay)

facultyRouter.get('/schedules/:id', getMySchedules)
facultyRouter.get('/load/:id', getMyLoad)
facultyRouter.get('/availability/:id', getPrefTimeDay)


module.exports = facultyRouter