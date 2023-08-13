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

            var dbo = client.db("userdata");
            var user = await dbo.collection("users").findOne({username: req.cookies.user.username});

            dbo = client.db("institute_data");
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

            res.render("profile.ejs", {user: user, data: await institute.categories, req_count: req_count});
        }
    }
});

module.exports = router;