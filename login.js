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

router.get("/login", function(req, res)
{
    res.render("login_page.ejs", {msg: ""});
});

router.post("/login", function(req, res)
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

router.get("/logout", function(req, res)
{
    res.clearCookie("user");
    res.redirect("http://localhost:8080/event24");
});

module.exports = router;