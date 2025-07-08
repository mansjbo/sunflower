const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const crypto = require("crypto");
const {
  tokenAuth,
  validateCategory,
  validateBrand,
} = require("../config/middleware");
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

// New Item
router.post("/", tokenAuth, async (req, res) => {
  try {
    const { title, category, brand } = req.body;

    // Validating data
    if (title == undefined || title.length < 5) {
      return res
        .status(400)
        .json({ message: "اسم الصنف غير صحيح", status: "fail" });
    }

    if (!ObjectId.isValid(category)) {
      return res
        .status(400)
        .json({ message: "التصنيف غير موجود", status: "fail" });
    }

    if (!ObjectId.isValid(brand)) {
      return res
        .status(400)
        .json({ message: "العلامة التجارية غير موجودة", status: "fail" });
    }

    // Convert string IDs to ObjectIds
    const categoryId = new ObjectId(category);
    const brandId = new ObjectId(brand);

    // Verify category exists
    const categoryExists = await db.collection("category").countDocuments({
      _id: categoryId,
    });

    if (!categoryExists) {
      return res
        .status(400)
        .json({ message: "التصنيف غير موجود", status: "fail" });
    }

    // Verify brand exists
    const brandExists = await db.collection("brand").countDocuments({
      _id: brandId,
    });

    if (!brandExists) {
      return res
        .status(400)
        .json({ message: "العلامة التجارية غير موجودة", status: "fail" });
    }

    const newItem = {
      _id: new ObjectId(),
      title,
      category: categoryId, // Store as ObjectId reference
      brand: brandId, // Store as ObjectId reference
      units: [], // Initialize empty units array
      status: 1,
      createdAt: getTimestamp(),
      createdBy: req.obj.user.__id__,
    };

    await db.collection("items").insertOne(newItem);

    res.status(201).json({
      message: "تم حفظ بيانات الصنف بنجاح",
      status: "success",
      data: {
        id: newItem._id,
        title: newItem.title,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "خطأ، فشل العملية",
      status: "fail",
    });
  }
});

router.post("/units/:id", async (req, res) => {
  try {
    var items = req.body.units;

    // Process each unit to ensure proper structure
    const processedUnits = items.map((unit) => ({
      barcode: unit.barcode || "", // Ensure barcode is included
      unit_id: new ObjectId(), // Generate new ObjectId for each unit
      unit_rank: unit.unit_rank || 0, // Default rank if not provided
      unit_title: unit.unit_title || "", // Default title if not provided
      conversion_rate: unit.conversion_rate || "", // Empty string if not provided
    }));

    if (processedUnits.length <= 0) {
      return res
        .status(400)
        .json({ message: "خطأ، لا يوجد عدد كافي من الوحدات", status: "fail" });
    }

    const result = await db
      .collection("items")
      .updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { units: processedUnits } }
      );

    if (result.modifiedCount === 1) {
      return res
        .status(201)
        .json({ message: "تم حفظ بيانات الوحدات بنجاح", status: "success" });
    }
    res
      .status(500)
      .json({ message: "خطأ، تعذر تحديث البيانات", status: "fail" });
  } catch (error) {
    // console.log(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

router.get("/units/:id", async (req, res) => {
  try {
    const item = await db
      .collection("items")
      .findOne(
        { _id: new ObjectId(req.params.id) },
        { projection: { units: 1 } }
      );

    if (item) {
      res.status(201).json(item.units || []);
    } else {
      res.status(404).json({ message: "Item not found", status: "fail" });
    }
  } catch (error) {
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// Get All Items with pagination
router.get("/", tokenAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const txt = req.query.txt || "";
    const skip = (page - 1) * limit;

    // Create a regex for text search
    const regex = new RegExp(
      txt.replace(/[إأآ]/g, "ا").replace(/[ىئ]/g, "ي"),
      "i"
    );

    // First get the total count for pagination metadata
    const countPipeline = [
      {
        $match: {
          status: 1,
          $or: [{ title: { $regex: regex } }],
        },
      },
      {
        $count: "totalCount",
      },
    ];

    const countResult = await db
      .collection("items")
      .aggregate(countPipeline)
      .toArray();
    const totalCount = countResult[0]?.totalCount || 0;
    const pages_count = Math.ceil(totalCount / limit);

    // Main aggregation pipeline for data retrieval
    const pipeline = [
      {
        $match: {
          status: 1,
          $or: [{ title: { $regex: regex } }],
        },
      },
      {
        $lookup: {
          from: "brand", // Changed from "brands" to "brand"
          localField: "brand",
          foreignField: "_id",
          as: "brandInfo",
        },
      },
      {
        $lookup: {
          from: "category",
          localField: "category",
          foreignField: "_id",
          as: "categoryData",
        },
      },
      {
        $unwind: {
          path: "$brandInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$categoryData",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          brand: {
            id: "$brand",
            name: "$brandInfo.name", // Get name from brand collection
          },
          category: {
            id: "$category",
            title: "$categoryData.name",
          },
          units: 1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    ];

    const itemsList = await db
      .collection("items")
      .aggregate(pipeline)
      .toArray();

    if (itemsList.length > 0) {
      return res.status(200).json({
        data: itemsList,
        meta: {
          pages_count: pages_count,
          results_count: totalCount,
        },
        status: "success",
      });
    } else {
      return res.status(200).json({
        data: [],
        meta: {
          pages_count: 0,
          results_count: 0,
        },
        message: "لا يوجد بيانات متاحة",
        status: "fail",
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "خطأ، فشل العملية",
      status: "fail",
    });
  }
});

// Get All Items without pagination
router.get("/all", tokenAuth, async (req, res) => {
  try {
    const pipeline = [
      {
        $match: { status: 1 },
      },
      {
        $lookup: {
          from: "brands",
          localField: "brand",
          foreignField: "_id",
          as: "brandData",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryData",
        },
      },
      {
        $unwind: {
          path: "$brandData",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$categoryData",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          brand: 1,
          category: 1,
          units: 1,
          brandName: "$brandData.name",
          categoryTitle: "$categoryData.title",
        },
      },
    ];

    const itemsList = await db
      .collection("items")
      .aggregate(pipeline)
      .toArray();

    if (itemsList.length > 0) {
      return res.status(201).json({ data: itemsList, status: "success" });
    } else {
      return res
        .status(204)
        .json({ message: "لا يوجد بيانات متاحة", status: "fail" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// Get Item By id
router.get("/:id", tokenAuth, async (req, res) => {
  try {
    const item = await db.collection("items").findOne({
      _id: new ObjectId(req.params.id),
      status: 1,
    });

    if (item) {
      return res.status(201).json({ status: "success", data: item });
    } else {
      return res
        .status(400)
        .json({ message: "لا يوجد بيانات لهذا الصنف", status: "fail" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

// Update Item
router.put("/:id", tokenAuth, async (req, res) => {
  try {
    const { title, category, brand } = req.body;

    // Validating data
    if (title == undefined || title.length < 5) {
      return res
        .status(400)
        .json({ message: "اسم الصنف غير صحيح", status: "fail" });
    }

    if (!ObjectId.isValid(category)) {
      return res
        .status(400)
        .json({ message: "التصنيف غير موجود", status: "fail" });
    }

    if (!ObjectId.isValid(brand)) {
      return res
        .status(400)
        .json({ message: "العلامة التجارية غير موجودة", status: "fail" });
    }

    // Convert string IDs to ObjectIds
    const categoryId = new ObjectId(category);
    const brandId = new ObjectId(brand);
    const itemId = new ObjectId(req.params.id);
    const userId = req.obj.user.__id__;

    // Create the update record
    const updateRecord = {
      user: userId,
      updatedAt: getTimestamp(),
    };

    // Single update operation that works whether updates exists or not
    const result = await db.collection("items").updateOne({ _id: itemId }, [
      {
        $set: {
          title,
          brand: brandId,
          category: categoryId,
          updates: {
            $cond: [
              { $isArray: "$updates" },
              { $concatArrays: ["$updates", [updateRecord]] },
              [updateRecord],
            ],
          },
        },
      },
    ]);

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ status: "fail", message: "الصنف غير موجود" });
    }

    res.status(200).json({
      status: "success",
      message: "تم تحديث بيانات الصنف بنجاح",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "خطأ، فشل العملية",
      status: "fail",
    });
  }
});

// Delete Item
router.delete("/:id", tokenAuth, async (req, res) => {
  try {
    const result = await db.collection("items").updateOne(
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

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ status: "fail", message: "الصنف غير موجودة" });
    }
    res.status(200).json({ status: "success", message: "تم حذف الصنف بنجاح" });
  } catch (error) {
    res.status(500).json({ message: "خطأ، فشل العملية", status: "fail" });
  }
});

router.get("/track-quantities", async (req, res) => {
  console.log("tracking....");
  try {
    // Query for supplies
    const supplyPipeline = [
      { $match: { status: 1 } },
      { $unwind: "$items" },
      {
        $group: {
          _id: {
            item_id: "$items.id",
            unit_id: "$items.unit_id",
          },
          supplied_quantity: { $sum: { $toDouble: "$items.quantity" } },
        },
      },
      {
        $project: {
          item_id: "$_id.item_id",
          unit_id: "$_id.unit_id",
          supplied_quantity: 1,
          _id: 0,
        },
      },
    ];

    const supplies = await db
      .collection("supplies")
      .aggregate(supplyPipeline)
      .toArray();

    // Query for sales
    const posPipeline = [
      { $match: { status: 1 } },
      { $unwind: "$items" },
      {
        $group: {
          _id: {
            item_id: "$items.id",
            unit_id: "$items.unit_id",
          },
          sold_quantity: { $sum: { $toDouble: "$items.quantity" } },
        },
      },
      {
        $project: {
          item_id: "$_id.item_id",
          unit_id: "$_id.unit_id",
          sold_quantity: 1,
          _id: 0,
        },
      },
    ];

    const sales = await db.collection("pos").aggregate(posPipeline).toArray();

    res.json({ supplies, sales });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
