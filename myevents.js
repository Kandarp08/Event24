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

function scheduleRemoval(username, new_myevent)
{
    var completionDate = new Date(new_myevent.time);
    var removeTaskTime = completionDate.getSeconds() + " " + completionDate.getMinutes() + " " + completionDate.getHours() + 
                        " " + completionDate.getDate() + " " + (completionDate.getMonth() + 1) + " " + completionDate.getDay();

    cron.schedule(removeTaskTime, async function removeEvent()
    {
        try
        {
            await client.connect();

            let dbo = client.db("userdata");
            await dbo.collection("users").updateOne({username: username}, {$pull: {myevents: {id: new_myevent.id}}});
        }

        finally
        {
            await client.close();
        }
    });
}

router.get("/myevents", function(req, res)
{
    if (req.cookies.user == undefined)
        res.redirect("http://localhost:8080/login");

    else if ("admin" in req.cookies.user)
    {
        var req_count = 0;
        countRequests();

        async function countRequests()
        {
            try
            {
                await client.connect();

                var dbo = client.db("institute_data");
                var institute = await dbo.collection("institutes").findOne({name: req.cookies.user.admin});

                var events = await institute.events;
                    
                for (let i = 0; i < await events.length; ++i)
                {
                    for (let j = 0; j < await events[i].permissions.length; ++j)
                    {
                        if (events[i].permissions[j].type == "organise_request" || events[i].permissions[j].type == "edit_request" ||
                            events[i].permissions[j].type == "cancel_request")
                            ++req_count;
                    }
                }
            }

            finally
            {
                await client.close();

                fetchMyevents(req_count);
            }
        }
    }

    else
        fetchMyevents(null);

    async function fetchMyevents(req_count)
    {
        try
        {
            await client.connect();

            var dbo = client.db("userdata");
            var user = await dbo.collection("users").findOne({username: req.cookies.user.username});

            res.cookie("user", user, {maxAge: 1800000});
        }

        finally
        {
            await client.close();

            res.render("myevents.ejs", {user: user, myevents: user.myevents, req_count: req_count});
        }
    }
});

router.post("/new_myevent", function(req, res)
{
    if (req.cookies.user == undefined)
        res.redirect("http://localhost:8080/login");

    var new_myevent =
    {
        name: req.body.name,
        venue: req.body.venue,
        time: req.body.time,
        description: req.body.description,
        id: req.cookies.user.myevents_id,
    };

    addMyevent();

    async function addMyevent()
    {
        try
        {
            await client.connect();

            var dbo = client.db("userdata");
            await dbo.collection("users").updateOne({username: req.cookies.user.username}, {$push: {myevents: {$each: [new_myevent], $sort: {time: 1}}}});
            await dbo.collection("users").updateOne({username: req.cookies.user.username}, {$inc: {myevents_id: 1}});
        }

        finally
        {
            await client.close();

            scheduleRemoval(req.cookies.user.username, new_myevent);
            res.redirect("http://localhost:8080/myevents");
        }
    }
});

router.post("/cancel_myevent", function(req, res)
{
    if (req.cookies.user == undefined)
        res.redirect("http://localhost:8080/login");

    else
    {
        var myevent_id = parseInt(req.body.id);

        removeMyevent().catch(console.dir);

        async function removeMyevent()
        {
            try
            {
                await client.connect();

                var dbo = client.db("userdata");
                await dbo.collection("users").updateOne({username: req.cookies.user.username}, {$pull: {myevents: {id: myevent_id}}});
            }

            finally
            {
                await client.close();

                res.redirect("http://localhost:8080/myevents");
            }
        }
    }
});

router.post("/edit_myevent", function(req, res)
{
    if (req.cookies.user == undefined)
        res.redirect("http://localhost:8080/login");

    else
    {
        var updated_myevent = req.body;
        var old_id = parseInt(updated_myevent.id);
        updated_myevent.id = req.cookies.user.myevents_id;

        editMyevent().catch(console.dir);

        async function editMyevent()
        {
            try
            {
                await client.connect();

                var dbo = client.db("userdata");
                await dbo.collection("users").updateOne({username: req.cookies.user.username}, {$pull: {myevents: {id: old_id}}});
                await dbo.collection("users").updateOne({username: req.cookies.user.username}, {$push: {myevents: {$each: [updated_myevent], $sort: {time: 1}}}});
                await dbo.collection("users").updateOne({username: req.cookies.user.username}, {$inc: {myevents_id: 1}});
            }

            finally
            {
                await client.close();

                scheduleRemoval(req.cookies.user.username, updated_myevent);
                res.redirect("http://localhost:8080/myevents");
            }
        }
    }
});

module.exports = router;