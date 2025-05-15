const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const crypto = require('crypto');
const {tokenAuth} = require("../config/middleware")
const {getTimestamp, paginateData} = require("../config/lab")
const bcrypt = require('bcrypt')


// New Supplier
router.post("/", tokenAuth, async(req, res)=>{
    try {
        
        const {supplierName} = req.body
        if (supplierName == undefined || supplierName.length < 5) {
            return res.status(500).json({message: "اسم المورد غير صحيح", status: "fail"})
        }
        
        const id = crypto.randomBytes(10).toString("hex");
        const [supplier] = await pool.query(`INSERT INTO SUPPLIER (__id__ , _title_, _config_) 
            VALUES ('${id}', '${supplierName}', '${JSON.stringify({createdAt: getTimestamp(), createdBy: req.obj.user.__id__})}')`)

        res.status(201).json({message: "تم حفظ البيانات بنجاح", status: "success"})

    } catch (error) {
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})


// Get All Suppliers
router.get("/", tokenAuth, async(req, res)=>{
    try {
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const txt = req.query.txt || ""

        const [suppliersList] = await pool.query(`SELECT b.__id__, b._title_ FROM SUPPLIER b WHERE  b._status_ = 1`)
        
        if (suppliersList.length > 0) {
            const data = paginateData(suppliersList, page, limit)
            return res.status(201).json({...data, status: "success"})
        }else{
            return res.status(200).json({message: "لا يوجد بيانات متاحة", data:suppliersList, status: "fail"})
        }
        
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

// Get All Suppliers
router.get("/all", tokenAuth, async(req, res)=>{
    try {
        const [suppliersList] = await pool.query(`SELECT b.__id__, b._title_ FROM SUPPLIER b WHERE  b._status_ = 1`)
        
        if (suppliersList.length > 0) {
            return res.status(201).json({data: suppliersList, status: "success"})
        }else{
            return res.status(200).json({message: "لا يوجد بيانات متاحة", data:suppliersList, status: "fail"})
        }
        
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})


// Get Supplier By id
router.get("/:id", tokenAuth, async(req, res)=>{
    try {

        const [supplier] = await pool.query(`SELECT b.__id__, b._title_ FROM SUPPLIER b WHERE  b._status_ = 1 AND b.__id__ = '${req.params.id}'`)
        if (supplier.length > 0) {
            return res.status(201).json({status: "success", data: supplier[0]})
        }else{
            return res.status(400).json({message: "لا يوجد بيانات لهذا المورد", status: "fail"})
        }

    } catch (error) {
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})


// Update Supplier
router.put("/:id", tokenAuth, async(req, res)=>{
    try {
        const sql = 
        `UPDATE SUPPLIER SET _title_ = '${req.body.supplierName}',
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
        return res.status(404).json({ status: 'fail', message: 'المورد غير موجود' });
    }
    res.status(200).json({ status: 'success', message: 'تم تحديث بيانات المورد بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

// Delete Supplier
router.delete("/:id", tokenAuth, async(req, res)=>{
    try {
        const sql = 
            `UPDATE SUPPLIER SET _status_ = 0,  
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
            return res.status(404).json({ status: 'fail', message: 'خطأ، تعذر اتمام العملية لأن المورد غير موجود' });
        }
        res.status(200).json({ status: 'success', message: 'تم حذف المورد بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

module.exports = router;
