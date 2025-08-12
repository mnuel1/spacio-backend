const express = require('express')

const { getDataMaster } = require('../mmdata/mmdata');

const router = express.Router()


router.get("/", getDataMaster)


module.exports = router