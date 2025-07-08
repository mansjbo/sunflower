const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const crypto = require("crypto");
const { tokenAuth } = require("../config/middleware");
const { getTimestamp, paginateData } = require("../config/lab");
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

// New Category
router.post("/", tokenAuth, async (req, res) => {
	const { categoryName } = req.body;
	if (categoryName == undefined || categoryName.length < 2) {
		return res
			.status(500)
			.json({ message: "اسم التصنيف غير صحيح", status: "fail" });
	}
	db.collection("category")
		.insertOne({
			name: categoryName,
			status: 1,
			createdAt: getTimestamp(),
			createdBy: req.obj.user.__id__,
		})
		.then((result) => {
			res
				.status(201)
				.json({ message: "تم حفظ البيانات بنجاح", status: "success" });
		})
		.catch((err) => {
			res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
		});

	// try {
	// 	const { categoryName } = req.body;
	// 	if (categoryName == undefined || categoryName.length < 2) {
	// return res
	// 	.status(500)
	// 	.json({ message: "اسم التصنيف غير صحيح", status: "fail" });
	// 	}

	// 	const id = crypto.randomBytes(10).toString("hex");
	// 	const [category] =
	// 		await pool.query(`INSERT INTO CATEGORY (__id__ , _title_, _config_)
	//         VALUES ('${id}', '${categoryName}', '${JSON.stringify({
	// 			createdAt: getTimestamp(),
	// 			createdBy: req.obj.user.__id__,
	// 		})}')`);

	// res
	// 	.status(201)
	// 	.json({ message: "تم حفظ البيانات بنجاح", status: "success" });
	// } catch (error) {
	// 	console.log(error);
	// 	res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	// }
});

// Get All Category
router.get("/", tokenAuth, async (req, res) => {
	const txt = req.query.txt || "";
	const page = parseInt(req.query.page) || 1;
	const limit = parseInt(req.query.limit) || 10;
	const dynamicRegex = new RegExp(txt, "i");

	// 1. Get total count (only brands with status: 1)
	const totalCount = await db.collection("category").countDocuments({
		name: { $regex: dynamicRegex },
		status: 1, // ✅ Only count active brands (status=1)
	});

	// 2. Calculate total pages
	const pages_count = Math.ceil(totalCount / limit);

	// 3. Get paginated results (with status: 1 filter)
	const categories = await db
		.collection("category")
		.find({
			name: { $regex: dynamicRegex },
			status: 1, // ✅ Only fetch active brands (status=1)
		})
		.sort({ name: 1 })
		.skip((page - 1) * limit)
		.limit(limit)
		.toArray()
		.then((categories) =>
			categories.map((category) => ({
				_title_: category.name,
				__id__: category._id,
			}))
		);
	// 4. Send response
	res.status(200).json({
		data: categories,
		meta: {
			pages_count: pages_count,
			results_count: totalCount,
			// current_page: page,
			// per_page: limit,
		},
		status: "success",
	});
	// try {
	// 	const page = parseInt(req.query.page) || 1;
	// 	const limit = parseInt(req.query.limit) || 10;
	// 	const txt = req.query.txt || "";

	// 	const [categoriesList] =
	// 		await pool.query(`SELECT b.__id__, b._title_ FROM CATEGORY b
	//         WHERE (REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(b._title_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%') AND b._status_ = 1`);

	// 	const data = paginateData(categoriesList, page, limit);
	// 	return res.status(201).json({ ...data, status: "success" });
	// } catch (error) {
	// 	console.log(error);
	// 	res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	// }
});

// Get Category By id
router.get("/:id", tokenAuth, async (req, res) => {
	if (ObjectId.isValid(req.params.id)) {
		db.collection("category")
			.findOne(
				{ _id: new ObjectId(req.params.id) },
				{ projection: { name: 1, _id: 1 } } // Explicitly include both fields
			)
			.then((doc) => {
				res.status(200).json({ __id__: doc._id, _title_: doc.name });
			})
			.catch((err) => {
				res.status(500).json({ error: "Could not fetch the document" });
			});
	} else {
		res.status(400).json({ error: "Invalid ID format" }); // 400 is more appropriate for invalid input
	}
	// try {
	// 	const [category] = await pool.query(
	// 		`SELECT b.__id__, b._title_ FROM CATEGORY b WHERE  b._status_ = 1 AND b.__id__ = '${req.params.id}'`
	// 	);
	// 	if (category.length > 0) {
	// 		return res.status(201).json({ status: "success", data: category[0] });
	// 	} else {
	// 		return res
	// 			.status(400)
	// 			.json({ message: "لا يوجد بيانات لهذه الشركة", status: "fail" });
	// 	}
	// } catch (error) {
	// 	console.log(error);
	// 	res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	// }
});

