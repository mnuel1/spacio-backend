const express = require('express')

const {
    editInfo,
    changePassword,
    forgotPassword
} = require("./accountController");
const router = express.Router()


router.put("/edit/account/:id", editInfo)
router.put("/change/password/:id", changePassword)
router.put("/forgot/password", changePassword)


module.exports = router