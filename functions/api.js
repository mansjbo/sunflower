const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");
const serverless = require("serverless-http");
const app = express();

// Middleware to parse JSON
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use("/users", require("../routes/users.js"));
app.use("/brands", require("../routes/brands.js"));
app.use("/categories", require("../routes/categories.js"));
app.use("/items", require("../routes/items.js"));
app.use("/suppliers", require("../routes/suppliers.js"));
app.use("/supplies", require("../routes/supplies.js"));
app.use("/sales", require("../routes/sales.js"));
app.use("/test", require("../routes/testapi.js"));
// app.get('/', (req,res)=>{
//     console.log("Requesting.....");
//     res.status(201).send("Successfully Requested hhhhhhhhhh")
// })

// try {

// } catch (error) {
//     res.status(500).json({ message: 'خطأ، فشل العملية', status: 'fail' });
// }

app.use("/.netlify/functions/api", router);
module.exports.handler = serverless(app);

// const PORT = 4496;
// app.listen(PORT, () => {
// 	console.log(`Server is running on port ${PORT}`);
// });
