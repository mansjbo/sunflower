const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const crypto = require("crypto");
const {
  tokenAuth,
  // validateItem,
  // validateDate,
} = require("../config/middleware");
const {
  getTimestamp,
  getCount,
  str_pad,
  paginateData,
} = require("../config/lab");
const bcrypt = require("bcrypt");
const { format } = require("date-fns");
const moment = require("moment");

const { getDb, connectToDb } = require("../config/mongo");
const { ObjectId } = require("mongodb");

// db connection
let db;

connectToDb((err) => {
  if (!err) {
    db = getDb();
  }
});

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

// 1. Create New Invoice
router.post("/", tokenAuth, async (req, res) => {
  try {
    const {
      "cus-name": cusName,
      mobile,
      "invoice-date": date,
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

    var orderStatus = 1;
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const todayEnd = new Date(new Date().setHours(23, 59, 59, 999));

    const count = await db.collection("invoices").countDocuments({
      createdAt: { $gte: todayStart, $lt: todayEnd },
    });
    const code = (count + 1).toString().padStart(6, "0");

    const newInvoice = {
      _id: new ObjectId(),
      code,
      date: new Date(date),
      customer: cusName,
      mobile,
      items,
      orderStatus,
      total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      status: 1,
      createdAt: new Date(),
      createdBy: req.obj.user.__id__,
    };

    await db.collection("invoices").insertOne(newInvoice);

    res.status(201).json({
      message: "تم إنشاء الفاتورة بنجاح",
      status: "success",
      data: { id: newInvoice._id, code: newInvoice.code },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// 2. Get Invoices List
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
      .collection("invoices")
      .aggregate(countPipeline)
      .toArray();
    const total = countResult[0]?.total || 0;
    const pages_count = Math.ceil(total / limit);

    const invoices = await db
      .collection("invoices")
      .aggregate([
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
        {
          $project: {
            _id: 1,
            code: 1,
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            customer: 1,
            mobile: 1,
            total: 1,
            orderStatus: 1, // Keep the original numeric field
            orderStatusText: {
              // Add new field with Arabic text
              $switch: {
                branches: [
                  { case: { $eq: ["$orderStatus", 1] }, then: "قيد التجهيز" },
                  { case: { $eq: ["$orderStatus", 2] }, then: "جاهز للسحن" },
                  { case: { $eq: ["$orderStatus", 3] }, then: "قيد الشحن" },
                  { case: { $eq: ["$orderStatus", 4] }, then: "تم التسليم" },
                  {
                    case: { $eq: ["$orderStatus", 5] },
                    then: "تم الغاء الطلبية",
                  },
                ],
                default: "غير معرف",
              },
            },
          },
        },
        { $skip: skip },
        { $limit: limit },
      ])
      .toArray();

    res.status(200).json({
      data: invoices,
      meta: { pages_count, results_count: total },
      status: "success",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// 3. Get Invoice Details
router.get("/:id", tokenAuth, async (req, res) => {
  try {
    const invoice = await db.collection("invoices").findOne({
      _id: new ObjectId(req.params.id),
      status: 1,
    });

    if (!invoice) {
      return res
        .status(404)
        .json({ message: "لا يوجد بيانات متاحة", status: "fail" });
    }

    // Format the date to YYYY-mm-dd
    let formattedDate = "";
    if (invoice.date) {
      const dateObj =
        invoice.date instanceof Date ? invoice.date : new Date(invoice.date);
      formattedDate = dateObj.toISOString().split("T")[0];
    }

    res.status(200).json({
      data: {
        basics: {
          _id: invoice._id,
          code: invoice.code,
          date: formattedDate, // Use the formatted date here
          customer: invoice.customer,
          mobile: invoice.mobile,
          orderStatus: invoice.orderStatus,
          total: invoice.total,
        },
        details: invoice.items,
      },
      status: "success",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// 4. Update Invoice
router.put("/:id", tokenAuth, async (req, res) => {
  try {
    const {
      "cus-name": cusName,
      mobile,
      "invoice-date": date,
      items,
    } = req.body;

    // ... (keep your existing validation code)

    const updateData = {
      $set: {
        customer: cusName,
        mobile,
        date: new Date(date),
        items,
        total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      },
      // This will create the array if it doesn't exist
      $push: {
        updates: {
          $each: [
            {
              user: req.obj.user.__id__,
              updatedAt: new Date(),
            },
          ],
          // Initialize as empty array if field doesn't exist
          $position: 0,
        },
      },
    };

    const result = await db
      .collection("invoices")
      .updateOne({ _id: new ObjectId(req.params.id) }, updateData);

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ status: "fail", message: "الفاتورة غير موجودة" });
    }

    res
      .status(200)
      .json({ status: "success", message: "تم تحديث الفاتورة بنجاح" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// 5. Update Invoice Status
router.put("/status/:id", tokenAuth, async (req, res) => {
  try {
    const { status } = req.body;

    const result = await db.collection("invoices").updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set: { orderStatus: parseInt(status) },
        $push: {
          statusUpdates: {
            user: req.obj.user.__id__,
            updatedAt: getTimestamp(),
            newStatus: parseInt(status),
          },
        },
      }
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ status: "fail", message: "الفاتورة غير موجودة" });
    }

    res
      .status(200)
      .json({ status: "success", message: "تم تحديث حالة الفاتورة بنجاح" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// 6. Delete Invoice
router.delete("/:id", tokenAuth, async (req, res) => {
  try {
    const result = await db.collection("invoices").updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set: { status: 0 },
        $push: {
          deletes: {
            user: req.obj.user.__id__,
            deletedAt: getTimestamp(),
          },
        },
      }
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ status: "fail", message: "الفاتورة غير موجودة" });
    }

    res
      .status(200)
      .json({ status: "success", message: "تم حذف الفاتورة بنجاح" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

module.exports = router;

// New Invoice
router.post("/", tokenAuth, async (req, res) => {
	try {
		const {
			"cus-name": cusName,
			mobile,
			"invoice-date": date,
			items,
			orderStatus,
		} = req.body;

		if (items.length <= 0) {
			return res
				.status(500)
				.json({ message: "لا يوجد أصناف كافية", status: "fail" });
		}

		if (!validateDate(date)) {
			return res
				.status(400)
				.json({ message: "خطأ في التاريخ", status: "fail" });
		}

		for (const [index, item] of items.entries()) {
			if (!validateItem(item)) {
				return res.status(500).json({
					message: `الصنف رقم ${index} غير صحيح، يرجى التأكد من البيانات المدخلية`,
					status: "fail",
				});
			}
		}

		const id = crypto.randomBytes(10).toString("hex");
		const parsedDate = moment(getTimestamp());
		var fullDate = parsedDate.format("YYYY-MM-DD");

		const count = await pool.query(
			`SELECT COUNT(*) AS count FROM POS p WHERE DATE(JSON_EXTRACT(p._config_, '$.createdAt')) = '${fullDate}'`
		);
		var code = str_pad(count[0][0]["count"] + 1, 6, "0", "left");

		const sql = `
            INSERT INTO POS (__id__, _code_, _date_, _customer_, _mobile_, _items_, _order_status_ _config_)
            VALUES ('${id}', '${code}', '${date}', '${cusName}', '${mobile}', '${JSON.stringify(
			items
		)}', '${orderStatus}', '${JSON.stringify({
			createdAt: getTimestamp(),
			createdBy: req.obj.user.__id__,
		})}')
        `;
		const [insert] = await pool.query(sql);

		res
			.status(201)
			.json({ message: "تم حفظ ييانات الصنف بنجاح", status: "success" });
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

// Invoices List
router.get("/", tokenAuth, async (req, res) => {
	try {
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 10;
		const txt = req.query.txt || "";

		const sql = `SELECT i.__id__, i._code_, DATE_FORMAT(i._date_, '%Y-%m-%d') AS _date_, i._customer_, i._mobile_, i.orderStatus, i._order_status_, i.total FROM INVOICES i

            WHERE (REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(i._code_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%'
            OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(i._date_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%'
            OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(i._mobile_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%'
            OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(i._customer_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%'
            OR i.total = '${txt}'
            )
           `;

		const [invoices] = await pool.query(sql);
		if (invoices.length > 0) {
			const data = paginateData(invoices, page, limit);
			return res.status(201).json({ ...data, status: "success" });
		} else {
			return res.status(200).json({
				data: [],
				meta: {},
				message: "لا يوجد بيانات متاحة",
				status: "fail",
			});
		}
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

// router.get("/invoice", async(req, res)=>{

//     res.status(200).send(code)
// })

// Get Invoice Details
router.get("/:id", tokenAuth, async (req, res) => {
	try {
		const [basics] = await pool.query(
			`SELECT i.__id__, i._code_, i._date_, i._customer_, i._mobile_, i.orderStatus, i._order_status_, i.total FROM INVOICES i WHERE i.__id__ = '${req.params.id}'`
		);
		const [details] = await pool.query(
			`SELECT
				item.*
			FROM POS p
			JOIN JSON_TABLE(
				p._items_,
				'$[*]' COLUMNS (
					id VARCHAR(255) PATH '$.id',
					title VARCHAR(255) PATH '$.title',
					unit VARCHAR(255) PATH '$.unit',
					price DECIMAL(10, 2) PATH '$.price',
					discount DECIMAL(10, 2) PATH '$.discount',
					quantity INT PATH '$.quantity'
				)
			) AS item
			ON 1=1
			WHERE p.__id__ = '${req.params.id}';`
		);

		if (basics.length > 0) {
			return res.status(201).json({
				data: { basics: basics[0], details: details },
				status: "success",
			});
		} else {
			return res
				.status(204)
				.json({ message: "لا يوجد بيانات متاحة", status: "fail" });
		}
	} catch (error) {
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

router.put("/:id", tokenAuth, async (req, res) => {
	try {
		const {
			"cus-name": cusName,
			mobile,
			"invoice-date": date,
			items,
		} = req.body;

		if (items.length <= 0) {
			return res
				.status(500)
				.json({ message: "لا يوجد أصناف كافية", status: "fail" });
		}

		if (!validateDate(date)) {
			return res
				.status(400)
				.json({ message: "خطأ في التاريخ", status: "fail" });
		}

		for (const [index, item] of items.entries()) {
			if (!validateItem(item)) {
				return res.status(500).json({
					message: `الصنف رقم ${index} غير صحيح، يرجى التأكد من البيانات المدخلية`,
					status: "fail",
				});
			}
		}

		const sql = `
            UPDATE POS SET
                _customer_ = '${cusName}',
                _mobile_ = '${mobile}',
                _date_ = '${date}',
                _items_ = '${JSON.stringify(items)}',
                _config_ =
                    CASE
                    WHEN JSON_CONTAINS_PATH(_config_, 'one', '$.update') THEN
                        JSON_ARRAY_APPEND(
                            _config_,
                            '$.update',
                            JSON_OBJECT(
                                'user', '${req.obj.user.__id__}',
                                'updatedAt', '${getTimestamp()}'
                            )
                        )
                    ELSE
                        JSON_SET(
                            _config_,
                            '$.update',
                            JSON_ARRAY(
                                JSON_OBJECT(
                                    'user', '${req.obj.user.__id__}',
                                    'updatedAt', '${getTimestamp()}'
                                )
                            )
                        )
                    END
            WHERE __id__ = '${req.params.id}'`;

		const [result] = await pool.query(sql);
		if (result.affectedRows === 0) {
			return res
				.status(404)
				.json({ status: "fail", message: "فشل تحديث الفاتورة" });
		}
		res
			.status(200)
			.json({ status: "success", message: "تم تحديث بيانات الفاتورة بنجاح" });
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

router.put("/status/:id", tokenAuth, async (req, res) => {
	try {
		const { status } = req.body;

		const sql = `
            UPDATE POS SET
                _order_status_ = ${status} ,
                _config_ =
                    CASE
                    WHEN JSON_CONTAINS_PATH(_config_, 'one', '$.updateOrderStatus') THEN
                        JSON_ARRAY_APPEND(
                            _config_,
                            '$.updateOrderStatus',
                            JSON_OBJECT(
                                'user', '${req.obj.user.__id__}',
                                'updatedAt', '${getTimestamp()}',
                                'updateValue', '${status}'
                            )
                        )
                    ELSE
                        JSON_SET(
                            _config_,
                            '$.updateOrderStatus',
                            JSON_ARRAY(
                                JSON_OBJECT(
                                    'user', '${req.obj.user.__id__}',
                                    'updatedAt', '${getTimestamp()}',
                                    'updateValue', '${status}'
                                )
                            )
                        )
                    END
            WHERE __id__ = '${req.params.id}'`;

		// console.log(sql);

		const [result] = await pool.query(sql);
		if (result.affectedRows === 0) {
			return res
				.status(404)
				.json({ status: "fail", message: "فشل تحديث حالة الطلب" });
		}
		res
			.status(200)
			.json({ status: "success", message: "تم تحديث بيانات حالة الطلب بنجاح" });
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

// Delete Invoice
router.delete("/:id", tokenAuth, async (req, res) => {
	try {
		const sql = `UPDATE POS SET _status_ = 0,
                _config_ =
                    CASE
                    WHEN JSON_CONTAINS_PATH(_config_, 'one', '$.delete') THEN
                        JSON_ARRAY_APPEND(
                            _config_,
                            '$.delete',
                            JSON_OBJECT(
                                'user', '${req.obj.user.__id__}',
                                'deletedAt', '${getTimestamp()}'
                            )
                        )
                    ELSE
                        JSON_SET(
                            _config_,
                            '$.delete',
                            JSON_ARRAY(
                                JSON_OBJECT(
                                    'user', '${req.obj.user.__id__}',
                                    'deletedAt', '${getTimestamp()}'
                                )
                            )
                        )
                    END
            WHERE __id__ = '${req.params.id}'`;

		const [result] = await pool.query(sql);

		if (result.affectedRows === 0) {
			return res
				.status(404)
				.json({ status: "fail", message: "الفاتورة غير موجودة" });
		}
		res
			.status(200)
			.json({ status: "success", message: "تم حذف الفاتورة بنجاح" });
	} catch (error) {
		console.log(error);
		res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
	}
});

// module.exports = router;
