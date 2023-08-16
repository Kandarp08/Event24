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

router.get("/manageusers", function(req, res)
{
    if (req.cookies.user == undefined || !("admin" in req.cookies.user))
        res.redirect("http://localhost:8080/login");

    else
    {
        fetchUsers();

        async function fetchUsers()
        {
            var users, clubs, req_count;

            try
            {
                await client.connect();

                var dbo = client.db("userdata");
                users = await dbo.collection("users").find({institute: req.cookies.user.admin}).toArray();

                dbo = client.db("institute_data");
                var institute = await dbo.collection("institutes").findOne({name: req.cookies.user.admin});
                var events = await institute.events;
                clubs = await institute.categories;

                req_count = 0;

                for (let i = 0; i < await events.length; ++i)
                {
                    for (let j = 0; j < await events[i].length; ++j)
                    {        
                        if (await events[i].permissions[j].type == "organise_request" || await events[i].permissions[j].type == "edit_request" ||
                        await events[i].permissions[j].type == "cancel_request")
                            ++req_count;
                    }
                }
            }

            finally
            {
                await client.close();

                res.render("manage_users.ejs", {user: req.cookies.user, users: users, clubs: clubs, req_count: req_count});
            }
        }
    }
});

router.post("/manageusers", function(req, res)
{
    if (req.cookies.user == undefined)
        res.redirect("http://localhost:8080/login");

    else
    {
        updatePermissions();

        async function updatePermissions()
        {
            try
            {
                await client.connect();
                
                var dbo = client.db("userdata");

                for (var key in req.body)
                {
                    var permissions = req.body[key].split("  ");
                    var username = permissions[0];
                    permissions.splice(0, 1);
                    permissions.splice(permissions.length - 1, 1);

                    await dbo.collection("users").updateOne({username: username}, {$set: {permissions: permissions}});
                }
            }

            finally
            {
                await client.close();

                res.redirect("http://localhost:8080/manageusers");
            }
        }
    }
});

module.exports = router;