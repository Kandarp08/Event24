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

async function mailInterestedUsers(institute_name, club, subject, text)
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

        subject: subject,
        text: text
    }

    try
    {
        await client.connect();

        var dbo = client.db("userdata");

        var all_users = await dbo.collection("users").find({}).toArray();

        for (var user of all_users)
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

            else if (!("admin" in user) && user.institute == institute_name && user.interests.includes(club))
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

            res.render("events.ejs", {user: req.cookies.user, data: institute.categories, events: institute.events});
        }
    }
});

router.post("/newevent", function(req, res)
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
        permissions: [{username: req.cookies.user.username, email: req.cookies.user.email, type: "organise_request"}]
    };

    if (!("admin" in req.cookies.user) && req.cookies.user.permissions.includes(new_event.club))
    {
        new_event.accepted = true;
        new_event.permissions = [];

        addEvent(req.cookies.user.institute, new_event, true);
    }

    else if ("admin" in req.cookies.user)
    {
        new_event.accepted = true;
        new_event.permissions = [];

        addEvent(req.cookies.user.admin, new_event, true);
    }

    else
        addEvent(req.cookies.user.institute, new_event, false);

    async function addEvent(institute_name, new_event, mail_flag)
    {
        try
        {
            await client.connect();

            var dbo = client.db("institute_data");
            await dbo.collection("institutes").updateOne({name: institute_name}, {$push: {events: {$each: [new_event], $sort: {time: 1}}}});
        }

        finally
        {
            await client.close();

            if (mail_flag)
                await mailInterestedUsers(institute_name, new_event.club, new_event.name, new_event.description);
            
            res.redirect("http://localhost:8080/events");
        }
    }
});

router.post("/edit", function(req, res)
{
    var event_id = parseInt(Object.keys(req.body)[0].substr(4, Object.keys(req.body)[0].length - 4));
});

router.post("/cancel", function(req, res)
{
    var event_id = parseInt(Object.keys(req.body)[0].substr(4, Object.keys(req.body)[0].length - 4));
    var event = req.body;

    event["name"] = event["name" + event_id];
    delete event["name" + event_id];

    if ("admin" in req.cookies.user)
        removeEvent(req.cookies.user.admin, event).catch(console.dir);

    else
        removeEvent(req.cookies.user.institute, event).catch(console.dir);

    async function removeEvent(institute_name, event)
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
            var events = institute.events;
            var eventIndex = -1;

            for (let i = 0; i < events.length; ++i)
            {
                var element = events[i];

                if (element.name == event.name && element.club == event.club && element.venue == event.venue &&
                    element.time == event.time && element.description == event.description)
                {
                    eventIndex = i;
                    break;
                }
            }

            if (eventIndex != -1)
            {
                events.splice(eventIndex, 1);
                await dbo.collection("institutes").updateOne({name: institute_name}, {$set: {events: events}});

                await client.close();

                var mailText = "The event " + event.name + " organised by " + event.club + " has been cancelled.\n\nThank you";

                await mailInterestedUsers(institute_name, event.club, "Cancelled : " + event.name, mailText);
            }

            else
                await client.close();

            res.redirect("http://localhost:8080/events");
        }
    }
});

router.post("/editrequest", function(req, res)
{
    var event_id = parseInt(Object.keys(req.body)[0].substr(4, Object.keys(req.body)[0].length - 4));
});

router.post("/cancelrequest", function(req, res)
{
    var event_id = parseInt(Object.keys(req.body)[0].substr(4, Object.keys(req.body)[0].length - 4));
});

module.exports = router;