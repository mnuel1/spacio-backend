const express = require('express')

const {
    editInfo,
    changePassword
} = require("./accountController");
const router = express.Router()


router.put("/edit/account/:id", editInfo)
router.put("change/password/:id", changePassword)


module.exports = router