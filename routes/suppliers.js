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

// New Supplier
router.post("/", tokenAuth, async (req, res) => {
  const { supplierName } = req.body;
  if (supplierName == undefined || supplierName.length < 2) {
    return res
      .status(500)
      .json({ message: "اسم المورد غير صحيح", status: "fail" });
  }
  db.collection("supplier")
    .insertOne({
      name: supplierName,
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

  //   try {
  //     const { supplierName } = req.body;
  //     if (supplierName == undefined || supplierName.length < 5) {
  // return res
  //   .status(500)
  //   .json({ message: "اسم المورد غير صحيح", status: "fail" });
  //     }

  //     const id = crypto.randomBytes(10).toString("hex");
  //     const [supplier] =
  //       await pool.query(`INSERT INTO SUPPLIER (__id__ , _title_, _config_)
  //             VALUES ('${id}', '${supplierName}', '${JSON.stringify({
  //         createdAt: getTimestamp(),
  //         createdBy: req.obj.user.__id__,
  //       })}')`);

  //     res
  //       .status(201)
  //       .json({ message: "تم حفظ البيانات بنجاح", status: "success" });
  //   } catch (error) {
  //     res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  //   }
});

// Get All Suppliers
router.get("/", tokenAuth, async (req, res) => {
  const txt = req.query.txt || "";
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const dynamicRegex = new RegExp(txt, "i");

  // 1. Get total count (only brands with status: 1)
  const totalCount = await db.collection("supplier").countDocuments({
    name: { $regex: dynamicRegex },
    status: 1, // ✅ Only count active brands (status=1)
  });

  // 2. Calculate total pages
  const pages_count = Math.ceil(totalCount / limit);

  // 3. Get paginated results (with status: 1 filter)
  const suppliers = await db
    .collection("supplier")
    .find({
      name: { $regex: dynamicRegex },
      status: 1, // ✅ Only fetch active brands (status=1)
    })
    .sort({ name: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray()
    .then((suppliers) =>
      suppliers.map((supplier) => ({
        _title_: supplier.name,
        __id__: supplier._id,
      }))
    );
  // 4. Send response
  res.status(200).json({
    data: suppliers,
    meta: {
      pages_count: pages_count,
      results_count: totalCount,
      // current_page: page,
      // per_page: limit,
    },
    status: "success",
  });
  //   try {
  //     const page = parseInt(req.query.page) || 1;
  //     const limit = parseInt(req.query.limit) || 10;
  //     const txt = req.query.txt || "";

  //     const [suppliersList] = await pool.query(
  //       `SELECT b.__id__, b._title_ FROM SUPPLIER b WHERE  b._status_ = 1`
  //     );

  //     if (suppliersList.length > 0) {
  //       const data = paginateData(suppliersList, page, limit);
  //       return res.status(201).json({ ...data, status: "success" });
  //     } else {
  //       return res.status(200).json({
  //         message: "لا يوجد بيانات متاحة",
  //         data: suppliersList,
  //         status: "fail",
  //       });
  //     }
  //   } catch (error) {
  //     console.log(error);
  //     res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  //   }
});

// Get All Suppliers
router.get("/all", tokenAuth, async (req, res) => {
  // current page
  //   const page = req.query.p || 0;
  //   const booksPerPage = 3;

  let suppliers = [];

  db.collection("supplier")
    .find()
    .sort({ name: 1 })
    .forEach((supplier) =>
      suppliers.push({ __id__: supplier._id, _title_: supplier.name })
    )
    .then(() => {
      res.status(201).json({ data: suppliers, status: "success" });
    })
    .catch(() => {
      res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
    });
  //   try {
  //     const [suppliersList] = await pool.query(
  //       `SELECT b.__id__, b._title_ FROM SUPPLIER b WHERE  b._status_ = 1`
  //     );

  //     if (suppliersList.length > 0) {
  //       return res.status(201).json({ data: suppliersList, status: "success" });
  //     } else {
  //       return res.status(200).json({
  //         message: "لا يوجد بيانات متاحة",
  //         data: suppliersList,
  //         status: "fail",
  //       });
  //     }
  //   } catch (error) {
  //     console.log(error);
  //     res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  //   }
});

// Get Supplier By id
router.get("/:id", tokenAuth, async (req, res) => {
  console.log("---------");
  if (ObjectId.isValid(req.params.id)) {
    db.collection("supplier")
      .findOne(
        { _id: new ObjectId(req.params.id) },
        { projection: { name: 1, _id: 1 } } // Explicitly include both fields
      )
      .then((supplier) => {
        console.log(supplier);
        res.status(200).json({ __id__: supplier._id, _name_: supplier.name });
      })
      .catch((err) => {
        res.status(500).json({ error: "Could not fetch the document" });
      });
  } else {
    res.status(400).json({ error: "Invalid ID format" }); // 400 is more appropriate for invalid input
  }
  //   try {
  //     const [supplier] = await pool.query(
  //       `SELECT b.__id__, b._title_ FROM SUPPLIER b WHERE  b._status_ = 1 AND b.__id__ = '${req.params.id}'`
  //     );
  //     if (supplier.length > 0) {
  //       return res.status(201).json({ status: "success", data: supplier[0] });
  //     } else {
  //       return res
  //         .status(400)
  //         .json({ message: "لا يوجد بيانات لهذا المورد", status: "fail" });
  //     }
  //   } catch (error) {
  //     res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  //   }
});

// Update Supplier
router.put("/:id", tokenAuth, async (req, res) => {
  const { supplierName } = req.body;
  if (supplierName == undefined || supplierName.length < 2) {
    return res
      .status(500)
      .json({ message: "اسم المورد غير صحيح", status: "fail" });
  }

  if (ObjectId.isValid(req.params.id)) {
    const updateData = {
      $set: {
        name: supplierName, // New name from request body
      },
      $push: {
        updates: {
          at: getTimestamp(),
          user: req.obj.user.__id__,
        },
      },
    };

    db.collection("supplier")
      .updateOne({ _id: new ObjectId(req.params.id) }, updateData)
      .then((result) => {
        if (result.modifiedCount === 1) {
          res.status(200).json({
            status: "success",
            message: "تم تحديث بيانات المورد بنجاح",
          });
        } else {
          res.status(404).json({ status: "fail", message: "المورد غير موجود" });
        }
      })
      .catch((err) => {
        res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
      });
  } else {
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }

  //   try {
  //     const sql = `UPDATE SUPPLIER SET _title_ = '${req.body.supplierName}',
  //             _config_ =
  //                 CASE
  //                 WHEN JSON_CONTAINS_PATH(_config_, 'one', '$.update') THEN
  //                     JSON_ARRAY_APPEND(
  //                         _config_,
  //                         '$.update',
  //                         JSON_OBJECT(
  //                             'user', '${req.obj.user.__id__}',
  //                             'updatedAt', '${getTimestamp()}'
  //                         )
  //                     )
  //                 ELSE
  //                     JSON_SET(
  //                         _config_,
  //                         '$.update',
  //                         JSON_ARRAY(
  //                             JSON_OBJECT(
  //                                 'user', '${req.obj.user.__id__}',
  //                                 'updatedAt', '${getTimestamp()}'
  //                             )
  //                         )
  //                     )
  //                 END
  //         WHERE __id__ = '${req.params.id}'`;
  //     const [result] = await pool.query(sql);
  //     if (result.affectedRows === 0) {
  // return res
  //   .status(404)
  //   .json({ status: "fail", message: "المورد غير موجود" });
  //     }
  //   res
  //     .status(200)
  //     .json({ status: "success", message: "تم تحديث بيانات المورد بنجاح" });
  //   } catch (error) {
  //     res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  //   }
});

// Delete Supplier
router.delete("/:id", tokenAuth, async (req, res) => {
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

    db.collection("supplier")
      .updateOne({ _id: new ObjectId(req.params.id) }, updateData)
      .then((result) => {
        if (result.modifiedCount === 1) {
          res
            .status(200)
            .json({ status: "success", message: "تم حذف المورد بنجاح" });
        } else {
          res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
        }
      })
      .catch((err) => {
        res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
      });
  } else {
    res.status(404).json({
      status: "fail",
      message: "خطأ، تعذر اتمام العملية لأن المورد غير موجود",
    });
  }

  //   try {
  //     const sql = `UPDATE SUPPLIER SET _status_ = 0,
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
  //             WHERE __id__ = '${req.params.id}'`;

  //     const [result] = await pool.query(sql);

  //     if (result.affectedRows === 0) {
  // return res.status(404).json({
  //   status: "fail",
  //   message: "خطأ، تعذر اتمام العملية لأن المورد غير موجود",
  // });
  //     }
  //     res.status(200).json({ status: "success", message: "تم حذف المورد بنجاح" });
  //   } catch (error) {
  //   res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  //   }
});

module.exports = router;
