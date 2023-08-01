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

                res.cookie("user", result, {maxAge: 1800000});
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
                remind: req.body.remind,
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
    res.clearCookie("user");
    res.redirect("http://localhost:8080/event24");
}); 

function showEvents(req, res)
{    
    if ("institute" in req.cookies.user)
        res.render("events.ejs", {data: data[req.cookies.user.institute], events: events[req.cookies.user.institute], user: req.cookies.user});

    else
        res.render("events.ejs", {data: data[req.cookies.user.admin], events: events[req.cookies.user.admin], user: req.cookies.user});
}

app.get("/events", function(req, res)
{
    if (req.cookies.user === undefined || Object.keys(events).length === 0)
        res.redirect("http://localhost:8080/login");

    else
        showEvents(req, res);
});

app.post("/events", function(req, res)
{
    var new_event;

    new_event =
    {
        name: req.body.name,
        club: req.body.club,
        venue: req.body.venue,
        time: req.body.time,
        description: req.body.description,
        accepted: false,
        permissions: [{username: req.cookies.user.username, type: "organise_request"}],
    };

    if (!("admin" in req.cookies.user) && req.cookies.user.permissions.includes(new_event.club))
    {
        new_event.accepted = true;
        new_event.permissions = [{username: req.cookies.user.username, type: "allowed"}];

        updateEventsDatabase(req.cookies.user.institute, new_event, events[req.cookies.user.institute], req, res, true);
    }

    else if ("admin" in user)
    {
        new_event.accepted = true;
        new_event.permissions = [];

        updateEventsDatabase(req.cookies.user.admin, new_event, events[req.cookies.useradmin], req, res, true);
    }

    else
    {
        updateEventsDatabase(req.cookies.user.institute, new_event, events[req.cookies.user.institute], req, res, false);
    }

    async function updateEventsDatabase(institute_name, new_event, curr_events, req, res, mailUsers)
    {
        try
        {
            curr_events.push(new_event);

            await client.connect();

            var dbo = client.db("institute_data");
            await dbo.collection("institutes").updateOne({name: institute_name}, {$set: {events: curr_events}});
        }

        finally
        {
            await client.close();

            if (mailUsers)
                await mailInterestedUsers(new_event, institute_name);

            showEvents(req, res);
        }
    }

    async function mailInterestedUsers(new_event, institute_name)
    {
        const transporter = nodemailer.createTransport
        ({
            host: admin_data[institute_name].host,

            auth:
            {
                user: admin_data[institute_name].user,
                pass: admin_data[institute_name].pass
            }
        });

        const mailOptions =
        {
            from: admin_data[institute_name].user,
        
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
                mailOptions.to = user.email;

                if (("admin" in user) && user.admin == institute_name)
                {
                    transporter.sendMail(mailOptions, function (err, info) 
                    {
                        if (err)
                            console.log(err);
                    });
                }

                else if (user.institute == institute_name && user.interests.includes(new_event.club))
                {
                    transporter.sendMail(mailOptions, function(err, info)
                    {
                        if (err)
                            console.log(err);
                    });
                }
            }
        }

        finally
        {
            await client.close();
        }
    }
});

app.listen(8080);