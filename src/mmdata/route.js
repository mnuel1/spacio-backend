const express = require('express')

const { getDataMaster } = require('../mmdata/mmdata');

const router = express.Router()


router.get("/mdata", getDataMaster)


module.exports = router