// Update Category
router.put("/:id", tokenAuth, async (req, res) => {
	const { categoryName } = req.body;
	if (categoryName == undefined || categoryName.length < 2) {
		return res
			.status(500)
			.json({ message: "اسم التصنيف غير صحيح", status: "fail" });
	}

	if (ObjectId.isValid(req.params.id)) {
		const updateData = {
			$set: {
				name: categoryName, // New name from request body
			},
			$push: {
				updates: {
					at: getTimestamp(),
					user: req.obj.user.__id__,
				},
			},
		};

		db.collection("category")
			.updateOne({ _id: new ObjectId(req.params.id) }, updateData)
			.then((result) => {
				if (result.modifiedCount === 1) {
					res.status(200).json({
						status: "success",
						message: "تم تحديث بيانات التصنيف بنجاح",
					});
				} else {
					res
						.status(404)
						.json({ status: "fail", message: "التصنيف غير موجود" });
				}
			})
			.catch((err) => {
				res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
			});
	} else {
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}

	// try {
	// 	const sql = `UPDATE CATEGORY SET _title_ = '${req.body.categoryName}',
	//         _config_ =
	//             CASE
	//             WHEN JSON_CONTAINS_PATH(_config_, 'one', '$.update') THEN
	//                 JSON_ARRAY_APPEND(
	//                     _config_,
	//                     '$.update',
	//                     JSON_OBJECT(
	//                         'user', '${req.obj.user.__id__}',
	//                         'updatedAt', '${getTimestamp()}'
	//                     )
	//                 )
	//             ELSE
	//                 JSON_SET(
	//                     _config_,
	//                     '$.update',
	//                     JSON_ARRAY(
	//                         JSON_OBJECT(
	//                             'user', '${req.obj.user.__id__}',
	//                             'updatedAt', '${getTimestamp()}'
	//                         )
	//                     )
	//                 )
	//             END
	//     WHERE __id__ = '${req.params.id}'`;

	// 	const [result] = await pool.query(sql);

	// 	if (result.affectedRows === 0) {
	// 		return res
	// 			.status(404)
	// 			.json({ status: "fail", message: "التصنيف غير موجود" });
	// 	}
	// res
	// 	.status(200)
	// 	.json({ status: "success", message: "تم تحديث بيانات التصنيف بنجاح" });
	// } catch (error) {
	// 	console.log(error);
	// 	res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	// }
});

// Delete Category
router.delete("/:id", tokenAuth, async (req, res) => {
	try {
		if (ObjectId.isValid(req.params.id)) {
			const updateData = {
				$set: {
					status: 0, // New name from request body
				},
				$push: {
					deletes: {
						at: getTimestamp(),
						user: req.obj.user.__id__,
					},
				},
			};

			db.collection("category")
				.updateOne({ _id: new ObjectId(req.params.id) }, updateData)
				.then((result) => {
					if (result.modifiedCount === 1) {
						res
							.status(200)
							.json({ status: "success", message: "تم حذف التصنيف بنجاح" });
					} else {
						res
							.status(404)
							.json({ status: "fail", message: "التصنيف غير موجودة" });
					}
				})
				.catch((err) => {
					res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
				});
		} else {
			res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
		}
		// const sql = `UPDATE CATEGORY SET _status_ = 0,
		//         _config_ =
		//             CASE
		//             WHEN JSON_CONTAINS_PATH(_config_, 'one', '$.delete') THEN
		//                 JSON_ARRAY_APPEND(
		//                     _config_,
		//                     '$.delete',
		//                     JSON_OBJECT(
		//                         'user', '${req.obj.user.__id__}',
		//                         'deletedAt', '${getTimestamp()}'
		//                     )
		//                 )
		//             ELSE
		//                 JSON_SET(
		//                     _config_,
		//                     '$.delete',
		//                     JSON_ARRAY(
		//                         JSON_OBJECT(
		//                             'user', '${req.obj.user.__id__}',
		//                             'deletedAt', '${getTimestamp()}'
		//                         )
		//                     )
		//                 )
		//             END
		//     WHERE __id__ = '${req.params.id}'`;

		// const [result] = await pool.query(sql);

		// if (result.affectedRows === 0) {
		// return res
		// 	.status(404)
		// 	.json({ status: "fail", message: "التصنيف غير موجودة" });
		// }
		// res
		// 	.status(200)
		// 	.json({ status: "success", message: "تم حذف التصنيف بنجاح" });
	} catch (error) {
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

module.exports = router;
