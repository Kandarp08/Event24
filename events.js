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

            else if (!("admin" in user) && user.institute == institute_name && user.interests.includes(new_event.club))
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
        permissions: [{username: req.cookies.user.username, email: req.cookies.user.email, type: "organise"}],
    };

    if (!("admin" in req.cookies.user) && req.cookies.user.permissions.includes(new_event.club))
    {
        new_event.accepted = true;
        new_event.permissions.type = "allowed";

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
    
            res.render("requests.ejs", {user: req.cookies.user, requests: institute.events, req_count: institute.events.filter(function(event){ return event.accepted == false; }).length});
        }
    }
    
    fetchRequests(req.cookies.user.admin);
});

router.post("/requests", function(req, res)
{
    var institute_name = req.cookies.user.admin;
    var institute;

    async function updateEvents()
    {
        try
        {
            await client.connect();

            var dbo = client.db("institute_data");
        
            institute = await dbo.collection("institutes").findOne({name: institute_name});
        }

        finally
        {
            await client.close();

            var events = institute.events;
            var to_be_deleted = [];

            for (var permission in req.body)
            {
                var action = req.body[permission];
                var i = parseInt(permission.split(" ")[0]);
                var j = parseInt(permission.split(" ")[1]);

                var subject, text;

                if (action == "decline")
                {
                    subject = "Request for event declined";

                    text = "Dear " + events[i].permissions[j].username + ", \n\nThe event " + events[i].name +
                            " has been declined by the admin.\n\nThank you";

                    to_be_deleted.push(i);
                }

                else if (action == "approve")
                {
                    events[i].accepted = true;
                    events[i].permissions[j].type = "allowed";

                    subject = "Event approved";

                    text = "Dear " + events[i].permissions[j].username + ", \n\nThe event " + events[i].name +
                            " has been approved by the admin.\n\nThank you";

                    await mailInterestedUsers(institute_name, events[i]);
                }

                else
                {
                    events[i].accepted = true;
                    events[i].permissions[j].type = "allowed";

                    subject = "Event approved";

                    text = "Dear " + events[i].permissions[j].username + ", \n\nThe event " + events[i].name + 
                            " has been approved by the admin.\n\nYou have been granted permission to organise all events of " +
                            events[i].club + ".\n\nThank you";

                    await client.connect();

                    var dbo = client.db("userdata");
                    await dbo.collection("users").updateOne({username: events[i].permissions[j].username}, {$push: {permissions: events[i].club}});

                    await client.close();

                    await mailInterestedUsers(institute_name, events[i]);
                }
                
                await mailUser(institute.name, events[i].permissions[j].email, subject, text);
            }

            to_be_deleted.sort();
            var len = to_be_deleted.length;

            for (let i = len - 1; i >= 0; --i)
                events.splice(to_be_deleted[i], 1);

            await client.connect();

            var dbo = client.db("institute_data");
            await dbo.collection("institutes").updateOne({name: institute_name}, {$set: {events: events}});

            await client.close();

            res.redirect("http://localhost:8080/events");
        }
    }

    async function mailUser(institute_name, recipient, subject, text)
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
            to: recipient,

            subject: subject,
            text: text
        }

        transporter.sendMail(mailOptions, function(err, info)
        {
            if (err)
                console.log(err);
        });
    }

    updateEvents();
});

module.exports = router;