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

async function mailInterestedUsers(institute_name, new_event, subject, text)
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
    
            res.render("requests.ejs", {user: req.cookies.user, events: institute.events});
        }
    }
    
    fetchRequests(req.cookies.user.admin);
});

router.post("/requests", function(req, res)
{
    var institute_name = req.cookies.user.admin;
    var institute;

    updateEvents().catch(console.dir);

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
            var cancelledIndices = [];

            for (var permission in req.body)
            {
                var action = req.body[permission];

                if (action == "noaction")
                    continue;

                var i = parseInt(permission.split(" ")[0]);
                var j = parseInt(permission.split(" ")[1]);

                var subject, text;

                if (action == "approve")
                {
                    if (events[i].permissions[j].type === "organise_request")
                    {
                        events[i].accepted = true;
                        events[i].permissions[j].type = "organise";

                        subject = "Event approved";

                        text = "Dear " + events[i].permissions[j].username + ", \n\nThe event " + events[i].name +
                                " has been approved by the admin.\n\nThank you";

                        await mailInterestedUsers(institute_name, events[i], events[i].name, events[i].description);
                    }

                    else if (events[i].permissions[j].type === "edit_request")
                    {
                        events[i].permissions[j].type = "edit";

                        subject = "Edit request accepted";

                        text = "Dear " + events[i].permissions[j].username + ", \n\nYou have been granted permission to edit the event " +
                                events[i].name + " by the admin.\n\nThank you";
                    }

                    else if (events[i].permissions[j].type === "cancel_request")
                    {
                        cancelledIndices.push(i);

                        subject = "Cancel request accepted";

                        text = "Dear " + events[i].permissions[j].username + ", \n\nYour request to cancel the event " +
                                events[i].name + " has been accepted by the admin.\n\nThank you";
                    }
                }

                else if (action == "approve_all")
                {
                    if (events[i].permissions[j].type === "organise_request")
                    {
                        events[i].accepted = true;
                        events[i].permissions[j].type = "organise";
                        
                        subject = "Event approved";

                        text = "Dear " + events[i].permissions[j].username + ", \n\nThe event " + events[i].name +
                                " has been approved by the admin.\n\nYou have been granted permission for all events of "
                                + events[i].club + ".\n\nThank you";

                        await mailInterestedUsers(institute_name, events[i], events[i].name, events[i].description);
                    }

                    else if (events[i].permissions[j].type === "edit_request")
                    {
                        events[i].accepted = true;
                        events[i].permissions[j].type = "edit";

                        subject = "Edit request accepted";

                        text = "Dear " + events[i].permissions[j].username + ", \n\nYou have been granted permission to edit the event " +
                                events[i].name + " by the admin.\n\nYou have been granted permissions for all events of " +
                                events[i].club + ".\n\nThank you";
                    }

                    else if (events[i].permissions[j].type === "cancel_request")
                    {
                        cancelledIndices.push(i);

                        subject = "Cancel request accepted";

                        text = "Dear " + events[i].permissions[j].username + ", \n\nYour request to cancel the event " +
                                events[i].name + " has been accepted by the admin.\n\nYou have been granted permission for all events of " +
                                events[i].club + ".\n\nThank you";
                    }

                    await client.connect();

                    var dbo = client.db("userdata");
                    await dbo.collection("users").updateOne({username: events[i].permissions[j].username}, {$push: {permissions: events[i].club}});

                    await client.close();
                }

                else if (action == "decline")
                {
                    if (events[i].permissions[j].type === "organise_request")
                    {
                        cancelledIndices.push(i);

                        subject = "Event declined";

                        text = "Dear " + events[i].permissions[j].username + ", \n\nYour request to organise the event " + 
                                events[i].name + " has been declined by the admin.\n\nThank you";
                    }

                    else if (events[i].permissions[j].type === "edit_request")
                    {
                        events[i].permissions[j].type = "edit_request_declined";

                        subject = "Edit request declined";

                        text = "Dear " + events[i].permissions[j].username + ", \n\nYour request to edit the event " +
                                events[i].name + " has been declined by the admin.\n\nThank you";
                    }

                    else if (events[i].permissions[j].type === "cancel_request")
                    {
                        events[i].permissions[j].type = "cancel_request_declined";

                        subject = "Cancel request declined";

                        text = "Dear " + events[i].permissions[j].username + ", \n\nYour request to cancel the event " +
                                events[i].name + " has been declined by the admin.\n\nThank you";
                    }
                }

                await mailUser(institute_name, events[i].permissions[j].email, subject, text);
            }

            cancelledIndices.sort();
            cancelledIndices = cancelledIndices.filter((item, index) => cancelledIndices.indexOf(item) === index);

            var len = cancelledIndices.length;

            for (let i = len - 1; i >= 0; --i)
                events.splice(cancelledIndices[i], 1);

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
});

module.exports = router;