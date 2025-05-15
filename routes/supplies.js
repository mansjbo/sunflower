const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const crypto = require('crypto');
const {tokenAuth, validateDate, validateItem} = require("../config/middleware")
const {getTimestamp, paginateData} = require("../config/lab")
const bcrypt = require('bcrypt')


// New Supplies
router.post('/', tokenAuth, async(req, res)=>{
    
    try {
        console.log(req.body);
        const {"supplies-date": date, "supplier-select":supplier, items}= req.body
        
        if (!validateDate(date)) {
            return res.status(400).json({message: "خطأ في التاريخ", status: "fail"})
        }

        if (supplier == undefined || supplier.length < 10) {
            return res.status(400).json({message: "بيانات المورد غير صحيحة", status: "fail"})
        }

        if (items == undefined || items.length <= 0 ) {
            return res.status(400).json({message: "يجب التأكد من الأصناف", status:"fail"})
        }
                
        const id = crypto.randomBytes(16).toString("hex");

        const sql = `
            INSERT INTO SUPPLY (__id__, _date_, _supplier_, _items_, _config_) VALUES
            ('${id}', '${date}', '${supplier}', '${JSON.stringify(items)}', '${JSON.stringify({createdAt: getTimestamp(), createdBy: req.obj.user.__id__})}')
        `
        const [newSupply] = await pool.query(sql)
        res.status(201).json({message: "تم حفظ البيانات بنجاح", status: "success"})
        
    } catch (error) {
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

// Supplies List
router.get("/", tokenAuth, async(req, res)=>{
    try {
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const txt = req.query.txt || ""
        const sql = (`SELECT i.__id__, DATE_FORMAT(i._date_, '%Y-%m-%d') AS _date_, i._title_, i.total FROM SUPPLIES i
            
            WHERE (
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(i._date_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%'
            OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(i._title_, 'إ', 'ا'), 'أ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ئ', 'ي') LIKE '%${txt}%'
            OR i.total = '${txt}'
            )
           `);
           
        const [invoices] = await pool.query(sql)
        if (invoices.length > 0) {
            
            const data = paginateData(invoices, page, limit)
            return res.status(201).json({...data, status: "success"})
        }else{
            return res.status(200).json({data:[], meta:{}, message: "لا يوجد بيانات متاحة", status: "fail"})
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

// Supplies List
router.get("/:id", tokenAuth, async(req, res)=>{
    try {

        const sql = (`SELECT i.__id__, DATE_FORMAT(i._date_, '%Y-%m-%d') AS _date_, i._title_, i._items_, i._supplier_ FROM SUPPLIES i WHERE i.__id__ = '${req.params.id}'`);
           
        const [supply] = await pool.query(sql)
        if (supply.length > 0) {
            return res.status(201).json({data: supply[0], status: "success"})
        }else{
            return res.status(200).json({data:[], meta:{}, message: "لا يوجد بيانات متاحة", status: "fail"})
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

router.put("/:id", tokenAuth,async(req, res)=>{
    console.log(req.body);
    try {
        const {"supplier-select":supplier,"supplies-date":date, items} = req.body
        
        if (items.length <= 0 ) {
            return res.status(500).json({message: "لا يوجد أصناف كافية", status: "fail"})
        }

        if (!validateDate(date)) {
            return res.status(400).json({message: "خطأ في التاريخ", status: "fail"})
        }

        for (const [index, item] of items.entries()) {
            if (!validateItem(item)) {
                return res.status(500).json({message: `الصنف رقم ${index} غير صحيح، يرجى التأكد من البيانات المدخلية`, status: "fail"})
            }
        }
        
        const sql = `
            UPDATE SUPPLY SET 
                _supplier_ = '${supplier}',
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
            WHERE __id__ = '${req.params.id}'`
        
        const [result] = await pool.query(sql)
        if (result.affectedRows === 0) {
            return res.status(404).json({ status: 'fail', message: 'فشل تحديث الفاتورة' });
        }
        res.status(200).json({ status: 'success', message: 'تم تحديث بيانات الفاتورة بنجاح' });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})

// Delete Invoice
router.delete("/:id", tokenAuth, async(req, res)=>{
    try {
        const sql = 
            `UPDATE SUPPLY SET _status_ = 0,  
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
            return res.status(404).json({ status: 'fail', message: 'الفاتورة غير موجودة' });
        }
        res.status(200).json({ status: 'success', message: 'تم حذف الفاتورة بنجاح' });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
    }
})




// router.get("")
module.exports = router;
