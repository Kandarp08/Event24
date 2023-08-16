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
const requests_router = require("./requests");
const manage_users_router = require("./manage_users");
const profile_router = require("./user_profile");
const myevents_router = require("./myevents");

app.use("/", login_router);
app.use("/", registration_router);
app.use("/", events_router);
app.use("/", requests_router);
app.use("/", manage_users_router);
app.use("/", profile_router);
app.use("/", myevents_router);

app.get("/event24", function(req, res)
{
    res.render("index.ejs");
}); 

app.listen(8080);