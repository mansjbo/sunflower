const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const crypto = require("crypto");
const {
	tokenAuth,
	// validateDate,
	// validateItem,
} = require("../config/middleware");
const { getTimestamp } = require("../config/lab");
const bcrypt = require("bcrypt");
const { getDb, connectToDb } = require("../config/mongo");
const { ObjectId } = require("mongodb");

// db connection
let db;

connectToDb((err) => {
	if (!err) {
		db = getDb();
	}
});

// const { ObjectId } = require("mongodb");
const moment = require("moment");
// const crypto = require("crypto");

// Helper Functions
const validateItem = async (item) => {
	try {
		const foundItem = await db.collection("items").findOne({
			_id: new ObjectId(item.id),
			"units.unit_title": item.unit,
		});
		return foundItem !== null;
	} catch (error) {
		console.error("Error validating item:", error);
		return false;
	}
};

const validateDate = (dateString) => {
	return moment(dateString, "YYYY-MM-DD", true).isValid();
};

// const getTimestamp = () => new Date();

// 1. Create New Supply
router.post("/", tokenAuth, async (req, res) => {
	try {
		const {
			"supplier-select": supplier,
			mobile,
			"supplies-date": date,
			items,
		} = req.body;

		if (items.length <= 0) {
			return res
				.status(400)
				.json({ message: "لا يوجد أصناف كافية", status: "fail" });
		}

		if (!validateDate(date)) {
			return res
				.status(400)
				.json({ message: "خطأ في التاريخ", status: "fail" });
		}

		for (const [index, item] of items.entries()) {
			if (!(await validateItem(item))) {
				return res.status(400).json({
					message: `الصنف رقم ${index + 1} غير صحيح`,
					status: "fail",
				});
			}
		}

		const today = new Date();
		const todayStart = new Date(today.setHours(0, 0, 0, 0));
		const todayEnd = new Date(today.setHours(23, 59, 59, 999));

		const count = await db.collection("supplies").countDocuments({
			createdAt: { $gte: todayStart, $lt: todayEnd },
		});

		const code = (count + 1).toString().padStart(6, "0");
		const id = crypto.randomBytes(10).toString("hex");

		const newSupply = {
			_id: new ObjectId(),
			code,
			date: new Date(date),
			supplier: new ObjectId(supplier),
			items,
			total: items.reduce(
				(sum, item) => sum + (item.price * item.quantity - item.discount),
				0
			),
			status: 1,
			createdAt: getTimestamp(),
			createdBy: req.obj.user.__id__,
		};

		await db.collection("supplies").insertOne(newSupply);

		res.status(201).json({
			message: "تم إنشاء سجل التوريد بنجاح",
			status: "success",
			data: { id: newSupply._id, code: newSupply.code },
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

// 2. Get Supplies List
router.get("/", tokenAuth, async (req, res) => {
	try {
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 10;
		const txt = req.query.txt || "";
		const skip = (page - 1) * limit;

		const arabicRegex = txt.replace(/[إأآ]/g, "ا").replace(/[ىئ]/g, "ي");
		const regex = new RegExp(arabicRegex, "i");

		const countPipeline = [
			{
				$match: {
					$or: [
						{ code: { $regex: regex } },
						{ customer: { $regex: regex } },
						{ mobile: { $regex: regex } },
						{ total: isNaN(txt) ? { $regex: regex } : parseFloat(txt) },
					],
					status: 1,
				},
			},
			{ $count: "total" },
		];

		const countResult = await db
			.collection("supplies")
			.aggregate(countPipeline)
			.toArray();
		const total = countResult[0]?.total || 0;
		const pages_count = Math.ceil(total / limit);

		const supplies = await db
			.collection("supplies")
			.aggregate([
				{
					$match: {
						$or: [
							{ code: { $regex: regex } },
							{ supplier: { $regex: regex } },
							{ total: isNaN(txt) ? { $regex: regex } : parseFloat(txt) },
						],
						status: 1,
					},
				},
				{
					$project: {
						_id: 1,
						code: 1,
						date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
						supplier: 1,
						total: 1,
					},
				},
				{ $skip: skip },
				{ $limit: limit },
			])
			.toArray();

		res.status(200).json({
			data: supplies,
			meta: { pages_count, results_count: total },
			status: "success",
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

// 3. Get Supply Details
router.get("/:id", tokenAuth, async (req, res) => {
	try {
		const supply = await db.collection("supplies").findOne({
			_id: new ObjectId(req.params.id),
			status: 1,
		});

		if (!supply) {
			return res.status(404).json({
				message: "لا يوجد بيانات متاحة",
				status: "fail",
			});
		}

		// Format the date to YYYY-MM-DD
		const formattedDate = moment(supply.date).format("YYYY-MM-DD");

		res.status(200).json({
			data: {
				basics: {
					_id: supply._id,
					code: supply.code,
					date: formattedDate, // Use the formatted date here
					supplier: supply.supplier,
					total: supply.total,
				},
				details: supply.items.map((item) => ({
					id: item.id,
					title: item.title,
					unit: item.unit,
					price: item.price,
					discount: item.discount,
					quantity: item.quantity,
				})),
			},
			status: "success",
		});
	} catch (error) {
		console.error(error);
		res.status(500).json({
			message: "خطأ، فشل العملية",
			status: "fail",
		});
	}
});

// 4. Update Supply
router.put("/:id", tokenAuth, async (req, res) => {
	try {
		const {
			"supplier-select": supplier,
			mobile,
			"supplies-date": date,
			items,
		} = req.body;

		if (items.length <= 0) {
			return res
				.status(400)
				.json({ message: "لا يوجد أصناف كافية", status: "fail" });
		}

		if (!validateDate(date)) {
			return res
				.status(400)
				.json({ message: "خطأ في التاريخ", status: "fail" });
		}

		for (const [index, item] of items.entries()) {
			if (!(await validateItem(item))) {
				return res.status(400).json({
					message: `الصنف رقم ${index + 1} غير صحيح`,
					status: "fail",
				});
			}
		}

		const updateRecord = {
			user: req.obj.user.__id__,
			updatedAt: getTimestamp(),
		};

		const result = await db.collection("supplies").updateOne(
			{ _id: new ObjectId(req.params.id) },
			{
				$set: {
					supplier: supplier,
					date: new Date(date),
					items,
					total: items.reduce(
						(sum, item) => sum + (item.price * item.quantity - item.discount),
						0
					),
				},
				$push: {
					updates: updateRecord,
				},
			}
		);

		if (result.matchedCount === 0) {
			return res
				.status(404)
				.json({ status: "fail", message: "سجل التوريد غير موجود" });
		}

		res
			.status(200)
			.json({ status: "success", message: "تم تحديث سجل التوريد بنجاح" });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

// 6. Delete Supply
router.delete("/:id", tokenAuth, async (req, res) => {
	try {
		const deleteRecord = {
			user: req.obj.user.__id__,
			deletedAt: getTimestamp(),
		};

		const result = await db.collection("supplies").updateOne(
			{ _id: new ObjectId(req.params.id) },
			{
				$set: { status: 0 },
				$push: {
					deletes: deleteRecord,
				},
			}
		);

		if (result.matchedCount === 0) {
			return res
				.status(404)
				.json({ status: "fail", message: "سجل التوريد غير موجود" });
		}

		res
			.status(200)
			.json({ status: "success", message: "تم حذف سجل التوريد بنجاح" });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

module.exports = router;
module.exports = router;
