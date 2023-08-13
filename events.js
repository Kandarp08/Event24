const express = require("express");
const router = express.Router();

const cron = require("node-cron");

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

async function mailInterestedUsers(institute_name, event, subject, text)
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
    
    var mailOptions = 
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

            else if (!("admin" in user) && user.institute == institute_name && user.interests.includes(event.club))
            {
                transporter.sendMail(mailOptions, function(err, info)
                {
                    if (err)
                        console.log(err);
                });

                if (user.remind == true)
                    scheduleMail(mailOptions, user.email, transporter, institute_name, event);
            }
        }
    }

    finally
    {
        await client.close();
    }
}

function scheduleRemoval(institute_name, new_event)
{
    var completionDate = new Date(new_event.time);
    var removeTaskTime = completionDate.getSeconds() + " " + completionDate.getMinutes() + " " + completionDate.getHours() + 
                        " " + completionDate.getDate() + " " + (completionDate.getMonth() + 1) + " " + completionDate.getDay();

    cron.schedule(removeTaskTime, async function removeEvent()
    {
        try
        {
            await client.connect();

            let dbo = client.db("institute_data");
            await dbo.collection("institutes").updateOne({name: institute_name}, {$pull: {events: {id: new_event.id}}});
        }

        finally
        {
            await client.close();
        }
    });
}

function scheduleMail(mailOptions, email, transporter, institute_name, curr_event)
{
    var eventTime = new Date(curr_event.time);
    var mailTime = eventTime.getSeconds() + " " + eventTime.getMinutes() + " " + (eventTime.getHours() - 1) + 
                    " " + eventTime.getDate() + " " + (eventTime.getMonth() + 1) + " " + eventTime.getDay();

    cron.schedule(mailTime, async function remindMail()
    {
        try
        {
            await client.connect();

            var dbo = client.db("institute_data");
            var institute = await dbo.collection("institutes").findOne({name: institute_name});

            var events = await institute.events;

            var req_event = await events.filter(function(event)
            {
                return event.id === curr_event.id;
            });

            if (req_event.length > 0)
            {
                mailOptions.to = email;
                mailOptions.subject = "Reminder : " + req_event[0].name;
                mailOptions.text = req_event[0].description;

                transporter.sendMail(mailOptions, function(err, info)
                {
                    if (err)
                        console.log(err);
                });
            }
        }

        finally
        {
            await client.close();
        }
    });
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
        try
        {
            await client.connect();

            var dbo = client.db("institute_data");
            var institute = await dbo.collection("institutes").findOne({name: institute_name});
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
        var institute;

        try
        {
            await client.connect();

            var dbo = client.db("institute_data");
            institute = await dbo.collection("institutes").findOne({name: institute_name});
        }

        finally
        {
            var newevent_id = await institute.events_id;
            new_event.id = await newevent_id;

            await dbo.collection("institutes").updateOne({name: institute_name}, {$push: {events: {$each: [new_event], $sort: {time: 1}}}});
            await dbo.collection("institutes").updateOne({name: institute_name}, {$inc: {events_id: 1}});

            await client.close();

            scheduleRemoval(await institute_name, new_event);

            if (mail_flag)
                await mailInterestedUsers(institute_name, new_event, new_event.name, new_event.description);
            
            res.redirect("http://localhost:8080/events");
        }
    }
});

router.post("/cancel", function(req, res)
{
    var event_id = parseInt(req.body.id);

    if ("admin" in req.cookies.user)
        removeEvent(req.cookies.user.admin).catch(console.dir);

    else
        removeEvent(req.cookies.user.institute).catch(console.dir);

    async function removeEvent(institute_name)
    {
        try
        {
            await client.connect();

            var dbo = client.db("institute_data");
            await dbo.collection("institutes").updateOne({name: institute_name}, {$pull: {events: {id: event_id}}});
        }

        finally
        {
            await client.close();

            var mailText = "The event " + req.body.name + ", organised by " + req.body.club + ", has been cancelled.\n\nThank you";
            await mailInterestedUsers(institute_name, req.body, "Cancelled : " + req.body.name, mailText);

            res.redirect("http://localhost:8080/events");
        }
    }
});

router.post("/cancelrequest", function(req, res)
{
    var event_id = parseInt(req.body.id);
    var institute_name = req.cookies.user.institute;

    var cancel_request = {username: req.cookies.user.username, email: req.cookies.user.email, type: "cancel_request"};

    addCancelRequest().catch(console.dir);

    async function addCancelRequest()
    {
        var institute;

        try
        {
            await client.connect();

            var dbo = client.db("institute_data");
            var institute = await dbo.collection("institutes").findOne({name: institute_name});
        }

        finally
        {
            var events = await institute.events;

            for await (var event of events)
            {
                if (event.id == event_id)
                {
                    event.permissions.push(cancel_request);
                    break;
                }
            }

            await dbo.collection("institutes").updateOne({name: institute_name}, {$set: {events: events}});

            await client.close();

            res.redirect("http://localhost:8080/events");
        }
    }
});

router.post("/edit", function(req, res)
{   
    var updated_event = req.body;
    var old_id = parseInt(updated_event.id);

    if ("admin" in req.cookies.user)
        editEvent(req.cookies.user.admin);

    else
        editEvent(req.cookies.user.institute);

    async function editEvent(institute_name)
    {
        var institute;

        try
        {
            await client.connect();

            var dbo = client.db("institute_data");
            institute = await dbo.collection("institutes").findOne({name: institute_name});

            var events = await institute.events;
        
            for (let i = 0; i < await events.length; ++i)
            {
                if (events[i].id == updated_event.id)
                {
                    events[i].id = institute.events_id;
                    events[i].name = updated_event.name;
                    events[i].club = updated_event.club;
                    events[i].venue = updated_event.venue;
                    events[i].time = updated_event.time;
                    events[i].description = updated_event.description;

                    updated_event = events[i];                    
                    scheduleRemoval(await institute.name, updated_event);

                    break;
                }
            }
            
            await dbo.collection("institutes").updateOne({name: institute_name}, {$pull: {events: {id: old_id}}});
            await dbo.collection("institutes").updateOne({name: institute_name}, {$push: {events: {$each: [updated_event], $sort: {time: 1}}}});
            await dbo.collection("institutes").updateOne({name: institute_name}, {$inc: {events_id: 1}});
        }

        finally
        {
            await client.close();
            
            await mailInterestedUsers(institute_name, updated_event, "Updated : " + updated_event.name, updated_event.description);

            res.redirect("http://localhost:8080/events");
        }
    }
});

router.post("/editrequest", function(req, res)
{
    var event_id = parseInt(req.body.id);
    var institute_name = req.cookies.user.institute;

    var edit_request = {username: req.cookies.user.username, email: req.cookies.user.email, type: "edit_request"};

    addEditRequest().catch(console.dir);

    async function addEditRequest()
    {
        var institute;

        try
        {
            await client.connect();

            var dbo = client.db("institute_data");
            var institute = await dbo.collection("institutes").findOne({name: institute_name});
        }

        finally
        {
            var events = await institute.events;

            for await (var event of events)
            {
                if (event.id == event_id)
                {
                    event.permissions.push(edit_request);
                    break;
                }
            }

            await dbo.collection("institutes").updateOne({name: institute_name}, {$set: {events: events}});

            await client.close();

            res.redirect("http://localhost:8080/events");
        }
    }
});

module.exports = router;