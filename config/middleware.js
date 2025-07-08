const pool = require("./db"); // Import the pool from db.js
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config({ path: "../.env" });
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const { bitToBoolean } = require("../config/lab");
// const dotenv = require('dotenv')
const { getDb, connectToDb } = require("./mongo");
const { ObjectId } = require("mongodb");

// db connection
let db;

connectToDb((err) => {
	if (!err) {
		db = getDb();
	}
});
const tokenAuth = (req, res, next) => {
	try {
		const authHeader = req.headers.authorization;
		const token = authHeader && authHeader.split(" ")[1];
		if (token == null)
			res.json({ message: "غير مصرح بالدخول", status: "fail" });
		jwt.verify(token, process.env.ACCESS_TOKEN, (err, data) => {
			if (err)
				return res.status(403).json({
					message: "بيانات الحساب غير صحيحة، يرجى تسجيل الدخول مرة",
					status: "fail",
				});
			req.obj = data;
			next();
		});
	} catch (err) {
		// console.log(err)
		res.status(403).json({ message: "خطأ في الخادم", status: "fail" });
	}
};

const loginAuth = async (req, res, next) => {
	console.log(req.body);
	try {
		if (req.body.username.length > 0 && req.body.password.length > 0) {
			console.log(
				"SELECT __id__, _username_, _password_ FROM USERS WHERE _username_ = '" +
					req.body.username +
					"' AND _status_ = 1"
			);
			const userExist = await pool.query(
				"SELECT __id__, _username_, _password_ FROM USERS WHERE _username_ = '" +
					req.body.username +
					"' AND _status_ = 1"
			);

			// const [permissions] = await pool.query(`SELECT * FROM PERMISSIONS up WHERE up.__id__ = '${userExist[0].__id__}'`)
			console.log("object2");
			if (userExist[0].length > 0) {
				console.log("object3");
				const isValid = await bcrypt.compare(
					req.body.password,
					userExist[0][0]._password_
				);

				var perms = {};

				if (isValid) {
					req.user = userExist[0][0];
					req.permissions = perms;
					next();
				} else {
					console.log("object4");
					return res
						.status(400)
						.json({ message: "فشل عملية تسجيل الدخول", status: "fail" });
				}
			}
		} else {
			return res
				.status(500)
				.json({ message: "البيانات غير مكتملة", status: "fail" });
		}
	} catch (err) {
		console.log(err);
		return res
			.status(400)
			.json({ message: "خطأ في صحة البيانات", status: "fail" });
	}
};

const getUserPermissions = async (req, res, next) => {
	try {
		const [perms] = await pool.query(
			`SELECT * FROM PERMISSIONS up WHERE up._user_ = ${req.obj.user.__id__}`
		);
		req.obj.permissions = perms[0];
		next();
	} catch {
		res.status(400).json({ message: "خطأ في الخادم", status: "fail" });
	}
};

const newUserValidation = async (req, res, next) => {
	try {
		// console.log(req.body);
		// console.log(`SELECT * FROM USERS WHERE _username_ = '${req.body.username}'`);
		const [duplicateUsername] = await pool.query(
			`SELECT * FROM USERS WHERE _username_ = '${req.body.username}'`
		);
		// console.log(duplicateUsername.length > 0);
		if (duplicateUsername.length > 0) {
			return res.json({ message: "اسم المستخدم موجود مسبقا", status: "fail" });
		}

		next();
	} catch (error) {
		console.log(error);
		res.status(400).json({ message: "خطأ في الخادم", status: "fail" });
	}
};

const validateCategory = async (id) => {
	const [category] = await pool.query(
		`SELECT * FROM CATEGORY c WHERE c.__id__ = '${id}'`
	);
	return category.length == 1;
};

const validateBrand = async (id) => {
	try {
		// Convert string ID to ObjectId if needed
		const brandId = ObjectId.isValid(id) ? new ObjectId(id) : id;

		const brand = await db.collection("brands").findOne({
			_id: brandId,
		});

		return brand !== null;
	} catch (error) {
		console.error("Error validating brand:", error);
		return false;
	}
};

const validateItem = async (item) => {
	try {
		// Convert string ID to ObjectId if needed
		const itemId = ObjectId.isValid(item.id) ? new ObjectId(item.id) : item.id;

		const itemFound = await db.collection("items").findOne({
			_id: itemId,
			"units.unit_title": item.unit,
		});

		return itemFound !== null;
	} catch (error) {
		console.error("Error validating item:", error);
		return false;
	}
};

// const validateBrand = async (id) => {
//   const [brand] = await pool.query(
//     `SELECT * FROM BRAND c WHERE c.__id__ = '${id}'`
//   );
//   return brand.length == 1;
// };

// const validateItem = async (item) => {
//   const [itemFound] = await pool.query(
//     `SELECT * FROM ITEM i WHERE i.__id__ = '${item.id}' AND JSON_CONTAINS(_units_, JSON_OBJECT('unit_title', '${item.unit}'));`
//   );
//   return itemFound.length == 1;
// };

/**
 * Validates if the given string is a valid date.
 * @param {string} dateString - The date string to validate.
 * @param {string} format - Expected format: "YYYY-MM-DD", "MM/DD/YYYY", etc. (optional).
 * @returns {boolean} - Returns true if valid, otherwise false.
 */
function validateDate(dateString, format = "YYYY-MM-DD") {
	// Check if it's a valid date string
	const date = new Date(dateString);
	if (isNaN(date.getTime())) {
		return false;
	}

	// Optional: validate against a specific format
	if (format === "YYYY-MM-DD") {
		const regex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
		if (!regex.test(dateString)) {
			return false;
		}
	} else if (format === "MM/DD/YYYY") {
		const regex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
		if (!regex.test(dateString)) {
			return false;
		}
	}

	// Ensure the date is valid (e.g., no invalid day like February 30)
	const [year, month, day] = dateString.split(/[-/]/).map(Number);
	return (
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day
	);
}

module.exports = {
	tokenAuth,
	loginAuth,
	getUserPermissions,
	newUserValidation,
	validateCategory,
	validateBrand,
	validateItem,
	validateDate,
};
