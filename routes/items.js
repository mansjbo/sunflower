const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const crypto = require('crypto');
const {tokenAuth, validateCategory, validateBrand} = require("../config/middleware")
const {getTimestamp, paginateData} = require("../config/lab")
const bcrypt = require('bcrypt')


router.get('/track-quantities', async (req, res) => {
    console.log("tracking....");
    try {
        // Query for supplies
        const supplyQuery = `
          SELECT 
            JSON_UNQUOTE(JSON_EXTRACT(item_data.id, '$')) AS item_id,
            JSON_UNQUOTE(JSON_EXTRACT(item_data.unit_id, '$')) AS unit_id,
            SUM(CAST(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(item_data.quantity, '$')), '0') AS DECIMAL(18, 4))) AS supplied_quantity
          FROM supply
          CROSS JOIN JSON_TABLE(
            COALESCE(_items_, '[]'),
            '$[*]'
            COLUMNS(
              id VARCHAR(100) PATH '$.id',
              unit_id VARCHAR(100) PATH '$.unit_id',
              quantity VARCHAR(255) PATH '$.quantity'
            )
          ) AS item_data
          WHERE _status_ = b'1'
          GROUP BY item_id, unit_id;
        `;
    
        const [supplies] = await pool.execute(supplyQuery);
    
        // Query for sales
        const posQuery = `
          SELECT 
            JSON_UNQUOTE(JSON_EXTRACT(item_data.id, '$')) AS item_id,
            JSON_UNQUOTE(JSON_EXTRACT(item_data.unit_id, '$')) AS unit_id,
            SUM(CAST(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(item_data.quantity, '$')), '0') AS DECIMAL(18, 4))) AS sold_quantity
          FROM pos
          CROSS JOIN JSON_TABLE(
            COALESCE(_items_, '[]'),
            '$[*]'
            COLUMNS(
              id VARCHAR(100) PATH '$.id',
              unit_id VARCHAR(100) PATH '$.unit_id',
              quantity VARCHAR(255) PATH '$.quantity'
            )
          ) AS item_data
          WHERE _status_ = b'1'
          GROUP BY item_id, unit_id;
        `;
    
        const [sales] = await pool.execute(posQuery);
    
        res.json({ supplies, sales });
      } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
      }
  });



