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

router.get("/profile", function(req, res)
{
    if (req.cookies.user == undefined)
        res.redirect("http://localhost:8080/login");

    else if ("admin" in req.cookies.user)
        fetchData(req.cookies.user.admin);

    else
        fetchData(req.cookies.user.institute);

    async function fetchData(institute_name)
    {
        try
        {
            await client.connect();

            var dbo = client.db("institute_data");
            var institute = await dbo.collection("institutes").findOne({name: institute_name});
                   
            var req_count = 0;
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

            res.render("profile.ejs", {user: req.cookies.user, data: await institute.categories, req_count: req_count});
        }
    }
});

router.post("/profile", function(req, res)
{
    if (req.cookies.user == undefined)
        res.redirect("http://localhost:8080/login");

    else
    {
        var interests = req.body.clubs.split("  ");
        interests.splice(0, 1);
        interests.splice(interests.length - 1, 1);

        var updated_user =
        {
            username: req.cookies.user.username,
            password: req.body.password,
            email: req.body.email,
            interests: interests,
            permissions: req.cookies.user.permissions,
            myevents_id: req.cookies.user.myevents_id,
            myevents: req.cookies.user.myevents,
        }

        if ("remind" in req.body)
            updated_user.remind = true;

        else if (!("admin" in req.cookies.user))
            updated_user.remind = false;
     
        if ("admin" in req.cookies.user)
            updated_user.admin = req.cookies.user.admin;

        else
            updated_user.institute = req.cookies.user.institute;

        updateUser();

        async function updateUser()
        {
            try
            {
                await client.connect();

                var dbo = client.db("userdata");
                await dbo.collection("users").replaceOne({username: updated_user.username}, updated_user);
            }

            finally
            {
                await client.close();

                res.cookie("user", updated_user, {maxAge: 1800000});
                res.redirect("http://localhost:8080/profile");
            }
        }
    }
});

module.exports = router;