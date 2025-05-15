const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const crypto = require("crypto");
const {
	tokenAuth,
	validateItem,
	validateDate,
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
			`CALL GetInvoiceBasics('${req.params.id}')`
		);
		const [details] = await pool.query(
			`CALL GetInvoiceItems('${req.params.id}')`
		);

		if (basics.length > 0) {
			return res.status(201).json({
				data: { basics: basics[0][0], details: details[0] },
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

module.exports = router;
