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

// New Brand
router.post("/", tokenAuth, async (req, res) => {
	// try {
	const { brandName } = req.body;
	if (brandName == undefined || brandName.length < 2) {
		return res
			.status(500)
			.json({ message: "اسم العلامة التجارية غير صحيح", status: "fail" });
	}
	db.collection("brand")
		.insertOne({
			name: brandName,
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

	// const id = crypto.randomBytes(10).toString("hex");
	// const [brand] =
	//   await pool.query(`INSERT INTO BRAND (__id__ , _name_, _config_)
	//         VALUES ('${id}', '${brandName}', '${JSON.stringify({
	//     createdAt: getTimestamp(),
	//     createdBy: req.obj.user.__id__,
	//   })}')`);

	// res
	//   .status(201)
	//   .json({ message: "تم حفظ البيانات بنجاح", status: "success" });
	// } catch (error) {
	// 	console.log(error);
	// 	res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	// }
});

// Get Brand All Brands
router.get("/", tokenAuth, async (req, res) => {
	const txt = req.query.txt || "";
	const page = parseInt(req.query.page) || 1;
	const limit = parseInt(req.query.limit) || 10;
	const dynamicRegex = new RegExp(txt, "i");

	// 1. Get total count (only brands with status: 1)
	const totalCount = await db.collection("brand").countDocuments({
		name: { $regex: dynamicRegex },
		status: 1, // ✅ Only count active brands (status=1)
	});

	// 2. Calculate total pages
	const pages_count = Math.ceil(totalCount / limit);

	// 3. Get paginated results (with status: 1 filter)
	const brands = await db
		.collection("brand")
		.find({
			name: { $regex: dynamicRegex },
			status: 1, // ✅ Only fetch active brands (status=1)
		})
		.sort({ name: 1 })
		.skip((page - 1) * limit)
		.limit(limit)
		.toArray()
		.then((brands) =>
			brands.map((brand) => ({
				_name_: brand.name,
				__id__: brand._id,
			}))
		);
	// 4. Send response
	res.status(200).json({
		data: brands,
		meta: {
			pages_count: pages_count,
			results_count: totalCount,
			// current_page: page,
			// per_page: limit,
		},
		status: "success",
	});
	// try {
	// 	// console.log("Requesting.........");
	// const page = parseInt(req.query.page) || 1;
	// const limit = parseInt(req.query.limit) || 10;
	// const txt = req.query.txt || "";

	// 	const [BrandsList] = await pool.query(
	// 		`SELECT b._name_ FROM BRAND b WHERE (REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(b._name_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%') AND  b._status_ = 1 `
	// 	);

	// 	const data = paginateData(BrandsList, page, limit);
	// 	return res.status(201).json({ ...data, status: "success" });
	// } catch (error) {
	// 	console.log(error);
	// 	res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	// }
});

// Get Brand By id
router.get("/:id", tokenAuth, async (req, res) => {
	if (ObjectId.isValid(req.params.id)) {
		db.collection("brand")
			.findOne(
				{ _id: new ObjectId(req.params.id) },
				{ projection: { name: 1, _id: 1 } } // Explicitly include both fields
			)
			.then((doc) => {
				res.status(200).json({ __id__: doc._id, _name_: doc.name });
			})
			.catch((err) => {
				res.status(500).json({ error: "Could not fetch the document" });
			});
	} else {
		res.status(400).json({ error: "Invalid ID format" }); // 400 is more appropriate for invalid input
	}
	// try {
	// 	const [brand] = await pool.query(
	// 		`SELECT b.__id__, b._name_ FROM BRAND b WHERE  b._status_ = 1 AND b.__id__ = '${req.params.id}'`
	// 	);
	// 	if (brand.length > 0) {
	// 		return res.status(201).json({ status: "success", data: brand[0] });
	// 	} else {
	// 		return res.status(400).json({
	// 			message: "لا يوجد بيانات لهذه العلامة التجارية",
	// 			status: "fail",
	// 		});
	// 	}
	// } catch (error) {
	// 	res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	// }
});

// Update Brand
router.put("/:id", tokenAuth, async (req, res) => {
	try {
		const { brandName } = req.body;
		if (brandName == undefined || brandName.length < 2) {
			return res
				.status(500)
				.json({ message: "اسم العلامة التجارية غير صحيح", status: "fail" });
		}

		if (ObjectId.isValid(req.params.id)) {
			const updateData = {
				$set: {
					name: brandName, // New name from request body
				},
				$push: {
					updates: {
						at: getTimestamp(),
						user: req.obj.user.__id__,
					},
				},
			};

			db.collection("brand")
				.updateOne({ _id: new ObjectId(req.params.id) }, updateData)
				.then((result) => {
					if (result.modifiedCount === 1) {
						res.status(200).json({ message: "Document updated successfully" });
					} else {
						res.status(404).json({ error: "Document not found" });
					}
				})
				.catch((err) => {
					res.status(500).json({ error: "Could not update the document" });
				});
		} else {
			res.status(400).json({ error: "Invalid ID format" });
		}

		// const sql = `UPDATE BRAND SET _name_ = '${brandName}',
		//     _config_ =
		//         CASE
		//         WHEN JSON_CONTAINS_PATH(_config_, 'one', '$.update') THEN
		//             JSON_ARRAY_APPEND(
		//                 _config_,
		//                 '$.update',
		//                 JSON_OBJECT(
		//                     'user', '${req.obj.user.__id__}',
		//                     'updatedAt', '${getTimestamp()}'
		//                 )
		//             )
		//         ELSE
		//             JSON_SET(
		//                 _config_,
		//                 '$.update',
		//                 JSON_ARRAY(
		//                     JSON_OBJECT(
		//                         'user', '${req.obj.user.__id__}',
		//                         'updatedAt', '${getTimestamp()}'
		//                     )
		//                 )
		//             )
		//         END
		// WHERE __id__ = '${req.params.id}'`;

		// const [result] = await pool.query(sql);

		// if (result.affectedRows === 0) {
		// 	return res
		// 		.status(404)
		// 		.json({ status: "fail", message: "العلامة التجارية غير موجودة" });
		// }
		// res.status(200).json({
		// 	status: "success",
		// 	message: "تم تحديث بيانات العلامة التجارية بنجاح",
		// });
	} catch (error) {
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

// Delete Brand
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

			db.collection("brand")
				.updateOne({ _id: new ObjectId(req.params.id) }, updateData)
				.then((result) => {
					if (result.modifiedCount === 1) {
						res.status(200).json({ message: "Document updated successfully" });
					} else {
						res.status(404).json({ error: "Document not found" });
					}
				})
				.catch((err) => {
					res.status(500).json({ error: "Could not update the document" });
				});
		} else {
			res.status(400).json({ error: "Invalid ID format" });
		}
		// const sql = `UPDATE BRAND SET _status_ = 0,
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
		// 	return res
		// 		.status(404)
		// 		.json({ status: "fail", message: "العلامة التجارية غير موجودة" });
		// }
		// res
		// 	.status(200)
		// 	.json({ status: "success", message: "تم حذف العلامة التجارية بنجاح" });
	} catch (error) {
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

module.exports = router;
