const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const crypto = require('crypto');
const {tokenAuth} = require("../config/middleware")
const {getTimestamp, paginateData} = require("../config/lab")
const bcrypt = require('bcrypt')


// New Category
router.post("/", tokenAuth, async(req, res)=>{
    try {
        const {categoryName} = req.body
        if (categoryName == undefined || categoryName.length < 2) {
            return res.status(500).json({message: "اسم التصنيف غير صحيح", status: "fail"})
        }
        
        const id = crypto.randomBytes(10).toString("hex");
        const [category] = await pool.query(`INSERT INTO CATEGORY (__id__ , _title_, _config_) 
            VALUES ('${id}', '${categoryName}', '${JSON.stringify({createdAt: getTimestamp(), createdBy: req.obj.user.__id__})}')`)

        res.status(201).json({message: "تم حفظ البيانات بنجاح", status: "success"})

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})


// Get All Category
router.get("/", tokenAuth, async(req, res)=>{
    try {
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const txt = req.query.txt || ""

        const [categoriesList] = await pool.query(`SELECT b.__id__, b._title_ FROM CATEGORY b 
            WHERE (REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(b._title_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%') AND b._status_ = 1`)

        const data = paginateData(categoriesList, page, limit)
        return res.status(201).json({...data, status: "success"})
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})


// Get Category By id
router.get("/:id", tokenAuth, async(req, res)=>{
    try {

        const [category] = await pool.query(`SELECT b.__id__, b._title_ FROM CATEGORY b WHERE  b._status_ = 1 AND b.__id__ = '${req.params.id}'`)
        if (category.length > 0) {
            return res.status(201).json({status: "success", data: category[0]})
        }else{
            return res.status(400).json({message: "لا يوجد بيانات لهذه الشركة", status: "fail"})
        }

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})


// Update Category
router.put("/:id", tokenAuth, async(req, res)=>{
    try {
        const sql = 
        `UPDATE CATEGORY SET _title_ = '${req.body.categoryName}',
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
            return res.status(404).json({ status: 'fail', message: 'التصنيف غير موجود' });
        }
        res.status(200).json({ status: 'success', message: 'تم تحديث بيانات التصنيف بنجاح' });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

// Delete Category
router.delete("/:id", tokenAuth, async(req, res)=>{
    try {
        const sql = 
            `UPDATE CATEGORY SET _status_ = 0,  
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
            return res.status(404).json({ status: 'fail', message: 'التصنيف غير موجودة' });
        }
        res.status(200).json({ status: 'success', message: 'تم حذف التصنيف بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

module.exports = router;
