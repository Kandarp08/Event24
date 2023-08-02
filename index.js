const express = require("express");
const app = express();

app.use(express.static("views"));
app.set("view engine", "ejs");

const dotenv = require("dotenv");
dotenv.config();

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = process.env.URI;

const client = new MongoClient(uri, 
{
    serverApi: 
    {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

module.exports = client;

const login_router = require("./login");
const registration_router = require("./registration");
const events_router = require("./events");

app.use("/", login_router);
app.use("/", registration_router);
app.use("/", events_router);

app.get("/event24", function(req, res)
{
    res.render("index.ejs");
}); 

app.listen(8080);