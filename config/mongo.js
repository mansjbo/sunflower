const { MongoClient } = require("mongodb");

let dbConnection;

const uri = "mongodb://localhost:27017/sunflower";

module.exports = {
	connectToDb: (cb) => {
		MongoClient.connect(uri) // <-- You need to pass the URI here
			.then((client) => {
				dbConnection = client.db(); // <-- Remove the URI from here
				return cb();
			})
			.catch((err) => {
				console.log(err);
				return cb(err);
			});
	},
	getDb: () => dbConnection,
};
