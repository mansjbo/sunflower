const express = require("express");
const router = express.Router();

const { getTimestamp } = require("../config/lab");

router.get("/", (req, res) => {
	res.send("Api working fine....");
});

module.exports = router;