// New Item
router.post("/", tokenAuth, async(req, res)=>{
    try {


        const {title, category, brand} = req.body
        
        // Validating data
        if (title == undefined || title.length < 5) {
            return res.status(400).json({message: "اسم الصنف غير صحيح", status: "fail"})
        }

        if (category == undefined || category.length < 10 || !validateCategory(category)) {
            return res.status(400).json({message: " التصنيف غير موجود", status: "fail"})
        }

        if (brand == undefined || brand.length < 10 || !validateBrand(brand)) {
            return res.status(400).json({message: " العلامة التجارية غير موجود", status: "fail"})
        }

        // if (units.length <= 0) {
        //     return res.status(400).json({message: "هذا الصنف لا يحتوي على وحدات، يجب أن يحتوي الصنف على وحدة واحدة على الأقل", status: "fail"})
        // }
        const id = crypto.randomBytes(10).toString("hex");

        const sql = `
              
            INSERT INTO ITEM (__id__, _title_, _category_, _brand_, _config_) 
                VALUES (
                    '${id}',
                    '${title}',
                    '${category}',
                    '${brand}',
                    '${JSON.stringify({createdAt: getTimestamp(), createdBy: req.obj.user.__id__})}'
                )
            `

        const [insert] = await pool.query(sql)
        res.status(201).json({message: "تم حفظ ييانات الصنف بنجاح", status: "success"})


    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})


router.post("/units/:id", async(req,res)=>{
    try {
        var items = req.body;
        for (const item of items) {
            item.unit_id = crypto.randomBytes(10).toString("hex");
        }
        if (items.length <= 0) {
            return res.status(500).json({message: "خطأ، لا يوجد عدد كافي من الوحدات", status: "fail"})
        }

        const sql = `UPDATE ITEM SET _units_ = '${JSON.stringify(items)}' WHERE __id__ = '${req.params.id}'`
        const [update] = await pool.query(sql)
        if (update.affectedRows == 1) {
            return res.status(201).json({message: "تم حفظ بيانات الوحدات بنجاح", status: "success"})
        }
        res.status(500).json({ message: 'خطأ، تعذر تحديث البيانات', status: 'fail' });
        
    } catch (error) {
        // console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

router.get("/units/:id", async(req, res)=>{
    try {
        const query = `SELECT _units_ FROM ITEM i WHERE i.__id__ = '${req.params.id}'`
        const [units] = await pool.query(query)
        // console.log(units[0]);
        res.status(201).json(units[0])
    } catch (error) {
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

// Get All Items
router.get("/", tokenAuth, async(req, res)=>{
    try {
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const txt = req.query.txt || ""

        const [itemsList] = await pool.query(`SELECT i.__id__, i._title_, i._brand_, i._category_, i._units_, b._name_ AS brand, c._title_ AS category FROM ITEM i
            LEFT JOIN BRAND b ON b.__id__ = i._brand_
            LEFT JOIN CATEGORY c ON c.__id__ = i._category_
            WHERE 
            (REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(i._title_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%'
            OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(b._name_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%'
            OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(c._title_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%'
            )

            AND i._status_ = 1`)
        if (itemsList.length > 0) {
            const data = paginateData(itemsList, page, limit)
            return res.status(201).json({...data, status: "success"})
        }else{
            return res.status(204).json({message: "لا يوجد بيانات متاحة", status: "fail"})
        }
        
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

// Get All Items
router.get("/all", tokenAuth, async(req, res)=>{
    try {
        const [itemsList] = await pool.query(`SELECT i.__id__, i._title_, i._brand_, i._category_, i._units_, b._name_ AS brand, c._title_ AS category FROM ITEM i
            LEFT JOIN BRAND b ON b.__id__ = i._brand_
            LEFT JOIN CATEGORY c ON c.__id__ = i._category_
            WHERE  i._status_ = 1`)
        if (itemsList.length > 0) {
            return res.status(201).json({data: itemsList, status: "success"})
        }else{
            return res.status(204).json({message: "لا يوجد بيانات متاحة", status: "fail"})
        }
        
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})


// Get Item By id
router.get("/:id", tokenAuth, async(req, res)=>{
    try {

        const [item] = await pool.query(`SELECT i.__id__, i._title_, i._category_, i._brand_, i._units_ FROM ITEM i WHERE  i._status_ = 1 AND i.__id__ = '${req.params.id}'`)
        if (item.length > 0) {
            return res.status(201).json({status: "success", data: item[0]})
        }else{
            return res.status(400).json({message: "لا يوجد بيانات لهذه الشركة", status: "fail"})
        }

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})


// Update Item
router.put("/:id", tokenAuth, async(req, res)=>{
    try {
        const {title, category, brand} = req.body
        
        // Validating data
        if (title == undefined || title.length < 5) {
            return res.status(400).json({message: "اسم الصنف غير صحيح", status: "fail"})
        }

        if (category == undefined || category.length < 10 || !validateCategory(category)) {
            return res.status(400).json({message: " التصنيف غير موجود", status: "fail"})
        }

        if (brand == undefined || brand.length < 10 || !validateCategory(brand)) {
            return res.status(400).json({message: " العلامة التجارية غير موجود", status: "fail"})
        }

        // if (units.length <= 0) {
        //     return res.status(400).json({message: "هذا الصنف لا يحتوي على وحدات، يجب أن يحتوي الصنف على وحدة واحدة على الأقل", status: "fail"})
        // }
        const sql = 
        `UPDATE ITEM SET 
            _title_ = '${title}',
            _brand_ = '${brand}',
            _category_ = '${category}',
           
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
        WHERE __id__ = '${req.params.id}'`
     
        const [result] = await pool.query(sql)

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: 'fail', message: 'الشركة غير موجودة' });
        }
        res.status(200).json({ status: 'success', message: 'تم تحديث بيانات الشركة بنجاح' });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

// Delete Item
router.delete("/:id", tokenAuth, async(req, res)=>{
    try {
        const sql = 
            `UPDATE ITEM SET _status_ = 0,  
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
            WHERE __id__ = '${req.params.id}'`
                
            
        const [result] = await pool.query(sql)

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: 'fail', message: 'الصنف غير موجودة' });
        }
        res.status(200).json({ status: 'success', message: 'تم حذف الصنف بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})













module.exports = router;
