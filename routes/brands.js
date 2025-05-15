const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const crypto = require('crypto');
const {tokenAuth} = require("../config/middleware")
const {getTimestamp, paginateData} = require("../config/lab")
const bcrypt = require('bcrypt')

// console.log("Brands Requesting..........");
// New Brand
router.post("/", tokenAuth, async(req, res)=>{
    try {
        
        const {brandName} = req.body
        if (brandName == undefined || brandName.length < 2) {
            return res.status(500).json({message: "اسم العلامة التجارية غير صحيح", status: "fail"})
        }
        
        const id = crypto.randomBytes(10).toString("hex");
        const [brand] = await pool.query(`INSERT INTO BRAND (__id__ , _name_, _config_) 
            VALUES ('${id}', '${brandName}', '${JSON.stringify({createdAt: getTimestamp(), createdBy: req.obj.user.__id__})}')`)

            res.status(201).json({message: "تم حفظ البيانات بنجاح", status: "success"})

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})


// Get Brand All Brands
router.get("/", tokenAuth, async(req, res)=>{
    try {
        // console.log("Requesting.........");
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const txt = req.query.txt || ""

        const [BrandsList] = await pool.query(`SELECT b.__id__, b._name_ FROM BRAND b WHERE (REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(b._name_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%') AND  b._status_ = 1 `)
        
        const data = paginateData(BrandsList, page, limit)
        return res.status(201).json({...data, status: "success"})

        
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})


// Get Brand By id
router.get("/:id", tokenAuth, async(req, res)=>{
    try {

        const [brand] = await pool.query(`SELECT b.__id__, b._name_ FROM BRAND b WHERE  b._status_ = 1 AND b.__id__ = '${req.params.id}'`)
        if (brand.length > 0) {
            return res.status(201).json({status: "success", data: brand[0]})
        }else{
            return res.status(400).json({message: "لا يوجد بيانات لهذه العلامة التجارية", status: "fail"})
        }

    } catch (error) {
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})


// Update Brand
router.put("/:id", tokenAuth, async(req, res)=>{
    console.log(req.params.id);
    try {
        const {brandName} = req.body
        if (brandName == undefined || brandName.length < 2) {
            return res.status(500).json({message: "اسم العلامة التجارية غير صحيح", status: "fail"})
        }
        const sql = 
        `UPDATE BRAND SET _name_ = '${brandName}',
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
        return res.status(404).json({ status: 'fail', message: 'العلامة التجارية غير موجودة' });
    }
    res.status(200).json({ status: 'success', message: 'تم تحديث بيانات العلامة التجارية بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

// Delete Brand
router.delete("/:id", tokenAuth, async(req, res)=>{
    try {
        const sql = 
            `UPDATE BRAND SET _status_ = 0,  
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
            return res.status(404).json({ status: 'fail', message: 'العلامة التجارية غير موجودة' });
        }
        res.status(200).json({ status: 'success', message: 'تم حذف العلامة التجارية بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

module.exports = router;
