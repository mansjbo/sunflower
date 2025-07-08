const mysql = require("mysql2/promise");

const pool = mysql.createPool({
	host: "localhost",
	user: "root",
	password: "*eII4%G808",
	database: "SUNFLOWER_DB",
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
});

// const pool = mysql.createPool({
// 	host: "fdb1028.awardspace.net", // The host they provided
// 	port: 3306, // Default MySQL port (explicitly set)
// 	user: "4639578_sunfower", // Note the username matches db name
// 	password: "_^v1Nxa:2M?vr%z:", // The password you set
// 	database: "4639578_sunfower", // Same as username
// 	waitForConnections: true,
// 	connectTimeout: 100000,
// 	// connectionLimit: 10,
// 	// queueLimit: 0,
// });

module.exports = pool;
