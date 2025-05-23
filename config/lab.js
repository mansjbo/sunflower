const fs = require("fs");
const path = require("path");
const pool = require("./db"); // Import the pool from db.js

function getTimestamp() {
	const now = new Date();

	// Get the current timestamp in milliseconds since the Unix epoch
	const timestamp = now.getTime();

	// Create a new Date object using the timestamp
	const localTime = new Date(timestamp);

	// Calculate the GMT+2 offset in minutes (GMT+2 is +120 minutes)
	const offset = 120;

	// Get the current UTC time in minutes
	const utcTimeInMinutes = localTime.getUTCMinutes();

	// Calculate the time in GMT+2
	const gmtPlus2TimeInMinutes = utcTimeInMinutes + offset;

	// Set the time in GMT+2
	localTime.setUTCMinutes(gmtPlus2TimeInMinutes);

	// Format the date as a timestamp string
	const year = localTime.getUTCFullYear();
	const month = String(localTime.getUTCMonth() + 1).padStart(2, "0");
	const day = String(localTime.getUTCDate()).padStart(2, "0");
	const hours = String(localTime.getUTCHours()).padStart(2, "0");
	const minutes = String(localTime.getUTCMinutes()).padStart(2, "0");
	const seconds = String(localTime.getUTCSeconds()).padStart(2, "0");

	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

const makeNumber = (val, dg = 3) => {
	if (Number(val) % 1 != 0) {
		return Number(val).toFixed(dg);
	} else {
		return Number(val).toFixed(0);
	}
};

function str_pad(input, length, padString, padType) {
	input = String(input);
	padString = String(padString || " ");
	padType = padType || "left";

	if (input.length >= length) {
		return input; // No padding needed
	}

	const padLength = length - input.length;
	const padding = padString
		.repeat(Math.ceil(padLength / padString.length))
		.substr(0, padLength);

	if (padType === "left") {
		return padding + input;
	} else if (padType === "right") {
		return input + padding;
	} else {
		throw new Error("Invalid padType");
	}
}

async function getCount(tableName) {
	const sql = "SELECT COUNT(*) AS count FROM " + tableName;

	try {
		const [rows] = await pool.query(sql);
		return rows[0].count;
	} catch (err) {
		console.error("Error fetching count:", err);
		throw new Error("Database Error");
	}
}

// const orderUnits = (items)=>{

// }

const bitToBoolean = (buffer) => !!buffer[0];

function paginateData(collection, page, limit) {
	const startIndex = (page - 1) * limit;
	const endIndex = page * limit;

	var results = { meta: {} };

	if (endIndex < collection.length) {
		results.meta.next = {
			page: page + 1,
			limit: limit,
		};
	}

	if (startIndex > 0) {
		results.meta.previous = {
			page: page - 1,
			limit: limit,
		};
	}

	results.meta.pages_count = Math.ceil(collection.length / limit);
	results.meta.results_count = collection.length;
	results.data = collection.slice(startIndex, endIndex);
	return results;
}

module.exports = {
	getTimestamp,
	makeNumber,
	str_pad,
	bitToBoolean,
	paginateData,
	getCount,
};
