const express = require("express");
const router = express.Router();

const cookieParser = require("cookie-parser");
const session = require("express-session");

router.use(cookieParser());
router.use(session({secret: "Key", resave: true, saveUninitialized: true}));

const bodyParser = require("body-parser");
const multer = require("multer");
const upload = multer();

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({extended: true}));
router.use(upload.array());

const client = require("./index.js");

const dotenv = require("dotenv");
dotenv.config();

const admin_data = JSON.parse(process.env.ADMIN_DATA);

const nodemailer = require("nodemailer");

router.get("/events", function(req, res)
{
    if (req.cookies.user == undefined)
        res.redirect("http://localhost:8080/login");
     
    else if ("admin" in req.cookies.user)
        fetchEvents(req.cookies.user.admin);

    else
        fetchEvents(req.cookies.user.institute);

    async function fetchEvents(institute_name)
    {
        var institute;

        try
        {
            await client.connect();

            var dbo = client.db("institute_data");
            institute = await dbo.collection("institutes").findOne({name: institute_name});
        }

        finally
        {
            await client.close();

            res.render("events.ejs", {user: req.cookies.user, data: institute.categories, events: institute.events, req_count: institute.events.filter(function(event){return event.accepted == false;}).length});
        }
    }
});

router.post("/events", function(req, res)
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
        permissions: [{username: req.cookies.user.username, type: "organise"}],
    };

    if (!("admin" in req.cookies.user) && req.cookies.user.permissions.includes(new_event.club))
    {
        new_event.accepted = true;
        new_event.permissions = [{username: req.cookies.user.username, type: "allowed"}];

        updateEvents(req.cookies.user.institute, new_event, true);
    }

    else if ("admin" in req.cookies.user)
    {
        new_event.accepted = true;
        new_event.permissions = [];

        updateEvents(req.cookies.user.admin, new_event, true);
    }

    else
        updateEvents(req.cookies.user.institute, new_event, false);

    async function updateEvents(institute_name, new_event, mail_flag)
    {
        try
        {
            await client.connect();

            var dbo = client.db("institute_data");
            await dbo.collection("institutes").updateOne({name: institute_name}, {$push: {events: new_event}});
        }

        finally
        {
            await client.close();

            if (mail_flag)
                await mailInterestedUsers(institute_name, new_event);
            
            res.redirect("http://localhost:8080/events");
        }
    }

    async function mailInterestedUsers(institute_name, new_event)
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

router.get("/requests", function(req, res)
{
    if (req.cookies.user == undefined || !("admin" in req.cookies.user))
        res.redirect("http://localhost:8080/login");

    async function fetchRequests(institute_name)
    {
        var institute;
    
        try
        {
            await client.connect();
    
            var dbo = client.db("institute_data");
            institute = await dbo.collection("institutes").findOne({name: institute_name});
        }
    
        finally
        {
            await client.close();
    
            res.render("requests.ejs", {user: req.cookies.user, requests: institute.events.filter(function(event){return event.accepted == false;})});
        }
    }
    
    fetchRequests(req.cookies.user.admin);
});

module.exports = router;