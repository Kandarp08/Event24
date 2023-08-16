const express = require("express");
const router = express.Router();

const bodyParser = require("body-parser");
const multer = require("multer");
const upload = multer();

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({extended: true}));
router.use(upload.array());

const client = require("./index.js");

async function fetchData(msg, res)
{
    var club_data = {};

    try
    {
        await client.connect();
        
        var dbo = client.db("institute_data");
        var institutes = await dbo.collection("institutes").find({}).toArray();

        for (var institute of institutes)
            club_data[institute.name] = institute.categories;
    }

    finally
    {
        await client.close();
        res.render("registration_page.ejs", {msg: msg, data: club_data});
    }
}

router.get("/register", function(req, res)
{
    fetchData("", res);
});

router.post("/register", function(req, res)
{
    async function confirmDetails()
    {
        try
        {
            await client.connect();

            var dbo = client.db("userdata");

            var cursorName = await dbo.collection("users").findOne({username: req.body.username});
            var cursorMail = await dbo.collection("users").findOne({email: req.body.email});

            await client.close();

            if (cursorName != null)
                fetchData("This username already exists. Please select another username.", res);

            else if (cursorMail != null)
                fetchData("This email is already registered. Please use another email id.", res);

            else
            {
                addUser().catch(console.dir);
                res.render("login_page.ejs", {msg: "Registration Successful. Please Login to continue."});
            }
        }

        catch (err)
        {
            console.log(err);
        }
    }

    async function addUser()
    {
        try
        {
            var dbo = client.db("userdata");

            var doc = 
            {
                username: req.body.username,
                password: req.body.password,
                email: req.body.email,
                institute: req.body.institute,
                interests: [],
                permissions: [],
                myevents_id: 1,
                myevents: [],
            }

            if (req.body.remind == "true")
                doc.remind = true;

            else
                doc.remind = false;

            for (var cat of req.body.category)
                doc.interests.push(cat);

            await client.connect();
            await dbo.collection("users").insertOne(doc);
        }

        finally
        {
            await client.close();
        }
    }

    confirmDetails();
});

module.exports = router;