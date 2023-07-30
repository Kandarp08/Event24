const express = require("express");
const app = express();

const bodyParser = require("body-parser");
const multer = require("multer");
const upload = multer();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(upload.array());

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

var data = {};
var events = {};

app.get("/event24", function(req, res)
{
    async function fetchData()
    {
        try
        {
            await client.connect();
            
            var dbo = client.db("institute_data");
            var institutes = await dbo.collection("institutes").find({}).toArray();

            for (var institute of institutes)
            {
                data[institute.name] = institute.categories;
                events[institute.name] = institute.events;
            }
        }

        finally
        {
            await client.close();
            res.render("index.ejs");
        }
    }

    if (Object.keys(events).length == 0)
        fetchData().catch(console.dir);

    else
        res.render("index.ejs");
});

app.get("/login", function(req, res)
{
    res.render("login_page.ejs", {msg: ""});
});

app.post("/login", function(req, res)
{
    async function login()
    {
        try
        {
            await client.connect();

            var dbo = client.db("userdata");
            var query = {username: req.body.username, password: req.body.password};

            var result = await dbo.collection("users").findOne(query);

            if (result == null)
            {
                await client.close();
                res.render("login_page.ejs", {msg: "Invalid Credentials"});
            }

            else
            {
                await client.close();
                res.redirect("http://localhost:8080/events/username=" + req.body.username);
            } 
        }

        catch (err)
        {
            console.log(err);
        }
    }

    login();    
});

app.get("/register", function(req, res)
{
    res.render("registration_page.ejs", {msg: "", data: data});
});

app.post("/register", function(req, res)
{
    async function confirmDetails()
    {
        try
        {
            await client.connect();

            var dbo = client.db("userdata");

            var cursorName = await dbo.collection("users").findOne({username: req.body.username});
            var cursorMail = await dbo.collection("users").findOne({email: req.body.email});

            await client.close();

            if (cursorName != null)
            {
                res.render("registration_page.ejs", {msg: "This username already exists. Please select another username.", data: data});
            }

            else if (cursorMail != null)
            {
                res.render("registration_page.ejs", {msg: "This email is already registered. Please use another email id.", data: data});
            }

            else
            {
                addUser().catch(console.dir);
                res.render("login_page.ejs", {msg: "Registration Successful. Please Login to continue."});
            }
        }

        catch (err)
        {
            console.log(err);
        }
    }

    async function addUser()
    {
        try
        {
            var dbo = client.db("userdata");

            var doc = 
            {
                username: req.body.username,
                password: req.body.password,
                email: req.body.email,
                institute: req.body.institute,
                interests: [],
                permissions: [],
            }

            for (var cat of req.body.category)
                doc.interests.push(cat);

            await client.connect();
            await dbo.collection("users").insertOne(doc);
        }

        finally
        {
            await client.close();
        }
    }

    confirmDetails();
});

app.get("/events/username=:username", function(req, res)
{
    var username = req.params.username;
    var user_doc;

    async function fetchEvents()
    {
        try
        {
            await client.connect();

            var dbo = client.db("userdata");
            user_doc = await dbo.collection("users").findOne({username: username});
        }

        finally
        {
            await client.close();

            if ("institute" in user_doc)
                res.render("events.ejs", {events: events[user_doc.institute]});

            else
                res.render("events.ejs", {events: events[user_doc.admin]});
        }
    }

    fetchEvents().catch(console.dir);
});

app.listen(8080);