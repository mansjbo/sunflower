const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const crypto = require("crypto");
const {
  tokenAuth,
  validateDate,
  validateItem,
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

// New Supplies
router.post("/", tokenAuth, async (req, res) => {
  try {
    const {
      "supplies-date": date,
      "supplier-select": supplier,
      items,
    } = req.body;

    if (!validateDate(date)) {
      return res
        .status(400)
        .json({ message: "خطأ في التاريخ", status: "fail" });
    }

    if (!supplier || !ObjectId.isValid(supplier)) {
      return res
        .status(400)
        .json({ message: "بيانات المورد غير صحيحة", status: "fail" });
    }

    if (items == undefined || items.length <= 0) {
      return res
        .status(400)
        .json({ message: "يجب التأكد من الأصناف", status: "fail" });
    }

    const id = crypto.randomBytes(16).toString("hex");

    const newSupply = {
      _id: id,
      date: date,
      supplier: new ObjectId(supplier), // This is now just the ObjectId
      items: items,
      createdAt: getTimestamp(),
      createdBy: req.obj.user.__id__,
      status: 1,
    };

    const result = await db.collection("supplies").insertOne(newSupply);
    res
      .status(201)
      .json({ message: "تم حفظ البيانات بنجاح", status: "success" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// Supplies List
router.get("/", tokenAuth, async (req, res) => {
  try {
    const supplies = await db
      .collection("supplies")
      .aggregate([
        {
          $match: { status: 1 }, // Only active supplies
        },
        {
          $lookup: {
            from: "supplier",
            localField: "supplier",
            foreignField: "_id",
            as: "supplierData",
          },
        },
        {
          $unwind: "$supplierData", // Convert the array from lookup to object
        },
        {
          $addFields: {
            total: {
              $sum: "$items.amount", // Calculate total from items array
            },
            "supplier.name": "$supplierData.name", // Get supplier name
          },
        },
        {
          $project: {
            _id: 1,
            date: 1,
            supplier: 1,
            "supplier.name": 1,
            items: 1,
            total: 1,
            createdAt: 1,
          },
        },
        {
          $sort: { createdAt: -1 }, // Sort by newest first
        },
      ])
      .toArray();

    res.status(200).json({
      message: "تم جلب البيانات بنجاح",
      status: "success",
      data: supplies,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// Get Single Supply
router.get("/:id", tokenAuth, async (req, res) => {
  try {
    const supply = await db.collection("supplies").findOne({
      _id: req.params.id,
      "config.status": 1,
    });

    if (supply) {
      return res.status(200).json({ data: supply, status: "success" });
    } else {
      return res
        .status(404)
        .json({ data: null, message: "لا يوجد بيانات متاحة", status: "fail" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// Update Supply
router.put("/:id", tokenAuth, async (req, res) => {
  console.log(req.body);
  try {
    const {
      "supplier-select": supplier,
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
      if (!validateItem(item)) {
        return res.status(400).json({
          message: `الصنف رقم ${index} غير صحيح، يرجى التأكد من البيانات المدخلية`,
          status: "fail",
        });
      }
    }

    const updateObj = {
      $set: {
        supplier: supplier,
        date: date,
        items: items,
      },
      $push: {
        "config.update": {
          user: req.obj.user._id,
          updatedAt: getTimestamp(),
        },
      },
    };

    const result = await db
      .collection("supplies")
      .updateOne({ _id: req.params.id }, updateObj);

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ status: "fail", message: "فشل تحديث الفاتورة" });
    }
    res
      .status(200)
      .json({ status: "success", message: "تم تحديث بيانات الفاتورة بنجاح" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// Delete Supply (soft delete)
router.delete("/:id", tokenAuth, async (req, res) => {
  try {
    const result = await db.collection("supplies").updateOne(
      { _id: req.params.id },
      {
        $set: { "config.status": 0 },
        $push: {
          "config.delete": {
            user: req.obj.user._id,
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

// Modified paginateData function for MongoDB
function paginateData(data, page, limit, total) {
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;

  const result = {};
  result.total = total;
  result.pages = Math.ceil(total / limit);

  if (endIndex < total) {
    result.next = {
      page: page + 1,
      limit: limit,
    };
  }

  if (startIndex > 0) {
    result.previous = {
      page: page - 1,
      limit: limit,
    };
  }

  result.data = data;
  return { data: result.data, meta: { pagination: result } };
}

// // New Supplies
// router.post('/', tokenAuth, async(req, res)=>{

//     try {
//         console.log(req.body);
//         const {"supplies-date": date, "supplier-select":supplier, items}= req.body

//         if (!validateDate(date)) {
//             return res.status(400).json({message: "خطأ في التاريخ", status: "fail"})
//         }

//         if (supplier == undefined || supplier.length < 10) {
//             return res.status(400).json({message: "بيانات المورد غير صحيحة", status: "fail"})
//         }

//         if (items == undefined || items.length <= 0 ) {
//             return res.status(400).json({message: "يجب التأكد من الأصناف", status:"fail"})
//         }

//         const id = crypto.randomBytes(16).toString("hex");

//         const sql = `
//             INSERT INTO SUPPLY (__id__, _date_, _supplier_, _items_, _config_) VALUES
//             ('${id}', '${date}', '${supplier}', '${JSON.stringify(items)}', '${JSON.stringify({createdAt: getTimestamp(), createdBy: req.obj.user.__id__})}')
//         `
//         const [newSupply] = await pool.query(sql)
//         res.status(201).json({message: "تم حفظ البيانات بنجاح", status: "success"})

//     } catch (error) {
//         res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
//     }
// })

// // Supplies List
// router.get("/", tokenAuth, async(req, res)=>{
//     try {
//         const page = parseInt(req.query.page) || 1
//         const limit = parseInt(req.query.limit) || 10
//         const txt = req.query.txt || ""
//         const sql = (`SELECT i.__id__, DATE_FORMAT(i._date_, '%Y-%m-%d') AS _date_, i._title_, i.total FROM SUPPLIES i

//             WHERE (
//             REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(i._date_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%'
//             OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(i._title_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%'
//             OR i.total = '${txt}'
//             )
//            `);

//         const [invoices] = await pool.query(sql)
//         if (invoices.length > 0) {

//             const data = paginateData(invoices, page, limit)
//             return res.status(201).json({...data, status: "success"})
//         }else{
//             return res.status(200).json({data:[], meta:{}, message: "لا يوجد بيانات متاحة", status: "fail"})
//         }
//     } catch (error) {
//         console.log(error);
//         res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
//     }
// })

// // Supplies List
// router.get("/:id", tokenAuth, async(req, res)=>{
//     try {

//         const sql = (`SELECT i.__id__, DATE_FORMAT(i._date_, '%Y-%m-%d') AS _date_, i._title_, i._items_, i._supplier_ FROM SUPPLIES i WHERE i.__id__ = '${req.params.id}'`);

//         const [supply] = await pool.query(sql)
//         if (supply.length > 0) {
//             return res.status(201).json({data: supply[0], status: "success"})
//         }else{
//             return res.status(200).json({data:[], meta:{}, message: "لا يوجد بيانات متاحة", status: "fail"})
//         }
//     } catch (error) {
//         console.log(error);
//         res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
//     }
// })

// router.put("/:id", tokenAuth,async(req, res)=>{
//     console.log(req.body);
//     try {
//         const {"supplier-select":supplier,"supplies-date":date, items} = req.body

//         if (items.length <= 0 ) {
//             return res.status(500).json({message: "لا يوجد أصناف كافية", status: "fail"})
//         }

//         if (!validateDate(date)) {
//             return res.status(400).json({message: "خطأ في التاريخ", status: "fail"})
//         }

//         for (const [index, item] of items.entries()) {
//             if (!validateItem(item)) {
//                 return res.status(500).json({message: `الصنف رقم ${index} غير صحيح، يرجى التأكد من البيانات المدخلية`, status: "fail"})
//             }
//         }

//         const sql = `
//             UPDATE SUPPLY SET
//                 _supplier_ = '${supplier}',
//                 _date_ = '${date}',
//                 _items_ = '${JSON.stringify(items)}',
//                 _config_ =
//                     CASE
//                     WHEN JSON_CONTAINS_PATH(_config_, 'one', '$.update') THEN
//                         JSON_ARRAY_APPEND(
//                             _config_,
//                             '$.update',
//                             JSON_OBJECT(
//                                 'user', '${req.obj.user.__id__}',
//                                 'updatedAt', '${getTimestamp()}'
//                             )
//                         )
//                     ELSE
//                         JSON_SET(
//                             _config_,
//                             '$.update',
//                             JSON_ARRAY(
//                                 JSON_OBJECT(
//                                     'user', '${req.obj.user.__id__}',
//                                     'updatedAt', '${getTimestamp()}'
//                                 )
//                             )
//                         )
//                     END
//             WHERE __id__ = '${req.params.id}'`

//         const [result] = await pool.query(sql)
//         if (result.affectedRows === 0) {
//             return res.status(404).json({ status: 'fail', message: 'فشل تحديث الفاتورة' });
//         }
//         res.status(200).json({ status: 'success', message: 'تم تحديث بيانات الفاتورة بنجاح' });
//     } catch (error) {
//         console.log(error);
//         res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
//     }
// })

// // Delete Invoice
// router.delete("/:id", tokenAuth, async(req, res)=>{
//     try {
//         const sql =
//             `UPDATE SUPPLY SET _status_ = 0,
//                 _config_ =
//                     CASE
//                     WHEN JSON_CONTAINS_PATH(_config_, 'one', '$.delete') THEN
//                         JSON_ARRAY_APPEND(
//                             _config_,
//                             '$.delete',
//                             JSON_OBJECT(
//                                 'user', '${req.obj.user.__id__}',
//                                 'deletedAt', '${getTimestamp()}'
//                             )
//                         )
//                     ELSE
//                         JSON_SET(
//                             _config_,
//                             '$.delete',
//                             JSON_ARRAY(
//                                 JSON_OBJECT(
//                                     'user', '${req.obj.user.__id__}',
//                                     'deletedAt', '${getTimestamp()}'
//                                 )
//                             )
//                         )
//                     END
//             WHERE __id__ = '${req.params.id}'`

//         const [result] = await pool.query(sql)

//         if (result.affectedRows === 0) {
//             return res.status(404).json({ status: 'fail', message: 'الفاتورة غير موجودة' });
//         }
//         res.status(200).json({ status: 'success', message: 'تم حذف الفاتورة بنجاح' });
//     } catch (error) {
//         console.log(error);
//         res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
//     }
// })

// router.get("")
module.exports = router;
