const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const crypto = require("crypto");
const {
  loginAuth,
  tokenAuth,
  newUserValidation,
} = require("../config/middleware");
const { getTimestamp } = require("../config/lab");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config({ path: "./.env" });
// const { exec } = require("child_process");

// New Account

router.post("/", async (req, res) => {
  var { fname, lname, username, password, contacts } = req.body;
  if (fname.length < 3) {
    return res.status(500).json({
      message: `الاسم قصير جدا، يجب أن لا يقل عن 3 أحرف`,
      status: "fail",
    });
  }

  if (lname.length < 3) {
    return res.status(500).json({
      message: `اللقب قصير جدا، يجب أن لا يقل عن 3 أحرف`,
      status: "fail",
    });
  }

  if (username.length < 6) {
    return res.status(500).json({
      message: `اسم المستخدم قصير جدا، يجب أن لا يقل اسم المستخدم عن 6 خانات`,
      status: "fail",
    });
  }

  if (username.length > 14) {
    return res.status(500).json({
      message: `اسم المستخدم طويل جدا، يجب أن لا يزيد اسم المستخدم عن 14 خانة`,
      status: "fail",
    });
  }

  if (password.length < 10) {
    return res.status(500).json({
      message: `كلمة المرور قصيرة جدا، يجب أن لا تقل كلمة المرور عن 10 خانات`,
      status: "fail",
    });
  }

  if (password.length > 18) {
    return res.status(500).json({
      message: `كلمة المرور طويلة جدا، يجب أن لا تزيد كلمة المرور عن 18 خانة`,
      status: "fail",
    });
  }

  if (contacts == undefined) {
    contacts = [];
  }
  // console.log(contacts);

  try {
    const id = crypto.randomBytes(16).toString("hex");
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = `INSERT INTO USERS (__id__,_firstName_, _lastName_, _username_, _password_, _contacts_, _config_) 
                        VALUES ('${id}', '${fname}', '${lname}', '${username}', '${hashedPassword}',
                        '${JSON.stringify(contacts)}', '${JSON.stringify({
      createdAt: getTimestamp(),
    })}' )`;
    console.log(sql);
    const insert = await pool.query(sql);
    // await pool.query(`INSERT INTO PERMISSIONS (__id__) VALUES (?)`, [id]);

    res
      .status(201)
      .json({ message: "تم انشاء الحساب بنجاح", status: "success" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// Retrieve Account Data
router.get("/:id", async (req, res) => {
  try {
    // console.log();
    const { id } = req.params;
    console.log(
      `SELECT _firstName_ AS 'first_name', _lastName_ AS 'last_name', _username_ AS 'Username', _password_ AS 'Password' FROM USERS WHERE __id__ = '${id}'`
    );
    const [user] = await pool.query(
      `SELECT _firstName_ AS 'first_name', _lastName_ AS 'last_name', _username_ AS 'Username', _contacts_ AS 'Contacts' FROM USERS WHERE __id__ = '${id}'`
    );
    // console.log(user[0]);
    res.status(201).json({
      message: "تم استرجاع البيانات بنجاح",
      status: "success",
      data: user[0],
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// User Login
router.post("/login", loginAuth, async (req, res) => {
  try {
    // console.log(crypto.randomBytes(64).toString("hex"));
    // console.log(req.user);
    const token = jwt.sign(
      { user: req.user, permissions: req.permissions },
      process.env.ACCESS_TOKEN,
      { expiresIn: "24h" }
    );

    res.json({ token, status: "success" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
});

// Verify Token Endpoint
router.post("/verifyToken", (req, res) => {
  const token = req.headers["authorization"]?.split(" ")[1]; // Split to get just the token part
  // console.log(token);
  if (!token) {
    // console.log("No token provided");
    return res
      .status(401)
      .json({ message: "Access denied. No token provided.", status: "fail" });
  }

  // console.log("Token received:", token);
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      console.error("Token verification error:", err);
      return res
        .status(401)
        .json({ message: "Invalid or expired token", status: "fail" });
    }

    return res
      .status(200)
      .json({ message: "Token is valid", status: "success" });
  });
});

module.exports = router;
