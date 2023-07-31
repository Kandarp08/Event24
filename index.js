const express = require("express");
const app = express();

const cookieParser = require("cookie-parser");
const session = require("express-session");

app.use(cookieParser());
app.use(session({secret: "Key", resave: true, saveUninitialized: true}));

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

const nodemailer = require("nodemailer");

const admin_data = JSON.parse(process.env.ADMIN_DATA);

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

async function fetchData(res, file, params)
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
        res.render(file, params);
    }
}

app.get("/event24", function(req, res)
{
    if (Object.keys(events).length === 0)
        fetchData(res, "index.ejs", null);

    else
        res.render("index.ejs");
});

app.get("/login", function(req, res)
{
    if (Object.keys(events).length === 0)
        fetchData(res, "login_page.ejs", {msg: ""}).catch(console.dir);

    else
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

                res.cookie("username", req.body.username, {maxAge: 1800000});
                res.redirect("http://localhost:8080/events");
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
    if (Object.keys(events).length === 0)
        fetchData(res, "registration_page.ejs", {msg: "", data: data}).catch(console.dir);

    else
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
                res.render("registration_page.ejs", {msg: "This username already exists. Please select another username.", data: req.cookies.data});
            }

            else if (cursorMail != null)
            {
                res.render("registration_page.ejs", {msg: "This email is already registered. Please use another email id.", data: req.cookies.data});
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

app.get("/logout", function(req, res)
{
    res.clearCookie("username");
    res.redirect("http://localhost:8080/event24");
}); 

app.get("/events", function(req, res)
{
    var user_doc;

    if (req.cookies.username === undefined || Object.keys(events).length === 0)
    {
        res.redirect("http://localhost:8080/login");
    }

    else if (!(req.cookies.username === undefined))
        fetchEvents().catch(console.dir);

    async function fetchEvents()
    {
        try
        {
            await client.connect();

            var dbo = client.db("userdata");
            user_doc = await dbo.collection("users").findOne({username: req.cookies.username});

            res.cookie("user", user_doc, {maxAge: 1800000});
        }

        finally
        {
            await client.close();

            if ("institute" in user_doc)
                res.render("events.ejs", {data: data[user_doc.institute], events: events[user_doc.institute], user: user_doc});

            else
                res.render("events.ejs", {data: data[user_doc.admin], events: events[user_doc.admin], user: user_doc});
        }
    }
});

app.post("/events", function(req, res)
{
    var new_event;
    var curr_events;

    async function updateEvents(institute_name)
    {
        try
        {   
            await client.connect();

            var dbo = client.db("institute_data");
            
            await dbo.collection("institutes").updateOne({name: institute_name}, {$set: {events: curr_events}});
        }

        finally
        {
            await client.close();
            announceEvent();
        }
    }

    async function informUser(mailOptions, transporter, user)
    {
        mailOptions.to = user.email;
                    
        await transporter.sendMail(mailOptions, function(err, info)
        {
            if (err)
                console.log(err);

            else
                console.log("Email sent successfully to " + user.email);
        });
    }

    async function announceEvent()
    {
        const transporter = nodemailer.createTransport
        ({
            host: admin_data[req.cookies.user.institute].host,

            auth:
            {
                user: admin_data[req.cookies.user.institute].user,
                pass: admin_data[req.cookies.user.institute].pass
            }
        });

        const mailOptions =
        {
            from: admin_data[req.cookies.user.institute].user,
        
            subject: new_event.name,
            text: new_event.description
        };

        try
        {
            await client.connect();

            var dbo = client.db("userdata");
            var interested_users = await dbo.collection("users").find({}).toArray();

            for (var user of interested_users)
            {
                if (("admin" in user) || user.interests.includes(new_event.club))
                {
                    informUser(mailOptions, transporter, user);
                }
            }
        }

        finally
        {
            await client.close();

            if ("institute" in req.cookies.user)
                res.render("events.ejs", {data: data[req.cookies.user.institute], events: events[req.cookies.user.institute], user: req.cookies.user});

            else
                res.render("events.ejs", {data: data[req.cookies.user.admin], events: events[req.cookies.user.admin], user: req.cookies.user});
        }
    }

    new_event =
    {
        name: req.body.name,
        club: req.body.club,
        venue: req.body.venue,
        time: req.body.time,
        description: req.body.description,
        status: "requested",
        organizer: req.cookies.user.username,
    };

    if (("admin" in req.cookies.user) || req.cookies.user.permissions.includes(req.body.club))
    {
        new_event.status = "accepted";
        curr_events = events[req.cookies.user.institute];

        curr_events.push(new_event);
        events[req.cookies.user.institute] = curr_events;

        updateEvents(req.cookies.user.institute, curr_events, new_event).catch(console.dir);
    }

    else
    {
        // Mark event as requested
    }
});

app.listen(8080);